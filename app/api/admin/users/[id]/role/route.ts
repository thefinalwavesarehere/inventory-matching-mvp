import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';
import { logActivity } from '@/app/lib/logger';


import { withAdmin } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
import { withRateLimit } from '@/app/lib/middleware/rate-limit';
import { ChangeUserRoleSchema, parseBody } from '@/app/lib/schemas';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/users/[id]/role
 * Change user role (admin only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withRateLimit(request, 'admin', () => withAdmin(request, async (context) => {
    try {
    // Require admin role

    const body = await request.json();
    const parsed = parseBody(ChangeUserRoleSchema, body);
    if (!parsed.success) return parsed.response;
    const { role } = parsed.data;

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

    // Prevent changing own role
    if (targetUser.id === context.user.id) {
      return NextResponse.json(
        { success: false, error: 'Cannot change your own role' },
        { status: 400 }
      );
    }

    const oldRole = targetUser.role;

    // Update role
    const updatedUser = await prisma.userProfile.update({
      where: { id: params.id },
      data: { role },
    });

    // Log activity
    await logActivity({
      userId: context.user.id,
      action: 'USER_ROLE_CHANGED',
      details: {
        targetUserId: targetUser.id,
        targetUserEmail: targetUser.email,
        oldRole,
        newRole: role,
      },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  
  } catch (error: any) {
    apiLogger.error({ error: error.message }, 'Handler error');
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
  }));
}
