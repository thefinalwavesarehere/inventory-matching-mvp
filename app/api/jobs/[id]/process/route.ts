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
// processExactMatching is defined locally in this file

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Chunk sizes optimized for each job type
// V4.0: Reduced exact chunk size to prevent database timeouts
const CHUNK_SIZES: Record<string, number> = {
  'exact': 50,    // V4.0: Reduced from 500 to 50 to prevent connection pool exhaustion
  'fuzzy': 150,   // Fuzzy processes 150 items in ~30-60 seconds (safe for 100k+ suppliers)
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

    let newMatches = 0;

    // Process chunk based on job type
    console.log(`[JOB-PROCESS] Starting ${jobType} processing for ${chunk.length} items...`);
    console.log(`[JOB-PROCESS] Supplier catalog size: ${supplierItems.length} items`);
    const processingStartTime = Date.now();
    
    // Set timeout protection (Vercel has 300s limit, we'll use 240s to be safe)
    const TIMEOUT_MS = 240000; // 4 minutes
    
    if (jobType === 'exact') {
      console.log(`[JOB-PROCESS] Calling processExactMatching with ${chunk.length} store items and ${supplierItems.length} supplier items`);
      newMatches = await processExactMatching(chunk, supplierItems, job.projectId);
      const processingTime = Date.now() - processingStartTime;
      console.log(`[JOB-PROCESS] Exact matching complete in ${processingTime}ms, found ${newMatches} matches`);
    } else if (jobType === 'fuzzy') {
      console.log(`[JOB-PROCESS] Calling processFuzzyChunk with ${chunk.length} store items and ${supplierItems.length} supplier items`);
      newMatches = await processFuzzyChunk(chunk, supplierItems, job.projectId);
      const processingTime = Date.now() - processingStartTime;
      console.log(`[JOB-PROCESS] Fuzzy chunk complete in ${processingTime}ms, found ${newMatches} matches`);
      
      if (processingTime > TIMEOUT_MS) {
        console.warn(`[JOB-PROCESS] WARNING: Processing time (${processingTime}ms) exceeded timeout threshold (${TIMEOUT_MS}ms)`);
      }
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
    console.error('[JOB-PROCESS] Error stack:', error.stack);

    // Check if it's a timeout error
    const isTimeout = error.message?.includes('timeout') || error.message?.includes('ETIMEDOUT');
    
    // Update job status - mark as failed but preserve progress
    try {
      const job = await prisma.matchingJob.findUnique({ where: { id: params.id } });
      
      await prisma.matchingJob.update({
        where: { id: params.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
        },
      });
      
      console.error(`[JOB-PROCESS] Job ${params.id} marked as failed. Progress preserved: ${job?.processedItems}/${job?.totalItems}`);
    } catch (updateError) {
      console.error('[JOB-PROCESS] Failed to update job status:', updateError);
    }

    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        isTimeout,
        message: isTimeout ? 'Processing timeout - reduce chunk size or supplier catalog' : error.message
      },
      { status: 500 }
    );
  }
}

/**
 * Process a chunk of items using exact matching
 * Uses V3.0 Postgres Native Matcher (Part-First, Brand-Second strategy)
 */
async function processExactMatching(
  storeItems: any[],
  supplierItems: any[],
  projectId: string
): Promise<number> {
  // !!! LIVE CODE CHECK - TRACE ID !!!
  console.log("!!! LIVE CODE CHECK - TRACE ID: 2026-01-02_19:00:00_UTC - MODE: 3-CHAR PREFIX STRIP V4.1 !!!");
  
  // Import V4.1 Postgres Native Matcher (3-Character Prefix Stripping)
  const { findMatches } = await import('@/app/lib/matching/postgres-exact-matcher-v3');
  const { MatchMethod, MatchStatus } = await import('@prisma/client');
  
  console.log(`[EXACT-MATCH-V4.1] Processing ${storeItems.length} store items (batch size: 50)`);
  console.log(`[EXACT-MATCH-V4.1] Using 3-Character Prefix Stripping (Eric's Rule)`);
  
  // Extract store item IDs for batch processing
  const storeIds = storeItems.map(item => item.id);
  
  // 🚨 V4.1: PREFIX STRIPPING MATCH (Eric's 3-Character Rule)
  console.log(`[EXACT-MATCH-V4.1] === MATCHING WITH PREFIX STRIP ===`);
  let matches: any[] = [];
  if (storeIds.length > 0) {
    matches = await findMatches(projectId, storeIds);
  }
  
  console.log(`[EXACT-MATCH-V4.1] Found ${matches.length} matches using prefix stripping`);
  
  // 💰 RULE 5: Cost-Based Validation (UOM Mismatch Detection)
  console.log(`[EXACT-MATCH-V4.0] === COST VALIDATION ===`);
  matches = await applyCostValidation(matches, storeItems, projectId);
  
  // Calculate confidence distribution
  const confidenceDistribution = matches.reduce((acc, match) => {
    const bucket = match.confidence >= 1.0 ? 'perfect' :
                   match.confidence >= 0.98 ? 'high' :
                   match.confidence >= 0.90 ? 'medium' : 'low';
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log(`[EXACT-MATCH-V4.0] Confidence distribution:`, confidenceDistribution);
  
  // 📊 NEAR-MISS REPORTING: Log brand mismatches for alias mapping
  const brandMismatches = matches.filter(m => m.matchReason === 'brand_mismatch');
  const fuzzyBrandMatches = matches.filter(m => m.matchReason === 'fuzzy_brand');
  
  if (brandMismatches.length > 0) {
    console.log(`[NEAR-MISS] Found ${brandMismatches.length} part matches with brand mismatch (potential alias mappings needed):`);
    // Log first 10 examples
    brandMismatches.slice(0, 10).forEach((m, i) => {
      console.log(`[NEAR-MISS] ${i+1}. Store: ${m.storePartNumber} (${m.storeLineCode}) → Supplier: ${m.supplierPartNumber} (${m.supplierLineCode}) [Confidence: ${m.confidence.toFixed(2)}]`);
    });
    if (brandMismatches.length > 10) {
      console.log(`[NEAR-MISS] ... and ${brandMismatches.length - 10} more brand mismatches`);
    }
  }
  
  if (fuzzyBrandMatches.length > 0) {
    console.log(`[NEAR-MISS] Found ${fuzzyBrandMatches.length} fuzzy brand matches (partial string matches):`);
    fuzzyBrandMatches.slice(0, 5).forEach((m, i) => {
      console.log(`[NEAR-MISS] ${i+1}. Store: ${m.storePartNumber} (${m.storeLineCode}) ↔ Supplier: ${m.supplierPartNumber} (${m.supplierLineCode}) [Confidence: ${m.confidence.toFixed(2)}]`);
    });
  }

  // Save exact matches (interchange already saved)
  let exactSavedCount = 0;
  if (exactMatches.length > 0) {
    exactSavedCount = await saveMatches(exactMatches, projectId, 'EXACT');
    console.log(`[EXACT-MATCH-V4.0] Saved ${exactSavedCount} exact matches`);
  }
  
  const totalSavedCount = interchangeSavedCount + exactSavedCount;
  console.log(`[EXACT-MATCH-V4.0] TOTAL saved: ${totalSavedCount} matches (${interchangeSavedCount} interchange + ${exactSavedCount} exact)`);
  
  // Calculate and log match rate
  const matchRate = (totalSavedCount / storeItems.length) * 100;
  console.log(`[EXACT-MATCH-V4.0] Batch match rate: ${matchRate.toFixed(1)}% (${totalSavedCount}/${storeItems.length})`);
  
  return totalSavedCount;
}

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
  
  for (let i = 0; i < matches.length; i += 100) {
    const batch = matches.slice(i, i + 100);
    
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
