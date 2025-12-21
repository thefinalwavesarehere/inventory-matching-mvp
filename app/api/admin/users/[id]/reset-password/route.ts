import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { requireAdminRole } from '@/app/lib/auth-helpers';
import { logActivity } from '@/app/lib/logger';


export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/users/[id]/reset-password
 * Send password reset email (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require admin role
    const { profile: adminProfile } = await requireAdminRole();

    // Get target user
    const targetUser = await prisma.userProfile.findUnique({
      where: { id: params.id },
    });

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Send password reset email via Supabase
    const supabase = createRouteHandlerClient({ cookies });
    const { error } = await supabase.auth.resetPasswordForEmail(targetUser.email, {
      redirectTo: `${request.nextUrl.origin}/auth/reset-password`,
    });

    if (error) {
      throw error;
    }

    // Log activity
    await logActivity({
      userId: adminProfile.id,
      action: 'PASSWORD_RESET_SENT',
      details: {
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
      },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
    });

    return NextResponse.json({
      success: true,
      message: `Password reset email sent to ${targetUser.email}`,
    });
  } catch (error: any) {
    console.error('[API] Error sending password reset:', error);
    
    if (error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    if (error.message === 'Admin role required') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
