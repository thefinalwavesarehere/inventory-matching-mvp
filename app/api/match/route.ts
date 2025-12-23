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
import { prisma } from '@/app/lib/db/prisma';
import {
  stage2FuzzyMatching,
  StoreItem as EngineStoreItem,
  SupplierItem as EngineSupplierItem,
} from '@/app/lib/matching-engine';

import { findHybridExactMatches } from '@/app/lib/matching/postgres-exact-matcher-v2';
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
    const method = searchParams.get('method');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      );
    }

    // Build where clause with filters
    const whereClause: any = { projectId };
    if (status && status !== 'all') {
      whereClause.status = status.toUpperCase();
    }
    if (method && method !== 'all') {
      whereClause.method = method.toUpperCase();
    }
    
    // Add search filter if provided
    if (search && search.trim()) {
      const searchTerm = search.trim();
      whereClause.OR = [
        // Search in store item part number
        {
          storeItem: {
            partNumber: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        },
        // Search in store item description
        {
          storeItem: {
            description: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        },
        // Search in store item line code
        {
          storeItem: {
            lineCode: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    // Get total count for pagination metadata
    const totalCount = await prisma.matchCandidate.count({
      where: whereClause,
    });

    // Calculate pagination
    const skip = (page - 1) * limit;
    const totalPages = Math.ceil(totalCount / limit);

    // Get match candidates with pagination
    const matches = await prisma.matchCandidate.findMany({
      where: whereClause,
      include: {
        storeItem: true,
      },
      orderBy: { confidence: 'desc' },
      skip,
      take: limit,
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
      metadata: {
        total: totalCount,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching matches:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch matches' },
      { status: 500 }
    );
  }
}
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveVendorActionsBatch } from '@/app/lib/vendor-action-resolver';
import { resolveInterchangesBatch } from '@/app/lib/interchange-resolver';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import { prisma } from '@/app/lib/db/prisma';
import {
  stage2FuzzyMatching,
  StoreItem as EngineStoreItem,
  SupplierItem as EngineSupplierItem,
} from '@/app/lib/matching-engine';
import { findHybridExactMatches } from '@/app/lib/matching/postgres-exact-matcher-v2';

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

    console.log(`[MATCH_V2] Starting matching for project: ${projectId}`);
    console.log(`[MATCH_V2] Batch: offset=${batchOffset}, size=${batchSize}`);
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 1: Clear existing matches (only on first batch)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (batchOffset === 0) {
      console.log(`[MATCH_V2] First batch - clearing existing matches`);
      await prisma.matchCandidate.deleteMany({
        where: { projectId },
      });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 2: Get unmatched store items for current batch (MEMORY EFFICIENT)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // Get already matched store IDs
    const existingMatches = await prisma.matchCandidate.findMany({
      where: { projectId },
      select: { storeItemId: true },
    });
    const matchedStoreIds = new Set(existingMatches.map(m => m.storeItemId));
    
    console.log(`[MATCH_V2] Already matched: ${matchedStoreIds.size} items`);
    
    // Get unmatched store items for current batch ONLY
    // CRITICAL FIX: Use skip/take to avoid loading ALL items
    const unmatchedStoreItems = await prisma.storeItem.findMany({
      where: {
        projectId,
        id: { notIn: Array.from(matchedStoreIds) },
      },
      skip: batchOffset,
      take: batchSize,
      orderBy: { id: 'asc' }, // Consistent ordering for pagination
    });
    
    console.log(`[MATCH_V2] Loaded ${unmatchedStoreItems.length} unmatched items for this batch`);
    
    if (unmatchedStoreItems.length === 0) {
      console.log(`[MATCH_V2] No unmatched items in this batch - matching complete`);
      return NextResponse.json({
        success: true,
        message: 'No unmatched items in this batch',
        matchCount: 0,
        batch: {
          processed: batchOffset,
          total: batchOffset,
          remaining: 0,
          hasMore: false,
          nextOffset: null,
          batchSize,
        },
      });
    }
    
    // Extract store item IDs for this batch
    const batchStoreIds = unmatchedStoreItems.map(item => item.id);
    
    const matches: any[] = [];
    let epicA4InterchangeMatches = 0;
    let interchangeMatches = 0;
    let exactMatches = 0;
    let fuzzyMatches = 0;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STAGE 0: Epic A4 Deterministic Interchange Lookup (only on first batch)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (batchOffset === 0) {
      console.log(`[MATCH_V2] Stage 0: Epic A4 Deterministic Interchange Lookup`);
      
      // Get ALL store items for Epic A4 (only runs once)
      const allStoreItems = await prisma.storeItem.findMany({
        where: { projectId },
        select: { id: true, partNumber: true, lineCode: true },
      });
      
      // Prepare store parts data for batch resolution
      const storeParts = allStoreItems.map(item => ({
        partNumber: item.partNumber,
        lineCode: item.lineCode,
      }));

      // Batch resolve interchanges
      const interchangeResults = await resolveInterchangesBatch(projectId, storeParts);

      // Create matches for interchange hits
      for (let i = 0; i < allStoreItems.length; i++) {
        const interchangeMatch = interchangeResults[i];
        if (interchangeMatch) {
          epicA4InterchangeMatches++;
          matches.push({
            projectId,
            storeItemId: allStoreItems[i].id,
            targetType: 'SUPPLIER',
            targetId: interchangeMatch.supplierItemId,
            method: 'INTERCHANGE',
            confidence: 1.0,
            features: {
              reason: 'Epic A4 deterministic interchange',
              translatedLineCode: interchangeMatch.translatedLineCode,
            },
            status: 'PENDING',
            vendorAction: 'NONE',
          });
        }
      }

      console.log(`[MATCH_V2] Stage 0 complete: ${epicA4InterchangeMatches} matches`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STAGE 1: Known Interchange Matching (only on first batch)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    if (batchOffset === 0) {
      console.log(`[MATCH_V2] Stage 1: Known Interchange Matching`);
      
      // Get interchanges for this project
      const interchanges = await prisma.interchange.findMany({
        where: { projectId },
      });
      
      console.log(`[MATCH_V2] Found ${interchanges.length} known interchanges`);
      
      let matchedInStage1 = new Set(matches.map((m) => m.storeItemId));
      
      // Get ALL store items for interchange matching (only runs once)
      const allStoreItems = await prisma.storeItem.findMany({
        where: { projectId },
      });
      
      // Get ALL supplier items for interchange matching (only runs once)
      const allSupplierItems = await prisma.supplierItem.findMany({
        where: { projectId },
      });
      
      for (const storeItem of allStoreItems) {
        if (matchedInStage1.has(storeItem.id)) continue;
        
        const interchange = interchanges.find(
          (i) => i.oursPartNumber === storeItem.partNumber
        );
        
        if (interchange) {
          const supplierItem = allSupplierItems.find(
            (s) => s.partNumber === interchange.theirsPartNumber
          );
          
          if (supplierItem) {
            interchangeMatches++;
            matchedInStage1.add(storeItem.id);
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
      
      console.log(`[MATCH_V2] Stage 1 complete: ${interchangeMatches} matches`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STAGE 2: Postgres Native Exact Matching (RUNS ON EVERY BATCH)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`[MATCH_V2] Stage 2: Postgres Native Exact Matching V2.1 (Batch-Optimized)`);
    
    // Get already matched store IDs to avoid duplicates
    const alreadyMatchedIds = new Set(matches.map(m => m.storeItemId));
    
    // Add existing matches from database
    for (const match of existingMatches) {
      alreadyMatchedIds.add(match.storeItemId);
    }
    
    // Filter batch store IDs to only include unmatched items
    const unmatchedBatchStoreIds = batchStoreIds.filter(id => !alreadyMatchedIds.has(id));
    
    console.log(`[MATCH_V2] Batch has ${unmatchedBatchStoreIds.length} unmatched items (out of ${batchStoreIds.length} total)`);
    
    if (unmatchedBatchStoreIds.length > 0) {
      // CRITICAL FIX: Pass batch store IDs to exact matcher
      // This ensures we only match items in the current batch
      const sqlMatches = await findHybridExactMatches(projectId, unmatchedBatchStoreIds);
      
      console.log(`[MATCH_V2] Postgres matcher found ${sqlMatches.length} exact matches for this batch`);
      
      // Convert to match candidates
      for (const match of sqlMatches) {
        // Skip if already matched (shouldn't happen, but defensive)
        if (alreadyMatchedIds.has(match.storeItemId)) {
          continue;
        }
        
        exactMatches++;
        alreadyMatchedIds.add(match.storeItemId);
        matches.push({
          projectId,
          storeItemId: match.storeItemId,
          targetType: 'SUPPLIER',
          targetId: match.supplierItemId,
          method: match.matchMethod,
          confidence: match.confidence,
          features: { 
            reason: match.matchReason || 'Postgres native exact match V2.1',
            matchMethod: match.matchMethod,
            storePartNumber: match.storePartNumber,
            supplierPartNumber: match.supplierPartNumber,
            storeLineCode: match.storeLineCode,
            supplierLineCode: match.supplierLineCode,
          },
          status: 'PENDING',
        });
      }
      
      console.log(`[MATCH_V2] Stage 2 complete: ${exactMatches} exact matches in this batch`);
      console.log(`[MATCH_V2] Confidence breakdown:`);
      console.log(`[MATCH_V2]   Perfect (1.0): ${sqlMatches.filter(m => m.confidence === 1.0).length}`);
      console.log(`[MATCH_V2]   High (0.95-0.98): ${sqlMatches.filter(m => m.confidence >= 0.95 && m.confidence < 1.0).length}`);
      console.log(`[MATCH_V2]   Medium (0.90-0.94): ${sqlMatches.filter(m => m.confidence >= 0.90 && m.confidence < 0.95).length}`);
    } else {
      console.log(`[MATCH_V2] Stage 2 skipped: All items in batch already matched`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STAGE 3: Fuzzy Matching (for remaining unmatched items in batch)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`[MATCH_V2] Stage 3: Fuzzy Matching (Batch Processing)`);
    
    // Filter unmatched items from current batch
    const unmatchedInBatch = unmatchedStoreItems.filter(item => !alreadyMatchedIds.has(item.id));
    
    console.log(`[MATCH_V2] Fuzzy matching ${unmatchedInBatch.length} unmatched items from batch`);
    
    if (unmatchedInBatch.length > 0) {
      // Load ALL supplier items for fuzzy matching
      // TODO: Optimize this in future to only load relevant suppliers
      const allSupplierItems = await prisma.supplierItem.findMany({
        where: { projectId },
      });
      
      console.log(`[MATCH_V2] Loaded ${allSupplierItems.length} supplier items for fuzzy matching`);
      
      const engineStoreItems: EngineStoreItem[] = unmatchedInBatch.map((item) => ({
        id: item.id,
        partNumber: item.partNumber,
        partNumberNorm: item.partNumberNorm,
        canonicalPartNumber: (item as any).canonicalPartNumber || null,
        lineCode: item.lineCode,
        mfrPartNumber: item.mfrPartNumber,
        description: item.description,
        currentCost: item.currentCost ? Number(item.currentCost) : null,
      }));

      const engineSupplierItems: EngineSupplierItem[] = allSupplierItems.map((item) => ({
        id: item.id,
        partNumber: item.partNumber,
        partNumberNorm: item.partNumberNorm,
        canonicalPartNumber: (item as any).canonicalPartNumber || null,
        lineCode: item.lineCode,
        mfrPartNumber: item.mfrPartNumber,
        description: item.description,
        currentCost: item.currentCost ? Number(item.currentCost) : null,
      }));

      const fuzzyResult = stage2FuzzyMatching(engineStoreItems, engineSupplierItems, alreadyMatchedIds, {
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

      console.log(`[MATCH_V2] Stage 3 complete: ${fuzzyResult.matches.length} fuzzy matches, ${(fuzzyResult.metrics.matchRate * 100).toFixed(1)}% match rate`);
    } else {
      console.log(`[MATCH_V2] Stage 3 skipped: All items in batch already matched`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SAVE MATCHES WITH VENDOR ACTIONS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log(`[MATCH_V2] Total matches in this batch: ${matches.length}`);
    console.log(`[MATCH_V2] Breakdown: Epic A4=${epicA4InterchangeMatches}, Interchange=${interchangeMatches}, Exact=${exactMatches}, Fuzzy=${fuzzyMatches}`);
    
    if (matches.length > 0) {
      // Resolve vendor actions before saving
      console.log(`[MATCH_V2] Resolving vendor actions for ${matches.length} matches...`);
      
      // Fetch supplier items for matches (OPTIMIZED: only fetch what we need)
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
      
      console.log(`[MATCH_V2] Vendor actions resolved`);
      
      await prisma.matchCandidate.createMany({
        data: matchesWithVendorActions,
      });
      console.log(`[MATCH_V2] Saved ${matches.length} match candidates with vendor actions`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CALCULATE BATCH PROGRESS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // Get total unmatched count
    const totalUnmatched = await prisma.storeItem.count({
      where: {
        projectId,
        id: { notIn: Array.from(matchedStoreIds) },
      },
    });
    
    const totalProcessed = batchOffset + unmatchedStoreItems.length;
    const remaining = totalUnmatched - unmatchedStoreItems.length;
    const hasMore = remaining > 0;
    const nextOffset = hasMore ? batchOffset + batchSize : null;
    
    console.log(`[MATCH_V2] Batch complete: processed=${totalProcessed}, remaining=${remaining}, hasMore=${hasMore}`);
    
    return NextResponse.json({
      success: true,
      message: `Created ${matches.length} match candidates in this batch`,
      matchCount: matches.length,
      breakdown: {
        epicA4: epicA4InterchangeMatches,
        interchange: interchangeMatches,
        exact: exactMatches,
        fuzzy: fuzzyMatches,
      },
      batch: {
        processed: totalProcessed,
        total: totalUnmatched + unmatchedStoreItems.length,
        remaining,
        hasMore,
        nextOffset,
        batchSize,
      },
    });
  } catch (error: any) {
    console.error('[MATCH_V2] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to run matching' },
      { status: 500 }
    );
  }
}
