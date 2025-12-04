import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';

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

    // Get project with counts
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: {
          select: {
            storeItems: true,
            supplierItems: true,
            matchCandidates: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Get progress
    const progress = await prisma.matchingProgress.findUnique({
      where: { projectId },
    });

    // Get unique matched items count
    const matchedItems = await prisma.matchCandidate.findMany({
      where: {
        projectId,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      select: {
        storeItemId: true,
      },
      distinct: ['storeItemId'],
    });

    const uniqueMatchedCount = matchedItems.length;
    const matchRate = project._count.storeItems > 0 
      ? uniqueMatchedCount / project._count.storeItems 
      : 0;

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt,
        storeItems: project._count.storeItems,
        supplierItems: project._count.supplierItems,
        totalMatchCandidates: project._count.matchCandidates,
        uniqueMatchedItems: uniqueMatchedCount,
        matchRate,
      },
      progress: progress || {
        currentStage: 'UPLOAD',
        standardCompleted: false,
        aiCompleted: false,
        webSearchCompleted: false,
      },
    });
  } catch (error: any) {
    console.error('Error fetching project summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project summary', details: error.message },
      { status: 500 }
    );
  }
}
