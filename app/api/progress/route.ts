import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    // Get or create progress record
    let progress = await prisma.matchingProgress.findUnique({
      where: { projectId },
    });

    if (!progress) {
      progress = await prisma.matchingProgress.create({
        data: {
          projectId,
          currentStage: 'UPLOAD',
        },
      });
    }
    
    // Check for active jobs and merge their progress
    const activeJob = await prisma.matchingJob.findFirst({
      where: {
        projectId,
        status: { in: ['pending', 'processing'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    
    // If there's an active job, use its real-time progress
    if (activeJob) {
      const config = activeJob.config as any || {};
      const jobType = config.jobType || 'fuzzy';
      
      if (jobType === 'fuzzy') {
        progress.standardProcessed = activeJob.processedItems;
        progress.standardTotalItems = activeJob.totalItems || 0;
      } else if (jobType === 'ai') {
        progress.aiProcessed = activeJob.processedItems;
        progress.aiTotalItems = activeJob.totalItems || 0;
      } else if (jobType === 'web-search') {
        progress.webSearchProcessed = activeJob.processedItems;
        progress.webSearchTotalItems = activeJob.totalItems || 0;
      }
    }

    // Get match counts
    const matchCounts = await prisma.matchCandidate.groupBy({
      by: ['status'],
      where: { projectId },
      _count: true,
    });

    const counts = {
      pending: matchCounts.find(m => m.status === 'PENDING')?._count || 0,
      confirmed: matchCounts.find(m => m.status === 'CONFIRMED')?._count || 0,
      rejected: matchCounts.find(m => m.status === 'REJECTED')?._count || 0,
    };

    return NextResponse.json({
      progress,
      matchCounts: counts,
      totalMatches: counts.pending + counts.confirmed + counts.rejected,
    });

  } catch (error: any) {
    console.error('[PROGRESS] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get progress' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, updates } = body;
    
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    // Update progress
    const progress = await prisma.matchingProgress.upsert({
      where: { projectId },
      create: {
        projectId,
        ...updates,
      },
      update: updates,
    });

    return NextResponse.json({ progress });

  } catch (error: any) {
    console.error('[PROGRESS] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update progress' },
      { status: 500 }
    );
  }
}
