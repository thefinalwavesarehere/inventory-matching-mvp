/**
 * Check Master Rules in Database
 * 
 * Quick diagnostic script to see if master rules are being created
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== MASTER RULES DATABASE CHECK ===\n');
  
  // Count total rules
  const totalCount = await prisma.masterRule.count();
  console.log(`Total master rules: ${totalCount}`);
  
  // Count by type
  const positiveCount = await prisma.masterRule.count({
    where: { ruleType: 'POSITIVE_MAP' }
  });
  const negativeCount = await prisma.masterRule.count({
    where: { ruleType: 'NEGATIVE_BLOCK' }
  });
  console.log(`  - POSITIVE_MAP: ${positiveCount}`);
  console.log(`  - NEGATIVE_BLOCK: ${negativeCount}`);
  
  // Count by status
  const enabledCount = await prisma.masterRule.count({
    where: { enabled: true }
  });
  const disabledCount = await prisma.masterRule.count({
    where: { enabled: false }
  });
  console.log(`  - Enabled: ${enabledCount}`);
  console.log(`  - Disabled: ${disabledCount}`);
  
  // Show recent rules
  console.log('\n=== RECENT MASTER RULES (Last 10) ===\n');
  const recentRules = await prisma.masterRule.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      project: {
        select: {
          id: true,
          name: true,
        }
      }
    }
  });
  
  if (recentRules.length === 0) {
    console.log('No master rules found in database.');
  } else {
    for (const rule of recentRules) {
      console.log(`Rule ID: ${rule.id}`);
      console.log(`  Type: ${rule.ruleType}`);
      console.log(`  Scope: ${rule.scope}`);
      console.log(`  Store PN: ${rule.storePartNumber}`);
      console.log(`  Supplier PN: ${rule.supplierPartNumber || 'null'}`);
      console.log(`  Line Code: ${rule.lineCode || 'null'}`);
      console.log(`  Enabled: ${rule.enabled}`);
      console.log(`  Confidence: ${rule.confidence}`);
      console.log(`  Project: ${rule.project?.name || 'N/A'} (${rule.projectId || 'N/A'})`);
      console.log(`  Created: ${rule.createdAt.toISOString()}`);
      console.log(`  Created By: ${rule.createdBy || 'N/A'}`);
      console.log(`  Times Applied: ${rule.timesApplied}`);
      console.log(`  Match Candidate ID: ${rule.matchCandidateId || 'N/A'}`);
      console.log('');
    }
  }
  
  // Check for interchange rules that could be converted
  console.log('=== INTERCHANGE RULES (for conversion) ===\n');
  const interchangeCount = await prisma.interchangeRule.count();
  console.log(`Total interchange rules: ${interchangeCount}`);
  
  if (interchangeCount > 0) {
    const sampleInterchange = await prisma.interchangeRule.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' }
    });
    
    console.log('\nSample interchange rules:');
    for (const rule of sampleInterchange) {
      console.log(`  ${rule.originalPartNumber} → ${rule.interchangePartNumber} (${rule.manufacturer || 'N/A'})`);
    }
  }
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
