/**
 * Test script for Waterfall Exact Matcher
 * Verifies that the 3-tier matching strategy handles dirty data correctly
 */

import { findExactMatch, getMatchingStats, findExactMatches } from '../app/lib/matching/waterfall-exact-matcher';

// Test data with various formatting issues
const testStoreItems = [
  // Tier 1: Strict match (should match exactly)
  { id: 's1', partNumber: '123-456', lineCode: 'GATES' },
  
  // Tier 2: Normalized match (punctuation differences)
  { id: 's2', partNumber: '123-456', lineCode: 'GATES' }, // matches 123456
  { id: 's3', partNumber: '21/3/1', lineCode: 'WAGNER' }, // matches 2131
  { id: 's4', partNumber: 'GM-8036', lineCode: 'ACDELCO' }, // matches GM8036
  
  // Tier 3: Brand alias match (line code variations)
  { id: 's5', partNumber: '789-012', lineCode: 'GAT' }, // GAT → GATES
  { id: 's6', partNumber: 'AC-123', lineCode: 'ACD' }, // ACD → ACDELCO
  { id: 's7', partNumber: 'CH-456', lineCode: 'CHAMP' }, // CHAMP → CHAMPION
  
  // No match (different part numbers)
  { id: 's8', partNumber: 'NOMATCH-999', lineCode: 'UNKNOWN' },
];

const testSupplierItems = [
  // Matches for Tier 1
  { id: 'sup1', partNumber: '123-456', lineCode: 'GATES' },
  
  // Matches for Tier 2 (different punctuation)
  { id: 'sup2', partNumber: '123456', lineCode: 'GATES' }, // no dashes
  { id: 'sup3', partNumber: '2131', lineCode: 'WAGNER' }, // no slashes
  { id: 'sup4', partNumber: 'GM8036', lineCode: 'ACDELCO' }, // no dash
  
  // Matches for Tier 3 (canonical brand names)
  { id: 'sup5', partNumber: '789012', lineCode: 'GATES' }, // GAT → GATES
  { id: 'sup6', partNumber: 'AC123', lineCode: 'ACDELCO' }, // ACD → ACDELCO
  { id: 'sup7', partNumber: 'CH456', lineCode: 'CHAMPION' }, // CHAMP → CHAMPION
];

console.log('🧪 Testing Waterfall Exact Matcher\n');
console.log('=' .repeat(60));

// Test individual matches
console.log('\n📋 Individual Match Tests:\n');

testStoreItems.forEach((storeItem, index) => {
  const match = findExactMatch(storeItem, testSupplierItems);
  
  if (match) {
    console.log(`✅ Test ${index + 1}: MATCH FOUND`);
    console.log(`   Store: ${storeItem.partNumber} (${storeItem.lineCode})`);
    console.log(`   Supplier: ${match.supplierItem.partNumber} (${match.supplierItem.lineCode})`);
    console.log(`   Tier: ${match.tier.toUpperCase()}`);
    console.log(`   Confidence: ${(match.confidence * 100).toFixed(0)}%`);
    console.log(`   Reason: ${match.reason}`);
  } else {
    console.log(`❌ Test ${index + 1}: NO MATCH`);
    console.log(`   Store: ${storeItem.partNumber} (${storeItem.lineCode})`);
  }
  console.log('');
});

// Test batch matching
console.log('=' .repeat(60));
console.log('\n📊 Batch Matching Statistics:\n');

const allMatches = findExactMatches(testStoreItems, testSupplierItems);
const stats = getMatchingStats(allMatches);

console.log(`Total Store Items: ${testStoreItems.length}`);
console.log(`Total Matches Found: ${stats.total}`);
console.log(`Match Rate: ${((stats.total / testStoreItems.length) * 100).toFixed(1)}%`);
console.log('');
console.log('Breakdown by Tier:');
console.log(`  - Tier 1 (Strict): ${stats.strict} matches`);
console.log(`  - Tier 2 (Normalized): ${stats.normalized} matches`);
console.log(`  - Tier 3 (Brand Alias): ${stats.brand_alias} matches`);

// Expected results
console.log('\n' + '='.repeat(60));
console.log('\n✅ Expected Results:\n');
console.log('Total Matches: 7 out of 8 (87.5%)');
console.log('  - Tier 1: 1 match (s1 → sup1)');
console.log('  - Tier 2: 3 matches (s2 → sup2, s3 → sup3, s4 → sup4)');
console.log('  - Tier 3: 3 matches (s5 → sup5, s6 → sup6, s7 → sup7)');
console.log('  - No match: s8 (NOMATCH-999)');

// Verify results
console.log('\n' + '='.repeat(60));
console.log('\n🎯 Verification:\n');

const success = stats.total === 7 && 
                stats.strict === 1 && 
                stats.normalized === 3 && 
                stats.brand_alias === 3;

if (success) {
  console.log('✅ ALL TESTS PASSED!');
  console.log('The waterfall matcher is working correctly.');
  console.log('Expected match rate improvement: 44% → 60%+');
} else {
  console.log('❌ TESTS FAILED!');
  console.log('Actual results do not match expected results.');
  console.log(`Expected: 7 total (1 strict, 3 normalized, 3 brand_alias)`);
  console.log(`Got: ${stats.total} total (${stats.strict} strict, ${stats.normalized} normalized, ${stats.brand_alias} brand_alias)`);
}

console.log('\n' + '='.repeat(60));
