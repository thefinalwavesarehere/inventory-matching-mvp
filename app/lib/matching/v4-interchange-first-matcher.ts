/**
 * V4 Interchange-First Exact Matcher
 * 
 * Implements the "Bridge" matching logic:
 * 1. Store → Interchange (authoritative)
 * 2. Vendor tie-breaker ranking
 * 3. Supplier enrichment (LEFT JOIN, optional)
 * 
 * Key principles:
 * - Interchange is the source of truth
 * - Supplier catalog is optional enrichment
 * - Vendor metadata from interchange (not store lineCode)
 * - Un-match prerequisite clears bad matches
 */

import { PrismaClient } from '@prisma/client';
import { apiLogger } from '@/app/lib/structured-logger';

const prisma = new PrismaClient();

export interface V4Match {
  storeItemId: string;
  storePartNumber: string;
  interchangeId: string;
  vendor: string | null;
  matchedOn: 'MERRILL' | 'VENDOR';
  merrillPartNumber: string;
  vendorPartNumber: string;
  supplierItemId: string | null;
  supplierPartNumber: string | null;
  confidence: number;
}

/**
 * Step 0: Un-Match Prerequisite
 * 
 * Clears existing matches for a project to allow rematching.
 * MUST be called before V4 matching to prevent bad matches from blocking.
 * 
 * Safety:
 * - Scoped by projectId only
 * - Transactional
 * - Logs cleared count
 */
export async function unmatchProject(projectId: string): Promise<number> {
  apiLogger.info(`[V4-UNMATCH] Starting un-match for project: ${projectId}`);
  
  if (!projectId) {
    throw new Error('[V4-UNMATCH] SAFETY: projectId is required');
  }
  
  try {
    // Count before delete
    const countBefore = await prisma.matchCandidate.count({
      where: { projectId },
    });
    
    apiLogger.info(`[V4-UNMATCH] Found ${countBefore} existing matches to clear`);
    
    // Safety warning for large deletes
    if (countBefore > 50000) {
      apiLogger.warn(`[V4-UNMATCH] WARNING: Large delete operation (${countBefore} rows). Verify projectId is correct.`);
    }
    
    const deleted = await prisma.matchCandidate.deleteMany({
      where: { projectId },
    });
    
    apiLogger.info(`[V4-UNMATCH] Cleared ${deleted.count} existing matches for project ${projectId}`);
    apiLogger.info(`[V4-UNMATCH] Store items are now eligible for rematching`);
    
    return deleted.count;
  } catch (error) {
    apiLogger.error(`[V4-UNMATCH] Error clearing matches:`, error);
    throw error;
  }
}

/**
 * V4 Interchange-First Matcher
 * 
 * Implements 3-step bridge matching:
 * 1. Store → Interchange (on normalized part number)
 * 2. Vendor tie-breaker (prioritize interchange.vendor)
 * 3. Supplier enrichment (LEFT JOIN, optional)
 * 
 * @param projectId - Project to match
 * @param storeIds - Optional: specific store items to match
 * @returns Array of V4 matches
 */
export async function findInterchangeFirstMatches(
  projectId: string,
  storeIds?: string[]
): Promise<V4Match[]> {
  apiLogger.info(`[V4-MATCHER] Starting Interchange-First matching for project: ${projectId}`);
  
  if (storeIds && storeIds.length > 0) {
    apiLogger.info(`[V4-MATCHER] Matching ${storeIds.length} specific store items`);
  } else {
    apiLogger.info(`[V4-MATCHER] Matching all unmatched store items`);
  }
  
  // Debug logging
  apiLogger.info('[V4-DEBUG] projectId', projectId);
  apiLogger.info('[V4-DEBUG] storeIds sample', storeIds?.slice(0, 5) || 'all');
  
  // Prepare parameterized storeIds (null if matching all)
  const storeIdsParam = storeIds?.length ? storeIds : null;
  
  // V4 SQL: 3-step bridge with vendor tie-breaker (parameterized)
  const query = `
    WITH bridge AS (
      -- Step 1: Store → Interchange join (authoritative)
      SELECT 
        s.id as store_item_id,
        s."partNumber" as store_part_number,
        s."partNumberNorm" as store_part_norm,
        i.id as interchange_id,
        i."merrillPartNumber",
        i."merrillPartNumberNorm",
        i."vendorPartNumber",
        i."vendorPartNumberNorm",
        i.vendor,
        i."lineCode",
        -- Determine which side matched
        CASE 
          WHEN s."partNumberNorm" = i."merrillPartNumberNorm" THEN 'MERRILL'
          WHEN s."partNumberNorm" = i."vendorPartNumberNorm" THEN 'VENDOR'
          ELSE 'UNKNOWN'
        END as matched_on
      FROM store_items s
      INNER JOIN interchanges i 
        ON s."projectId" = i."projectId"
        AND (
          s."partNumberNorm" = i."merrillPartNumberNorm"
          OR s."partNumberNorm" = i."vendorPartNumberNorm"
        )
      WHERE 
        s."projectId" = $1
        AND ($2::text[] IS NULL OR s.id = ANY($2::text[]))
        -- Only match items that haven't been matched yet
        AND NOT EXISTS (
          SELECT 1 FROM match_candidates mc
          WHERE mc."storeItemId" = s.id
        )
    ),
    ranked AS (
      -- Step 2: Vendor tie-breaker ranking
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY store_item_id 
          ORDER BY 
            -- Highest priority: vendor is filled
            (vendor IS NOT NULL AND vendor != '') DESC,
            -- Next priority: lineCode is filled
            ("lineCode" IS NOT NULL AND "lineCode" != '') DESC,
            -- Final tie-break: stable deterministic (lowest ID)
            interchange_id ASC
        ) as rn
      FROM bridge
    )
    -- Step 3: Supplier enrichment (LEFT JOIN, optional)
    SELECT 
      r.store_item_id,
      r.store_part_number,
      r.interchange_id,
      r.vendor,
      r.matched_on,
      r."merrillPartNumber",
      r."vendorPartNumber",
      sup.id as supplier_item_id,
      sup."partNumber" as supplier_part_number
    FROM ranked r
    LEFT JOIN supplier_items sup
      ON (
        -- Try to match supplier on either side of interchange
        sup."partNumberNorm" = r."vendorPartNumberNorm"
        OR sup."partNumberNorm" = r."merrillPartNumberNorm"
      )
    WHERE r.rn = 1
    ORDER BY r.store_item_id;
  `;
  
  apiLogger.info(`[V4-MATCHER] Executing interchange-first SQL query`);
  
  try {
    const results = await prisma.$queryRawUnsafe<any[]>(query, projectId, storeIdsParam);
    
    apiLogger.info(`[V4-MATCHER] Found ${results.length} interchange matches`);
    apiLogger.info(`[V4-MATCHER] Breakdown:`);
    
    const withSupplier = results.filter(r => r.supplier_item_id).length;
    const withoutSupplier = results.length - withSupplier;
    const withVendor = results.filter(r => r.vendor).length;
    const merrillMatches = results.filter(r => r.matched_on === 'MERRILL').length;
    const vendorMatches = results.filter(r => r.matched_on === 'VENDOR').length;
    
    apiLogger.info(`[V4-MATCHER]   - With supplier enrichment: ${withSupplier}`);
    apiLogger.info(`[V4-MATCHER]   - Without supplier (interchange-only): ${withoutSupplier}`);
    apiLogger.info(`[V4-MATCHER]   - With vendor metadata: ${withVendor}`);
    apiLogger.info(`[V4-MATCHER]   - Matched on MERRILL side: ${merrillMatches}`);
    apiLogger.info(`[V4-MATCHER]   - Matched on VENDOR side: ${vendorMatches}`);
    
    // Convert to V4Match format
    const matches: V4Match[] = results.map(row => ({
      storeItemId: row.store_item_id,
      storePartNumber: row.store_part_number,
      interchangeId: row.interchange_id,
      vendor: row.vendor,
      matchedOn: row.matched_on as 'MERRILL' | 'VENDOR',
      merrillPartNumber: row.merrillPartNumber,
      vendorPartNumber: row.vendorPartNumber,
      supplierItemId: row.supplier_item_id,
      supplierPartNumber: row.supplier_part_number,
      confidence: 1.0, // Exact match via interchange
    }));
    
    return matches;
  } catch (error) {
    apiLogger.error(`[V4-MATCHER] Error executing query:`, error);
    throw error;
  }
}

/**
 * Persist V4 matches to database
 * 
 * Saves matches with V4 metadata:
 * - vendor from interchange
 * - matchedOn (MERRILL | VENDOR)
 * - interchangeId reference
 * - method = INTERCHANGE_EXACT_V4
 */
export async function persistV4Matches(
  projectId: string,
  matches: V4Match[]
): Promise<number> {
  apiLogger.info(`[V4-PERSIST] Persisting ${matches.length} V4 matches`);
  
  if (matches.length === 0) {
    apiLogger.info(`[V4-PERSIST] No matches to persist`);
    return 0;
  }
  
  try {
    // Create match candidates with V4 fields
    const created = await prisma.matchCandidate.createMany({
      data: matches.map(match => ({
        projectId,
        storeItemId: match.storeItemId,
        targetType: match.supplierItemId ? 'SUPPLIER' : 'INVENTORY',
        targetId: match.supplierItemId || 'INTERCHANGE_ONLY',
        method: 'INTERCHANGE', // Use existing enum value
        confidence: match.confidence,
        features: {
          v4: true,
          matchedOn: match.matchedOn,
          merrillPartNumber: match.merrillPartNumber,
          vendorPartNumber: match.vendorPartNumber,
        },
        // V4 fields
        vendor: match.vendor,
        matchedOn: match.matchedOn,
        interchangeId: match.interchangeId,
        status: 'PENDING',
      })),
      skipDuplicates: true,
    });
    
    apiLogger.info(`[V4-PERSIST] Created ${created.count} match candidates`);
    
    return created.count;
  } catch (error) {
    apiLogger.error(`[V4-PERSIST] Error persisting matches:`, error);
    throw error;
  }
}

/**
 * Golden Thread Trace
 * 
 * Detailed logging for a specific part number to diagnose matching.
 * Useful for verifying AXLGM-8167 → vendor=GSP flow.
 */
export async function goldenThreadTrace(
  projectId: string,
  partNumber: string
): Promise<void> {
  apiLogger.info(`\n========== GOLDEN THREAD TRACE ==========`);
  apiLogger.info(`Part Number: ${partNumber}`);
  apiLogger.info(`Project: ${projectId}`);
  apiLogger.info(`=========================================\n`);
  
  // Find store item
  const storeItem = await prisma.storeItem.findFirst({
    where: {
      projectId,
      partNumber: {
        contains: partNumber,
        mode: 'insensitive',
      },
    },
  });
  
  if (!storeItem) {
    apiLogger.info(`[TRACE] ❌ Store item not found`);
    return;
  }
  
  apiLogger.info(`[TRACE] ✅ Store Item Found:`);
  apiLogger.info(`[TRACE]    ID: ${storeItem.id}`);
  apiLogger.info(`[TRACE]    Part Number (raw): ${storeItem.partNumber}`);
  apiLogger.info(`[TRACE]    Part Number (norm): ${storeItem.partNumberNorm}`);
  apiLogger.info(`[TRACE]    Description: ${storeItem.description}`);
  
  // Find interchange matches
  const interchanges = await prisma.interchange.findMany({
    where: {
      projectId,
      OR: [
        { merrillPartNumberNorm: storeItem.partNumberNorm },
        { vendorPartNumberNorm: storeItem.partNumberNorm },
      ],
    },
  });
  
  apiLogger.info(`\n[TRACE] Interchange Candidates: ${interchanges.length}`);
  
  for (const interchange of interchanges) {
    apiLogger.info(`\n[TRACE] Interchange Row:`);
    apiLogger.info(`[TRACE]    ID: ${interchange.id}`);
    apiLogger.info(`[TRACE]    Merrill Part (raw): ${interchange.merrillPartNumber}`);
    apiLogger.info(`[TRACE]    Merrill Part (norm): ${interchange.merrillPartNumberNorm}`);
    apiLogger.info(`[TRACE]    Vendor Part (raw): ${interchange.vendorPartNumber}`);
    apiLogger.info(`[TRACE]    Vendor Part (norm): ${interchange.vendorPartNumberNorm}`);
    apiLogger.info(`[TRACE]    Vendor: ${interchange.vendor || '(null)'}`);
    apiLogger.info(`[TRACE]    Sub Category: ${interchange.subCategory || '(null)'}`);
    
    const matchedOn = storeItem.partNumberNorm === interchange.merrillPartNumberNorm
      ? 'MERRILL'
      : 'VENDOR';
    apiLogger.info(`[TRACE]    Matched On: ${matchedOn}`);
  }
  
  // Find existing match
  const match = await prisma.matchCandidate.findFirst({
    where: {
      storeItemId: storeItem.id,
    },
  });
  
  if (match) {
    apiLogger.info(`\n[TRACE] ✅ Match Found:`);
    apiLogger.info(`[TRACE]    ID: ${match.id}`);
    apiLogger.info(`[TRACE]    Method: ${match.method}`);
    apiLogger.info(`[TRACE]    Vendor: ${match.vendor || '(null)'}`);
    apiLogger.info(`[TRACE]    Matched On: ${match.matchedOn || '(null)'}`);
    apiLogger.info(`[TRACE]    Interchange ID: ${match.interchangeId || '(null)'}`);
    apiLogger.info(`[TRACE]    Target ID: ${match.targetId}`);
    apiLogger.info(`[TRACE]    Confidence: ${match.confidence}`);
  } else {
    apiLogger.info(`\n[TRACE] ❌ No match found`);
  }
  
  apiLogger.info(`\n=========================================\n`);
}
