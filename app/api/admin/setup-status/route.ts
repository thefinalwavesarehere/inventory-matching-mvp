import { NextResponse } from 'next/server';
import { getSetupStatus } from '@/app/lib/matching/auto-setup';

/**
 * GET /api/admin/setup-status
 * 
 * Returns detailed status of matching system setup
 */
export async function GET() {
  try {
    const status = await getSetupStatus();
    
    return NextResponse.json({
      success: true,
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[SETUP_STATUS_API] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to get setup status',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
