/**
 * Job Status API
 * GET /api/jobs/[id] - Get job status and progress
 * PATCH /api/jobs/[id] - Update job status (internal use)
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import { requireAuth } from '@/app/lib/auth-helpers';
import prisma from '@/app/lib/db/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require authentication
    await requireAuth();

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
    console.error('[JOB-STATUS] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require authentication
    await requireAuth();

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
    console.error('[JOB-UPDATE] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
