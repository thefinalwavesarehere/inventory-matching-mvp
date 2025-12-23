/**
 * Postgres Native Exact Matcher - Version 2.1 (Batch-Optimized)
 * 
 * Advanced SQL-based matching with "fuzzy-exact" logic to handle real-world dirty data.
 * 
 * NEW in v2.1:
 * - Batch processing support (accepts storeIds filter)
 * - Eliminates memory leaks (no loading ALL items)
 * - Optimized for cursor-based pagination
 * 
 * Improvements from v1.0:
 * 1. Relaxed line code constraints (handles GAT vs GATES)
 * 2. Leading zero normalization (handles 00123 vs 123)
 * 3. Complex part number override (ignores line code for unique parts)
 * 4. Functional index support for instant queries
 * 5. Batch processing (only processes specified store items)
 * 
 * Matching Strategy:
 * - Normalize part numbers: UPPER + remove non-alphanumeric + strip leading zeros
 * - Match on normalized part number
 * - Line code matching is OPTIONAL (relaxed constraints)
 * - Returns matches with confidence scores
 */

import { prisma } from '@/app/lib/db/prisma';

export interface PostgresExactMatch {
  storeItemId: string;
  supplierItemId: string;
  storePartNumber: string;
  supplierPartNumber: string;
  storeLineCode: string | null;
  supplierLineCode: string | null;
  confidence: number;
  matchMethod: string;
  matchReason?: string;
}

/**
 * Normalize a part number for matching
 * - UPPER case
 * - Remove all non-alphanumeric characters
 * - Strip leading zeros
 * 
 * Examples:
 * - "123-456" → "123456"
 * - "00123" → "123"
 * - "GM-8036" → "GM8036"
 * - "21/3/1" → "2131"
 */
const NORMALIZE_PART_SQL = `LTRIM(UPPER(REGEXP_REPLACE({field}, '[^a-zA-Z0-9]', '', 'g')), '0')`;

/**
 * Check if a part number is "complex" (likely unique without line code)
 * Complex = length > 5 AND contains numbers
 * 
 * Examples:
 * - "85420-60070" → complex (length 11, has numbers)
 * - "ABC" → not complex (length 3)
 * - "BELT" → not complex (no numbers)
 */
const IS_COMPLEX_PART_SQL = `(LENGTH(REGEXP_REPLACE({field}, '[^a-zA-Z0-9]', '', 'g')) > 5 AND {field} ~ '[0-9]')`;

/**
 * Find exact matches using advanced Postgres SQL with relaxed constraints
 * 
 * @param projectId - The project ID to match items for
 * @param storeIds - Optional array of store item IDs to filter by (for batch processing)
 * @returns Array of exact matches with metadata
 */
export async function findPostgresExactMatches(
  projectId: string,
  storeIds?: string[]
): Promise<PostgresExactMatch[]> {
  
  // 🚨 EMERGENCY DIAGNOSTIC LOGGING
  console.log('[POSTGRES_MATCHER_V2.1] === DIAGNOSTIC TRACE START ===');
  console.log('[POSTGRES_MATCHER_V2.1] projectId:', projectId);
  console.log('[POSTGRES_MATCHER_V2.1] storeIds type:', typeof storeIds);
  console.log('[POSTGRES_MATCHER_V2.1] storeIds length:', storeIds?.length || 'N/A');
  console.log('[POSTGRES_MATCHER_V2.1] storeIds[0] (first ID):', storeIds?.[0] || 'N/A');
  console.log('[POSTGRES_MATCHER_V2.1] storeIds[0] type:', typeof storeIds?.[0]);
  console.log('[POSTGRES_MATCHER_V2.1] === DIAGNOSTIC TRACE END ===');
  
  // Build normalization expressions
  const normalizeStore = NORMALIZE_PART_SQL.replace(/{field}/g, 's."partNumber"');
  const normalizeSupplier = NORMALIZE_PART_SQL.replace(/{field}/g, 'sup."partNumber"');
  const normalizeStoreLine = NORMALIZE_PART_SQL.replace(/{field}/g, 's."lineCode"');
  const normalizeSupplierLine = NORMALIZE_PART_SQL.replace(/{field}/g, 'sup."lineCode"');
  const isComplexStore = IS_COMPLEX_PART_SQL.replace(/{field}/g, 's."partNumber"');
  
  // Build WHERE clause for batch processing
  // Using unnest() for robust array handling in Prisma raw queries
  const batchFilter = storeIds && storeIds.length > 0 
    ? `AND s."id" IN (SELECT unnest($2::text[]))`
    : '';
  
  const sql = `
    SELECT 
      s."id" as "storeItemId",
      sup."id" as "supplierItemId",
      s."partNumber" as "storePartNumber",
      sup."partNumber" as "supplierPartNumber",
      s."lineCode" as "storeLineCode",
      sup."lineCode" as "supplierLineCode",
      -- Add metadata for debugging
      ${normalizeStore} as "normalizedStorePart",
      ${normalizeSupplier} as "normalizedSupplierPart",
      ${isComplexStore} as "isComplexPart"
    FROM 
      "store_items" s
    INNER JOIN 
      "supplier_items" sup
    ON
      -- PRIMARY CONSTRAINT: Normalized part numbers must match
      ${normalizeStore} = ${normalizeSupplier}
      
      -- RELAXED LINE CODE CONSTRAINT (3 scenarios):
      AND (
        -- Scenario 1: Line codes match (normalized)
        (s."lineCode" IS NOT NULL 
         AND sup."lineCode" IS NOT NULL 
         AND ${normalizeStoreLine} = ${normalizeSupplierLine})
        
        -- Scenario 2: One or both line codes are NULL
        OR (s."lineCode" IS NULL OR sup."lineCode" IS NULL)
        
        -- Scenario 3: Complex part number override
        -- If part number is complex (length > 5 AND has numbers), 
        -- we assume it's unique enough to ignore line code mismatch
        OR ${isComplexStore}
      )
    WHERE
      s."projectId" = $1
      AND sup."projectId" = $1
      
      -- BATCH PROCESSING: Filter by specific store IDs if provided
      ${batchFilter}
      
      -- Ensure part numbers are not empty after normalization
      AND ${normalizeStore} != ''
      AND ${normalizeSupplier} != ''
      
      -- Ensure normalized part is not just zeros (edge case)
      AND ${normalizeStore} != '0'
    
    ORDER BY s."id", sup."id"
  `;

  try {
    // Pass storeIds as array parameter if provided
    const params = storeIds && storeIds.length > 0 ? [projectId, storeIds] : [projectId];
    
    // 🚨 EMERGENCY: Log the actual SQL and params
    console.log('[POSTGRES_MATCHER_V2.1] === SQL EXECUTION TRACE ===');
    console.log('[POSTGRES_MATCHER_V2.1] SQL Query:', sql.substring(0, 500) + '...');
    console.log('[POSTGRES_MATCHER_V2.1] Params:', JSON.stringify(params, null, 2));
    console.log('[POSTGRES_MATCHER_V2.1] === SQL EXECUTION TRACE END ===');
    
    const results = await prisma.$queryRawUnsafe<any[]>(sql, ...params);
    
    const batchInfo = storeIds && storeIds.length > 0 ? ` (batch: ${storeIds.length} items)` : ' (all items)';
    console.log(`[POSTGRES_MATCHER_V2.1] Found ${results.length} matches using advanced SQL${batchInfo}`);
    
    // Map results to typed interface with confidence scores
    return results.map(row => ({
      storeItemId: row.storeItemId,
      supplierItemId: row.supplierItemId,
      storePartNumber: row.storePartNumber,
      supplierPartNumber: row.supplierPartNumber,
      storeLineCode: row.storeLineCode,
      supplierLineCode: row.supplierLineCode,
      confidence: calculateConfidenceV2(row),
      matchMethod: 'POSTGRES_EXACT_V2.1',
      matchReason: determineMatchReason(row),
    }));
    
  } catch (error) {
    console.error('[POSTGRES_MATCHER_V2.1] Error executing SQL:', error);
    throw error;
  }
}

/**
 * Calculate confidence score based on match quality (Version 2.0)
 * 
 * Confidence tiers:
 * - 1.0: Perfect match (identical part numbers + line codes)
 * - 0.98: Exact normalized match with line code match
 * - 0.95: Normalized match with complex part (line code ignored)
 * - 0.92: Normalized match with NULL line code
 * - 0.90: Normalized match with line code mismatch (risky)
 * 
 * @param match - The raw match result from database
 * @returns Confidence score between 0 and 1
 */
function calculateConfidenceV2(match: any): number {
  const storeNorm = match.normalizedStorePart;
  const supplierNorm = match.normalizedSupplierPart;
  const isComplex = match.isComplexPart;
  
  // Perfect match: original part numbers AND line codes are identical
  if (match.storePartNumber === match.supplierPartNumber &&
      match.storeLineCode === match.supplierLineCode) {
    return 1.0;
  }
  
  // Exact normalized match with line code match
  if (match.storeLineCode && 
      match.supplierLineCode && 
      normalizeString(match.storeLineCode) === normalizeString(match.supplierLineCode)) {
    return 0.98;
  }
  
  // Complex part number (unique enough to ignore line code)
  if (isComplex) {
    return 0.95;
  }
  
  // One or both line codes are NULL
  if (!match.storeLineCode || !match.supplierLineCode) {
    return 0.92;
  }
  
  // Line code mismatch (risky, but allowed by our relaxed constraints)
  return 0.90;
}

/**
 * Determine the reason for the match (for debugging and transparency)
 * 
 * @param match - The raw match result from database
 * @returns Human-readable match reason
 */
function determineMatchReason(match: any): string {
  const isComplex = match.isComplexPart;
  const storeLineNorm = match.storeLineCode ? normalizeString(match.storeLineCode) : null;
  const supplierLineNorm = match.supplierLineCode ? normalizeString(match.supplierLineCode) : null;
  
  // Perfect match
  if (match.storePartNumber === match.supplierPartNumber &&
      match.storeLineCode === match.supplierLineCode) {
    return 'Perfect match (identical part + line code)';
  }
  
  // Line code match
  if (storeLineNorm && supplierLineNorm && storeLineNorm === supplierLineNorm) {
    return 'Normalized part match with line code confirmation';
  }
  
  // Complex part override
  if (isComplex) {
    return 'Complex part number (unique enough to ignore line code)';
  }
  
  // NULL line code
  if (!match.storeLineCode && !match.supplierLineCode) {
    return 'Normalized part match (both line codes NULL)';
  }
  
  if (!match.storeLineCode || !match.supplierLineCode) {
    return 'Normalized part match (one line code NULL)';
  }
  
  // Line code mismatch
  return `Normalized part match (line code mismatch: ${match.storeLineCode} vs ${match.supplierLineCode})`;
}

/**
 * Normalize a string for comparison (JavaScript helper)
 * 
 * @param str - String to normalize
 * @returns Normalized string
 */
function normalizeString(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .replace(/^0+/, ''); // Strip leading zeros
}

/**
 * Find Interchange matches (Cross-Reference matching)
 * 
 * Matches Store items to Supplier items via the Interchange table:
 * - Store.partNumber -> Interchange.oursPartNumber -> Interchange.theirsPartNumber -> Supplier.partNumber
 * 
 * This is the "Missing 25%" that Legacy engine had but V2/V3 deleted.
 * 
 * @param projectId - The project ID to match items for
 * @param storeIds - Optional array of store item IDs to filter by (for batch processing)
 * @returns Array of interchange matches with metadata
 */
export async function findInterchangeMatches(
  projectId: string,
  storeIds?: string[]
): Promise<PostgresExactMatch[]> {
  
  // 🚨 EMERGENCY DIAGNOSTIC LOGGING
  console.log('[INTERCHANGE_MATCHER] === DIAGNOSTIC TRACE START ===');
  console.log('[INTERCHANGE_MATCHER] projectId:', projectId);
  console.log('[INTERCHANGE_MATCHER] storeIds length:', storeIds?.length || 'N/A');
  console.log('[INTERCHANGE_MATCHER] === DIAGNOSTIC TRACE END ===');
  
  // Build normalization expressions (same as exact matcher)
  const normalizeStore = NORMALIZE_PART_SQL.replace(/{field}/g, 's."partNumber"');
  const normalizeSupplier = NORMALIZE_PART_SQL.replace(/{field}/g, 'sup."partNumber"');
  const normalizeOurs = NORMALIZE_PART_SQL.replace(/{field}/g, 'i."oursPartNumber"');
  const normalizeTheirs = NORMALIZE_PART_SQL.replace(/{field}/g, 'i."theirsPartNumber"');
  
  // Build WHERE clause for batch processing
  // Using unnest() for robust array handling in Prisma raw queries
  const batchFilter = storeIds && storeIds.length > 0 
    ? `AND s."id" IN (SELECT unnest($2::text[]))`
    : '';
  
  const sql = `
    SELECT 
      s."id" as "storeItemId",
      sup."id" as "supplierItemId",
      s."partNumber" as "storePartNumber",
      sup."partNumber" as "supplierPartNumber",
      s."lineCode" as "storeLineCode",
      sup."lineCode" as "supplierLineCode",
      -- Add metadata for debugging
      i."oursPartNumber" as "interchangeOurs",
      i."theirsPartNumber" as "interchangeTheirs",
      i."confidence" as "interchangeConfidence"
    FROM 
      "store_items" s
    INNER JOIN 
      "interchanges" i
    ON
      -- Match Store part to "ours" side of interchange (normalized)
      ${normalizeStore} = ${normalizeOurs}
      AND i."projectId" = $1
    INNER JOIN 
      "supplier_items" sup
    ON
      -- Match "theirs" side of interchange to Supplier part (normalized)
      ${normalizeTheirs} = ${normalizeSupplier}
      AND sup."projectId" = $1
    WHERE
      s."projectId" = $1
      
      -- BATCH PROCESSING: Filter by specific store IDs if provided
      ${batchFilter}
      
      -- Ensure part numbers are not empty after normalization
      AND ${normalizeStore} != ''
      AND ${normalizeSupplier} != ''
      AND ${normalizeOurs} != ''
      AND ${normalizeTheirs} != ''
    
    ORDER BY s."id", sup."id"
  `;

  try {
    // Pass storeIds as array parameter if provided
    const params = storeIds && storeIds.length > 0 ? [projectId, storeIds] : [projectId];
    
    // 🚨 EMERGENCY: Log the actual SQL and params
    console.log('[INTERCHANGE_MATCHER] === SQL EXECUTION TRACE ===');
    console.log('[INTERCHANGE_MATCHER] SQL Query:', sql.substring(0, 500) + '...');
    console.log('[INTERCHANGE_MATCHER] Params:', JSON.stringify(params, null, 2));
    console.log('[INTERCHANGE_MATCHER] === SQL EXECUTION TRACE END ===');
    
    const results = await prisma.$queryRawUnsafe<any[]>(sql, ...params);
    
    const batchInfo = storeIds && storeIds.length > 0 ? ` (batch: ${storeIds.length} items)` : ' (all items)';
    console.log(`[INTERCHANGE_MATCHER] Found ${results.length} interchange matches${batchInfo}`);
    
    // Map results to typed interface with confidence scores
    return results.map(row => ({
      storeItemId: row.storeItemId,
      supplierItemId: row.supplierItemId,
      storePartNumber: row.storePartNumber,
      supplierPartNumber: row.supplierPartNumber,
      storeLineCode: row.storeLineCode,
      supplierLineCode: row.supplierLineCode,
      confidence: row.interchangeConfidence || 0.85, // Use interchange confidence or default to 0.85
      matchMethod: 'POSTGRES_INTERCHANGE_V3.0',
      matchReason: `Interchange match: ${row.storePartNumber} -> ${row.interchangeOurs} <-> ${row.interchangeTheirs} -> ${row.supplierPartNumber}`,
    }));
    
  } catch (error) {
    console.error('[INTERCHANGE_MATCHER] Error executing SQL:', error);
    throw error;
  }
}

/**
 * Hybrid approach: Try canonical first (fast), fall back to REGEXP_REPLACE (reliable)
 * 
 * Version 2.1: Uses advanced SQL with relaxed line code constraints + batch processing
 * 
 * @param projectId - The project ID to match items for
 * @param storeIds - Optional array of store item IDs to filter by (for batch processing)
 * @returns Array of exact matches
 */
export async function findHybridExactMatches(
  projectId: string,
  storeIds?: string[]
): Promise<PostgresExactMatch[]> {
  
  // Always use REGEXP_REPLACE for maximum reliability in v2.1
  // The functional indexes will make it fast enough
  const batchInfo = storeIds && storeIds.length > 0 ? ` (batch: ${storeIds.length} items)` : ' (all items)';
  console.log(`[HYBRID_MATCHER_V2.1] Using REGEXP_REPLACE with relaxed constraints${batchInfo}`);
  return findPostgresExactMatches(projectId, storeIds);
}

/**
 * Find exact matches and return statistics
 * 
 * @param projectId - The project ID to match items for
 * @param storeIds - Optional array of store item IDs to filter by
 * @returns Match statistics
 */
export async function getPostgresMatchStats(projectId: string, storeIds?: string[]) {
  const matches = await findPostgresExactMatches(projectId, storeIds);
  
  // Get total store items count (filtered by storeIds if provided)
  const totalStoreItems = storeIds && storeIds.length > 0
    ? storeIds.length
    : await prisma.storeItem.count({ where: { projectId } });
  
  // Calculate statistics
  const stats = {
    totalMatches: matches.length,
    totalStoreItems,
    matchRate: totalStoreItems > 0 ? (matches.length / totalStoreItems) * 100 : 0,
    perfectMatches: matches.filter(m => m.confidence === 1.0).length,
    highConfidence: matches.filter(m => m.confidence >= 0.95).length,
    mediumConfidence: matches.filter(m => m.confidence >= 0.90 && m.confidence < 0.95).length,
    lowConfidence: matches.filter(m => m.confidence < 0.90).length,
  };
  
  return stats;
}

/**
 * Generate SQL migration for functional indexes
 * 
 * These indexes will make the REGEXP_REPLACE queries instant by pre-computing
 * the normalized part numbers.
 * 
 * @returns SQL migration commands
 */
export function generateFunctionalIndexSQL(): string[] {
  return [
    `-- Functional index for normalized store part numbers
CREATE INDEX IF NOT EXISTS idx_norm_part_store 
ON "store_items" (
  LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
);`,
    
    `-- Functional index for normalized supplier part numbers
CREATE INDEX IF NOT EXISTS idx_norm_part_supplier 
ON "supplier_items" (
  LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
);`,
    
    `-- Functional index for normalized store line codes
CREATE INDEX IF NOT EXISTS idx_norm_line_store 
ON "store_items" (
  LTRIM(UPPER(REGEXP_REPLACE("lineCode", '[^a-zA-Z0-9]', '', 'g')), '0')
) WHERE "lineCode" IS NOT NULL;`,
    
    `-- Functional index for normalized supplier line codes
CREATE INDEX IF NOT EXISTS idx_norm_line_supplier 
ON "supplier_items" (
  LTRIM(UPPER(REGEXP_REPLACE("lineCode", '[^a-zA-Z0-9]', '', 'g')), '0')
) WHERE "lineCode" IS NOT NULL;`,
    
    `-- Composite index for project + normalized part (most common query)
CREATE INDEX IF NOT EXISTS idx_project_norm_part_store 
ON "store_items" (
  "projectId",
  LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
);`,
    
    `-- Composite index for project + normalized part (most common query)
CREATE INDEX IF NOT EXISTS idx_project_norm_part_supplier 
ON "supplier_items" (
  "projectId",
  LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
);`,
  ];
}

/**
 * Apply functional indexes to database
 * 
 * WARNING: This may take several minutes on large databases.
 * Run during off-peak hours.
 * 
 * @returns Promise that resolves when indexes are created
 */
export async function applyFunctionalIndexes(): Promise<void> {
  const sqls = generateFunctionalIndexSQL();
  
  console.log('[FUNCTIONAL_INDEXES] Creating functional indexes...');
  console.log('[FUNCTIONAL_INDEXES] This may take several minutes on large databases.');
  
  for (const sql of sqls) {
    try {
      console.log(`[FUNCTIONAL_INDEXES] Executing: ${sql.split('\n')[0]}...`);
      await prisma.$executeRawUnsafe(sql);
      console.log(`[FUNCTIONAL_INDEXES] ✅ Success`);
    } catch (error: any) {
      // Ignore "already exists" errors
      if (error.message?.includes('already exists')) {
        console.log(`[FUNCTIONAL_INDEXES] ⚠️  Index already exists, skipping`);
      } else {
        console.error(`[FUNCTIONAL_INDEXES] ❌ Error:`, error);
        throw error;
      }
    }
  }
  
  console.log('[FUNCTIONAL_INDEXES] ✅ All functional indexes created successfully');
}
