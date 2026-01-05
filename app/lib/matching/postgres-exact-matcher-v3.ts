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
  console.log(`[MATCHER_V7.1_SQL] Starting Rosetta Stone Matching (Interchange Hop) for Project: ${projectId}`);
  
  // V5.8: DIAGNOSTIC X-RAY PROBE
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

  // Build the store IDs filter condition
  const storeIdsFilter = storeIds && storeIds.length > 0 
    ? `AND id IN (${storeIds.map(id => `'${id}'`).join(',')})` 
    : '';
  
  // V7.1 ROSETTA STONE MATCHER:
  // Stage 1: Direct matching (V6.1 Clean-Side logic)
  // Stage 2: Interchange hop - lookup in interchange table, then match
  
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
      WHERE 1=1  -- Global scope
    ),
    -- V7.1: Interchange lookup - find Arnold equivalents for Store parts
    interchange_hop AS (
      SELECT 
        ns.id as store_id,
        ns."partNumber" as store_part,
        ns.clean_part,
        i."oursPartNumber" as arnold_part,
        REGEXP_REPLACE(UPPER(i."oursPartNumber"), '[^A-Z0-9]', '', 'g') as arnold_norm
      FROM ns
      INNER JOIN "interchanges" i ON (
        -- Match store part against interchange "theirs" (competitor/store part)
        UPPER(i."theirsPartNumber") = UPPER(ns."partNumber")
        OR UPPER(i."theirsPartNumber") = UPPER(ns.clean_part)
      )
    ),
    -- Stage 1: Direct matches (V6.1 logic)
    direct_matches AS (
      SELECT DISTINCT ON (ns.id)
        ns.id as "storeItemId",
        sup.id as "supplierItemId",
        ns."partNumber" as "storePartNumber",
        sup."partNumber" as "supplierPartNumber",
        ns."lineCode" as "storeLineCode",
        sup."lineCode" as "supplierLineCode",
        CASE 
          WHEN sup.norm_part = ns.clean_part THEN 1.0
          WHEN RIGHT(sup.norm_part, LENGTH(ns.clean_part)) = ns.clean_part THEN 0.95
          ELSE 0.90
        END as confidence,
        'SQL_DIRECT_V7.1' as "matchMethod",
        CASE
          WHEN sup.norm_part = ns.clean_part THEN 'Direct Exact Match'
          WHEN RIGHT(sup.norm_part, LENGTH(ns.clean_part)) = ns.clean_part THEN 'Direct Suffix Match'
          ELSE 'Direct Partial Match'
        END as "matchReason"
      FROM ns
      INNER JOIN sup ON (
        sup.norm_part = ns.clean_part 
        OR (
          LENGTH(sup.norm_part) > LENGTH(ns.clean_part) AND
          RIGHT(sup.norm_part, LENGTH(ns.clean_part)) = ns.clean_part
        )
      )
      WHERE LENGTH(ns.clean_part) >= 3
      ORDER BY ns.id, confidence DESC
    ),
    -- Stage 2: Interchange hop matches
    interchange_matches AS (
      SELECT DISTINCT ON (ih.store_id)
        ih.store_id as "storeItemId",
        sup.id as "supplierItemId",
        ih.store_part as "storePartNumber",
        sup."partNumber" as "supplierPartNumber",
        NULL as "storeLineCode",
        sup."lineCode" as "supplierLineCode",
        CASE 
          WHEN sup.norm_part = ih.arnold_norm THEN 0.98
          WHEN RIGHT(sup.norm_part, LENGTH(ih.arnold_norm)) = ih.arnold_norm THEN 0.93
          ELSE 0.88
        END as confidence,
        'SQL_INTERCHANGE_HOP_V7.1' as "matchMethod",
        CASE
          WHEN sup.norm_part = ih.arnold_norm THEN 'Interchange Hop - Exact'
          WHEN RIGHT(sup.norm_part, LENGTH(ih.arnold_norm)) = ih.arnold_norm THEN 'Interchange Hop - Suffix'
          ELSE 'Interchange Hop - Partial'
        END as "matchReason"
      FROM interchange_hop ih
      INNER JOIN sup ON (
        sup.norm_part = ih.arnold_norm
        OR (
          LENGTH(sup.norm_part) > LENGTH(ih.arnold_norm) AND
          RIGHT(sup.norm_part, LENGTH(ih.arnold_norm)) = ih.arnold_norm
        )
      )
      WHERE LENGTH(ih.arnold_norm) >= 3
      ORDER BY ih.store_id, confidence DESC
    )
    -- Combine both stages, prioritizing direct matches
    SELECT * FROM direct_matches
    UNION ALL
    SELECT * FROM interchange_matches
    WHERE "storeItemId" NOT IN (SELECT "storeItemId" FROM direct_matches)
    ORDER BY confidence DESC
  `;

  try {
    const matches = await prisma.$queryRawUnsafe<PostgresExactMatch[]>(query, projectId);
    
    const directCount = matches.filter(m => m.matchMethod.includes('DIRECT')).length;
    const interchangeCount = matches.filter(m => m.matchMethod.includes('INTERCHANGE')).length;
    
    console.log(`[MATCHER_V7.1_SQL] Found ${matches.length} total matches`);
    console.log(`  - Direct matches: ${directCount}`);
    console.log(`  - Interchange hop matches: ${interchangeCount}`);
    
    return matches;
  } catch (error) {
    console.error('[MATCHER_V7.1_SQL] Error executing match query:', error);
    throw error;
  }
}
