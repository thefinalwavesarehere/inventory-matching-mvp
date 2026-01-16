/**
 * Human Review Classification Processor (Stage 5)
 */

import prisma from '@/app/lib/db/prisma';
import { runHumanReviewClassification, CLASSIFIER_CONFIG } from '@/app/lib/matching/human-review-classifier-v1';

export async function processHumanReview(job: any, projectId: string) {
  console.log(`[HUMAN_REVIEW_V1] Starting job ${job.id} for project ${projectId}`);
  
  const startTime = Date.now();
  
  try {
    const result = await runHumanReviewClassification(projectId, CLASSIFIER_CONFIG.BATCH_SIZE);
    
    const duration = Date.now() - startTime;
    
    console.log(`[HUMAN_REVIEW_V1] Batch complete: ${result.itemsProcessed} items, ${result.itemsClassified} classified`);
    console.log(`[HUMAN_REVIEW_V1] Cost: $${result.estimatedCost.toFixed(2)}`);
    console.log(`[HUMAN_REVIEW_V1] Duration: ${(duration / 1000).toFixed(1)}s`);
    
    // Check remaining unclassified
    const remainingCount = await prisma.storeItem.count({
      where: {
        projectId: projectId,
        matchCandidates: {
          none: {
            projectId: projectId,
            status: 'CONFIRMED',
          },
        },
      },
    });
    
    console.log(`[HUMAN_REVIEW_V1] Remaining unclassified: ${remainingCount}`);
    
    let status: 'complete' | 'pending' = 'complete';
    if (remainingCount > 0 && result.itemsClassified > 0 && result.estimatedCost < CLASSIFIER_CONFIG.MAX_COST) {
      status = 'pending';
    }
    
    await prisma.matchingJob.update({
      where: { id: job.id },
      data: {
        status,
        processedItems: (job.processedItems || 0) + result.itemsProcessed,
      },
    });
    
    return {
      itemsClassified: result.itemsClassified,
      itemsProcessed: result.itemsProcessed,
      status,
    };
  } catch (error: any) {
    console.error(`[HUMAN_REVIEW_V1] Error:`, error.message);
    throw error;
  }
}
