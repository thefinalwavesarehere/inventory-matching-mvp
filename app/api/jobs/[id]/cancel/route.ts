/**
 * Job Cancel API
 * POST /api/jobs/[id]/cancel - Cancel a running job
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

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
