/**
 * Pattern Detection and Rule Learning System
 * 
 * Detects recurring transformation patterns in approved matches
 * and suggests bulk approval for similar items.
 * 
 * Example: If user approves a match where "/" is replaced with "-" in PPG parts,
 * the system finds all other PPG parts with the same pattern and suggests bulk approval.
 */

import { computeTransformationSignature } from './normalization';

export interface PatternMatch {
  storeItemId: string;
  supplierItemId: string;
  storePartNumber: string;
  supplierPartNumber: string;
  transformationSignature: string;
  confidence: number;
  lineCode?: string;
}

export interface DetectedPattern {
  signature: string;
  transformation: string;
  lineCode?: string;
  manufacturer?: string;
  matchCount: number;
  matches: PatternMatch[];
  confidence: number;
  ruleType: string;
}

export interface BulkApprovalSuggestion {
  pattern: DetectedPattern;
  message: string;
  affectedItems: number;
  previewMatches: PatternMatch[];
}

/**
 * Detect patterns in a set of matches
 */
export function detectPatterns(
  matches: PatternMatch[],
  minOccurrences: number = 3
): DetectedPattern[] {
  // Group matches by transformation signature
  const signatureGroups = new Map<string, PatternMatch[]>();

  for (const match of matches) {
    const sig = match.transformationSignature;
    if (!signatureGroups.has(sig)) {
      signatureGroups.set(sig, []);
    }
    signatureGroups.get(sig)!.push(match);
  }

  // Filter groups with enough occurrences
  const patterns: DetectedPattern[] = [];

  for (const [signature, groupMatches] of signatureGroups.entries()) {
    if (groupMatches.length < minOccurrences) {
      continue;
    }

    // Analyze the transformation
    const transformation = analyzeTransformation(
      groupMatches[0].storePartNumber,
      groupMatches[0].supplierPartNumber
    );

    // Check if all matches share the same line code
    const lineCodes = new Set(groupMatches.map(m => m.lineCode).filter(Boolean));
    const sharedLineCode = lineCodes.size === 1 ? Array.from(lineCodes)[0] : undefined;

    // Compute average confidence
    const avgConfidence = groupMatches.reduce((sum, m) => sum + m.confidence, 0) / groupMatches.length;

    // Determine rule type
    const ruleType = determineRuleType(transformation);

    patterns.push({
      signature,
      transformation,
      lineCode: sharedLineCode,
      matchCount: groupMatches.length,
      matches: groupMatches,
      confidence: avgConfidence,
      ruleType,
    });
  }

  // Sort by match count (most common patterns first)
  patterns.sort((a, b) => b.matchCount - a.matchCount);

  return patterns;
}

/**
 * Analyze the transformation between two part numbers
 */
function analyzeTransformation(from: string, to: string): string {
  // Check for simple character replacements
  const fromChars = new Set(from.split(''));
  const toChars = new Set(to.split(''));

  const removedChars = Array.from(fromChars).filter(c => !toChars.has(c));
  const addedChars = Array.from(toChars).filter(c => !fromChars.has(c));

  if (removedChars.length === 1 && addedChars.length === 1) {
    return `Replace "${removedChars[0]}" with "${addedChars[0]}"`;
  }

  if (removedChars.length > 0 && addedChars.length === 0) {
    return `Remove "${removedChars.join(', ')}"`;
  }

  if (removedChars.length === 0 && addedChars.length > 0) {
    return `Add "${addedChars.join(', ')}"`;
  }

  // Check for case changes
  if (from.toUpperCase() === to.toUpperCase() && from !== to) {
    return 'Change case';
  }

  // Check for prefix/suffix changes
  if (to.startsWith(from)) {
    return `Add suffix "${to.substring(from.length)}"`;
  }

  if (to.endsWith(from)) {
    return `Add prefix "${to.substring(0, to.length - from.length)}"`;
  }

  // Generic transformation
  return `Transform "${from}" → "${to}"`;
}

/**
 * Determine the type of rule based on transformation
 */
function determineRuleType(transformation: string): string {
  if (transformation.includes('Replace')) {
    return 'punctuation';
  }

  if (transformation.includes('Remove')) {
    return 'punctuation';
  }

  if (transformation.includes('case')) {
    return 'case_normalization';
  }

  if (transformation.includes('prefix') || transformation.includes('suffix')) {
    return 'affix';
  }

  return 'custom';
}

/**
 * Find similar unmatched items that could benefit from a detected pattern
 */
export async function findSimilarUnmatchedItems(
  pattern: DetectedPattern,
  unmatchedStoreItems: any[],
  supplierItems: any[]
): Promise<PatternMatch[]> {
  const similarMatches: PatternMatch[] = [];

  // Get the transformation details from the pattern
  const sampleMatch = pattern.matches[0];
  
  for (const storeItem of unmatchedStoreItems) {
    // If pattern is line-code specific, filter by line code
    if (pattern.lineCode && storeItem.lineCode !== pattern.lineCode) {
      continue;
    }

    // Try to apply the same transformation
    const transformedPart = applyTransformation(
      storeItem.partNumber,
      pattern.transformation
    );

    if (!transformedPart) {
      continue;
    }

    // Look for supplier items matching the transformed part
    const matchingSuppliers = supplierItems.filter(s => 
      s.canonicalPartNumber === transformedPart ||
      s.partNumber === transformedPart ||
      s.partNumberNorm === transformedPart.toUpperCase().replace(/[^A-Z0-9]/g, '')
    );

    for (const supplier of matchingSuppliers) {
      const signature = computeTransformationSignature(
        storeItem.partNumber,
        supplier.partNumber
      );

      // Check if signature matches the pattern
      if (signature === pattern.signature) {
        similarMatches.push({
          storeItemId: storeItem.id,
          supplierItemId: supplier.id,
          storePartNumber: storeItem.partNumber,
          supplierPartNumber: supplier.partNumber,
          transformationSignature: signature,
          confidence: pattern.confidence,
          lineCode: storeItem.lineCode,
        });
      }
    }
  }

  return similarMatches;
}

/**
 * Apply a transformation to a part number
 */
function applyTransformation(partNumber: string, transformation: string): string | null {
  try {
    // Parse transformation string
    const replaceMatch = transformation.match(/Replace "(.+)" with "(.+)"/);
    if (replaceMatch) {
      const [, from, to] = replaceMatch;
      return partNumber.replace(new RegExp(from, 'g'), to);
    }

    const removeMatch = transformation.match(/Remove "(.+)"/);
    if (removeMatch) {
      const [, chars] = removeMatch;
      let result = partNumber;
      for (const char of chars.split(', ')) {
        result = result.replace(new RegExp(char, 'g'), '');
      }
      return result;
    }

    const addMatch = transformation.match(/Add "(.+)"/);
    if (addMatch) {
      const [, chars] = addMatch;
      return partNumber + chars;
    }

    if (transformation.includes('case')) {
      return partNumber.toUpperCase();
    }

    // Can't apply transformation
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Generate bulk approval suggestion after user approves a match
 */
export async function generateBulkApprovalSuggestion(
  approvedMatch: PatternMatch,
  allPendingMatches: PatternMatch[],
  minOccurrences: number = 5
): Promise<BulkApprovalSuggestion | null> {
  // Find all pending matches with the same transformation signature
  const similarMatches = allPendingMatches.filter(
    m => m.transformationSignature === approvedMatch.transformationSignature
  );

  if (similarMatches.length < minOccurrences) {
    return null;
  }

  // Detect the pattern
  const patterns = detectPatterns([approvedMatch, ...similarMatches], 1);
  
  if (patterns.length === 0) {
    return null;
  }

  const pattern = patterns[0];

  // Generate user-friendly message
  let message = `We found ${similarMatches.length} more items with the same pattern: "${pattern.transformation}"`;
  
  if (pattern.lineCode) {
    message += ` for ${pattern.lineCode} line`;
  }

  message += '. Would you like to approve all of them?';

  // Return suggestion with preview
  return {
    pattern,
    message,
    affectedItems: similarMatches.length,
    previewMatches: similarMatches.slice(0, 10), // Show first 10 as preview
  };
}

/**
 * Create a matching rule from a detected pattern
 */
export function createRuleFromPattern(
  pattern: DetectedPattern,
  scope: 'global' | 'project' | 'manufacturer' | 'line',
  scopeId: string | null = null
): any {
  return {
    ruleType: pattern.ruleType,
    pattern: {
      signature: pattern.signature,
      transformation: pattern.transformation,
    },
    transformation: pattern.transformation,
    scope,
    scopeId,
    confidence: pattern.confidence,
    isActive: true,
    matchCount: pattern.matchCount,
    lastApplied: new Date(),
  };
}

/**
 * Cluster patterns by similarity
 * Groups patterns that are variations of the same rule
 */
export function clusterPatterns(patterns: DetectedPattern[]): DetectedPattern[][] {
  const clusters: DetectedPattern[][] = [];

  for (const pattern of patterns) {
    let addedToCluster = false;

    for (const cluster of clusters) {
      // Check if pattern is similar to any pattern in the cluster
      const representative = cluster[0];
      
      if (arePatternsSimil(pattern, representative)) {
        cluster.push(pattern);
        addedToCluster = true;
        break;
      }
    }

    if (!addedToCluster) {
      clusters.push([pattern]);
    }
  }

  return clusters;
}

/**
 * Check if two patterns are similar enough to be clustered together
 */
function arePatternsSimil(p1: DetectedPattern, p2: DetectedPattern): boolean {
  // Same rule type
  if (p1.ruleType !== p2.ruleType) {
    return false;
  }

  // Same line code (if specified)
  if (p1.lineCode && p2.lineCode && p1.lineCode !== p2.lineCode) {
    return false;
  }

  // Similar transformation
  const t1 = p1.transformation.toLowerCase();
  const t2 = p2.transformation.toLowerCase();

  // Extract the characters being replaced/removed
  const extractChars = (t: string) => {
    const match = t.match(/"(.+?)"/g);
    return match ? match.map(m => m.replace(/"/g, '')) : [];
  };

  const chars1 = extractChars(t1);
  const chars2 = extractChars(t2);

  // Check if they involve the same characters
  return chars1.some(c => chars2.includes(c));
}
