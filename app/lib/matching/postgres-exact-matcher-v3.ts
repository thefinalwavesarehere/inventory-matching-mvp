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
  matchReason: string;
}

export async function findMatches(projectId: string, storeIds?: string[]): Promise<PostgresExactMatch[]> {
  console.log(`[MATCHER_V5.8_SQL] Starting Fast-Suffix Matching (Global Scope) for Project: ${projectId}`);
  
  // V5.8: DIAGNOSTIC X-RAY PROBE
  // Verify supplier data visibility before running main query
  try {
    const probe = await prisma.$queryRaw`
      SELECT id, "partNumber", "projectId" 
      FROM "supplier_items" 
      WHERE "partNumber" LIKE '%18600%' 
      LIMIT 3`;
    console.log('[MATCH_PROBE] Looking for 18600 in Supplier DB:', probe);
  } catch (probeError) {
    console.error('[MATCH_PROBE] X-Ray probe failed:', probeError);
  }

  // V5.8 GLOBAL FAST-SUFFIX MATCHER:
  // 1. Universal suffix matching - works with ANY prefix length (2, 3, 4+ chars)
  // 2. Global scope - scans entire supplier catalog (no project isolation)
  // 3. Optimized with pre-filtering to avoid redundant regex calls
  // 4. Safety filter: ignores very short parts (< 4 chars) to prevent false positives
  
  // Build the store IDs filter condition
  const storeIdsFilter = storeIds && storeIds.length > 0 
    ? `AND id IN (${storeIds.map(id => `'${id}'`).join(',')})` 
    : '';
  
  const query = `
    WITH ns AS (
      SELECT 
        id, 
        "partNumber", 
        "lineCode",
        REGEXP_REPLACE(UPPER("partNumber"), '[^A-Z0-9]', '', 'g') as norm_part
      FROM "store_items"
      WHERE "projectId" = $1 
      ${storeIdsFilter}
      AND NOT EXISTS (
        SELECT 1 FROM "match_candidates" mc 
        WHERE mc."storeItemId" = "store_items".id
      )
    ),
    sup AS (
      SELECT 
        id, 
        "partNumber",
        "lineCode",
        REGEXP_REPLACE(UPPER("partNumber"), '[^A-Z0-9]', '', 'g') as norm_sup
      FROM "supplier_items"
      WHERE 1=1  -- V5.8: Global scope - scan entire supplier catalog across all projects
    )
    SELECT DISTINCT ON (ns.id)
      ns.id as "storeItemId",
      sup.id as "supplierItemId",
      ns."partNumber" as "storePartNumber",
      sup."partNumber" as "supplierPartNumber",
      ns."lineCode" as "storeLineCode",
      sup."lineCode" as "supplierLineCode",
      
      -- Calculate Confidence Score
      CASE 
        WHEN sup.norm_sup = ns.norm_part THEN 1.0
        ELSE 0.95
      END as confidence,

      'SQL_FAST_SUFFIX_V5.8' as "matchMethod",
      
      CASE
        WHEN sup.norm_sup = ns.norm_part THEN 'Exact Match'
        ELSE 'Suffix Match (Universal Prefix)'
      END as "matchReason"

    FROM ns
    INNER JOIN sup ON (
      -- The Optimized Join
      sup.norm_sup = ns.norm_part 
      OR (
        -- Only perform the RIGHT() check if the supplier part is longer
        LENGTH(sup.norm_sup) > LENGTH(ns.norm_part) AND
        RIGHT(sup.norm_sup, LENGTH(ns.norm_part)) = ns.norm_part
      )
    )
    -- Safety: ignore very short parts that cause false positives
    WHERE LENGTH(ns.norm_part) >= 4
    ORDER BY ns.id, confidence DESC
  `;

  try {
    const matches = await prisma.$queryRawUnsafe<PostgresExactMatch[]>(query, projectId);
    console.log(`[MATCHER_V5.8_SQL] Found ${matches.length} matches using Global Fast-Suffix logic.`);
    return matches;
  } catch (error) {
    console.error('[MATCHER_V5.8_SQL] Error executing match query:', error);
    throw error;
  }
}
