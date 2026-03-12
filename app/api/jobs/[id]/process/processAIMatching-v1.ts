/**
 * AI Matching Job Processor (Stage 3)
 * Uses ai-matcher-v3.0: multi-item prompts (6 items/call), 75% confidence threshold
 */

import prisma from '@/app/lib/db/prisma';
import { runAIMatchingV3, AI_CONFIG_V3 } from '@/app/lib/matching/ai-matcher-v3.0';

export async function processAIMatching(job: any, projectId: string) {
  console.log(`[AI_MATCHING_V3] Starting job ${job.id} for project ${projectId}`);
  
  const startTime = Date.now();
  
  try {
    // Get offset from job config
    const config = (job.config || {}) as any;
    const processedOffset = config.aiProcessedOffset || 0;
    
    console.log(`[AI_MATCHING_V3] Current offset: ${processedOffset}`);
    
    // Run AI matching with offset
    const result = await runAIMatchingV3(projectId, AI_CONFIG_V3.BATCH_SIZE, processedOffset);
    
    const duration = Date.now() - startTime;
    
    console.log(`[AI_MATCHING_V3] Batch complete: ${result.itemsProcessed} items processed, ${result.matchesFound} matches found`);
    console.log(`[AI_MATCHING_V3] Estimated cost: $${result.estimatedCost.toFixed(3)}`);
    console.log(`[AI_MATCHING_V3] Duration: ${(duration / 1000).toFixed(1)}s`);
    
    // Check if more items remain
    const remainingCount = await prisma.storeItem.count({
      where: {
        projectId: projectId,
        matchCandidates: {
          none: {
            projectId: projectId,
            matchStage: { in: [1, 2, 3] },
          },
        },
      },
    });
    
    console.log(`[AI_MATCHING_V3] Remaining unmatched: ${remainingCount}`);
    
    // Determine job status
    let status: 'complete' | 'pending' = 'complete';
    if (remainingCount > 0 && result.matchesFound > 0 && result.estimatedCost < AI_CONFIG_V3.MAX_COST) {
      status = 'pending';
      console.log(`[AI_MATCHING_V3] More items to process - job stays pending`);
    } else {
      console.log(`[AI_MATCHING_V3] Job complete`);
    }
    
    // Calculate new offset and cumulative matches
    const newOffset = processedOffset + result.itemsProcessed;
    const cumulativeMatches = (job.matchesFound || 0) + result.matchesFound;
    
    // Update job with new offset and cumulative matches
    await prisma.matchingJob.update({
      where: { id: job.id },
      data: {
        status: status,
        processedItems: newOffset,
        matchesFound: cumulativeMatches,
        config: { ...config, aiProcessedOffset: newOffset },
      },
    });
    
    console.log(`[AI_MATCHING_V3] ✅ Job updated: status=${status}, processed=${result.itemsProcessed}, matches=${result.matchesFound}`);
    
    return {
      success: true,
      matchesFound: result.matchesFound,
      itemsProcessed: result.itemsProcessed,
      estimatedCost: result.estimatedCost,
      status,
    };
    
  } catch (error: any) {
    console.error(`[AI_MATCHING_V3] ❌ Job failed:`, error);
    
    // Mark job as failed
    await prisma.matchingJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        errorMessage: error.message,
      },
    });
    
    throw error;
  }
}
