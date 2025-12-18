import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAdminRole } from '@/app/lib/auth-helpers';
import { logActivity } from '@/app/lib/activity-logger';

const prisma = new PrismaClient();

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify admin role
    const adminUser = await requireAdminRole();
    
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
      userId: adminUser.id,
      details: {
        targetUserId: userId,
        targetUserEmail: user.email,
        targetUserName: user.fullName,
        approvedBy: adminUser.email,
      },
    });

    return NextResponse.json({
      message: 'User approved successfully',
      user: updatedUser,
    });
  } catch (error: any) {
    console.error('Error approving user:', error);
    
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to approve user' },
      { status: 500 }
    );
  }
}

// Endpoint to reject/unapprove a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Verify admin role
    const adminUser = await requireAdminRole();
    
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
      userId: adminUser.id,
      details: {
        targetUserId: userId,
        targetUserEmail: user.email,
        targetUserName: user.fullName,
        unapprovedBy: adminUser.email,
      },
    });

    return NextResponse.json({
      message: 'User approval revoked successfully',
      user: updatedUser,
    });
  } catch (error: any) {
    console.error('Error unapproving user:', error);
    
    if (error.message === 'Unauthorized') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 403 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to unapprove user' },
      { status: 500 }
    );
  }
}
