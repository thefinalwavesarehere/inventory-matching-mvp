/**
 * Process Exact Matching V2.1
 * 
 * Uses Postgres Native Exact Matcher with:
 * - Relaxed line code constraints
 * - Leading zero handling
 * - Complex part number override
 * - Database-level normalization (REGEXP_REPLACE)
 * 
 * This replaces the old in-memory matching logic.
 */

import { prisma } from '@/app/lib/db/prisma';
import { findHybridExactMatches, findInterchangeMatches } from '@/app/lib/matching/postgres-exact-matcher-v2';
import { MatchMethod, MatchStatus } from '@prisma/client';

/**
 * Process exact matching for a batch of store items
 * 
 * @param storeItems - Store items to match (current batch)
 * @param supplierItems - NOT USED (kept for API compatibility)
 * @param projectId - Project ID
 * @returns Number of matches saved
 */
export async function processExactMatching(
  storeItems: any[],
  supplierItems: any[], // NOT USED - Postgres matcher queries directly
  projectId: string
): Promise<number> {
  console.log(`[EXACT-MATCH-V3.0] Processing ${storeItems.length} store items`);
  console.log(`[EXACT-MATCH-V3.0] Using WATERFALL strategy: Interchange -> Exact`);
  
  // 🔍 DATA VERIFICATION: Check if Interchange table has data
  const interchangeCount = await prisma.interchange.count({ where: { projectId } });
  console.log(`[DATA-CHECK] Project has ${interchangeCount} interchange records.`);
  if (interchangeCount === 0) {
    console.warn(`[DATA-CHECK] ⚠️  WARNING: Interchange table is empty! Match rate will be low. Did the import finish?`);
  }
  
  // Extract store item IDs for batch processing
  const storeItemIds = storeItems.map(item => item.id);
  
  // 🚨 PHASE 1: INTERCHANGE MATCHING (The "Missing 25%")
  console.log(`[EXACT-MATCH-V3.0] === PHASE 1: INTERCHANGE MATCHING ===`);
  const interchangeMatches = await findInterchangeMatches(projectId);
  console.log(`[EXACT-MATCH-V3.0] Found ${interchangeMatches.length} interchange matches`);
  
  // Save interchange matches
  let interchangeSavedCount = 0;
  if (interchangeMatches.length > 0) {
    interchangeSavedCount = await saveMatches(interchangeMatches, projectId, 'INTERCHANGE');
    console.log(`[EXACT-MATCH-V3.0] Saved ${interchangeSavedCount} interchange matches`);
  }
  
  // Filter out matched store items to prevent duplicates
  const matchedStoreIds = new Set(interchangeMatches.map(m => m.storeItemId));
  const remainingStoreIds = storeItemIds.filter(id => !matchedStoreIds.has(id));
  console.log(`[EXACT-MATCH-V3.0] Remaining items for exact match: ${remainingStoreIds.length}/${storeItemIds.length}`);
  
  // 🚨 PHASE 2: EXACT MATCHING (Only for items not matched by Interchange)
  console.log(`[EXACT-MATCH-V3.0] === PHASE 2: EXACT MATCHING ===`);
  let exactMatches: any[] = [];
  if (remainingStoreIds.length > 0) {
    // Call Postgres Exact Matcher V2.1
    // This uses SQL-based matching with:
    // - REGEXP_REPLACE for normalization
    // - LTRIM for leading zero handling
    // - Relaxed line code constraints (3 scenarios)
    // - Complex part number override
    exactMatches = await findHybridExactMatches(projectId);
  }
  
  // Combine all matches for reporting
  const matches = [...interchangeMatches, ...exactMatches];
  
  console.log(`[EXACT-MATCH-V3.0] Found ${exactMatches.length} exact matches`);
  console.log(`[EXACT-MATCH-V3.0] TOTAL matches: ${matches.length} (${interchangeMatches.length} interchange + ${exactMatches.length} exact)`);
  
  if (exactMatches.length === 0) {
    console.log(`[EXACT-MATCH-V3.0] No exact matches found for remaining items`);
  }
  
  // Log confidence distribution
  const confidenceDistribution = matches.reduce((acc, match) => {
    const bucket = match.confidence >= 1.0 ? 'perfect' :
                   match.confidence >= 0.98 ? 'high' :
                   match.confidence >= 0.95 ? 'medium' : 'low';
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log(`[EXACT-MATCH-V3.0] Confidence distribution:`, confidenceDistribution);
  
  // Save exact matches (interchange already saved)
  let exactSavedCount = 0;
  if (exactMatches.length > 0) {
    exactSavedCount = await saveMatches(exactMatches, projectId, 'EXACT');
    console.log(`[EXACT-MATCH-V3.0] Saved ${exactSavedCount} exact matches`);
  }
  
  const totalSavedCount = interchangeSavedCount + exactSavedCount;
  console.log(`[EXACT-MATCH-V3.0] TOTAL saved: ${totalSavedCount} matches (${interchangeSavedCount} interchange + ${exactSavedCount} exact)`);
  
  // Log match rate for this batch
  const matchRate = (totalSavedCount / storeItems.length) * 100;
  console.log(`[EXACT-MATCH-V3.0] Batch match rate: ${matchRate.toFixed(1)}% (${totalSavedCount}/${storeItems.length})`);
  
  return totalSavedCount;
}

/**
 * Helper function to save matches to database
 * 
 * @param matches - Array of matches to save
 * @param projectId - Project ID
 * @param matchType - Type of match (INTERCHANGE or EXACT)
 * @returns Number of matches saved
 */
async function saveMatches(
  matches: any[],
  projectId: string,
  matchType: 'INTERCHANGE' | 'EXACT'
): Promise<number> {
  let savedCount = 0;
  
  // Save matches to database in batches of 100
  for (let i = 0; i < matches.length; i += 100) {
    const batch = matches.slice(i, i + 100);
    
    try {
      const dataToInsert = batch.map((match) => ({
        projectId,
        storeItemId: match.storeItemId,
        targetType: 'SUPPLIER' as const,
        targetId: match.supplierItemId,
        method: matchType === 'INTERCHANGE' ? MatchMethod.INTERCHANGE : MatchMethod.EXACT_NORMALIZED,
        confidence: match.confidence,
        matchStage: 1, // Stage 1: Exact matching
        status: MatchStatus.PENDING,
        features: {
          matchMethod: match.matchMethod,
          matchReason: match.matchReason || (matchType === 'INTERCHANGE' ? 'interchange_match' : 'exact_match'),
          storePartNumber: match.storePartNumber,
          supplierPartNumber: match.supplierPartNumber,
          storeLineCode: match.storeLineCode || 'N/A',
          supplierLineCode: match.supplierLineCode || 'N/A',
        },
      }));
      
      await prisma.matchCandidate.createMany({
        data: dataToInsert,
        skipDuplicates: true,
      });
      
      savedCount += batch.length;
    } catch (error) {
      console.error(`[EXACT-MATCH-V3.0] ERROR: Failed to save ${matchType} batch ${i / 100 + 1}`);
      console.error(`[EXACT-MATCH-V3.0] Error details:`, error);
      console.error(`[EXACT-MATCH-V3.0] Sample data that failed:`, JSON.stringify(batch[0], null, 2));
      throw error; // Re-throw to stop processing
    }
  }
  
  return savedCount;
}
