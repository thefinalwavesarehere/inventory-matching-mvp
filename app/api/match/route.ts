import { NextRequest, NextResponse } from 'next/server';
import { findMatchesMultiStage } from '../../lib/ml/enhancedMatching';
import prisma from '../../lib/db/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, arnoldSessionId, supplierSessionId, options } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Get Arnold inventory items
    const arnoldItems = await prisma.arnoldInventory.findMany({
      where: arnoldSessionId 
        ? { sessionId: arnoldSessionId }
        : {
            session: {
              projectId,
              fileType: 'arnold',
            },
          },
      orderBy: { createdAt: 'desc' },
      // No limit - process all items
    });

    if (arnoldItems.length === 0) {
      return NextResponse.json(
        { error: 'No Arnold inventory items found for this project' },
        { status: 404 }
      );
    }

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

    // Run matching algorithm
    const matches = await findMatchesMultiStage(arnoldItems, supplierItems, options);

    // Save match results to database
    const savedMatches = [];
    for (const match of matches) {
      const saved = await prisma.matchResult.create({
        data: {
          arnoldItemId: match.arnoldItem.id,
          supplierItemId: match.supplierItem?.id || null,
          matchStage: match.matchStage,
          confidenceScore: match.confidenceScore,
          matchReasons: match.matchReasons,
          status: match.matchStage === 'no_match' ? 'pending' : 'pending',
        },
        include: {
          arnoldItem: true,
          supplierItem: true,
        },
      });
      savedMatches.push(saved);
    }

    // Track unmatched parts
    const unmatchedItems = matches.filter(m => m.matchStage === 'no_match');
    for (const unmatched of unmatchedItems) {
      await prisma.unmatchedPart.create({
        data: {
          arnoldItemId: unmatched.arnoldItem.id,
          attemptedMethods: ['part_number', 'part_name', 'description'],
          requiresManual: true,
        },
      });
    }

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
