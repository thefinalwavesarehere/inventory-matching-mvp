import { NextRequest, NextResponse } from 'next/server';
import { withAdmin } from '@/app/lib/middleware/auth';
import { prisma } from '@/app/lib/db/prisma';
import { apiLogger } from '@/app/lib/structured-logger';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/users
 * List all users (admin only)
 */
export async function GET(request: NextRequest) {
  return withAdmin(request, async (context) => {
    try {
      // Fetch all users
      const users = await prisma.userProfile.findMany({
        orderBy: [
          { role: 'asc' }, // ADMIN first
          { createdAt: 'desc' },
        ],
      });

      apiLogger.info(
        { adminId: context.user.id, userCount: users.length },
        'Admin listed all users'
      );

      return NextResponse.json({
        success: true,
        users,
      });
    } catch (error: any) {
      apiLogger.error(
        { adminId: context.user.id, error: error.message },
        'Error listing users'
      );

      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }
  });
}
