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

      // Collapse 5 serial queries into 2 parallel raw SQL queries
      // Q1: store item count + match candidate aggregates in one pass
      // Q2: per-method breakdown for active matches
      const [aggregates, methodRows] = await Promise.all([
        prisma.$queryRaw<Array<{
          total_store: bigint;
          unique_matched: bigint;
          total_matches: bigint;
          cnt_pending: bigint;
          cnt_confirmed: bigint;
          cnt_rejected: bigint;
        }>>`
          SELECT
            (SELECT COUNT(*) FROM store_items WHERE "projectId" = ${projectId})           AS total_store,
            COUNT(DISTINCT CASE WHEN mc.status IN ('PENDING','CONFIRMED') THEN mc."storeItemId" END) AS unique_matched,
            COUNT(CASE WHEN mc.status IN ('PENDING','CONFIRMED') THEN 1 END)              AS total_matches,
            COUNT(CASE WHEN mc.status = 'PENDING'   THEN 1 END)                          AS cnt_pending,
            COUNT(CASE WHEN mc.status = 'CONFIRMED' THEN 1 END)                          AS cnt_confirmed,
            COUNT(CASE WHEN mc.status = 'REJECTED'  THEN 1 END)                          AS cnt_rejected
          FROM match_candidates mc
          WHERE mc."projectId" = ${projectId}
        `,
        prisma.$queryRaw<Array<{ method: string; cnt: bigint }>>`
          SELECT method, COUNT(*) AS cnt
          FROM match_candidates
          WHERE "projectId" = ${projectId}
            AND status IN ('PENDING', 'CONFIRMED')
          GROUP BY method
        `,
      ]);

      const agg = aggregates[0];
      const totalStoreItems  = Number(agg.total_store);
      const uniqueMatchedCount = Number(agg.unique_matched);
      const totalMatches     = Number(agg.total_matches);

      const counts = {
        pending:   Number(agg.cnt_pending),
        confirmed: Number(agg.cnt_confirmed),
        rejected:  Number(agg.cnt_rejected),
      };

      const byMethod = (m: string) =>
        methodRows.filter(r => r.method === m).reduce((s, r) => s + Number(r.cnt), 0);

      const sourceBreakdown = {
        exact:       byMethod('EXACT_NORM') + byMethod('EXACT_NORMALIZED'),
        interchange: byMethod('INTERCHANGE'),
        fuzzy:       byMethod('FUZZY') + byMethod('FUZZY_SUBSTRING'),
        ai:          byMethod('AI'),
        web:         byMethod('WEB_SEARCH'),
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
