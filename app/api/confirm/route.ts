/**
 * Match Confirmation API
 * 
 * POST /api/confirm - Confirm or reject match candidates
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import prisma from '@/app/lib/db/prisma';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
export async function POST(req: NextRequest) {
  return withAuth(req, async (context) => {
    try {
    // Require authentication

    const body = await req.json();
    const { matchId, action, notes } = body;

    if (!matchId || !action) {
      return NextResponse.json(
        { success: false, error: 'Match ID and action required' },
        { status: 400 }
      );
    }

    if (!['confirm', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }

    // Get match candidate
    const match = await prisma.matchCandidate.findUnique({
      where: { id: matchId },
      include: {
        storeItem: true,
      },
    });

    if (!match) {
      return NextResponse.json(
        { success: false, error: 'Match not found' },
        { status: 404 }
      );
    }

    if (action === 'confirm') {
      // Fetch supplier item for history logging
      const supplierItem = await prisma.supplierItem.findUnique({
        where: { id: match.targetId },
        select: { partNumber: true, lineCode: true },
      });

      // Update match status
      await prisma.matchCandidate.update({
        where: { id: matchId },
        data: { 
          status: 'CONFIRMED',
          decidedById: context.user.id,
          decidedAt: new Date(),
          note: notes || null,
        },
      });

      // Log to accepted match history (Epic A3)
      if (supplierItem) {
        await prisma.acceptedMatchHistory.create({
          data: {
            projectId: match.projectId,
            storePartNumber: match.storeItem.partNumber,
            supplierPartNumber: supplierItem.partNumber,
            supplierLineCode: supplierItem.lineCode,
          },
        });
      }

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId: context.user.id,
          projectId: match.projectId,
          entity: 'MatchCandidate',
          entityId: matchId,
          action: 'DECIDE_MATCH',
          meta: {
            decision: 'CONFIRMED',
            storeItemId: match.storeItemId,
            targetId: match.targetId,
            confidence: match.confidence,
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Match confirmed',
      });
    } else if (action === 'reject') {
      // Fetch supplier item for history logging
      const supplierItem = await prisma.supplierItem.findUnique({
        where: { id: match.targetId },
        select: { partNumber: true, lineCode: true },
      });

      // Update match status
      await prisma.matchCandidate.update({
        where: { id: matchId },
        data: { 
          status: 'REJECTED',
          decidedById: context.user.id,
          decidedAt: new Date(),
          note: notes || null,
        },
      });

      // Log to rejected match history (Epic A3)
      if (supplierItem) {
        await prisma.rejectedMatchHistory.create({
          data: {
            projectId: match.projectId,
            storePartNumber: match.storeItem.partNumber,
            supplierPartNumber: supplierItem.partNumber,
            supplierLineCode: supplierItem.lineCode,
          },
        });
      }

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId: context.user.id,
          projectId: match.projectId,
          entity: 'MatchCandidate',
          entityId: matchId,
          action: 'DECIDE_MATCH',
          meta: {
            decision: 'REJECTED',
            storeItemId: match.storeItemId,
            targetId: match.targetId,
            reason: notes || 'No reason provided',
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Match rejected',
      });
    }
  
  } catch (error: any) {
    apiLogger.error({ error: error.message }, 'Handler error');
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
  });
}
