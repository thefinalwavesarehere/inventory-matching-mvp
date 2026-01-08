import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';

/**
 * GET /api/admin/verify-indexes
 * 
 * Verify all required indexes exist and are valid
 */
export async function GET() {
  try {
    // Check all required indexes
    const indexes = await prisma.$queryRaw<Array<{
      indexname: string;
      tablename: string;
      size: string;
    }>>`
      SELECT 
        indexname,
        tablename,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as size
      FROM pg_indexes
      WHERE indexname IN (
        'idx_store_part_trgm',
        'idx_supplier_part_trgm',
        'idx_store_description_trgm',
        'idx_supplier_description_trgm',
        'idx_norm_part_store',
        'idx_norm_part_supplier'
      )
      ORDER BY indexname;
    `;
    
    const requiredIndexes = [
      'idx_store_part_trgm',
      'idx_supplier_part_trgm',
      'idx_store_description_trgm',
      'idx_supplier_description_trgm',
      'idx_norm_part_store',
      'idx_norm_part_supplier',
    ];
    
    const foundIndexNames = new Set(indexes.map(i => i.indexname));
    const missingIndexes = requiredIndexes.filter(name => !foundIndexNames.has(name));
    
    const allPresent = missingIndexes.length === 0;
    
    return NextResponse.json({
      success: true,
      allPresent,
      totalRequired: requiredIndexes.length,
      totalFound: indexes.length,
      indexes,
      missingIndexes,
      message: allPresent 
        ? '✅ All required indexes present'
        : `⚠️  Missing ${missingIndexes.length} index(es)`,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/verify-indexes
 * 
 * Attempt to create any missing indexes
 */
export async function POST() {
  try {
    const createCommands = [
      `CREATE INDEX IF NOT EXISTS idx_store_part_trgm 
       ON "store_items" USING gin (UPPER("partNumber") gin_trgm_ops);`,
      
      `CREATE INDEX IF NOT EXISTS idx_supplier_part_trgm 
       ON "supplier_items" USING gin (UPPER("partNumber") gin_trgm_ops);`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_store_description_trgm 
       ON "store_items" USING gin (LOWER(description) gin_trgm_ops);`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_supplier_description_trgm 
       ON "supplier_items" USING gin (LOWER(description) gin_trgm_ops);`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_norm_part_store 
       ON "store_items" (
         LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
       );`,
      
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_norm_part_supplier 
       ON "supplier_items" (
         LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
       );`,
    ];
    
    const results = [];
    
    for (const sql of createCommands) {
      try {
        await prisma.$executeRawUnsafe(sql);
        results.push({ sql: sql.substring(0, 50) + '...', status: 'created' });
      } catch (error: any) {
        if (error.message?.includes('already exists')) {
          results.push({ sql: sql.substring(0, 50) + '...', status: 'already_exists' });
        } else {
          results.push({ sql: sql.substring(0, 50) + '...', status: 'failed', error: error.message });
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      results,
      message: 'Index creation attempted - check results',
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
