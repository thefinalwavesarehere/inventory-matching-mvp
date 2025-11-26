/**
 * Fuzzy Matching API
 * POST /api/match/fuzzy - Run fuzzy matching for unmatched items
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';
import { stage2FuzzyMatching } from '@/app/lib/matching-engine';

export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { projectId, batchOffset = 0, batchSize = 1000 } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      );
    }

    console.log(`[FUZZY-MATCH] Starting fuzzy matching for project: ${projectId}`);
    console.log(`[FUZZY-MATCH] Batch: offset=${batchOffset}, size=${batchSize}`);

    // Get already matched store item IDs
    const existingMatches = await prisma.matchCandidate.findMany({
      where: { projectId },
      select: { storeItemId: true },
    });
    const matchedIds = new Set(existingMatches.map((m) => m.storeItemId));

    console.log(`[FUZZY-MATCH] Found ${matchedIds.size} already matched items`);

    // Get all unmatched store items
    const allUnmatchedItems = await prisma.storeItem.findMany({
      where: {
        projectId,
        id: { notIn: Array.from(matchedIds) },
      },
      orderBy: { id: 'asc' },
    });

    console.log(`[FUZZY-MATCH] Total unmatched items: ${allUnmatchedItems.length}`);

    // Get batch of items to process
    const unmatchedItems = allUnmatchedItems.slice(batchOffset, batchOffset + batchSize);
    
    if (unmatchedItems.length === 0) {
      console.log('[FUZZY-MATCH] No more items to process');
      return NextResponse.json({
        success: true,
        message: 'No more items to process',
        processed: 0,
        matches: 0,
        totalUnmatched: allUnmatchedItems.length,
        hasMore: false,
      });
    }

    console.log(`[FUZZY-MATCH] Processing ${unmatchedItems.length} items (offset ${batchOffset})`);

    // Get all supplier items
    const supplierItems = await prisma.supplierItem.findMany({
      where: { projectId },
    });

    console.log(`[FUZZY-MATCH] Loaded ${supplierItems.length} supplier items`);

    // Run fuzzy matching on this batch
    const { matches, metrics } = stage2FuzzyMatching(
      unmatchedItems,
      supplierItems,
      matchedIds,
      {
        fuzzyThreshold: 0.65,
        maxCandidatesPerItem: 1000,
      }
    );

    console.log(`[FUZZY-MATCH] Found ${matches.length} fuzzy matches`);

    // Save matches incrementally (every 100 matches to avoid memory issues)
    let savedCount = 0;
    const SAVE_BATCH_SIZE = 100;
    
    for (let i = 0; i < matches.length; i += SAVE_BATCH_SIZE) {
      const batch = matches.slice(i, i + SAVE_BATCH_SIZE);
      
      // Filter out any undefined values
      const validMatches = batch.filter(m => 
        m.storeItemId && 
        m.supplierItemId && 
        m.projectId && 
        m.method &&
        m.confidence !== undefined &&
        m.confidence !== null
      );

      if (validMatches.length > 0) {
        await prisma.matchCandidate.createMany({
          data: validMatches,
          skipDuplicates: true,
        });
        savedCount += validMatches.length;
        console.log(`[FUZZY-MATCH] Saved batch ${Math.floor(i / SAVE_BATCH_SIZE) + 1}: ${validMatches.length} matches (total: ${savedCount})`);
      }
    }

    const hasMore = (batchOffset + batchSize) < allUnmatchedItems.length;
    const nextOffset = hasMore ? batchOffset + batchSize : null;

    console.log(`[FUZZY-MATCH] Complete: processed=${unmatchedItems.length}, saved=${savedCount}, hasMore=${hasMore}`);

    return NextResponse.json({
      success: true,
      processed: unmatchedItems.length,
      matches: savedCount,
      totalUnmatched: allUnmatchedItems.length,
      hasMore,
      nextOffset,
      metrics: {
        processingTime: metrics.processingTime,
        itemsProcessed: metrics.itemsProcessed,
        matchesFound: metrics.matchesFound,
      },
    });

  } catch (error) {
    console.error('[FUZZY-MATCH] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
