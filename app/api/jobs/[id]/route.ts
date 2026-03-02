/**
 * Job Status API
 * GET /api/jobs/[id] - Get job status and progress
 * PATCH /api/jobs/[id] - Update job status (internal use)
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import prisma from '@/app/lib/db/prisma';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';

export const dynamic = 'force-dynamic';
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async (context) => {
    try {
    // Require authentication

    const jobId = params.id;

    const job = await prisma.matchingJob.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        projectId: job.projectId,
        status: job.status,
        currentStage: job.currentStage,
        currentStageName: job.currentStageName,
        totalItems: job.totalItems,
        processedItems: job.processedItems,
        progressPercentage: job.progressPercentage,
        matchesFound: job.matchesFound,
        matchRate: job.matchRate,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        estimatedCompletion: job.estimatedCompletion,
        error: (job as any).error || null,
      },
    });
  
  } catch (error: any) {
    apiLogger.error({ error: error.message }, 'Handler error');
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async (context) => {
    try {
    // Require authentication

    const jobId = params.id;
    const body = await req.json();

    const job = await prisma.matchingJob.update({
      where: { id: jobId },
      data: body,
    });

    return NextResponse.json({
      success: true,
      job,
    });
  
  } catch (error: any) {
    apiLogger.error({ error: error.message }, 'Handler error');
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
  });
}
