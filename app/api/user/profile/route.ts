import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';


import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/user/profile
 * Update current user's profile
 */
export async function PUT(request: NextRequest) {
  return withAuth(request, async (context) => {
    try {

    const body = await request.json();
    const { fullName } = body;

    // Update context.user
    const updatedProfile = await prisma.userProfile.update({
      where: { id: context.user.id },
      data: {
        fullName: fullName || null,
      },
    });

    return NextResponse.json({
      success: true,
      context.user: updatedProfile,
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
