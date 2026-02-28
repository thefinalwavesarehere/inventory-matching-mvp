/**
 * P3: Apply Vendor Actions API
 * 
 * POST /api/projects/[id]/apply-vendor-actions
 * Evaluates vendor action rules and applies them to all matches in a project
 */

import { NextRequest, NextResponse } from 'next/server';
import { applyVendorActionsToMatches } from '@/app/lib/vendor-action-evaluator';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAuth(req, async (context) => {
    try {

    const projectId = params.id;

    apiLogger.info(`[VENDOR-ACTIONS] Applying vendor action rules for project ${projectId}`);

    const result = await applyVendorActionsToMatches(projectId);

    apiLogger.info(`[VENDOR-ACTIONS] Applied ${result.actionsApplied}/${result.totalMatches} actions`);
    apiLogger.info(`[VENDOR-ACTIONS] Action breakdown:`, result.actionCounts);

    return NextResponse.json({
      success: true,
      ...result,
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
