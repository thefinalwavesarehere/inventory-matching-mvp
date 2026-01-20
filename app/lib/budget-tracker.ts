/**
 * P4: Budget Tracking Service
 *
 * Tracks API usage and costs for AI and web search operations
 * Enforces budget limits to prevent overspending
 */

import { prisma } from './db/prisma';

export interface CostEstimate {
  estimatedCost: number;
  estimatedTokens: number;
  operation: 'ai_match' | 'web_search';
  itemCount: number;
}

export interface BudgetStatus {
  totalSpent: number;
  budgetLimit: number | null;
  remaining: number | null;
  percentUsed: number | null;
  canProceed: boolean;
  withinBudget: boolean;
}

// Cost constants (in USD)
const COST_PER_AI_MATCH = 0.001; // ~$0.001 per AI match (GPT-4.1-mini)
const COST_PER_WEB_SEARCH = 0.01; // ~$0.01 per web search
const COST_PER_TOKEN_INPUT = 0.00000015; // GPT-4.1-mini input
const COST_PER_TOKEN_OUTPUT = 0.0000006; // GPT-4.1-mini output
const AVG_TOKENS_PER_MATCH = 500; // Estimated average tokens per match

/**
 * Estimate cost for an operation before execution
 */
export function estimateCost(
  operation: 'ai_match' | 'web_search',
  itemCount: number
): CostEstimate {
  let estimatedCost = 0;
  let estimatedTokens = 0;

  if (operation === 'ai_match') {
    estimatedTokens = itemCount * AVG_TOKENS_PER_MATCH;
    estimatedCost = itemCount * COST_PER_AI_MATCH;
  } else if (operation === 'web_search') {
    estimatedTokens = itemCount * AVG_TOKENS_PER_MATCH;
    estimatedCost = itemCount * COST_PER_WEB_SEARCH;
  }

  return {
    estimatedCost,
    estimatedTokens,
    operation,
    itemCount,
  };
}

/**
 * Get current budget status for a project
 */
export async function getBudgetStatus(projectId: string): Promise<BudgetStatus> {
  // Get project budget configuration
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      budgetLimit: true,
      currentSpend: true,
    },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const totalSpent = project.currentSpend?.toNumber() || 0;
  const budgetLimit = project.budgetLimit?.toNumber() || null;

  let remaining = null;
  let percentUsed = null;
  let canProceed = true;
  let withinBudget = true;

  if (budgetLimit !== null) {
    remaining = budgetLimit - totalSpent;
    percentUsed = (totalSpent / budgetLimit) * 100;
    canProceed = remaining > 0;
    withinBudget = totalSpent <= budgetLimit;
  }

  return {
    totalSpent,
    budgetLimit,
    remaining,
    percentUsed,
    canProceed,
    withinBudget,
  };
}

/**
 * Check if operation is within budget
 */
export async function checkBudget(
  projectId: string,
  estimatedCost: number
): Promise<{ allowed: boolean; reason?: string; budgetStatus: BudgetStatus }> {
  const budgetStatus = await getBudgetStatus(projectId);

  if (budgetStatus.budgetLimit === null) {
    // No budget limit set, always allow
    return {
      allowed: true,
      budgetStatus,
    };
  }

  if (!budgetStatus.canProceed) {
    return {
      allowed: false,
      reason: 'Budget exhausted',
      budgetStatus,
    };
  }

  if (budgetStatus.remaining !== null && estimatedCost > budgetStatus.remaining) {
    return {
      allowed: false,
      reason: `Operation would exceed budget. Estimated cost: $${estimatedCost.toFixed(2)}, Remaining: $${budgetStatus.remaining.toFixed(2)}`,
      budgetStatus,
    };
  }

  return {
    allowed: true,
    budgetStatus,
  };
}

/**
 * Record actual cost after operation completion
 */
export async function recordCost(
  projectId: string,
  operation: 'ai_match' | 'web_search',
  actualCost: number,
  itemsProcessed: number,
  tokensUsed?: number
): Promise<void> {
  // Update project spend
  await prisma.project.update({
    where: { id: projectId },
    data: {
      currentSpend: {
        increment: actualCost,
      },
    },
  });

  // Create cost log entry
  await prisma.costLog.create({
    data: {
      projectId,
      operation,
      cost: actualCost,
      itemsProcessed,
      tokensUsed: tokensUsed || null,
      createdAt: new Date(),
    },
  });

  console.log(`[BUDGET] Recorded ${operation} cost: $${actualCost.toFixed(4)} for ${itemsProcessed} items`);
}

/**
 * Get cost summary for a project
 */
export async function getCostSummary(projectId: string): Promise<{
  totalCost: number;
  aiCost: number;
  webSearchCost: number;
  itemsProcessed: number;
  budgetStatus: BudgetStatus;
}> {
  const costLogs = await prisma.costLog.findMany({
    where: { projectId },
  });

  const totalCost = costLogs.reduce((sum, log) => sum + log.cost.toNumber(), 0);
  const aiCost = costLogs
    .filter(log => log.operation === 'ai_match')
    .reduce((sum, log) => sum + log.cost.toNumber(), 0);
  const webSearchCost = costLogs
    .filter(log => log.operation === 'web_search')
    .reduce((sum, log) => sum + log.cost.toNumber(), 0);
  const itemsProcessed = costLogs.reduce((sum, log) => sum + log.itemsProcessed, 0);

  const budgetStatus = await getBudgetStatus(projectId);

  return {
    totalCost,
    aiCost,
    webSearchCost,
    itemsProcessed,
    budgetStatus,
  };
}

/**
 * Calculate optimal batch size based on remaining budget
 */
export async function getOptimalBatchSize(
  projectId: string,
  operation: 'ai_match' | 'web_search',
  maxBatchSize: number
): Promise<number> {
  const budgetStatus = await getBudgetStatus(projectId);

  if (budgetStatus.budgetLimit === null || budgetStatus.remaining === null) {
    // No budget limit, use max batch size
    return maxBatchSize;
  }

  const costPerItem = operation === 'ai_match' ? COST_PER_AI_MATCH : COST_PER_WEB_SEARCH;
  const affordableItems = Math.floor(budgetStatus.remaining / costPerItem);

  return Math.min(maxBatchSize, Math.max(1, affordableItems));
}
