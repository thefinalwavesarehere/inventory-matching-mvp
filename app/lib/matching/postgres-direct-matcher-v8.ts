import { prisma } from '@/app/lib/db/prisma';

export interface PostgresDirectMatch {
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

/**
 * V8.0 PASSTHROUGH DIRECT MATCHER
 * 
 * Uses pre-cleaned partNumberNorm from import files for O(1) index joins.
 * No regex, no suffix matching, no fuzzy logic - just pure database index speed.
 * 
 * Requirements:
 * - Files must have PART NUMBER column with pre-cleaned values
 * - Import must map PART NUMBER → partNumberNorm (uppercased, no further processing)
 * - Database must have index on (partNumberNorm, lineCode)
 */
export async function findDirectMatches(projectId: string, storeIds?: string[]): Promise<PostgresDirectMatch[]> {
  console.log(`[INTERCHANGE_BRIDGE_V10.1] Starting Interchange Bridge Match (LEFT JOIN) for Project: ${projectId}`);
  
  // V10.1: Validate interchange data exists and has required fields
  const interchangeCount = await prisma.interchange.count({ where: { projectId } });
  console.log(`[INTERCHANGE_BRIDGE_V10.1] Found ${interchangeCount} interchange mappings for project`);
  
  if (interchangeCount === 0) {
    console.warn(`[INTERCHANGE_BRIDGE_V10.1] WARNING: No interchange data found for project ${projectId}`);
    console.warn(`[INTERCHANGE_BRIDGE_V10.1] Interchange file must be uploaded for bridge matching to work`);
    return [];
  }
  
  // Build the store IDs filter condition
  const storeIdsFilter = storeIds && storeIds.length > 0 
    ? `AND s.id IN (${storeIds.map(id => `'${id}'`).join(',')})` 
    : '';
  
  // V10.1 INTERCHANGE BRIDGE QUERY (LEFT JOIN)
  // Step 1: Match Store → Interchange (project-scoped)
  // Step 2: Match Interchange → Supplier (global catalog) - LEFT JOIN to preserve interchange-only matches
  // Step 3: Return matches with metadata from interchange, supplier if available
  const query = `
    SELECT DISTINCT ON (s.id)
      s.id as "storeItemId",
      COALESCE(sup.id, 'INTERCHANGE_ONLY') as "supplierItemId",
      s."partNumber" as "storePartNumber",
      COALESCE(sup."partNumber", i."theirsPartNumber") as "supplierPartNumber",
      i."oursPartNumber" as "storeLineCode",
      i."theirsPartNumber" as "supplierLineCode",
      i.confidence as confidence,
      CASE 
        WHEN sup.id IS NOT NULL THEN 'INTERCHANGE_BRIDGE_V10.1'
        ELSE 'INTERCHANGE_ONLY_V10.1'
      END as "matchMethod",
      CASE 
        WHEN sup.id IS NOT NULL THEN 'Interchange Bridge Match (Catalog Found)'
        ELSE 'Interchange Match (Catalog Missing)'
      END as "matchReason"
    FROM "store_items" s
    -- Step 1: Join to project-scoped interchange file (the bridge/key)
    INNER JOIN "interchanges" i
      ON s."projectId" = i."projectId"
      AND (
        -- Store part matches "ours" side of interchange
        UPPER(REGEXP_REPLACE(s."partNumber", '[^A-Z0-9]', '', 'gi')) = UPPER(REGEXP_REPLACE(i."oursPartNumber", '[^A-Z0-9]', '', 'gi'))
        OR
        -- Store part matches "theirs" side of interchange (reverse lookup)
        UPPER(REGEXP_REPLACE(s."partNumber", '[^A-Z0-9]', '', 'gi')) = UPPER(REGEXP_REPLACE(i."theirsPartNumber", '[^A-Z0-9]', '', 'gi'))
      )
    -- Step 2: LEFT JOIN to global supplier catalog (preserves interchange matches even if supplier missing)
    LEFT JOIN "supplier_items" sup
      ON (
        -- Match supplier using "theirs" side of interchange
        UPPER(REGEXP_REPLACE(sup."partNumber", '[^A-Z0-9]', '', 'gi')) = UPPER(REGEXP_REPLACE(i."theirsPartNumber", '[^A-Z0-9]', '', 'gi'))
        OR
        -- Match supplier using "ours" side (if store matched "theirs")
        UPPER(REGEXP_REPLACE(sup."partNumber", '[^A-Z0-9]', '', 'gi')) = UPPER(REGEXP_REPLACE(i."oursPartNumber", '[^A-Z0-9]', '', 'gi'))
      )
    WHERE 
      s."projectId" = $1
      ${storeIdsFilter}
      -- V9.7: Skip items that already have matches (prevents reprocessing)
      AND NOT EXISTS (
        SELECT 1 FROM "match_candidates" mc 
        WHERE mc."storeItemId" = s.id
      )
    -- Deduplicate: If multiple suppliers match, pick first
    ORDER BY s.id, COALESCE(sup.id, 'INTERCHANGE_ONLY') ASC
  `;

  try {
    const matches = await prisma.$queryRawUnsafe<PostgresDirectMatch[]>(query, projectId);
    
    console.log(`[INTERCHANGE_BRIDGE_V10.1] Found ${matches.length} interchange bridge matches (includes catalog-missing)`);
    
    return matches;
  } catch (error) {
    console.error('[INTERCHANGE_BRIDGE_V10.1] Error executing interchange bridge query:', error);
    throw error;
  }
}

/**
 * V8.0 DIAGNOSTIC - Check partNumberNorm population
 * 
 * Verifies that partNumberNorm is populated in both store and supplier tables.
 * This field is critical for V8.0 direct matching.
 */
export async function diagnosePartNumberNorm(projectId: string): Promise<void> {
  console.log('\n[V10.0_DIAGNOSTIC] Checking interchange data availability...\n');
  
  // Check store items
  const storeTotal = await prisma.storeItem.count({ where: { projectId } });
  const storeWithNorm = await prisma.storeItem.count({ 
    where: { 
      projectId,
      partNumberNorm: { not: undefined }
    } 
  });
  
  console.log(`Store Items:`);
  console.log(`  Total: ${storeTotal}`);
  console.log(`  With partNumberNorm: ${storeWithNorm} (${((storeWithNorm/storeTotal)*100).toFixed(1)}%)`);
  
  // Check supplier items
  const supplierTotal = await prisma.supplierItem.count();
  const supplierWithNorm = await prisma.supplierItem.count({ 
    where: { 
      partNumberNorm: { not: undefined }
    } 
  });
  
  console.log(`\nSupplier Items:`);
  console.log(`  Total: ${supplierTotal}`);
  console.log(`  With partNumberNorm: ${supplierWithNorm} (${((supplierWithNorm/supplierTotal)*100).toFixed(1)}%)`);
  
  // Sample data
  const storeSample = await prisma.storeItem.findMany({
    where: { projectId },
    select: { partNumber: true, partNumberNorm: true, lineCode: true },
    take: 5
  });
  
  console.log(`\nStore Sample:`);
  storeSample.forEach(s => {
    console.log(`  ${s.partNumber} | norm: ${s.partNumberNorm} | line: ${s.lineCode}`);
  });
  
  const supplierSample = await prisma.supplierItem.findMany({
    select: { partNumber: true, partNumberNorm: true, lineCode: true },
    take: 5
  });
  
  console.log(`\nSupplier Sample:`);
  supplierSample.forEach(s => {
    console.log(`  ${s.partNumber} | norm: ${s.partNumberNorm} | line: ${s.lineCode}`);
  });
  
  if (storeWithNorm === 0 || supplierWithNorm === 0) {
    console.log(`\n⚠️  WARNING: partNumberNorm is not populated!`);
    console.log(`   V8.0 direct matching requires partNumberNorm to be set during import.`);
    console.log(`   Please re-import files using V8.0 passthrough import logic.`);
  } else {
    console.log(`\n✓ partNumberNorm is populated and ready for V8.0 direct matching.`);
  }
}
