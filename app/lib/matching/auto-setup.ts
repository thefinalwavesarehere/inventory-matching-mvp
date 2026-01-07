/**
 * Auto-Setup for Matching System
 * 
 * Automatically configures database for optimal matching performance.
 * Safe to call on every upload - checks if setup already exists.
 * 
 * Creates:
 * - pg_trgm extension (for fuzzy matching)
 * - Trigram indexes (for description & part number similarity)
 * - Normalized part number indexes (for exact matching)
 * - Project lookup indexes (for query performance)
 */

import { prisma } from '@/app/lib/db/prisma';

/**
 * Check if matching system is already set up
 */
async function isSetupComplete(): Promise<boolean> {
  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_store_part_trgm'
      ) as exists;
    `;
    
    return result[0]?.exists || false;
  } catch (error) {
    console.error('[MATCHING_SETUP] Error checking setup status:', error);
    return false;
  }
}

/**
 * Enable required PostgreSQL extensions
 */
async function enableExtensions(): Promise<void> {
  console.log('[MATCHING_SETUP] Enabling PostgreSQL extensions...');
  
  try {
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS pg_trgm;`;
    console.log('[MATCHING_SETUP] ✅ pg_trgm extension enabled');
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('[MATCHING_SETUP] ✅ pg_trgm already enabled');
    } else {
      console.error('[MATCHING_SETUP] ❌ Failed to enable pg_trgm:', error.message);
      throw error;
    }
  }
}

/**
 * Create all necessary indexes for matching performance
 */
async function createIndexes(): Promise<void> {
  console.log('[MATCHING_SETUP] Creating performance indexes...');
  
  const indexes = [
    {
      name: 'Description trigram (store)',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_store_description_trgm 
            ON "store_items" USING gin (LOWER(description) gin_trgm_ops);`
    },
    {
      name: 'Description trigram (supplier)',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_supplier_description_trgm 
            ON "supplier_items" USING gin (LOWER(description) gin_trgm_ops);`
    },
    {
      name: 'Part number trigram (store)',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_store_part_trgm 
            ON "store_items" USING gin (UPPER("partNumber") gin_trgm_ops);`
    },
    {
      name: 'Part number trigram (supplier)',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_supplier_part_trgm 
            ON "supplier_items" USING gin (UPPER("partNumber") gin_trgm_ops);`
    },
    {
      name: 'Normalized part number (store)',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_norm_part_store 
            ON "store_items" (
              LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
            );`
    },
    {
      name: 'Normalized part number (supplier)',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_norm_part_supplier 
            ON "supplier_items" (
              LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
            );`
    },
    {
      name: 'Project lookup (store)',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_store_project 
            ON "store_items" ("projectId");`
    },
    {
      name: 'Project lookup (supplier)',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_supplier_project 
            ON "supplier_items" ("projectId");`
    },
    {
      name: 'Match candidates project+stage',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_project_stage 
            ON "match_candidates" ("projectId", "matchStage");`
    },
    {
      name: 'Match candidates store lookup',
      sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_store_item 
            ON "match_candidates" ("storeItemId", "matchStage");`
    },
  ];
  
  for (const index of indexes) {
    try {
      console.log(`[MATCHING_SETUP] Creating: ${index.name}...`);
      await prisma.$executeRawUnsafe(index.sql);
      console.log(`[MATCHING_SETUP] ✅ ${index.name} created`);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log(`[MATCHING_SETUP] ⚠️  ${index.name} already exists`);
      } else if (error.message?.includes('being built')) {
        console.log(`[MATCHING_SETUP] ⏳ ${index.name} is being built concurrently`);
      } else {
        console.error(`[MATCHING_SETUP] ❌ Failed to create ${index.name}:`, error.message);
        // Don't throw - continue with other indexes
      }
    }
  }
}

/**
 * Main auto-setup function
 * Safe to call multiple times - idempotent
 * 
 * @returns Promise<boolean> - true if setup completed, false if already set up
 */
export async function ensureMatchingSetup(): Promise<boolean> {
  try {
    console.log('[MATCHING_SETUP] ========== CHECKING MATCHING SYSTEM SETUP ==========');
    
    // Check if already set up
    const alreadySetup = await isSetupComplete();
    
    if (alreadySetup) {
      console.log('[MATCHING_SETUP] ✅ System already configured - skipping setup');
      return false;
    }
    
    console.log('[MATCHING_SETUP] 🔧 First-time setup detected - configuring database...');
    
    // Enable extensions
    await enableExtensions();
    
    // Create indexes
    await createIndexes();
    
    console.log('[MATCHING_SETUP] ========== SETUP COMPLETE ==========');
    console.log('[MATCHING_SETUP] ✅ Matching system ready for use');
    console.log('[MATCHING_SETUP] Note: Index building may continue in background');
    
    return true;
    
  } catch (error) {
    console.error('[MATCHING_SETUP] ========== SETUP FAILED ==========');
    console.error('[MATCHING_SETUP] Error:', error);
    console.error('[MATCHING_SETUP] System will continue but performance may be degraded');
    
    // Don't throw - allow application to continue
    // Matching will still work, just slower without indexes
    return false;
  }
}

/**
 * Get current setup status (for debugging/monitoring)
 */
export async function getSetupStatus(): Promise<{
  isComplete: boolean;
  extensionsEnabled: boolean;
  indexesCreated: number;
  indexesPending: number;
}> {
  try {
    // Check pg_trgm extension
    const extensionCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
      ) as exists;
    `;
    
    // Check indexes
    const indexCheck = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT indexname as name
      FROM pg_indexes
      WHERE indexname LIKE 'idx_%_trgm'
         OR indexname LIKE 'idx_norm_part_%'
         OR indexname LIKE 'idx_%_project'
         OR indexname LIKE 'idx_match_%';
    `;
    
    const expectedIndexCount = 10; // Total indexes we create
    const actualIndexCount = indexCheck.length;
    
    return {
      isComplete: actualIndexCount >= expectedIndexCount,
      extensionsEnabled: extensionCheck[0]?.exists || false,
      indexesCreated: actualIndexCount,
      indexesPending: Math.max(0, expectedIndexCount - actualIndexCount),
    };
  } catch (error) {
    console.error('[MATCHING_SETUP] Error checking status:', error);
    return {
      isComplete: false,
      extensionsEnabled: false,
      indexesCreated: 0,
      indexesPending: 10,
    };
  }
}
