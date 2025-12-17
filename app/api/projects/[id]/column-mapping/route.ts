/**
 * Epic A5: Column Mapping API
 * 
 * POST /api/projects/:id/column-mapping
 * 
 * Save or update column mappings for a project and file type.
 * Allows users to map arbitrary CSV headers to system semantic roles.
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, FileTypeForMapping } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

interface ColumnMappingRequest {
  fileType: FileTypeForMapping;
  mappings: {
    semanticRole: string;
    columnName: string;
  }[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const body: ColumnMappingRequest = await request.json();

    const { fileType, mappings } = body;

    if (!fileType || !mappings || !Array.isArray(mappings)) {
      return NextResponse.json(
        { error: 'Invalid request body. Expected fileType and mappings array.' },
        { status: 400 }
      );
    }

    // Validate fileType
    const validFileTypes: FileTypeForMapping[] = [
      'STORE_INVENTORY',
      'SUPPLIER_CATALOG',
      'LINE_CODE_INTERCHANGE',
      'PART_NUMBER_INTERCHANGE',
    ];

    if (!validFileTypes.includes(fileType)) {
      return NextResponse.json(
        { error: `Invalid fileType. Must be one of: ${validFileTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Delete existing mappings for this project + fileType
    await prisma.fileColumnMapping.deleteMany({
      where: {
        projectId,
        fileType,
      },
    });

    // Create new mappings
    const createdMappings = await prisma.fileColumnMapping.createMany({
      data: mappings.map((mapping) => ({
        projectId,
        fileType,
        semanticRole: mapping.semanticRole,
        columnName: mapping.columnName,
      })),
    });

    console.log(
      `[COLUMN_MAPPING] Saved ${createdMappings.count} mappings for project ${projectId}, fileType ${fileType}`
    );

    return NextResponse.json({
      success: true,
      count: createdMappings.count,
      mappings,
    });
  } catch (error: any) {
    console.error('[COLUMN_MAPPING] Error saving mappings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save column mappings' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/:id/column-mapping?fileType=STORE_INVENTORY
 * 
 * Retrieve existing column mappings for a project and file type.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const { searchParams } = new URL(request.url);
    const fileType = searchParams.get('fileType') as FileTypeForMapping | null;

    if (!fileType) {
      return NextResponse.json(
        { error: 'fileType query parameter is required' },
        { status: 400 }
      );
    }

    const mappings = await prisma.fileColumnMapping.findMany({
      where: {
        projectId,
        fileType,
      },
      orderBy: {
        semanticRole: 'asc',
      },
    });

    return NextResponse.json({
      fileType,
      mappings: mappings.map((m) => ({
        semanticRole: m.semanticRole,
        columnName: m.columnName,
      })),
    });
  } catch (error: any) {
    console.error('[COLUMN_MAPPING] Error fetching mappings:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch column mappings' },
      { status: 500 }
    );
  }
}
