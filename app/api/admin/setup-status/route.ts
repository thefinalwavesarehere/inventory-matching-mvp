import { NextRequest, NextResponse } from 'next/server';
import { apiLogger } from '@/app/lib/structured-logger';
import { getSetupStatus } from '@/app/lib/matching/auto-setup';
import { withAdmin } from '@/app/lib/middleware/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/setup-status
 *
 * Returns detailed status of matching system setup.
 * Restricted to ADMIN role.
 */
export async function GET(req: NextRequest) {
  return withAdmin(req, async (_context) => {
    try {
      const status = await getSetupStatus();

      return NextResponse.json({
        success: true,
        status,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      apiLogger.error({ error: error.message }, '[SETUP_STATUS_API] Error');

      return NextResponse.json({
        success: false,
        error: error.message || 'Failed to get setup status',
        timestamp: new Date().toISOString(),
      }, { status: 500 });
    }
  });
}
