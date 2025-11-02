import { normalizePartNumber, normalizeDescription, extractLineCode } from '../utils/fileProcessing';
import prisma from '../db/prisma';

export interface ArnoldItem {
  id: string;
  partNumber: string;
  usageLast12: number | null;
  cost: number | null;
}

export interface SupplierItem {
  id: string;
  partFull: string;
  lineCode: string;
  partNumber: string;
  description: string | null;
  qtyAvail: number | null;
  cost: number | null;
}

export interface MatchResult {
  arnoldItem: ArnoldItem;
  supplierItem: SupplierItem | null;
  matchStage: 'part_number' | 'part_name' | 'description' | 'no_match';
  confidenceScore: number;
  matchReasons: string[];
}

/**
 * Main matching function with multi-stage approach
 * Stage 1: Part number exact match
 * Stage 2: Part name fuzzy match
 * Stage 3: Description semantic match
 */
export async function findMatchesMultiStage(
  arnoldItems: ArnoldItem[],
  supplierItems: SupplierItem[],
  options: {
    useKnownInterchanges?: boolean;
    partNumberThreshold?: number;
    nameThreshold?: number;
    descriptionThreshold?: number;
  } = {}
): Promise<MatchResult[]> {
  const {
    useKnownInterchanges = true,
    partNumberThreshold = 0.9,
    nameThreshold = 0.7,
    descriptionThreshold = 0.6,
  } = options;

  const matches: MatchResult[] = [];
  const knownInterchanges = useKnownInterchanges ? await loadKnownInterchanges() : new Map();

  for (const arnoldItem of arnoldItems) {
    let matchResult: MatchResult | null = null;

    // Stage 1: Check known interchanges first
    if (useKnownInterchanges) {
      matchResult = await matchByKnownInterchange(arnoldItem, supplierItems, knownInterchanges);
      if (matchResult) {
        matches.push(matchResult);
        continue;
      }
    }

    // Stage 2: Direct part number match
    matchResult = matchByPartNumber(arnoldItem, supplierItems, partNumberThreshold);
    if (matchResult && matchResult.confidenceScore >= partNumberThreshold) {
      matches.push(matchResult);
      continue;
    }

    // Stage 3: Part name fuzzy match (using line code + part number patterns)
    matchResult = matchByPartName(arnoldItem, supplierItems, nameThreshold);
    if (matchResult && matchResult.confidenceScore >= nameThreshold) {
      matches.push(matchResult);
      continue;
    }

    // Stage 4: Description semantic match
    // Note: This requires description data which Arnold file doesn't have
    // We'll need to look it up from inventory report or skip
    matchResult = await matchByDescription(arnoldItem, supplierItems, descriptionThreshold);
    if (matchResult && matchResult.confidenceScore >= descriptionThreshold) {
      matches.push(matchResult);
      continue;
    }

    // No match found
    matches.push({
      arnoldItem,
      supplierItem: null,
      matchStage: 'no_match',
      confidenceScore: 0,
      matchReasons: ['No match found in any stage'],
    });
  }

  return matches;
}

/**
 * Load known interchanges from database
 */
async function loadKnownInterchanges(): Promise<Map<string, string>> {
  const interchanges = await prisma.knownInterchange.findMany();
  const map = new Map<string, string>();
  
  for (const interchange of interchanges) {
    map.set(normalizePartNumber(interchange.arnoldSku), normalizePartNumber(interchange.supplierSku));
  }
  
  return map;
}

/**
 * Stage 1: Match using known interchange mappings
 */
async function matchByKnownInterchange(
  arnoldItem: ArnoldItem,
  supplierItems: SupplierItem[],
  knownInterchanges: Map<string, string>
): Promise<MatchResult | null> {
  const normalizedArnold = normalizePartNumber(arnoldItem.partNumber);
  const supplierSku = knownInterchanges.get(normalizedArnold);

  if (!supplierSku) {
    return null;
  }

  // Find the supplier item
  const supplierItem = supplierItems.find(
    item => normalizePartNumber(item.partFull) === supplierSku ||
            normalizePartNumber(item.partNumber) === supplierSku
  );

  if (supplierItem) {
    return {
      arnoldItem,
      supplierItem,
      matchStage: 'part_number',
      confidenceScore: 1.0,
      matchReasons: ['Known interchange mapping from file'],
    };
  }

  return null;
}

/**
 * Stage 2: Direct part number matching
 */
function matchByPartNumber(
  arnoldItem: ArnoldItem,
  supplierItems: SupplierItem[],
  threshold: number
): MatchResult | null {
  const normalizedArnold = normalizePartNumber(arnoldItem.partNumber);
  const arnoldLineCode = extractLineCode(arnoldItem.partNumber);

  let bestMatch: { item: SupplierItem; score: number; reasons: string[] } | null = null;

  for (const supplierItem of supplierItems) {
    const normalizedSupplierFull = normalizePartNumber(supplierItem.partFull);
    const normalizedSupplierPart = normalizePartNumber(supplierItem.partNumber);

    // Exact match on full part number
    if (normalizedArnold === normalizedSupplierFull) {
      return {
        arnoldItem,
        supplierItem,
        matchStage: 'part_number',
        confidenceScore: 1.0,
        matchReasons: ['Exact part number match'],
      };
    }

    // Match on part number (without line code)
    if (normalizedArnold === normalizedSupplierPart) {
      const score = 0.95;
      if (score > (bestMatch?.score || 0)) {
        bestMatch = {
          item: supplierItem,
          score,
          reasons: ['Part number match (without line code)'],
        };
      }
    }

    // Check if Arnold part ends with supplier part number
    if (normalizedArnold.endsWith(normalizedSupplierPart) && normalizedSupplierPart.length >= 4) {
      const score = 0.9;
      if (score > (bestMatch?.score || 0)) {
        bestMatch = {
          item: supplierItem,
          score,
          reasons: ['Arnold part contains supplier part number'],
        };
      }
    }

    // Line code compatibility check
    if (arnoldLineCode && supplierItem.lineCode) {
      const lineCodeMatch = checkLineCodeCompatibility(arnoldLineCode, supplierItem.lineCode);
      if (lineCodeMatch && normalizedSupplierPart.length >= 4) {
        const similarity = calculateStringSimilarity(normalizedArnold, normalizedSupplierPart);
        if (similarity > 0.7) {
          const score = 0.85 * similarity;
          if (score > (bestMatch?.score || 0)) {
            bestMatch = {
              item: supplierItem,
              score,
              reasons: [
                `Line code mapping: ${supplierItem.lineCode} → ${arnoldLineCode}`,
                `Part number similarity: ${(similarity * 100).toFixed(1)}%`,
              ],
            };
          }
        }
      }
    }
  }

  if (bestMatch && bestMatch.score >= threshold) {
    return {
      arnoldItem,
      supplierItem: bestMatch.item,
      matchStage: 'part_number',
      confidenceScore: bestMatch.score,
      matchReasons: bestMatch.reasons,
    };
  }

  return null;
}

/**
 * Stage 3: Part name fuzzy matching
 */
function matchByPartName(
  arnoldItem: ArnoldItem,
  supplierItems: SupplierItem[],
  threshold: number
): MatchResult | null {
  const normalizedArnold = normalizePartNumber(arnoldItem.partNumber);
  const arnoldLineCode = extractLineCode(arnoldItem.partNumber);

  let bestMatch: { item: SupplierItem; score: number; reasons: string[] } | null = null;

  for (const supplierItem of supplierItems) {
    const normalizedSupplierFull = normalizePartNumber(supplierItem.partFull);
    const normalizedSupplierPart = normalizePartNumber(supplierItem.partNumber);

    // Calculate similarity using n-gram overlap
    const similarityFull = calculateNGramSimilarity(normalizedArnold, normalizedSupplierFull, 3);
    const similarityPart = calculateNGramSimilarity(normalizedArnold, normalizedSupplierPart, 3);

    const maxSimilarity = Math.max(similarityFull, similarityPart);

    if (maxSimilarity > (bestMatch?.score || 0)) {
      const reasons = [`Part name similarity: ${(maxSimilarity * 100).toFixed(1)}%`];
      
      if (arnoldLineCode && supplierItem.lineCode) {
        const lineCodeMatch = checkLineCodeCompatibility(arnoldLineCode, supplierItem.lineCode);
        if (lineCodeMatch) {
          reasons.push(`Line code mapping: ${supplierItem.lineCode} → ${arnoldLineCode}`);
        }
      }

      bestMatch = {
        item: supplierItem,
        score: maxSimilarity,
        reasons,
      };
    }
  }

  if (bestMatch && bestMatch.score >= threshold) {
    return {
      arnoldItem,
      supplierItem: bestMatch.item,
      matchStage: 'part_name',
      confidenceScore: bestMatch.score,
      matchReasons: bestMatch.reasons,
    };
  }

  return null;
}

/**
 * Stage 4: Description-based matching
 */
async function matchByDescription(
  arnoldItem: ArnoldItem,
  supplierItems: SupplierItem[],
  threshold: number
): Promise<MatchResult | null> {
  // First, try to find description for Arnold item from inventory report
  const arnoldDescription = await getArnoldDescription(arnoldItem.partNumber);

  if (!arnoldDescription) {
    return null; // Can't match by description without Arnold description
  }

  const normalizedArnoldDesc = normalizeDescription(arnoldDescription);
  let bestMatch: { item: SupplierItem; score: number; reasons: string[] } | null = null;

  for (const supplierItem of supplierItems) {
    if (!supplierItem.description) continue;

    const normalizedSupplierDesc = normalizeDescription(supplierItem.description);
    const similarity = calculateDescriptionSimilarity(normalizedArnoldDesc, normalizedSupplierDesc);

    if (similarity > (bestMatch?.score || 0)) {
      bestMatch = {
        item: supplierItem,
        score: similarity,
        reasons: [
          `Description similarity: ${(similarity * 100).toFixed(1)}%`,
          `Arnold: "${arnoldDescription.substring(0, 50)}..."`,
          `Supplier: "${supplierItem.description.substring(0, 50)}..."`,
        ],
      };
    }
  }

  if (bestMatch && bestMatch.score >= threshold) {
    return {
      arnoldItem,
      supplierItem: bestMatch.item,
      matchStage: 'description',
      confidenceScore: bestMatch.score,
      matchReasons: bestMatch.reasons,
    };
  }

  return null;
}

/**
 * Get Arnold item description from inventory report data
 */
async function getArnoldDescription(partNumber: string): Promise<string | null> {
  const lineCode = extractLineCode(partNumber);
  const partOnly = partNumber.replace(/^[A-Z]+/, '');

  // Look up in supplier catalog where supplier is "Arnold Inventory Report"
  const inventoryItem = await prisma.supplierCatalog.findFirst({
    where: {
      supplierName: 'Arnold Inventory Report',
      OR: [
        { partFull: partNumber },
        { partNumber: partOnly },
        {
          AND: [
            { lineCode: lineCode || '' },
            { partNumber: partOnly },
          ],
        },
      ],
    },
  });

  return inventoryItem?.description || null;
}

/**
 * Check line code compatibility based on known mappings
 */
function checkLineCodeCompatibility(arnoldLineCode: string, supplierLineCode: string): boolean {
  // Known mappings from requirements
  const lineCodeMappings: Record<string, string[]> = {
    'ABH': ['AUV'],
    'RDS': ['AXL'],
    'NCV': ['AXLGM', 'AXL'],
    'GM': ['AXLGM', 'AXL'],
  };

  // Check if there's a known mapping
  const arnoldCodes = lineCodeMappings[supplierLineCode];
  if (arnoldCodes && arnoldCodes.includes(arnoldLineCode)) {
    return true;
  }

  // Check reverse mapping
  for (const [supplier, arnolds] of Object.entries(lineCodeMappings)) {
    if (arnolds.includes(arnoldLineCode) && supplier === supplierLineCode) {
      return true;
    }
  }

  // Exact match
  if (arnoldLineCode === supplierLineCode) {
    return true;
  }

  return false;
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) {
    return 1.0;
  }

  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

/**
 * Calculate Levenshtein distance
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
 * Calculate n-gram similarity (Jaccard similarity)
 */
function calculateNGramSimilarity(str1: string, str2: string, n: number): number {
  const ngrams1 = generateNGrams(str1, n);
  const ngrams2 = generateNGrams(str2, n);

  const set1 = new Set(ngrams1);
  const set2 = new Set(ngrams2);

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Generate n-grams from string
 */
function generateNGrams(str: string, n: number): string[] {
  const ngrams: string[] = [];
  for (let i = 0; i <= str.length - n; i++) {
    ngrams.push(str.substring(i, i + n));
  }
  return ngrams;
}

/**
 * Calculate description similarity using word-based Jaccard similarity
 */
function calculateDescriptionSimilarity(desc1: string, desc2: string): number {
  const words1 = desc1.split(/\s+/).filter(w => w.length > 2);
  const words2 = desc2.split(/\s+/).filter(w => w.length > 2);

  const set1 = new Set(words1);
  const set2 = new Set(words2);

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}
