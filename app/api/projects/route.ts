/**
 * Projects API
 * 
 * GET  /api/projects - List all projects
 * POST /api/projects - Create new project
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import prisma from '@/app/lib/db/prisma';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
import { withRateLimit } from '@/app/lib/middleware/rate-limit';
import { CreateProjectSchema, parseBody } from '@/app/lib/schemas';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  return withAuth(req, async (context) => {
    try {
    // Require authentication

    // Tenant isolation: ADMINs see all projects; others see only their own
    const ownerFilter = context.user.role === 'ADMIN'
      ? {}
      : { createdById: context.user.id };

    const projects = await prisma.project.findMany({
      where: ownerFilter,
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
    apiLogger.error({ error: error.message }, 'Handler error');
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
  });
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, 'api', () => withAuth(req, async (context) => {
    try {
    // Require authentication

    const body = await req.json();
    const parsed = parseBody(CreateProjectSchema, body);
    if (!parsed.success) return parsed.response;
    const { name, description } = parsed.data;

    const project = await prisma.project.create({
      data: {
        name,
        description: description ?? null,
        createdById: context.user.id,  // Stamp owner for tenant isolation
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
  
  } catch (error: any) {
    apiLogger.error({ error: error.message }, 'Handler error');
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
  }));
}
