-- Manual Migration: Add Master Rules Learning System
-- Date: 2026-01-19

-- Step 1: Add MASTER_RULE to MatchMethod enum
ALTER TYPE "MatchMethod" ADD VALUE IF NOT EXISTS 'MASTER_RULE';

-- Step 2: Create MasterRuleType enum
DO $$ BEGIN
  CREATE TYPE "MasterRuleType" AS ENUM ('POSITIVE_MAP', 'NEGATIVE_BLOCK');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 3: Create MasterRuleScope enum
DO $$ BEGIN
  CREATE TYPE "MasterRuleScope" AS ENUM ('GLOBAL', 'PROJECT_SPECIFIC');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 4: Create master_rules table
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
);

-- Step 5: Create indexes for performance
CREATE INDEX IF NOT EXISTS "master_rules_storePartNumber_idx" ON "master_rules"("storePartNumber");
CREATE INDEX IF NOT EXISTS "master_rules_supplierPartNumber_idx" ON "master_rules"("supplierPartNumber");
CREATE INDEX IF NOT EXISTS "master_rules_enabled_idx" ON "master_rules"("enabled");
CREATE INDEX IF NOT EXISTS "master_rules_ruleType_idx" ON "master_rules"("ruleType");
CREATE INDEX IF NOT EXISTS "master_rules_projectId_idx" ON "master_rules"("projectId");

-- Step 6: Add comment to table
COMMENT ON TABLE "master_rules" IS 'Self-learning system that creates rules from manual review decisions';
