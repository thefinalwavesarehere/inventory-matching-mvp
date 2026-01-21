/**
 * Master Rules Learner
 * 
 * Extracts learning patterns from manual review decisions and creates
 * master rules that will be applied automatically in future matching jobs.
 */

import { prisma } from '@/app/lib/db/prisma';
import { MasterRuleType, MasterRuleScope } from '@prisma/client';

export interface ReviewDecision {
  matchCandidateId: string;
  storePartNumber: string;
  supplierPartNumber: string;
  lineCode?: string | null;
  decision: 'approve' | 'reject' | 'correct';
  correctedSupplierPartNumber?: string | null;
  projectId: string;
  userId: string;
}

/**
 * Learn from a single manual review decision and create a master rule
 */
export async function learnFromDecision(
  decision: ReviewDecision
): Promise<{ ruleId: string; ruleType: MasterRuleType } | null> {
  const { 
    matchCandidateId, 
    storePartNumber, 
    supplierPartNumber, 
    lineCode,
    decision: action, 
    correctedSupplierPartNumber, 
    projectId, 
    userId 
  } = decision;
  
  // Determine rule type and target supplier part number
  let ruleType: MasterRuleType;
  let targetSupplierPN: string | null = null;
  
  if (action === 'approve') {
    // APPROVE: Create POSITIVE_MAP rule
    ruleType = 'POSITIVE_MAP';
    targetSupplierPN = supplierPartNumber;
  } else if (action === 'reject') {
    // REJECT: Create NEGATIVE_BLOCK rule
    ruleType = 'NEGATIVE_BLOCK';
    targetSupplierPN = supplierPartNumber;
  } else if (action === 'correct' && correctedSupplierPartNumber) {
    // CORRECT: Create POSITIVE_MAP rule with corrected part number
    ruleType = 'POSITIVE_MAP';
    targetSupplierPN = correctedSupplierPartNumber;
  } else {
    // Invalid decision or missing correction
    console.warn(`[MASTER-RULES] Invalid decision or missing correction: ${action}`);
    return null;
  }
  
  // Check if rule already exists
  const existingRule = await prisma.masterRule.findFirst({
    where: {
      storePartNumber,
      supplierPartNumber: targetSupplierPN,
      ruleType,
      enabled: true,
    }
  });
  
  if (existingRule) {
    console.log(`[MASTER-RULES] Rule already exists: ${existingRule.id}`);
    return { ruleId: existingRule.id, ruleType: existingRule.ruleType };
  }
  
  // Validate projectId exists before creating rule
  let validatedProjectId: string | null = null;
  if (projectId) {
    const projectExists = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true }
    });
    if (projectExists) {
      validatedProjectId = projectId;
    } else {
      console.warn(`[MASTER-RULES] Project ${projectId} does not exist, creating rule without project reference`);
    }
  }
  
  // Create new master rule
  const rule = await prisma.masterRule.create({
    data: {
      ruleType,
      scope: MasterRuleScope.GLOBAL, // Default to global scope
      storePartNumber,
      supplierPartNumber: targetSupplierPN,
      lineCode,
      confidence: 1.0, // Full confidence from manual decision
      enabled: true,
      createdBy: userId,
      projectId: validatedProjectId, // Use validated project ID
      matchCandidateId, // Track original match
      updatedAt: new Date(),
    }
  });
  
  console.log(`[MASTER-RULES] Created ${ruleType} rule: ${rule.id}`);
  console.log(`[MASTER-RULES]   Store PN: ${storePartNumber}`);
  console.log(`[MASTER-RULES]   Supplier PN: ${targetSupplierPN}`);
  console.log(`[MASTER-RULES]   Source: Project ${projectId}, Match ${matchCandidateId}`);
  
  return { ruleId: rule.id, ruleType: rule.ruleType };
}

/**
 * Learn from multiple review decisions in bulk (CSV import)
 */
export async function learnFromBulkDecisions(
  decisions: ReviewDecision[]
): Promise<{ created: number; skipped: number; errors: number }> {
  let created = 0;
  let skipped = 0;
  let errors = 0;
  
  console.log(`[MASTER-RULES] Learning from ${decisions.length} bulk decisions...`);
  
  for (const decision of decisions) {
    try {
      const result = await learnFromDecision(decision);
      if (result) {
        created++;
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`[MASTER-RULES] Error learning from decision:`, error);
      errors++;
    }
  }
  
  console.log(`[MASTER-RULES] Bulk learning complete: ${created} created, ${skipped} skipped, ${errors} errors`);
  
  return { created, skipped, errors };
}

/**
 * Disable a master rule (soft delete)
 */
export async function disableRule(ruleId: string): Promise<boolean> {
  try {
    await prisma.masterRule.update({
      where: { id: ruleId },
      data: { enabled: false, updatedAt: new Date() }
    });
    console.log(`[MASTER-RULES] Disabled rule: ${ruleId}`);
    return true;
  } catch (error) {
    console.error(`[MASTER-RULES] Error disabling rule:`, error);
    return false;
  }
}

/**
 * Enable a master rule
 */
export async function enableRule(ruleId: string): Promise<boolean> {
  try {
    await prisma.masterRule.update({
      where: { id: ruleId },
      data: { enabled: true, updatedAt: new Date() }
    });
    console.log(`[MASTER-RULES] Enabled rule: ${ruleId}`);
    return true;
  } catch (error) {
    console.error(`[MASTER-RULES] Error enabling rule:`, error);
    return false;
  }
}

/**
 * Delete a master rule (hard delete)
 */
export async function deleteRule(ruleId: string): Promise<boolean> {
  try {
    await prisma.masterRule.delete({
      where: { id: ruleId }
    });
    console.log(`[MASTER-RULES] Deleted rule: ${ruleId}`);
    return true;
  } catch (error) {
    console.error(`[MASTER-RULES] Error deleting rule:`, error);
    return false;
  }
}

/**
 * Get all master rules with optional filtering
 */
export async function getMasterRules(filters?: {
  enabled?: boolean;
  ruleType?: MasterRuleType;
  scope?: MasterRuleScope;
  projectId?: string;
  search?: string; // Search in part numbers
}) {
  const where: any = {};
  
  if (filters?.enabled !== undefined) {
    where.enabled = filters.enabled;
  }
  
  if (filters?.ruleType) {
    where.ruleType = filters.ruleType;
  }
  
  if (filters?.scope) {
    where.scope = filters.scope;
  }
  
  if (filters?.projectId) {
    where.projectId = filters.projectId;
  }
  
  if (filters?.search) {
    where.OR = [
      { storePartNumber: { contains: filters.search, mode: 'insensitive' } },
      { supplierPartNumber: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  
  const rules = await prisma.masterRule.findMany({
    where,
    include: {
      project: {
        select: {
          id: true,
          name: true,
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
  
  return rules;
}
