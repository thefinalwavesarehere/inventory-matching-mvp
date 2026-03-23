-- =============================================================================
-- inventory-matching-mvp  |  Consolidated Migrations — Supabase SQL Editor
-- Run date: 2026-03-21
-- All statements are idempotent (IF NOT EXISTS / DO $$). Safe to re-run.
-- CONCURRENTLY removed — Supabase SQL editor runs inside a transaction block.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- [1/3]  20260321000000 — Add project owner (tenant isolation / IDOR fix)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "created_by_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_created_by_id_fkey'
  ) THEN
    ALTER TABLE "projects"
      ADD CONSTRAINT "projects_created_by_id_fkey"
      FOREIGN KEY ("created_by_id")
      REFERENCES "user_profiles"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "projects_created_by_id_idx"
  ON "projects" ("created_by_id");


-- ─────────────────────────────────────────────────────────────────────────────
-- [2/3]  20260321000001 — Composite performance indexes
-- ─────────────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────────────
-- [3/3]  20260321000002 — HNSW vector indexes (pgvector 0.5+)
-- Run after embedding generation has populated the embedding columns.
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_store_embedding;
DROP INDEX IF EXISTS idx_supplier_embedding;

CREATE INDEX IF NOT EXISTS idx_store_embedding_hnsw
  ON store_items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_supplier_embedding_hnsw
  ON supplier_items USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- Done.
-- =============================================================================
