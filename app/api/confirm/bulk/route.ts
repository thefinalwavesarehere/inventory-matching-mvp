import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { matchIds, action } = body;

    if (!matchIds || !Array.isArray(matchIds) || matchIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Match IDs array required' },
        { status: 400 }
      );
    }

    if (action !== 'confirm' && action !== 'reject') {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }

    console.log(`[BULK-CONFIRM] Processing ${action} for ${matchIds.length} matches`);

    const newStatus = action === 'confirm' ? 'CONFIRMED' : 'REJECTED';

    // Update all matches in a single transaction
    const result = await prisma.matchCandidate.updateMany({
      where: {
        id: { in: matchIds },
      },
      data: {
        status: newStatus,
      },
    });

    console.log(`[BULK-CONFIRM] Updated ${result.count} matches to ${newStatus}`);

    return NextResponse.json({
      success: true,
      message: `Successfully ${action}ed ${result.count} matches`,
      count: result.count,
    });
  } catch (error: any) {
    console.error('[BULK-CONFIRM] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process bulk action' },
      { status: 500 }
    );
  }
}
