/**
 * Process Fuzzy Matching V1.1
 * 
 * Uses PostgreSQL Native Fuzzy Matcher with intelligent batching
 * Processes 3000 items per iteration to handle large datasets
 */

import { prisma } from '@/app/lib/db/prisma';
import { findPostgresFuzzyMatches } from '@/app/lib/matching/postgres-fuzzy-matcher-v1';
import { MatchMethod, MatchStatus } from '@prisma/client';

/**
 * Process fuzzy matching with iteration loop (handles any dataset size)
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
  console.log(`[FUZZY-MATCH-V1.1] Starting iterative fuzzy matching for project ${projectId}`);
  
  let totalMatches = 0;
  let iteration = 0;
  const MAX_ITERATIONS = 10; // Safety limit (3000 items × 10 = 30,000 items max)
  
  while (iteration < MAX_ITERATIONS) {
    iteration++;
    
    console.log(`[FUZZY-MATCH-V1.1] === Iteration ${iteration} ===`);
    
    // Check remaining unmatched items
    const totalUnmatched = await prisma.storeItem.count({
      where: {
        projectId,
        NOT: {
          matchCandidates: {
            some: {
              projectId: projectId, // CRITICAL: Add projectId to subquery
              matchStage: { in: [1, 2] }
            }
          }
        }
      }
    });
    
    console.log(`[FUZZY-MATCH-V1.1] Remaining unmatched items: ${totalUnmatched}`);
    
    if (totalUnmatched === 0) {
      console.log('[FUZZY-MATCH-V1.1] No more items to process');
      break;
    }
    
    // Run fuzzy matching (processes next 3000 items)
    console.log(`[FUZZY-MATCH-V1.1] Processing next batch (up to 3000 items)...`);
    const fuzzyMatches = await findPostgresFuzzyMatches(projectId);
    
    if (fuzzyMatches.length === 0) {
      console.log('[FUZZY-MATCH-V1.1] No matches found in this batch');
      break;
    }
    
    console.log(`[FUZZY-MATCH-V1.1] Found ${fuzzyMatches.length} fuzzy matches`);
    
    // Save matches
    const savedCount = await saveMatches(fuzzyMatches, projectId);
    totalMatches += savedCount;
    
    console.log(`[FUZZY-MATCH-V1.1] Saved ${savedCount} matches`);
    console.log(`[FUZZY-MATCH-V1.1] Progress: ${totalMatches} total matches, ${totalUnmatched - savedCount} items remaining`);
    
    // If we processed fewer than 3000 items, we're done
    if (fuzzyMatches.length < 3000) {
      console.log('[FUZZY-MATCH-V1.1] Last batch processed');
      break;
    }
  }
  
  if (iteration >= MAX_ITERATIONS) {
    console.warn(`[FUZZY-MATCH-V1.1] WARNING: Reached maximum iterations (${MAX_ITERATIONS})`);
  }
  
  console.log(`[FUZZY-MATCH-V1.1] ✅ COMPLETE`);
  console.log(`[FUZZY-MATCH-V1.1] Total iterations: ${iteration}`);
  console.log(`[FUZZY-MATCH-V1.1] Total fuzzy matches: ${totalMatches}`);
  
  // Auto-queue next batch if unmatched items remain
  const remainingUnmatched = await prisma.storeItem.count({
    where: {
      projectId,
      matchCandidates: {
        none: {
          projectId: projectId, // CRITICAL: Add projectId to subquery
          matchStage: { in: [1, 2] }
        }
      }
    }
  });
  
  console.log(`[FUZZY-AUTO-QUEUE] Remaining unmatched items: ${remainingUnmatched}`);
  
  // Only create next job if we actually found matches AND items remain
  if (totalMatches > 0 && remainingUnmatched > 0) {
    console.log('[FUZZY-AUTO-QUEUE] Found matches - creating next job...');
    
    // Check for existing fuzzy jobs first (prevent duplicates)
    const existingJob = await prisma.matchingJob.findFirst({
      where: {
        projectId,
        config: {
          path: ['jobType'],
          equals: 'fuzzy'
        },
        status: { in: ['pending', 'processing'] }
      }
    });
    
    if (existingJob) {
      console.log('[FUZZY-AUTO-QUEUE] Job already exists - skipping');
      return totalMatches;
    }
    
    const nextJob = await prisma.matchingJob.create({
      data: {
        projectId,
        
        status: 'pending',
        config: { jobType: 'fuzzy', stage: 2 },
        processedItems: 0,
        progressPercentage: 0,
        currentStage: 2,
        currentStageName: 'Fuzzy Matching',
        totalItems: remainingUnmatched,
        
      }
    });
    
    console.log(`[FUZZY-AUTO-QUEUE] ✅ Created job ${nextJob.id} for ${remainingUnmatched} items`);
  } else if (totalMatches === 0 && remainingUnmatched > 0) {
    console.log('[FUZZY-AUTO-QUEUE] ⚠️  No matches found - stopping to prevent infinite loop');
  } else {
    console.log('[FUZZY-AUTO-QUEUE] ✅ All items processed - no more fuzzy matching needed');
  }
  
  return totalMatches;
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
      console.error(`[FUZZY-MATCH-V1.1] ERROR: Failed to save fuzzy batch`);
      console.error(error);
      throw error;
    }
  }
  
  return savedCount;
}
