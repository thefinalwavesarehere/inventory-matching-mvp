/**
 * Test Master Rule Creation
 * 
 * Manually test creating a master rule to diagnose the issue
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  console.log('=== TESTING MASTER RULE CREATION ===\n');
  
  // Test 1: Direct Prisma insert
  console.log('Test 1: Direct Prisma insert...');
  try {
    const rule = await prisma.masterRule.create({
      data: {
        ruleType: 'POSITIVE_MAP',
        scope: 'GLOBAL',
        storePartNumber: 'TEST-STORE-001',
        supplierPartNumber: 'TEST-SUPPLIER-001',
        lineCode: 'TEST-LINE',
        confidence: 1.0,
        enabled: true,
        createdBy: 'test-user-id',
        projectId: null,
        matchCandidateId: null,
      }
    });
    
    console.log('✅ Success! Created rule:', rule.id);
    console.log('   Store PN:', rule.storePartNumber);
    console.log('   Supplier PN:', rule.supplierPartNumber);
    console.log('   Type:', rule.ruleType);
    console.log('   Enabled:', rule.enabled);
    
    // Clean up
    await prisma.masterRule.delete({
      where: { id: rule.id }
    });
    console.log('   Cleaned up test rule\n');
    
  } catch (error) {
    console.error('❌ Failed to create rule:', error);
    console.error('');
  }
  
  // Test 2: Import and test the learner function
  console.log('Test 2: Testing learnFromDecision function...');
  try {
    // Dynamic import to avoid module issues
    const { learnFromDecision } = await import('../app/lib/master-rules-learner.js');
    
    const decision = {
      matchCandidateId: 'test-match-id',
      storePartNumber: 'TEST-STORE-002',
      supplierPartNumber: 'TEST-SUPPLIER-002',
      lineCode: 'TEST-LINE-2',
      decision: 'approve' as const,
      projectId: 'test-project-id',
      userId: 'test-user-id',
    };
    
    const result = await learnFromDecision(decision);
    
    if (result) {
      console.log('✅ Success! Created rule:', result.ruleId);
      console.log('   Type:', result.ruleType);
      
      // Clean up
      await prisma.masterRule.delete({
        where: { id: result.ruleId }
      });
      console.log('   Cleaned up test rule\n');
    } else {
      console.log('⚠️  Function returned null (rule may already exist)\n');
    }
    
  } catch (error) {
    console.error('❌ Failed to test learner function:', error);
    console.error('');
  }
  
  // Test 3: Check if table exists and has correct schema
  console.log('Test 3: Checking master_rules table schema...');
  try {
    const result = await prisma.$queryRaw<any[]>`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'master_rules'
      ORDER BY ordinal_position;
    `;
    
    console.log('✅ Table exists with columns:');
    for (const col of result) {
      console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    }
  } catch (error) {
    console.error('❌ Failed to query table schema:', error);
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
