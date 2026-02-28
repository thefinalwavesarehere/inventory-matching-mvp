/**
 * P3: Line Code Preprocessing Trigger API
 *
 * POST /api/projects/:id/preprocess-line-codes
 *
 * Applies line code mappings to all store items in the project
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyLineCodePreprocessing } from '@/app/lib/line-code-preprocessor';
import { prisma } from '@/app/lib/db/prisma';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async (context) => {
    try {

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

    apiLogger.info(`[PREPROCESS-LINE-CODES] Starting preprocessing for project ${projectId}`);

    // Apply preprocessing
    const result = await applyLineCodePreprocessing(projectId);

    apiLogger.info(`[PREPROCESS-LINE-CODES] Completed: ${result.itemsMapped}/${result.totalItems} items mapped`);

    return NextResponse.json({
      success: true,
      ...result,
      message: `Preprocessed ${result.totalItems} items, ${result.itemsMapped} mapped successfully`,
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
