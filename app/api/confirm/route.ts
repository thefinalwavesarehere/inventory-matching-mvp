/**
 * Match Confirmation API
 *
 * POST /api/confirm - Confirm or reject match candidates
 * Wires into master-rules-learner to create POSITIVE_MAP / NEGATIVE_BLOCK rules
 * from every human decision, closing the feedback loop.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/app/lib/db/prisma';
import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
import { learnFromDecision } from '@/app/lib/master-rules-learner';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return withAuth(req, async (context) => {
    try {
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

      // Get match candidate with store item
      const match = await prisma.matchCandidate.findUnique({
        where: { id: matchId },
        include: { storeItem: true },
      });

      if (!match) {
        return NextResponse.json(
          { success: false, error: 'Match not found' },
          { status: 404 }
        );
      }

      // Fetch supplier item for history logging and rule learning
      const supplierItem = await prisma.supplierItem.findUnique({
        where: { id: match.targetId },
        select: { partNumber: true, lineCode: true },
      });

      if (action === 'confirm') {
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

        // Log to accepted match history
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

        // Audit log
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

        // Feedback loop: create POSITIVE_MAP master rule (fire-and-forget)
        learnFromDecision({
          action: 'confirm',
          matchCandidateId: matchId,
          storePartNumber: match.storeItem.partNumber,
          supplierPartNumber: supplierItem?.partNumber,
          lineCode: supplierItem?.lineCode,
          projectId: match.projectId,
          userId: context.user.id,
        }).catch((err: any) =>
          apiLogger.warn('[FEEDBACK] learnFromDecision (confirm) error: ' + err.message)
        );

        return NextResponse.json({ success: true, message: 'Match confirmed' });

      } else {
        // action === 'reject'

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

        // Log to rejected match history
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

        // Audit log
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

        // Feedback loop: create NEGATIVE_BLOCK master rule (fire-and-forget)
        learnFromDecision({
          action: 'reject',
          matchCandidateId: matchId,
          storePartNumber: match.storeItem.partNumber,
          supplierPartNumber: supplierItem?.partNumber,
          lineCode: supplierItem?.lineCode,
          projectId: match.projectId,
          userId: context.user.id,
        }).catch((err: any) =>
          apiLogger.warn('[FEEDBACK] learnFromDecision (reject) error: ' + err.message)
        );

        return NextResponse.json({ success: true, message: 'Match rejected' });
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
