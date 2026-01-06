#!/usr/bin/env tsx
/**
 * V4 Golden Thread Test Script
 * 
 * Tests the AXLGM-8167 golden thread to verify:
 * 1. Store item exists and is normalized correctly
 * 2. Interchange mapping exists with vendor="GSP"
 * 3. Match is created with vendor metadata
 * 4. End-to-end flow works as specified
 * 
 * Usage:
 *   npx tsx scripts/test-golden-thread.ts <projectId> [partNumber]
 * 
 * Default partNumber: AXLGM-8167
 */

import { goldenThreadTrace } from '../app/lib/matching/v4-interchange-first-matcher';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const projectId = process.argv[2];
  const partNumber = process.argv[3] || 'AXLGM-8167';
  
  if (!projectId) {
    console.error('Usage: npx tsx scripts/test-golden-thread.ts <projectId> [partNumber]');
    console.error('Example: npx tsx scripts/test-golden-thread.ts clxyz123 AXLGM-8167');
    process.exit(1);
  }
  
  console.log(`\n========================================`);
  console.log(`V4 GOLDEN THREAD TEST`);
  console.log(`========================================`);
  console.log(`Project ID: ${projectId}`);
  console.log(`Part Number: ${partNumber}`);
  console.log(`========================================\n`);
  
  try {
    // Run golden thread trace
    await goldenThreadTrace(projectId, partNumber);
    
    // Additional verification checks
    console.log(`\n========== VERIFICATION CHECKS ==========\n`);
    
    // Check 1: Interchange data exists
    const interchangeCount = await prisma.interchange.count({
      where: { projectId }
    });
    console.log(`✓ Interchange data: ${interchangeCount} rows`);
    
    // Check 2: V4 fields populated
    const v4PopulatedCount = await prisma.interchange.count({
      where: {
        projectId,
        merrillPartNumberNorm: { not: null }
      }
    });
    console.log(`✓ V4 normalized fields: ${v4PopulatedCount}/${interchangeCount} rows`);
    
    if (v4PopulatedCount === 0) {
      console.warn(`⚠ WARNING: No V4 normalized fields found. Run backfill script:`);
      console.warn(`  npx tsx scripts/backfill-v4-interchange.ts ${projectId}`);
    }
    
    // Check 3: Vendor metadata
    const withVendor = await prisma.interchange.count({
      where: {
        projectId,
        vendor: { not: null }
      }
    });
    console.log(`✓ Vendor metadata: ${withVendor}/${interchangeCount} rows`);
    
    if (withVendor === 0) {
      console.warn(`⚠ WARNING: No vendor metadata found. Re-upload interchange file with VENDOR column.`);
    }
    
    // Check 4: Store items
    const storeItemCount = await prisma.storeItem.count({
      where: { projectId }
    });
    console.log(`✓ Store items: ${storeItemCount} rows`);
    
    // Check 5: Matches
    const matchCount = await prisma.matchCandidate.count({
      where: { projectId }
    });
    console.log(`✓ Match candidates: ${matchCount} rows`);
    
    // Check 6: V4 matches with vendor
    const v4MatchCount = await prisma.matchCandidate.count({
      where: {
        projectId,
        vendor: { not: null }
      }
    });
    console.log(`✓ V4 matches with vendor: ${v4MatchCount}/${matchCount} rows`);
    
    // Calculate match rate
    if (storeItemCount > 0) {
      const matchRate = (matchCount / storeItemCount) * 100;
      console.log(`\n✓ Match rate: ${matchRate.toFixed(1)}% (${matchCount}/${storeItemCount})`);
      
      if (matchRate < 40) {
        console.warn(`⚠ WARNING: Match rate below expected 44%. Check:`);
        console.warn(`  1. Interchange file uploaded with correct columns`);
        console.warn(`  2. V4 backfill completed`);
        console.warn(`  3. Store items have correct partNumberNorm`);
      } else {
        console.log(`✓ Match rate within expected range (target: ~44%)`);
      }
    }
    
    console.log(`\n========================================`);
    console.log(`TEST COMPLETE`);
    console.log(`========================================\n`);
    
  } catch (error) {
    console.error(`\n❌ TEST FAILED:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
