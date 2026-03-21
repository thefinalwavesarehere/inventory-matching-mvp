import { NextRequest, NextResponse } from 'next/server';
import { apiLogger } from '@/app/lib/structured-logger';
import prisma from '@/app/lib/db/prisma';
import { withAuth } from '@/app/lib/middleware/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return withAuth(request, async (context) => {
    try {
      const { searchParams } = new URL(request.url);
      const projectId = searchParams.get('projectId');

      if (!projectId) {
        return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
      }

      // Tenant isolation: verify the project belongs to the requesting user (ADMINs bypass)
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, createdById: true },
      });

      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      if (context.user.role !== 'ADMIN' && project.createdById !== context.user.id) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      // Get total store items
      const totalStoreItems = await prisma.storeItem.count({ where: { projectId } });

      // Get unique matched store items
      const matchedStoreItems = await prisma.matchCandidate.findMany({
        where: {
          projectId,
          status: { in: ['PENDING', 'CONFIRMED'] },
        },
        select: { storeItemId: true },
        distinct: ['storeItemId'],
      });

      const uniqueMatchedCount = matchedStoreItems.length;

      const totalMatches = await prisma.matchCandidate.count({
        where: { projectId, status: { in: ['PENDING', 'CONFIRMED'] } },
      });

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

      const matchesByMethod = await prisma.matchCandidate.groupBy({
        by: ['method'],
        where: { projectId, status: { in: ['PENDING', 'CONFIRMED'] } },
        _count: true,
      });

      const exactCount = matchesByMethod
        .filter(m => m.method === 'EXACT_NORM' || m.method === 'EXACT_NORMALIZED')
        .reduce((sum, m) => sum + m._count, 0);
      const fuzzyCount = matchesByMethod
        .filter(m => m.method === 'FUZZY' || m.method === 'FUZZY_SUBSTRING')
        .reduce((sum, m) => sum + m._count, 0);

      const sourceBreakdown = {
        exact: exactCount,
        interchange: matchesByMethod.find(m => m.method === 'INTERCHANGE')?._count || 0,
        fuzzy: fuzzyCount,
        ai: matchesByMethod.find(m => m.method === 'AI')?._count || 0,
        web: matchesByMethod.find(m => m.method === 'WEB_SEARCH')?._count || 0,
      };

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
      apiLogger.error({ error: error.message }, 'Error fetching analytics summary');
      return NextResponse.json(
        { error: 'Failed to fetch analytics summary', details: error.message },
        { status: 500 }
      );
    }
  });
}
