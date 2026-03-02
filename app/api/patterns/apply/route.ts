/**
 * Pattern Application API
 * 
 * POST /api/patterns/apply - Apply bulk approval to all matches with a specific pattern
 * 
 * When user accepts a bulk approval suggestion, this endpoint:
 * 1. Finds all pending matches with the specified transformation signature
 * 2. Approves them all
 * 3. Optionally creates a matching rule for future use
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import prisma from '@/app/lib/db/prisma';
import { detectPatterns, createRuleFromPattern, type PatternMatch } from '@/app/lib/pattern-detection';

import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';

export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  return withAuth(req, async (context) => {
    try {
    // Require authentication

    const body = await req.json();
    const {
      projectId,
      transformationSignature,
      lineCode,
      createRule = false,
      ruleScope = 'project',
    } = body;

    if (!projectId || !transformationSignature) {
      return NextResponse.json(
        { success: false, error: 'Project ID and transformation signature required' },
        { status: 400 }
      );
    }

    apiLogger.info(`[PATTERN-APPLY] Applying bulk approval for signature: ${transformationSignature}`);

    // Build where clause
    const whereClause: any = {
      projectId,
      status: 'PENDING',
      transformationSignature,
    };

    // Optionally filter by line code
    if (lineCode) {
      whereClause.storeItem = {
        lineCode,
      };
    }

    // Find all matching candidates
    const matchesToApprove = await prisma.matchCandidate.findMany({
      where: whereClause,
      include: {
        storeItem: true,
      },
    });

    apiLogger.info(`[PATTERN-APPLY] Found ${matchesToApprove.length} matches to approve`);

    if (matchesToApprove.length === 0) {
      return NextResponse.json({
        success: true,
        approvedCount: 0,
        message: 'No matches found with this pattern',
      });
    }

    // Approve all matches
    const updateResult = await prisma.matchCandidate.updateMany({
      where: whereClause,
      data: {
        status: 'CONFIRMED',
        decidedAt: new Date(),
      },
    });

    apiLogger.info(`[PATTERN-APPLY] Approved ${updateResult.count} matches`);

    // Create a matching rule if requested
    let ruleId: string | null = null;
    
    if (createRule) {
      apiLogger.info('[PATTERN-APPLY] Creating matching rule...');

      // Get supplier items to build pattern matches
      const supplierIds = matchesToApprove.map(m => m.targetId);
      const suppliers = await prisma.supplierItem.findMany({
        where: { id: { in: supplierIds } },
      });

      const supplierMap = new Map(suppliers.map(s => [s.id, s]));

      // Convert to PatternMatch format
      const patternMatches: PatternMatch[] = matchesToApprove
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

      // Detect the pattern
      const patterns = detectPatterns(patternMatches, 1);

      if (patterns.length > 0) {
        const pattern = patterns[0];

        // Create rule
        const ruleData = createRuleFromPattern(
          pattern,
          ruleScope,
          ruleScope === 'project' ? projectId : null
        );

        const rule = await prisma.matchingRule.create({
          data: ruleData,
        });

        ruleId = rule.id;
        apiLogger.info(`[PATTERN-APPLY] Created rule: ${rule.id}`);
      }
    }

    return NextResponse.json({
      success: true,
      approvedCount: updateResult.count,
      ruleCreated: ruleId !== null,
      ruleId,
      message: `Approved ${updateResult.count} matches${ruleId ? ' and created a rule for future matching' : ''}`,
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
