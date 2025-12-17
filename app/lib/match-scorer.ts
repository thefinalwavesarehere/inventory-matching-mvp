/**
 * Epic A3: Smarter Fuzzy/AI Matching
 * 
 * Weighted scoring logic with hard filters and match history learning
 */

import { prisma } from '@/app/lib/prisma';

export interface MatchCandidate {
  storePartNumber: string;
  supplierPartNumber: string;
  supplierLineCode?: string | null;
  storeCategory?: string | null;
  supplierCategory?: string | null;
  storeSubcategory?: string | null;
  supplierSubcategory?: string | null;
  storeDescription?: string | null;
  supplierDescription?: string | null;
  projectId: string;
}

export interface ScoringResult {
  score: number;
  breakdown: {
    partNumberSimilarity: number;
    descriptionSimilarity: number;
    categoryMatch: number;
    subcategoryMatch: number;
    historyBonus: number;
  };
  reason?: string;
}

/**
 * Calculate match score with weighted formula and hard filters
 * 
 * Formula:
 * - 50%: Part Number Similarity
 * - 30%: Description Similarity
 * - 10%: Category Match
 * - 10%: Subcategory Match
 * 
 * Hard Filters:
 * - If categories don't match (both present), score = 0
 * 
 * History Lookup:
 * - If in AcceptedMatchHistory, score = 1.0
 * - If in RejectedMatchHistory, score = 0.0
 */
export async function calculateMatchScore(
  candidate: MatchCandidate
): Promise<ScoringResult> {
  // Check history first (highest priority)
  const historyResult = await checkMatchHistory(candidate);
  if (historyResult) {
    return historyResult;
  }

  // Hard Filter: Category mismatch
  if (
    candidate.storeCategory &&
    candidate.supplierCategory &&
    candidate.storeCategory.toLowerCase() !== candidate.supplierCategory.toLowerCase()
  ) {
    return {
      score: 0,
      breakdown: {
        partNumberSimilarity: 0,
        descriptionSimilarity: 0,
        categoryMatch: 0,
        subcategoryMatch: 0,
        historyBonus: 0,
      },
      reason: 'Category mismatch (hard filter)',
    };
  }

  // Calculate component scores
  const partNumberSimilarity = calculatePartNumberSimilarity(
    candidate.storePartNumber,
    candidate.supplierPartNumber
  );

  const descriptionSimilarity = calculateDescriptionSimilarity(
    candidate.storeDescription || '',
    candidate.supplierDescription || ''
  );

  const categoryMatch = calculateCategoryMatch(
    candidate.storeCategory,
    candidate.supplierCategory
  );

  const subcategoryMatch = calculateSubcategoryMatch(
    candidate.storeSubcategory,
    candidate.supplierSubcategory
  );

  // Weighted formula
  const score =
    partNumberSimilarity * 0.5 +
    descriptionSimilarity * 0.3 +
    categoryMatch * 0.1 +
    subcategoryMatch * 0.1;

  return {
    score: Math.max(0, Math.min(1, score)), // Clamp to [0, 1]
    breakdown: {
      partNumberSimilarity,
      descriptionSimilarity,
      categoryMatch,
      subcategoryMatch,
      historyBonus: 0,
    },
  };
}

/**
 * Check match history for this pair
 * Returns score=1.0 if accepted, score=0.0 if rejected, null if not found
 */
async function checkMatchHistory(
  candidate: MatchCandidate
): Promise<ScoringResult | null> {
  const { projectId, storePartNumber, supplierPartNumber } = candidate;

  // Check accepted history
  const accepted = await prisma.acceptedMatchHistory.findFirst({
    where: {
      projectId,
      storePartNumber,
      supplierPartNumber,
    },
  });

  if (accepted) {
    return {
      score: 1.0,
      breakdown: {
        partNumberSimilarity: 1.0,
        descriptionSimilarity: 1.0,
        categoryMatch: 1.0,
        subcategoryMatch: 1.0,
        historyBonus: 1.0,
      },
      reason: 'Previously accepted by user',
    };
  }

  // Check rejected history
  const rejected = await prisma.rejectedMatchHistory.findFirst({
    where: {
      projectId,
      storePartNumber,
      supplierPartNumber,
    },
  });

  if (rejected) {
    return {
      score: 0.0,
      breakdown: {
        partNumberSimilarity: 0,
        descriptionSimilarity: 0,
        categoryMatch: 0,
        subcategoryMatch: 0,
        historyBonus: -1.0,
      },
      reason: 'Previously rejected by user',
    };
  }

  return null;
}

/**
 * Calculate part number similarity using Levenshtein distance
 */
function calculatePartNumberSimilarity(pn1: string, pn2: string): number {
  if (!pn1 || !pn2) return 0;

  // Normalize: remove spaces, hyphens, convert to uppercase
  const normalize = (s: string) =>
    s.replace(/[\s\-]/g, '').toUpperCase();

  const a = normalize(pn1);
  const b = normalize(pn2);

  if (a === b) return 1.0;

  // Levenshtein distance
  const distance = levenshteinDistance(a, b);
  const maxLength = Math.max(a.length, b.length);

  if (maxLength === 0) return 0;

  return 1 - distance / maxLength;
}

/**
 * Calculate description similarity using Jaccard index (token overlap)
 */
function calculateDescriptionSimilarity(desc1: string, desc2: string): number {
  if (!desc1 || !desc2) return 0;

  // Tokenize: split on whitespace, lowercase, remove punctuation
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((t) => t.length > 2) // Ignore short words
    );

  const tokens1 = tokenize(desc1);
  const tokens2 = tokenize(desc2);

  if (tokens1.size === 0 || tokens2.size === 0) return 0;

  // Jaccard index: intersection / union
  const intersection = new Set([...tokens1].filter((t) => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);

  return intersection.size / union.size;
}

/**
 * Calculate category match score
 */
function calculateCategoryMatch(
  cat1?: string | null,
  cat2?: string | null
): number {
  if (!cat1 || !cat2) return 0.5; // Neutral if either is missing

  return cat1.toLowerCase() === cat2.toLowerCase() ? 1.0 : 0.0;
}

/**
 * Calculate subcategory match score
 */
function calculateSubcategoryMatch(
  subcat1?: string | null,
  subcat2?: string | null
): number {
  if (!subcat1 || !subcat2) return 0.5; // Neutral if either is missing

  return subcat1.toLowerCase() === subcat2.toLowerCase() ? 1.0 : 0.0;
}

/**
 * Levenshtein distance algorithm
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Batch scoring for multiple candidates
 */
export async function calculateMatchScoresBatch(
  candidates: MatchCandidate[]
): Promise<ScoringResult[]> {
  return Promise.all(candidates.map((c) => calculateMatchScore(c)));
}
