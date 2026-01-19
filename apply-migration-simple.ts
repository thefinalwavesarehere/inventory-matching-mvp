import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

async function applyMigration() {
  console.log('Applying master rules migration...\n');
  
  try {
    // Step 1: Create MasterRuleType enum
    console.log('1. Creating MasterRuleType enum...');
    try {
      await prisma.$executeRawUnsafe(`CREATE TYPE "MasterRuleType" AS ENUM ('POSITIVE_MAP', 'NEGATIVE_BLOCK')`);
      console.log('✅ Created\n');
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        console.log('⚠️  Already exists\n');
      } else {
        throw e;
      }
    }
    
    // Step 2: Create MasterRuleScope enum
    console.log('2. Creating MasterRuleScope enum...');
    try {
      await prisma.$executeRawUnsafe(`CREATE TYPE "MasterRuleScope" AS ENUM ('GLOBAL', 'PROJECT_SPECIFIC')`);
      console.log('✅ Created\n');
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        console.log('⚠️  Already exists\n');
      } else {
        throw e;
      }
    }
    
    // Step 3: Create master_rules table
    console.log('3. Creating master_rules table...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "master_rules" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "ruleType" "MasterRuleType" NOT NULL,
        "scope" "MasterRuleScope" NOT NULL DEFAULT 'GLOBAL',
        "storePartNumber" TEXT NOT NULL,
        "supplierPartNumber" TEXT,
        "lineCode" TEXT,
        "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "createdBy" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "projectId" TEXT,
        "matchCandidateId" TEXT,
        "appliedCount" INTEGER NOT NULL DEFAULT 0,
        "lastAppliedAt" TIMESTAMP(3),
        CONSTRAINT "master_rules_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    console.log('✅ Created\n');
    
    // Step 4: Create indexes
    console.log('4. Creating indexes...');
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "master_rules_storePartNumber_idx" ON "master_rules"("storePartNumber")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "master_rules_supplierPartNumber_idx" ON "master_rules"("supplierPartNumber")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "master_rules_enabled_idx" ON "master_rules"("enabled")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "master_rules_ruleType_idx" ON "master_rules"("ruleType")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "master_rules_projectId_idx" ON "master_rules"("projectId")`);
    console.log('✅ Created all indexes\n');
    
    // Step 5: Add MASTER_RULE to MatchMethod enum
    console.log('5. Adding MASTER_RULE to MatchMethod enum...');
    try {
      await prisma.$executeRawUnsafe(`ALTER TYPE "MatchMethod" ADD VALUE IF NOT EXISTS 'MASTER_RULE'`);
      console.log('✅ Added\n');
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        console.log('⚠️  Already exists\n');
      } else {
        throw e;
      }
    }
    
    console.log('✅ Migration complete!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration().catch(console.error);
