/**
 * P3: Line Code Mapping Delete API
 *
 * DELETE /api/line-code-mappings/:id - Delete a mapping
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async (context) => {
    try {

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
    apiLogger.error({ error: error.message }, 'Handler error');
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
  });
}
