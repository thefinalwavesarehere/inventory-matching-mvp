/**
 * Diagnostic Test Suite for Matching Logic
 * 
 * Tests fuzzy matching and web search with detailed logging
 * to identify why matches are failing
 */

import { calculateMatchScore } from '../app/lib/match-scorer';

// Test cases: Known items that should match but are failing
const testCases = [
  {
    name: 'Formatting Variation (Dashes)',
    storePartNumber: 'K06-0485',
    supplierPartNumber: 'K060485',
    expectedMatch: true,
    category: 'Filters',
  },
  {
    name: 'Blister Pack Suffix',
    storePartNumber: '57010',
    supplierPartNumber: '57010-BP',
    expectedMatch: true,
    category: 'Bulbs',
  },
  {
    name: 'Brand Variation (AC Delco)',
    storePartNumber: 'AC-DELCO-123',
    supplierPartNumber: 'ACDELCO123',
    expectedMatch: true,
    category: 'Electrical',
  },
  {
    name: 'Prefix Match (Part Family)',
    storePartNumber: 'K060485',
    supplierPartNumber: 'K060485A',
    expectedMatch: true,
    category: 'Filters',
  },
  {
    name: 'Dots vs No Dots',
    storePartNumber: 'AC.DELCO.456',
    supplierPartNumber: 'ACDELCO456',
    expectedMatch: true,
    category: 'Electrical',
  },
  {
    name: 'Spaces in Part Number',
    storePartNumber: 'GM 12345',
    supplierPartNumber: 'GM12345',
    expectedMatch: true,
    category: 'OEM',
  },
  {
    name: 'Slash Separator',
    storePartNumber: '789/BP',
    supplierPartNumber: '789BP',
    expectedMatch: true,
    category: 'Bulbs',
  },
  {
    name: 'Mixed Separators',
    storePartNumber: 'K-06.0485',
    supplierPartNumber: 'K060485',
    expectedMatch: true,
    category: 'Filters',
  },
  {
    name: 'Core Number Match',
    storePartNumber: 'ACDelco-57010',
    supplierPartNumber: 'GM-57010',
    expectedMatch: true,
    category: 'Bulbs',
  },
  {
    name: 'Extended Part Number',
    storePartNumber: '12345',
    supplierPartNumber: '12345-EXTENDED',
    expectedMatch: true,
    category: 'Generic',
  },
];

async function runDiagnosticTests() {
  console.log('='.repeat(80));
  console.log('MATCHING LOGIC DIAGNOSTIC TEST SUITE');
  console.log('='.repeat(80));
  console.log();

  let passCount = 0;
  let failCount = 0;

  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    console.log(`\n[${ i + 1}/${testCases.length}] ${test.name}`);
    console.log('-'.repeat(80));
    console.log(`Store Part:    ${test.storePartNumber}`);
    console.log(`Supplier Part: ${test.supplierPartNumber}`);
    console.log(`Expected:      ${test.expectedMatch ? 'MATCH' : 'NO MATCH'}`);
    console.log();

    try {
      const result = await calculateMatchScore({
        storePartNumber: test.storePartNumber,
        supplierPartNumber: test.supplierPartNumber,
        storeCategory: test.category,
        supplierCategory: test.category,
        projectId: 'test-project',
      });

      console.log(`Score:         ${(result.score * 100).toFixed(1)}%`);
      console.log(`Breakdown:`);
      console.log(`  - Part Number Similarity: ${(result.breakdown.partNumberSimilarity * 100).toFixed(1)}%`);
      console.log(`  - Description Similarity: ${(result.breakdown.descriptionSimilarity * 100).toFixed(1)}%`);
      console.log(`  - Category Match:         ${(result.breakdown.categoryMatch * 100).toFixed(1)}%`);
      console.log(`  - Subcategory Match:      ${(result.breakdown.subcategoryMatch * 100).toFixed(1)}%`);
      
      if (result.reason) {
        console.log(`Reason:        ${result.reason}`);
      }

      // Determine if test passed
      const threshold = 0.65; // Review band minimum
      const actualMatch = result.score >= threshold;
      const passed = actualMatch === test.expectedMatch;

      if (passed) {
        console.log(`✅ PASS - Score ${result.score >= threshold ? 'above' : 'below'} threshold (${threshold})`);
        passCount++;
      } else {
        console.log(`❌ FAIL - Expected ${test.expectedMatch ? 'match' : 'no match'} but got score ${(result.score * 100).toFixed(1)}%`);
        failCount++;
      }

    } catch (error: any) {
      console.log(`❌ ERROR - ${error.message}`);
      failCount++;
    }
  }

  console.log();
  console.log('='.repeat(80));
  console.log('TEST RESULTS');
  console.log('='.repeat(80));
  console.log(`Total Tests:  ${testCases.length}`);
  console.log(`Passed:       ${passCount} (${((passCount / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`Failed:       ${failCount} (${((failCount / testCases.length) * 100).toFixed(1)}%)`);
  console.log();

  if (passCount === testCases.length) {
    console.log('✅ ALL TESTS PASSED - Fuzzy matching is working correctly!');
  } else {
    console.log('❌ SOME TESTS FAILED - Review the failures above for issues.');
  }
  console.log();
}

// Run tests
runDiagnosticTests().catch(console.error);
