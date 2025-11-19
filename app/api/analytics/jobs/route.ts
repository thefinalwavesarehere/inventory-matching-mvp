import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
      include: {
        stageMetrics: {
          orderBy: {
            stage: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 20, // Last 20 jobs
    });

    // Transform the data
    const transformedJobs = jobs.map(job => ({
      id: job.id,
      createdAt: job.createdAt.toISOString(),
      totalItems: job.totalItems,
      matchedItems: job.matchedItems,
      matchRate: job.totalItems > 0 ? job.matchedItems / job.totalItems : 0,
      executionTimeMs: job.executionTimeMs || 0,
      stageMetrics: job.stageMetrics.map(metric => ({
        stage: metric.stage,
        itemsProcessed: metric.itemsProcessed,
        matchesFound: metric.matchesFound,
        matchRate: metric.itemsProcessed > 0 
          ? metric.matchesFound / metric.itemsProcessed 
          : 0,
        avgConfidence: metric.avgConfidence || 0,
        executionTimeMs: metric.executionTimeMs || 0,
      })),
    }));

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
