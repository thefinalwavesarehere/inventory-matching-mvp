/**
 * Test script for Postgres Native Exact Matcher
 * Verifies that SQL-based REGEXP_REPLACE matching works correctly
 */

import { findPostgresExactMatches, findCanonicalExactMatches, findHybridExactMatches, getPostgresMatchStats } from '../app/lib/matching/postgres-exact-matcher';
import { prisma } from '../app/lib/db/prisma';

async function main() {
  console.log('🧪 Testing Postgres Native Exact Matcher\n');
  console.log('=' .repeat(60));
  
  // Get all projects
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          storeItems: true,
          supplierItems: true,
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  
  if (projects.length === 0) {
    console.log('\n❌ No projects found in database.');
    console.log('Please upload some data first.');
    return;
  }
  
  console.log(`\n📊 Found ${projects.length} projects:\n`);
  
  for (const project of projects) {
    console.log(`Project: ${project.name}`);
    console.log(`  ID: ${project.id}`);
    console.log(`  Store Items: ${project._count.storeItems}`);
    console.log(`  Supplier Items: ${project._count.supplierItems}`);
    console.log('');
  }
  
  // Test the first project with data
  const testProject = projects.find(p => p._count.storeItems > 0 && p._count.supplierItems > 0);
  
  if (!testProject) {
    console.log('❌ No projects with both store and supplier items found.');
    return;
  }
  
  console.log('=' .repeat(60));
  console.log(`\n🎯 Testing with project: ${testProject.name}\n`);
  
  // Test 1: Canonical matching (fast)
  console.log('📋 Test 1: Canonical Exact Matching (using pre-computed canonicalPartNumber)\n');
  const startCanonical = Date.now();
  const canonicalMatches = await findCanonicalExactMatches(testProject.id);
  const timeCanonical = Date.now() - startCanonical;
  
  console.log(`✅ Found ${canonicalMatches.length} matches in ${timeCanonical}ms`);
  console.log(`   Perfect matches: ${canonicalMatches.filter(m => m.confidence === 1.0).length}`);
  console.log(`   Normalized matches: ${canonicalMatches.filter(m => m.confidence < 1.0).length}`);
  
  if (canonicalMatches.length > 0) {
    console.log('\n   Sample matches:');
    canonicalMatches.slice(0, 3).forEach((match, i) => {
      console.log(`   ${i + 1}. ${match.storePartNumber} (${match.storeLineCode || 'N/A'}) → ${match.supplierPartNumber} (${match.supplierLineCode || 'N/A'})`);
      console.log(`      Confidence: ${(match.confidence * 100).toFixed(0)}%`);
    });
  }
  
  // Test 2: REGEXP_REPLACE matching (reliable)
  console.log('\n' + '='.repeat(60));
  console.log('\n📋 Test 2: Postgres REGEXP_REPLACE Matching (on-the-fly normalization)\n');
  const startRegex = Date.now();
  const regexMatches = await findPostgresExactMatches(testProject.id);
  const timeRegex = Date.now() - startRegex;
  
  console.log(`✅ Found ${regexMatches.length} matches in ${timeRegex}ms`);
  console.log(`   Perfect matches: ${regexMatches.filter(m => m.confidence === 1.0).length}`);
  console.log(`   Normalized matches: ${regexMatches.filter(m => m.confidence < 1.0).length}`);
  
  if (regexMatches.length > 0) {
    console.log('\n   Sample matches:');
    regexMatches.slice(0, 3).forEach((match, i) => {
      console.log(`   ${i + 1}. ${match.storePartNumber} (${match.storeLineCode || 'N/A'}) → ${match.supplierPartNumber} (${match.supplierLineCode || 'N/A'})`);
      console.log(`      Confidence: ${(match.confidence * 100).toFixed(0)}%`);
    });
  }
  
  // Test 3: Hybrid matching (smart)
  console.log('\n' + '='.repeat(60));
  console.log('\n📋 Test 3: Hybrid Matching (canonical first, fallback to regex)\n');
  const startHybrid = Date.now();
  const hybridMatches = await findHybridExactMatches(testProject.id);
  const timeHybrid = Date.now() - startHybrid;
  
  console.log(`✅ Found ${hybridMatches.length} matches in ${timeHybrid}ms`);
  console.log(`   Perfect matches: ${hybridMatches.filter(m => m.confidence === 1.0).length}`);
  console.log(`   Normalized matches: ${hybridMatches.filter(m => m.confidence < 1.0).length}`);
  
  // Get statistics
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Match Statistics:\n');
  
  const stats = await getPostgresMatchStats(testProject.id);
  
  console.log(`Total Store Items: ${stats.totalStoreItems}`);
  console.log(`Total Matches: ${stats.totalMatches}`);
  console.log(`Match Rate: ${stats.matchRate.toFixed(1)}%`);
  console.log(`Perfect Matches: ${stats.perfectMatches}`);
  console.log(`Normalized Matches: ${stats.normalizedMatches}`);
  
  // Performance comparison
  console.log('\n' + '='.repeat(60));
  console.log('\n⚡ Performance Comparison:\n');
  console.log(`Canonical:      ${timeCanonical}ms (${canonicalMatches.length} matches)`);
  console.log(`REGEXP_REPLACE: ${timeRegex}ms (${regexMatches.length} matches)`);
  console.log(`Hybrid:         ${timeHybrid}ms (${hybridMatches.length} matches)`);
  
  // Verdict
  console.log('\n' + '='.repeat(60));
  console.log('\n🎯 Verdict:\n');
  
  if (stats.matchRate >= 44) {
    console.log(`✅ SUCCESS! Match rate is ${stats.matchRate.toFixed(1)}% (target: 44%+)`);
    console.log('The Postgres native matcher is working correctly.');
  } else if (stats.matchRate >= 30) {
    console.log(`⚠️  PARTIAL SUCCESS. Match rate is ${stats.matchRate.toFixed(1)}% (target: 44%+)`);
    console.log('Better than before (20-26%), but not at target yet.');
    console.log('May need to check data quality or add more normalization rules.');
  } else {
    console.log(`❌ FAILURE. Match rate is ${stats.matchRate.toFixed(1)}% (target: 44%+)`);
    console.log('The matcher is not performing as expected.');
    console.log('Check SQL query logic and data quality.');
  }
  
  console.log('\n' + '='.repeat(60));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
