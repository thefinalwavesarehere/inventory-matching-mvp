/**
 * Fuzzy Matching API
 * POST /api/match/fuzzy - Run fuzzy matching for unmatched items
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import prisma from '@/app/lib/db/prisma';
import { stage2FuzzyMatching } from '@/app/lib/matching-engine';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
  return withAuth(req, async (context) => {
    try {
    // Require authentication

    const body = await req.json();
    const { projectId, batchOffset = 0, batchSize = 3000 } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      );
    }

    apiLogger.info(`[FUZZY-MATCH] Starting fuzzy matching for project: ${projectId}`);
    apiLogger.info(`[FUZZY-MATCH] Batch: offset=${batchOffset}, size=${batchSize}`);

    // Get already matched store item IDs
    const existingMatches = await prisma.matchCandidate.findMany({
      where: { projectId },
      select: { storeItemId: true },
    });
    const matchedIds = new Set(existingMatches.map((m) => m.storeItemId));

    apiLogger.info(`[FUZZY-MATCH] Found ${existingMatches.length} total match records for ${matchedIds.size} unique store items`);
    if (existingMatches.length > matchedIds.size) {
      apiLogger.info(`[FUZZY-MATCH] Note: ${existingMatches.length - matchedIds.size} store items have multiple matches`);
    }

    // Get all unmatched store items
    const allUnmatchedItems = await prisma.storeItem.findMany({
      where: {
        projectId,
        id: { notIn: Array.from(matchedIds) },
      },
      orderBy: { id: 'asc' },
    });

    apiLogger.info(`[FUZZY-MATCH] Total unmatched items: ${allUnmatchedItems.length}`);

    // Get batch of items to process
    const unmatchedItems = allUnmatchedItems.slice(batchOffset, batchOffset + batchSize);
    
    if (unmatchedItems.length === 0) {
      apiLogger.info('[FUZZY-MATCH] No more items to process');
      return NextResponse.json({
        success: true,
        message: 'No more items to process',
        processed: 0,
        matches: 0,
        totalUnmatched: allUnmatchedItems.length,
        hasMore: false,
      });
    }

    apiLogger.info(`[FUZZY-MATCH] Processing ${unmatchedItems.length} items (offset ${batchOffset})`);

    // Get all supplier items
    const supplierItems = await prisma.supplierItem.findMany({
      where: { projectId },
    });

    apiLogger.info(`[FUZZY-MATCH] Loaded ${supplierItems.length} supplier items`);

    // Convert Decimal to number for matching engine compatibility
    const unmatchedItemsConverted = unmatchedItems.map(item => ({
      ...item,
      currentCost: item.currentCost ? Number(item.currentCost) : null,
    }));

    const supplierItemsConverted = supplierItems.map(item => ({
      ...item,
      currentCost: item.currentCost ? Number(item.currentCost) : null,
    }));

    // Run fuzzy matching on this batch
    const { matches, metrics } = stage2FuzzyMatching(
      unmatchedItemsConverted as any,
      supplierItemsConverted as any,
      matchedIds,
      {
        fuzzyThreshold: 0.65,
        maxCandidatesPerItem: 1000,
      }
    );

    apiLogger.info(`[FUZZY-MATCH] Found ${matches.length} fuzzy matches`);

    // Save matches incrementally (every 100 matches to avoid memory issues)
    let savedCount = 0;
    const SAVE_BATCH_SIZE = 100;
    
    for (let i = 0; i < matches.length; i += SAVE_BATCH_SIZE) {
      const batch = matches.slice(i, i + SAVE_BATCH_SIZE);
      
      // Build properly typed records for database insertion
      const validMatches = batch
        .filter(m => 
          m.storeItemId && 
          m.supplierItemId && 
          m.method &&
          m.confidence !== undefined &&
          m.confidence !== null
        )
        .map(m => {
          const record: any = {
            projectId,
            storeItemId: m.storeItemId,
            targetId: m.supplierItemId,
            targetType: 'SUPPLIER',
            method: m.method as any,
            confidence: m.confidence,
            matchStage: m.matchStage,
            status: 'PENDING',
            features: m.features || {},
          };
          
          // Only add optional fields if they have defined values
          if (m.costDifference !== undefined && m.costDifference !== null) {
            record.costDifference = m.costDifference;
          }
          if (m.costSimilarity !== undefined && m.costSimilarity !== null) {
            record.costSimilarity = m.costSimilarity;
          }
          if (m.transformationSignature !== undefined && m.transformationSignature !== null) {
            record.transformationSignature = m.transformationSignature;
          }
          if (m.rulesApplied && m.rulesApplied.length > 0) {
            record.rulesApplied = m.rulesApplied;
          }
          
          return record;
        });

      if (validMatches.length > 0) {
        await prisma.matchCandidate.createMany({
          data: validMatches,
          skipDuplicates: true,
        });
        savedCount += validMatches.length;
        apiLogger.info(`[FUZZY-MATCH] Saved batch ${Math.floor(i / SAVE_BATCH_SIZE) + 1}: ${validMatches.length} matches (total: ${savedCount})`);
      }
    }

    const hasMore = (batchOffset + batchSize) < allUnmatchedItems.length;
    const nextOffset = hasMore ? batchOffset + batchSize : null;

    apiLogger.info(`[FUZZY-MATCH] Complete: processed=${unmatchedItems.length}, saved=${savedCount}, hasMore=${hasMore}`);

    return NextResponse.json({
      success: true,
      processed: unmatchedItems.length,
      matches: savedCount,
      totalUnmatched: allUnmatchedItems.length,
      hasMore,
      nextOffset,
      metrics: {
        processingTimeMs: metrics.processingTimeMs,
        itemsProcessed: metrics.itemsProcessed,
        matchesFound: metrics.matchesFound,
      },
    });

  
  } catch (error: any) {
    apiLogger.error({ error: error.message }, 'Handler error');
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
  });
}
