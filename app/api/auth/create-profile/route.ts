import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';
import { withRateLimit } from '@/app/lib/middleware/rate-limit';
import { CreateProfileSchema, parseBody } from '@/app/lib/schemas';
export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/create-profile
 * Create a UserProfile record after Supabase signup
 */
export async function POST(request: NextRequest) {
  const rlResponse = await withRateLimit(request, 'auth', async () => NextResponse.json({ ok: true }));
  if (rlResponse.status === 429) return rlResponse;
  try {
    const body = await request.json();
    const parsed = parseBody(CreateProfileSchema, body);
    if (!parsed.success) return parsed.response;
    const { userId, email, fullName } = parsed.data;

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
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
