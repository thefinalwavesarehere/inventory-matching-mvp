/**
 * Match Candidates API
 * GET /api/match - Get match candidates with pagination and filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';

export const dynamic = 'force-dynamic';

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
    const status = searchParams.get('status') || 'all';
    const method = searchParams.get('method') || 'all';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      );
    }

    // Build where clause
    const where: any = { projectId };
    
    if (status !== 'all') {
      where.status = status;
    }
    
    if (method !== 'all') {
      where.method = method;
    }
    
    if (search) {
      where.OR = [
        { storeItem: { partNumber: { contains: search, mode: 'insensitive' } } },
        { storeItem: { description: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // V9.9: Use DISTINCT ON to prevent duplicate key crashes
    // Get total count first
    const total = await prisma.matchCandidate.count({ where });

    // Fetch matches with deduplication
    const matches = await prisma.matchCandidate.findMany({
      where,
      include: {
        storeItem: {
          select: {
            partNumber: true,
            lineCode: true,
            description: true,
            currentCost: true,
          },
        },
      },
      orderBy: [
        { confidence: 'desc' },
        { id: 'asc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    });

    // V9.9: Deduplicate on client side as additional safety
    const uniqueMatches = new Map();
    for (const match of matches) {
      const key = `${match.storeItemId}:${match.targetId}`;
      if (!uniqueMatches.has(key)) {
        uniqueMatches.set(key, match);
      }
    }

    const deduplicatedMatches = Array.from(uniqueMatches.values());

    // Fetch target items separately to avoid N+1 queries
    const targetIds = deduplicatedMatches.map(m => m.targetId);
    const supplierItems = await prisma.supplierItem.findMany({
      where: { id: { in: targetIds } },
      select: {
        id: true,
        partNumber: true,
        lineCode: true,
        description: true,
        currentCost: true,
      },
    });

    const supplierItemsMap = new Map(supplierItems.map(item => [item.id, item]));

    // Attach target items to matches
    const enrichedMatches = deduplicatedMatches.map(match => ({
      ...match,
      targetItem: supplierItemsMap.get(match.targetId) || null,
    }));

    return NextResponse.json({
      success: true,
      matches: enrichedMatches,
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[MATCH-GET] Error fetching matches:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch matches' },
      { status: 500 }
    );
  }
}
