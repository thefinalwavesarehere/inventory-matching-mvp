/**
 * Part Number Normalization Utilities
 * 
 * Implements the normalization strategy from the implementation plan:
 * 1. Line code extraction (first 3 chars for Arnold data)
 * 2. Punctuation normalization (canonical part numbers)
 * 3. Cost normalization
 */

export interface NormalizedPart {
  original: string;
  lineCode: string | null;
  mfrPartNumber: string | null;
  canonical: string;
  normalized: string; // lowercase, trimmed
}

export interface PartNormalizationOptions {
  extractLineCode?: boolean; // Extract first 3 chars as line code
  removePrefix?: string; // Remove specific prefix
  preserveCase?: boolean;
}

/**
 * Extract line code from Arnold-style part numbers
 * Rule: First 3 characters are the line code, rest is manufacturer part number
 * 
 * Examples:
 * - "01M000-2112-73" → line: "01M", mfr: "000-2112-73"
 * - "ABC10026A" → line: "ABC", mfr: "10026A"
 * - "PPG21-3-1" → line: "PPG", mfr: "21-3-1"
 */
export function extractLineCode(partNumber: string): {
  lineCode: string | null;
  mfrPartNumber: string | null;
} {
  if (!partNumber || partNumber.length < 3) {
    return { lineCode: null, mfrPartNumber: partNumber || null };
  }

  const potentialLineCode = partNumber.substring(0, 3).toUpperCase();
  const potentialMfrPart = partNumber.substring(3);
  
  // Validate that the line code contains at least 2 letters
  // AND that the remaining mfrPartNumber is at least 2 characters
  // This prevents "AC488" from being parsed as lineCode="AC4", mfr="88"
  const letterCount = (potentialLineCode.match(/[A-Z]/g) || []).length;
  const hasValidMfrPart = potentialMfrPart && potentialMfrPart.length >= 2;
  
  if (letterCount >= 2 && hasValidMfrPart) {
    // Valid line code (e.g., "ABC", "PPG", "AEL")
    return {
      lineCode: potentialLineCode,
      mfrPartNumber: potentialMfrPart,
    };
  } else {
    // Not a valid line code - treat entire part as mfr part number
    // (e.g., "20SC", "1234", "AC488", "5A-123")
    return {
      lineCode: null,
      mfrPartNumber: partNumber,
    };
  }
}

/**
 * Normalize punctuation in part numbers
 * Removes/standardizes: - / . spaces
 * 
 * Options:
 * - Option A: Remove all punctuation → canonical form
 * - Option B: Keep both raw and canonical
 * 
 * Examples:
 * - "000-2112-73" → "000211273"
 * - "21/3/1" → "2131"
 * - "GM-8036" → "GM8036"
 */
export function normalizePartNumber(
  partNumber: string,
  options: PartNormalizationOptions = {}
): NormalizedPart {
  const original = partNumber;
  
  // Basic normalization: trim and uppercase
  let normalized = partNumber.trim();
  if (!options.preserveCase) {
    normalized = normalized.toUpperCase();
  }

  // Extract line code if requested
  let lineCode: string | null = null;
  let mfrPartNumber: string | null = null;
  
  if (options.extractLineCode) {
    const extracted = extractLineCode(normalized);
    lineCode = extracted.lineCode;
    mfrPartNumber = extracted.mfrPartNumber;
  }

  // Remove prefix if specified
  if (options.removePrefix && normalized.startsWith(options.removePrefix)) {
    normalized = normalized.substring(options.removePrefix.length);
  }

  // Create canonical form: remove all punctuation and spaces
  const canonical = normalized.replace(/[-\/\.\s]/g, '');

  return {
    original,
    lineCode,
    mfrPartNumber,
    canonical,
    normalized: normalized.toLowerCase(),
  };
}

/**
 * Batch normalize part numbers
 */
export function batchNormalize(
  partNumbers: string[],
  options: PartNormalizationOptions = {}
): NormalizedPart[] {
  return partNumbers.map((pn) => normalizePartNumber(pn, options));
}

/**
 * Check if two part numbers are equivalent after normalization
 */
export function arePartsEquivalent(
  part1: string,
  part2: string,
  options: PartNormalizationOptions = {}
): boolean {
  const norm1 = normalizePartNumber(part1, options);
  const norm2 = normalizePartNumber(part2, options);
  return norm1.canonical === norm2.canonical;
}

/**
 * Compute transformation signature between two part numbers
 * Used for pattern detection and rule learning
 * 
 * Examples:
 * - "21/3/1" → "21-3-1" = "slash_to_dash"
 * - "GM-8036" → "GM8036" = "remove_dash"
 */
export function computeTransformationSignature(
  from: string,
  to: string
): string | null {
  const fromNorm = from.trim().toUpperCase();
  const toNorm = to.trim().toUpperCase();

  // If canonical forms match, identify the transformation
  const fromCanonical = fromNorm.replace(/[-\/\.\s]/g, '');
  const toCanonical = toNorm.replace(/[-\/\.\s]/g, '');

  if (fromCanonical !== toCanonical) {
    return null; // Not a simple punctuation transform
  }

  // Detect specific transformations
  const transformations: string[] = [];

  if (fromNorm.includes('/') && toNorm.includes('-')) {
    transformations.push('slash_to_dash');
  } else if (fromNorm.includes('-') && toNorm.includes('/')) {
    transformations.push('dash_to_slash');
  }

  if (fromNorm.includes('-') && !toNorm.includes('-')) {
    transformations.push('remove_dash');
  }

  if (fromNorm.includes('/') && !toNorm.includes('/')) {
    transformations.push('remove_slash');
  }

  if (fromNorm.includes('.') && !toNorm.includes('.')) {
    transformations.push('remove_dot');
  }

  if (fromNorm.includes(' ') && !toNorm.includes(' ')) {
    transformations.push('remove_space');
  }

  return transformations.length > 0 ? transformations.join('_') : 'punctuation_change';
}

/**
 * Cost normalization and comparison
 */
export interface CostComparison {
  difference: number;
  percentDifference: number;
  similarity: number; // 0-1, where 1 is identical
  isClose: boolean; // Within tolerance
}

export function compareCosts(
  cost1: number | null | undefined,
  cost2: number | null | undefined,
  tolerancePercent: number = 5
): CostComparison | null {
  if (cost1 == null || cost2 == null || cost1 <= 0 || cost2 <= 0) {
    return null;
  }

  const difference = Math.abs(cost1 - cost2);
  const avgCost = (cost1 + cost2) / 2;
  const percentDifference = (difference / avgCost) * 100;
  
  // Similarity score: 1.0 for identical, decreases with difference
  // Use exponential decay: similarity = e^(-k * percentDiff)
  const k = 0.1; // Decay constant
  const similarity = Math.exp(-k * percentDifference);

  const isClose = percentDifference <= tolerancePercent;

  return {
    difference,
    percentDifference,
    similarity,
    isClose,
  };
}

/**
 * Detect unit-of-measure mismatches based on cost
 * Example: $1.80 vs $180 (per-foot vs per-roll)
 */
export function detectUnitMismatch(
  cost1: number,
  cost2: number
): {
  likelyMismatch: boolean;
  ratio: number;
  suggestion: string | null;
} {
  const ratio = Math.max(cost1, cost2) / Math.min(cost1, cost2);

  // Common multipliers for unit mismatches
  const commonRatios = [
    { ratio: 12, name: 'per-foot vs per-dozen' },
    { ratio: 50, name: 'per-foot vs per-roll (50ft)' },
    { ratio: 100, name: 'per-unit vs per-hundred' },
    { ratio: 1000, name: 'per-unit vs per-thousand' },
  ];

  for (const { ratio: expectedRatio, name } of commonRatios) {
    if (Math.abs(ratio - expectedRatio) / expectedRatio < 0.1) {
      return {
        likelyMismatch: true,
        ratio,
        suggestion: name,
      };
    }
  }

  // If ratio is very high (>10x), likely a mismatch
  if (ratio > 10) {
    return {
      likelyMismatch: true,
      ratio,
      suggestion: 'Unknown unit mismatch (large price difference)',
    };
  }

  return {
    likelyMismatch: false,
    ratio,
    suggestion: null,
  };
}

/**
 * Parse Excel formula values
 * Handles formulas like =LEFT(A2,3) or =MID(A2,4,100)
 */
export function parseExcelFormula(value: any): string | null {
  if (typeof value !== 'string') {
    return value?.toString() || null;
  }

  // If it starts with =, it's a formula - return null to indicate it needs evaluation
  if (value.startsWith('=')) {
    return null;
  }

  return value;
}

/**
 * Extract line code using Excel LEFT formula logic
 */
export function excelLeft(text: string, numChars: number): string {
  return text.substring(0, numChars);
}

/**
 * Extract manufacturer part using Excel MID formula logic
 */
export function excelMid(text: string, startNum: number, numChars: number): string {
  // Excel is 1-indexed, JavaScript is 0-indexed
  return text.substring(startNum - 1, startNum - 1 + numChars);
}
