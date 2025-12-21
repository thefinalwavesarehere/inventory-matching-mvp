import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';
import { requireAdminRole } from '@/app/lib/auth-helpers';


export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/activity
 * Get activity log (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    // Require admin role
    await requireAdminRole();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const action = searchParams.get('action');

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
    if (action && action !== 'all') {
      where.action = action;
    }

    // Fetch activities with pagination
    const [activities, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: {
          user: {
            select: {
              email: true,
              fullName: true,
            },
          },
          project: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.activityLog.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      activities,
      page,
      limit,
      total,
      totalPages,
    });
  } catch (error: any) {
    console.error('[API] Error fetching activity log:', error);
    
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
