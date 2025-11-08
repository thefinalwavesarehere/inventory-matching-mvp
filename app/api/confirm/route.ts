/**
 * Match Confirmation API
 * 
 * POST /api/confirm - Confirm or reject match candidates
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, getCurrentUser } from '@/app/lib/auth';
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

    const user = await getCurrentUser(session);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

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
      // Update match status
      await prisma.matchCandidate.update({
        where: { id: matchId },
        data: { 
          status: 'CONFIRMED',
          decidedById: user.id,
          decidedAt: new Date(),
          note: notes || null,
        },
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId: user.id,
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
      // Update match status
      await prisma.matchCandidate.update({
        where: { id: matchId },
        data: { 
          status: 'REJECTED',
          decidedById: user.id,
          decidedAt: new Date(),
          note: notes || null,
        },
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          userId: user.id,
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
  } catch (error) {
    console.error('Error confirming match:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to confirm match' },
      { status: 500 }
    );
  }
}
