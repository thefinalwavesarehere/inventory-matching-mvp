/**
 * Job Processor API
 * POST /api/jobs/[id]/process - Process next chunk of a job
 * 
 * This endpoint processes jobs in small chunks to avoid Vercel timeouts.
 * It should be called repeatedly until the job is complete.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Chunk sizes optimized for each job type
const CHUNK_SIZES: Record<string, number> = {
  'fuzzy': 3000,  // Fuzzy processes 3000 items in ~2 minutes
  'ai': 100,      // AI processes 100 items in ~3-4 minutes
  'web-search': 20, // Web search processes 20 items in ~1-2 minutes
};

function getChunkSize(jobType: string): number {
  return CHUNK_SIZES[jobType] || 100;
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
      const session = await getServerSession(authOptions);
      
      if (!session) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
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

    // Update job status to processing if it's pending
    if (job.status === 'pending') {
      await prisma.matchingJob.update({
        where: { id: jobId },
        data: {
          status: 'processing',
          startedAt: new Date(),
        },
      });
    }

    const config = job.config as any || {};
    const jobType = config.jobType || 'ai'; // 'ai' or 'web-search'

    console.log(`[JOB-PROCESS] ========== PROCESSING JOB ${jobId} ==========`);
    console.log(`[JOB-PROCESS] Job config:`, JSON.stringify(config));
    console.log(`[JOB-PROCESS] Job type: ${jobType}`);
    console.log(`[JOB-PROCESS] Job status: ${job.status}`);
    console.log(`[JOB-PROCESS] Current progress: ${job.processedItems}/${job.totalItems}`);
    console.log(`[JOB-PROCESS] Current matches: ${job.matchesFound}`);

    // Get unmatched items
    const existingMatches = await prisma.matchCandidate.findMany({
      where: { projectId: job.projectId },
      select: { storeItemId: true },
    });
    const matchedIds = new Set(existingMatches.map((m) => m.storeItemId));

    const allUnmatchedItems = await prisma.storeItem.findMany({
      where: {
        projectId: job.projectId,
        id: { notIn: Array.from(matchedIds) },
      },
      orderBy: { partNumber: 'asc' },
    });

    // Calculate which chunk to process
    const chunkSize = getChunkSize(jobType);
    const startIdx = job.processedItems;
    const endIdx = Math.min(startIdx + chunkSize, allUnmatchedItems.length);
    const chunk = allUnmatchedItems.slice(startIdx, endIdx);

    console.log(`[JOB-PROCESS] Total unmatched items available: ${allUnmatchedItems.length}`);
    console.log(`[JOB-PROCESS] Chunk size for ${jobType}: ${chunkSize}`);
    console.log(`[JOB-PROCESS] Processing items ${startIdx} to ${endIdx} (${chunk.length} items)`);

    if (chunk.length === 0) {
      // Job is complete
      await prisma.matchingJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          processedItems: job.totalItems || 0,
          progressPercentage: 100,
        },
      });

      // Update matchingProgress based on job type
      const progressUpdate: any = {};
      if (jobType === 'fuzzy') {
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

    let newMatches = 0;

    // Process chunk based on job type
    console.log(`[JOB-PROCESS] Starting ${jobType} processing for ${chunk.length} items...`);
    const processingStartTime = Date.now();
    
    if (jobType === 'fuzzy') {
      console.log(`[JOB-PROCESS] Calling processFuzzyChunk with ${chunk.length} store items and ${supplierItems.length} supplier items`);
      newMatches = await processFuzzyChunk(chunk, supplierItems, job.projectId);
      console.log(`[JOB-PROCESS] Fuzzy chunk complete in ${Date.now() - processingStartTime}ms, found ${newMatches} matches`);
    } else if (jobType === 'ai') {
      console.log(`[JOB-PROCESS] Calling processAIMatching...`);
      const { processAIMatching } = await import('../processors');
      newMatches = await processAIMatching(chunk, supplierItems, job.projectId);
      console.log(`[JOB-PROCESS] AI chunk complete in ${Date.now() - processingStartTime}ms, found ${newMatches} matches`);
    } else if (jobType === 'web-search') {
      console.log(`[JOB-PROCESS] Calling processWebSearchMatching...`);
      const { processWebSearchMatching } = await import('../processors');
      newMatches = await processWebSearchMatching(chunk, supplierItems, job.projectId);
      console.log(`[JOB-PROCESS] Web search chunk complete in ${Date.now() - processingStartTime}ms, found ${newMatches} matches`);
    } else {
      console.error(`[JOB-PROCESS] Unknown job type: ${jobType}`);
      throw new Error(`Unknown job type: ${jobType}`);
    }

    // Update job progress
    const newProcessedItems = endIdx;
    const totalItems = job.totalItems || 0;
    const progressPercentage = totalItems > 0 ? (newProcessedItems / totalItems) * 100 : 0;
    const newMatchesFound = job.matchesFound + newMatches;
    const matchRate = newProcessedItems > 0 ? (newMatchesFound / newProcessedItems) * 100 : 0;

    // Estimate completion time
    const elapsedMs = Date.now() - (job.startedAt?.getTime() || Date.now());
    const itemsPerMs = newProcessedItems / elapsedMs;
    const remainingItems = totalItems - newProcessedItems;
    const estimatedRemainingMs = remainingItems / itemsPerMs;
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
    });

  } catch (error: any) {
    console.error('[JOB-PROCESS] Error:', error);

    // Update job status to failed
    try {
      await prisma.matchingJob.update({
        where: { id: params.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
        },
      });
    } catch (updateError) {
      console.error('[JOB-PROCESS] Failed to update job status:', updateError);
    }

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
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
