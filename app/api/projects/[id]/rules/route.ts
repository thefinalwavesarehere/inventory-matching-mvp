import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, VendorAction } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/rules
 * List all rules for a project (project-specific + global)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;

    // Fetch both project-specific and global rules
    const rules = await prisma.vendorActionRule.findMany({
      where: {
        OR: [
          { projectId: projectId },
          { projectId: null },
        ],
      },
      orderBy: [
        { projectId: 'desc' }, // Project-specific first
        { supplierLineCode: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({
      success: true,
      rules: rules.map(rule => ({
        ...rule,
        scope: rule.projectId ? 'project' : 'global',
      })),
    });
  } catch (error: any) {
    console.error('[API] Error fetching rules:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/projects/:id/rules
 * Create a new project-specific rule
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = params.id;
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

    // Create rule
    const rule = await prisma.vendorActionRule.create({
      data: {
        projectId,
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
        scope: 'project',
      },
    });
  } catch (error: any) {
    console.error('[API] Error creating rule:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
