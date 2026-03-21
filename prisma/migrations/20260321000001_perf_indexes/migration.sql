-- Performance migration: add composite indexes for hot query patterns
-- All created CONCURRENTLY to avoid locking production tables.
-- Run via: prisma migrate deploy

-- MatchCandidate: analytics groupBy status (replaces single-column [status])
CREATE INDEX CONCURRENTLY IF NOT EXISTS "match_candidates_project_status_idx"
  ON "match_candidates" ("projectId", "status");

-- MatchCandidate: analytics groupBy method
CREATE INDEX CONCURRENTLY IF NOT EXISTS "match_candidates_project_method_idx"
  ON "match_candidates" ("projectId", "method");

-- MatchCandidate: dedup check in master-rules-matcher (replaces 3 separate lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "match_candidates_store_target_idx"
  ON "match_candidates" ("storeItemId", "targetType", "targetId");

-- MatchCandidate: per-item match lookup with status filter
CREATE INDEX CONCURRENTLY IF NOT EXISTS "match_candidates_project_store_status_idx"
  ON "match_candidates" ("projectId", "storeItemId", "status");

-- MasterRule: Stage-0 batch fetch (enabled + scope + ruleType)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "master_rules_enabled_scope_type_idx"
  ON "master_rules" ("enabled", "scope", "ruleType");

-- MasterRule: positive rule lookup by store part number
CREATE INDEX CONCURRENTLY IF NOT EXISTS "master_rules_enabled_scope_store_pn_idx"
  ON "master_rules" ("enabled", "scope", "storePartNumber");

-- StoreItem: interchange bridge join on partNumberNorm (project-scoped)
-- Already exists as [projectId, partNumberNorm] — no duplicate needed.

-- MatchingProgress: already has @unique([projectId]) — no additional index needed.
