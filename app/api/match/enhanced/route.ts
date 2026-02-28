/**
 * Enhanced Matching API - Multi-Stage Pipeline
 * 
 * POST /api/match/enhanced - Run enhanced multi-stage matching
 * 
 * This implements the Sprint 2 matching pipeline:
 * - Stage 0: Pre-processing and index building
 * - Stage 1: Deterministic matching (target 30-40%)
 * - Stage 2: Enhanced fuzzy matching with cost awareness
 * 
 * Includes comprehensive instrumentation and metrics tracking.
 */

import { NextRequest, NextResponse } from 'next/server';
// Migrated to Supabase auth
import prisma from '@/app/lib/db/prisma';
import { withAuth } from '@/app/lib/middleware/auth';
import { apiLogger } from '@/app/lib/structured-logger';
import {
  runMultiStageMatching,
  type StoreItem,
  type SupplierItem,
  type InterchangeMapping,
  type MatchingRule,
} from '@/app/lib/matching-engine';

export async function POST(req: NextRequest) {
  return withAuth(req, async (context) => {
    try {
    // Require authentication

    const body = await req.json();
    const { projectId, options = {} } = body;

    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Project ID required' },
        { status: 400 }
      );
    }

    apiLogger.info(`[ENHANCED-MATCH] Starting enhanced matching for project: ${projectId}`);

    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Clear existing matches (optional - based on options.clearExisting)
    if (options.clearExisting !== false) {
      apiLogger.info('[ENHANCED-MATCH] Clearing existing matches...');
      await prisma.matchCandidate.deleteMany({
        where: { projectId },
      });
    }

    // Fetch store items
    apiLogger.info('[ENHANCED-MATCH] Fetching store items...');
    const storeItems = await prisma.storeItem.findMany({
      where: { projectId },
      select: {
        id: true,
        partNumber: true,
        partNumberNorm: true,
        canonicalPartNumber: true,
        lineCode: true,
        mfrPartNumber: true,
        description: true,
        currentCost: true,
      },
    });

    apiLogger.info(`[ENHANCED-MATCH] Found ${storeItems.length} store items`);

    // Fetch supplier items
    apiLogger.info('[ENHANCED-MATCH] Fetching supplier items...');
    const supplierItems = await prisma.supplierItem.findMany({
      where: { projectId },
      select: {
        id: true,
        partNumber: true,
        partNumberNorm: true,
        canonicalPartNumber: true,
        lineCode: true,
        mfrPartNumber: true,
        description: true,
        currentCost: true,
      },
    });

    apiLogger.info(`[ENHANCED-MATCH] Found ${supplierItems.length} supplier items`);

    // Fetch interchange mappings
    apiLogger.info('[ENHANCED-MATCH] Fetching interchange mappings...');
    const interchangeMappings = await prisma.interchangeMapping.findMany({
      select: {
        competitorFullSku: true,
        arnoldFullSku: true,
        confidence: true,
      },
    });

    apiLogger.info(`[ENHANCED-MATCH] Found ${interchangeMappings.length} interchange mappings`);

    // Fetch matching rules
    apiLogger.info('[ENHANCED-MATCH] Fetching matching rules...');
    const rules = await prisma.matchingRule.findMany({
      where: {
        active: true,
        OR: [
          { scope: 'global' },
          { scope: 'project', scopeId: projectId },
        ],
      },
    });

    apiLogger.info(`[ENHANCED-MATCH] Found ${rules.length} active rules`);

    // Run multi-stage matching (Stage 1 only - Stage 2 fuzzy has its own endpoint)
    apiLogger.info('[ENHANCED-MATCH] Running Stage 1 (deterministic) matching...');
    const result = await runMultiStageMatching(
      storeItems as StoreItem[],
      supplierItems as SupplierItem[],
      interchangeMappings as InterchangeMapping[],
      rules as MatchingRule[],
      {
        stage1Enabled: options.stage1Enabled !== false,
        stage2Enabled: false,  // Disabled - use separate /api/match/fuzzy endpoint
        fuzzyThreshold: options.fuzzyThreshold || 0.75,
        costTolerancePercent: options.costTolerancePercent || 10,
        maxCandidatesPerItem: options.maxCandidatesPerItem || 500,
      }
    );

    apiLogger.info(`[ENHANCED-MATCH] Matching complete: ${result.matches.length} matches found`);
    apiLogger.info(`[ENHANCED-MATCH] Overall match rate: ${(result.summary.overallMatchRate * 100).toFixed(1)}%`);
    apiLogger.info(`[ENHANCED-MATCH] Stage 1 matches: ${result.summary.stage1Matches}`);
    apiLogger.info(`[ENHANCED-MATCH] Stage 2 matches: ${result.summary.stage2Matches}`);

    // Save matches to database
    apiLogger.info(`[ENHANCED-MATCH] Saving ${result.matches.length} matches to database...`);
    const BATCH_SIZE = 1000;
    let totalSaved = 0;
    
    for (let i = 0; i < result.matches.length; i += BATCH_SIZE) {
      const batch = result.matches.slice(i, i + BATCH_SIZE);
      
      const result_save = await prisma.matchCandidate.createMany({
        data: batch.map(m => {
          const record: any = {
            projectId,
            storeItemId: m.storeItemId,
            targetId: m.supplierItemId,
            targetType: 'SUPPLIER',
            method: m.method as any,
            confidence: m.confidence,
            matchStage: m.matchStage,
            status: 'PENDING',
            features: m.features || {},
          };
          
          // Only add optional fields if they have defined values
          if (m.costDifference !== undefined && m.costDifference !== null) {
            record.costDifference = m.costDifference;
          }
          if (m.costSimilarity !== undefined && m.costSimilarity !== null) {
            record.costSimilarity = m.costSimilarity;
          }
          if (m.transformationSignature !== undefined && m.transformationSignature !== null) {
            record.transformationSignature = m.transformationSignature;
          }
          if (m.rulesApplied && m.rulesApplied.length > 0) {
            record.rulesApplied = m.rulesApplied;
          }
          
          return record;
        }),
        skipDuplicates: true,
      });
      
      totalSaved += result_save.count;
      apiLogger.info(`[ENHANCED-MATCH] Batch ${Math.floor(i / BATCH_SIZE) + 1}: Attempted ${batch.length}, Saved ${result_save.count} (${totalSaved} total)`);
    }
    
    apiLogger.info(`[ENHANCED-MATCH] Save complete: ${totalSaved} matches saved out of ${result.matches.length} found`);
    if (totalSaved < result.matches.length) {
      apiLogger.info(`[ENHANCED-MATCH] WARNING: ${result.matches.length - totalSaved} matches were skipped as duplicates`);
    }

    // Save stage metrics
    apiLogger.info('[ENHANCED-MATCH] Saving stage metrics...');
    for (const metric of result.metrics) {
      await prisma.matchStageMetrics.create({
        data: {
          projectId,
          stageNumber: metric.stageNumber,
          stageName: metric.stageName,
          itemsProcessed: metric.itemsProcessed,
          matchesFound: metric.matchesFound,
          matchRate: metric.matchRate,
          avgConfidence: metric.avgConfidence,
          processingTimeMs: metric.processingTimeMs,
          rulesApplied: metric.rulesApplied,
        },
      });
    }

    // Update project timestamp
    await prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });

    apiLogger.info('[ENHANCED-MATCH] Complete!');

    return NextResponse.json({
      success: true,
      projectId,
      summary: result.summary,
      metrics: result.metrics,
      message: `Enhanced matching complete: ${result.matches.length} matches found (${(result.summary.overallMatchRate * 100).toFixed(1)}% match rate)`,
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
