/**
 * Brand Alias Service
 * 
 * Provides brand/line code normalization using:
 * 1. Database-driven aliases (LineCodeInterchange table)
 * 2. Hardcoded fallback aliases (for common variations)
 * 
 * Used by the Postgres exact matcher to handle brand variations like:
 * - GAT → GATES
 * - ACD → ACDELCO
 * - WAG → WAGNER
 * 
 * This ensures that "GAT 123-456" matches "GATES 123456" even if the
 * line codes don't match exactly.
 */

import { prisma } from '@/app/lib/db/prisma';

/**
 * Hardcoded brand aliases (fallback if database is empty)
 * 
 * Format: { alias: canonical_name }
 */
const HARDCODED_ALIASES: Record<string, string> = {
  // GATES variations
  'GAT': 'GATES',
  'GATE': 'GATES',
  
  // ACDELCO variations
  'ACD': 'ACDELCO',
  'AC': 'ACDELCO',
  'ACDEL': 'ACDELCO',
  
  // WAGNER variations
  'WAG': 'WAGNER',
  
  // MOTORCRAFT variations
  'MC': 'MOTORCRAFT',
  'MTCR': 'MOTORCRAFT',
  
  // CHAMPION variations
  'CHA': 'CHAMPION',
  'CHAMP': 'CHAMPION',
  
  // STANDARD variations
  'STD': 'STANDARD',
  'SMP': 'STANDARD',
  
  // DORMAN variations
  'DOR': 'DORMAN',
  'DORM': 'DORMAN',
  
  // MOOG variations
  'MG': 'MOOG',
  
  // RAYBESTOS variations
  'RAY': 'RAYBESTOS',
  'RB': 'RAYBESTOS',
  
  // TIMKEN variations
  'TIM': 'TIMKEN',
  'TMK': 'TIMKEN',
  
  // FEDERAL MOGUL variations
  'FM': 'FEDERAL MOGUL',
  'FED': 'FEDERAL MOGUL',
  
  // BECK ARNLEY variations
  'BA': 'BECK ARNLEY',
  'BECK': 'BECK ARNLEY',
  
  // CONTINENTAL variations
  'CONT': 'CONTINENTAL',
  'CTI': 'CONTINENTAL',
  
  // DAYCO variations
  'DAY': 'DAYCO',
  
  // DURALAST variations
  'DUR': 'DURALAST',
  'DL': 'DURALAST',
};

/**
 * In-memory cache for brand aliases
 * Loaded from database on first use
 */
let aliasCache: Map<string, string> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load brand aliases from database
 * 
 * @param projectId - Optional project ID to load project-specific aliases
 * @returns Map of source line code to target line code
 */
export async function loadBrandAliases(projectId?: string): Promise<Map<string, string>> {
  try {
    // Check if cache is still valid
    if (aliasCache && Date.now() - cacheTimestamp < CACHE_TTL) {
      return aliasCache;
    }
    
    console.log('[BRAND_ALIAS] Loading brand aliases from database...');
    
    // Load from database
    const interchanges = await prisma.lineCodeInterchange.findMany({
      where: {
        active: true,
        OR: projectId
          ? [{ projectId }, { projectId: null }] // Project-specific + global
          : [{ projectId: null }], // Global only
      },
      orderBy: [
        { priority: 'desc' },
        { projectId: 'desc' }, // Project-specific over global
      ],
    });
    
    // Build alias map
    const aliasMap = new Map<string, string>();
    
    // Add database aliases
    for (const interchange of interchanges) {
      const source = normalizeLineCode(interchange.sourceLineCode);
      const target = normalizeLineCode(interchange.targetLineCode);
      
      if (!aliasMap.has(source)) {
        aliasMap.set(source, target);
      }
    }
    
    // Add hardcoded aliases (only if not already in database)
    for (const [source, target] of Object.entries(HARDCODED_ALIASES)) {
      const normalizedSource = normalizeLineCode(source);
      const normalizedTarget = normalizeLineCode(target);
      
      if (!aliasMap.has(normalizedSource)) {
        aliasMap.set(normalizedSource, normalizedTarget);
      }
    }
    
    console.log(`[BRAND_ALIAS] Loaded ${aliasMap.size} brand aliases (${interchanges.length} from DB, ${Object.keys(HARDCODED_ALIASES).length} hardcoded)`);
    
    // Update cache
    aliasCache = aliasMap;
    cacheTimestamp = Date.now();
    
    return aliasMap;
    
  } catch (error) {
    console.error('[BRAND_ALIAS] Error loading aliases from database:', error);
    
    // Fallback to hardcoded aliases only
    const fallbackMap = new Map<string, string>();
    for (const [source, target] of Object.entries(HARDCODED_ALIASES)) {
      fallbackMap.set(normalizeLineCode(source), normalizeLineCode(target));
    }
    
    console.log(`[BRAND_ALIAS] Using ${fallbackMap.size} hardcoded aliases (database unavailable)`);
    return fallbackMap;
  }
}

/**
 * Normalize a line code for comparison
 * 
 * - UPPER case
 * - Remove all non-alphanumeric characters
 * - Strip leading zeros
 * 
 * @param lineCode - Line code to normalize
 * @returns Normalized line code
 */
function normalizeLineCode(lineCode: string): string {
  return lineCode
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .replace(/^0+/, '');
}

/**
 * Resolve a line code to its canonical form
 * 
 * Examples:
 * - "GAT" → "GATES"
 * - "ACD" → "ACDELCO"
 * - "GATES" → "GATES" (already canonical)
 * 
 * @param lineCode - Line code to resolve
 * @param projectId - Optional project ID for project-specific aliases
 * @returns Canonical line code
 */
export async function resolveLineCode(lineCode: string | null, projectId?: string): Promise<string | null> {
  if (!lineCode) return null;
  
  const normalized = normalizeLineCode(lineCode);
  const aliasMap = await loadBrandAliases(projectId);
  
  // Check if it's an alias
  if (aliasMap.has(normalized)) {
    const canonical = aliasMap.get(normalized)!;
    console.log(`[BRAND_ALIAS] Resolved: ${lineCode} → ${canonical}`);
    return canonical;
  }
  
  // Already canonical (or unknown)
  return normalized;
}

/**
 * Resolve multiple line codes in batch
 * 
 * @param lineCodes - Array of line codes to resolve
 * @param projectId - Optional project ID for project-specific aliases
 * @returns Array of canonical line codes (null for null input)
 */
export async function resolveLineCodesBatch(
  lineCodes: (string | null)[],
  projectId?: string
): Promise<(string | null)[]> {
  const aliasMap = await loadBrandAliases(projectId);
  
  return lineCodes.map(lineCode => {
    if (!lineCode) return null;
    
    const normalized = normalizeLineCode(lineCode);
    return aliasMap.get(normalized) || normalized;
  });
}

/**
 * Check if two line codes are equivalent (considering aliases)
 * 
 * Examples:
 * - areLineCodesEquivalent("GAT", "GATES") → true
 * - areLineCodesEquivalent("ACD", "ACDELCO") → true
 * - areLineCodesEquivalent("GATES", "WAGNER") → false
 * 
 * @param lineCode1 - First line code
 * @param lineCode2 - Second line code
 * @param projectId - Optional project ID for project-specific aliases
 * @returns True if line codes are equivalent
 */
export async function areLineCodesEquivalent(
  lineCode1: string | null,
  lineCode2: string | null,
  projectId?: string
): Promise<boolean> {
  if (!lineCode1 || !lineCode2) return false;
  
  const [resolved1, resolved2] = await resolveLineCodesBatch([lineCode1, lineCode2], projectId);
  
  return resolved1 === resolved2;
}

/**
 * Get all brand aliases as a plain object (for debugging/display)
 * 
 * @param projectId - Optional project ID for project-specific aliases
 * @returns Object mapping source to target line codes
 */
export async function getAllBrandAliases(projectId?: string): Promise<Record<string, string>> {
  const aliasMap = await loadBrandAliases(projectId);
  
  const result: Record<string, string> = {};
  for (const [source, target] of aliasMap.entries()) {
    result[source] = target;
  }
  
  return result;
}

/**
 * Clear the alias cache (useful for testing or when data changes)
 */
export function clearAliasCache(): void {
  aliasCache = null;
  cacheTimestamp = 0;
  console.log('[BRAND_ALIAS] Cache cleared');
}

/**
 * Generate SQL for line code normalization with alias resolution
 * 
 * This generates a CASE statement that can be used in SQL queries
 * to resolve line code aliases.
 * 
 * @param fieldName - Name of the field to normalize (e.g., "lineCode")
 * @param projectId - Optional project ID for project-specific aliases
 * @returns SQL CASE statement
 */
export async function generateLineCodeNormalizationSQL(
  fieldName: string,
  projectId?: string
): Promise<string> {
  const aliasMap = await loadBrandAliases(projectId);
  
  if (aliasMap.size === 0) {
    // No aliases, just normalize
    return `LTRIM(UPPER(REGEXP_REPLACE(${fieldName}, '[^a-zA-Z0-9]', '', 'g')), '0')`;
  }
  
  // Build CASE statement for alias resolution
  const cases: string[] = [];
  for (const [source, target] of aliasMap.entries()) {
    cases.push(`WHEN LTRIM(UPPER(REGEXP_REPLACE(${fieldName}, '[^a-zA-Z0-9]', '', 'g')), '0') = '${source}' THEN '${target}'`);
  }
  
  return `
    CASE
      ${cases.join('\n      ')}
      ELSE LTRIM(UPPER(REGEXP_REPLACE(${fieldName}, '[^a-zA-Z0-9]', '', 'g')), '0')
    END
  `.trim();
}
