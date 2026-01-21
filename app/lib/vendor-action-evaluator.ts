/**
 * P3: Vendor Action Rule Evaluator
 * 
 * Evaluates vendor action rules and assigns appropriate actions to matches
 * based on manufacturer, category, and subcategory patterns.
 */

import { prisma } from './db/prisma';

export type VendorAction = 'NONE' | 'LIFT' | 'REBOX' | 'UNKNOWN' | 'CONTACT_VENDOR';

interface VendorActionRule {
  id: string;
  supplierLineCode: string;
  categoryPattern: string;
  subcategoryPattern: string;
  action: VendorAction;
  active: boolean;
}

interface MatchContext {
  supplierLineCode?: string | null;
  supplierManufacturer?: string | null;
  category?: string | null;
  subcategory?: string | null;
}

/**
 * Load all active vendor action rules for a project (including global rules)
 */
export async function loadVendorActionRules(projectId: string): Promise<VendorActionRule[]> {
  const rules = await prisma.vendorActionRule.findMany({
    where: {
      active: true,
      OR: [
        { projectId: null }, // Global rules
        { projectId }, // Project-specific rules
      ],
    },
    select: {
      id: true,
      supplierLineCode: true,
      categoryPattern: true,
      subcategoryPattern: true,
      action: true,
      active: true,
    },
    orderBy: [
      { projectId: 'desc' }, // Project-specific rules first
      { createdAt: 'asc' },
    ],
  });

  return rules as VendorActionRule[];
}

/**
 * Check if a pattern matches a value (supports wildcards)
 */
function patternMatches(pattern: string, value: string | null | undefined): boolean {
  if (!value) return false;
  
  const normalizedPattern = pattern.trim().toUpperCase();
  const normalizedValue = value.trim().toUpperCase();

  // Exact match
  if (normalizedPattern === normalizedValue) return true;

  // Wildcard match (*)
  if (normalizedPattern === '*') return true;

  // Prefix wildcard (e.g., "GATES*")
  if (normalizedPattern.endsWith('*')) {
    const prefix = normalizedPattern.slice(0, -1);
    return normalizedValue.startsWith(prefix);
  }

  // Suffix wildcard (e.g., "*BELT")
  if (normalizedPattern.startsWith('*')) {
    const suffix = normalizedPattern.slice(1);
    return normalizedValue.endsWith(suffix);
  }

  // Contains wildcard (e.g., "*BELT*")
  if (normalizedPattern.startsWith('*') && normalizedPattern.endsWith('*')) {
    const substring = normalizedPattern.slice(1, -1);
    return normalizedValue.includes(substring);
  }

  return false;
}

/**
 * Evaluate vendor action rules for a single match
 */
export function evaluateVendorAction(
  match: MatchContext,
  rules: VendorActionRule[]
): VendorAction {
  // If no supplier line code, can't apply rules
  if (!match.supplierLineCode && !match.supplierManufacturer) {
    return 'NONE';
  }

  // Check each rule in order (project-specific first)
  for (const rule of rules) {
    // Check if supplier line code matches
    const lineCodeMatches = patternMatches(
      rule.supplierLineCode,
      match.supplierLineCode || match.supplierManufacturer
    );

    if (!lineCodeMatches) continue;

    // Check if category matches
    const categoryMatches = patternMatches(rule.categoryPattern, match.category);
    if (!categoryMatches) continue;

    // Check if subcategory matches
    const subcategoryMatches = patternMatches(rule.subcategoryPattern, match.subcategory);
    if (!subcategoryMatches) continue;

    // All patterns match - return this action
    return rule.action;
  }

  // No matching rule found
  return 'NONE';
}

/**
 * Apply vendor action rules to all matches in a project
 * This should be called after matching is complete
 */
export async function applyVendorActionsToMatches(projectId: string): Promise<{
  totalMatches: number;
  actionsApplied: number;
  actionCounts: Record<VendorAction, number>;
}> {
  const rules = await loadVendorActionRules(projectId);

  // Get all matches for this project with vendor info
  const matches = await prisma.matchCandidate.findMany({
    where: { projectId },
    select: {
      id: true,
      vendor: true, // Vendor from interchange
    },
  });

  const actionCounts: Record<VendorAction, number> = {
    NONE: 0,
    LIFT: 0,
    REBOX: 0,
    UNKNOWN: 0,
    CONTACT_VENDOR: 0,
  };

  let actionsApplied = 0;

  // Evaluate and update each match
  for (const match of matches) {
    const matchContext: MatchContext = {
      supplierLineCode: match.vendor,
      supplierManufacturer: match.vendor,
      category: null,
      subcategory: null,
    };
    const action = evaluateVendorAction(matchContext, rules);

    if (action !== 'NONE') {
      // Update the match with the vendor action
      await prisma.matchCandidate.update({
        where: { id: match.id },
        data: { vendorAction: action },
      });
      actionsApplied++;
    }

    actionCounts[action]++;
  }

  return {
    totalMatches: matches.length,
    actionsApplied,
    actionCounts,
  };
}

/**
 * Get vendor action statistics for a project
 */
export async function getVendorActionStats(projectId: string): Promise<{
  totalMatches: number;
  actionCounts: Record<VendorAction, number>;
}> {
  const matches = await prisma.matchCandidate.findMany({
    where: { projectId },
    select: { vendorAction: true },
  });

  const actionCounts: Record<VendorAction, number> = {
    NONE: 0,
    LIFT: 0,
    REBOX: 0,
    UNKNOWN: 0,
    CONTACT_VENDOR: 0,
  };

  for (const match of matches) {
    const action = (match.vendorAction as VendorAction) || 'NONE';
    actionCounts[action]++;
  }

  return {
    totalMatches: matches.length,
    actionCounts,
  };
}
