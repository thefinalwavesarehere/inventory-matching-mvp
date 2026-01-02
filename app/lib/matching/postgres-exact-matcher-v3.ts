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
  console.log(`[MATCHER_V4.2_SQL] Starting Prefix-Strip Matching (Cost Logic Removed) for Project: ${projectId}`);

  // This SQL query implements the "3-Character Strip" rule directly in the database
  const query = `
    WITH normalized_store AS (
      SELECT 
        id, 
        "partNumber", 
        "lineCode", 
        -- Remove special chars for fuzzy comparison
        REGEXP_REPLACE(UPPER("partNumber"), '[^A-Z0-9]', '', 'g') as norm_part
      FROM "store_items"
      WHERE "projectId" = $1 
      ${storeIds && storeIds.length > 0 ? `AND "id" IN (${storeIds.map(id => `'${id}'`).join(',')})` : ''}
      AND "matchStatus" = 'UNMATCHED'
    ),
    normalized_supplier AS (
      SELECT 
        id, 
        "partNumber", 
        "lineCode", 
        -- 1. Standard Normalization
        REGEXP_REPLACE(UPPER("partNumber"), '[^A-Z0-9]', '', 'g') as norm_full,
        -- 2. "The Eric Rule": Strip first 3 chars, then normalize
        REGEXP_REPLACE(UPPER(SUBSTRING("partNumber", 4)), '[^A-Z0-9]', '', 'g') as norm_stripped,
        -- Extract the prefix (first 3 chars) to use as line code if needed
        UPPER(LEFT("partNumber", 3)) as extracted_prefix
      FROM "supplier_items"
      WHERE "projectId" = $1 OR "projectId" IS NULL
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
        -- Perfect Line Code Match (e.g. Client 'MEV' matches Internal 'MEV')
        WHEN ns."lineCode" IS NOT NULL AND ns."lineCode" = sup.extracted_prefix THEN 1.0
        -- Exact String Match (Rare for this dataset)
        WHEN ns.norm_part = sup.norm_full THEN 0.99
        -- Stripped Match (The most common case)
        ELSE 0.95
      END as confidence,

      'SQL_PREFIX_STRIP_V4.2' as "matchMethod",
      
      CASE
        WHEN ns."lineCode" = sup.extracted_prefix THEN 'Line Code Confirmed + Part Match'
        ELSE 'Part Match (Prefix Stripped)'
      END as "matchReason"

    FROM normalized_store ns
    INNER JOIN normalized_supplier sup ON 
      -- MATCH CONDITION:
      -- Either exact match OR the stripped match (Eric's Rule)
      (ns.norm_part = sup.norm_full OR ns.norm_part = sup.norm_stripped)

    -- DISAMBIGUATION LOGIC (ORDER BY picks the winner)
    ORDER BY 
      ns.id, 
      -- Priority: Prefer matches where Line Codes align
      (CASE WHEN ns."lineCode" = sup.extracted_prefix THEN 0 ELSE 1 END) ASC
  `;

  try {
    const matches = await prisma.$queryRawUnsafe<PostgresExactMatch[]>(query, projectId);
    console.log(`[MATCHER_V4.2_SQL] Found ${matches.length} matches using Prefix Stripping logic.`);
    return matches;
  } catch (error) {
    console.error('[MATCHER_V4.2_SQL] Error executing match query:', error);
    throw error;
  }
}
