/**
 * Convert Interchange Rules to Master Rules
 * 
 * CLI script to convert interchange rules to master rules
 * Usage: npx tsx scripts/convert-interchange-to-master-rules.ts [projectId]
 */

import { PrismaClient } from '@prisma/client';
import { convertAllInterchangesToMasterRules } from '../app/lib/services/interchange-to-master-rules.js';

const prisma = new PrismaClient();

async function main() {
  const projectId = process.argv[2];

  console.log('=== INTERCHANGE TO MASTER RULES CONVERSION ===\n');

  if (projectId) {
    console.log(`Converting interchange rules for project: ${projectId}\n`);
  } else {
    console.log('Converting ALL interchange rules (global conversion)\n');
  }

  try {
    const result = await convertAllInterchangesToMasterRules(
      projectId || undefined,
      'system-cli'
    );

    console.log('\n=== CONVERSION RESULTS ===');
    console.log(`✅ Created: ${result.created}`);
    console.log(`⏭️  Skipped: ${result.skipped}`);
    console.log(`❌ Errors: ${result.errors}`);

    if (result.details.length > 0) {
      console.log('\n=== SAMPLE CONVERSIONS (first 10) ===');
      for (const detail of result.details.slice(0, 10)) {
        console.log(`  ${detail}`);
      }
      if (result.details.length > 10) {
        console.log(`  ... and ${result.details.length - 10} more`);
      }
    }

    // Show final count
    console.log('\n=== MASTER RULES COUNT ===');
    const totalRules = await prisma.masterRule.count();
    const enabledRules = await prisma.masterRule.count({ where: { enabled: true } });
    console.log(`Total master rules: ${totalRules}`);
    console.log(`Enabled master rules: ${enabledRules}`);

  } catch (error) {
    console.error('\n❌ Conversion failed:', error);
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
