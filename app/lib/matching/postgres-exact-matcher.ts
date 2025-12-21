/**
 * Postgres Native Exact Matcher
 * 
 * Uses database-level REGEXP_REPLACE to normalize part numbers during matching.
 * This is more reliable than JavaScript string manipulation because:
 * 1. Postgres regex engine is optimized for this
 * 2. Normalization happens in a single query (no multiple passes)
 * 3. Can leverage database indexes
 * 4. Handles dirty data consistently
 * 
 * Matching Strategy:
 * - Normalize both part numbers: UPPER + remove all non-alphanumeric characters
 * - Match on normalized part number + line code
 * - Returns matches with confidence scores
 */

import { prisma } from '@/app/lib/db/prisma';

export interface PostgresExactMatch {
  storeItemId: string;
  supplierItemId: string;
  storePartNumber: string;
  supplierPartNumber: string;
  storeLineCode: string | null;
  supplierLineCode: string | null;
  confidence: number;
  matchMethod: string;
}

/**
 * Find exact matches using Postgres native REGEXP_REPLACE
 * 
 * @param projectId - The project ID to match items for
 * @returns Array of exact matches with metadata
 */
export async function findPostgresExactMatches(
  projectId: string
): Promise<PostgresExactMatch[]> {
  
  const sql = `
    SELECT 
      s."id" as "storeItemId",
      sup."id" as "supplierItemId",
      s."partNumber" as "storePartNumber",
      sup."partNumber" as "supplierPartNumber",
      s."lineCode" as "storeLineCode",
      sup."lineCode" as "supplierLineCode"
    FROM 
      "store_items" s
    INNER JOIN 
      "supplier_items" sup
    ON
      -- Normalize both part numbers: UPPER + remove all non-alphanumeric
      UPPER(REGEXP_REPLACE(s."partNumber", '[^a-zA-Z0-9]', '', 'g')) = 
      UPPER(REGEXP_REPLACE(sup."partNumber", '[^a-zA-Z0-9]', '', 'g'))
      
      -- Match on line code (case-insensitive, normalized)
      AND (
        -- Both have line codes and they match (normalized)
        (s."lineCode" IS NOT NULL 
         AND sup."lineCode" IS NOT NULL 
         AND UPPER(REGEXP_REPLACE(s."lineCode", '[^a-zA-Z0-9]', '', 'g')) = 
             UPPER(REGEXP_REPLACE(sup."lineCode", '[^a-zA-Z0-9]', '', 'g')))
        
        -- OR both are NULL (no line code)
        OR (s."lineCode" IS NULL AND sup."lineCode" IS NULL)
      )
    WHERE
      s."projectId" = $1
      AND sup."projectId" = $1
      
      -- Ensure part numbers are not empty after normalization
      AND REGEXP_REPLACE(s."partNumber", '[^a-zA-Z0-9]', '', 'g') != ''
      AND REGEXP_REPLACE(sup."partNumber", '[^a-zA-Z0-9]', '', 'g') != ''
    
    ORDER BY s."id", sup."id"
  `;

  try {
    const results = await prisma.$queryRawUnsafe<any[]>(sql, projectId);
    
    // Map results to typed interface with confidence scores
    return results.map(row => ({
      storeItemId: row.storeItemId,
      supplierItemId: row.supplierItemId,
      storePartNumber: row.storePartNumber,
      supplierPartNumber: row.supplierPartNumber,
      storeLineCode: row.storeLineCode,
      supplierLineCode: row.supplierLineCode,
      confidence: calculateConfidence(row),
      matchMethod: 'POSTGRES_EXACT',
    }));
    
  } catch (error) {
    console.error('[POSTGRES_MATCHER] Error executing SQL:', error);
    throw error;
  }
}

/**
 * Calculate confidence score based on match quality
 * 
 * @param match - The raw match result from database
 * @returns Confidence score between 0 and 1
 */
function calculateConfidence(match: any): number {
  // Start with high confidence for exact normalized match
  let confidence = 0.95;
  
  // Boost confidence if original part numbers are identical (no normalization needed)
  if (match.storePartNumber === match.supplierPartNumber) {
    confidence = 1.0;
  }
  
  // Boost confidence if line codes are identical (not just normalized)
  if (match.storeLineCode && 
      match.supplierLineCode && 
      match.storeLineCode === match.supplierLineCode) {
    confidence = Math.min(1.0, confidence + 0.03);
  }
  
  return confidence;
}

/**
 * Find exact matches and return statistics
 * 
 * @param projectId - The project ID to match items for
 * @returns Match statistics
 */
export async function getPostgresMatchStats(projectId: string) {
  const matches = await findPostgresExactMatches(projectId);
  
  // Get total store items count
  const totalStoreItems = await prisma.storeItem.count({
    where: { projectId }
  });
  
  // Calculate statistics
  const stats = {
    totalMatches: matches.length,
    totalStoreItems,
    matchRate: totalStoreItems > 0 ? (matches.length / totalStoreItems) * 100 : 0,
    perfectMatches: matches.filter(m => m.confidence === 1.0).length,
    normalizedMatches: matches.filter(m => m.confidence < 1.0).length,
  };
  
  return stats;
}

/**
 * Alternative: Use canonicalPartNumber if it exists and is reliable
 * This is faster because it uses pre-computed normalized values
 * 
 * @param projectId - The project ID to match items for
 * @returns Array of exact matches
 */
export async function findCanonicalExactMatches(
  projectId: string
): Promise<PostgresExactMatch[]> {
  
  const sql = `
    SELECT 
      s."id" as "storeItemId",
      sup."id" as "supplierItemId",
      s."partNumber" as "storePartNumber",
      sup."partNumber" as "supplierPartNumber",
      s."lineCode" as "storeLineCode",
      sup."lineCode" as "supplierLineCode"
    FROM 
      "store_items" s
    INNER JOIN 
      "supplier_items" sup
    ON
      -- Use pre-computed canonical part numbers (faster)
      s."canonicalPartNumber" IS NOT NULL
      AND sup."canonicalPartNumber" IS NOT NULL
      AND s."canonicalPartNumber" = sup."canonicalPartNumber"
      
      -- Match on line code (normalized)
      AND (
        (s."lineCode" IS NOT NULL 
         AND sup."lineCode" IS NOT NULL 
         AND UPPER(s."lineCode") = UPPER(sup."lineCode"))
        OR (s."lineCode" IS NULL AND sup."lineCode" IS NULL)
      )
    WHERE
      s."projectId" = $1
      AND sup."projectId" = $1
      AND s."canonicalPartNumber" != ''
    
    ORDER BY s."id", sup."id"
  `;

  try {
    const results = await prisma.$queryRawUnsafe<any[]>(sql, projectId);
    
    return results.map(row => ({
      storeItemId: row.storeItemId,
      supplierItemId: row.supplierItemId,
      storePartNumber: row.storePartNumber,
      supplierPartNumber: row.supplierPartNumber,
      storeLineCode: row.storeLineCode,
      supplierLineCode: row.supplierLineCode,
      confidence: calculateConfidence(row),
      matchMethod: 'CANONICAL_EXACT',
    }));
    
  } catch (error) {
    console.error('[CANONICAL_MATCHER] Error executing SQL:', error);
    throw error;
  }
}

/**
 * Hybrid approach: Try canonical first (fast), fall back to REGEXP_REPLACE (reliable)
 * 
 * @param projectId - The project ID to match items for
 * @returns Array of exact matches
 */
export async function findHybridExactMatches(
  projectId: string
): Promise<PostgresExactMatch[]> {
  
  // Try canonical first (uses indexes, very fast)
  const canonicalMatches = await findCanonicalExactMatches(projectId);
  
  // Get matched store item IDs
  const matchedStoreIds = new Set(canonicalMatches.map(m => m.storeItemId));
  
  // If we have good coverage, return canonical matches
  const totalStoreItems = await prisma.storeItem.count({
    where: { projectId }
  });
  
  const coverageRate = totalStoreItems > 0 ? (matchedStoreIds.size / totalStoreItems) : 0;
  
  console.log(`[HYBRID_MATCHER] Canonical coverage: ${(coverageRate * 100).toFixed(1)}% (${matchedStoreIds.size}/${totalStoreItems})`);
  
  // If canonical coverage is good (>40%), use it
  if (coverageRate > 0.40) {
    console.log(`[HYBRID_MATCHER] Using canonical matches (good coverage)`);
    return canonicalMatches;
  }
  
  // Otherwise, fall back to REGEXP_REPLACE for maximum reliability
  console.log(`[HYBRID_MATCHER] Falling back to REGEXP_REPLACE (low canonical coverage)`);
  return findPostgresExactMatches(projectId);
}
