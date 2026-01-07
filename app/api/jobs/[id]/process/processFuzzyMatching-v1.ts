/**
 * Process Fuzzy Matching V1.0
 * 
 * Uses PostgreSQL Native Fuzzy Matcher with description validation
 * Single-pass processing (no batching) with deduplication
 */

import { prisma } from '@/app/lib/db/prisma';
import { findPostgresFuzzyMatches } from '@/app/lib/matching/postgres-fuzzy-matcher-v1';
import { MatchMethod, MatchStatus } from '@prisma/client';

/**
 * Process fuzzy matching for entire project (V1.0 handles all items at once)
 * Only processes items that don't already have matches from Stage 1 (exact matching)
 * 
 * @param projectId - Project ID
 * @returns Number of matches saved
 */
export async function processFuzzyMatching(
  storeItems: any[], // NOT USED - kept for API compatibility
  supplierItems: any[], // NOT USED - kept for API compatibility
  projectId: string
): Promise<number> {
  console.log(`[FUZZY-MATCH-V1.0] Starting single-pass fuzzy matching for project ${projectId}`);
  
  // Get total unmatched store item count
  const totalUnmatchedItems = await prisma.storeItem.count({
    where: {
      projectId,
      NOT: {
        matchCandidates: {
          some: {}
        }
      }
    }
  });
  
  console.log(`[FUZZY-MATCH-V1.0] Total unmatched items from Stage 1: ${totalUnmatchedItems}`);
  
  if (totalUnmatchedItems === 0) {
    console.log(`[FUZZY-MATCH-V1.0] No unmatched items - skipping fuzzy matching`);
    return 0;
  }
  
  // Run fuzzy matching (only on unmatched items)
  console.log(`[FUZZY-MATCH-V1.0] Running PostgreSQL trigram fuzzy matching...`);
  const fuzzyMatches = await findPostgresFuzzyMatches(projectId);
  console.log(`[FUZZY-MATCH-V1.0] Found ${fuzzyMatches.length} fuzzy matches (deduplicated, one per store item)`);
  
  // Save fuzzy matches
  let savedCount = 0;
  if (fuzzyMatches.length > 0) {
    savedCount = await saveMatches(fuzzyMatches, projectId);
    console.log(`[FUZZY-MATCH-V1.0] Saved ${savedCount} fuzzy matches`);
  }
  
  const matchRate = totalUnmatchedItems > 0 ? (savedCount / totalUnmatchedItems) * 100 : 0;
  
  console.log(`[FUZZY-MATCH-V1.0] ✅ COMPLETE`);
  console.log(`[FUZZY-MATCH-V1.0] Total fuzzy matches: ${savedCount}`);
  console.log(`[FUZZY-MATCH-V1.0] Fuzzy match rate: ${matchRate.toFixed(1)}% of unmatched items`);
  
  return savedCount;
}

/**
 * Helper function to save fuzzy matches to database
 */
async function saveMatches(
  matches: any[],
  projectId: string
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
        method: MatchMethod.FUZZY_SUBSTRING, // Using existing enum value
        confidence: match.confidence,
        matchStage: 2, // Stage 2 = Fuzzy matching
        status: MatchStatus.PENDING,
        features: {
          matchMethod: match.matchMethod,
          matchReason: match.matchReason,
          storePartNumber: match.storePartNumber,
          supplierPartNumber: match.supplierPartNumber,
          partNumberSimilarity: match.partNumberSimilarity,
          descriptionSimilarity: match.descriptionSimilarity,
          weightedScore: match.weightedScore,
          storeDescription: match.storeDescription,
          supplierDescription: match.supplierDescription,
        },
      }));
      
      await prisma.matchCandidate.createMany({
        data: dataToInsert,
        skipDuplicates: true,
      });
      
      savedCount += batch.length;
    } catch (error) {
      console.error(`[FUZZY-MATCH-V1.0] ERROR: Failed to save fuzzy batch`);
      console.error(error);
      throw error;
    }
  }
  
  return savedCount;
}
