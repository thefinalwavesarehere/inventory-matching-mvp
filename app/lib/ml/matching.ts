import { IInventoryItem, ISupplierItem } from '../db/models';

// Simple matching algorithm for MVP demonstration
export function findMatches(
  arnoldItems: IInventoryItem[],
  supplierItems: ISupplierItem[],
  threshold = 0.7
): Array<{
  arnoldItem: IInventoryItem;
  supplierItem: ISupplierItem;
  confidenceScore: number;
  matchReasons: string[];
}> {
  const matches = [];

  // For each Arnold item, find potential matches
  for (const arnoldItem of arnoldItems) {
    // Filter potential matches by line code first (if we know the mapping)
    const potentialMatches = supplierItems.filter(item => {
      return checkLineCodeCompatibility(arnoldItem.lineCode, item.supplierLineCode);
    });

    // Calculate scores for potential matches
    for (const supplierItem of potentialMatches) {
      const score = calculateMatchScore(arnoldItem, supplierItem);
      const reasons = getMatchReasons(arnoldItem, supplierItem, score);
      
      if (score >= threshold) {
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

// Check if line codes are compatible based on known mappings
function checkLineCodeCompatibility(arnoldLineCode: string, supplierLineCode: string): boolean {
  // Known mappings for MVP demo
  const lineCodeMappings: Record<string, string> = {
    'ABH': 'AUV', // CarQuest to Arnold for Auveco parts
    'RDS': 'AXL', // CarQuest to Arnold for axles
  };

  // Check if there's a direct mapping
  if (lineCodeMappings[supplierLineCode] === arnoldLineCode) {
    return true;
  }

  // For demo purposes, also allow exact matches
  if (supplierLineCode === arnoldLineCode) {
    return true;
  }

  // For MVP, we'll be lenient and allow any comparison
  return true;
}

// Calculate match score between Arnold item and supplier item
function calculateMatchScore(arnoldItem: IInventoryItem, supplierItem: ISupplierItem): number {
  let score = 0;
  let totalWeight = 0;

  // Line code compatibility (highest weight)
  const lineCodeWeight = 0.4;
  const lineCodeScore = checkLineCodeCompatibility(
    arnoldItem.lineCode, 
    supplierItem.supplierLineCode
  ) ? 1.0 : 0.0;
  score += lineCodeScore * lineCodeWeight;
  totalWeight += lineCodeWeight;

  // Part number similarity
  const partNumberWeight = 0.3;
  const partNumberScore = calculatePartNumberSimilarity(
    arnoldItem.partNumber,
    supplierItem.supplierPartNumber
  );
  score += partNumberScore * partNumberWeight;
  totalWeight += partNumberWeight;

  // Description similarity
  const descriptionWeight = 0.3;
  const descriptionScore = calculateDescriptionSimilarity(
    arnoldItem.description,
    supplierItem.description
  );
  score += descriptionScore * descriptionWeight;
  totalWeight += descriptionWeight;

  // Normalize score
  return score / totalWeight;
}

// Calculate similarity between part numbers
function calculatePartNumberSimilarity(partNumber1: string, partNumber2: string): number {
  // Normalize part numbers
  const normalized1 = normalizePartNumber(partNumber1);
  const normalized2 = normalizePartNumber(partNumber2);

  // For exact matches
  if (normalized1 === normalized2) {
    return 1.0;
  }

  // For partial matches, use Jaccard similarity of character trigrams
  const trigrams1 = generateNgrams(normalized1, 3);
  const trigrams2 = generateNgrams(normalized2, 3);
  
  return calculateJaccardSimilarity(trigrams1, trigrams2);
}

// Calculate similarity between descriptions
function calculateDescriptionSimilarity(description1: string, description2: string): number {
  // Normalize descriptions
  const normalized1 = normalizeDescription(description1);
  const normalized2 = normalizeDescription(description2);

  // For exact matches
  if (normalized1 === normalized2) {
    return 1.0;
  }

  // For partial matches, use Jaccard similarity of word tokens
  const tokens1 = normalized1.split(/\s+/);
  const tokens2 = normalized2.split(/\s+/);
  
  return calculateJaccardSimilarity(tokens1, tokens2);
}

// Normalize part number
function normalizePartNumber(partNumber: string): string {
  return partNumber
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

// Normalize description
function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Generate n-grams from text
function generateNgrams(text: string, n: number): string[] {
  const ngrams = [];
  for (let i = 0; i <= text.length - n; i++) {
    ngrams.push(text.substring(i, i + n));
  }
  return ngrams;
}

// Calculate Jaccard similarity between two arrays
function calculateJaccardSimilarity(array1: string[], array2: string[]): number {
  const set1 = new Set(array1);
  const set2 = new Set(array2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

// Get reasons for the match
function getMatchReasons(
  arnoldItem: IInventoryItem, 
  supplierItem: ISupplierItem,
  score: number
): string[] {
  const reasons = [];

  // Line code mapping
  if (checkLineCodeCompatibility(arnoldItem.lineCode, supplierItem.supplierLineCode)) {
    reasons.push(`Line code mapping: ${supplierItem.supplierLineCode} → ${arnoldItem.lineCode}`);
  }

  // Part number similarity
  const partNumberSimilarity = calculatePartNumberSimilarity(
    arnoldItem.partNumber,
    supplierItem.supplierPartNumber
  );
  
  if (partNumberSimilarity > 0.8) {
    reasons.push(`Part number similarity: ${(partNumberSimilarity * 100).toFixed(1)}%`);
  }

  // Description similarity
  const descriptionSimilarity = calculateDescriptionSimilarity(
    arnoldItem.description,
    supplierItem.description
  );
  
  if (descriptionSimilarity > 0.5) {
    reasons.push(`Description similarity: ${(descriptionSimilarity * 100).toFixed(1)}%`);
  }

  // Unit conversion
  if (arnoldItem.unitOfIssue !== supplierItem.unitOfIssue) {
    if (arnoldItem.unitOfIssue === 'BOX' && supplierItem.unitOfIssue === 'EACH' && arnoldItem.piecesPerBox) {
      reasons.push(`Unit conversion: ${arnoldItem.piecesPerBox} pieces per box`);
    }
  }

  return reasons;
}
