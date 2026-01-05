import { findDirectMatches } from './postgres-direct-matcher-v8';

export interface PostgresExactMatch {
  storeItemId: string;
  supplierItemId: string;
  storePartNumber: string;
  supplierPartNumber: string;
  storeLineCode: string | null;
  supplierLineCode: string | null;
  confidence: number;
  matchMethod: string;
  matchReason: string;
}

/**
 * V9.0 CLEAN VELOCITY MATCHER
 * 
 * Uses ONLY V8.0 Direct Index Matching - no fallback logic.
 * This guarantees consistent performance and prevents timeouts.
 * 
 * If a store item doesn't match via direct index, it remains PENDING
 * for fuzzy or AI stages.
 */
export async function findMatches(projectId: string, storeIds?: string[]): Promise<PostgresExactMatch[]> {
  console.log(`[MATCHER_V9.0_CLEAN] Starting Clean Velocity Matching (Direct Index Only)`);
  console.log(`[MATCHER_V9.0_CLEAN] Project: ${projectId}, Items: ${storeIds?.length || 'all'}`);
  
  // V9.0: ONLY use V8.0 direct index matching
  // No fallback, no suffix logic, no interchange hop
  // Pure database index speed
  const matches = await findDirectMatches(projectId, storeIds);
  
  console.log(`[MATCHER_V9.0_CLEAN] Found ${matches.length} direct matches`);
  console.log(`[MATCHER_V9.0_CLEAN] Performance: Direct index lookup only (no fallback)`);
  
  return matches;
}
