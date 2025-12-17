import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

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

    // Fetch matching jobs with their stage metrics
    const jobs = await prisma.matchingJob.findMany({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20, // Last 20 jobs
    });

    // Transform the data
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

    return NextResponse.json({
      jobs: transformedJobs,
    });
  } catch (error: any) {
    console.error('Error fetching job metrics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job metrics', details: error.message },
      { status: 500 }
    );
  }
}
