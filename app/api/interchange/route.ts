import { NextResponse } from 'next/server';
// Migrated to Supabase auth
import { requireAuth } from '@/app/lib/auth-helpers';
import prisma from '@/app/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Require authentication
    await requireAuth();

    const count = await prisma.interchange.count();

    return NextResponse.json({
      success: true,
      count,
    });
  } catch (error: any) {
    console.error('[INTERCHANGE-API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
