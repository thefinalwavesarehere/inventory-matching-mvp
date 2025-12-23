/**
 * Check if Functional Indexes exist in the database
 * 
 * This script verifies that the performance-critical indexes
 * for normalized part numbers and line codes are present.
 */

import { prisma } from '../app/lib/db/prisma';

async function checkFunctionalIndexes() {
  console.log('Checking for functional indexes...\n');
  
  try {
    // Query to check for indexes on StoreItem table
    const storeIndexes = await prisma.$queryRaw<any[]>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'StoreItem'
        AND indexname LIKE 'idx_norm%'
      ORDER BY indexname;
    `;
    
    // Query to check for indexes on SupplierItem table
    const supplierIndexes = await prisma.$queryRaw<any[]>`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'SupplierItem'
        AND indexname LIKE 'idx_norm%'
      ORDER BY indexname;
    `;
    
    console.log('=== StoreItem Indexes ===');
    if (storeIndexes.length === 0) {
      console.log('❌ NO functional indexes found on StoreItem table!');
    } else {
      storeIndexes.forEach(idx => {
        console.log(`✅ ${idx.indexname}`);
        console.log(`   ${idx.indexdef}\n`);
      });
    }
    
    console.log('\n=== SupplierItem Indexes ===');
    if (supplierIndexes.length === 0) {
      console.log('❌ NO functional indexes found on SupplierItem table!');
    } else {
      supplierIndexes.forEach(idx => {
        console.log(`✅ ${idx.indexname}`);
        console.log(`   ${idx.indexdef}\n`);
      });
    }
    
    // Summary
    const totalIndexes = storeIndexes.length + supplierIndexes.length;
    console.log('\n=== Summary ===');
    console.log(`Total functional indexes found: ${totalIndexes}`);
    console.log(`Expected: 6 (3 for StoreItem + 3 for SupplierItem)`);
    
    if (totalIndexes === 0) {
      console.log('\n⚠️  WARNING: No functional indexes found!');
      console.log('   Run: npx tsx scripts/create-functional-indexes.ts');
      console.log('   This will significantly improve query performance.');
      process.exit(1);
    } else if (totalIndexes < 6) {
      console.log('\n⚠️  WARNING: Some indexes are missing!');
      console.log('   Run: npx tsx scripts/create-functional-indexes.ts');
      process.exit(1);
    } else {
      console.log('\n✅ All functional indexes are present!');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('Error checking indexes:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkFunctionalIndexes();
