/**
 * Postgres Exact Matcher V3.10 - DIAGNOSTIC MODE (Fishbowl Analysis)
 * 
 * CRITICAL FIX for match rate collapse (30% → 5%)
 * 
 * PHILOSOPHY:
 * - Part number is PRIMARY (unique product identifier)
 * - Brand/line code is SECONDARY (helps confirm, but not required)
 * - Better to capture with lower confidence than reject entirely
 * - Let users review 0.85 matches rather than miss them completely
 * 
 * STRATEGY:
 * 1. JOIN on part number ONLY (broad net - catches ALL part matches)
 * 2. SCORE line codes in CASE statement (don't filter them out)
 * 3. Keep matches with confidence >= 0.80 (including brand mismatches)
 * 4. Inject brand aliases for known variations (GAT→GATES, etc.)
 * 
 * CONFIDENCE SCORING:
 * - 1.0: Perfect match (identical part + brand)
 * - 0.99: Brand alias match (GAT → GATES, ACD → ACDELCO)
 * - 0.98: Normalized part + brand match
 * - 0.95: Complex part (unique enough to ignore brand)
 * - 0.90: Part match + NULL brand
 * - 0.85: Part match + brand mismatch (KEPT, not rejected!)
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
  matchReason: string | null;
}

/**
 * V3.10: DIAGNOSTIC AUDIT - Analyze why a specific store item isn't matching
 */
async function runDiagnosticAudit(projectId: string, storeItemId: string): Promise<void> {
  try {
    // Get the store item details
    const storeItem = await prisma.storeItem.findUnique({
      where: { id: storeItemId },
      select: { partNumber: true, lineCode: true }
    });
    
    if (!storeItem) {
      console.log(`[DIAGNOSTIC] Store item ${storeItemId} not found`);
      return;
    }
    
    // Calculate normalized version
    const rawPart = storeItem.partNumber;
    const normalized = rawPart
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .replace(/^0+/, ''); // Strip leading zeros
    
    console.log(`[DIAGNOSTIC] ========== GUINEA PIG ANALYSIS ==========`);
    console.log(`[DIAGNOSTIC] Store Item ID: ${storeItemId}`);
    console.log(`[DIAGNOSTIC] Raw Part Number: "${rawPart}"`);
    console.log(`[DIAGNOSTIC] Normalized: "${normalized}"`);
    console.log(`[DIAGNOSTIC] Line Code: "${storeItem.lineCode || 'NULL'}"`);
    
    // Run wildcard audit - find ANY supplier part containing this normalized string
    const wildcardQuery = `
      SELECT 
        "partNumber" as part,
        "lineCode" as line,
        LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0') as normalized
      FROM "supplier_items"
      WHERE ("projectId" = $1 OR "projectId" IS NULL)
        AND UPPER("partNumber") LIKE '%' || $2 || '%'
      LIMIT 10;
    `;
    
    const nearMatches = await prisma.$queryRawUnsafe<any[]>(
      wildcardQuery,
      projectId,
      normalized
    );
    
    if (nearMatches.length > 0) {
      console.log(`[DIAGNOSTIC] 🔍 FOUND ${nearMatches.length} NEAR-MATCHES in supplier catalog:`);
      nearMatches.forEach((match, idx) => {
        console.log(`[DIAGNOSTIC]   ${idx + 1}. Supplier: "${match.part}" (${match.line || 'NO LINE'}) -> Normalized: "${match.normalized}"`);
      });
      console.log(`[DIAGNOSTIC] ⚠️  MISMATCH PATTERN DETECTED - Store normalized "${normalized}" exists in supplier data but not matching!`);
    } else {
      console.log(`[DIAGNOSTIC] 👻 GHOST ITEM - "${normalized}" does NOT exist anywhere in supplier catalog`);
      console.log(`[DIAGNOSTIC] This item cannot be matched (not in supplier data)`);
    }
    
    console.log(`[DIAGNOSTIC] ========== END ANALYSIS ==========`);
  } catch (error) {
    console.error(`[DIAGNOSTIC] Error running audit:`, error);
  }
}

/**
 * Find matches using Postgres-native Part-First strategy with Brand scoring
 * 
 * @param projectId - The project ID to match items for
 * @param storeIds - Optional array of store item IDs to filter (for batch processing)
 * @returns Array of matches with confidence scores
 */
export async function findHybridExactMatches(
  projectId: string,
  storeIds?: string[]
): Promise<PostgresExactMatch[]> {
  console.log(`[POSTGRES_MATCHER_V3.10] Starting Part-First exact matching for project ${projectId}`);
  
  if (storeIds && storeIds.length > 0) {
    console.log(`[POSTGRES_MATCHER_V3.10] Filtering to ${storeIds.length} store items`);
    
    // V3.10: DIAGNOSTIC MODE - Analyze first item
    await runDiagnosticAudit(projectId, storeIds[0]);
  }

  // Build the SQL query with Part-First strategy
  // Using UNNEST for robust array handling in Prisma raw queries
  const storeIdFilter = storeIds && storeIds.length > 0
    ? `AND s.id IN (SELECT unnest($2::text[]))`
    : '';

  const query = `
    WITH 
    -- V3.10: OPTIMIZED - Pre-normalize small batch (50 items) before joining
    normalized_store AS (
      SELECT 
        s.id as store_id,
        s."partNumber" as store_part,
        s."lineCode" as store_line,
        LTRIM(UPPER(REGEXP_REPLACE(s."partNumber", '[^a-zA-Z0-9]', '', 'g')), '0') as normalized_part,
        UPPER(REGEXP_REPLACE(COALESCE(s."lineCode", ''), '[^a-zA-Z0-9]', '', 'g')) as normalized_line,
        LENGTH(REGEXP_REPLACE(s."partNumber", '[^0-9]', '', 'g')) > 0 AND LENGTH(s."partNumber") > 5 as is_complex
      FROM "store_items" s
      WHERE s."projectId" = $1
      ${storeIdFilter}
    ),
    normalized_supplier AS (
      SELECT 
        sup.id as supplier_id,
        sup."partNumber" as supplier_part,
        sup."lineCode" as supplier_line,
        LTRIM(UPPER(REGEXP_REPLACE(sup."partNumber", '[^a-zA-Z0-9]', '', 'g')), '0') as normalized_part,
        UPPER(REGEXP_REPLACE(COALESCE(sup."lineCode", ''), '[^a-zA-Z0-9]', '', 'g')) as normalized_line
      FROM "supplier_items" sup
      WHERE (sup."projectId" = $1 OR sup."projectId" IS NULL)
    ),
    -- Brand alias mappings (15 families, 30+ aliases)
    brand_aliases AS (
      SELECT * FROM (VALUES
        -- GATES family
        ('GAT', 'GATES'), ('GATE', 'GATES'),
        -- ACDELCO family
        ('ACD', 'ACDELCO'), ('AC', 'ACDELCO'), ('ACDEL', 'ACDELCO'),
        -- WAGNER family
        ('WAG', 'WAGNER'),
        -- MOTORCRAFT family
        ('MC', 'MOTORCRAFT'), ('MTCR', 'MOTORCRAFT'),
        -- CHAMPION family
        ('CHA', 'CHAMPION'), ('CHAMP', 'CHAMPION'),
        -- STANDARD family
        ('STD', 'STANDARD'), ('SMP', 'STANDARD'),
        -- DORMAN family
        ('DOR', 'DORMAN'), ('DORM', 'DORMAN'),
        -- MOOG family
        ('MG', 'MOOG'),
        -- RAYBESTOS family
        ('RAY', 'RAYBESTOS'), ('RB', 'RAYBESTOS'),
        -- TIMKEN family
        ('TIM', 'TIMKEN'), ('TMK', 'TIMKEN'),
        -- FEDERAL MOGUL family
        ('FM', 'FEDERALMOGUL'), ('FED', 'FEDERALMOGUL'),
        -- BECK ARNLEY family
        ('BA', 'BECKARNLEY'), ('BECK', 'BECKARNLEY'),
        -- CONTINENTAL family
        ('CONT', 'CONTINENTAL'), ('CTI', 'CONTINENTAL'),
        -- DAYCO family
        ('DAY', 'DAYCO'),
        -- DURALAST family
        ('DUR', 'DURALAST'), ('DL', 'DURALAST'),
        -- 3M family
        ('3M', '3M'), ('3MPRODUCTS', '3M'), ('3MCORP', '3M'),
        -- ARNOLD family
        ('ARNOLD', 'ARNOLD'), ('ARNOLDMOTORSUPPLY', 'ARNOLD'), ('ARNOLDMOTOR', 'ARNOLD'),
        -- WIX family
        ('WIX', 'WIX'), ('WIXFILTERS', 'WIX'),
        -- BOSCH family
        ('BOSCH', 'BOSCH'), ('BSH', 'BOSCH'),
        -- DENSO family
        ('DENSO', 'DENSO'), ('DNS', 'DENSO'),
        -- FORD family
        ('FORD', 'FORD'), ('FRD', 'FORD'), ('MOTORCRAFT', 'FORD'),
        -- GENUINE family
        ('GENUINE', 'GENUINE'), ('OEM', 'GENUINE'), ('OE', 'GENUINE')
      ) AS aliases(alias, canonical)
    )
    
    -- Main query: JOIN on part number ONLY, SCORE line codes
    SELECT * FROM (
    SELECT 
      ns.store_id as "storeItemId",
      nsup.supplier_id as "supplierItemId",
      ns.store_part as "storePartNumber",
      nsup.supplier_part as "supplierPartNumber",
      ns.store_line as "storeLineCode",
      nsup.supplier_line as "supplierLineCode",
      
      -- Confidence scoring (Part-First, Brand-Second)
      CASE
        -- Scenario 1: Perfect match (identical part + brand)
        WHEN ns.store_part = nsup.supplier_part 
         AND ns.store_line = nsup.supplier_line THEN 1.0
        
        -- Scenario 2: Brand alias match (GAT → GATES, ACD → ACDELCO)
        WHEN ns.normalized_part = nsup.normalized_part
         AND EXISTS (
           SELECT 1 FROM brand_aliases ba
           WHERE (ba.alias = ns.normalized_line AND ba.canonical = nsup.normalized_line)
              OR (ba.alias = nsup.normalized_line AND ba.canonical = ns.normalized_line)
              OR (ba.canonical = ns.normalized_line AND ba.canonical = nsup.normalized_line)
         ) THEN 0.99
        
        -- Scenario 2b: Fuzzy brand match (ARNOLD in ARNOLDMOTORSUPPLY)
        WHEN ns.normalized_part = nsup.normalized_part
         AND LENGTH(ns.normalized_line) >= 3
         AND LENGTH(nsup.normalized_line) >= 3
         AND (ns.normalized_line LIKE '%' || nsup.normalized_line || '%'
              OR nsup.normalized_line LIKE '%' || ns.normalized_line || '%') THEN 0.95
        
        -- Scenario 3: Normalized part + brand match
        WHEN ns.normalized_part = nsup.normalized_part
         AND ns.normalized_line = nsup.normalized_line
         AND ns.normalized_line != '' THEN 0.98
        
        -- Scenario 4: Complex part number override (unique enough to ignore brand)
        WHEN ns.normalized_part = nsup.normalized_part
         AND ns.is_complex THEN 0.95
        
        -- Scenario 5: Part match + NULL brand
        WHEN ns.normalized_part = nsup.normalized_part
         AND (ns.store_line IS NULL OR nsup.supplier_line IS NULL 
              OR ns.normalized_line = '' OR nsup.normalized_line = '') THEN 0.90
        
        -- Scenario 6: Part match + brand mismatch (KEPT, not rejected!)
        WHEN ns.normalized_part = nsup.normalized_part THEN 0.85
        
        ELSE 0.0
      END as confidence,
      
      -- Match method for tracking
      CASE
        WHEN ns.store_part = nsup.supplier_part THEN 'strict'
        WHEN ns.normalized_part = nsup.normalized_part THEN 'normalized'
        ELSE 'unknown'
      END as "matchMethod",
      
      -- Match reason for debugging
      CASE
        WHEN ns.store_part = nsup.supplier_part 
         AND ns.store_line = nsup.supplier_line THEN 'perfect_match'
        WHEN EXISTS (
           SELECT 1 FROM brand_aliases ba
           WHERE (ba.alias = ns.normalized_line AND ba.canonical = nsup.normalized_line)
              OR (ba.alias = nsup.normalized_line AND ba.canonical = ns.normalized_line)
              OR (ba.canonical = ns.normalized_line AND ba.canonical = nsup.normalized_line)
         ) THEN 'brand_alias'
        WHEN LENGTH(ns.normalized_line) >= 3 AND LENGTH(nsup.normalized_line) >= 3
         AND (ns.normalized_line LIKE '%' || nsup.normalized_line || '%'
              OR nsup.normalized_line LIKE '%' || ns.normalized_line || '%') THEN 'fuzzy_brand'
        WHEN ns.normalized_line = nsup.normalized_line THEN 'normalized_brand'
        WHEN ns.is_complex THEN 'complex_part'
        WHEN ns.store_line IS NULL OR nsup.supplier_line IS NULL THEN 'null_brand'
        ELSE 'brand_mismatch'
      END as "matchReason"
      
    FROM normalized_store ns
    INNER JOIN normalized_supplier nsup
      ON ns.normalized_part = nsup.normalized_part  -- V3.10: Back to EQUALITY (optimized with CTEs)
    
    ) matches
    -- V3.10: REMOVED confidence filter - accept ALL SQL matches (raw reporting mode)
    -- WHERE confidence >= 0.60  
    ORDER BY confidence DESC, "storeItemId";
  `;

  const params = storeIds && storeIds.length > 0
    ? [projectId, storeIds]
    : [projectId];

  // V3.10: Log SQL query for debugging
  console.log(`[POSTGRES_MATCHER_V3.10] SQL Query (first 500 chars):`, query.substring(0, 500));
  console.log(`[POSTGRES_MATCHER_V3.10] Params:`, { projectId, storeIdsCount: storeIds?.length || 'all' });

  try {
    const matches = await prisma.$queryRawUnsafe<PostgresExactMatch[]>(query, ...params);
    
    // V3.10: RAW REPORTING MODE - All SQL matches accepted
    console.log(`[POSTGRES_MATCHER_V3.10] Found ${matches.length} RAW matches (NO confidence filter)`);
    
    // Log confidence distribution
    const distribution = matches.reduce((acc, m) => {
      const bucket = m.confidence >= 1.0 ? 'perfect' :
                     m.confidence >= 0.98 ? 'high' :
                     m.confidence >= 0.90 ? 'medium' : 'low';
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log(`[POSTGRES_MATCHER_V3.10] Confidence distribution:`, distribution);
    
    return matches;
  } catch (error) {
    console.error(`[POSTGRES_MATCHER_V3.10] ERROR: SQL query failed`);
    console.error(`[POSTGRES_MATCHER_V3.10] Error details:`, error);
    throw error;
  }
}

/**
 * Find Interchange matches (Cross-Reference matching)
 * 
 * Matches Store items to Supplier items via the Interchange table:
 * - Store.partNumber -> Interchange.oursPartNumber -> Interchange.theirsPartNumber -> Supplier.partNumber
 * 
 * This is the "Missing 25%" that Legacy engine had.
 * 
 * @param projectId - The project ID to match items for
 * @param storeIds - Optional array of store item IDs to filter by (for batch processing)
 * @returns Array of interchange matches with metadata
 */
export async function findInterchangeMatches(
  projectId: string,
  storeIds?: string[]
): Promise<PostgresExactMatch[]> {
  
  console.log(`[INTERCHANGE_MATCHER_V3.10] Starting Interchange matching for project ${projectId}`);
  
  if (storeIds && storeIds.length > 0) {
    console.log(`[INTERCHANGE_MATCHER_V3.10] Filtering to ${storeIds.length} store items`);
  }
  
  // Using UNNEST for robust array handling in Prisma raw queries
  const storeIdFilter = storeIds && storeIds.length > 0 
    ? `AND s.id IN (SELECT unnest($2::text[]))`
    : '';
  
  const query = `
    WITH
    -- Normalize part numbers for matching
    normalized_store AS (
      SELECT 
        s.id as store_id,
        s."partNumber" as store_part,
        s."lineCode" as store_line,
        LTRIM(UPPER(REGEXP_REPLACE(s."partNumber", '[^a-zA-Z0-9]', '', 'g')), '0') as normalized_part
      FROM "store_items" s
      WHERE s."projectId" = $1
      ${storeIdFilter}
    ),
    normalized_interchange AS (
      SELECT 
        i.id,
        LTRIM(UPPER(REGEXP_REPLACE(i."oursPartNumber", '[^a-zA-Z0-9]', '', 'g')), '0') as normalized_ours,
        LTRIM(UPPER(REGEXP_REPLACE(i."theirsPartNumber", '[^a-zA-Z0-9]', '', 'g')), '0') as normalized_theirs,
        i."oursPartNumber",
        i."theirsPartNumber",
        i.confidence as interchange_confidence
      FROM "interchanges" i
      WHERE i."projectId" = $1
    ),
    normalized_supplier AS (
      SELECT 
        sup.id as supplier_id,
        sup."partNumber" as supplier_part,
        sup."lineCode" as supplier_line,
        LTRIM(UPPER(REGEXP_REPLACE(sup."partNumber", '[^a-zA-Z0-9]', '', 'g')), '0') as normalized_part
      FROM "supplier_items" sup
      WHERE (sup."projectId" = $1 OR sup."projectId" IS NULL)
    )
    SELECT 
      ns.store_id as "storeItemId",
      nsu.supplier_id as "supplierItemId",
      ns.store_part as "storePartNumber",
      nsu.supplier_part as "supplierPartNumber",
      ns.store_line as "storeLineCode",
      nsu.supplier_line as "supplierLineCode",
      ni.interchange_confidence as confidence,
      'POSTGRES_INTERCHANGE_V3.10' as "matchMethod",
      CONCAT('Interchange: ', ns.store_part, ' -> ', ni."oursPartNumber", ' <-> ', ni."theirsPartNumber", ' -> ', nsu.supplier_part) as "matchReason"
    FROM normalized_store ns
    INNER JOIN normalized_interchange ni
      ON ns.normalized_part = ni.normalized_ours
    INNER JOIN normalized_supplier nsu
      ON ni.normalized_theirs = nsu.normalized_part
    WHERE ns.normalized_part != ''
      AND ni.normalized_ours != ''
      AND ni.normalized_theirs != ''
      AND nsu.normalized_part != ''
  `;

  try {
    const params = storeIds && storeIds.length > 0 ? [projectId, storeIds] : [projectId];
    const matches = await prisma.$queryRawUnsafe<PostgresExactMatch[]>(query, ...params);
    
    console.log(`[INTERCHANGE_MATCHER_V3.10] Found ${matches.length} interchange matches`);
    
    return matches;
  } catch (error) {
    console.error(`[INTERCHANGE_MATCHER_V3.10] ERROR: SQL query failed`);
    console.error(`[INTERCHANGE_MATCHER_V3.10] Error details:`, error);
    throw error;
  }
}
