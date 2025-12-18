-- Step 1: Remove the failed migration record from Prisma's migration tracking table
-- This allows new migrations to proceed
DELETE FROM "_prisma_migrations" 
WHERE "migration_name" = '20251218023950_add_composite_index_for_match_review';

-- Step 2: Create the composite index (if it doesn't already exist)
-- Using IF NOT EXISTS to make this migration idempotent
CREATE INDEX IF NOT EXISTS "match_candidates_projectId_status_confidence_idx" 
ON "match_candidates"("projectId", "status", "confidence");
