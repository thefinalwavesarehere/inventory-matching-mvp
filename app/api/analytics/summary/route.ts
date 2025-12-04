import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Get total store items
    const totalStoreItems = await prisma.storeItem.count({
      where: { projectId },
    });

    // Get unique matched store items (count distinct storeItemId)
    const matchedStoreItems = await prisma.matchCandidate.findMany({
      where: {
        projectId,
        status: { in: ['PENDING', 'CONFIRMED'] }, // Don't count rejected
      },
      select: {
        storeItemId: true,
      },
      distinct: ['storeItemId'],
    });

    const uniqueMatchedCount = matchedStoreItems.length;

    // Get total match candidates (including multiple matches per item)
    const totalMatches = await prisma.matchCandidate.count({
      where: {
        projectId,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    });

    // Get match counts by status
    const matchCounts = await prisma.matchCandidate.groupBy({
      by: ['status'],
      where: { projectId },
      _count: true,
    });

    const counts = {
      pending: matchCounts.find(m => m.status === 'PENDING')?._count || 0,
      confirmed: matchCounts.find(m => m.status === 'CONFIRMED')?._count || 0,
      rejected: matchCounts.find(m => m.status === 'REJECTED')?._count || 0,
    };

    // Get match counts by source
    const matchesBySource = await prisma.matchCandidate.groupBy({
      by: ['matchSource'],
      where: {
        projectId,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      _count: true,
    });

    const sourceBreakdown = {
      exact: matchesBySource.find(m => m.matchSource === 'EXACT')?._count || 0,
      interchange: matchesBySource.find(m => m.matchSource === 'INTERCHANGE')?._count || 0,
      fuzzy: matchesBySource.find(m => m.matchSource === 'FUZZY')?._count || 0,
      ai: matchesBySource.find(m => m.matchSource === 'AI')?._count || 0,
      web: matchesBySource.find(m => m.matchSource === 'WEB_SEARCH')?._count || 0,
    };

    // Calculate match rate (unique store items matched / total store items)
    const matchRate = totalStoreItems > 0 ? uniqueMatchedCount / totalStoreItems : 0;

    return NextResponse.json({
      totalStoreItems,
      uniqueMatchedItems: uniqueMatchedCount,
      totalMatchCandidates: totalMatches,
      matchRate,
      matchCounts: counts,
      sourceBreakdown,
    });
  } catch (error: any) {
    console.error('Error fetching analytics summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics summary', details: error.message },
      { status: 500 }
    );
  }
}
