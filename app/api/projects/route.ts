/**
 * Projects API
 * 
 * GET  /api/projects - List all projects
 * POST /api/projects - Create new project
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

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

    return NextResponse.json({
      success: true,
      projects: projects.map(p => ({
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
      })),
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

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
