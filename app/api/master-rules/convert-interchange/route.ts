/**
 * Convert Interchange Rules to Master Rules API
 * 
 * POST /api/master-rules/convert-interchange
 * 
 * Converts interchange rules (Interchange, PartNumberInterchange, InterchangeMapping)
 * into MasterRule entries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { convertAllInterchangesToMasterRules } from '@/app/lib/services/interchange-to-master-rules';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return withAuth(request, async (context) => {
    try {
    // Require authentication

    const body = await request.json();
    const { projectId } = body;

    apiLogger.info(`[CONVERT-INTERCHANGE] Starting conversion for ${projectId ? `project ${projectId}` : 'all projects'}...`);

    // Convert interchange rules to master rules
    const result = await convertAllInterchangesToMasterRules(
      projectId || undefined,
      context.user.id
    );

    return NextResponse.json({
      success: true,
      created: result.created,
      skipped: result.skipped,
      errors: result.errors,
      details: result.details.slice(0, 100), // Limit details to first 100
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
