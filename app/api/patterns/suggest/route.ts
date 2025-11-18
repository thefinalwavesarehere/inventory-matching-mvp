/**
 * Pattern Suggestion API
 * 
 * POST /api/patterns/suggest - Get bulk approval suggestions after approving a match
 * 
 * When a user approves a match, this endpoint:
 * 1. Analyzes the transformation pattern
 * 2. Finds other pending matches with the same pattern
 * 3. Returns a suggestion for bulk approval
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/lib/auth';
import prisma from '@/app/lib/db/prisma';
import { generateBulkApprovalSuggestion, type PatternMatch } from '@/app/lib/pattern-detection';

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
    const { matchId, projectId, minOccurrences = 5 } = body;

    if (!matchId || !projectId) {
      return NextResponse.json(
        { success: false, error: 'Match ID and Project ID required' },
        { status: 400 }
      );
    }

    console.log(`[PATTERN-SUGGEST] Analyzing match ${matchId} for bulk approval patterns...`);

    // Get the approved match
    const approvedMatch = await prisma.matchCandidate.findUnique({
      where: { id: matchId },
      include: {
        storeItem: true,
      },
    });

    if (!approvedMatch) {
      return NextResponse.json(
        { success: false, error: 'Match not found' },
        { status: 404 }
      );
    }

    // Get supplier item
    const supplierItem = await prisma.supplierItem.findUnique({
      where: { id: approvedMatch.targetId },
    });

    if (!supplierItem) {
      return NextResponse.json(
        { success: false, error: 'Supplier item not found' },
        { status: 404 }
      );
    }

    // Check if this match has a transformation signature
    if (!approvedMatch.transformationSignature) {
      console.log('[PATTERN-SUGGEST] No transformation signature found');
      return NextResponse.json({
        success: true,
        hasSuggestion: false,
        message: 'No pattern detected for this match',
      });
    }

    // Get all pending matches for this project
    const pendingMatches = await prisma.matchCandidate.findMany({
      where: {
        projectId,
        status: 'PENDING',
        transformationSignature: {
          not: null,
        },
      },
      include: {
        storeItem: true,
      },
    });

    console.log(`[PATTERN-SUGGEST] Found ${pendingMatches.length} pending matches with signatures`);

    // Get supplier items for pending matches
    const supplierIds = pendingMatches.map(m => m.targetId);
    const suppliers = await prisma.supplierItem.findMany({
      where: {
        id: { in: supplierIds },
      },
    });

    const supplierMap = new Map(suppliers.map(s => [s.id, s]));

    // Convert to PatternMatch format
    const pendingPatternMatches: PatternMatch[] = pendingMatches
      .map(m => {
        const supplier = supplierMap.get(m.targetId);
        if (!supplier) return null;

        return {
          storeItemId: m.storeItemId,
          supplierItemId: m.targetId,
          storePartNumber: m.storeItem.partNumber,
          supplierPartNumber: supplier.partNumber,
          transformationSignature: m.transformationSignature!,
          confidence: m.confidence,
          lineCode: m.storeItem.lineCode || undefined,
        };
      })
      .filter(Boolean) as PatternMatch[];

    // Create approved match in PatternMatch format
    const approvedPatternMatch: PatternMatch = {
      storeItemId: approvedMatch.storeItemId,
      supplierItemId: approvedMatch.targetId,
      storePartNumber: approvedMatch.storeItem.partNumber,
      supplierPartNumber: supplierItem.partNumber,
      transformationSignature: approvedMatch.transformationSignature,
      confidence: approvedMatch.confidence,
      lineCode: approvedMatch.storeItem.lineCode || undefined,
    };

    // Generate bulk approval suggestion
    const suggestion = await generateBulkApprovalSuggestion(
      approvedPatternMatch,
      pendingPatternMatches,
      minOccurrences
    );

    if (!suggestion) {
      console.log('[PATTERN-SUGGEST] No bulk approval suggestion generated');
      return NextResponse.json({
        success: true,
        hasSuggestion: false,
        message: 'Not enough similar matches found for bulk approval',
      });
    }

    console.log(`[PATTERN-SUGGEST] Generated suggestion: ${suggestion.affectedItems} items`);

    return NextResponse.json({
      success: true,
      hasSuggestion: true,
      suggestion: {
        message: suggestion.message,
        affectedItems: suggestion.affectedItems,
        pattern: {
          transformation: suggestion.pattern.transformation,
          lineCode: suggestion.pattern.lineCode,
          matchCount: suggestion.pattern.matchCount,
          confidence: suggestion.pattern.confidence,
        },
        preview: suggestion.previewMatches.map(m => ({
          storePartNumber: m.storePartNumber,
          supplierPartNumber: m.supplierPartNumber,
          lineCode: m.lineCode,
        })),
      },
    });

  } catch (error: any) {
    console.error('[PATTERN-SUGGEST] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate suggestion' },
      { status: 500 }
    );
  }
}
