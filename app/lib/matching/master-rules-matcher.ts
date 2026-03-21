/**
 * Master Rules Matcher — Stage 0
 *
 * Applies learned master rules from manual review decisions.
 * Runs BEFORE all other matching stages to ensure highest precedence.
 *
 * Rule Types:
 *   POSITIVE_MAP   — "Always match these two part numbers" → Creates CONFIRMED matches
 *   NEGATIVE_BLOCK — "Never match these two part numbers" → Deletes any existing matches
 *
 * Performance notes (N+1 elimination):
 *   - All store/supplier lookups are batched per rule type using IN clauses.
 *   - Existing-match detection uses a single findMany + Set lookup instead of
 *     per-pair findFirst calls.
 *   - createMany is used for bulk inserts.
 *   - Rule stats are updated in a single updateMany per rule at the end.
 */

import { prisma } from '@/app/lib/db/prisma';
import { MatchMethod, MatchStatus } from '@prisma/client';
import { apiLogger } from '@/app/lib/structured-logger';

export async function applyMasterRules(projectId: string): Promise<number> {
  apiLogger.info({ projectId }, '[MASTER-RULES] Stage 0 start');

  // -------------------------------------------------------------------------
  // 1. Fetch all enabled rules in one query
  // -------------------------------------------------------------------------
  const rules = await prisma.masterRule.findMany({
    where: {
      enabled: true,
      OR: [
        { scope: 'GLOBAL' },
        { scope: 'PROJECT_SPECIFIC', projectId },
      ],
    },
  });

  apiLogger.info({ count: rules.length }, '[MASTER-RULES] Rules loaded');
  if (rules.length === 0) return 0;

  const positiveRules = rules.filter(r => r.ruleType === 'POSITIVE_MAP');
  const negativeRules = rules.filter(r => r.ruleType === 'NEGATIVE_BLOCK');

  // -------------------------------------------------------------------------
  // 2. POSITIVE_MAP — bulk lookup then createMany
  // -------------------------------------------------------------------------
  let matchesCreated = 0;

  if (positiveRules.length > 0) {
    const positiveStorePNs  = [...new Set(positiveRules.map(r => r.storePartNumber))];
    const positiveSupplierPNs = [...new Set(positiveRules.map(r => r.supplierPartNumber).filter(Boolean) as string[])];

    // Batch-fetch all relevant store and supplier items
    const [storeItems, supplierItems] = await Promise.all([
      prisma.storeItem.findMany({
        where: { projectId, partNumber: { in: positiveStorePNs } },
        select: { id: true, partNumber: true },
      }),
      prisma.supplierItem.findMany({
        where: { projectId, partNumber: { in: positiveSupplierPNs } },
        select: { id: true, partNumber: true },
      }),
    ]);

    // Build lookup maps
    const storeByPN   = new Map<string, typeof storeItems[0][]>();
    const supplierByPN = new Map<string, typeof supplierItems[0][]>();

    for (const s of storeItems) {
      if (!storeByPN.has(s.partNumber)) storeByPN.set(s.partNumber, []);
      storeByPN.get(s.partNumber)!.push(s);
    }
    for (const s of supplierItems) {
      if (!supplierByPN.has(s.partNumber)) supplierByPN.set(s.partNumber, []);
      supplierByPN.get(s.partNumber)!.push(s);
    }

    // Collect all (storeItemId, supplierItemId) pairs we want to create
    type MatchPair = { storeItemId: string; supplierItemId: string; ruleId: string; confidence: number; projectId: string };
    const candidatePairs: MatchPair[] = [];

    for (const rule of positiveRules) {
      const stores   = storeByPN.get(rule.storePartNumber) ?? [];
      const suppliers = supplierByPN.get(rule.supplierPartNumber ?? '') ?? [];
      for (const store of stores) {
        for (const supplier of suppliers) {
          candidatePairs.push({
            storeItemId: store.id,
            supplierItemId: supplier.id,
            ruleId: rule.id,
            confidence: rule.confidence,
            projectId,
          });
        }
      }
    }

    if (candidatePairs.length > 0) {
      // Fetch all existing matches for these pairs in one query
      const storeIds   = [...new Set(candidatePairs.map(p => p.storeItemId))];
      const supplierIds = [...new Set(candidatePairs.map(p => p.supplierItemId))];

      const existingMatches = await prisma.matchCandidate.findMany({
        where: {
          projectId,
          storeItemId: { in: storeIds },
          targetId: { in: supplierIds },
          targetType: 'SUPPLIER',
        },
        select: { storeItemId: true, targetId: true },
      });

      const existingSet = new Set(existingMatches.map(m => `${m.storeItemId}:${m.targetId}`));

      const newPairs = candidatePairs.filter(
        p => !existingSet.has(`${p.storeItemId}:${p.supplierItemId}`)
      );

      if (newPairs.length > 0) {
        // Bulk insert
        await prisma.matchCandidate.createMany({
          data: newPairs.map(p => ({
            projectId: p.projectId,
            storeItemId: p.storeItemId,
            targetType: 'SUPPLIER' as const,
            targetId: p.supplierItemId,
            method: MatchMethod.MASTER_RULE,
            confidence: p.confidence,
            matchStage: 0,
            status: MatchStatus.CONFIRMED,
            features: {
              ruleId: p.ruleId,
              ruleType: 'POSITIVE_MAP',
              autoConfirmed: true,
            },
          })),
          skipDuplicates: true,
        });
        matchesCreated = newPairs.length;
      }

      // Update rule stats in bulk (one update per rule, not per pair)
      const ruleHitCounts = new Map<string, number>();
      for (const p of newPairs) {
        ruleHitCounts.set(p.ruleId, (ruleHitCounts.get(p.ruleId) ?? 0) + 1);
      }

      await Promise.all(
        [...ruleHitCounts.entries()].map(([ruleId, count]) =>
          prisma.masterRule.update({
            where: { id: ruleId },
            data: { appliedCount: { increment: count }, lastAppliedAt: new Date() },
          })
        )
      );
    }
  }

  // -------------------------------------------------------------------------
  // 3. NEGATIVE_BLOCK — batch delete
  // -------------------------------------------------------------------------
  let matchesBlocked = 0;

  if (negativeRules.length > 0) {
    const negativeSupplierPNs = [...new Set(negativeRules.map(r => r.supplierPartNumber).filter(Boolean) as string[])];

    const blockSupplierItems = await prisma.supplierItem.findMany({
      where: { projectId, partNumber: { in: negativeSupplierPNs } },
      select: { id: true, partNumber: true },
    });

    const supplierIdByPN = new Map(blockSupplierItems.map(s => [s.partNumber, s.id]));

    for (const rule of negativeRules) {
      const supplierId = supplierIdByPN.get(rule.supplierPartNumber ?? '');
      if (!supplierId) continue;

      const deleted = await prisma.matchCandidate.deleteMany({
        where: {
          projectId,
          storeItem: { partNumber: rule.storePartNumber },
          targetType: 'SUPPLIER',
          targetId: supplierId,
        },
      });

      if (deleted.count > 0) {
        matchesBlocked += deleted.count;
        await prisma.masterRule.update({
          where: { id: rule.id },
          data: { appliedCount: { increment: deleted.count }, lastAppliedAt: new Date() },
        });
      }
    }
  }

  apiLogger.info({ matchesCreated, matchesBlocked }, '[MASTER-RULES] Stage 0 complete');
  return matchesCreated;
}
