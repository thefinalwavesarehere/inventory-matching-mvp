/**
 * Matching API
 * 
 * GET  /api/match?projectId=xxx - Get match candidates for project
 * POST /api/match - Run matching algorithm
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveVendorActionsBatch } from '@/app/lib/vendor-action-resolver';
import { resolveInterchangesBatch } from '@/app/lib/interchange-resolver';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';
import {
  stage2FuzzyMatching,
  StoreItem as EngineStoreItem,
  SupplierItem as EngineSupplierItem,
} from '@/app/lib/matching-engine';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      );
    }

    // Get match candidates
    const whereClause: any = { projectId };
    if (status && status !== 'all') {
      whereClause.status = status.toUpperCase();
    }

    const matches = await prisma.matchCandidate.findMany({
      where: whereClause,
      include: {
        storeItem: true,
      },
      orderBy: { confidence: 'desc' },
    });

    // Fetch target items (supplier or inventory)
    const matchesWithTargets = await Promise.all(
      matches.map(async (m) => {
        let targetItem = null;
        if (m.targetType === 'SUPPLIER') {
          targetItem = await prisma.supplierItem.findUnique({
            where: { id: m.targetId },
          });
        } else if (m.targetType === 'INVENTORY') {
          targetItem = await prisma.inventoryItem.findUnique({
            where: { id: m.targetId },
          });
        }

        return {
          id: m.id,
          storeItem: m.storeItem,
          targetItem,
          targetType: m.targetType,
          method: m.method,
          confidence: m.confidence,
          features: m.features,
          status: m.status,
        };
      })
    );

    return NextResponse.json({
      success: true,
      matches: matchesWithTargets,
    });
  } catch (error) {
    console.error('Error fetching matches:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch matches' },
      { status: 500 }
    );
  }
}

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
    const { projectId, batchOffset = 0, batchSize = 5000 } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      );
    }

    console.log(`[MATCH] Starting matching for project: ${projectId}`);
    
    // Get all store and supplier items
    const storeItems = await prisma.storeItem.findMany({
      where: { projectId },
    });
    console.log(`[MATCH] Found ${storeItems.length} store items`);

    const supplierItems = await prisma.supplierItem.findMany({
      where: { projectId },
    });
    console.log(`[MATCH] Found ${supplierItems.length} supplier items`);

    const interchanges = await prisma.interchange.findMany({
      where: { projectId },
    });
    console.log(`[MATCH] Found ${interchanges.length} interchanges`);

    // Only clear existing matches on first batch (offset = 0)
    if (batchOffset === 0) {
      console.log(`[MATCH] First batch - clearing existing matches`);
      await prisma.matchCandidate.deleteMany({
        where: { projectId },
      });
    } else {
      console.log(`[MATCH] Continuing from offset ${batchOffset}`);
    }

    const matches: any[] = [];
    let epicA4InterchangeMatches = 0;
    let interchangeMatches = 0;
    let exactMatches = 0;
    let fuzzyMatches = 0;

    // Epic A4: Deterministic Interchange Lookup (BEFORE all other stages)
    if (batchOffset === 0) {
      console.log(`[MATCH] Epic A4: Deterministic Interchange Lookup`);
      
      // Prepare store parts data for batch resolution
      const storeParts = storeItems.map(item => ({
        partNumber: item.partNumber,
        lineCode: item.lineCode,
      }));

      // Batch resolve interchanges
      const interchangeResults = await resolveInterchangesBatch(projectId, storeParts);

      // Create matches for interchange hits
      for (let i = 0; i < storeItems.length; i++) {
        const interchangeMatch = interchangeResults[i];
        if (interchangeMatch) {
          epicA4InterchangeMatches++;
          matches.push({
            projectId,
            storeItemId: storeItems[i].id,
            targetType: 'SUPPLIER',
            targetId: interchangeMatch.supplierItemId,
            method: 'INTERCHANGE',
            confidence: 1.0, // 100% confidence for interchange matches
            features: {
              reason: 'Epic A4 deterministic interchange',
              translatedLineCode: interchangeMatch.translatedLineCode,
            },
            status: 'PENDING',
            vendorAction: 'NONE', // Will be resolved later
          });
        }
      }

      console.log(`[MATCH] Epic A4 complete: ${epicA4InterchangeMatches} matches`);
    }

    // Stage 1: Known Interchange Matching (only on first batch)
    if (batchOffset === 0) {
      console.log(`[MATCH] Stage 1: Interchange Matching`);
      let matchedStoreIds = new Set(matches.map((m) => m.storeItemId));
      
      for (const storeItem of storeItems) {
      if (matchedStoreIds.has(storeItem.id)) continue; // Skip Epic A4 matched items
      const interchange = interchanges.find(
        (i) => i.oursPartNumber === storeItem.partNumber
      );
      
      if (interchange) {
        const supplierItem = supplierItems.find(
          (s) => s.partNumber === interchange.theirsPartNumber
        );
        
        if (supplierItem) {
          interchangeMatches++;
          matchedStoreIds.add(storeItem.id);
          matches.push({
            projectId,
            storeItemId: storeItem.id,
            targetType: 'SUPPLIER',
            targetId: supplierItem.id,
            method: 'INTERCHANGE',
            confidence: 1.0,
            features: { reason: 'Known interchange match' },
            status: 'PENDING',
          });
        }
      }
      }
      console.log(`[MATCH] Stage 1 complete: ${interchangeMatches} matches`);

      // Stage 2: Exact Normalized Part Number Match
      console.log(`[MATCH] Stage 2: Exact Normalized Matching`);
      // Update matchedStoreIds with current matches (already declared above)
      
      for (const storeItem of storeItems) {
      if (matchedStoreIds.has(storeItem.id)) continue;
      
      const exactMatch = supplierItems.find(
        (s) => s.partNumberNorm === storeItem.partNumberNorm
      );
      
      if (exactMatch) {
        exactMatches++;
        matchedStoreIds.add(storeItem.id);
        matches.push({
          projectId,
          storeItemId: storeItem.id,
          targetType: 'SUPPLIER',
          targetId: exactMatch.id,
          method: 'EXACT_NORM',
          confidence: 0.95,
          features: { reason: 'Exact normalized part number match' },
          status: 'PENDING',
        });
      }
      }
      console.log(`[MATCH] Stage 2 complete: ${exactMatches} matches`);
    } else {
      // For subsequent batches, get already matched store IDs from database
      console.log(`[MATCH] Skipping Stage 1 & 2 (not first batch)`);
    }

    // Stage 3: Fuzzy Matching (for remaining unmatched items)
    console.log(`[MATCH] Stage 3: Fuzzy Matching (Batch Processing)`);

    // Get already matched store IDs from database (for all batches)
    const existingMatches = await prisma.matchCandidate.findMany({
      where: { projectId },
      select: { storeItemId: true },
    });
    const matchedStoreIds = new Set(existingMatches.map(m => m.storeItemId));

    for (const match of matches) {
      matchedStoreIds.add(match.storeItemId);
    }

    const unmatchedStoreItems = storeItems.filter((s) => !matchedStoreIds.has(s.id));
    console.log(`[MATCH] Total unmatched items: ${unmatchedStoreItems.length}`);
    console.log(`[MATCH] Batch offset: ${batchOffset}, Batch size: ${batchSize}`);

    // BATCH PROCESSING: Process only a slice of unmatched items
    const itemsToMatch = unmatchedStoreItems.slice(batchOffset, batchOffset + batchSize);
    const remainingAfterBatch = unmatchedStoreItems.length - (batchOffset + itemsToMatch.length);

    console.log(`[MATCH] Processing items ${batchOffset} to ${batchOffset + itemsToMatch.length} of ${unmatchedStoreItems.length}`);
    console.log(`[MATCH] Items in this batch: ${itemsToMatch.length}`);
    console.log(`[MATCH] Remaining after batch: ${remainingAfterBatch}`);
    console.log(`[MATCH] Supplier catalog size: ${supplierItems.length} items`);

    const engineStoreItems: EngineStoreItem[] = itemsToMatch.map((item) => ({
      id: item.id,
      partNumber: item.partNumber,
      partNumberNorm: item.partNumberNorm,
      canonicalPartNumber: (item as any).canonicalPartNumber || null,
      lineCode: item.lineCode,
      mfrPartNumber: item.mfrPartNumber,
      description: item.description,
      currentCost: item.currentCost ? Number(item.currentCost) : null,
    }));

    const engineSupplierItems: EngineSupplierItem[] = supplierItems.map((item) => ({
      id: item.id,
      partNumber: item.partNumber,
      partNumberNorm: item.partNumberNorm,
      canonicalPartNumber: (item as any).canonicalPartNumber || null,
      lineCode: item.lineCode,
      mfrPartNumber: item.mfrPartNumber,
      description: item.description,
      currentCost: item.currentCost ? Number(item.currentCost) : null,
    }));

    const fuzzyResult = stage2FuzzyMatching(engineStoreItems, engineSupplierItems, matchedStoreIds, {
      fuzzyThreshold: 0.65,
      maxCandidatesPerItem: 800,
      maxTopMatches: 3,
    });

    fuzzyMatches += fuzzyResult.matches.length;

    matches.push(
      ...fuzzyResult.matches.map((m) => ({
        projectId,
        storeItemId: m.storeItemId,
        targetType: 'SUPPLIER',
        targetId: m.supplierItemId,
        method: m.method,
        confidence: m.confidence,
        matchStage: m.matchStage,
        features: m.features,
        status: 'PENDING',
      }))
    );

    console.log(`[MATCH] Stage 3 complete: ${fuzzyResult.matches.length} matches in batch, ${(fuzzyResult.metrics.matchRate * 100).toFixed(1)}% match rate`);

    // Save all matches
    console.log(`[MATCH] Total matches: ${matches.length}`);
    console.log(`[MATCH] Breakdown: Interchange=${interchangeMatches}, Exact=${exactMatches}, Fuzzy=${fuzzyMatches}`);
    
    if (matches.length > 0) {
      // Resolve vendor actions before saving
      console.log(`[MATCH] Resolving vendor actions for ${matches.length} matches...`);
      
      // Fetch all supplier items in one query for efficiency
      const targetIds = matches.map(m => m.targetId);
      const supplierItemsMap = new Map();
      
      if (targetIds.length > 0) {
        const supplierItemsData = await prisma.supplierItem.findMany({
          where: { id: { in: targetIds } },
          select: {
            id: true,
            lineCode: true,
          },
        });
        
        supplierItemsData.forEach(item => {
          supplierItemsMap.set(item.id, item);
        });
      }
      
      // Build match data for vendor action resolution
      // Note: category/subcategory fields don't exist in SupplierItem yet,
      // so we default to null (wildcards will match in rules)
      const matchDataForResolution = matches.map((match) => {
        const supplierItem = supplierItemsMap.get(match.targetId);
        return {
          supplierLineCode: supplierItem?.lineCode || null,
          category: null,
          subcategory: null,
        };
      });
      
      // Resolve vendor actions in batch
      const vendorActions = await resolveVendorActionsBatch(matchDataForResolution);
      
      // Add vendor actions to matches
      const matchesWithVendorActions = matches.map((match, index) => ({
        ...match,
        vendorAction: vendorActions[index],
      }));
      
      console.log(`[MATCH] Vendor actions resolved`);
      
      await prisma.matchCandidate.createMany({
        data: matchesWithVendorActions,
      });
      console.log(`[MATCH] Saved ${matches.length} match candidates with vendor actions`);
    }

    // Calculate batch progress
    const totalProcessed = batchOffset + itemsToMatch.length;
    const hasMore = remainingAfterBatch > 0;
    const nextOffset = hasMore ? batchOffset + batchSize : null;
    
    return NextResponse.json({
      success: true,
      message: `Created ${matches.length} match candidates in this batch`,
      matchCount: matches.length,
      breakdown: {
        interchange: interchangeMatches,
        exact: exactMatches,
        fuzzy: fuzzyMatches,
      },
      batch: {
        processed: totalProcessed,
        total: unmatchedStoreItems.length,
        remaining: remainingAfterBatch,
        hasMore,
        nextOffset,
        batchSize,
      },
    });
  } catch (error: any) {
    console.error('[MATCH] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to run matching' },
      { status: 500 }
    );
  }
}
