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
  console.log(`[MATCHER_V6.0_SQL] Starting MFR Part Number Matching (Line Code Independent) for Project: ${projectId}`);
  
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
        select: { partNumber: true, mfrPartNumber: true, lineCode: true },
        take: 5
      });
      console.log('[BATCH_INPUT] Processing first 5 Store Parts:', 
        storeSample.map(s => `${s.partNumber} (mfr: ${s.mfrPartNumber}, line: ${s.lineCode})`));
    } catch (sampleError) {
      console.error('[BATCH_INPUT] Failed to fetch sample:', sampleError);
    }
  }

  // V6.0 MFR PART NUMBER MATCHER:
  // 1. Matches on mfrPartNumber field (without line codes)
  // 2. Supports both exact and suffix matching
  // 3. Line codes are metadata only, not part of match logic
  // 4. Works with Eric(1) split column format natively
  
  // Build the store IDs filter condition
  const storeIdsFilter = storeIds && storeIds.length > 0 
    ? `AND id IN (${storeIds.map(id => `'${id}'`).join(',')})` 
    : '';
  
  const query = `
    WITH ns AS (
      SELECT 
        id, 
        "partNumber",
        "mfrPartNumber",
        "lineCode",
        REGEXP_REPLACE(UPPER(COALESCE("mfrPartNumber", "partNumber")), '[^A-Z0-9]', '', 'g') as norm_mfr
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
        "mfrPartNumber",
        "lineCode",
        REGEXP_REPLACE(UPPER(COALESCE("mfrPartNumber", "partNumber")), '[^A-Z0-9]', '', 'g') as norm_mfr
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
        WHEN sup.norm_mfr = ns.norm_mfr THEN 1.0
        WHEN RIGHT(sup.norm_mfr, LENGTH(ns.norm_mfr)) = ns.norm_mfr THEN 0.95
        WHEN RIGHT(ns.norm_mfr, LENGTH(sup.norm_mfr)) = sup.norm_mfr THEN 0.95
        ELSE 0.90
      END as confidence,

      'SQL_MFR_PART_V6.0' as "matchMethod",
      
      CASE
        WHEN sup.norm_mfr = ns.norm_mfr THEN 'Exact MFR Part Match'
        WHEN RIGHT(sup.norm_mfr, LENGTH(ns.norm_mfr)) = ns.norm_mfr THEN 'Supplier MFR ends with Store MFR'
        WHEN RIGHT(ns.norm_mfr, LENGTH(sup.norm_mfr)) = sup.norm_mfr THEN 'Store MFR ends with Supplier MFR'
        ELSE 'Partial MFR Match'
      END as "matchReason"

    FROM ns
    INNER JOIN sup ON (
      -- V6.0: Match on MFR part numbers (without line codes)
      sup.norm_mfr = ns.norm_mfr 
      OR (
        -- Supplier MFR part ends with Store MFR part (e.g., AMG18600 ends with 18600)
        LENGTH(sup.norm_mfr) > LENGTH(ns.norm_mfr) AND
        RIGHT(sup.norm_mfr, LENGTH(ns.norm_mfr)) = ns.norm_mfr
      )
      OR (
        -- Store MFR part ends with Supplier MFR part (e.g., AMG18600 ends with 18600)
        LENGTH(ns.norm_mfr) > LENGTH(sup.norm_mfr) AND
        RIGHT(ns.norm_mfr, LENGTH(sup.norm_mfr)) = sup.norm_mfr
      )
    )
    -- V6.0: Safety threshold - ignore very short parts
    WHERE LENGTH(ns.norm_mfr) >= 3 AND LENGTH(sup.norm_mfr) >= 3
    ORDER BY ns.id, confidence DESC
  `;

  try {
    const matches = await prisma.$queryRawUnsafe<PostgresExactMatch[]>(query, projectId);
    console.log(`[MATCHER_V6.0_SQL] Found ${matches.length} matches using MFR Part Number logic.`);
    return matches;
  } catch (error) {
    console.error('[MATCHER_V6.0_SQL] Error executing match query:', error);
    throw error;
  }
}
