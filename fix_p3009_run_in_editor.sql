-- =============================================================================
-- FIX: Prisma P3009 — resolve failed migration + create indexes
-- Run this ONCE in the Supabase SQL editor to unblock Vercel builds.
-- =============================================================================

-- Step 1: Mark the failed migration as resolved in Prisma's tracking table.
-- This tells Prisma the migration is no longer in a failed state.
UPDATE "_prisma_migrations"
SET
  "finished_at"    = NOW(),
  "applied_steps_count" = 1,
  "logs"           = NULL
WHERE "migration_name" = '20260321000001_perf_indexes'
  AND "finished_at" IS NULL;

-- Step 2: Create the indexes (without CONCURRENTLY — safe inside a transaction).
-- These are idempotent; safe to re-run.

CREATE INDEX IF NOT EXISTS "match_candidates_project_status_idx"
  ON "match_candidates" ("projectId", "status");

CREATE INDEX IF NOT EXISTS "match_candidates_project_method_idx"
  ON "match_candidates" ("projectId", "method");

CREATE INDEX IF NOT EXISTS "match_candidates_store_target_idx"
  ON "match_candidates" ("storeItemId", "targetType", "targetId");

CREATE INDEX IF NOT EXISTS "match_candidates_project_store_status_idx"
  ON "match_candidates" ("projectId", "storeItemId", "status");

CREATE INDEX IF NOT EXISTS "master_rules_enabled_scope_type_idx"
  ON "master_rules" ("enabled", "scope", "ruleType");

CREATE INDEX IF NOT EXISTS "master_rules_enabled_scope_store_pn_idx"
  ON "master_rules" ("enabled", "scope", "storePartNumber");

-- =============================================================================
-- After running this, trigger a new Vercel deployment.
-- The build will now apply migration 20260321000002_hnsw_vector_indexes cleanly.
-- =============================================================================
