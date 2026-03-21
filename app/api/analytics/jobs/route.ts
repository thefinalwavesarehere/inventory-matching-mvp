import { NextRequest, NextResponse } from 'next/server';
import { apiLogger } from '@/app/lib/structured-logger';
import { prisma } from '@/app/lib/db/prisma';
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

      // Tenant isolation
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

      const jobs = await prisma.matchingJob.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const transformedJobs = jobs.map(job => {
        const metrics = job.metrics as any || {};
        const stageMetrics = metrics.stageMetrics || [];

        return {
          id: job.id,
          createdAt: job.createdAt.toISOString(),
          totalItems: job.totalItems || 0,
          matchedItems: job.matchesFound || 0,
          matchRate: job.matchRate || 0,
          executionTimeMs: metrics.totalExecutionTimeMs || 0,
          stageMetrics: stageMetrics.map((metric: any) => ({
            stage: metric.stageName || `Stage ${metric.stageNumber}`,
            itemsProcessed: metric.itemsProcessed || 0,
            matchesFound: metric.matchesFound || 0,
            matchRate: metric.matchRate || 0,
            avgConfidence: metric.avgConfidence || 0,
            executionTimeMs: metric.executionTimeMs || 0,
          })),
        };
      });

      return NextResponse.json({ jobs: transformedJobs });
    } catch (error: any) {
      apiLogger.error({ error: error.message }, 'Error fetching job metrics');
      return NextResponse.json(
        { error: 'Failed to fetch job metrics', details: error.message },
        { status: 500 }
      );
    }
  });
}
