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
  console.log(`[MATCHER_V6.1_SQL] Starting Clean-Side Matching (Store Prefix Stripping) for Project: ${projectId}`);
  
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
  
  // V5.9: BATCH INPUT TRANSPARENCY
  // Log the actual store part numbers being processed to verify data quality
  if (storeIds && storeIds.length > 0) {
    try {
      const storeSample = await prisma.storeItem.findMany({
        where: { id: { in: storeIds.slice(0, 5) } },
        select: { partNumber: true, lineCode: true },
        take: 5
      });
      console.log('[BATCH_INPUT] Processing first 5 Store Parts:', 
        storeSample.map(s => `${s.partNumber} (line: ${s.lineCode})`));
    } catch (sampleError) {
      console.error('[BATCH_INPUT] Failed to fetch sample:', sampleError);
    }
  }

  // V6.1 CLEAN-SIDE MATCHER:
  // 1. Uses lineCode to strip prefix from Store parts (clean the dirty data)
  // 2. Matches cleaned Store parts against Supplier part suffixes
  // 3. Lightweight V5.8 structure with batch size 50
  // 4. Double suffix logic: Supplier part ends with cleaned Store part
  
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
        -- V6.1: Clean Store Part by removing lineCode prefix if present
        CASE
          WHEN "lineCode" IS NOT NULL AND LENGTH("lineCode") > 0
          THEN REGEXP_REPLACE(UPPER(REPLACE("partNumber", "lineCode", '')), '[^A-Z0-9]', '', 'g')
          ELSE REGEXP_REPLACE(UPPER("partNumber"), '[^A-Z0-9]', '', 'g')
        END as clean_part
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
        REGEXP_REPLACE(UPPER("partNumber"), '[^A-Z0-9]', '', 'g') as norm_part
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
        WHEN sup.norm_part = ns.clean_part THEN 1.0
        WHEN RIGHT(sup.norm_part, LENGTH(ns.clean_part)) = ns.clean_part THEN 0.95
        ELSE 0.90
      END as confidence,

      'SQL_CLEAN_SIDE_V6.1' as "matchMethod",
      
      CASE
        WHEN sup.norm_part = ns.clean_part THEN 'Exact Match (Cleaned Store Part)'
        WHEN RIGHT(sup.norm_part, LENGTH(ns.clean_part)) = ns.clean_part THEN 'Suffix Match (Supplier ends with Cleaned Store)'
        ELSE 'Partial Match'
      END as "matchReason"

    FROM ns
    INNER JOIN sup ON (
      -- V6.1: Double Suffix Logic - Supplier part ends with cleaned Store part
      sup.norm_part = ns.clean_part 
      OR (
        LENGTH(sup.norm_part) > LENGTH(ns.clean_part) AND
        RIGHT(sup.norm_part, LENGTH(ns.clean_part)) = ns.clean_part
      )
    )
    -- V6.1: Safety threshold - ignore very short cleaned parts
    WHERE LENGTH(ns.clean_part) >= 3
    ORDER BY ns.id, confidence DESC
  `;

  try {
    const matches = await prisma.$queryRawUnsafe<PostgresExactMatch[]>(query, projectId);
    console.log(`[MATCHER_V6.1_SQL] Found ${matches.length} matches using Clean-Side logic.`);
    return matches;
  } catch (error) {
    console.error('[MATCHER_V6.1_SQL] Error executing match query:', error);
    throw error;
  }
}
