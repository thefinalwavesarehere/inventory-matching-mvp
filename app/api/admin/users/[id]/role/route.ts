import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAdminRole } from '@/app/lib/auth-helpers';
import { logActivity } from '@/app/lib/logger';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/users/[id]/role
 * Change user role (admin only)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Require admin role
    const { profile: adminProfile } = await requireAdminRole();

    const body = await request.json();
    const { role } = body;

    if (!role || !['ADMIN', 'EDITOR', 'VIEWER'].includes(role)) {
      return NextResponse.json(
        { success: false, error: 'Invalid role' },
        { status: 400 }
      );
    }

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
    if (targetUser.id === adminProfile.id) {
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
      userId: adminProfile.id,
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
    console.error('[API] Error changing user role:', error);
    
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
