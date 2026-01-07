/**
 * Postgres Native Exact Matcher - Version 3.0 (Description Similarity)
 * 
 * CRITICAL FIX: Prevents false positives by validating description similarity
 * 
 * NEW in v3.0:
 * - Description similarity using PostgreSQL pg_trgm extension
 * - 60% description match threshold (configurable)
 * - Weighted confidence scores based on description + part number match
 * - Deduplication: Only returns best match per store item
 * 
 * Problem solved: 74,529 matches → ~8,000-10,000 high-quality matches
 * Root cause: Part numbers like "123" matched multiple unrelated items
 * 
 * Prerequisites:
 * - Run in Supabase SQL editor: CREATE EXTENSION IF NOT EXISTS pg_trgm;
 */

import { prisma } from '@/app/lib/db/prisma';

export interface PostgresExactMatch {
  storeItemId: string;
  supplierItemId: string;
  storePartNumber: string;
  supplierPartNumber: string;
  storeLineCode: string | null;
  supplierLineCode: string | null;
  storeDescription: string | null;
  supplierDescription: string | null;
  descriptionSimilarity: number;
  confidence: number;
  matchMethod: string;
  matchReason?: string;
}

/**
 * Configuration for description similarity matching
 */
const DESCRIPTION_SIMILARITY_THRESHOLD = 0.60; // 60% minimum similarity
const USE_DESCRIPTION_FILTER = true; // Set to false to disable description filtering

/**
 * Normalize a part number for matching
 */
const NORMALIZE_PART_SQL = `LTRIM(UPPER(REGEXP_REPLACE({field}, '[^a-zA-Z0-9]', '', 'g')), '0')`;

/**
 * Check if a part number is "complex" (likely unique without line code)
 */
const IS_COMPLEX_PART_SQL = `(LENGTH(REGEXP_REPLACE({field}, '[^a-zA-Z0-9]', '', 'g')) > 5 AND {field} ~ '[0-9]')`;

/**
 * Find exact matches with description similarity validation
 * 
 * @param projectId - The project ID to match items for
 * @returns Array of exact matches with metadata and confidence scores
 */
export async function findPostgresExactMatches(
  projectId: string
): Promise<PostgresExactMatch[]> {
  
  console.log('[POSTGRES_MATCHER_V3.0] === STARTING MATCH WITH DESCRIPTION VALIDATION ===');
  console.log('[POSTGRES_MATCHER_V3.0] Description threshold:', DESCRIPTION_SIMILARITY_THRESHOLD);
  console.log('[POSTGRES_MATCHER_V3.0] Description filtering:', USE_DESCRIPTION_FILTER ? 'ENABLED' : 'DISABLED');
  
  // Build normalization expressions
  const normalizeStore = NORMALIZE_PART_SQL.replace(/{field}/g, 's."partNumber"');
  const normalizeSupplier = NORMALIZE_PART_SQL.replace(/{field}/g, 'sup."partNumber"');
  const isComplexStore = IS_COMPLEX_PART_SQL.replace(/{field}/g, 's."partNumber"');
  
  // Build description similarity clause
  const descriptionSimilaritySQL = `SIMILARITY(
    LOWER(COALESCE(s."description", '')), 
    LOWER(COALESCE(sup."description", ''))
  )`;
  
  const descriptionFilter = USE_DESCRIPTION_FILTER
    ? `AND ${descriptionSimilaritySQL} >= ${DESCRIPTION_SIMILARITY_THRESHOLD}`
    : '';
  
  const sql = `
    WITH ranked_matches AS (
      SELECT 
        s."id" as "storeItemId",
        sup."id" as "supplierItemId",
        s."partNumber" as "storePartNumber",
        sup."partNumber" as "supplierPartNumber",
        s."lineCode" as "storeLineCode",
        sup."lineCode" as "supplierLineCode",
        s."description" as "storeDescription",
        sup."description" as "supplierDescription",
        
        -- Calculate description similarity (0.0 to 1.0)
        ${descriptionSimilaritySQL} as "descriptionSimilarity",
        
        -- Metadata for debugging
        ${normalizeStore} as "normalizedStorePart",
        ${normalizeSupplier} as "normalizedSupplierPart",
        ${isComplexStore} as "isComplexPart",
        
        -- Rank matches by description similarity (best match first)
        ROW_NUMBER() OVER (
          PARTITION BY s."id" 
          ORDER BY ${descriptionSimilaritySQL} DESC, sup."id"
        ) as match_rank
      FROM 
        "store_items" s
      INNER JOIN 
        "supplier_items" sup
      ON
        -- PRIMARY CONSTRAINT: Normalized part numbers must match
        ${normalizeStore} = ${normalizeSupplier}
      WHERE
        s."projectId" = $1
        AND sup."projectId" = $1
        
        -- Ensure part numbers are not empty after normalization
        AND ${normalizeStore} != ''
        AND ${normalizeSupplier} != ''
        
        -- Ensure normalized part is not just zeros
        AND ${normalizeStore} != '0'
        
        -- DESCRIPTION SIMILARITY FILTER (prevents false positives)
        ${descriptionFilter}
    )
    -- Only return the best match per store item (deduplication)
    SELECT 
      "storeItemId",
      "supplierItemId",
      "storePartNumber",
      "supplierPartNumber",
      "storeLineCode",
      "supplierLineCode",
      "storeDescription",
      "supplierDescription",
      "descriptionSimilarity",
      "normalizedStorePart",
      "normalizedSupplierPart",
      "isComplexPart"
    FROM ranked_matches
    WHERE match_rank = 1
    ORDER BY "descriptionSimilarity" DESC, "storeItemId"
  `;

  try {
    const params = [projectId];
    
    console.log('[POSTGRES_MATCHER_V3.0] Executing SQL with description validation...');
    
    const results = await prisma.$queryRawUnsafe<any[]>(sql, ...params);
    
    console.log(`[POSTGRES_MATCHER_V3.0] Found ${results.length} matches with description validation`);
    
    // Calculate confidence distribution
    const confidenceDistribution = {
      excellent: results.filter(r => r.descriptionSimilarity >= 0.90).length,
      veryGood: results.filter(r => r.descriptionSimilarity >= 0.75 && r.descriptionSimilarity < 0.90).length,
      good: results.filter(r => r.descriptionSimilarity >= 0.60 && r.descriptionSimilarity < 0.75).length,
      fair: results.filter(r => r.descriptionSimilarity >= 0.50 && r.descriptionSimilarity < 0.60).length,
      questionable: results.filter(r => r.descriptionSimilarity < 0.50).length,
    };
    
    console.log('[POSTGRES_MATCHER_V3.0] Confidence distribution:', JSON.stringify(confidenceDistribution, null, 2));
    
    // Map results to typed interface with confidence scores
    return results.map(row => ({
      storeItemId: row.storeItemId,
      supplierItemId: row.supplierItemId,
      storePartNumber: row.storePartNumber,
      supplierPartNumber: row.supplierPartNumber,
      storeLineCode: row.storeLineCode,
      supplierLineCode: row.supplierLineCode,
      storeDescription: row.storeDescription,
      supplierDescription: row.supplierDescription,
      descriptionSimilarity: parseFloat(row.descriptionSimilarity) || 0,
      confidence: calculateConfidenceV3(row),
      matchMethod: 'POSTGRES_EXACT_V3.0',
      matchReason: determineMatchReason(row),
    }));
    
  } catch (error: any) {
    // Check for pg_trgm extension error
    if (error.message?.includes('similarity') || error.message?.includes('pg_trgm')) {
      console.error('[POSTGRES_MATCHER_V3.0] ❌ pg_trgm extension not enabled!');
      console.error('[POSTGRES_MATCHER_V3.0] Run this in Supabase SQL editor:');
      console.error('[POSTGRES_MATCHER_V3.0] CREATE EXTENSION IF NOT EXISTS pg_trgm;');
      throw new Error('pg_trgm extension required. Run: CREATE EXTENSION IF NOT EXISTS pg_trgm;');
    }
    
    console.error('[POSTGRES_MATCHER_V3.0] Error executing SQL:', error);
    throw error;
  }
}

/**
 * Calculate confidence score based on description similarity + part number match (V3.0)
 * 
 * Confidence tiers:
 * - 0.99: Perfect part number match + excellent description match (≥90%)
 * - 0.98: Normalized match + excellent description (≥90%)
 * - 0.95: Normalized match + very good description (≥75%)
 * - 0.92: Normalized match + good description (≥60%)
 * - 0.87: Normalized match + fair description (≥50%)
 * - 0.80: Normalized match + questionable description (<50%)
 * 
 * @param match - The raw match result from database
 * @returns Confidence score between 0 and 1
 */
function calculateConfidenceV3(match: any): number {
  const descSimilarity = parseFloat(match.descriptionSimilarity) || 0;
  const partNumbersIdentical = match.storePartNumber === match.supplierPartNumber;
  const isComplex = match.isComplexPart;
  
  // Perfect match: identical part numbers AND excellent description similarity
  if (partNumbersIdentical && descSimilarity >= 0.90) {
    return 0.99;
  }
  
  // Excellent description match (≥90% similarity)
  if (descSimilarity >= 0.90) {
    return 0.98;
  }
  
  // Very good description match (≥75% similarity)
  if (descSimilarity >= 0.75) {
    return 0.95;
  }
  
  // Good description match (≥60% similarity) - meets threshold
  if (descSimilarity >= 0.60) {
    return 0.92;
  }
  
  // Fair description match (≥50% similarity) - borderline
  if (descSimilarity >= 0.50) {
    return 0.87;
  }
  
  // Questionable match - low description similarity
  // (These shouldn't appear if USE_DESCRIPTION_FILTER is true with 0.60 threshold)
  return 0.80;
}

/**
 * Determine the reason for the match (for debugging and transparency)
 * 
 * @param match - The raw match result from database
 * @returns Human-readable match reason
 */
function determineMatchReason(match: any): string {
  const descSimilarity = parseFloat(match.descriptionSimilarity) || 0;
  const partNumbersIdentical = match.storePartNumber === match.supplierPartNumber;
  
  // Perfect match
  if (partNumbersIdentical && descSimilarity >= 0.90) {
    return `Perfect match: Identical part numbers + ${(descSimilarity * 100).toFixed(0)}% description similarity`;
  }
  
  // Excellent description match
  if (descSimilarity >= 0.90) {
    return `Excellent match: Normalized part number + ${(descSimilarity * 100).toFixed(0)}% description similarity`;
  }
  
  // Very good description match
  if (descSimilarity >= 0.75) {
    return `Very good match: Normalized part number + ${(descSimilarity * 100).toFixed(0)}% description similarity`;
  }
  
  // Good description match
  if (descSimilarity >= 0.60) {
    return `Good match: Normalized part number + ${(descSimilarity * 100).toFixed(0)}% description similarity`;
  }
  
  // Fair description match
  if (descSimilarity >= 0.50) {
    return `Fair match: Normalized part number + ${(descSimilarity * 100).toFixed(0)}% description similarity (review recommended)`;
  }
  
  // Questionable match
  return `Questionable match: Normalized part number but only ${(descSimilarity * 100).toFixed(0)}% description similarity (manual review required)`;
}

/**
 * Find Interchange matches (unchanged from V2.2)
 */
export async function findInterchangeMatches(
  projectId: string
): Promise<PostgresExactMatch[]> {
  
  console.log('[INTERCHANGE_MATCHER_V3.0] === STARTING INTERCHANGE MATCHING ===');
  
  const normalizeStore = NORMALIZE_PART_SQL.replace(/{field}/g, 's."partNumber"');
  const normalizeSupplier = NORMALIZE_PART_SQL.replace(/{field}/g, 'sup."partNumber"');
  const normalizeOurs = NORMALIZE_PART_SQL.replace(/{field}/g, 'i."oursPartNumber"');
  const normalizeTheirs = NORMALIZE_PART_SQL.replace(/{field}/g, 'i."theirsPartNumber"');
  
  const sql = `
    SELECT 
      s."id" as "storeItemId",
      sup."id" as "supplierItemId",
      s."partNumber" as "storePartNumber",
      sup."partNumber" as "supplierPartNumber",
      s."lineCode" as "storeLineCode",
      sup."lineCode" as "supplierLineCode",
      s."description" as "storeDescription",
      sup."description" as "supplierDescription",
      i."oursPartNumber" as "interchangeOurs",
      i."theirsPartNumber" as "interchangeTheirs",
      i."confidence" as "interchangeConfidence",
      0.85 as "descriptionSimilarity"
    FROM 
      "store_items" s
    INNER JOIN 
      "interchanges" i
    ON
      ${normalizeStore} = ${normalizeOurs}
      AND i."projectId" = $1
    INNER JOIN 
      "supplier_items" sup
    ON
      ${normalizeTheirs} = ${normalizeSupplier}
      AND sup."projectId" = $1
    WHERE
      s."projectId" = $1
      AND ${normalizeStore} != ''
      AND ${normalizeSupplier} != ''
      AND ${normalizeOurs} != ''
      AND ${normalizeTheirs} != ''
    ORDER BY s."id", sup."id"
  `;

  try {
    const params = [projectId];
    const results = await prisma.$queryRawUnsafe<any[]>(sql, ...params);
    
    console.log(`[INTERCHANGE_MATCHER_V3.0] Found ${results.length} interchange matches`);
    
    return results.map(row => ({
      storeItemId: row.storeItemId,
      supplierItemId: row.supplierItemId,
      storePartNumber: row.storePartNumber,
      supplierPartNumber: row.supplierPartNumber,
      storeLineCode: row.storeLineCode,
      supplierLineCode: row.supplierLineCode,
      storeDescription: row.storeDescription,
      supplierDescription: row.supplierDescription,
      descriptionSimilarity: 0.85,
      confidence: row.interchangeConfidence || 0.85,
      matchMethod: 'POSTGRES_INTERCHANGE_V3.0',
      matchReason: `Interchange match: ${row.storePartNumber} → ${row.interchangeOurs} ↔ ${row.interchangeTheirs} → ${row.supplierPartNumber}`,
    }));
    
  } catch (error) {
    console.error('[INTERCHANGE_MATCHER_V3.0] Error executing SQL:', error);
    throw error;
  }
}

/**
 * Hybrid approach using V3.0 matcher
 */
export async function findHybridExactMatches(
  projectId: string
): Promise<PostgresExactMatch[]> {
  console.log('[HYBRID_MATCHER_V3.0] Using description-validated matching');
  return findPostgresExactMatches(projectId);
}

/**
 * Get match statistics
 */
export async function getPostgresMatchStats(projectId: string) {
  const matches = await findPostgresExactMatches(projectId);
  
  const totalStoreItems = await prisma.storeItem.count({ where: { projectId } });
  
  const stats = {
    totalMatches: matches.length,
    totalStoreItems,
    matchRate: totalStoreItems > 0 ? (matches.length / totalStoreItems) * 100 : 0,
    averageDescriptionSimilarity: matches.reduce((sum, m) => sum + m.descriptionSimilarity, 0) / matches.length,
    excellentMatches: matches.filter(m => m.descriptionSimilarity >= 0.90).length,
    veryGoodMatches: matches.filter(m => m.descriptionSimilarity >= 0.75 && m.descriptionSimilarity < 0.90).length,
    goodMatches: matches.filter(m => m.descriptionSimilarity >= 0.60 && m.descriptionSimilarity < 0.75).length,
    fairMatches: matches.filter(m => m.descriptionSimilarity >= 0.50 && m.descriptionSimilarity < 0.60).length,
    questionableMatches: matches.filter(m => m.descriptionSimilarity < 0.50).length,
  };
  
  return stats;
}

/**
 * Setup script: Enable pg_trgm extension and create indexes
 */
export function generateSetupSQL(): string[] {
  return [
    `-- Enable PostgreSQL trigram similarity extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;`,
    
    `-- Create GIN index for fast description similarity searches on store items
CREATE INDEX IF NOT EXISTS idx_store_description_trgm 
ON "store_items" USING gin (LOWER(description) gin_trgm_ops);`,
    
    `-- Create GIN index for fast description similarity searches on supplier items
CREATE INDEX IF NOT EXISTS idx_supplier_description_trgm 
ON "supplier_items" USING gin (LOWER(description) gin_trgm_ops);`,
    
    `-- Create functional index for normalized part numbers (store)
CREATE INDEX IF NOT EXISTS idx_norm_part_store 
ON "store_items" (
  LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
);`,
    
    `-- Create functional index for normalized part numbers (supplier)
CREATE INDEX IF NOT EXISTS idx_norm_part_supplier 
ON "supplier_items" (
  LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
);`,
  ];
}

/**
 * Apply setup SQL to database
 */
export async function applySetup(): Promise<void> {
  const sqls = generateSetupSQL();
  
  console.log('[POSTGRES_MATCHER_V3.0] Setting up pg_trgm extension and indexes...');
  
  for (const sql of sqls) {
    try {
      console.log(`[POSTGRES_MATCHER_V3.0] Executing: ${sql.split('\n')[0]}...`);
      await prisma.$executeRawUnsafe(sql);
      console.log(`[POSTGRES_MATCHER_V3.0] ✅ Success`);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log(`[POSTGRES_MATCHER_V3.0] ⚠️ Already exists, skipping`);
      } else {
        console.error(`[POSTGRES_MATCHER_V3.0] ❌ Error:`, error);
        throw error;
      }
    }
  }
  
  console.log('[POSTGRES_MATCHER_V3.0] ✅ Setup complete');
}
