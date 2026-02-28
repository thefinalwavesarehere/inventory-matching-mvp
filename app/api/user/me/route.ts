import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/user/me
 * Get current user's profile
 */
export async function GET(request: NextRequest) {
  return withAuth(request, async (context) => {
    try {
      apiLogger.info(
        { userId: context.user.id },
        'User fetched own profile'
      );

      return NextResponse.json({
        success: true,
        profile: context.user,
        user: {
          id: context.supabaseUserId,
          email: context.user.email,
        },
      });
    } catch (error: any) {
      apiLogger.error(
        { userId: context.user.id, error: error.message },
        'Error fetching user profile'
      );

      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
  });
}
