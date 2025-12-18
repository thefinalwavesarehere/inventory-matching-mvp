import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { requireAdminRole } from '@/app/lib/auth-helpers';

const prisma = new PrismaClient();

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users
 * List all users (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin role
    await requireAdminRole();

    // Fetch all users
    const users = await prisma.userProfile.findMany({
      orderBy: [
        { role: 'asc' }, // ADMIN first
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json({
      success: true,
      users,
    });
  } catch (error: any) {
    console.error('[API] Error listing users:', error);
    
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
