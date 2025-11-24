/**
 * Multi-Stage Matching Engine
 * 
 * Implements the matching pipeline from the implementation plan:
 * - Stage 0: Pre-processing
 * - Stage 1: Deterministic matching (target 30-40%)
 * - Stage 2: Fuzzy matching
 * - Stage 3: AI matching (existing)
 * - Stage 4: Web search (existing)
 * 
 * Each stage is instrumented to track match rates and performance.
 */

import { compareCosts, computeTransformationSignature } from './normalization';

export interface MatchCandidate {
  storeItemId: string;
  supplierItemId: string;
  method: string;
  confidence: number;
  matchStage: number;
  features: any;
  costDifference?: number;
  costSimilarity?: number;
  transformationSignature?: string | null;
  rulesApplied?: string[];
}

export interface StoreItem {
  id: string;
  partNumber: string;
  partNumberNorm: string;
  canonicalPartNumber: string | null;
  lineCode: string | null;
  mfrPartNumber: string | null;
  description: string | null;
  currentCost: number | null;
}

export interface SupplierItem {
  id: string;
  partNumber: string;
  partNumberNorm: string;
  canonicalPartNumber: string | null;
  lineCode: string | null;
  mfrPartNumber: string | null;
  description: string | null;
  currentCost: number | null;
}

export interface InterchangeMapping {
  competitorFullSku: string;
  arnoldFullSku: string;
  confidence: number;
}

export interface MatchingRule {
  id: string;
  ruleType: string;
  pattern: any;
  transformation: string;
  scope: string;
  scopeId: string | null;
  confidence: number;
}

export interface MatchingOptions {
  stage1Enabled?: boolean;
  stage2Enabled?: boolean;
  fuzzyThreshold?: number;
  costTolerancePercent?: number;
  maxCandidatesPerItem?: number;
}

export interface StageMetrics {
  stageNumber: number;
  stageName: string;
  itemsProcessed: number;
  matchesFound: number;
  matchRate: number;
  avgConfidence: number;
  processingTimeMs: number;
  rulesApplied: string[];
}

export interface MatchingResult {
  matches: MatchCandidate[];
  metrics: StageMetrics[];
  summary: {
    totalItems: number;
    totalMatches: number;
    overallMatchRate: number;
    stage1Matches: number;
    stage2Matches: number;
  };
}

/**
 * Stage 0: Pre-processing
 * Build lookup indexes for fast matching
 */
export class MatchingIndexes {
  // Canonical part number → supplier items
  canonicalIndex: Map<string, SupplierItem[]> = new Map();
  
  // Line code + mfr part → supplier items
  lineCodeMfrIndex: Map<string, SupplierItem[]> = new Map();
  
  // Manufacturer part number only (ignoring line code) → supplier items
  mfrPartOnlyIndex: Map<string, SupplierItem[]> = new Map();
  
  // Interchange mappings
  interchangeIndex: Map<string, string[]> = new Map();
  
  // Rules by type
  rulesByType: Map<string, MatchingRule[]> = new Map();

  constructor(
    supplierItems: SupplierItem[],
    interchanges: InterchangeMapping[],
    rules: MatchingRule[]
  ) {
    this.buildIndexes(supplierItems, interchanges, rules);
  }

  private buildIndexes(
    supplierItems: SupplierItem[],
    interchanges: InterchangeMapping[],
    rules: MatchingRule[]
  ) {
    // Build canonical part number index
    for (const item of supplierItems) {
      if (item.canonicalPartNumber) {
        const key = item.canonicalPartNumber.toUpperCase();
        if (!this.canonicalIndex.has(key)) {
          this.canonicalIndex.set(key, []);
        }
        this.canonicalIndex.get(key)!.push(item);
      }
    }

    // Build line code + mfr part index
    for (const item of supplierItems) {
      if (item.lineCode && item.mfrPartNumber) {
        const key = `${item.lineCode}:${item.mfrPartNumber}`.toUpperCase();
        if (!this.lineCodeMfrIndex.has(key)) {
          this.lineCodeMfrIndex.set(key, []);
        }
        this.lineCodeMfrIndex.get(key)!.push(item);
      }
    }

    // Build manufacturer part number only index (ignoring line code)
    for (const item of supplierItems) {
      if (item.mfrPartNumber) {
        // Normalize the part number (remove punctuation)
        const normalized = item.mfrPartNumber
          .replace(/[-\/\.\s]/g, '')
          .toUpperCase();
        if (!this.mfrPartOnlyIndex.has(normalized)) {
          this.mfrPartOnlyIndex.set(normalized, []);
        }
        this.mfrPartOnlyIndex.get(normalized)!.push(item);
      }
    }

    // Build interchange index
    for (const interchange of interchanges) {
      const key = interchange.competitorFullSku.toUpperCase();
      if (!this.interchangeIndex.has(key)) {
        this.interchangeIndex.set(key, []);
      }
      this.interchangeIndex.get(key)!.push(interchange.arnoldFullSku);
    }

    // Build rules index
    for (const rule of rules) {
      if (!this.rulesByType.has(rule.ruleType)) {
        this.rulesByType.set(rule.ruleType, []);
      }
      this.rulesByType.get(rule.ruleType)!.push(rule);
    }
  }

  getCandidatesByCanonical(canonical: string): SupplierItem[] {
    return this.canonicalIndex.get(canonical.toUpperCase()) || [];
  }

  getCandidatesByLineCodeMfr(lineCode: string, mfrPart: string): SupplierItem[] {
    const key = `${lineCode}:${mfrPart}`.toUpperCase();
    return this.lineCodeMfrIndex.get(key) || [];
  }

  getCandidatesByMfrPartOnly(mfrPart: string): SupplierItem[] {
    // Normalize the part number (remove punctuation)
    const normalized = mfrPart.replace(/[-\/\.\s]/g, '').toUpperCase();
    return this.mfrPartOnlyIndex.get(normalized) || [];
  }

  getInterchangeMatches(partNumber: string): string[] {
    return this.interchangeIndex.get(partNumber.toUpperCase()) || [];
  }

  getRulesByType(ruleType: string): MatchingRule[] {
    return this.rulesByType.get(ruleType) || [];
  }
}

/**
 * Stage 1: Deterministic Matching
 * Target: 30-40% match rate
 */
export function stage1DeterministicMatching(
  storeItems: StoreItem[],
  indexes: MatchingIndexes,
  options: MatchingOptions = {}
): { matches: MatchCandidate[]; metrics: StageMetrics } {
  const startTime = Date.now();
  const matches: MatchCandidate[] = [];
  const rulesApplied: Set<string> = new Set();

  for (const storeItem of storeItems) {
    // Method 1: Exact canonical match
    if (storeItem.canonicalPartNumber) {
      const candidates = indexes.getCandidatesByCanonical(storeItem.canonicalPartNumber);
      
      for (const supplier of candidates) {
        const costComp = compareCosts(
          storeItem.currentCost,
          supplier.currentCost,
          options.costTolerancePercent || 5
        );

        // Base confidence for exact canonical match
        let confidence = 0.95;

        // Boost confidence if costs are close
        if (costComp && costComp.isClose) {
          confidence = Math.min(0.99, confidence + costComp.similarity * 0.04);
        }

        matches.push({
          storeItemId: storeItem.id,
          supplierItemId: supplier.id,
          method: 'EXACT_NORM',
          confidence,
          matchStage: 1,
          features: {
            matchType: 'canonical',
            storeCanonical: storeItem.canonicalPartNumber,
            supplierCanonical: supplier.canonicalPartNumber,
            costMatch: costComp?.isClose || false,
            costSimilarity: costComp?.similarity,
          },
          costDifference: costComp?.difference,
          costSimilarity: costComp?.similarity,
        });

        // Only take first match for deterministic stage
        break;
      }
    }

    // Method 2: Line code + manufacturer part match
    if (storeItem.lineCode && storeItem.mfrPartNumber) {
      const candidates = indexes.getCandidatesByLineCodeMfr(
        storeItem.lineCode,
        storeItem.mfrPartNumber
      );

      for (const supplier of candidates) {
        // Check if we already matched this pair
        const alreadyMatched = matches.some(
          m => m.storeItemId === storeItem.id && m.supplierItemId === supplier.id
        );

        if (alreadyMatched) {
          continue;
        }

        const costComp = compareCosts(
          storeItem.currentCost,
          supplier.currentCost,
          options.costTolerancePercent || 5
        );

        let confidence = 0.90;

        if (costComp && costComp.isClose) {
          confidence = Math.min(0.95, confidence + costComp.similarity * 0.05);
        }

        matches.push({
          storeItemId: storeItem.id,
          supplierItemId: supplier.id,
          method: 'LINE_PN',
          confidence,
          matchStage: 1,
          features: {
            matchType: 'line_mfr',
            lineCode: storeItem.lineCode,
            mfrPart: storeItem.mfrPartNumber,
            costMatch: costComp?.isClose || false,
          },
          costDifference: costComp?.difference,
          costSimilarity: costComp?.similarity,
        });

        break;
      }
    }

    // Method 2.5: Manufacturer part number only (ignoring line code)
    // This handles cases where the same part is sold under different line codes
    if (storeItem.mfrPartNumber) {
      const candidates = indexes.getCandidatesByMfrPartOnly(storeItem.mfrPartNumber);

      for (const supplier of candidates) {
        // Check if we already matched this pair
        const alreadyMatched = matches.some(
          m => m.storeItemId === storeItem.id && m.supplierItemId === supplier.id
        );

        if (alreadyMatched) {
          continue;
        }

        const costComp = compareCosts(
          storeItem.currentCost,
          supplier.currentCost,
          options.costTolerancePercent || 5
        );

        // Base confidence is lower since we're ignoring line code
        let confidence = 0.75;

        // Boost confidence if costs are close
        if (costComp && costComp.isClose) {
          confidence = Math.min(0.85, confidence + costComp.similarity * 0.10);
        }

        // Boost confidence if line codes happen to match anyway
        if (storeItem.lineCode && supplier.lineCode && 
            storeItem.lineCode.toUpperCase() === supplier.lineCode.toUpperCase()) {
          confidence = Math.min(0.90, confidence + 0.10);
        }

        matches.push({
          storeItemId: storeItem.id,
          supplierItemId: supplier.id,
          method: 'EXACT_NORM',
          confidence,
          matchStage: 1,
          features: {
            matchType: 'mfr_part_only',
            mfrPart: storeItem.mfrPartNumber,
            storeLineCode: storeItem.lineCode,
            supplierLineCode: supplier.lineCode,
            lineCodeMatch: storeItem.lineCode === supplier.lineCode,
            costMatch: costComp?.isClose || false,
          },
          costDifference: costComp?.difference,
          costSimilarity: costComp?.similarity,
        });

        // Only take first match for deterministic stage
        break;
      }
    }

    // Method 3: Interchange-based match
    const interchangeMatches = indexes.getInterchangeMatches(storeItem.partNumber);
    
    for (const arnoldSku of interchangeMatches) {
      // Find supplier item with this SKU
      const candidates = indexes.getCandidatesByCanonical(arnoldSku);
      
      for (const supplier of candidates) {
        const alreadyMatched = matches.some(
          m => m.storeItemId === storeItem.id && m.supplierItemId === supplier.id
        );

        if (alreadyMatched) {
          continue;
        }

        matches.push({
          storeItemId: storeItem.id,
          supplierItemId: supplier.id,
          method: 'INTERCHANGE',
          confidence: 1.0,
          matchStage: 1,
          features: {
            matchType: 'interchange',
            competitorSku: storeItem.partNumber,
            arnoldSku,
          },
        });

        rulesApplied.add('interchange');
        break;
      }
    }

    // Method 3.5: Line code prefix stripping
    // Try matching by removing the 3-character line code prefix
    // Example: ABH12957 -> 12957
    if (storeItem.lineCode && storeItem.mfrPartNumber) {
      const candidates = indexes.getCandidatesByCanonical(
        storeItem.mfrPartNumber.replace(/[-\/\.\s]/g, '').toUpperCase()
      );
      
      for (const supplier of candidates) {
        const alreadyMatched = matches.some(
          m => m.storeItemId === storeItem.id && m.supplierItemId === supplier.id
        );

        if (alreadyMatched) {
          continue;
        }

        const costComp = compareCosts(
          storeItem.currentCost,
          supplier.currentCost,
          options.costTolerancePercent || 10
        );

        let confidence = 0.85; // High confidence for line code prefix match

        if (costComp && costComp.isClose) {
          confidence = Math.min(0.92, confidence + costComp.similarity * 0.07);
        }

        matches.push({
          storeItemId: storeItem.id,
          supplierItemId: supplier.id,
          method: 'EXACT_NORM',
          confidence,
          matchStage: 1,
          features: {
            matchType: 'line_code_prefix_strip',
            storePartNumber: storeItem.partNumber,
            supplierPartNumber: supplier.partNumber,
            lineCodeStripped: storeItem.lineCode,
            mfrPartMatched: storeItem.mfrPartNumber,
            costMatch: costComp?.isClose || false,
          },
          costDifference: costComp?.difference,
          costSimilarity: costComp?.similarity,
        });

        break;
      }
    }

    // Method 3.6: Common prefix/suffix variations
    // Try matching by removing common prefixes like "ABC", "DTN", etc.
    if (!matches.some(m => m.storeItemId === storeItem.id)) {
      const commonPrefixes = ['ABC', 'DTN', 'BSC', 'CTS', 'RB', 'WA', 'DP'];
      const canonical = storeItem.canonicalPartNumber || storeItem.partNumber.replace(/[-\/\.\s]/g, '').toUpperCase();
      
      for (const prefix of commonPrefixes) {
        if (canonical.startsWith(prefix) && canonical.length > prefix.length + 3) {
          const withoutPrefix = canonical.substring(prefix.length);
          const candidates = indexes.getCandidatesByCanonical(withoutPrefix);
          
          for (const supplier of candidates) {
            const alreadyMatched = matches.some(
              m => m.storeItemId === storeItem.id && m.supplierItemId === supplier.id
            );

            if (alreadyMatched) {
              continue;
            }

            const costComp = compareCosts(
              storeItem.currentCost,
              supplier.currentCost,
              options.costTolerancePercent || 15
            );

            let confidence = 0.80; // Good confidence for prefix match

            if (costComp && costComp.isClose) {
              confidence = Math.min(0.88, confidence + costComp.similarity * 0.08);
            }

            matches.push({
              storeItemId: storeItem.id,
              supplierItemId: supplier.id,
              method: 'EXACT_NORM',
              confidence,
              matchStage: 1,
              features: {
                matchType: 'prefix_variation',
                storePartNumber: storeItem.partNumber,
                supplierPartNumber: supplier.partNumber,
                prefixRemoved: prefix,
                costMatch: costComp?.isClose || false,
              },
              costDifference: costComp?.difference,
              costSimilarity: costComp?.similarity,
            });

            break;
          }
          
          // If we found a match, stop trying other prefixes
          if (matches.some(m => m.storeItemId === storeItem.id && m.features.matchType === 'prefix_variation')) {
            break;
          }
        }
      }
    }

    // Method 4: Rule-based matching (punctuation rules)
    const punctuationRules = indexes.getRulesByType('punctuation');
    
    for (const rule of punctuationRules) {
      // Apply rule transformation to store item
      const transformed = applyPunctuationRule(storeItem.partNumber, rule.pattern);
      
      if (transformed) {
        const candidates = indexes.getCandidatesByCanonical(transformed);
        
        for (const supplier of candidates) {
          const alreadyMatched = matches.some(
            m => m.storeItemId === storeItem.id && m.supplierItemId === supplier.id
          );

          if (alreadyMatched) {
            continue;
          }

          const signature = computeTransformationSignature(
            storeItem.partNumber,
            supplier.partNumber
          );

          matches.push({
            storeItemId: storeItem.id,
            supplierItemId: supplier.id,
            method: 'RULE_BASED',
            confidence: rule.confidence,
            matchStage: 1,
            features: {
              matchType: 'rule_based',
              ruleId: rule.id,
              transformation: rule.transformation,
            },
            transformationSignature: signature,
            rulesApplied: [rule.id],
          });

          rulesApplied.add(rule.id);
          break;
        }
      }
    }
  }

  const processingTimeMs = Date.now() - startTime;
  const avgConfidence = matches.length > 0
    ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length
    : 0;

  const metrics: StageMetrics = {
    stageNumber: 1,
    stageName: 'Deterministic Matching',
    itemsProcessed: storeItems.length,
    matchesFound: matches.length,
    matchRate: storeItems.length > 0 ? matches.length / storeItems.length : 0,
    avgConfidence,
    processingTimeMs,
    rulesApplied: Array.from(rulesApplied),
  };

  return { matches, metrics };
}

/**
 * Apply punctuation rule transformation
 */
function applyPunctuationRule(partNumber: string, pattern: any): string | null {
  try {
    const { from, to } = pattern;
    
    if (typeof from !== 'string' || typeof to !== 'string') {
      return null;
    }

    // Simple replacement
    const transformed = partNumber.replace(new RegExp(from, 'g'), to);
    
    // Remove all punctuation for canonical form
    return transformed.replace(/[-\/\.\s]/g, '').toUpperCase();
  } catch (error) {
    return null;
  }
}

/**
 * Stage 2: Enhanced Fuzzy Matching
 * For items not matched in Stage 1
 */
export function stage2FuzzyMatching(
  storeItems: StoreItem[],
  supplierItems: SupplierItem[],
  alreadyMatched: Set<string>,
  options: MatchingOptions = {}
): { matches: MatchCandidate[]; metrics: StageMetrics } {
  const startTime = Date.now();
  const matches: MatchCandidate[] = [];
  
  const fuzzyThreshold = options.fuzzyThreshold || 0.75;
  const maxCandidates = options.maxCandidatesPerItem || 500;

  // Filter unmatched store items
  const unmatchedStoreItems = storeItems.filter(item => !alreadyMatched.has(item.id));

  for (const storeItem of unmatchedStoreItems) {
    // Get candidates - try same line code first, then all if no line code or no matches
    let candidates = supplierItems;
    let sameLineCodeOnly = false;
    
    if (storeItem.lineCode) {
      const sameLineCandidates = supplierItems.filter(s => s.lineCode === storeItem.lineCode);
      if (sameLineCandidates.length > 0 && sameLineCandidates.length < maxCandidates) {
        candidates = sameLineCandidates;
        sameLineCodeOnly = true;
      }
    }

    // Limit candidates for performance
    if (candidates.length > maxCandidates) {
      candidates = candidates.slice(0, maxCandidates);
    }

    let bestMatch: MatchCandidate | null = null;
    let bestScore = 0;

    for (const supplier of candidates) {
      const storePart = (storeItem.canonicalPartNumber || storeItem.partNumber).toUpperCase();
      const supplierPart = (supplier.canonicalPartNumber || supplier.partNumber).toUpperCase();
      
      // Method 1: Substring containment (high confidence if one contains the other)
      let partSimilarity = 0;
      let matchMethod = 'fuzzy';
      
      if (storePart.includes(supplierPart) || supplierPart.includes(storePart)) {
        const minLen = Math.min(storePart.length, supplierPart.length);
        const maxLen = Math.max(storePart.length, supplierPart.length);
        partSimilarity = minLen / maxLen; // Similarity based on length ratio
        matchMethod = 'substring_containment';
      } else {
        // Method 2: Levenshtein distance for non-substring matches
        partSimilarity = computeFuzzySimilarity(storePart, supplierPart);
      }

      const descSimilarity = storeItem.description && supplier.description
        ? computeFuzzySimilarity(storeItem.description, supplier.description)
        : 0;

      // Weighted score: part number is more important
      const score = partSimilarity * 0.7 + descSimilarity * 0.3;

      // Lower threshold for substring matches
      const effectiveThreshold = matchMethod === 'substring_containment' ? fuzzyThreshold * 0.8 : fuzzyThreshold;
      
      if (score < effectiveThreshold) {
        continue;
      }

      // Cost awareness
      const costComp = compareCosts(
        storeItem.currentCost,
        supplier.currentCost,
        options.costTolerancePercent || 10
      );

      let adjustedScore = score;
      
      if (costComp) {
        // Boost score if costs are close
        if (costComp.isClose) {
          adjustedScore = Math.min(0.95, score + costComp.similarity * 0.05);
        } else if (costComp.percentDifference > 50) {
          // Penalize if costs are very different
          adjustedScore = score * 0.9;
        }
      }

      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestMatch = {
          storeItemId: storeItem.id,
          supplierItemId: supplier.id,
          method: 'FUZZY_SUBSTRING',
          confidence: adjustedScore,
          matchStage: 2,
          features: {
            partSimilarity,
            descSimilarity,
            combinedScore: score,
            costAdjusted: adjustedScore !== score,
            matchMethod,
            sameLineCodeOnly,
          },
          costDifference: costComp?.difference,
          costSimilarity: costComp?.similarity,
        };
      }
    }

    if (bestMatch) {
      matches.push(bestMatch);
    }
  }

  const processingTimeMs = Date.now() - startTime;
  const avgConfidence = matches.length > 0
    ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length
    : 0;

  const metrics: StageMetrics = {
    stageNumber: 2,
    stageName: 'Fuzzy Matching',
    itemsProcessed: unmatchedStoreItems.length,
    matchesFound: matches.length,
    matchRate: unmatchedStoreItems.length > 0 ? matches.length / unmatchedStoreItems.length : 0,
    avgConfidence,
    processingTimeMs,
    rulesApplied: [],
  };

  return { matches, metrics };
}

/**
 * Simple fuzzy similarity using Levenshtein distance
 */
function computeFuzzySimilarity(str1: string, str2: string): number {
  const s1 = str1.toUpperCase();
  const s2 = str2.toUpperCase();

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(s1, s2);
  return 1 - distance / maxLen;
}

/**
 * Levenshtein distance algorithm
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Main matching orchestrator
 */
export async function runMultiStageMatching(
  storeItems: StoreItem[],
  supplierItems: SupplierItem[],
  interchanges: InterchangeMapping[],
  rules: MatchingRule[],
  options: MatchingOptions = {}
): Promise<MatchingResult> {
  const allMatches: MatchCandidate[] = [];
  const allMetrics: StageMetrics[] = [];

  // Stage 0: Build indexes
  console.log('[MATCHING] Stage 0: Building indexes...');
  const indexes = new MatchingIndexes(supplierItems, interchanges, rules);

  // Stage 1: Deterministic matching
  if (options.stage1Enabled !== false) {
    console.log('[MATCHING] Stage 1: Deterministic matching...');
    const stage1 = stage1DeterministicMatching(storeItems, indexes, options);
    allMatches.push(...stage1.matches);
    allMetrics.push(stage1.metrics);
    console.log(`[MATCHING] Stage 1 complete: ${stage1.matches.length} matches (${(stage1.metrics.matchRate * 100).toFixed(1)}%)`);
  }

  // Stage 2: Fuzzy matching
  if (options.stage2Enabled !== false) {
    console.log('[MATCHING] Stage 2: Fuzzy matching...');
    const matchedStoreIds = new Set(allMatches.map(m => m.storeItemId));
    const stage2 = stage2FuzzyMatching(storeItems, supplierItems, matchedStoreIds, options);
    allMatches.push(...stage2.matches);
    allMetrics.push(stage2.metrics);
    console.log(`[MATCHING] Stage 2 complete: ${stage2.matches.length} matches (${(stage2.metrics.matchRate * 100).toFixed(1)}%)`);
  }

  // Compute summary
  const stage1Matches = allMetrics[0]?.matchesFound || 0;
  const stage2Matches = allMetrics[1]?.matchesFound || 0;

  const summary = {
    totalItems: storeItems.length,
    totalMatches: allMatches.length,
    overallMatchRate: storeItems.length > 0 ? allMatches.length / storeItems.length : 0,
    stage1Matches,
    stage2Matches,
  };

  console.log(`[MATCHING] Complete: ${allMatches.length}/${storeItems.length} matched (${(summary.overallMatchRate * 100).toFixed(1)}%)`);

  return {
    matches: allMatches,
    metrics: allMetrics,
    summary,
  };
}
