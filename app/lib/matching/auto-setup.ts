/**
 * Auto-Setup for Matching System with Progress Tracking
 * 
 * Automatically configures database for optimal matching performance.
 * Provides real-time status updates on index creation progress.
 * 
 * Creates:
 * - pg_trgm extension (for fuzzy matching)
 * - Trigram indexes (for description & part number similarity)
 * - Normalized part number indexes (for exact matching)
 * - Project lookup indexes (for query performance)
 */

import { prisma } from '@/app/lib/db/prisma';

/**
 * Index definition with metadata
 */
interface IndexDefinition {
  name: string;
  displayName: string;
  sql: string;
  critical: boolean; // If true, must exist for matching to work properly
  estimatedTimeMins: number; // Estimated build time in minutes
}

/**
 * Index status information
 */
export interface IndexStatus {
  name: string;
  displayName: string;
  exists: boolean;
  isBuilding: boolean;
  isValid: boolean;
  sizeBytes: number;
  sizeHuman: string;
  critical: boolean;
  estimatedTimeMins: number;
}

/**
 * Complete setup status
 */
export interface SetupStatus {
  isComplete: boolean;
  isReady: boolean; // Ready for matching (all critical indexes exist)
  extensionEnabled: boolean;
  totalIndexes: number;
  readyIndexes: number;
  buildingIndexes: number;
  failedIndexes: number;
  indexes: IndexStatus[];
  message: string;
  estimatedWaitMins: number;
}

/**
 * All indexes required for matching system
 */
const INDEXES: IndexDefinition[] = [
  // CRITICAL: Required for exact matching (Stage 1)
  {
    name: 'idx_store_description_trgm',
    displayName: 'Store Description (Exact Matching)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_store_description_trgm 
          ON "store_items" USING gin (LOWER(description) gin_trgm_ops);`,
    critical: true,
    estimatedTimeMins: 2,
  },
  {
    name: 'idx_supplier_description_trgm',
    displayName: 'Supplier Description (Exact Matching)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_supplier_description_trgm 
          ON "supplier_items" USING gin (LOWER(description) gin_trgm_ops);`,
    critical: true,
    estimatedTimeMins: 5,
  },
  {
    name: 'idx_norm_part_store',
    displayName: 'Store Normalized Part Numbers (Exact Matching)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_norm_part_store 
          ON "store_items" (
            LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
          );`,
    critical: true,
    estimatedTimeMins: 1,
  },
  {
    name: 'idx_norm_part_supplier',
    displayName: 'Supplier Normalized Part Numbers (Exact Matching)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_norm_part_supplier 
          ON "supplier_items" (
            LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
          );`,
    critical: true,
    estimatedTimeMins: 3,
  },
  
  // CRITICAL: Required for fuzzy matching (Stage 2)
  {
    name: 'idx_store_part_trgm',
    displayName: 'Store Part Numbers (Fuzzy Matching)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_store_part_trgm 
          ON "store_items" USING gin (UPPER("partNumber") gin_trgm_ops);`,
    critical: true,
    estimatedTimeMins: 1,
  },
  {
    name: 'idx_supplier_part_trgm',
    displayName: 'Supplier Part Numbers (Fuzzy Matching)',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_supplier_part_trgm 
          ON "supplier_items" USING gin (UPPER("partNumber") gin_trgm_ops);`,
    critical: true,
    estimatedTimeMins: 3,
  },
  
  // PERFORMANCE: Not critical but improves query speed
  {
    name: 'idx_store_project',
    displayName: 'Store Project Lookup',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_store_project 
          ON "store_items" ("projectId");`,
    critical: false,
    estimatedTimeMins: 1,
  },
  {
    name: 'idx_supplier_project',
    displayName: 'Supplier Project Lookup',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_supplier_project 
          ON "supplier_items" ("projectId");`,
    critical: false,
    estimatedTimeMins: 2,
  },
  {
    name: 'idx_match_project_stage',
    displayName: 'Match Candidates Lookup',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_project_stage 
          ON "match_candidates" ("projectId", "matchStage");`,
    critical: false,
    estimatedTimeMins: 1,
  },
  {
    name: 'idx_match_store_item',
    displayName: 'Match Store Item Lookup',
    sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_match_store_item 
          ON "match_candidates" ("storeItemId", "matchStage");`,
    critical: false,
    estimatedTimeMins: 1,
  },
];

/**
 * Get detailed status of all indexes
 */
export async function getSetupStatus(): Promise<SetupStatus> {
  try {
    // Check pg_trgm extension
    const extensionCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
      ) as exists;
    `;
    
    const extensionEnabled = extensionCheck[0]?.exists || false;
    
    // Get detailed index status
    const indexDetails = await prisma.$queryRaw<Array<{
      indexname: string;
      tablename: string;
      indexdef: string;
      indisvalid: boolean;
      size_bytes: bigint;
    }>>`
      SELECT 
        i.indexrelid::regclass::text as indexname,
        i.indrelid::regclass::text as tablename,
        pg_get_indexdef(i.indexrelid) as indexdef,
        i.indisvalid,
        pg_relation_size(i.indexrelid) as size_bytes
      FROM pg_index i
      JOIN pg_class c ON c.oid = i.indexrelid
      WHERE c.relname IN (${INDEXES.map(idx => idx.name).join("', '")});
    `;
    
    // Check for indexes currently being built
    const buildingIndexesRaw = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT 
        c.relname as indexname
      FROM pg_stat_progress_create_index p
      JOIN pg_class c ON c.oid = p.relid
      WHERE c.relname IN (${INDEXES.map(idx => idx.name).join("', '")});
    `;
    
    const buildingSet = new Set(buildingIndexesRaw.map(b => b.indexname));
    
    // Map index status
    const indexStatuses: IndexStatus[] = INDEXES.map(indexDef => {
      const detail = indexDetails.find(d => d.indexname.includes(indexDef.name));
      const isBuilding = buildingSet.has(indexDef.name);
      const exists = !!detail;
      const isValid = detail?.indisvalid || false;
      const sizeBytes = detail?.size_bytes ? Number(detail.size_bytes) : 0;
      
      return {
        name: indexDef.name,
        displayName: indexDef.displayName,
        exists,
        isBuilding,
        isValid: exists && isValid,
        sizeBytes,
        sizeHuman: formatBytes(sizeBytes),
        critical: indexDef.critical,
        estimatedTimeMins: indexDef.estimatedTimeMins,
      };
    });
    
    // Calculate summary stats
    const totalIndexes = INDEXES.length;
    const readyIndexes = indexStatuses.filter(s => s.exists && s.isValid).length;
    const buildingIndexes = indexStatuses.filter(s => s.isBuilding).length;
    const failedIndexes = indexStatuses.filter(s => s.exists && !s.isValid).length;
    const criticalReady = indexStatuses.filter(s => s.critical && s.exists && s.isValid).length;
    const criticalTotal = INDEXES.filter(i => i.critical).length;
    
    const isComplete = readyIndexes === totalIndexes;
    const isReady = criticalReady === criticalTotal && extensionEnabled;
    
    // Calculate estimated wait time
    const pendingIndexes = indexStatuses.filter(s => !s.exists || s.isBuilding);
    const estimatedWaitMins = pendingIndexes.reduce((sum, idx) => sum + idx.estimatedTimeMins, 0);
    
    // Generate status message
    let message = '';
    if (isComplete) {
      message = '✅ All indexes ready - System fully optimized';
    } else if (isReady) {
      message = `✅ Critical indexes ready - System operational (${readyIndexes}/${totalIndexes} indexes complete)`;
    } else if (buildingIndexes > 0) {
      message = `⏳ Building indexes... (${buildingIndexes} in progress, ~${estimatedWaitMins} min remaining)`;
    } else if (failedIndexes > 0) {
      message = `❌ ${failedIndexes} index(es) failed - Check logs`;
    } else if (!extensionEnabled) {
      message = '❌ pg_trgm extension not enabled - Run setup';
    } else {
      message = `⚠️  Indexes not created - Run setup (${readyIndexes}/${totalIndexes} ready)`;
    }
    
    return {
      isComplete,
      isReady,
      extensionEnabled,
      totalIndexes,
      readyIndexes,
      buildingIndexes: buildingIndexes,
      failedIndexes,
      indexes: indexStatuses,
      message,
      estimatedWaitMins,
    };
    
  } catch (error) {
    console.error('[SETUP_STATUS] Error checking status:', error);
    
    return {
      isComplete: false,
      isReady: false,
      extensionEnabled: false,
      totalIndexes: INDEXES.length,
      readyIndexes: 0,
      buildingIndexes: 0,
      failedIndexes: 0,
      indexes: [],
      message: '❌ Error checking setup status',
      estimatedWaitMins: 0,
    };
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
  console.log('[MATCHING_SETUP] This will take ~5-10 minutes for large datasets');
  console.log('[MATCHING_SETUP] Indexes build in background - you can continue using the app');
  
  for (const indexDef of INDEXES) {
    try {
      console.log(`[MATCHING_SETUP] Creating: ${indexDef.displayName}...`);
      console.log(`[MATCHING_SETUP] Estimated time: ${indexDef.estimatedTimeMins} min`);
      console.log(`[MATCHING_SETUP] Critical: ${indexDef.critical ? 'YES' : 'NO'}`);
      
      await prisma.$executeRawUnsafe(indexDef.sql);
      
      console.log(`[MATCHING_SETUP] ✅ ${indexDef.displayName} - Index creation started`);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log(`[MATCHING_SETUP] ✅ ${indexDef.displayName} - Already exists`);
      } else if (error.message?.includes('being built')) {
        console.log(`[MATCHING_SETUP] ⏳ ${indexDef.displayName} - Already building`);
      } else {
        console.error(`[MATCHING_SETUP] ❌ ${indexDef.displayName} - Failed:`, error.message);
        
        if (indexDef.critical) {
          console.error(`[MATCHING_SETUP] ⚠️  WARNING: Critical index failed - matching may not work properly`);
        }
      }
    }
  }
  
  console.log('[MATCHING_SETUP] ✅ All index creation commands issued');
  console.log('[MATCHING_SETUP] ⏳ Indexes are building in background');
  console.log('[MATCHING_SETUP] Check status with getSetupStatus() or /api/admin/setup-status');
}

/**
 * Main auto-setup function
 * Safe to call multiple times - idempotent
 * 
 * @returns Promise<SetupStatus> - Current setup status
 */
export async function ensureMatchingSetup(): Promise<SetupStatus> {
  try {
    console.log('[MATCHING_SETUP] ========== CHECKING MATCHING SYSTEM SETUP ==========');
    
    // Get current status
    const status = await getSetupStatus();
    
    if (status.isComplete) {
      console.log('[MATCHING_SETUP] ✅ System fully configured - all indexes ready');
      return status;
    }
    
    if (status.isReady) {
      console.log('[MATCHING_SETUP] ✅ System operational - critical indexes ready');
      console.log(`[MATCHING_SETUP] ℹ️  ${status.buildingIndexes} non-critical indexes still building`);
      return status;
    }
    
    console.log('[MATCHING_SETUP] 🔧 Setup needed - configuring database...');
    
    // Enable extensions if needed
    if (!status.extensionEnabled) {
      await enableExtensions();
    }
    
    // Create indexes if needed
    if (status.readyIndexes < status.totalIndexes) {
      await createIndexes();
    }
    
    // Get updated status
    const updatedStatus = await getSetupStatus();
    
    console.log('[MATCHING_SETUP] ========== SETUP COMMANDS ISSUED ==========');
    console.log(`[MATCHING_SETUP] Status: ${updatedStatus.message}`);
    console.log(`[MATCHING_SETUP] Progress: ${updatedStatus.readyIndexes}/${updatedStatus.totalIndexes} indexes ready`);
    
    if (updatedStatus.buildingIndexes > 0) {
      console.log(`[MATCHING_SETUP] ⏳ ${updatedStatus.buildingIndexes} indexes building (~${updatedStatus.estimatedWaitMins} min)`);
      console.log('[MATCHING_SETUP] 💡 TIP: You can start matching now - it will use adaptive batch sizes');
    }
    
    return updatedStatus;
    
  } catch (error) {
    console.error('[MATCHING_SETUP] ========== SETUP FAILED ==========');
    console.error('[MATCHING_SETUP] Error:', error);
    console.error('[MATCHING_SETUP] System will continue but performance may be degraded');
    
    // Return error status but don't throw
    return {
      isComplete: false,
      isReady: false,
      extensionEnabled: false,
      totalIndexes: INDEXES.length,
      readyIndexes: 0,
      buildingIndexes: 0,
      failedIndexes: 0,
      indexes: [],
      message: '❌ Setup failed - Check logs',
      estimatedWaitMins: 0,
    };
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
