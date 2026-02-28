import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';
import { logActivity } from '@/app/lib/logger';


import { withAdmin } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
import { withRateLimit } from '@/app/lib/middleware/rate-limit';
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withRateLimit(request, 'admin', () => withAdmin(request, async (context) => {
    try {
    // Verify admin role
    
    const userId = params.id;

    // Get current user state
    const user = await prisma.userProfile.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Update user approval status
    const updatedUser = await prisma.userProfile.update({
      where: { id: userId },
      data: { isApproved: true },
    });

    // Log the approval action
    await logActivity({
      action: 'USER_APPROVED',
      userId: context.user.id,
      details: {
        targetUserId: userId,
        targetUserEmail: user.email,
        targetUserName: user.fullName,
        approvedBy: context.user.email,
      },
    });

    return NextResponse.json({
      message: 'User approved successfully',
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

// Endpoint to reject/unapprove a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return withAdmin(request, async (context) => {
    try {
    // Verify admin role
    
    const userId = params.id;

    // Get current user state
    const user = await prisma.userProfile.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Prevent unapproving admins
    if (user.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Cannot unapprove admin users' },
        { status: 400 }
      );
    }

    // Update user approval status
    const updatedUser = await prisma.userProfile.update({
      where: { id: userId },
      data: { isApproved: false },
    });

    // Log the unapproval action
    await logActivity({
      action: 'USER_UNAPPROVED',
      userId: context.user.id,
      details: {
        targetUserId: userId,
        targetUserEmail: user.email,
        targetUserName: user.fullName,
        unapprovedBy: context.user.email,
      },
    });

    return NextResponse.json({
      message: 'User approval revoked successfully',
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
