/**
 * Vendor Action Resolver Service
 * 
 * Implements Epic A2: Vendor-Action Mapping
 * Automatically tags matches with operational actions (LIFT, REBOX, UNKNOWN, CONTACT_VENDOR)
 * based on configurable rules.
 */

import { PrismaClient, VendorAction } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Match data required for vendor action resolution
 */
export interface MatchData {
  supplierLineCode: string | null;
  category: string | null;
  subcategory: string | null;
}

/**
 * Rule with priority score for ranking
 */
interface RuleWithPriority {
  action: VendorAction;
  categoryPattern: string;
  subcategoryPattern: string;
  priority: number;
}

/**
 * Calculate priority score for a rule match
 * 
 * Priority Order (Highest to Lowest):
 * 1. Exact Category + Exact Subcategory = 3
 * 2. Exact Category + Wildcard Subcategory = 2
 * 3. Wildcard Category + Wildcard Subcategory = 1
 * 
 * @param rule The matched rule
 * @param category The match category
 * @param subcategory The match subcategory
 * @returns Priority score (higher is better)
 */
function calculatePriority(
  rule: { categoryPattern: string; subcategoryPattern: string },
  category: string | null,
  subcategory: string | null
): number {
  const categoryIsExact = rule.categoryPattern !== '*' && rule.categoryPattern === category;
  const subcategoryIsExact = rule.subcategoryPattern !== '*' && rule.subcategoryPattern === subcategory;
  const categoryIsWildcard = rule.categoryPattern === '*';
  const subcategoryIsWildcard = rule.subcategoryPattern === '*';

  if (categoryIsExact && subcategoryIsExact) {
    return 3; // Highest priority: exact match on both
  } else if (categoryIsExact && subcategoryIsWildcard) {
    return 2; // Medium priority: exact category, wildcard subcategory
  } else if (categoryIsWildcard && subcategoryIsWildcard) {
    return 1; // Lowest priority: wildcard on both
  }

  // This shouldn't happen if filtering is correct, but return 0 as fallback
  return 0;
}

/**
 * Check if a rule matches the given match data
 * 
 * @param rule The rule to check
 * @param match The match data
 * @returns True if the rule matches
 */
function ruleMatches(
  rule: { supplierLineCode: string; categoryPattern: string; subcategoryPattern: string },
  match: MatchData
): boolean {
  // Supplier line code must match exactly
  if (rule.supplierLineCode !== match.supplierLineCode) {
    return false;
  }

  // Category: either exact match or wildcard
  const categoryMatches =
    rule.categoryPattern === '*' ||
    rule.categoryPattern === match.category;

  if (!categoryMatches) {
    return false;
  }

  // Subcategory: either exact match or wildcard
  const subcategoryMatches =
    rule.subcategoryPattern === '*' ||
    rule.subcategoryPattern === match.subcategory;

  return subcategoryMatches;
}

/**
 * Resolve vendor action for a match based on configured rules
 * 
 * Logic:
 * 1. Find all active rules where supplier_line_code matches
 * 2. Filter rules where category and subcategory match (exact or wildcard)
 * 3. Rank by priority (exact > partial wildcard > full wildcard)
 * 4. Return the action from the highest priority rule
 * 5. If no rules match, return NONE
 * 
 * @param match Match data (supplierLineCode, category, subcategory)
 * @returns VendorAction (LIFT, REBOX, UNKNOWN, CONTACT_VENDOR, or NONE)
 */
export async function resolveVendorAction(match: MatchData): Promise<VendorAction> {
  // If no supplier line code, return NONE immediately
  if (!match.supplierLineCode) {
    return 'NONE';
  }

  try {
    // Fetch all active rules for this supplier line code
    const rules = await prisma.vendorActionRule.findMany({
      where: {
        supplierLineCode: match.supplierLineCode,
        active: true,
      },
      select: {
        supplierLineCode: true,
        categoryPattern: true,
        subcategoryPattern: true,
        action: true,
      },
    });

    // If no rules found, return NONE
    if (rules.length === 0) {
      return 'NONE';
    }

    // Filter and score matching rules
    const matchingRules: RuleWithPriority[] = rules
      .filter(rule => ruleMatches(rule, match))
      .map(rule => ({
        action: rule.action,
        categoryPattern: rule.categoryPattern,
        subcategoryPattern: rule.subcategoryPattern,
        priority: calculatePriority(rule, match.category, match.subcategory),
      }));

    // If no matching rules, return NONE
    if (matchingRules.length === 0) {
      return 'NONE';
    }

    // Sort by priority (descending) and return the highest priority action
    matchingRules.sort((a, b) => b.priority - a.priority);
    return matchingRules[0].action;

  } catch (error) {
    console.error('[VENDOR_ACTION_RESOLVER] Error resolving vendor action:', error);
    // On error, default to NONE to avoid blocking match creation
    return 'NONE';
  }
}

/**
 * Batch resolve vendor actions for multiple matches
 * More efficient than calling resolveVendorAction multiple times
 * 
 * @param matches Array of match data
 * @returns Array of VendorActions in the same order as input
 */
export async function resolveVendorActionsBatch(matches: MatchData[]): Promise<VendorAction[]> {
  // Get unique supplier line codes
  const uniqueLineCode = [...new Set(matches.map(m => m.supplierLineCode).filter(Boolean))];

  if (uniqueLineCode.length === 0) {
    return matches.map(() => 'NONE');
  }

  try {
    // Fetch all relevant rules in one query
    const rules = await prisma.vendorActionRule.findMany({
      where: {
        supplierLineCode: { in: uniqueLineCode as string[] },
        active: true,
      },
      select: {
        supplierLineCode: true,
        categoryPattern: true,
        subcategoryPattern: true,
        action: true,
      },
    });

    // Resolve action for each match
    return matches.map(match => {
      if (!match.supplierLineCode) {
        return 'NONE';
      }

      // Filter rules for this match's supplier line code
      const matchRules = rules.filter(r => r.supplierLineCode === match.supplierLineCode);

      if (matchRules.length === 0) {
        return 'NONE';
      }

      // Find matching rules and score them
      const matchingRules: RuleWithPriority[] = matchRules
        .filter(rule => ruleMatches(rule, match))
        .map(rule => ({
          action: rule.action,
          categoryPattern: rule.categoryPattern,
          subcategoryPattern: rule.subcategoryPattern,
          priority: calculatePriority(rule, match.category, match.subcategory),
        }));

      if (matchingRules.length === 0) {
        return 'NONE';
      }

      // Return highest priority action
      matchingRules.sort((a, b) => b.priority - a.priority);
      return matchingRules[0].action;
    });

  } catch (error) {
    console.error('[VENDOR_ACTION_RESOLVER] Error in batch resolution:', error);
    // On error, default all to NONE
    return matches.map(() => 'NONE');
  }
}

/**
 * Test the resolver with sample data (for debugging)
 */
export async function testVendorActionResolver() {
  const testCases: MatchData[] = [
    { supplierLineCode: 'GATES', category: 'belts', subcategory: 'V-belt' },
    { supplierLineCode: 'GATES', category: 'belts', subcategory: 'tensioners' },
    { supplierLineCode: 'GATES', category: 'hoses', subcategory: 'coolant' },
    { supplierLineCode: 'PICO', category: 'wiring', subcategory: 'connectors' },
    { supplierLineCode: 'UNKNOWN_BRAND', category: 'parts', subcategory: 'misc' },
  ];

  console.log('[VENDOR_ACTION_RESOLVER] Running test cases...');
  
  for (const testCase of testCases) {
    const action = await resolveVendorAction(testCase);
    console.log(`  ${testCase.supplierLineCode} / ${testCase.category} / ${testCase.subcategory} → ${action}`);
  }
}
