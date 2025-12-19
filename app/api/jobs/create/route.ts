/**
 * Job Creation API
 * POST /api/jobs/create - Create a new background matching job
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { projectId, jobType, config } = body;

    if (!projectId || !jobType) {
      return NextResponse.json(
        { success: false, error: 'Project ID and job type required' },
        { status: 400 }
      );
    }

    // Get total unmatched items
    const existingMatches = await prisma.matchCandidate.findMany({
      where: { projectId },
      select: { storeItemId: true },
    });
    const matchedIds = new Set(existingMatches.map((m) => m.storeItemId));

    const totalStoreItems = await prisma.storeItem.count({
      where: { projectId },
    });

    const totalUnmatched = totalStoreItems - matchedIds.size;

    // Create job record
    const job = await prisma.matchingJob.create({
      data: {
        projectId,
        createdBy: session.user?.email || null,
        status: 'pending',
        currentStage: 0,
        currentStageName: 
          jobType === 'exact' ? 'Exact Matching' :
          jobType === 'fuzzy' ? 'Fuzzy Matching' :
          jobType === 'ai' ? 'AI Matching' :
          jobType === 'web-search' ? 'Web Search' :
          'Unknown',
        totalItems: totalUnmatched,
        processedItems: 0,
        progressPercentage: 0,
        matchesFound: 0,
        matchRate: 0,
        config: config || {},
      },
    });

    console.log(`[JOB-CREATE] Created job ${job.id} for project ${projectId}, type: ${jobType}`);
    console.log(`[JOB-CREATE] Total unmatched items: ${totalUnmatched}`);

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        projectId: job.projectId,
        status: job.status,
        totalItems: job.totalItems,
      },
    });
  } catch (error: any) {
    console.error('[JOB-CREATE] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
