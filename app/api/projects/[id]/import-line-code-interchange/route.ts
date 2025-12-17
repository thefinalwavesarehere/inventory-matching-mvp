/**
 * Epic A4: Line Code Interchange Import Endpoint
 * 
 * POST /api/projects/:id/import-line-code-interchange
 * 
 * Imports line code interchange mappings from CSV
 * 
 * CSV Format:
 * source_line_code,target_line_code,priority
 * GATES,DAYCO,10
 * PICO,STANDARD,5
 */

import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    // Get form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Read file content
    const content = await file.text();

    // Parse CSV
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length === 0) {
      return NextResponse.json(
        { error: 'CSV file is empty' },
        { status: 400 }
      );
    }

    // Validate required columns
    const requiredColumns = ['source_line_code', 'target_line_code'];
    const firstRecord = records[0] as any;
    const missingColumns = requiredColumns.filter(col => !(col in firstRecord));

    if (missingColumns.length > 0) {
      return NextResponse.json(
        { error: `Missing required columns: ${missingColumns.join(', ')}` },
        { status: 400 }
      );
    }

    // Prepare data for insertion
    const interchangeData = records.map((record: any) => ({
      projectId,
      sourceLineCode: record.source_line_code?.trim() || '',
      targetLineCode: record.target_line_code?.trim() || '',
      priority: record.priority ? parseInt(record.priority) : 0,
      active: true,
    }));

    // Filter out invalid records
    const validData = interchangeData.filter(
      (item: any) => item.sourceLineCode && item.targetLineCode
    );

    if (validData.length === 0) {
      return NextResponse.json(
        { error: 'No valid records found in CSV' },
        { status: 400 }
      );
    }

    // Insert in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Delete existing interchange rules for this project
      await tx.lineCodeInterchange.deleteMany({
        where: { projectId },
      });

      // Insert new rules
      await tx.lineCodeInterchange.createMany({
        data: validData,
      });

      return {
        totalRows: records.length,
        validRows: validData.length,
        invalidRows: records.length - validData.length,
      };
    });

    return NextResponse.json({
      success: true,
      message: 'Line code interchange imported successfully',
      ...result,
    });

  } catch (error: any) {
    console.error('[LINE_CODE_INTERCHANGE_IMPORT] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import line code interchange' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/:id/import-line-code-interchange
 * 
 * Download CSV template
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const template = `source_line_code,target_line_code,priority
GATES,DAYCO,10
PICO,STANDARD,5
DORMAN,STANDARD,3`;

  return new NextResponse(template, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="line_code_interchange_template.csv"',
    },
  });
}
