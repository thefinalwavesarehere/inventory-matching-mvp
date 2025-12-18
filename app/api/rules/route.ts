import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, VendorAction } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

/**
 * GET /api/rules
 * List all global rules (projectId = null)
 */
export async function GET(request: NextRequest) {
  try {
    const rules = await prisma.vendorActionRule.findMany({
      where: {
        projectId: null,
      },
      orderBy: [
        { supplierLineCode: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({
      success: true,
      rules: rules.map(rule => ({
        ...rule,
        scope: 'global',
      })),
    });
  } catch (error: any) {
    console.error('[API] Error fetching global rules:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/rules
 * Create a new global rule (admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      supplierLineCode,
      categoryPattern,
      subcategoryPattern,
      action,
      active = true,
    } = body;

    // Validation
    if (!supplierLineCode || !categoryPattern || !subcategoryPattern || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate action enum
    const validActions: VendorAction[] = ['NONE', 'LIFT', 'REBOX', 'UNKNOWN', 'CONTACT_VENDOR'];
    if (!validActions.includes(action as VendorAction)) {
      return NextResponse.json(
        { success: false, error: 'Invalid vendor action' },
        { status: 400 }
      );
    }

    // Create global rule (projectId = null)
    const rule = await prisma.vendorActionRule.create({
      data: {
        projectId: null, // Global rule
        supplierLineCode: supplierLineCode.trim().toUpperCase(),
        categoryPattern: categoryPattern.trim(),
        subcategoryPattern: subcategoryPattern.trim(),
        action: action as VendorAction,
        active,
      },
    });

    return NextResponse.json({
      success: true,
      rule: {
        ...rule,
        scope: 'global',
      },
    });
  } catch (error: any) {
    console.error('[API] Error creating global rule:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
