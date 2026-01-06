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
  console.log(`[INTERCHANGE_BRIDGE_V10.0] Starting Interchange Bridge Match for Project: ${projectId}`);
  
  // Build the store IDs filter condition
  const storeIdsFilter = storeIds && storeIds.length > 0 
    ? `AND s.id IN (${storeIds.map(id => `'${id}'`).join(',')})` 
    : '';
  
  // V9.7 GLOBAL MATCH QUERY (Line Code Ignored + Skip Already Matched)
  const query = `
    SELECT DISTINCT ON (s.id)
      s.id as "storeItemId",
      sup.id as "supplierItemId",
      s."partNumber" as "storePartNumber",
      sup."partNumber" as "supplierPartNumber",
      s."lineCode" as "storeLineCode",
      sup."lineCode" as "supplierLineCode",
      1.0 as confidence,
      'DIRECT_INDEX_V9.4' as "matchMethod",
      'Global Exact Match' as "matchReason"
    FROM "store_items" s
    -- JOIN strictly on the normalized part number. 
    -- WE IGNORE THE LINE CODE HERE to allow "ABC" to match "RAY".
    INNER JOIN "supplier_items" sup 
      ON s."partNumberNorm" = sup."partNumberNorm"
    WHERE 
      s."projectId" = $1
      ${storeIdsFilter}
      -- V9.7: Skip items that already have matches (prevents reprocessing)
      AND NOT EXISTS (
        SELECT 1 FROM "match_candidates" mc 
        WHERE mc."storeItemId" = s.id
      )
    -- Deduplicate: If multiple suppliers have the same part, pick the first one (usually alphabetical by ID)
    ORDER BY s.id, sup.id ASC
  `;

  try {
    const matches = await prisma.$queryRawUnsafe<PostgresDirectMatch[]>(query, projectId);
    
    console.log(`[INTERCHANGE_BRIDGE_V10.0] Found ${matches.length} interchange bridge matches`);
    
    return matches;
  } catch (error) {
    console.error('[MATCHER_V9.4_GLOBAL] Error executing global match query:', error);
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
