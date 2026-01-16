/**
 * AI-Enhanced Fuzzy Matching Processor (Stage 3A)
 */

import prisma from '@/app/lib/db/prisma';
import { runAIEnhancedFuzzyMatching, AI_FUZZY_CONFIG } from '@/app/lib/matching/ai-enhanced-fuzzy-matcher-v1';

export async function processAIFuzzyMatching(job: any, projectId: string) {
  console.log(`[AI_FUZZY_V1] Starting job ${job.id} for project ${projectId}`);
  
  const startTime = Date.now();
  
  try {
    const result = await runAIEnhancedFuzzyMatching(projectId, AI_FUZZY_CONFIG.BATCH_SIZE);
    
    const duration = Date.now() - startTime;
    
    console.log(`[AI_FUZZY_V1] Batch complete: ${result.itemsProcessed} items, ${result.matchesFound} matches`);
    console.log(`[AI_FUZZY_V1] Cost: $${result.estimatedCost.toFixed(2)}`);
    console.log(`[AI_FUZZY_V1] Duration: ${(duration / 1000).toFixed(1)}s`);
    
    // Check remaining
    const remainingCount = await prisma.storeItem.count({
      where: {
        projectId: projectId,
        matchCandidates: {
          none: {
            projectId: projectId,
            matchStage: { in: [1, 2] },
          },
        },
      },
    });
    
    console.log(`[AI_FUZZY_V1] Remaining unmatched: ${remainingCount}`);
    
    let status: 'complete' | 'pending' = 'complete';
    if (remainingCount > 0 && result.matchesFound > 0 && result.estimatedCost < AI_FUZZY_CONFIG.MAX_COST) {
      status = 'pending';
    }
    
    await prisma.matchingJob.update({
      where: { id: job.id },
      data: {
        status,
        processedItems: (job.processedItems || 0) + result.itemsProcessed,
        matchesFound: (job.matchesFound || 0) + result.matchesFound,
      },
    });
    
    return {
      matchesFound: result.matchesFound,
      itemsProcessed: result.itemsProcessed,
      status,
    };
  } catch (error: any) {
    console.error(`[AI_FUZZY_V1] Error:`, error.message);
    throw error;
  }
}
