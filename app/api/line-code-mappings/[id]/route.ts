/**
 * P3: Line Code Mapping Delete API
 *
 * DELETE /api/line-code-mappings/:id - Delete a mapping
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/lib/auth-helpers';
import { prisma } from '@/app/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();

    const { id } = params;
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope'); // 'project' or 'global'

    if (!scope || (scope !== 'project' && scope !== 'global')) {
      return NextResponse.json(
        { success: false, error: 'Scope parameter required (project or global)' },
        { status: 400 }
      );
    }

    // Delete from appropriate table
    if (scope === 'project') {
      await prisma.projectLineCodeMapping.delete({
        where: { id },
      });
    } else {
      await prisma.lineCodeMapping.delete({
        where: { id },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Mapping deleted successfully',
    });
  } catch (error: any) {
    console.error('[LINE-CODE-MAPPINGS] DELETE error:', error);

    if (error.code === 'P2025') {
      return NextResponse.json(
        { success: false, error: 'Mapping not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete mapping' },
      { status: 500 }
    );
  }
}
