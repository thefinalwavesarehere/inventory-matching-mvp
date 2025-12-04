import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';

/**
 * Initialize matchingProgress based on completed background jobs
 * This fixes the issue where jobs completed before progress tracking was added
 */
export async function POST(request: NextRequest) {
  try {
    const { projectId } = await request.json();
    
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    // Get all completed jobs for this project
    const completedJobs = await prisma.backgroundJob.findMany({
      where: {
        projectId,
        status: 'completed',
      },
      orderBy: {
        completedAt: 'asc',
      },
    });

    console.log(`[PROGRESS-INIT] Found ${completedJobs.length} completed jobs for project ${projectId}`);

    // Determine what's been completed based on job types
    const fuzzyJob = completedJobs.find(j => j.config && (j.config as any).jobType === 'fuzzy');
    const aiJob = completedJobs.find(j => j.config && (j.config as any).jobType === 'ai');
    const webSearchJob = completedJobs.find(j => j.config && (j.config as any).jobType === 'web-search');

    // Determine current stage
    let currentStage = 'UPLOAD';
    if (webSearchJob) {
      currentStage = 'REVIEW';
    } else if (aiJob) {
      currentStage = 'WEB_SEARCH';
    } else if (fuzzyJob) {
      currentStage = 'AI';
    } else if (completedJobs.length > 0) {
      currentStage = 'STANDARD';
    }

    // Build progress update
    const progressData: any = {
      projectId,
      currentStage,
    };

    if (fuzzyJob) {
      progressData.standardCompleted = true;
      progressData.standardProcessed = fuzzyJob.totalItems || 0;
      progressData.standardTotalItems = fuzzyJob.totalItems || 0;
      progressData.standardLastRun = fuzzyJob.completedAt;
      console.log(`[PROGRESS-INIT] Fuzzy job completed: ${fuzzyJob.totalItems} items`);
    }

    if (aiJob) {
      progressData.aiCompleted = true;
      progressData.aiProcessed = aiJob.totalItems || 0;
      progressData.aiTotalItems = aiJob.totalItems || 0;
      progressData.aiLastRun = aiJob.completedAt;
      console.log(`[PROGRESS-INIT] AI job completed: ${aiJob.totalItems} items`);
    }

    if (webSearchJob) {
      progressData.webSearchCompleted = true;
      progressData.webSearchProcessed = webSearchJob.totalItems || 0;
      progressData.webSearchTotalItems = webSearchJob.totalItems || 0;
      progressData.webSearchLastRun = webSearchJob.completedAt;
      console.log(`[PROGRESS-INIT] Web search job completed: ${webSearchJob.totalItems} items`);
    }

    // Upsert progress record
    const progress = await prisma.matchingProgress.upsert({
      where: { projectId },
      create: progressData,
      update: progressData,
    });

    console.log(`[PROGRESS-INIT] Progress initialized for project ${projectId}`);
    console.log(`[PROGRESS-INIT] Current stage: ${currentStage}`);
    console.log(`[PROGRESS-INIT] Standard: ${progressData.standardCompleted ? 'completed' : 'pending'}`);
    console.log(`[PROGRESS-INIT] AI: ${progressData.aiCompleted ? 'completed' : 'pending'}`);
    console.log(`[PROGRESS-INIT] Web Search: ${progressData.webSearchCompleted ? 'completed' : 'pending'}`);

    return NextResponse.json({
      success: true,
      progress,
      message: 'Progress initialized successfully',
    });

  } catch (error: any) {
    console.error('[PROGRESS-INIT] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initialize progress' },
      { status: 500 }
    );
  }
}
