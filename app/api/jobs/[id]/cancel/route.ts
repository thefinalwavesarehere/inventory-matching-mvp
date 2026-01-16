/**
 * Job Cancel API
 * POST /api/jobs/[id]/cancel - Cancel a running job
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import { requireAuth } from '@/app/lib/auth-helpers';
import prisma from '@/app/lib/db/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require authentication
    await requireAuth();

    const jobId = params.id;

    // Update job status to failed/cancelled
    await prisma.matchingJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        completedAt: new Date(),
      },
    });

    console.log(`[JOB-CANCEL] Cancelled job ${jobId}`);

    return NextResponse.json({
      success: true,
      message: 'Job cancelled',
    });
  } catch (error: any) {
    console.error('[JOB-CANCEL] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
