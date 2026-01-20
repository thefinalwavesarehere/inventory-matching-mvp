/**
 * P3: Line Code Mappings API
 *
 * GET  /api/line-code-mappings - List all mappings (project + global)
 * POST /api/line-code-mappings - Create a new mapping
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/lib/auth-helpers';
import { prisma } from '@/app/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const scope = searchParams.get('scope'); // 'project' | 'global' | 'all'

    // Fetch project-specific mappings
    let projectMappings: any[] = [];
    if (scope !== 'global') {
      const whereProject: any = {};
      if (projectId) {
        whereProject.projectId = projectId;
      }

      projectMappings = await prisma.projectLineCodeMapping.findMany({
        where: whereProject,
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Fetch global mappings
    let globalMappings: any[] = [];
    if (scope !== 'project') {
      globalMappings = await prisma.lineCodeMapping.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }

    // Normalize format
    const mappings = [
      ...projectMappings.map(m => ({
        id: m.id,
        scope: 'project' as const,
        projectId: m.projectId,
        projectName: m.project?.name,
        clientLineCode: m.sourceLineCode,
        manufacturerName: m.mappedManufacturer,
        manufacturerLineCode: m.mappedArnoldLineCode,
        confidence: m.confidence,
        source: m.status,
        notes: null,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
      ...globalMappings.map(m => ({
        id: m.id,
        scope: 'global' as const,
        projectId: null,
        projectName: null,
        clientLineCode: m.clientLineCode,
        manufacturerName: m.manufacturerName,
        manufacturerLineCode: m.arnoldLineCode,
        confidence: m.confidence,
        source: m.source,
        notes: m.notes,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      })),
    ];

    return NextResponse.json({
      success: true,
      mappings,
      count: mappings.length,
    });
  } catch (error: any) {
    console.error('[LINE-CODE-MAPPINGS] GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch mappings' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth();

    const body = await req.json();
    const {
      scope,
      projectId,
      clientLineCode,
      manufacturerName,
      manufacturerLineCode,
      confidence = 1.0,
      source = 'manual',
      notes,
    } = body;

    if (!scope || !clientLineCode || !manufacturerLineCode) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: scope, clientLineCode, manufacturerLineCode' },
        { status: 400 }
      );
    }

    if (scope !== 'project' && scope !== 'global') {
      return NextResponse.json(
        { success: false, error: 'Scope must be "project" or "global"' },
        { status: 400 }
      );
    }

    if (scope === 'project' && !projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId required for project-scoped mappings' },
        { status: 400 }
      );
    }

    // Create mapping
    let mapping: any;

    if (scope === 'project') {
      mapping = await prisma.projectLineCodeMapping.create({
        data: {
          projectId,
          sourceLineCode: clientLineCode.trim().toUpperCase(),
          mappedManufacturer: manufacturerName || null,
          mappedArnoldLineCode: manufacturerLineCode.trim().toUpperCase(),
          confidence,
          status: source === 'manual' ? 'MANUAL' : 'SUGGESTED',
        },
        include: {
          project: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return NextResponse.json({
        success: true,
        mapping: {
          id: mapping.id,
          scope: 'project',
          projectId: mapping.projectId,
          projectName: mapping.project?.name,
          clientLineCode: mapping.sourceLineCode,
          manufacturerName: mapping.mappedManufacturer,
          manufacturerLineCode: mapping.mappedArnoldLineCode,
          confidence: mapping.confidence,
          source: mapping.status,
          notes: null,
          createdAt: mapping.createdAt,
          updatedAt: mapping.updatedAt,
        },
      });
    } else {
      mapping = await prisma.lineCodeMapping.create({
        data: {
          clientLineCode: clientLineCode.trim().toUpperCase(),
          manufacturerName: manufacturerName || null,
          arnoldLineCode: manufacturerLineCode.trim().toUpperCase(),
          confidence,
          source,
          notes,
        },
      });

      return NextResponse.json({
        success: true,
        mapping: {
          id: mapping.id,
          scope: 'global',
          projectId: null,
          projectName: null,
          clientLineCode: mapping.clientLineCode,
          manufacturerName: mapping.manufacturerName,
          manufacturerLineCode: mapping.arnoldLineCode,
          confidence: mapping.confidence,
          source: mapping.source,
          notes: mapping.notes,
          createdAt: mapping.createdAt,
          updatedAt: mapping.updatedAt,
        },
      });
    }
  } catch (error: any) {
    console.error('[LINE-CODE-MAPPINGS] POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create mapping' },
      { status: 500 }
    );
  }
}
