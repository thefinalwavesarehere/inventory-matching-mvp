/**
 * Convert Interchange Rules to Master Rules API
 * 
 * POST /api/master-rules/convert-interchange
 * 
 * Converts interchange rules (Interchange, PartNumberInterchange, InterchangeMapping)
 * into MasterRule entries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/app/lib/auth-helpers';
import { convertAllInterchangesToMasterRules } from '@/app/lib/services/interchange-to-master-rules';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const { profile } = await requireAuth();

    const body = await request.json();
    const { projectId } = body;

    console.log(`[CONVERT-INTERCHANGE] Starting conversion for ${projectId ? `project ${projectId}` : 'all projects'}...`);

    // Convert interchange rules to master rules
    const result = await convertAllInterchangesToMasterRules(
      projectId || undefined,
      profile.id
    );

    return NextResponse.json({
      success: true,
      created: result.created,
      skipped: result.skipped,
      errors: result.errors,
      details: result.details.slice(0, 100), // Limit details to first 100
    });
  } catch (error: any) {
    console.error('[CONVERT-INTERCHANGE] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to convert interchange rules' },
      { status: 500 }
    );
  }
}
