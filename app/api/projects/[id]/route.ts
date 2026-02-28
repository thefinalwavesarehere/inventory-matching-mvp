/**
 * Individual Project API
 * GET    /api/projects/[id] - Get project details
 * PUT    /api/projects/[id] - Update project
 * DELETE /api/projects/[id] - Delete project
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import prisma from '@/app/lib/db/prisma';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
import { UpdateProjectSchema, parseBody } from '@/app/lib/schemas';
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async (context) => {
    try {
    // Require authentication

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            storeItems: true,
            supplierItems: true,
            interchanges: true,
            matchCandidates: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      project,
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

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async (context) => {
    try {
    // Require authentication

    const body = await req.json();
    const parsed = parseBody(UpdateProjectSchema, body);
    if (!parsed.success) return parsed.response;
    const { name, description } = parsed.data;

    const project = await prisma.project.update({
      where: { id: params.id },
      data: {
        name: name || undefined,
        description: description !== undefined ? description : undefined,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      project,
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async (context) => {
    try {
    // Require authentication

    // Delete all related data first (cascade)
    await prisma.$transaction([
      prisma.matchCandidate.deleteMany({ where: { projectId: params.id } }),
      prisma.interchange.deleteMany({ where: { projectId: params.id } }),
      prisma.supplierItem.deleteMany({ where: { projectId: params.id } }),
      prisma.storeItem.deleteMany({ where: { projectId: params.id } }),
      prisma.project.delete({ where: { id: params.id } }),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Project deleted successfully',
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
