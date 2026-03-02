import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import prisma from '@/app/lib/db/prisma';
import { learnFromBulkDecisions, ReviewDecision } from '@/app/lib/master-rules-learner';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  return withAuth(req, async (context) => {
    try {
    // Require authentication

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

    apiLogger.info(`[BULK-CONFIRM] Processing ${action} for ${matchIds.length} matches`);

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

    apiLogger.info(`[BULK-CONFIRM] Updated ${result.count} matches to ${newStatus}`);
    apiLogger.info(`[BULK-CONFIRM] Logged ${historyRecords.length} records to match history`);

    // Learn from decisions and create master rules
    const decisions: ReviewDecision[] = matches.map(match => {
      const supplierItem = supplierItemsMap.get(match.targetId);
      return {
        matchCandidateId: match.id,
        storePartNumber: match.storeItem.partNumber,
        supplierPartNumber: supplierItem?.partNumber || '',
        lineCode: supplierItem?.lineCode,
        decision: action as 'approve' | 'reject',
        projectId: match.projectId,
        userId: context.user.id,
      };
    });
    
    const learningResult = await learnFromBulkDecisions(decisions);
    apiLogger.info(`[BULK-CONFIRM] Master rules learning: ${learningResult.created} created, ${learningResult.skipped} skipped`);

    return NextResponse.json({
      success: true,
      message: `Successfully ${action}ed ${result.count} matches`,
      count: result.count,
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
