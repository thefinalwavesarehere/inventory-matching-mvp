/**
 * AI Matching Job Processor (Stage 3)
 * Handles job execution for AI-powered matching
 */

import prisma from '@/app/lib/db/prisma';
import { runAIMatching, AI_CONFIG } from '@/app/lib/matching/ai-matcher-v1.0';

export async function processAIMatching(job: any, projectId: string) {
  console.log(`[AI_MATCHING_V1] Starting job ${job.id} for project ${projectId}`);
  
  const startTime = Date.now();
  
  try {
    // Run AI matching
    const result = await runAIMatching(projectId, AI_CONFIG.BATCH_SIZE);
    
    const duration = Date.now() - startTime;
    
    console.log(`[AI_MATCHING_V1] Batch complete: ${result.itemsProcessed} items processed, ${result.matchesFound} matches found`);
    console.log(`[AI_MATCHING_V1] Estimated cost: $${result.estimatedCost.toFixed(2)}`);
    console.log(`[AI_MATCHING_V1] Duration: ${(duration / 1000).toFixed(1)}s`);
    
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
    
    console.log(`[AI_MATCHING_V1] Remaining unmatched: ${remainingCount}`);
    
    // Determine job status
    let status: 'complete' | 'pending' = 'complete';
    if (remainingCount > 0 && result.matchesFound > 0 && result.estimatedCost < AI_CONFIG.MAX_COST) {
      status = 'pending';
      console.log(`[AI_MATCHING_V1] More items to process - job stays pending`);
    } else {
      console.log(`[AI_MATCHING_V1] Job complete`);
    }
    
    // Update job
    await prisma.matchingJob.update({
      where: { id: job.id },
      data: {
        status: status,
        processedItems: result.itemsProcessed,
        matchesFound: result.matchesFound,
      },
    });
    
    console.log(`[AI_MATCHING_V1] ✅ Job updated: status=${status}, processed=${result.itemsProcessed}, matches=${result.matchesFound}`);
    
    return {
      success: true,
      matchesFound: result.matchesFound,
      itemsProcessed: result.itemsProcessed,
      estimatedCost: result.estimatedCost,
      status,
    };
    
  } catch (error: any) {
    console.error(`[AI_MATCHING_V1] ❌ Job failed:`, error);
    
    // Mark job as failed
    await prisma.matchingJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: error.message,
      },
    });
    
    throw error;
  }
}
