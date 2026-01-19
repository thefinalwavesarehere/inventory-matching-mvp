/**
 * Job Processor API
 * POST /api/jobs/[id]/process - Process next chunk of a job
 * 
 * This endpoint processes jobs in small chunks to avoid Vercel timeouts.
 * It should be called repeatedly until the job is complete.
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import { requireAuth } from '@/app/lib/auth-helpers';
import prisma from '@/app/lib/db/prisma';
import OpenAI from 'openai';
import { processExactMatching } from './processExactMatching-v2';
import { processFuzzyMatching } from './processFuzzyMatching-v1';
import { processAIMatching } from './processAIMatching-v1';
import { processWebSearchMatching } from './processWebSearchMatching-v1';
import { processAIFuzzyMatching } from './processAIFuzzyMatching-v1';
import { processSupersessionMatching } from './processSupersessionMatching-v1';
import { processHumanReview } from './processHumanReview-v1';
import {
  isJobCancelled,
  getJobCancellationType,
  markJobCancelled,
  markJobCompleted,
  markJobFailed,
} from '@/app/lib/job-queue-manager';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Chunk sizes optimized for each job type
// V8.1: Increased exact chunk size for high-throughput direct index matching
const CHUNK_SIZES: Record<string, number> = {
  'exact': 500,   // V8.1: Increased to 500 for V8.0 direct index matching (1.2s per 50 items = 12s per 500)
  'fuzzy': 300,   // V9.0: Increased to 300 for optimized fuzzy matching
  'ai-fuzzy': 100, // AI-enhanced fuzzy
  'supersession': 50, // Supersession lookup
  'ai': 100,      // AI processes 100 items in ~3-4 minutes
  'web-search': 20, // Web search processes 20 items in ~1-2 minutes
  'human-review': 100, // Human review classification
};

function getChunkSize(jobType: string): number {
  return CHUNK_SIZES[jobType] || 100;
}

/**
 * V9.2: Fire-and-forget batch trigger
 * Triggers next batch without awaiting response to free up current serverless function
 */
function triggerNextBatch(req: NextRequest, jobId: string): void {
  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const url = `${protocol}://${host}/api/jobs/${jobId}/process`;
  
  // Fire-and-forget: no await
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-call': process.env.CRON_SECRET || 'internal'
    }
  }).catch(err => {
    console.error(`[V9.2-TRIGGER] Failed to trigger next batch:`, err.message);
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Allow internal calls from cron
    const internalCall = req.headers.get('x-internal-call');
    const isInternalCall = internalCall === process.env.CRON_SECRET;
    
    if (!isInternalCall) {
      // Require authentication
    await requireAuth();
    }

    const jobId = params.id;

    // Get job
    const job = await prisma.matchingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Check if job is already completed or failed
    if (job.status === 'completed' || job.status === 'failed') {
      return NextResponse.json({
        success: true,
        job: {
          id: job.id,
          status: job.status,
          processedItems: job.processedItems,
          totalItems: job.totalItems,
          matchesFound: job.matchesFound,
        },
        message: `Job already ${job.status}`,
      });
    }

    // Check for cancellation before starting
    if (await isJobCancelled(jobId)) {
      const cancelType = await getJobCancellationType(jobId);
      console.log(`[JOB-CANCEL] Job ${jobId} already cancelled (${cancelType})`);
      return NextResponse.json({
        success: true,
        job: {
          id: job.id,
          status: job.status,
          message: 'Job was cancelled',
        },
      });
    }

    // ATOMIC LOCK: Prevent duplicate execution
    // Only proceed if we can claim the job (status is queued OR processing with stale lock)
    const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    const now = new Date();
    const lockExpiry = new Date(Date.now() - LOCK_TIMEOUT_MS);

    const lockResult = await prisma.matchingJob.updateMany({
      where: {
        id: jobId,
        OR: [
          { status: 'queued' },
          {
            status: 'processing',
            updatedAt: { lt: lockExpiry }  // Stale lock (no update in 5 min)
          }
        ]
      },
      data: {
        status: 'processing',
        startedAt: job.status === 'queued' ? now : job.startedAt,
        updatedAt: now,
      }
    });
    
    if (lockResult.count === 0) {
      // Job was already claimed by another instance
      console.log(`[JOB-LOCK] Job ${jobId} already processing by another instance - skipping`);
      return NextResponse.json({ 
        success: true, 
        status: 'already_processing',
        message: 'Job is being processed by another instance'
      });
    }
    
    console.log(`[JOB-LOCK] Successfully acquired lock for job ${jobId}`);

    // Update job status to processing if it's queued (first time running)
    if (job.status === 'queued') {

      const config = job.config as any || {};
      const jobType = config.jobType || 'ai';
      
      // V4 Step 0: Un-match prerequisite (only for exact jobs)
      if (jobType === 'exact') {
        console.log(`[V4-MATCHER] ========== EXACT MATCHER VERSION: V4 (commit 915d088) ==========`);
        console.log(`[V4-MATCHER] Interchange-First Bridge Logic Active`);
        console.log(`[V4-UNMATCH] Starting un-match prerequisite for exact job`);
        const { unmatchProject } = await import('@/app/lib/matching/v4-interchange-first-matcher');
        const clearedCount = await unmatchProject(job.projectId);
        console.log(`[V4-UNMATCH] Cleared ${clearedCount} existing matches - ready for V4 rematching`);
      }
    }

    const config = job.config as any || {};
    const jobType = config.jobType || 'ai'; // 'ai' or 'web-search'

    console.log(`[JOB-PROCESS] ========== PROCESSING JOB ${jobId} ==========`);
    console.log(`[JOB-PROCESS] Job config:`, JSON.stringify(config));
    console.log(`[JOB-PROCESS] Job type: ${jobType}`);
    console.log(`[JOB-PROCESS] Job status: ${job.status}`);
    console.log(`[JOB-PROCESS] Current progress: ${job.processedItems}/${job.totalItems}`);
    console.log(`[JOB-PROCESS] Current matches: ${job.matchesFound}`);

    // V5.6: IDEMPOTENT RESUME LOGIC
    // Query only truly unmatched items (those without match_candidates entries)
    // This prevents reprocessing already-matched items after a "Silent Kill"
    const chunkSize = getChunkSize(jobType);
    
    console.log(`[JOB-PROCESS-V5.6] Querying unmatched items (idempotent resume)...`);
    
    // Direct query: fetch only items that don't have match_candidates
    const chunk = await prisma.storeItem.findMany({
      where: {
        projectId: job.projectId,
        // Exclude items that already have matches
        NOT: {
          matchCandidates: {
            some: {}
          }
        }
      },
      orderBy: { partNumber: 'asc' },
      take: chunkSize, // Take only the chunk size we need
    });
    
    // Get total count of remaining unmatched items for progress tracking
    const totalUnmatchedCount = await prisma.storeItem.count({
      where: {
        projectId: job.projectId,
        NOT: {
          matchCandidates: {
            some: {}
          }
        }
      }
    });

    console.log(`[JOB-PROCESS-V5.6] Total unmatched items remaining: ${totalUnmatchedCount}`);
    console.log(`[JOB-PROCESS-V5.6] Chunk size for ${jobType}: ${chunkSize}`);
    console.log(`[JOB-PROCESS-V5.6] Processing ${chunk.length} items (idempotent - never restarts from 0)`);

    if (chunk.length === 0) {
      // Job is complete - use queue manager to mark complete
      const finalMatchesFound = job.matchesFound || 0;
      const totalItems = job.totalItems || 0;
      const finalMatchRate = totalItems > 0 ? (finalMatchesFound / totalItems) * 100 : 0;

      await markJobCompleted(jobId, finalMatchesFound, finalMatchRate);

      // Update matchingProgress based on job type
      const progressUpdate: any = {};
      if (jobType === 'exact') {
        progressUpdate.standardCompleted = true;
        progressUpdate.standardProcessed = job.totalItems || 0;
        progressUpdate.standardTotalItems = job.totalItems || 0;
        progressUpdate.standardLastRun = new Date();
        progressUpdate.currentStage = 'FUZZY'; // Move to next stage
      } else if (jobType === 'fuzzy') {
        progressUpdate.standardCompleted = true;
        progressUpdate.standardProcessed = job.totalItems || 0;
        progressUpdate.standardTotalItems = job.totalItems || 0;
        progressUpdate.standardLastRun = new Date();
        progressUpdate.currentStage = 'AI'; // Move to next stage
      } else if (jobType === 'ai') {
        progressUpdate.aiCompleted = true;
        progressUpdate.aiProcessed = job.totalItems || 0;
        progressUpdate.aiTotalItems = job.totalItems || 0;
        progressUpdate.aiLastRun = new Date();
        progressUpdate.currentStage = 'WEB_SEARCH'; // Move to next stage
      } else if (jobType === 'web-search') {
        progressUpdate.webSearchCompleted = true;
        progressUpdate.webSearchProcessed = job.totalItems || 0;
        progressUpdate.webSearchTotalItems = job.totalItems || 0;
        progressUpdate.webSearchLastRun = new Date();
        progressUpdate.currentStage = 'REVIEW'; // Move to final stage
      }

      await prisma.matchingProgress.upsert({
        where: { projectId: job.projectId },
        create: {
          projectId: job.projectId,
          currentStage: progressUpdate.currentStage || 'STANDARD',
          ...progressUpdate,
        },
        update: progressUpdate,
      });

      console.log(`[JOB-PROCESS] Job ${jobId} completed, progress updated`);

      return NextResponse.json({
        success: true,
        job: {
          id: job.id,
          status: 'completed',
          processedItems: job.totalItems || 0,
          totalItems: job.totalItems || 0,
          matchesFound: job.matchesFound,
        },
        message: 'Job completed',
      });
    }

    // Get supplier items for matching
    const supplierItems = await prisma.supplierItem.findMany({
      where: { projectId: job.projectId },
    });

    // Check for cancellation before processing chunk
    if (await isJobCancelled(jobId)) {
      const cancelType = await getJobCancellationType(jobId);
      console.log(`[JOB-CANCEL] Job ${jobId} cancelled during processing (${cancelType})`);

      await markJobCancelled(
        jobId,
        cancelType === 'IMMEDIATE'
          ? 'Job cancelled immediately by user'
          : 'Job cancelled gracefully after current stage'
      );

      return NextResponse.json({
        success: true,
        job: {
          id: jobId,
          status: 'cancelled',
          message: 'Job was cancelled',
        },
      });
    }

    let newMatches = 0;

    // Process chunk based on job type
    console.log(`[JOB-PROCESS] Starting ${jobType} processing for ${chunk.length} items...`);
    console.log(`[JOB-PROCESS] Supplier catalog size: ${supplierItems.length} items`);
    const processingStartTime = Date.now();
    
    // Set timeout protection (Vercel has 300s limit, we'll use 240s to be safe)
    const TIMEOUT_MS = 240000; // 4 minutes
    
    if (jobType === 'exact') {
      // V3.0: Single-pass processing (no chunking)
      // Check if this is the first chunk - only run once
      if (job.processedItems === 0) {
        console.log(`[JOB-PROCESS-V3.0] Running single-pass exact matching for entire dataset`);
        newMatches = await processExactMatching(chunk, supplierItems, job.projectId);
        const processingTime = Date.now() - processingStartTime;
        console.log(`[JOB-PROCESS-V3.0] Exact matching complete in ${processingTime}ms, found ${newMatches} matches`);
        
        // Mark job as complete immediately
        const totalItems = job.totalItems || 0;
        await prisma.matchingJob.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            completedAt: new Date(),
            processedItems: totalItems,
            progressPercentage: 100,
            matchesFound: newMatches,
            matchRate: totalItems > 0 ? (newMatches / totalItems) * 100 : 0,
          },
        });
        
        console.log(`[JOB-PROCESS-V3.0] Job marked as complete`);
        
        return NextResponse.json({
          success: true,
          complete: true,
          job: {
            id: job.id,
            status: 'completed',
            processedItems: totalItems,
            totalItems: totalItems,
            progressPercentage: 100,
            matchesFound: newMatches,
            matchRate: totalItems > 0 ? (newMatches / totalItems) * 100 : 0,
          },
        });
      } else {
        console.log(`[JOB-PROCESS-V3.0] Skipping - exact matching already completed in first pass`);
        newMatches = 0;
      }
    } else if (jobType === 'fuzzy') {
      // V1.2: Batch processing - fuzzy matcher controls job status
      console.log(`[JOB-PROCESS-V1.2] Running fuzzy matching batch`);
      const { processFuzzyMatching } = await import('./processFuzzyMatching-v1');
      newMatches = await processFuzzyMatching(chunk, supplierItems, job.projectId);
      const processingTime = Date.now() - processingStartTime;
      console.log(`[JOB-PROCESS-V1.2] Fuzzy matching batch complete in ${processingTime}ms, found ${newMatches} matches`);
      
      // Check final job status (fuzzy matcher sets it to 'pending' or 'complete')
      const updatedJob = await prisma.matchingJob.findUnique({
        where: { id: jobId }
      });
      
      if (updatedJob?.status === 'pending') {
        console.log(`[JOB-PROCESS-V1.2] More items to process - job stays pending for next cron`);
        return NextResponse.json({
          success: true,
          complete: false,
          job: {
            id: updatedJob.id,
            status: 'pending',
            processedItems: updatedJob.processedItems,
            totalItems: updatedJob.totalItems,
            matchesFound: updatedJob.matchesFound,
          },
        });
      } else if (updatedJob?.status === 'complete') {
        console.log(`[JOB-PROCESS-V1.2] All items processed - job complete`);
        return NextResponse.json({
          success: true,
          complete: true,
          job: {
            id: updatedJob.id,
            status: 'complete',
            processedItems: updatedJob.processedItems,
            totalItems: updatedJob.totalItems,
            matchesFound: updatedJob.matchesFound,
          },
        });
      }
    } else if (jobType === 'ai') {
      console.log(`[JOB-PROCESS-AI] Running AI matching batch`);
      const result = await processAIMatching(job, job.projectId);
      const processingTime = Date.now() - processingStartTime;
      console.log(`[JOB-PROCESS-AI] AI matching batch complete in ${processingTime}ms, found ${result.matchesFound} matches`);
      
      // Check final job status
      const updatedJob = await prisma.matchingJob.findUnique({
        where: { id: jobId }
      });
      
      if (updatedJob?.status === 'pending') {
        console.log(`[JOB-PROCESS-AI] More items to process - job stays pending`);
        return NextResponse.json({
          success: true,
          complete: false,
          job: {
            id: updatedJob.id,
            status: 'pending',
            processedItems: updatedJob.processedItems,
            totalItems: updatedJob.totalItems,
            matchesFound: updatedJob.matchesFound,
          },
        });
      } else if (updatedJob?.status === 'complete') {
        console.log(`[JOB-PROCESS-AI] All items processed - job complete`);
        return NextResponse.json({
          success: true,
          complete: true,
          job: {
            id: updatedJob.id,
            status: 'complete',
            processedItems: updatedJob.processedItems,
            totalItems: updatedJob.totalItems,
            matchesFound: updatedJob.matchesFound,
          },
        });
      }
    } else if (jobType === 'web-search') {
      console.log(`[JOB-PROCESS-WEB] Running web search matching batch`);
      const result = await processWebSearchMatching(job, job.projectId);
      const processingTime = Date.now() - processingStartTime;
      console.log(`[JOB-PROCESS-WEB] Web search batch complete in ${processingTime}ms, found ${result.matchesFound} matches`);
      
      // Check final job status
      const updatedJob = await prisma.matchingJob.findUnique({
        where: { id: jobId }
      });
      
      if (updatedJob?.status === 'pending') {
        console.log(`[JOB-PROCESS-WEB] More items to process - job stays pending`);
        return NextResponse.json({
          success: true,
          complete: false,
          job: {
            id: updatedJob.id,
            status: 'pending',
            processedItems: updatedJob.processedItems,
            totalItems: updatedJob.totalItems,
            matchesFound: updatedJob.matchesFound,
          },
        });
      } else if (updatedJob?.status === 'complete') {
        console.log(`[JOB-PROCESS-WEB] All items processed - job complete`);
        return NextResponse.json({
          success: true,
          complete: true,
          job: {
            id: updatedJob.id,
            status: 'complete',
            processedItems: updatedJob.processedItems,
            totalItems: updatedJob.totalItems,
            matchesFound: updatedJob.matchesFound,
          },
        });
      }
    } else if (jobType === 'ai-fuzzy') {
      console.log(`[JOB-PROCESS-AI-FUZZY] Running AI-enhanced fuzzy matching batch`);
      const result = await processAIFuzzyMatching(job, job.projectId);
      const processingTime = Date.now() - processingStartTime;
      console.log(`[JOB-PROCESS-AI-FUZZY] Batch complete in ${processingTime}ms, found ${result.matchesFound} matches`);
      
      const updatedJob = await prisma.matchingJob.findUnique({ where: { id: jobId } });
      if (updatedJob?.status === 'pending') {
        return NextResponse.json({ success: true, complete: false, job: updatedJob });
      } else if (updatedJob?.status === 'complete') {
        return NextResponse.json({ success: true, complete: true, job: updatedJob });
      }
    } else if (jobType === 'supersession') {
      console.log(`[JOB-PROCESS-SUPERSESSION] Running supersession matching batch`);
      const result = await processSupersessionMatching(job, job.projectId);
      const processingTime = Date.now() - processingStartTime;
      console.log(`[JOB-PROCESS-SUPERSESSION] Batch complete in ${processingTime}ms, found ${result.matchesFound} matches`);
      
      const updatedJob = await prisma.matchingJob.findUnique({ where: { id: jobId } });
      if (updatedJob?.status === 'pending') {
        return NextResponse.json({ success: true, complete: false, job: updatedJob });
      } else if (updatedJob?.status === 'complete') {
        return NextResponse.json({ success: true, complete: true, job: updatedJob });
      }
    } else if (jobType === 'human-review') {
      console.log(`[JOB-PROCESS-REVIEW] Running human review classification batch`);
      const result = await processHumanReview(job, job.projectId);
      const processingTime = Date.now() - processingStartTime;
      console.log(`[JOB-PROCESS-REVIEW] Batch complete in ${processingTime}ms, classified ${result.itemsClassified} items`);
      
      const updatedJob = await prisma.matchingJob.findUnique({ where: { id: jobId } });
      if (updatedJob?.status === 'pending') {
        return NextResponse.json({ success: true, complete: false, job: updatedJob });
      } else if (updatedJob?.status === 'complete') {
        return NextResponse.json({ success: true, complete: true, job: updatedJob });
      }
    } else {
      console.error(`[JOB-PROCESS] Unknown job type: ${jobType}`);
      throw new Error(`Unknown job type: ${jobType}`);
    }

    // V5.6: Update job progress using actual processed count
    // V10.0: Cap processedItems to totalItems to prevent infinite counter bug
    const rawProcessedItems = job.processedItems + chunk.length;
    const newProcessedItems = Math.min(rawProcessedItems, job.totalItems || rawProcessedItems);
    const totalItems = job.totalItems || 0;
    const progressPercentage = totalItems > 0 ? (newProcessedItems / totalItems) * 100 : 0;
    const newMatchesFound = job.matchesFound + newMatches;
    const matchRate = newProcessedItems > 0 ? (newMatchesFound / newProcessedItems) * 100 : 0;

    // Estimate completion time based on remaining unmatched items
    const elapsedMs = Date.now() - (job.startedAt?.getTime() || Date.now());
    const itemsPerMs = newProcessedItems / elapsedMs;
    const remainingItems = totalUnmatchedCount - chunk.length; // Use actual remaining count
    const estimatedRemainingMs = remainingItems > 0 ? remainingItems / itemsPerMs : 0;
    const estimatedCompletion = new Date(Date.now() + estimatedRemainingMs);

    await prisma.matchingJob.update({
      where: { id: jobId },
      data: {
        processedItems: newProcessedItems,
        progressPercentage,
        matchesFound: newMatchesFound,
        matchRate,
        estimatedCompletion,
      },
    });

    console.log(`[JOB-PROCESS] Chunk complete. Progress: ${newProcessedItems}/${totalItems} (${progressPercentage.toFixed(1)}%)`);
    console.log(`[JOB-PROCESS] New matches: ${newMatches}, Total matches: ${newMatchesFound}`);

    // Check for cancellation after processing chunk (graceful cancellation)
    if (await isJobCancelled(jobId)) {
      const cancelType = await getJobCancellationType(jobId);
      console.log(`[JOB-CANCEL] Job ${jobId} cancelled after completing chunk (${cancelType})`);

      await markJobCancelled(
        jobId,
        'Job cancelled after completing current batch'
      );

      return NextResponse.json({
        success: true,
        job: {
          id: jobId,
          status: 'cancelled',
          processedItems: newProcessedItems,
          totalItems: totalItems,
          matchesFound: newMatchesFound,
          message: 'Job cancelled after completing batch',
        },
      });
    }

    // V9.2: SELF-DRIVING FIRE-AND-FORGET RECURSION
    // V10.0: Add safety check to prevent infinite loop
    const hasMoreWork = totalUnmatchedCount > chunk.length && newProcessedItems < totalItems;
    if (hasMoreWork && job.status !== 'failed') {
      console.log(`[JOB-PROCESS-V9.2] ${totalUnmatchedCount - chunk.length} items remaining. Triggering next batch...`);
      triggerNextBatch(req, jobId);
    } else {
      console.log(`[JOB-PROCESS-V9.2] No more unmatched items or all items processed (${newProcessedItems}/${totalItems}). Job will complete on next check.`);
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        status: 'processing',
        processedItems: newProcessedItems,
        totalItems: totalItems,
        progressPercentage,
        matchesFound: newMatchesFound,
        matchRate,
        estimatedCompletion,
      },
      message: `Processed ${chunk.length} items, ${newMatches} new matches`,
      hasMoreWork,
      remainingItems: totalUnmatchedCount - chunk.length,
    });

  } catch (error: any) {
    console.error('[JOB-PROCESS] Error:', error);
    console.error('[JOB-PROCESS] Error stack:', error.stack);

    // Check if it's a timeout error
    const isTimeout = error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT');
    const errorMessage = isTimeout
      ? 'Processing timeout - reduce chunk size or supplier catalog'
      : error.message;

    // Use queue manager to mark job as failed (will trigger next queued job)
    try {
      const job = await prisma.matchingJob.findUnique({ where: { id: params.id } });
      await markJobFailed(params.id, errorMessage);
      console.error(`[JOB-PROCESS] Job ${params.id} marked as failed. Progress preserved: ${job?.processedItems}/${job?.totalItems}`);
    } catch (updateError) {
      console.error('[JOB-PROCESS] Failed to update job status:', updateError);
    }

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        isTimeout,
        message: errorMessage
      },
      { status: 500 }
    );
  }
}

// processExactMatching now imported from processExactMatching-v2.ts
// This uses the fixed postgres-exact-matcher-v2.ts with line code constraint removed

/**
 * Apply cost-based validation (Rule 5: UOM Mismatch Detection)
 * Adjusts confidence based on cost ratio between store and supplier items
 */
async function applyCostValidation(
  matches: any[],
  storeItems: any[],
  projectId: string
): Promise<any[]> {
  // Build lookup maps for store and supplier costs
  const storeItemMap = new Map(storeItems.map(item => [item.id, item]));
  
  // Fetch supplier items with costs
  const supplierIds = matches.map(m => m.supplierItemId);
  const supplierItems = await prisma.supplierItem.findMany({
    where: {
      id: { in: supplierIds }
    },
    select: {
      id: true,
      currentCost: true,
      partNumber: true
    }
  });
  const supplierItemMap = new Map(supplierItems.map(item => [item.id, item]));
  
  let penaltyCount = 0;
  let boostCount = 0;
  let noDataCount = 0;
  
  const validatedMatches = matches.map(match => {
    const storeItem = storeItemMap.get(match.storeItemId);
    const supplierItem = supplierItemMap.get(match.supplierItemId);
    
    // Cost fallback: use available cost field (only currentCost is selected)
    const storeCostRaw = storeItem?.cost;
    const supplierCostRaw = supplierItem?.currentCost;
    
    if (!storeCostRaw || !supplierCostRaw) {
      noDataCount++;
      return match; // No cost data available, keep original confidence
    }
    
    const storeCost = parseFloat(storeCostRaw.toString());
    const supplierCost = parseFloat(supplierCostRaw.toString());
    
    // Skip if costs are invalid
    if (storeCost <= 0 || supplierCost <= 0 || isNaN(storeCost) || isNaN(supplierCost)) {
      noDataCount++;
      return match;
    }
    const maxCost = Math.max(storeCost, supplierCost);
    const minCost = Math.min(storeCost, supplierCost);
    const ratio = maxCost / minCost;
    
    let adjustedConfidence = match.confidence;
    
    // Penalty: Ratio > 5.0 suggests UOM mismatch (e.g., $50 vs $10)
    if (ratio > 5.0) {
      adjustedConfidence = match.confidence * 0.5;
      penaltyCount++;
      console.log(`[COST-CHECK] UOM Mismatch: Store ${match.storePartNumber} ($${storeCost.toFixed(2)}) vs Supplier ${match.supplierPartNumber} ($${supplierCost.toFixed(2)}) - Ratio: ${ratio.toFixed(2)}x - Confidence: ${match.confidence.toFixed(2)} -> ${adjustedConfidence.toFixed(2)}`);
    }
    // Boost: Ratio < 1.05 (within 5%) suggests same UOM
    else if (ratio < 1.05) {
      adjustedConfidence = Math.min(1.0, match.confidence + 0.05);
      boostCount++;
    }
    
    return {
      ...match,
      confidence: adjustedConfidence,
      originalConfidence: match.confidence,
      costRatio: ratio
    };
  });
  
  console.log(`[COST-CHECK] Validated ${matches.length} matches: ${penaltyCount} penalties, ${boostCount} boosts, ${noDataCount} no-data`);
  
  return validatedMatches;
}

/**
 * Helper function to save matches to database
 */
async function saveMatches(
  matches: any[],
  projectId: string,
  matchType: 'INTERCHANGE' | 'EXACT'
): Promise<number> {
  const { MatchMethod, MatchStatus } = await import('@prisma/client');
  let savedCount = 0;
  
  // V9.7: Deduplicate matches before saving to prevent duplicate key errors
  const uniqueMatches = new Map<string, any>();
  for (const match of matches) {
    const key = `${match.storeItemId}:${match.supplierItemId}`;
    if (!uniqueMatches.has(key)) {
      uniqueMatches.set(key, match);
    }
  }
  const deduplicatedMatches = Array.from(uniqueMatches.values());
  
  if (deduplicatedMatches.length < matches.length) {
    console.log(`[V9.7-DEDUP] Removed ${matches.length - deduplicatedMatches.length} duplicate matches`);
  }
  
  for (let i = 0; i < deduplicatedMatches.length; i += 100) {
    const batch = deduplicatedMatches.slice(i, i + 100);
    
    try {
      const dataToInsert = batch.map((match: any) => ({
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
      console.error(`[EXACT-MATCH-V4.0] ERROR: Failed to save ${matchType} batch`);
      console.error(`[EXACT-MATCH-V4.0] Error details:`, error);
      console.error(`[EXACT-MATCH-V4.0] Sample data:`, JSON.stringify(batch[0], null, 2));
      throw error;
    }
  }
  
  return savedCount;
}

/**
 * Process a chunk of items using fuzzy matching
 */
async function processFuzzyChunk(
  storeItems: any[],
  supplierItems: any[],
  projectId: string
): Promise<number> {
  // Import fuzzy matching logic from matching engine
  const { stage2FuzzyMatching } = await import('@/app/lib/matching-engine');
  
  // Convert to engine format
  const engineStoreItems = storeItems.map((item) => ({
    id: item.id,
    partNumber: item.partNumber,
    partNumberNorm: item.partNumberNorm,
    canonicalPartNumber: (item as any).canonicalPartNumber || null,
    lineCode: item.lineCode,
    mfrPartNumber: item.mfrPartNumber,
    description: item.description,
    currentCost: item.currentCost ? Number(item.currentCost) : null,
  }));

  const engineSupplierItems = supplierItems.map((item) => ({
    id: item.id,
    partNumber: item.partNumber,
    partNumberNorm: item.partNumberNorm,
    canonicalPartNumber: (item as any).canonicalPartNumber || null,
    lineCode: item.lineCode,
    mfrPartNumber: item.mfrPartNumber,
    description: item.description,
    currentCost: item.currentCost ? Number(item.currentCost) : null,
  }));

  // Get already matched IDs
  const existingMatches = await prisma.matchCandidate.findMany({
    where: { projectId },
    select: { storeItemId: true },
  });
  const matchedStoreIds = new Set(existingMatches.map(m => m.storeItemId));

  // Run fuzzy matching
  const fuzzyResult = stage2FuzzyMatching(engineStoreItems, engineSupplierItems, matchedStoreIds, {
    fuzzyThreshold: 0.65,
    maxCandidatesPerItem: 800,
    costTolerancePercent: 10,
  });

  // Save matches to database
  const fuzzyMatches = fuzzyResult.matches;
  let savedCount = 0;

  // Save in batches of 100 to avoid transaction limits
  for (let i = 0; i < fuzzyMatches.length; i += 100) {
    const batch = fuzzyMatches.slice(i, i + 100);
    
    await prisma.matchCandidate.createMany({
      data: batch.map((match) => ({
        projectId,
        storeItemId: match.storeItemId,
        targetType: 'SUPPLIER' as const,
        targetId: match.supplierItemId,
        method: match.method as any,
        confidence: match.confidence,
        matchStage: match.matchStage,
        status: 'PENDING' as const,
        features: match.features || {},
        costDifference: match.costDifference,
        costSimilarity: match.costSimilarity,
        transformationSignature: match.transformationSignature,
        rulesApplied: match.rulesApplied,
      })),
      skipDuplicates: true,
    });
    
    savedCount += batch.length;
  }

  console.log(`[FUZZY-JOB] Processed ${storeItems.length} items, found ${fuzzyMatches.length} matches, saved ${savedCount}`);
  return savedCount;
}

// AI and Web Search processing moved to processors.ts
