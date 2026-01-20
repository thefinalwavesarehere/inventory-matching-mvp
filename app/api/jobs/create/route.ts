/**
 * Job Creation API
 * POST /api/jobs/create - Create a new background matching job
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import { requireAuth } from '@/app/lib/auth-helpers';
import prisma from '@/app/lib/db/prisma';
import {
  createQueuedJob,
  tryStartNextQueuedJob,
  getProjectQueueStatus,
} from '@/app/lib/job-queue-manager';

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    const { profile } = await requireAuth();

    const body = await req.json();
    const { projectId, jobType, config } = body;

    if (!projectId || !jobType) {
      return NextResponse.json(
        { success: false, error: 'Project ID and job type required' },
        { status: 400 }
      );
    }

    // Get total unmatched items based on job type
    let totalUnmatched = 0;
    
    if (jobType === 'master-rules') {
      // Master Rules: Count all store items (rules apply to everything)
      totalUnmatched = await prisma.storeItem.count({
        where: { projectId },
      });
    } else if (jobType === 'exact' || jobType === 'fuzzy') {
      // Exact/Fuzzy: Count all items without any matches
      const existingMatches = await prisma.matchCandidate.findMany({
        where: { projectId },
        select: { storeItemId: true },
      });
      const matchedIds = new Set(existingMatches.map((m) => m.storeItemId));
      const totalStoreItems = await prisma.storeItem.count({
        where: { projectId },
      });
      totalUnmatched = totalStoreItems - matchedIds.size;
    } else if (jobType === 'ai') {
      // AI: Count items not matched by stages 1 or 2
      totalUnmatched = await prisma.storeItem.count({
        where: {
          projectId,
          matchCandidates: {
            none: {
              projectId,
              matchStage: { in: [1, 2] },
            },
          },
        },
      });
    } else if (jobType === 'web-search') {
      // Web Search: Count items not matched by stages 1, 2, or 3
      totalUnmatched = await prisma.storeItem.count({
        where: {
          projectId,
          matchCandidates: {
            none: {
              projectId,
              matchStage: { in: [1, 2, 3] },
            },
          },
        },
      });
    }

    // P4: Check budget for AI and web-search operations
    if (jobType === 'ai' || jobType === 'web-search') {
      const { estimateCost, checkBudget } = await import('@/app/lib/budget-tracker');

      const operation = jobType === 'ai' ? 'ai_match' : 'web_search';
      const costEstimate = estimateCost(operation, totalUnmatched);
      const budgetCheck = await checkBudget(projectId, costEstimate.estimatedCost);

      if (!budgetCheck.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: budgetCheck.reason || 'Budget limit exceeded',
            budgetStatus: budgetCheck.budgetStatus,
            estimatedCost: costEstimate.estimatedCost,
          },
          { status: 402 } // Payment Required
        );
      }

      console.log(`[JOB-CREATE] Budget check passed. Estimated cost: $${costEstimate.estimatedCost.toFixed(2)}`);
    }

    // Create job using queue manager
    const jobConfig = {
      ...config,
      jobType,
      stageName: jobType === 'master-rules' ? 'Master Rules' :
                 jobType === 'exact' ? 'Exact Matching' :
                 jobType === 'fuzzy' ? 'Fuzzy Matching' :
                 jobType === 'ai' ? 'AI Matching' :
                 jobType === 'web-search' ? 'Web Search' :
                 'Unknown',
      totalItems: totalUnmatched,
    };

    const job = await createQueuedJob(projectId, profile.id, jobConfig);

    console.log(`[JOB-CREATE] Created job ${job.id} for project ${projectId}, type: ${jobType}`);
    console.log(`[JOB-CREATE] Total unmatched items: ${totalUnmatched}`);
    console.log(`[JOB-CREATE] Job status: ${job.status}`);

    // Try to start the job if concurrency limits allow
    const startedJob = await tryStartNextQueuedJob();
    if (startedJob?.id === job.id) {
      console.log(`[JOB-CREATE] Job ${job.id} started immediately`);
    } else {
      console.log(`[JOB-CREATE] Job ${job.id} queued (concurrency limits reached)`);
    }

    // Get queue status for this project
    const queueStatus = await getProjectQueueStatus(projectId);

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        projectId: job.projectId,
        status: job.status,
        totalItems: totalUnmatched,
        queuePosition: queueStatus.position,
        runningJob: queueStatus.running?.id,
        queuedJobs: queueStatus.queued.length,
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
