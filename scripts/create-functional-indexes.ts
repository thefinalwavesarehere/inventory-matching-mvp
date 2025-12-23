/**
 * Create Functional Indexes for Postgres Native Matcher V2.0
 * 
 * These indexes pre-compute the normalized part numbers, making the
 * REGEXP_REPLACE queries instant (< 10ms instead of seconds).
 * 
 * WARNING: This may take several minutes on large databases (10,000+ items).
 * Run during off-peak hours.
 * 
 * Usage:
 *   npx tsx scripts/create-functional-indexes.ts
 */

import { applyFunctionalIndexes, generateFunctionalIndexSQL } from '../app/lib/matching/postgres-exact-matcher';
import { prisma } from '../app/lib/db/prisma';

async function main() {
  console.log('🔧 Creating Functional Indexes for Postgres Native Matcher V2.0\n');
  console.log('=' .repeat(70));
  console.log('\n⚠️  WARNING: This may take several minutes on large databases.');
  console.log('⚠️  Run during off-peak hours to avoid impacting production.\n');
  console.log('=' .repeat(70));
  console.log('\n📋 Indexes to be created:\n');
  
  const sqls = generateFunctionalIndexSQL();
  sqls.forEach((sql, i) => {
    const indexName = sql.match(/idx_\w+/)?.[0] || 'unknown';
    console.log(`${i + 1}. ${indexName}`);
  });
  
  console.log('\n' + '='.repeat(70));
  console.log('\n🚀 Starting index creation...\n');
  
  const startTime = Date.now();
  
  try {
    await applyFunctionalIndexes();
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    
    console.log('\n' + '='.repeat(70));
    console.log(`\n✅ SUCCESS! All functional indexes created in ${duration}s\n`);
    console.log('=' .repeat(70));
    console.log('\n📊 Expected Performance Improvement:\n');
    console.log('Before: REGEXP_REPLACE queries take 500ms - 5s');
    console.log('After:  REGEXP_REPLACE queries take < 10ms (50-500x faster)\n');
    console.log('=' .repeat(70));
    console.log('\n🎯 Next Steps:\n');
    console.log('1. Run a test matching job to verify performance');
    console.log('2. Monitor query execution time in logs');
    console.log('3. Check match rate improvement (target: 44%+)\n');
    console.log('=' .repeat(70));
    
  } catch (error) {
    console.error('\n❌ ERROR creating functional indexes:', error);
    console.error('\nTroubleshooting:');
    console.error('1. Check database connection');
    console.error('2. Ensure you have CREATE INDEX permission');
    console.error('3. Check for conflicting index names');
    console.error('4. Verify Postgres version (requires 9.4+)');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
