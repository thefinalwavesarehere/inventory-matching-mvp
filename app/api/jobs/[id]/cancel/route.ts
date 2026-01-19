/**
 * Job Cancellation API
 * POST /api/jobs/[id]/cancel - Cancel a running or queued matching job
 *
 * Supports two cancellation types:
 * - GRACEFUL: Finish current stage, then stop
 * - IMMEDIATE: Stop as soon as possible
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/lib/auth-helpers';
import { prisma } from '@/app/lib/db/prisma';
import {
  requestJobCancellation,
  markJobCancelled,
  CancellationType,
} from '@/app/lib/job-queue-manager';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { profile } = await requireAuth();
    const { id: jobId } = params;

    // Handle missing body gracefully
    let body: any = {};
    try {
      body = await req.json();
    } catch (e) {
      // No body provided, use defaults
    }
    const { type = 'GRACEFUL' } = body;

    // Validate cancellation type
    if (type !== 'GRACEFUL' && type !== 'IMMEDIATE') {
      return NextResponse.json(
        { success: false, error: 'Invalid cancellation type. Must be GRACEFUL or IMMEDIATE' },
        { status: 400 }
      );
    }

    // Get the job
    const job = await prisma.matchingJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        projectId: true,
        userId: true,
        status: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    // Check if job is already completed/failed/cancelled
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Job is already ${job.status}`,
        },
        { status: 400 }
      );
    }

    // Request cancellation
    const updatedJob = await requestJobCancellation(
      jobId,
      profile.id,
      type as typeof CancellationType[keyof typeof CancellationType]
    );

    console.log(`[JOB-CANCEL] User ${profile.id} requested ${type} cancellation for job ${jobId}`);

    // If job is queued (not started), cancel it immediately
    if (job.status === 'queued') {
      await markJobCancelled(jobId, `Cancelled by user before processing started`);
      console.log(`[JOB-CANCEL] Queued job ${jobId} cancelled immediately`);
    } else {
      console.log(`[JOB-CANCEL] Processing job ${jobId} will be cancelled ${type === 'GRACEFUL' ? 'after current stage' : 'immediately'}`);
    }

    return NextResponse.json({
      success: true,
      job: {
        id: updatedJob.id,
        status: updatedJob.status,
        cancellationRequested: updatedJob.cancellationRequested,
        cancellationType: updatedJob.cancellationType,
      },
    });
  } catch (error: any) {
    console.error('[JOB-CANCEL] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/jobs/[id]/cancel - Get cancellation status
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();
    const { id: jobId } = params;

    const job = await prisma.matchingJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        status: true,
        cancellationRequested: true,
        cancellationType: true,
        cancelledBy: true,
        cancelledAt: true,
      },
    });

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      cancellation: {
        requested: job.cancellationRequested,
        type: job.cancellationType,
        cancelledBy: job.cancelledBy,
        cancelledAt: job.cancelledAt,
        status: job.status,
      },
    });
  } catch (error: any) {
    console.error('[JOB-CANCEL] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
