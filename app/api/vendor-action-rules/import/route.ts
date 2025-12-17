/**
 * Vendor Action Rules Import Endpoint
 * 
 * POST /api/vendor-action-rules/import
 * 
 * Imports vendor action rules from CSV file
 * 
 * CSV Format:
 * supplier_line_code,category,subcategory,action
 * GATES,belts,V-belt,LIFT
 * GATES,belts,*,REBOX
 * GATES,*,*,UNKNOWN
 */

import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import prisma from '@/app/lib/db/prisma';
import { VendorAction } from '@prisma/client';

const VALID_VENDOR_ACTIONS: VendorAction[] = ['NONE', 'LIFT', 'REBOX', 'UNKNOWN', 'CONTACT_VENDOR'];

interface RuleRow {
  supplier_line_code: string;
  category: string;
  subcategory: string;
  action: string;
}

interface ValidationError {
  row: number;
  error: string;
}

export async function POST(request: NextRequest) {
  try {
    // Parse form data
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
    let rows: RuleRow[];
    try {
      rows = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (error: any) {
      return NextResponse.json(
        { error: `CSV parsing failed: ${error.message}` },
        { status: 400 }
      );
    }

    // Validate rows
    const errors: ValidationError[] = [];
    const validRules: Array<{
      supplierLineCode: string;
      categoryPattern: string;
      subcategoryPattern: string;
      action: VendorAction;
    }> = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2; // +2 because index is 0-based and header is row 1

      // Validate required fields
      if (!row.supplier_line_code || row.supplier_line_code.trim() === '') {
        errors.push({
          row: rowNumber,
          error: 'Missing supplier_line_code',
        });
        return;
      }

      if (!row.category || row.category.trim() === '') {
        errors.push({
          row: rowNumber,
          error: 'Missing category',
        });
        return;
      }

      if (!row.subcategory || row.subcategory.trim() === '') {
        errors.push({
          row: rowNumber,
          error: 'Missing subcategory',
        });
        return;
      }

      if (!row.action || row.action.trim() === '') {
        errors.push({
          row: rowNumber,
          error: 'Missing action',
        });
        return;
      }

      // Validate action value
      const action = row.action.toUpperCase() as VendorAction;
      if (!VALID_VENDOR_ACTIONS.includes(action)) {
        errors.push({
          row: rowNumber,
          error: `Invalid action: "${row.action}". Must be one of: ${VALID_VENDOR_ACTIONS.join(', ')}`,
        });
        return;
      }

      // Add to valid rules
      validRules.push({
        supplierLineCode: row.supplier_line_code.trim(),
        categoryPattern: row.category.trim(),
        subcategoryPattern: row.subcategory.trim(),
        action,
      });
    });

    // If there are validation errors, return them
    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          totalRows: rows.length,
          validRows: validRules.length,
          invalidRows: errors.length,
          errors,
          message: `Found ${errors.length} validation error(s). No rules were imported.`,
        },
        { status: 400 }
      );
    }

    // Check if user wants to replace existing rules or append
    const replaceExisting = formData.get('replaceExisting') === 'true';

    if (replaceExisting) {
      // Delete all existing rules
      await prisma.vendorActionRule.deleteMany({});
      console.log('[VENDOR_ACTION_RULES] Deleted all existing rules');
    }

    // Import rules
    const result = await prisma.vendorActionRule.createMany({
      data: validRules,
      skipDuplicates: true,
    });

    console.log(`[VENDOR_ACTION_RULES] Imported ${result.count} rules`);

    return NextResponse.json({
      success: true,
      totalRows: rows.length,
      importedRows: result.count,
      skippedRows: rows.length - result.count,
      replaceExisting,
      message: `Successfully imported ${result.count} vendor action rule(s).`,
    });

  } catch (error: any) {
    console.error('[VENDOR_ACTION_RULES] Import error:', error);
    return NextResponse.json(
      { error: `Import failed: ${error.message}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/vendor-action-rules/import
 * 
 * Returns a sample CSV template for downloading
 */
export async function GET() {
  const template = `supplier_line_code,category,subcategory,action
GATES,belts,V-belt,LIFT
GATES,belts,tensioners/pulleys,REBOX
GATES,hoses,*,UNKNOWN
PICO,wiring,connectors,LIFT
EXAMPLE_BRAND,parts,*,CONTACT_VENDOR`;

  return new NextResponse(template, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="vendor_action_rules_template.csv"',
    },
  });
}
