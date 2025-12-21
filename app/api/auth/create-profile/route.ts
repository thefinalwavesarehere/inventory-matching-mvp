import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';


export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/create-profile
 * Create a UserProfile record after Supabase signup
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, email, fullName } = body;

    if (!userId || !email) {
      return NextResponse.json(
        { success: false, error: 'Missing userId or email' },
        { status: 400 }
      );
    }

    // Check if profile already exists
    const existing = await prisma.userProfile.findUnique({
      where: { id: userId },
    });

    if (existing) {
      return NextResponse.json({
        success: true,
        profile: existing,
        message: 'Profile already exists',
      });
    }

    // Create new user profile
    const profile = await prisma.userProfile.create({
      data: {
        id: userId, // Must match Supabase auth.users.id
        email,
        fullName: fullName || null,
        role: 'EDITOR', // Default role
      },
    });

    return NextResponse.json({
      success: true,
      profile,
    });
  } catch (error: any) {
    console.error('[API] Error creating user profile:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
