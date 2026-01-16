/**
 * Jobs List API
 * GET /api/jobs - List jobs for a project
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import { requireAuth } from '@/app/lib/auth-helpers';
import prisma from '@/app/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Require authentication
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status'); // e.g., "processing,pending"

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      );
    }

    const where: any = { projectId };
    
    if (status) {
      const statuses = status.split(',');
      where.status = { in: statuses };
    }

    const jobs = await prisma.matchingJob.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      success: true,
      jobs,
    });
  } catch (error: any) {
    console.error('[JOBS-LIST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
