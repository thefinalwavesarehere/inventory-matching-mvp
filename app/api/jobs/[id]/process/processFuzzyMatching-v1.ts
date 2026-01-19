/**
 * Process Fuzzy Matching V1.2 - Single Batch Per Execution
 * 
 * Processes ONE batch of 500 items per job execution.
 * Cron triggers handle resumption for remaining items.
 * No internal iteration loop to prevent timeout.
 */

import { prisma } from '@/app/lib/db/prisma';
import { findPostgresFuzzyMatches } from '@/app/lib/matching/postgres-fuzzy-matcher-v1';
import { MatchMethod, MatchStatus } from '@prisma/client';

/**
 * Process single batch of fuzzy matching (500 items = 10 micro-batches of 50)
 * 
 * @param storeItems - NOT USED (kept for API compatibility)
 * @param supplierItems - NOT USED (kept for API compatibility)
 * @param projectId - Project ID
 * @returns Number of matches saved
 */
export async function processFuzzyMatching(
  storeItems: any[], // NOT USED - kept for API compatibility
  supplierItems: any[], // NOT USED - kept for API compatibility
  projectId: string,
  jobId?: string // Optional for cancellation checks
): Promise<number> {
  const BATCH_SIZE = 500;
  
  console.log(`[FUZZY-MATCH-V1.2] Processing single batch of ${BATCH_SIZE} items for project ${projectId}`);
  
  // Get current job to track cumulative progress
  const currentJob = await prisma.matchingJob.findFirst({
    where: {
      projectId,
      config: { path: ['jobType'], equals: 'fuzzy' },
      status: 'processing'
    }
  });
  
  if (!currentJob) {
    console.error('[FUZZY-MATCH-V1.2] ERROR: No processing job found');
    return 0;
  }
  
  const existingMatches = currentJob.matchesFound || 0;
  const config = (currentJob.config as any) || {};
  const consecutiveZeroMatches = config.consecutiveZeroMatches || 0;
  const processedOffset = config.processedOffset || 0;
  
  console.log(`[FUZZY-MATCH-V1.2] Current offset: ${processedOffset}`);
  
  // Check remaining unmatched items
  const remainingUnmatched = await prisma.storeItem.count({
    where: {
      projectId,
      matchCandidates: {
        none: {
          projectId: projectId,
          matchStage: { in: [1, 2] }
        }
      }
    }
  });
  
  console.log(`[FUZZY-MATCH-V1.2] Remaining unmatched items: ${remainingUnmatched}`);
  console.log(`[FUZZY-MATCH-V1.2] Cumulative matches so far: ${existingMatches}`);
  
  if (remainingUnmatched === 0) {
    console.log('[FUZZY-MATCH-V1.2] ✅ No unmatched items remaining - marking job complete');
    await prisma.matchingJob.update({
      where: { id: currentJob.id },
      data: {
        status: 'complete'
      }
    });
    return 0;
  }
  
  // Check for cancellation before starting fuzzy matching
  if (jobId) {
    const { isJobCancelled, markJobCancelled, getJobCancellationType } = await import('@/app/lib/job-queue-manager');
    if (await isJobCancelled(jobId)) {
      const cancelType = await getJobCancellationType(jobId);
      console.log(`[FUZZY-MATCH-V1.2] Job ${jobId} cancelled before fuzzy matching (${cancelType})`);
      await markJobCancelled(
        jobId,
        cancelType === 'IMMEDIATE'
          ? 'Job cancelled immediately by user'
          : 'Job cancelled gracefully after current stage'
      );
      throw new Error('Job cancelled by user');
    }
  }
  
  // Process ONE batch (up to 500 items) starting from offset
  console.log(`[FUZZY-MATCH-V1.2] Finding fuzzy matches for next ${BATCH_SIZE} items (offset: ${processedOffset})...`);
  const fuzzyMatches = await findPostgresFuzzyMatches(projectId, processedOffset, jobId);
  
  console.log(`[FUZZY-MATCH-V1.2] Found ${fuzzyMatches.length} fuzzy matches`);
  
  // Save matches
  let savedCount = 0;
  if (fuzzyMatches.length > 0) {
    savedCount = await saveMatches(fuzzyMatches, projectId);
    console.log(`[FUZZY-MATCH-V1.2] Saved ${savedCount} matches`);
  }
  
  // Calculate new offset and progress
  // Always advance offset by BATCH_SIZE, regardless of match count
  const newOffset = processedOffset + BATCH_SIZE;
  const itemsProcessedThisBatch = BATCH_SIZE; // Always process full batch (or less if end reached)
  const newMatchesTotal = existingMatches + savedCount;
  
  // Check if we've processed all items (offset >= total unmatched at start)
  const totalUnmatched = currentJob.totalItems || remainingUnmatched;
  const allItemsProcessed = newOffset >= totalUnmatched;
  
  console.log(`[FUZZY-MATCH-V1.2] Batch complete: ${itemsProcessedThisBatch} items processed, ${savedCount} matches found`);
  console.log(`[FUZZY-MATCH-V1.2] Cumulative matches: ${newMatchesTotal}, Progress: ${newOffset}/${totalUnmatched}`);
  
  // Determine next status with consecutive zero-match tracking
  let nextStatus: 'pending' | 'complete' = 'pending';
  let newConsecutiveZero = consecutiveZeroMatches;
  
  if (allItemsProcessed) {
    console.log(`[FUZZY-MATCH-V1.2] ✅ All items processed (offset ${newOffset} >= total ${totalUnmatched}) - job complete`);
    nextStatus = 'complete';
  } else if (savedCount === 0) {
    newConsecutiveZero = consecutiveZeroMatches + 1;
    
    if (newConsecutiveZero >= 3) {
      console.log(`[FUZZY-MATCH-V1.2] ⚠️  ${newConsecutiveZero} consecutive batches with 0 matches - stopping`);
      nextStatus = 'complete';
    } else {
      console.log(`[FUZZY-MATCH-V1.2] No matches this batch (${newConsecutiveZero}/3 consecutive) - continuing`);
      nextStatus = 'pending';
    }
  } else {
    // Reset consecutive counter on successful match
    newConsecutiveZero = 0;
    console.log(`[FUZZY-MATCH-V1.2] Progress: ${newOffset}/${totalUnmatched} - job stays pending for next cron`);
  }
  
  // Update job progress with new offset
  await prisma.matchingJob.update({
    where: { id: currentJob.id },
    data: {
      processedItems: newOffset, // Track cumulative offset
      matchesFound: newMatchesTotal,
      status: nextStatus,
      config: { 
        ...config, 
        processedOffset: newOffset,
        consecutiveZeroMatches: newConsecutiveZero 
      }
    }
  });
  
  console.log(`[FUZZY-MATCH-V1.2] ✅ Job updated: status=${nextStatus}, processed=${itemsProcessedThisBatch}, matches=${newMatchesTotal}`);
  
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
        method: MatchMethod.FUZZY_SUBSTRING,
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
      console.error(`[FUZZY-MATCH-V1.2] ERROR: Failed to save fuzzy batch`);
      console.error(error);
      throw error;
    }
  }
  
  return savedCount;
}
