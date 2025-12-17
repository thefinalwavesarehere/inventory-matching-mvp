import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';

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

    // Fetch match details for history logging (Epic A3)
    const matches = await prisma.matchCandidate.findMany({
      where: { id: { in: matchIds } },
      include: {
        storeItem: { select: { partNumber: true } },
      },
    });

    // Get supplier items
    const targetIds = matches.map(m => m.targetId);
    const supplierItems = await prisma.supplierItem.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, partNumber: true, lineCode: true },
    });
    const supplierItemsMap = new Map(supplierItems.map(s => [s.id, s]));

    // Update all matches in a single transaction
    const result = await prisma.matchCandidate.updateMany({
      where: {
        id: { in: matchIds },
      },
      data: {
        status: newStatus,
      },
    });

    // Log to match history (Epic A3)
    const historyRecords = matches.map(match => {
      const supplierItem = supplierItemsMap.get(match.targetId);
      return {
        projectId: match.projectId,
        storePartNumber: match.storeItem.partNumber,
        supplierPartNumber: supplierItem?.partNumber || '',
        supplierLineCode: supplierItem?.lineCode || null,
      };
    });

    if (action === 'confirm') {
      await prisma.acceptedMatchHistory.createMany({
        data: historyRecords,
        skipDuplicates: true,
      });
    } else {
      await prisma.rejectedMatchHistory.createMany({
        data: historyRecords,
        skipDuplicates: true,
      });
    }

    console.log(`[BULK-CONFIRM] Updated ${result.count} matches to ${newStatus}`);
    console.log(`[BULK-CONFIRM] Logged ${historyRecords.length} records to match history`);

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
