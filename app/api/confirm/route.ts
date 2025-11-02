import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../lib/db/prisma';

/**
 * POST endpoint to confirm, reject, or update match results
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId, action, enrichmentData, notes, confirmedBy } = body;

    if (!matchId) {
      return NextResponse.json(
        { error: 'Match ID is required' },
        { status: 400 }
      );
    }

    if (!action || !['confirm', 'reject', 'skip'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: confirm, reject, or skip' },
        { status: 400 }
      );
    }

    // Get the match result
    const match = await prisma.matchResult.findUnique({
      where: { id: matchId },
      include: {
        arnoldItem: true,
        supplierItem: true,
      },
    });

    if (!match) {
      return NextResponse.json(
        { error: 'Match not found' },
        { status: 404 }
      );
    }

    // Update match status based on action
    let status: string;
    switch (action) {
      case 'confirm':
        status = 'confirmed';
        break;
      case 'reject':
        status = 'rejected';
        break;
      case 'skip':
        status = 'pending';
        break;
      default:
        status = 'pending';
    }

    // Update the match result
    const updatedMatch = await prisma.matchResult.update({
      where: { id: matchId },
      data: {
        status,
        confirmedBy: confirmedBy || null,
        confirmedAt: action === 'confirm' ? new Date() : null,
        notes: notes || null,
      },
    });

    // If confirmed, add enrichment data
    if (action === 'confirm' && enrichmentData) {
      const enrichments = [];

      for (const [fieldName, fieldValue] of Object.entries(enrichmentData)) {
        if (fieldValue) {
          const enrichment = await prisma.enrichmentData.create({
            data: {
              matchId,
              fieldName,
              fieldValue: String(fieldValue),
              source: 'manual', // Can be 'supplier', 'web_search', 'manual', 'ai'
              confidence: 1.0,
            },
          });
          enrichments.push(enrichment);
        }
      }

      // If confirmed, also save to known interchanges for future matching
      if (match.supplierItem) {
        await prisma.knownInterchange.upsert({
          where: {
            supplierSku_arnoldSku: {
              supplierSku: match.supplierItem.partFull,
              arnoldSku: match.arnoldItem.partNumber,
            },
          },
          create: {
            supplierSku: match.supplierItem.partFull,
            arnoldSku: match.arnoldItem.partNumber,
            source: 'ai_confirmed',
            confidence: match.confidenceScore,
            createdBy: confirmedBy || null,
          },
          update: {
            confidence: match.confidenceScore,
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Match confirmed and enrichment data saved',
        match: updatedMatch,
        enrichments,
      });
    }

    // If rejected, add to unmatched parts if not already there
    if (action === 'reject') {
      const existing = await prisma.unmatchedPart.findFirst({
        where: { arnoldItemId: match.arnoldItemId },
      });

      if (!existing) {
        await prisma.unmatchedPart.create({
          data: {
            arnoldItemId: match.arnoldItemId,
            attemptedMethods: [match.matchStage],
            notes: notes || 'Rejected by user',
            requiresManual: true,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Match ${action}ed successfully`,
      match: updatedMatch,
    });

  } catch (error) {
    console.error('Error confirming match:', error);
    return NextResponse.json(
      { 
        error: 'Failed to confirm match',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH endpoint to update enrichment data for a match
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { matchId, enrichmentUpdates } = body;

    if (!matchId) {
      return NextResponse.json(
        { error: 'Match ID is required' },
        { status: 400 }
      );
    }

    const enrichments = [];

    for (const update of enrichmentUpdates) {
      const { fieldName, fieldValue, source, confidence } = update;

      const enrichment = await prisma.enrichmentData.create({
        data: {
          matchId,
          fieldName,
          fieldValue: String(fieldValue),
          source: source || 'manual',
          confidence: confidence || 1.0,
        },
      });

      enrichments.push(enrichment);
    }

    return NextResponse.json({
      success: true,
      message: 'Enrichment data updated',
      enrichments,
    });

  } catch (error) {
    console.error('Error updating enrichment:', error);
    return NextResponse.json(
      { error: 'Failed to update enrichment data' },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to retrieve enrichment data for a match
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get('matchId');

    if (!matchId) {
      return NextResponse.json(
        { error: 'Match ID is required' },
        { status: 400 }
      );
    }

    const enrichmentData = await prisma.enrichmentData.findMany({
      where: { matchId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      enrichmentData,
    });

  } catch (error) {
    console.error('Error fetching enrichment data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch enrichment data' },
      { status: 500 }
    );
  }
}
