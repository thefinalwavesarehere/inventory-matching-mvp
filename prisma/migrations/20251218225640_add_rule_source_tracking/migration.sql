-- Add source tracking columns to matching_rules table
ALTER TABLE "matching_rules" ADD COLUMN "source" TEXT;
ALTER TABLE "matching_rules" ADD COLUMN "sourceFileId" TEXT;
ALTER TABLE "matching_rules" ADD COLUMN "sourceFileName" TEXT;

-- Create index on source for filtering
CREATE INDEX "matching_rules_source_idx" ON "matching_rules"("source");

-- Set existing rules to 'manual' source
UPDATE "matching_rules" SET "source" = 'manual' WHERE "source" IS NULL;
