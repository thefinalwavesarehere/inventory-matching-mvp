import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { withAdmin } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
import { withRateLimit } from '@/app/lib/middleware/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/users/[id]/reset-password
 * Send password reset email (admin only)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withRateLimit(request, 'admin', () => withAdmin(request, async (context) => {
    try {
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

      // Log audit event
      await prisma.auditLog.create({
        data: {
          userId: context.user.id,
          entity: 'UserProfile',
          entityId: targetUser.id,
          action: 'PASSWORD_RESET_SENT',
          meta: {
            targetUserId: targetUser.id,
            targetUserEmail: targetUser.email,
            ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
          },
        },
      });

      apiLogger.info(
        { adminId: context.user.id, targetUserId: targetUser.id, targetEmail: targetUser.email },
        'Admin sent password reset email'
      );

      return NextResponse.json({
        success: true,
        message: `Password reset email sent to ${targetUser.email}`,
      });
    } catch (error: any) {
      apiLogger.error(
        { adminId: context.user.id, targetUserId: params.id, error: error.message },
        'Error sending password reset'
      );

      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
  }));
}
