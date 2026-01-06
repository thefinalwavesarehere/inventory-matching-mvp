/**
 * Prompt 2: Rule Suggestion Engine
 * 
 * Detects repeated patterns in matches and suggests rules.
 * Rules do NOT apply until APPROVED.
 * 
 * Pattern types:
 * - Punctuation equivalence (dash/slash/dot differ but norm identical)
 * - Line code → manufacturer mapping (consistent across many matches)
 */

import prisma from '@/app/lib/db/prisma';

interface SuggestedRule {
  ruleType: string;
  payload: any;
  evidenceCount: number;
}

/**
 * D1: Detect repeated patterns
 */
export async function detectAndSuggestRules(projectId: string): Promise<number> {
  console.log(`[PROMPT2-RULES] Starting rule detection for project ${projectId}`);

  const suggestedRules: SuggestedRule[] = [];

  // Pattern 1: Punctuation equivalence
  const punctuationRules = await detectPunctuationEquivalence(projectId);
  suggestedRules.push(...punctuationRules);

  // Pattern 2: Line code → manufacturer mapping
  const lineCodeRules = await detectLineCodeMappings(projectId);
  suggestedRules.push(...lineCodeRules);

  // Save suggested rules
  let createdCount = 0;
  for (const rule of suggestedRules) {
    // Check if rule already exists
    const existing = await prisma.projectMatchRule.findFirst({
      where: {
        projectId,
        ruleType: rule.ruleType as any,
        payload: rule.payload,
      },
    });

    if (!existing) {
      await prisma.projectMatchRule.create({
        data: {
          projectId,
          ruleType: rule.ruleType as any,
          payload: rule.payload,
          status: 'SUGGESTED',
          evidenceCount: rule.evidenceCount,
        },
      });
      createdCount++;
    }
  }

  console.log(`[PROMPT2-RULES] Created ${createdCount} new suggested rules`);

  return createdCount;
}

/**
 * Detect punctuation equivalence patterns
 */
async function detectPunctuationEquivalence(projectId: string): Promise<SuggestedRule[]> {
  console.log(`[PROMPT2-RULES] Detecting punctuation equivalence patterns...`);

  // Get all approved matches
  const matches = await prisma.matchCandidate.findMany({
    where: {
      projectId,
      status: 'CONFIRMED',
    },
    include: {
      storeItem: {
        select: { partNumber: true, partNumberNorm: true },
      },
      targetItem: {
        select: { partNumber: true, partNumberNorm: true },
      },
    },
  });

  // Count matches where parts differ only by punctuation
  let punctuationEquivalenceCount = 0;

  for (const match of matches) {
    if (!match.storeItem || !match.targetItem) continue;

    const storeRaw = match.storeItem.partNumber || '';
    const targetRaw = match.targetItem.partNumber || '';

    // Remove punctuation
    const storeNoPunct = storeRaw.replace(/[-\/\.]/g, '');
    const targetNoPunct = targetRaw.replace(/[-\/\.]/g, '');

    // Check if identical after removing punctuation
    if (storeNoPunct.toUpperCase() === targetNoPunct.toUpperCase() &&
        storeRaw !== targetRaw) {
      punctuationEquivalenceCount++;
    }
  }

  console.log(`[PROMPT2-RULES] Found ${punctuationEquivalenceCount} punctuation equivalence patterns`);

  if (punctuationEquivalenceCount >= 10) {
    return [{
      ruleType: 'PUNCTUATION_EQUIVALENCE',
      payload: {
        description: 'Treat dash, slash, and dot as equivalent separators',
        examples: matches.slice(0, 5).map(m => ({
          store: m.storeItem?.partNumber,
          supplier: m.targetItem?.partNumber,
        })),
      },
      evidenceCount: punctuationEquivalenceCount,
    }];
  }

  return [];
}

/**
 * Detect line code → manufacturer mapping patterns
 */
async function detectLineCodeMappings(projectId: string): Promise<SuggestedRule[]> {
  console.log(`[PROMPT2-RULES] Detecting line code → manufacturer mappings...`);

  // Get all approved matches with line codes
  const matches = await prisma.matchCandidate.findMany({
    where: {
      projectId,
      status: 'CONFIRMED',
    },
    include: {
      storeItem: {
        select: { arnoldLineCodeRaw: true },
      },
      targetItem: {
        select: { brand: true },
      },
    },
  });

  // Group by line code → manufacturer
  const lineCodeToManufacturer: Record<string, Record<string, number>> = {};

  for (const match of matches) {
    if (!match.storeItem?.arnoldLineCodeRaw || !match.targetItem?.brand) continue;

    const lineCode = match.storeItem.arnoldLineCodeRaw;
    const manufacturer = match.targetItem.brand;

    if (!lineCodeToManufacturer[lineCode]) {
      lineCodeToManufacturer[lineCode] = {};
    }

    lineCodeToManufacturer[lineCode][manufacturer] = 
      (lineCodeToManufacturer[lineCode][manufacturer] || 0) + 1;
  }

  // Suggest mappings with high confidence (>= 10 occurrences, >80% consistency)
  const suggestedMappings: SuggestedRule[] = [];

  for (const [lineCode, manufacturers] of Object.entries(lineCodeToManufacturer)) {
    const total = Object.values(manufacturers).reduce((a, b) => a + b, 0);
    const topManufacturer = Object.entries(manufacturers)
      .sort((a, b) => b[1] - a[1])[0];

    if (topManufacturer && topManufacturer[1] >= 10 && topManufacturer[1] / total > 0.8) {
      suggestedMappings.push({
        ruleType: 'SOURCE_LINECODE_TO_MANUFACTURER',
        payload: {
          sourceLineCode: lineCode,
          mappedManufacturer: topManufacturer[0],
          confidence: topManufacturer[1] / total,
        },
        evidenceCount: topManufacturer[1],
      });

      console.log(`[PROMPT2-RULES] Suggested mapping: ${lineCode} → ${topManufacturer[0]} (${topManufacturer[1]}/${total} = ${(topManufacturer[1] / total * 100).toFixed(1)}%)`);
    }
  }

  return suggestedMappings;
}

/**
 * D2: Get suggested rules for UI
 */
export async function getSuggestedRules(projectId: string) {
  return await prisma.projectMatchRule.findMany({
    where: {
      projectId,
      status: 'SUGGESTED',
    },
    orderBy: {
      evidenceCount: 'desc',
    },
  });
}

/**
 * D3: Approve rule
 */
export async function approveRule(ruleId: string, userId?: string): Promise<void> {
  await prisma.projectMatchRule.update({
    where: { id: ruleId },
    data: {
      status: 'APPROVED',
      approvedAt: new Date(),
      approvedByUserId: userId,
    },
  });

  console.log(`[PROMPT2-RULES] Rule ${ruleId} approved by ${userId || 'system'}`);
}

/**
 * D3: Reject rule
 */
export async function rejectRule(ruleId: string): Promise<void> {
  await prisma.projectMatchRule.update({
    where: { id: ruleId },
    data: {
      status: 'REJECTED',
    },
  });

  console.log(`[PROMPT2-RULES] Rule ${ruleId} rejected`);
}
