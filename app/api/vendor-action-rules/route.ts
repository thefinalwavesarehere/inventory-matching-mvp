/**
 * Vendor Action Rules API
 * 
 * GET /api/vendor-action-rules - List all rules
 * DELETE /api/vendor-action-rules - Delete all rules
 */

import { NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';

/**
 * GET - List all vendor action rules
 */
export async function GET() {
  try {
    const rules = await prisma.vendorActionRule.findMany({
      orderBy: [
        { supplierLineCode: 'asc' },
        { categoryPattern: 'asc' },
        { subcategoryPattern: 'asc' },
      ],
    });

    return NextResponse.json({
      success: true,
      count: rules.length,
      rules,
    });
  } catch (error: any) {
    console.error('[VENDOR_ACTION_RULES] List error:', error);
    return NextResponse.json(
      { error: `Failed to list rules: ${error.message}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete all vendor action rules
 */
export async function DELETE() {
  try {
    const result = await prisma.vendorActionRule.deleteMany({});

    console.log(`[VENDOR_ACTION_RULES] Deleted ${result.count} rules`);

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      message: `Deleted ${result.count} vendor action rule(s)`,
    });
  } catch (error: any) {
    console.error('[VENDOR_ACTION_RULES] Delete error:', error);
    return NextResponse.json(
      { error: `Failed to delete rules: ${error.message}` },
      { status: 500 }
    );
  }
}
