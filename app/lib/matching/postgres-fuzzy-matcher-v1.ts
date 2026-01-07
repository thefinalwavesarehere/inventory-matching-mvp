/**
 * PostgreSQL Native Fuzzy Matcher - Version 1.0
 * 
 * Fuzzy matching for items that failed exact matching.
 * Uses PostgreSQL trigram similarity for part numbers AND descriptions.
 * 
 * Strategy:
 * - Match on fuzzy part number similarity (≥70%)
 * - Validate with description similarity (≥15%)
 * - Return best match per store item (deduplication)
 * - Only process items not already matched in Stage 1
 */

import { prisma } from '@/app/lib/db/prisma';

export interface PostgresFuzzyMatch {
  storeItemId: string;
  supplierItemId: string;
  storePartNumber: string;
  supplierPartNumber: string;
  storeLineCode: string | null;
  supplierLineCode: string | null;
  storeDescription: string | null;
  supplierDescription: string | null;
  partNumberSimilarity: number;
  descriptionSimilarity: number;
  confidence: number;
  matchMethod: string;
  matchReason: string;
}

/**
 * Configuration
 */
const PART_NUMBER_SIMILARITY_THRESHOLD = 0.60; // 60% minimum part number similarity (lowered for better coverage)
const DESCRIPTION_SIMILARITY_THRESHOLD = 0.15; // 15% minimum description validation
const MIN_PART_NUMBER_LENGTH = 3; // Skip very short part numbers (too many false positives)

/**
 * Find fuzzy matches for unmatched store items
 * 
 * Only processes items that don't already have Stage 1 (exact) matches.
 * 
 * @param projectId - Project ID
 * @returns Array of fuzzy matches with confidence scores
 */
export async function findPostgresFuzzyMatches(
  projectId: string
): Promise<PostgresFuzzyMatch[]> {
  
  console.log('[POSTGRES_FUZZY_V1.0] === STARTING FUZZY MATCHING ===');
  console.log('[POSTGRES_FUZZY_V1.0] Part number threshold:', PART_NUMBER_SIMILARITY_THRESHOLD);
  console.log('[POSTGRES_FUZZY_V1.0] Description threshold:', DESCRIPTION_SIMILARITY_THRESHOLD);
  
  const sql = `
    WITH unmatched_store_items AS (
      -- Only process store items not already matched in Stage 1
      -- LIMIT to prevent timeout on huge datasets
      SELECT s."id", s."partNumber", s."lineCode", s."description"
      FROM "store_items" s
      WHERE s."projectId" = $1
        AND NOT EXISTS (
          SELECT 1 FROM "match_candidates" mc
          WHERE mc."storeItemId" = s."id"
            AND mc."projectId" = $1
            AND mc."matchStage" IN (1, 2)  -- Skip items matched in Stage 1 or 2
        )
        AND LENGTH(s."partNumber") >= ${MIN_PART_NUMBER_LENGTH}
      ORDER BY s."id"
      LIMIT 3000  -- Process 3000 items per run (prevents timeout)
    ),
    ranked_fuzzy_matches AS (
      SELECT 
        s."id" as "storeItemId",
        sup."id" as "supplierItemId",
        s."partNumber" as "storePartNumber",
        sup."partNumber" as "supplierPartNumber",
        s."lineCode" as "storeLineCode",
        sup."lineCode" as "supplierLineCode",
        s."description" as "storeDescription",
        sup."description" as "supplierDescription",
        
        -- Part number fuzzy similarity (trigram-based)
        SIMILARITY(
          UPPER(s."partNumber"), 
          UPPER(sup."partNumber")
        ) as "partNumberSimilarity",
        
        -- Description fuzzy similarity (trigram-based)
        SIMILARITY(
          LOWER(COALESCE(s."description", '')), 
          LOWER(COALESCE(sup."description", ''))
        ) as "descriptionSimilarity",
        
        -- Rank by combined score (part number is weighted higher)
        ROW_NUMBER() OVER (
          PARTITION BY s."id" 
          ORDER BY 
            (SIMILARITY(UPPER(s."partNumber"), UPPER(sup."partNumber")) * 0.7 +  -- 70% weight on part number
             SIMILARITY(LOWER(COALESCE(s."description", '')), LOWER(COALESCE(sup."description", ''))) * 0.3  -- 30% weight on description
            ) DESC,
            sup."id"
        ) as match_rank
      FROM 
        unmatched_store_items s
      INNER JOIN 
        "supplier_items" sup
      ON
        sup."projectId" = $1
        
        -- PRIMARY FILTER: Part number similarity must meet threshold
        AND SIMILARITY(UPPER(s."partNumber"), UPPER(sup."partNumber")) >= ${PART_NUMBER_SIMILARITY_THRESHOLD}
        
        -- VALIDATION FILTER: Description similarity must meet minimum threshold
        AND SIMILARITY(LOWER(COALESCE(s."description", '')), LOWER(COALESCE(sup."description", ''))) >= ${DESCRIPTION_SIMILARITY_THRESHOLD}
      WHERE
        -- Ensure supplier part numbers are substantial
        LENGTH(sup."partNumber") >= ${MIN_PART_NUMBER_LENGTH}
    )
    -- Return only the best match per store item
    SELECT 
      "storeItemId",
      "supplierItemId",
      "storePartNumber",
      "supplierPartNumber",
      "storeLineCode",
      "supplierLineCode",
      "storeDescription",
      "supplierDescription",
      "partNumberSimilarity",
      "descriptionSimilarity"
    FROM ranked_fuzzy_matches
    WHERE match_rank = 1
    ORDER BY 
      ("partNumberSimilarity" * 0.7 + "descriptionSimilarity" * 0.3) DESC,
      "storeItemId"
  `;

  try {
    const params = [projectId];
    
    console.log('[POSTGRES_FUZZY_V1.0] Executing fuzzy matching SQL...');
    
    const results = await prisma.$queryRawUnsafe<any[]>(sql, ...params);
    
    console.log(`[POSTGRES_FUZZY_V1.0] Found ${results.length} fuzzy matches`);
    
    // Calculate confidence distribution
    const confidenceDistribution = {
      excellent: results.filter(r => calculateFuzzyConfidence(r) >= 0.90).length,
      veryGood: results.filter(r => calculateFuzzyConfidence(r) >= 0.80 && calculateFuzzyConfidence(r) < 0.90).length,
      good: results.filter(r => calculateFuzzyConfidence(r) >= 0.70 && calculateFuzzyConfidence(r) < 0.80).length,
      fair: results.filter(r => calculateFuzzyConfidence(r) >= 0.60 && calculateFuzzyConfidence(r) < 0.70).length,
      questionable: results.filter(r => calculateFuzzyConfidence(r) < 0.60).length,
    };
    
    console.log('[POSTGRES_FUZZY_V1.0] Confidence distribution:', JSON.stringify(confidenceDistribution, null, 2));
    
    // Map results to typed interface
    return results.map(row => ({
      storeItemId: row.storeItemId,
      supplierItemId: row.supplierItemId,
      storePartNumber: row.storePartNumber,
      supplierPartNumber: row.supplierPartNumber,
      storeLineCode: row.storeLineCode,
      supplierLineCode: row.supplierLineCode,
      storeDescription: row.storeDescription,
      supplierDescription: row.supplierDescription,
      partNumberSimilarity: parseFloat(row.partNumberSimilarity) || 0,
      descriptionSimilarity: parseFloat(row.descriptionSimilarity) || 0,
      confidence: calculateFuzzyConfidence(row),
      matchMethod: 'POSTGRES_FUZZY_V1.0',
      matchReason: determineFuzzyMatchReason(row),
    }));
    
  } catch (error: any) {
    console.error('[POSTGRES_FUZZY_V1.0] Error executing SQL:', error);
    throw error;
  }
}

/**
 * Calculate confidence score for fuzzy matches
 * 
 * Combines part number similarity + description similarity
 * with heavier weight on part number (70/30 split)
 * 
 * @param match - Raw match result
 * @returns Confidence score 0.0-1.0
 */
function calculateFuzzyConfidence(match: any): number {
  const partSim = parseFloat(match.partNumberSimilarity) || 0;
  const descSim = parseFloat(match.descriptionSimilarity) || 0;
  
  // Weighted average: 70% part number, 30% description
  const combinedScore = (partSim * 0.7) + (descSim * 0.3);
  
  // Scale to confidence tiers
  if (combinedScore >= 0.90) return 0.95; // Excellent fuzzy match
  if (combinedScore >= 0.85) return 0.90; // Very good fuzzy match
  if (combinedScore >= 0.80) return 0.85; // Good fuzzy match
  if (combinedScore >= 0.75) return 0.80; // Fair fuzzy match
  if (combinedScore >= 0.70) return 0.75; // Borderline fuzzy match
  
  // Below 0.70 weighted score (shouldn't happen with our thresholds)
  return 0.70;
}

/**
 * Generate human-readable match reason
 * 
 * @param match - Raw match result
 * @returns Match reason string
 */
function determineFuzzyMatchReason(match: any): string {
  const partSim = parseFloat(match.partNumberSimilarity) || 0;
  const descSim = parseFloat(match.descriptionSimilarity) || 0;
  const combinedScore = (partSim * 0.7) + (descSim * 0.3);
  
  return `Fuzzy match: ${(partSim * 100).toFixed(0)}% part number + ${(descSim * 100).toFixed(0)}% description similarity (combined: ${(combinedScore * 100).toFixed(0)}%)`;
}

/**
 * Get fuzzy matching statistics
 * 
 * @param projectId - Project ID
 * @returns Match statistics
 */
export async function getFuzzyMatchStats(projectId: string) {
  // Count unmatched items (eligible for fuzzy matching)
  const unmatchedCount = await prisma.storeItem.count({
    where: {
      projectId,
      matchCandidates: {
        none: {
          matchStage: 1, // No exact matches
        },
      },
    },
  });
  
  const matches = await findPostgresFuzzyMatches(projectId);
  
  const stats = {
    unmatchedItemsEligible: unmatchedCount,
    totalFuzzyMatches: matches.length,
    fuzzyMatchRate: unmatchedCount > 0 ? (matches.length / unmatchedCount) * 100 : 0,
    averagePartNumberSimilarity: matches.reduce((sum, m) => sum + m.partNumberSimilarity, 0) / matches.length || 0,
    averageDescriptionSimilarity: matches.reduce((sum, m) => sum + m.descriptionSimilarity, 0) / matches.length || 0,
    excellentMatches: matches.filter(m => m.confidence >= 0.90).length,
    veryGoodMatches: matches.filter(m => m.confidence >= 0.80 && m.confidence < 0.90).length,
    goodMatches: matches.filter(m => m.confidence >= 0.70 && m.confidence < 0.80).length,
    fairMatches: matches.filter(m => m.confidence >= 0.60 && m.confidence < 0.70).length,
    questionableMatches: matches.filter(m => m.confidence < 0.60).length,
  };
  
  return stats;
}

/**
 * Process fuzzy matching (wrapper function for job processor)
 * 
 * @param projectId - Project ID
 * @returns Number of matches saved
 */
export async function processFuzzyMatching(projectId: string): Promise<number> {
  console.log('[FUZZY-MATCH-V1.0] Starting fuzzy matching for project', projectId);
  
  // Get unmatched count
  const unmatchedCount = await prisma.storeItem.count({
    where: {
      projectId,
      matchCandidates: {
        none: {
          matchStage: 1,
        },
      },
    },
  });
  
  console.log(`[FUZZY-MATCH-V1.0] Eligible items: ${unmatchedCount} (items without exact matches)`);
  
  if (unmatchedCount === 0) {
    console.log('[FUZZY-MATCH-V1.0] No items eligible for fuzzy matching');
    return 0;
  }
  
  // Run fuzzy matching
  const matches = await findPostgresFuzzyMatches(projectId);
  
  console.log(`[FUZZY-MATCH-V1.0] Found ${matches.length} fuzzy matches`);
  
  if (matches.length === 0) {
    console.log('[FUZZY-MATCH-V1.0] No fuzzy matches found');
    return 0;
  }
  
  // Save matches to database
  let savedCount = 0;
  
  for (let i = 0; i < matches.length; i += 100) {
    const batch = matches.slice(i, i + 100);
    
    try {
      const dataToInsert = batch.map((match) => ({
        projectId,
        storeItemId: match.storeItemId,
        targetType: 'SUPPLIER' as const,
        targetId: match.supplierItemId,
        method: 'FUZZY_SUBSTRING' as const,
        confidence: match.confidence,
        matchStage: 2, // Stage 2: Fuzzy matching
        status: 'PENDING' as const,
        features: {
          matchMethod: match.matchMethod,
          matchReason: match.matchReason,
          storePartNumber: match.storePartNumber,
          supplierPartNumber: match.supplierPartNumber,
          storeLineCode: match.storeLineCode || 'N/A',
          supplierLineCode: match.supplierLineCode || 'N/A',
          storeDescription: match.storeDescription,
          supplierDescription: match.supplierDescription,
          partNumberSimilarity: match.partNumberSimilarity,
          descriptionSimilarity: match.descriptionSimilarity,
        },
      }));
      
      await prisma.matchCandidate.createMany({
        data: dataToInsert,
        skipDuplicates: true,
      });
      
      savedCount += batch.length;
    } catch (error) {
      console.error(`[FUZZY-MATCH-V1.0] ERROR: Failed to save batch ${i / 100 + 1}`);
      console.error(error);
      throw error;
    }
  }
  
  const matchRate = unmatchedCount > 0 ? (savedCount / unmatchedCount) * 100 : 0;
  
  console.log(`[FUZZY-MATCH-V1.0] ✅ COMPLETE`);
  console.log(`[FUZZY-MATCH-V1.0] Saved ${savedCount} fuzzy matches`);
  console.log(`[FUZZY-MATCH-V1.0] Fuzzy match rate: ${matchRate.toFixed(1)}% of unmatched items`);
  
  return savedCount;
}
