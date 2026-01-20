/**
 * P3: Line Code Preprocessing Trigger API
 *
 * POST /api/projects/:id/preprocess-line-codes
 *
 * Applies line code mappings to all store items in the project
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/lib/auth-helpers';
import { applyLineCodePreprocessing } from '@/app/lib/line-code-preprocessor';
import { prisma } from '@/app/lib/db/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();

    const projectId = params.id;

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    console.log(`[PREPROCESS-LINE-CODES] Starting preprocessing for project ${projectId}`);

    // Apply preprocessing
    const result = await applyLineCodePreprocessing(projectId);

    console.log(`[PREPROCESS-LINE-CODES] Completed: ${result.itemsMapped}/${result.totalItems} items mapped`);

    return NextResponse.json({
      success: true,
      ...result,
      message: `Preprocessed ${result.totalItems} items, ${result.itemsMapped} mapped successfully`,
    });
  } catch (error: any) {
    console.error('[PREPROCESS-LINE-CODES] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to preprocess line codes' },
      { status: 500 }
    );
  }
}
