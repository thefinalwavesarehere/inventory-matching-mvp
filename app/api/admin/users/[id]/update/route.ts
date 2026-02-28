import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';
import { logActivity } from '@/app/lib/logger';


import { withAdmin } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/admin/users/[id]/update
 * Update user details (name, email) - Admin only
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAdmin(request, async (context) => {
    try {
    // Require admin role

    const body = await request.json();
    const { fullName, email } = body;
    const userId = params.id;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Get existing user
    const existingUser = await prisma.userProfile.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    // Update user profile
    const updatedUser = await prisma.userProfile.update({
      where: { id: userId },
      data: {
        fullName: fullName !== undefined ? fullName : existingUser.fullName,
        email: email !== undefined ? email : existingUser.email,
      },
    });

    // Log the activity
    await logActivity({
      userId: context.user.id,
      projectId: null,
      action: 'USER_UPDATED',
      details: {
        targetUserId: userId,
        targetUserEmail: updatedUser.email,
        changes: {
          fullName: fullName !== existingUser.fullName ? { from: existingUser.fullName, to: fullName } : undefined,
          email: email !== existingUser.email ? { from: existingUser.email, to: email } : undefined,
        },
      },
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
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
  });
}
