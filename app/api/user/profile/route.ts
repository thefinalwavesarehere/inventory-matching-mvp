import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '@/app/lib/auth-helpers';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

/**
 * PUT /api/user/profile
 * Update current user's profile
 */
export async function PUT(request: NextRequest) {
  try {
    const { session, profile } = await requireAuth();

    const body = await request.json();
    const { fullName } = body;

    // Update profile
    const updatedProfile = await prisma.userProfile.update({
      where: { id: profile.id },
      data: {
        fullName: fullName || null,
      },
    });

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
    });
  } catch (error: any) {
    console.error('[API] Error updating profile:', error);
    
    if (error.message === 'Authentication required') {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
