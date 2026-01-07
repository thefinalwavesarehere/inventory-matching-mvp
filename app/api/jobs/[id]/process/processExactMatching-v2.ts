/**
 * Process Exact Matching V3.0
 * 
 * Uses Postgres Native Exact Matcher with description similarity validation
 * Single-pass processing (no batching) with deduplication
 */

import { prisma } from '@/app/lib/db/prisma';
import { findPostgresExactMatches, findInterchangeMatches } from '@/app/lib/matching/postgres-exact-matcher-v2';
import { MatchMethod, MatchStatus } from '@prisma/client';

/**
 * Process exact matching for entire project (V3.0 handles all items at once)
 * 
 * @param projectId - Project ID
 * @returns Number of matches saved
 */
export async function processExactMatching(
  storeItems: any[], // NOT USED - kept for API compatibility
  supplierItems: any[], // NOT USED - kept for API compatibility
  projectId: string
): Promise<number> {
  console.log(`[EXACT-MATCH-V3.0] Starting single-pass matching for project ${projectId}`);
  
  // Get total store item count
  const totalStoreItems = await prisma.storeItem.count({ where: { projectId } });
  console.log(`[EXACT-MATCH-V3.0] Total store items: ${totalStoreItems}`);
  
  // PHASE 1: INTERCHANGE MATCHING
  console.log(`[EXACT-MATCH-V3.0] === PHASE 1: INTERCHANGE MATCHING ===`);
  const interchangeMatches = await findInterchangeMatches(projectId);
  console.log(`[EXACT-MATCH-V3.0] Found ${interchangeMatches.length} interchange matches`);
  
  // Save interchange matches
  let interchangeSavedCount = 0;
  if (interchangeMatches.length > 0) {
    interchangeSavedCount = await saveMatches(interchangeMatches, projectId, 'INTERCHANGE');
    console.log(`[EXACT-MATCH-V3.0] Saved ${interchangeSavedCount} interchange matches`);
  }
  
  // PHASE 2: EXACT MATCHING (V3.0 with description validation & deduplication)
  console.log(`[EXACT-MATCH-V3.0] === PHASE 2: EXACT MATCHING (DESCRIPTION-VALIDATED) ===`);
  const exactMatches = await findPostgresExactMatches(projectId);
  console.log(`[EXACT-MATCH-V3.0] Found ${exactMatches.length} exact matches (deduplicated, one per store item)`);
  
  // Save exact matches
  let exactSavedCount = 0;
  if (exactMatches.length > 0) {
    exactSavedCount = await saveMatches(exactMatches, projectId, 'EXACT');
    console.log(`[EXACT-MATCH-V3.0] Saved ${exactSavedCount} exact matches`);
  }
  
  const totalSavedCount = interchangeSavedCount + exactSavedCount;
  const matchRate = (totalSavedCount / totalStoreItems) * 100;
  
  console.log(`[EXACT-MATCH-V3.0] ✅ COMPLETE`);
  console.log(`[EXACT-MATCH-V3.0] Total matches: ${totalSavedCount}`);
  console.log(`[EXACT-MATCH-V3.0] Match rate: ${matchRate.toFixed(1)}%`);
  console.log(`[EXACT-MATCH-V3.0] Breakdown: ${interchangeSavedCount} interchange + ${exactSavedCount} exact`);
  
  return totalSavedCount;
}

/**
 * Helper function to save matches to database
 */
async function saveMatches(
  matches: any[],
  projectId: string,
  matchType: 'INTERCHANGE' | 'EXACT'
): Promise<number> {
  let savedCount = 0;
  
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
        matchStage: 1,
        status: MatchStatus.PENDING,
        features: {
          matchMethod: match.matchMethod,
          matchReason: match.matchReason,
          storePartNumber: match.storePartNumber,
          supplierPartNumber: match.supplierPartNumber,
          storeLineCode: match.storeLineCode || 'N/A',
          supplierLineCode: match.supplierLineCode || 'N/A',
          storeDescription: match.storeDescription,
          supplierDescription: match.supplierDescription,
          descriptionSimilarity: match.descriptionSimilarity,
        },
      }));
      
      await prisma.matchCandidate.createMany({
        data: dataToInsert,
        skipDuplicates: true,
      });
      
      savedCount += batch.length;
    } catch (error) {
      console.error(`[EXACT-MATCH-V3.0] ERROR: Failed to save ${matchType} batch`);
      console.error(error);
      throw error;
    }
  }
  
  return savedCount;
}
