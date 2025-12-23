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
import { findHybridExactMatches } from '@/app/lib/matching/postgres-exact-matcher-v2';
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
  console.log(`[EXACT-MATCH-V2.1] Processing ${storeItems.length} store items`);
  console.log(`[EXACT-MATCH-V2.1] Using Postgres Native Matcher with relaxed constraints`);
  
  // Extract store item IDs for batch processing
  const storeItemIds = storeItems.map(item => item.id);
  
  // Call Postgres Exact Matcher V2.1
  // This uses SQL-based matching with:
  // - REGEXP_REPLACE for normalization
  // - LTRIM for leading zero handling
  // - Relaxed line code constraints (3 scenarios)
  // - Complex part number override
  const matches = await findHybridExactMatches(projectId, storeItemIds);
  
  console.log(`[EXACT-MATCH-V2.1] Found ${matches.length} matches`);
  
  if (matches.length === 0) {
    console.log(`[EXACT-MATCH-V2.1] No matches found for this batch`);
    return 0;
  }
  
  // Log confidence distribution
  const confidenceDistribution = matches.reduce((acc, match) => {
    const bucket = match.confidence >= 1.0 ? 'perfect' :
                   match.confidence >= 0.98 ? 'high' :
                   match.confidence >= 0.95 ? 'medium' : 'low';
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log(`[EXACT-MATCH-V2.1] Confidence distribution:`, confidenceDistribution);
  
  // Save matches to database in batches of 100
  let savedCount = 0;
  for (let i = 0; i < matches.length; i += 100) {
    const batch = matches.slice(i, i + 100);
    
    try {
      const dataToInsert = batch.map((match) => ({
        projectId,
        storeItemId: match.storeItemId,
        targetType: 'SUPPLIER' as const,
        targetId: match.supplierItemId,
        method: MatchMethod.EXACT_NORMALIZED,
        confidence: match.confidence,
        matchStage: 1, // Stage 1: Exact matching
        status: MatchStatus.PENDING,
        features: {
          matchMethod: match.matchMethod,
          matchReason: match.matchReason || 'exact_match',
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
      console.error(`[EXACT-MATCH-V2.1] ERROR: Failed to save batch ${i / 100 + 1}`);
      console.error(`[EXACT-MATCH-V2.1] Error details:`, error);
      console.error(`[EXACT-MATCH-V2.1] Sample data that failed:`, JSON.stringify(batch[0], null, 2));
      throw error; // Re-throw to stop processing
    }
  }
  
  console.log(`[EXACT-MATCH-V2.1] Saved ${savedCount} matches to database`);
  
  // Log match rate for this batch
  const matchRate = (savedCount / storeItems.length) * 100;
  console.log(`[EXACT-MATCH-V2.1] Batch match rate: ${matchRate.toFixed(1)}% (${savedCount}/${storeItems.length})`);
  
  return savedCount;
}
