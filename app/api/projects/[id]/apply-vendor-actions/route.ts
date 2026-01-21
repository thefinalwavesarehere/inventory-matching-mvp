/**
 * P3: Apply Vendor Actions API
 * 
 * POST /api/projects/[id]/apply-vendor-actions
 * Evaluates vendor action rules and applies them to all matches in a project
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/lib/auth-helpers';
import { applyVendorActionsToMatches } from '@/app/lib/vendor-action-evaluator';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth();

    const projectId = params.id;

    console.log(`[VENDOR-ACTIONS] Applying vendor action rules for project ${projectId}`);

    const result = await applyVendorActionsToMatches(projectId);

    console.log(`[VENDOR-ACTIONS] Applied ${result.actionsApplied}/${result.totalMatches} actions`);
    console.log(`[VENDOR-ACTIONS] Action breakdown:`, result.actionCounts);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[VENDOR-ACTIONS] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to apply vendor actions' },
      { status: 500 }
    );
  }
}
