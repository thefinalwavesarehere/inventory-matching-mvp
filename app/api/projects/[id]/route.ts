/**
 * Individual Project API
 * GET    /api/projects/[id] - Get project details
 * PUT    /api/projects/[id] - Update project
 * DELETE /api/projects/[id] - Delete project
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import { requireAuth } from '@/app/lib/auth-helpers';
import prisma from '@/app/lib/db/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require authentication
    await requireAuth();

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
  } catch (error) {
    console.error('Error fetching project:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require authentication
    await requireAuth();

    const body = await req.json();
    const { name, description } = body;

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
  } catch (error) {
    console.error('Error updating project:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require authentication
    await requireAuth();

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
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
