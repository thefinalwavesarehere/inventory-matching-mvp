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
  console.log(`[MATCHER_V8.0_DIRECT] Starting Passthrough Direct Matching for Project: ${projectId}`);
  
  // Build the store IDs filter condition
  const storeIdsFilter = storeIds && storeIds.length > 0 
    ? `AND s.id IN (${storeIds.map(id => `'${id}'`).join(',')})` 
    : '';
  
  // V8.0 DIRECT JOIN QUERY
  // Matches on partNumberNorm (pre-cleaned) and optionally lineCode
  // Runs at database index speed (thousands per second)
  
  const query = `
    SELECT DISTINCT ON (s.id)
      s.id as "storeItemId",
      sup.id as "supplierItemId",
      s."partNumber" as "storePartNumber",
      sup."partNumber" as "supplierPartNumber",
      s."lineCode" as "storeLineCode",
      sup."lineCode" as "supplierLineCode",
      
      -- Confidence scoring based on match type
      CASE 
        WHEN s."partNumberNorm" = sup."partNumberNorm" AND s."lineCode" = sup."lineCode" 
          THEN 1.0  -- Perfect match: same normalized part AND same line code
        WHEN s."partNumberNorm" = sup."partNumberNorm" AND s."lineCode" IS NULL 
          THEN 0.98 -- Store has no line code, but part matches
        WHEN s."partNumberNorm" = sup."partNumberNorm" AND sup."lineCode" IS NULL 
          THEN 0.98 -- Supplier has no line code, but part matches
        WHEN s."partNumberNorm" = sup."partNumberNorm" 
          THEN 0.95 -- Part matches, different line codes (cross-reference)
        ELSE 0.90
      END as confidence,

      'SQL_DIRECT_V8.0' as "matchMethod",
      
      CASE
        WHEN s."partNumberNorm" = sup."partNumberNorm" AND s."lineCode" = sup."lineCode" 
          THEN 'Direct Index Match - Same Line Code'
        WHEN s."partNumberNorm" = sup."partNumberNorm" AND (s."lineCode" IS NULL OR sup."lineCode" IS NULL)
          THEN 'Direct Index Match - Missing Line Code'
        WHEN s."partNumberNorm" = sup."partNumberNorm" 
          THEN 'Direct Index Match - Cross Line Code'
        ELSE 'Direct Index Match'
      END as "matchReason"

    FROM "store_items" s
    INNER JOIN "supplier_items" sup ON (
      -- V8.0: Direct index join on pre-cleaned partNumberNorm
      s."partNumberNorm" = sup."partNumberNorm"
      AND s."partNumberNorm" IS NOT NULL
      AND sup."partNumberNorm" IS NOT NULL
    )
    WHERE s."projectId" = $1
    ${storeIdsFilter}
    AND NOT EXISTS (
      SELECT 1 FROM "match_candidates" mc 
      WHERE mc."storeItemId" = s.id
    )
    ORDER BY s.id, confidence DESC
  `;

  try {
    const matches = await prisma.$queryRawUnsafe<PostgresDirectMatch[]>(query, projectId);
    
    console.log(`[MATCHER_V8.0_DIRECT] Found ${matches.length} direct matches`);
    
    // Breakdown by confidence
    const perfect = matches.filter(m => m.confidence === 1.0).length;
    const high = matches.filter(m => m.confidence >= 0.95 && m.confidence < 1.0).length;
    const medium = matches.filter(m => m.confidence >= 0.90 && m.confidence < 0.95).length;
    
    console.log(`[MATCHER_V8.0_DIRECT] Confidence breakdown:`);
    console.log(`  - Perfect (1.0): ${perfect} (same part + same line)`);
    console.log(`  - High (0.95-0.98): ${high} (same part, different/missing line)`);
    console.log(`  - Medium (0.90-0.94): ${medium}`);
    
    return matches;
  } catch (error) {
    console.error('[MATCHER_V8.0_DIRECT] Error executing direct match query:', error);
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
  console.log('\n[V8.0_DIAGNOSTIC] Checking partNumberNorm population...\n');
  
  // Check store items
  const storeTotal = await prisma.storeItem.count({ where: { projectId } });
  const storeWithNorm = await prisma.storeItem.count({ 
    where: { 
      projectId,
      partNumberNorm: { not: null }
    } 
  });
  
  console.log(`Store Items:`);
  console.log(`  Total: ${storeTotal}`);
  console.log(`  With partNumberNorm: ${storeWithNorm} (${((storeWithNorm/storeTotal)*100).toFixed(1)}%)`);
  
  // Check supplier items
  const supplierTotal = await prisma.supplierItem.count();
  const supplierWithNorm = await prisma.supplierItem.count({ 
    where: { 
      partNumberNorm: { not: null }
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
