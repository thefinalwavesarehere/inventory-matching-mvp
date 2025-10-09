/**
 * Enhanced Inventory Matching Algorithm
 * Includes unit normalization and cost calculations per MVP requirements
 */

import { InventoryItem, SupplierItem, Match } from './types';

/**
 * Known line code mappings between suppliers and Arnold
 * Format: supplierLineCode -> arnoldLineCode
 */
const LINE_CODE_MAPPINGS: Record<string, string> = {
  'ABH': 'AUV',  // CarQuest body hardware -> Arnold Auveco
  'RDS': 'AXL',  // CarQuest drive shaft -> Arnold axle
};

/**
 * Find matches between Arnold inventory and supplier catalog
 * @param arnoldItems Arnold inventory items
 * @param supplierItems Supplier catalog items
 * @param threshold Minimum confidence score (0.0 to 1.0)
 * @returns Array of matches sorted by confidence score
 */
export function findMatches(
  arnoldItems: InventoryItem[],
  supplierItems: SupplierItem[],
  threshold: number = 0.7
): Match[] {
  const matches: Match[] = [];

  // Compare each Arnold item with each supplier item
  for (const arnoldItem of arnoldItems) {
    for (const supplierItem of supplierItems) {
      const score = calculateMatchScore(arnoldItem, supplierItem);
      
      if (score >= threshold) {
        const reasons = getMatchReasons(arnoldItem, supplierItem);
        matches.push({
          arnoldItem,
          supplierItem,
          confidenceScore: score,
          matchReasons: reasons
        });
      }
    }
  }

  // Sort by confidence score (highest first)
  return matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

/**
 * Calculate overall match score between two items
 * Weighted average of multiple similarity metrics
 */
function calculateMatchScore(
  arnoldItem: InventoryItem,
  supplierItem: SupplierItem
): number {
  // Weights for each component (must sum to 1.0)
  const weights = {
    lineCode: 0.4,
    partNumber: 0.3,
    description: 0.3
  };

  // Calculate individual scores
  const lineCodeScore = calculateLineCodeScore(
    arnoldItem.lineCode,
    supplierItem.supplierLineCode
  );
  
  const partNumberScore = calculatePartNumberSimilarity(
    arnoldItem.partNumber,
    supplierItem.supplierPartNumber
  );
  
  const descriptionScore = calculateDescriptionSimilarity(
    arnoldItem.description,
    supplierItem.description
  );

  // Calculate weighted average
  const totalScore = 
    lineCodeScore * weights.lineCode +
    partNumberScore * weights.partNumber +
    descriptionScore * weights.description;

  return totalScore;
}

/**
 * Calculate line code compatibility score
 * Returns 1.0 for exact or mapped matches, 0.0 otherwise
 */
function calculateLineCodeScore(
  arnoldLineCode: string,
  supplierLineCode: string
): number {
  // Check for exact match
  if (arnoldLineCode === supplierLineCode) {
    return 1.0;
  }

  // Check for known mapping
  if (LINE_CODE_MAPPINGS[supplierLineCode] === arnoldLineCode) {
    return 1.0;
  }

  return 0.0;
}

/**
 * Calculate part number similarity using normalized string comparison
 * Returns a score between 0.0 and 1.0
 */
function calculatePartNumberSimilarity(
  partNumber1: string,
  partNumber2: string
): number {
  // Normalize part numbers (remove special chars, uppercase)
  const norm1 = normalizePartNumber(partNumber1);
  const norm2 = normalizePartNumber(partNumber2);

  // Exact match
  if (norm1 === norm2) {
    return 1.0;
  }

  // Check if one contains the other (partial match)
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    return 0.8;
  }

  // Calculate character-level similarity using Jaccard index
  const set1 = new Set(generateNgrams(norm1, 3));
  const set2 = new Set(generateNgrams(norm2, 3));
  
  return calculateJaccardSimilarity(set1, set2);
}

/**
 * Calculate description similarity using word tokens
 * Returns a score between 0.0 and 1.0
 */
function calculateDescriptionSimilarity(
  description1: string,
  description2: string
): number {
  // Normalize descriptions
  const norm1 = normalizeDescription(description1);
  const norm2 = normalizeDescription(description2);

  // Exact match
  if (norm1 === norm2) {
    return 1.0;
  }

  // Tokenize into words
  const words1 = norm1.split(/\s+/).filter(w => w.length > 2);
  const words2 = norm2.split(/\s+/).filter(w => w.length > 2);

  // Calculate word overlap using Jaccard index
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  return calculateJaccardSimilarity(set1, set2);
}

/**
 * Normalize part number for comparison
 */
function normalizePartNumber(partNumber: string): string {
  return partNumber
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/**
 * Normalize description for comparison
 */
function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate character n-grams from a string
 */
function generateNgrams(text: string, n: number): string[] {
  const ngrams: string[] = [];
  for (let i = 0; i <= text.length - n; i++) {
    ngrams.push(text.substring(i, i + n));
  }
  return ngrams;
}

/**
 * Calculate Jaccard similarity between two sets
 * Jaccard = |A ∩ B| / |A ∪ B|
 */
function calculateJaccardSimilarity<T>(set1: Set<T>, set2: Set<T>): number {
  if (set1.size === 0 && set2.size === 0) {
    return 1.0;
  }

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Calculate unit conversion information
 */
function calculateUnitConversion(
  arnoldItem: InventoryItem,
  supplierItem: SupplierItem
): {
  needsConversion: boolean;
  conversionRatio?: number;
  normalizedSupplierPrice?: number;
  priceDifference?: number;
  priceMatchPercentage?: number;
} {
  // Check if unit conversion is needed
  if (arnoldItem.unitOfIssue === 'BOX' && supplierItem.unitOfIssue === 'EACH') {
    if (arnoldItem.piecesPerBox) {
      const normalizedSupplierPrice = supplierItem.unitPrice * arnoldItem.piecesPerBox;
      const priceDiff = Math.abs(arnoldItem.unitPrice - normalizedSupplierPrice);
      const priceMatchPct = (1 - (priceDiff / Math.max(arnoldItem.unitPrice, normalizedSupplierPrice))) * 100;
      
      return {
        needsConversion: true,
        conversionRatio: arnoldItem.piecesPerBox,
        normalizedSupplierPrice,
        priceDifference: priceDiff,
        priceMatchPercentage: priceMatchPct
      };
    }
  }
  
  // Same unit - direct price comparison
  if (arnoldItem.unitOfIssue === supplierItem.unitOfIssue) {
    const priceDiff = Math.abs(arnoldItem.unitPrice - supplierItem.unitPrice);
    const priceMatchPct = (1 - (priceDiff / Math.max(arnoldItem.unitPrice, supplierItem.unitPrice))) * 100;
    
    return {
      needsConversion: false,
      priceDifference: priceDiff,
      priceMatchPercentage: priceMatchPct
    };
  }
  
  return { needsConversion: false };
}

/**
 * Generate human-readable reasons for the match
 */
function getMatchReasons(
  arnoldItem: InventoryItem,
  supplierItem: SupplierItem
): string[] {
  const reasons: string[] = [];

  // Line code compatibility
  const lineCodeScore = calculateLineCodeScore(
    arnoldItem.lineCode,
    supplierItem.supplierLineCode
  );
  
  if (lineCodeScore === 1.0) {
    if (arnoldItem.lineCode === supplierItem.supplierLineCode) {
      reasons.push(`✓ Exact line code match: ${arnoldItem.lineCode}`);
    } else {
      reasons.push(
        `✓ Line code mapping: ${supplierItem.supplierLineCode} → ${arnoldItem.lineCode}`
      );
    }
  }

  // Part number similarity
  const partNumberScore = calculatePartNumberSimilarity(
    arnoldItem.partNumber,
    supplierItem.supplierPartNumber
  );
  
  if (partNumberScore >= 0.8) {
    reasons.push(
      `✓ Part number similarity: ${(partNumberScore * 100).toFixed(0)}%`
    );
  }

  // Description similarity
  const descriptionScore = calculateDescriptionSimilarity(
    arnoldItem.description,
    supplierItem.description
  );
  
  if (descriptionScore >= 0.5) {
    reasons.push(
      `✓ Description similarity: ${(descriptionScore * 100).toFixed(0)}%`
    );
  }

  // Unit conversion and pricing
  const conversion = calculateUnitConversion(arnoldItem, supplierItem);
  
  if (conversion.needsConversion && conversion.conversionRatio) {
    reasons.push(
      `✓ Unit conversion: BOX (${conversion.conversionRatio} pieces) → EACH`
    );
    
    if (conversion.normalizedSupplierPrice) {
      reasons.push(
        `✓ Normalized price: $${arnoldItem.unitPrice.toFixed(2)} vs $${conversion.normalizedSupplierPrice.toFixed(2)}/box`
      );
    }
    
    if (conversion.priceMatchPercentage && conversion.priceMatchPercentage >= 90) {
      reasons.push(
        `✓ Price match: ${conversion.priceMatchPercentage.toFixed(1)}% agreement`
      );
    }
  } else if (!conversion.needsConversion && conversion.priceMatchPercentage) {
    if (conversion.priceMatchPercentage >= 95) {
      reasons.push(
        `✓ Price match: ${conversion.priceMatchPercentage.toFixed(1)}% agreement`
      );
    }
  }

  // Quantity information
  if (arnoldItem.quantity > 0) {
    reasons.push(
      `ℹ Arnold stock: ${arnoldItem.quantity} ${arnoldItem.unitOfIssue}`
    );
  }

  return reasons;
}

