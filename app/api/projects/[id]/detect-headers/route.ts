/**
 * Epic A5: Header Detection Endpoint
 * 
 * POST /api/projects/:id/detect-headers
 * 
 * Detects CSV headers and determines if column mapping is required.
 * This endpoint is called BEFORE the actual file upload to check if
 * the user needs to map columns.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FileTypeForMapping } from '@prisma/client';
import {
  detectHeadersAndMapping,
  getMissingFieldNames,
} from '@/app/lib/csv-header-detector';

export const dynamic = 'force-dynamic';

interface DetectHeadersRequest {
  fileType: FileTypeForMapping;
  csvPreview: string; // First few lines of the CSV file
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
    const body: DetectHeadersRequest = await request.json();

    const { fileType, csvPreview } = body;

    if (!fileType || !csvPreview) {
      return NextResponse.json(
        { error: 'fileType and csvPreview are required' },
        { status: 400 }
      );
    }

    // Detect headers and check if mapping is needed
    const detection = await detectHeadersAndMapping(
      csvPreview,
      projectId,
      fileType
    );

    // Convert Map to object for JSON serialization
    const mappingObject: Record<string, string> = {};
    if (detection.resolvedMapping) {
      detection.resolvedMapping.forEach((columnName, semanticRole) => {
        mappingObject[semanticRole] = columnName;
      });
    }

    return NextResponse.json({
      headers: detection.headers,
      needsMapping: detection.needsMapping,
      missingRoles: detection.missingRoles,
      missingFieldNames: getMissingFieldNames(detection.missingRoles),
      resolvedMapping: mappingObject,
    });
  } catch (error: any) {
    console.error('[DETECT_HEADERS] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to detect headers' },
      { status: 500 }
    );
  }
}
