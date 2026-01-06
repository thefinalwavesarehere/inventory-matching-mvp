/**
 * Prompt 2: Rule Suggestion Engine
 * 
 * STUBBED VERSION: Rule detection requires proper batch queries or schema changes.
 * Current MatchCandidate uses stringly-typed targetId without relations.
 * 
 * This stub allows build to pass. Implement proper detection when:
 * 1. Schema adds targetItem relation, OR
 * 2. Detection uses batch queries with proper joins
 */

import prisma from '@/app/lib/db/prisma';

interface SuggestedRule {
  ruleType: string;
  payload: any;
  evidenceCount: number;
}

/**
 * D1: Detect repeated patterns (STUBBED)
 */
export async function detectAndSuggestRules(projectId: string): Promise<number> {
  console.log(`[PROMPT2-RULES] Rule detection stubbed - requires schema changes or batch queries`);
  
  // TODO: Implement when MatchCandidate schema adds proper targetItem relation
  // or when detection logic uses efficient batch queries
  
  return 0;
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
