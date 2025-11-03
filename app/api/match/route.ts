import { NextRequest, NextResponse } from 'next/server';
import { findMatchesMultiStage } from '../../lib/ml/enhancedMatching';
import prisma from '../../lib/db/prisma';

// Increase timeout for long-running matching operations
export const maxDuration = 300; // 5 minutes
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, arnoldSessionId, supplierSessionId, options = {} } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Get Arnold inventory items with filtering
    console.log('📋 Fetching Arnold inventory items...');
    const allArnoldItems = await prisma.arnoldInventory.findMany({
      where: arnoldSessionId 
        ? { sessionId: arnoldSessionId }
        : {
            session: {
              projectId,
              fileType: 'arnold',
            },
          },
      orderBy: { createdAt: 'desc' },
    });

    // Filter out invalid/empty Arnold items
    const arnoldItems = allArnoldItems.filter(item => {
      // Skip items with null or empty part numbers
      if (!item.partNumber || item.partNumber.trim() === '') {
        return false;
      }
      
      // Skip items with N/A or zero usage (optional - uncomment to enable)
      // if (!item.usageLast12 || item.usageLast12 === 0) {
      //   return false;
      // }
      
      return true;
    });

    console.log(`✅ Loaded ${allArnoldItems.length} Arnold items, ${arnoldItems.length} valid after filtering (${allArnoldItems.length - arnoldItems.length} filtered out)`);

    if (arnoldItems.length === 0) {
      return NextResponse.json(
        { error: 'No valid Arnold inventory items found for this project' },
        { status: 404 }
      );
    }

    // Enrich Arnold items with descriptions from Inventory Report
    console.log('📚 Enriching Arnold items with descriptions from Inventory Report...');
    let enrichedCount = 0;
    
    try {
      const inventoryReportItems = await prisma.supplierCatalog.findMany({
        where: {
          session: {
            projectId,
          },
          supplierName: 'Arnold Inventory Report',
        },
      });

      if (inventoryReportItems.length > 0) {
        // Create lookup map for fast enrichment
        const inventoryMap = new Map();
        for (const item of inventoryReportItems) {
          try {
            // Index by both full part number and part number without line code
            if (item.partFull && typeof item.partFull === 'string') {
              inventoryMap.set(item.partFull.toLowerCase().trim(), item);
            }
            if (item.partNumber && typeof item.partNumber === 'string') {
              inventoryMap.set(item.partNumber.toLowerCase().trim(), item);
            }
          } catch (err) {
            // Skip items that cause errors
            console.warn('Error indexing inventory item:', err);
          }
        }

        // Enrich Arnold items
        for (const arnoldItem of arnoldItems) {
          try {
            if (!arnoldItem.partNumber || typeof arnoldItem.partNumber !== 'string') {
              continue;
            }
            
            const normalizedPart = arnoldItem.partNumber.toLowerCase().trim();
            const partWithoutLineCode = arnoldItem.partNumber.replace(/^[A-Z]+/, '').toLowerCase().trim();
            
            const inventoryItem = inventoryMap.get(normalizedPart) || inventoryMap.get(partWithoutLineCode);
            
            if (inventoryItem && inventoryItem.description) {
              // Add description and other data to Arnold item (in memory only)
              (arnoldItem as any).description = inventoryItem.description;
              (arnoldItem as any).lineCode = inventoryItem.lineCode || '';
              (arnoldItem as any).qtyAvail = inventoryItem.qtyAvail || null;
              enrichedCount++;
            }
          } catch (err) {
            // Skip items that cause errors
            console.warn(`Error enriching Arnold item ${arnoldItem.id}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('Error during enrichment:', err);
      // Continue without enrichment if there's an error
    }

    console.log(`✅ Enriched ${enrichedCount}/${arnoldItems.length} Arnold items with descriptions`);

    // Get supplier catalog items
    const supplierItems = await prisma.supplierCatalog.findMany({
      where: supplierSessionId
        ? { sessionId: supplierSessionId }
        : {
            session: {
              projectId,
              fileType: 'supplier',
            },
            supplierName: 'CarQuest', // Only match against CarQuest, not inventory report
          },
      orderBy: { createdAt: 'desc' },
      // No limit - process all items
    });

    if (supplierItems.length === 0) {
      return NextResponse.json(
        { error: 'No supplier catalog items found for this project' },
        { status: 404 }
      );
    }

    // Run matching algorithm with stricter thresholds
    // DISABLE interchange file matching due to bad data
    const matchOptions = {
      useKnownInterchanges: false,  // DISABLED - interchange file has bad data
      partNumberThreshold: options?.partNumberThreshold || 0.85,  // Lowered to handle supplier prefixes
      nameThreshold: options?.nameThreshold || 0.70,              // Lowered for better match rate
      descriptionThreshold: options?.descriptionThreshold || 0.60, // Lowered for better match rate
    };
    
    console.log('🔍 Running matching with thresholds:', matchOptions);
    const matches = await findMatchesMultiStage(arnoldItems, supplierItems, matchOptions);

    // Save match results to database using batch processing
    console.log(`💾 Saving ${matches.length} match results to database...`);
    const saveStartTime = Date.now();
    
    // Use createMany for batch insert (much faster than individual creates)
    const BATCH_SIZE = 1000;
    for (let i = 0; i < matches.length; i += BATCH_SIZE) {
      const batch = matches.slice(i, i + BATCH_SIZE);
      await prisma.matchResult.createMany({
        data: batch.map(match => ({
          arnoldItemId: match.arnoldItem.id,
          supplierItemId: match.supplierItem?.id || null,
          matchStage: match.matchStage,
          confidenceScore: match.confidenceScore,
          matchReasons: match.matchReasons,
          status: match.matchStage === 'no_match' ? 'pending' : 'pending',
        })),
      });
      console.log(`💾 Saved batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(matches.length / BATCH_SIZE)}`);
    }
    
    console.log(`✅ All match results saved in ${Date.now() - saveStartTime}ms`);

    // Track unmatched parts using batch insert
    const unmatchedItems = matches.filter(m => m.matchStage === 'no_match');
    if (unmatchedItems.length > 0) {
      console.log(`💾 Saving ${unmatchedItems.length} unmatched parts...`);
      await prisma.unmatchedPart.createMany({
        data: unmatchedItems.map(unmatched => ({
          arnoldItemId: unmatched.arnoldItem.id,
          attemptedMethods: ['part_number', 'part_name', 'description'],
          requiresManual: true,
        })),
        skipDuplicates: true,
      });
      console.log(`✅ Unmatched parts saved`);
    }
    
    // Fetch saved matches for response (limit to avoid timeout)
    const savedMatches = await prisma.matchResult.findMany({
      where: {
        arnoldItem: {
          session: {
            projectId,
          },
        },
      },
      include: {
        arnoldItem: true,
        supplierItem: true,
      },
      orderBy: {
        confidenceScore: 'desc',
      },
      take: 100, // Only return top 100 matches in response
    });

    // Calculate statistics
    const stats = {
      total: matches.length,
      matched: matches.filter((m: any) => m.matchStage !== 'no_match').length,
      unmatched: unmatchedItems.length,
      byStage: {
        part_number: matches.filter((m: any) => m.matchStage === 'part_number').length,
        part_name: matches.filter((m: any) => m.matchStage === 'part_name').length,
        description: matches.filter((m: any) => m.matchStage === 'description').length,
        no_match: unmatchedItems.length,
      },
      averageConfidence: matches
        .filter((m: any) => m.matchStage !== 'no_match')
        .reduce((sum, m) => sum + m.confidenceScore, 0) / 
        (matches.length - unmatchedItems.length || 1),
    };

    return NextResponse.json({
      success: true,
      message: `Matched ${stats.matched} out of ${stats.total} items`,
      stats,
      matches: savedMatches,
    });

  } catch (error) {
    console.error('Error running matching:', error);
    return NextResponse.json(
      { 
        error: 'Failed to run matching algorithm',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to retrieve match results
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');
    const matchStage = searchParams.get('matchStage');

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Build where clause
    const where: any = {
      arnoldItem: {
        session: {
          projectId,
        },
      },
    };

    if (status) {
      where.status = status;
    }

    if (matchStage) {
      where.matchStage = matchStage;
    }

    // Get match results
    const matches = await prisma.matchResult.findMany({
      where,
      include: {
        arnoldItem: true,
        supplierItem: true,
        enrichmentData: true,
      },
      orderBy: [
        { confidenceScore: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    // Calculate statistics
    const stats = {
      total: matches.length,
      byStatus: {
        pending: matches.filter((m: any) => m.status === 'pending').length,
        confirmed: matches.filter((m: any) => m.status === 'confirmed').length,
        rejected: matches.filter((m: any) => m.status === 'rejected').length,
      },
      byStage: {
        part_number: matches.filter((m: any) => m.matchStage === 'part_number').length,
        part_name: matches.filter((m: any) => m.matchStage === 'part_name').length,
        description: matches.filter((m: any) => m.matchStage === 'description').length,
        web_search: matches.filter((m: any) => m.matchStage === 'web_search').length,
        manual: matches.filter((m: any) => m.matchStage === 'manual').length,
        no_match: matches.filter((m: any) => m.matchStage === 'no_match').length,
      },
    };

    return NextResponse.json({
      success: true,
      stats,
      matches,
    });

  } catch (error) {
    console.error('Error fetching matches:', error);
    return NextResponse.json(
      { error: 'Failed to fetch matches' },
      { status: 500 }
    );
  }
}
