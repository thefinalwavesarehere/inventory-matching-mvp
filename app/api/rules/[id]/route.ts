import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient, VendorAction } from '@prisma/client';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

/**
 * PUT /api/rules/:id
 * Update an existing rule
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ruleId = params.id;
    const body = await request.json();

    const {
      supplierLineCode,
      categoryPattern,
      subcategoryPattern,
      action,
      active,
    } = body;

    // Build update data
    const updateData: any = {};
    
    if (supplierLineCode !== undefined) {
      updateData.supplierLineCode = supplierLineCode.trim().toUpperCase();
    }
    if (categoryPattern !== undefined) {
      updateData.categoryPattern = categoryPattern.trim();
    }
    if (subcategoryPattern !== undefined) {
      updateData.subcategoryPattern = subcategoryPattern.trim();
    }
    if (action !== undefined) {
      // Validate action enum
      const validActions: VendorAction[] = ['NONE', 'LIFT', 'REBOX', 'UNKNOWN', 'CONTACT_VENDOR'];
      if (!validActions.includes(action as VendorAction)) {
        return NextResponse.json(
          { success: false, error: 'Invalid vendor action' },
          { status: 400 }
        );
      }
      updateData.action = action as VendorAction;
    }
    if (active !== undefined) {
      updateData.active = active;
    }

    // Update rule
    const rule = await prisma.vendorActionRule.update({
      where: { id: ruleId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      rule: {
        ...rule,
        scope: rule.projectId ? 'project' : 'global',
      },
    });
  } catch (error: any) {
    console.error('[API] Error updating rule:', error);
    
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Rule not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/rules/:id
 * Delete a rule
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ruleId = params.id;

    await prisma.vendorActionRule.delete({
      where: { id: ruleId },
    });

    return NextResponse.json({
      success: true,
      message: 'Rule deleted successfully',
    });
  } catch (error: any) {
    console.error('[API] Error deleting rule:', error);
    
    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Rule not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
