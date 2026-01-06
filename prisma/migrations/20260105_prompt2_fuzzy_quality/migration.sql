-- Prompt 2: Fuzzy Quality Guardrails + Line Code Disambiguation + Rule Suggestions
-- Migration: 20260105_prompt2_fuzzy_quality

-- A) Add config toggles to projects
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "enableArnoldLineCodeSplit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "enableRuleBasedFuzzyBoosts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "enablePunctuationEquivalence" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "fuzzyHardRejectEnabled" BOOLEAN NOT NULL DEFAULT true;

-- B) Add derived manufacturer part fields to store_items
ALTER TABLE "store_items" ADD COLUMN IF NOT EXISTS "arnoldLineCodeRaw" TEXT;
ALTER TABLE "store_items" ADD COLUMN IF NOT EXISTS "manufacturerPartRaw" TEXT;
ALTER TABLE "store_items" ADD COLUMN IF NOT EXISTS "manufacturerPartNorm" TEXT;

-- Add index for manufacturer part norm
CREATE INDEX IF NOT EXISTS "store_items_manufacturerPartNorm_idx" ON "store_items"("manufacturerPartNorm");

-- A1) Create project_line_code_mappings table
CREATE TABLE IF NOT EXISTS "project_line_code_mappings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "sourceSystem" TEXT,
  "sourceLineCode" TEXT NOT NULL,
  "mappedManufacturer" TEXT,
  "mappedArnoldLineCode" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "status" TEXT NOT NULL DEFAULT 'MANUAL',
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  
  CONSTRAINT "project_line_code_mappings_projectId_fkey" 
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "project_line_code_mappings_projectId_idx" ON "project_line_code_mappings"("projectId");
CREATE INDEX IF NOT EXISTS "project_line_code_mappings_projectId_sourceLineCode_idx" ON "project_line_code_mappings"("projectId", "sourceLineCode");
CREATE INDEX IF NOT EXISTS "project_line_code_mappings_status_idx" ON "project_line_code_mappings"("status");

-- A2) Create project_match_rules table
CREATE TABLE IF NOT EXISTS "project_match_rules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "ruleType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
  "evidenceCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "approvedAt" TIMESTAMP(3),
  "approvedByUserId" TEXT,
  
  CONSTRAINT "project_match_rules_projectId_fkey" 
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "project_match_rules_projectId_idx" ON "project_match_rules"("projectId");
CREATE INDEX IF NOT EXISTS "project_match_rules_projectId_status_idx" ON "project_match_rules"("projectId", "status");
CREATE INDEX IF NOT EXISTS "project_match_rules_ruleType_idx" ON "project_match_rules"("ruleType");
