-- Add job queue management fields to matching_jobs table

-- Add userId column for per-user concurrency tracking
ALTER TABLE "matching_jobs" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- Add queue timing fields
ALTER TABLE "matching_jobs" ADD COLUMN IF NOT EXISTS "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Update startedAt to be nullable (was required before, but jobs start in queued state)
ALTER TABLE "matching_jobs" ALTER COLUMN "startedAt" DROP NOT NULL;

-- Add priority for future priority-based queueing
ALTER TABLE "matching_jobs" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;

-- Add cancellation fields
ALTER TABLE "matching_jobs" ADD COLUMN IF NOT EXISTS "cancellationRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "matching_jobs" ADD COLUMN IF NOT EXISTS "cancellationType" TEXT;
ALTER TABLE "matching_jobs" ADD COLUMN IF NOT EXISTS "cancelledBy" TEXT;
ALTER TABLE "matching_jobs" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);

-- Update status comment to include 'queued' state
COMMENT ON COLUMN "matching_jobs"."status" IS 'queued, processing, completed, failed, cancelled';

-- Add indexes for efficient queue management
CREATE INDEX IF NOT EXISTS "matching_jobs_userId_idx" ON "matching_jobs"("userId");
CREATE INDEX IF NOT EXISTS "matching_jobs_status_queuedAt_idx" ON "matching_jobs"("status", "queuedAt");

-- Migrate existing data
-- Set queuedAt to createdAt for existing jobs
UPDATE "matching_jobs" SET "queuedAt" = "createdAt" WHERE "queuedAt" IS NULL;

-- Set userId to createdBy for existing jobs (if createdBy is a userId)
UPDATE "matching_jobs" SET "userId" = "createdBy" WHERE "userId" IS NULL AND "createdBy" IS NOT NULL;
