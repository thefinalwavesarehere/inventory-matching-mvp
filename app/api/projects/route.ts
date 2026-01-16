/**
 * Projects API
 * 
 * GET  /api/projects - List all projects
 * POST /api/projects - Create new project
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import { requireAuth } from '@/app/lib/auth-helpers';
import prisma from '@/app/lib/db/prisma';

export async function GET(req: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
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

    // Get progress for all projects
    const progressData = await prisma.matchingProgress.findMany({
      where: {
        projectId: {
          in: projects.map(p => p.id),
        },
      },
    });

    // Get unique matched items for all projects in a single query
    const matchRates = await Promise.all(
      projects.map(async (project) => {
        if (project._count.storeItems === 0) {
          return { projectId: project.id, matchRate: 0, uniqueMatchedItems: 0 };
        }
        
        // Use groupBy to count distinct store items more efficiently
        const uniqueMatchedCount = await prisma.matchCandidate.groupBy({
          by: ['storeItemId'],
          where: {
            projectId: project.id,
            status: { in: ['PENDING', 'CONFIRMED'] },
          },
          _count: true,
        }).then(results => results.length);
        
        const matchRate = uniqueMatchedCount / project._count.storeItems;
        
        return { projectId: project.id, matchRate, uniqueMatchedItems: uniqueMatchedCount };
      })
    );

    const progressMap = new Map(progressData.map(p => [p.projectId, p]));
    const matchRateMap = new Map(matchRates.map(m => [m.projectId, m]));

    return NextResponse.json({
      success: true,
      projects: projects.map(p => {
        const progress = progressMap.get(p.id);
        const matchData = matchRateMap.get(p.id);
        
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
          _count: {
            storeItems: p._count.storeItems,
            supplierItems: p._count.supplierItems,
            matchCandidates: p._count.matchCandidates,
          },
          progress: progress ? {
            currentStage: progress.currentStage,
            standardCompleted: progress.standardCompleted,
            aiCompleted: progress.aiCompleted,
            webSearchCompleted: progress.webSearchCompleted,
          } : undefined,
          matchRate: matchData?.matchRate,
          uniqueMatchedItems: matchData?.uniqueMatchedItems,
        };
      }),
    });
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch projects',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    const body = await req.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'Project name is required' },
        { status: 400 }
      );
    }

    const project = await prisma.project.create({
      data: {
        name,
        description: description || null,
      },
    });

    // Create default project settings
    await prisma.projectSettings.create({
      data: {
        projectId: project.id,
        autoConfirmMin: 0.92,
        reviewBandMin: 0.65,
        autoRejectMax: 0.40,
        aiEnabled: false,
      },
    });

    return NextResponse.json({
      success: true,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error creating project:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
