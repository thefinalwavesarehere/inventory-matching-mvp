/**
 * PostgreSQL Native Fuzzy Matcher - Version 1.0 (Micro-Batch)
 * 
 * Fuzzy matching for items that failed exact matching.
 * Uses PostgreSQL trigram similarity for part numbers AND descriptions.
 * 
 * Strategy:
 * - Fetch 500 unmatched items via Prisma (fast, uses indexes)
 * - Process in micro-batches of 50 items (prevents timeout)
 * - Match on fuzzy part number similarity (≥60%)
 * - Validate with description similarity (≥15%)
 * - Return best match per store item (deduplication)
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
const PART_NUMBER_SIMILARITY_THRESHOLD = 0.60; // 60% minimum part number similarity
const DESCRIPTION_SIMILARITY_THRESHOLD = 0.15; // 15% minimum description validation
const MIN_PART_NUMBER_LENGTH = 3; // Skip very short part numbers

/**
 * Find fuzzy matches for unmatched store items (micro-batch processing)
 * 
 * @param projectId - Project ID
 * @returns Array of fuzzy matches with confidence scores
 */
export async function findPostgresFuzzyMatches(
  projectId: string
): Promise<PostgresFuzzyMatch[]> {
  
  console.log('[POSTGRES_FUZZY_V1.0] === STARTING FUZZY MATCHING ===');
  
  // Pre-flight check
  try {
    const indexCheck = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM pg_indexes
      WHERE indexname IN ('idx_store_part_trgm', 'idx_supplier_part_trgm');
    `;
    
    const indexCount = Number(indexCheck[0]?.count || 0);
    
    if (indexCount < 2) {
      throw new Error(`Fuzzy matching requires trigram indexes. Found ${indexCount}/2.`);
    }
    
    console.log('[POSTGRES_FUZZY_V1.0] ✅ Required indexes verified (2/2 present)');
  } catch (error: any) {
    if (error.message?.includes('Fuzzy matching requires')) {
      throw error;
    }
    console.warn('[POSTGRES_FUZZY_V1.0] ⚠️  Could not verify indexes');
  }
  
  console.log('[POSTGRES_FUZZY_V1.0] Part number threshold:', PART_NUMBER_SIMILARITY_THRESHOLD);
  console.log('[POSTGRES_FUZZY_V1.0] Description threshold:', DESCRIPTION_SIMILARITY_THRESHOLD);
  
  // STEP 1: Get unmatched store items (fast, uses index)
  console.log('[POSTGRES_FUZZY_V1.0] Step 1: Fetching unmatched store items...');
  
  const unmatchedItems = await prisma.storeItem.findMany({
    where: {
      projectId,
      matchCandidates: {
        none: {
          matchStage: { in: [1, 2] }
        }
      },
      NOT: {
        partNumber: null
      }
    },
    select: {
      id: true,
      partNumber: true,
      lineCode: true,
      description: true,
    },
    take: 500, // Process 500 at a time
    orderBy: {
      id: 'asc'
    }
  });
  
  console.log(`[POSTGRES_FUZZY_V1.0] Found ${unmatchedItems.length} unmatched items to process`);
  
  if (unmatchedItems.length === 0) {
    console.log('[POSTGRES_FUZZY_V1.0] No unmatched items - returning empty');
    return [];
  }
  
  // STEP 2: Process in micro-batches of 50 items
  console.log('[POSTGRES_FUZZY_V1.0] Step 2: Finding fuzzy matches...');
  
  const allMatches: PostgresFuzzyMatch[] = [];
  
  for (let i = 0; i < unmatchedItems.length; i += 50) {
    const batch = unmatchedItems.slice(i, i + 50);
    const batchIds = batch.map(item => item.id);
    
    console.log(`[POSTGRES_FUZZY_V1.0] Processing micro-batch ${Math.floor(i/50) + 1}/${Math.ceil(unmatchedItems.length/50)} (${batch.length} items)...`);
    
    const sql = `
      WITH target_items AS (
        SELECT 
          s."id",
          s."partNumber",
          s."lineCode",
          s."description"
        FROM "store_items" s
        WHERE s."id" = ANY($2::text[])
      ),
      fuzzy_candidates AS (
        SELECT 
          t."id" as store_id,
          sup."id" as supplier_id,
          t."partNumber" as store_part,
          sup."partNumber" as supplier_part,
          t."lineCode" as store_line,
          sup."lineCode" as supplier_line,
          t."description" as store_desc,
          sup."description" as supplier_desc,
          SIMILARITY(UPPER(t."partNumber"), UPPER(sup."partNumber")) as part_sim,
          SIMILARITY(LOWER(COALESCE(t."description", '')), LOWER(COALESCE(sup."description", ''))) as desc_sim,
          ROW_NUMBER() OVER (
            PARTITION BY t."id" 
            ORDER BY SIMILARITY(UPPER(t."partNumber"), UPPER(sup."partNumber")) DESC
          ) as rank
        FROM target_items t
        CROSS JOIN "supplier_items" sup
        WHERE 
          sup."projectId" = $1
          AND LENGTH(sup."partNumber") >= ${MIN_PART_NUMBER_LENGTH}
          AND SIMILARITY(UPPER(t."partNumber"), UPPER(sup."partNumber")) >= ${PART_NUMBER_SIMILARITY_THRESHOLD}
          AND SIMILARITY(LOWER(COALESCE(t."description", '')), LOWER(COALESCE(sup."description", ''))) >= ${DESCRIPTION_SIMILARITY_THRESHOLD}
      )
      SELECT 
        store_id as "storeItemId",
        supplier_id as "supplierItemId",
        store_part as "storePartNumber",
        supplier_part as "supplierPartNumber",
        store_line as "storeLineCode",
        supplier_line as "supplierLineCode",
        store_desc as "storeDescription",
        supplier_desc as "supplierDescription",
        part_sim as "partNumberSimilarity",
        desc_sim as "descriptionSimilarity"
      FROM fuzzy_candidates
      WHERE rank = 1
      ORDER BY (part_sim * 0.7 + desc_sim * 0.3) DESC;
    `;
    
    try {
      const batchMatches = await prisma.$queryRawUnsafe<any[]>(sql, projectId, batchIds);
      
      const mappedMatches = batchMatches.map(row => ({
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
      
      allMatches.push(...mappedMatches);
      console.log(`[POSTGRES_FUZZY_V1.0] Micro-batch ${Math.floor(i/50) + 1}: Found ${mappedMatches.length} matches`);
      
    } catch (error: any) {
      console.error(`[POSTGRES_FUZZY_V1.0] Error in micro-batch ${Math.floor(i/50) + 1}:`, error.message);
      // Continue with next batch instead of failing entirely
    }
  }
  
  console.log(`[POSTGRES_FUZZY_V1.0] ✅ Total fuzzy matches found: ${allMatches.length}`);
  
  // Calculate confidence distribution
  const confidenceDistribution = {
    excellent: allMatches.filter(m => m.confidence >= 0.90).length,
    veryGood: allMatches.filter(m => m.confidence >= 0.80 && m.confidence < 0.90).length,
    good: allMatches.filter(m => m.confidence >= 0.70 && m.confidence < 0.80).length,
    fair: allMatches.filter(m => m.confidence >= 0.60 && m.confidence < 0.70).length,
    questionable: allMatches.filter(m => m.confidence < 0.60).length,
  };
  
  console.log('[POSTGRES_FUZZY_V1.0] Confidence distribution:', JSON.stringify(confidenceDistribution, null, 2));
  
  return allMatches;
}

/**
 * Calculate confidence score for fuzzy matches
 */
function calculateFuzzyConfidence(match: any): number {
  const partSim = parseFloat(match.partNumberSimilarity || match.part_sim) || 0;
  const descSim = parseFloat(match.descriptionSimilarity || match.desc_sim) || 0;
  
  // Weighted average: 70% part number, 30% description
  const weightedScore = (partSim * 0.7) + (descSim * 0.3);
  
  // Boost confidence if both are high
  if (partSim >= 0.90 && descSim >= 0.70) {
    return Math.min(0.99, weightedScore + 0.05);
  }
  
  return Math.max(0.60, Math.min(0.95, weightedScore));
}

/**
 * Determine match reason for logging
 */
function determineFuzzyMatchReason(match: any): string {
  const partSim = parseFloat(match.partNumberSimilarity || match.part_sim) || 0;
  const descSim = parseFloat(match.descriptionSimilarity || match.desc_sim) || 0;
  
  if (partSim >= 0.90 && descSim >= 0.70) {
    return 'High similarity on both part number and description';
  } else if (partSim >= 0.80) {
    return 'Strong part number similarity with description validation';
  } else if (partSim >= 0.70) {
    return 'Good part number similarity with description validation';
  } else {
    return 'Moderate part number similarity with description validation';
  }
}
