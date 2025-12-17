/**
 * Epic A4: Part Number Interchange Import Endpoint
 * 
 * POST /api/projects/:id/import-part-number-interchange
 * 
 * Imports part number interchange mappings from CSV
 * 
 * CSV Format:
 * source_supplier_line_code,source_part_number,target_supplier_line_code,target_part_number,priority
 * GATES,K060485,DAYCO,5060485,10
 * PICO,1234,STANDARD,ST1234,5
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
    const requiredColumns = [
      'source_supplier_line_code',
      'source_part_number',
      'target_supplier_line_code',
      'target_part_number',
    ];
    const firstRecord = records[0];
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
      sourceSupplierLineCode: record.source_supplier_line_code?.trim() || '',
      sourcePartNumber: record.source_part_number?.trim() || '',
      targetSupplierLineCode: record.target_supplier_line_code?.trim() || '',
      targetPartNumber: record.target_part_number?.trim() || '',
      priority: record.priority ? parseInt(record.priority) : 0,
      active: true,
    }));

    // Filter out invalid records
    const validData = interchangeData.filter(
      (item: any) =>
        item.sourceSupplierLineCode &&
        item.sourcePartNumber &&
        item.targetSupplierLineCode &&
        item.targetPartNumber
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
      await tx.partNumberInterchange.deleteMany({
        where: { projectId },
      });

      // Insert new rules
      await tx.partNumberInterchange.createMany({
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
      message: 'Part number interchange imported successfully',
      ...result,
    });

  } catch (error: any) {
    console.error('[PART_NUMBER_INTERCHANGE_IMPORT] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import part number interchange' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/projects/:id/import-part-number-interchange
 * 
 * Download CSV template
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const template = `source_supplier_line_code,source_part_number,target_supplier_line_code,target_part_number,priority
GATES,K060485,DAYCO,5060485,10
PICO,1234,STANDARD,ST1234,5
DORMAN,926-299,STANDARD,DS299,3`;

  return new NextResponse(template, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="part_number_interchange_template.csv"',
    },
  });
}
