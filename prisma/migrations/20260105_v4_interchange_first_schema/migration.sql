-- V4 Interchange-First Schema Migration
-- Add normalized columns and vendor metadata to interchanges table
-- Add vendor and matchedOn fields to match_candidates table

-- Step 1: Add new columns to interchanges table
ALTER TABLE "interchanges" ADD COLUMN IF NOT EXISTS "merrillPartNumber" TEXT;
ALTER TABLE "interchanges" ADD COLUMN IF NOT EXISTS "merrillPartNumberNorm" TEXT;
ALTER TABLE "interchanges" ADD COLUMN IF NOT EXISTS "vendorPartNumber" TEXT;
ALTER TABLE "interchanges" ADD COLUMN IF NOT EXISTS "vendorPartNumberNorm" TEXT;
ALTER TABLE "interchanges" ADD COLUMN IF NOT EXISTS "vendor" TEXT;
ALTER TABLE "interchanges" ADD COLUMN IF NOT EXISTS "lineCode" TEXT;
ALTER TABLE "interchanges" ADD COLUMN IF NOT EXISTS "subCategory" TEXT;
ALTER TABLE "interchanges" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Step 2: Create indexes for V4 matching
CREATE INDEX IF NOT EXISTS "interchanges_projectId_merrillPartNumberNorm_idx" ON "interchanges"("projectId", "merrillPartNumberNorm");
CREATE INDEX IF NOT EXISTS "interchanges_projectId_vendorPartNumberNorm_idx" ON "interchanges"("projectId", "vendorPartNumberNorm");

-- Step 3: Add V4 fields to match_candidates table
ALTER TABLE "match_candidates" ADD COLUMN IF NOT EXISTS "vendor" TEXT;
ALTER TABLE "match_candidates" ADD COLUMN IF NOT EXISTS "matchedOn" TEXT;
ALTER TABLE "match_candidates" ADD COLUMN IF NOT EXISTS "interchangeId" TEXT;

-- Step 4: Add comment for tracking
COMMENT ON COLUMN "interchanges"."merrillPartNumber" IS 'V4: Raw Merrill part number from interchange file';
COMMENT ON COLUMN "interchanges"."merrillPartNumberNorm" IS 'V4: Canonical normalized Merrill part (UPPERCASE, no punctuation)';
COMMENT ON COLUMN "interchanges"."vendorPartNumber" IS 'V4: Raw vendor part number from interchange file';
COMMENT ON COLUMN "interchanges"."vendorPartNumberNorm" IS 'V4: Canonical normalized vendor part (UPPERCASE, no punctuation)';
COMMENT ON COLUMN "interchanges"."vendor" IS 'V4: Vendor name from CSV VENDOR column (e.g., GSP)';
COMMENT ON COLUMN "match_candidates"."vendor" IS 'V4: Vendor from interchange mapping for UI display';
COMMENT ON COLUMN "match_candidates"."matchedOn" IS 'V4: Which side of interchange matched (MERRILL or VENDOR)';
COMMENT ON COLUMN "match_candidates"."interchangeId" IS 'V4: Reference to interchange row used for match';
