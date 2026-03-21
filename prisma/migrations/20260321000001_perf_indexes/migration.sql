-- Performance migration: composite indexes for hot query patterns
-- CONCURRENTLY removed — Prisma migrate deploy runs inside a transaction block.

-- MatchCandidate: analytics groupBy status
CREATE INDEX IF NOT EXISTS "match_candidates_project_status_idx"
  ON "match_candidates" ("projectId", "status");

-- MatchCandidate: analytics groupBy method
CREATE INDEX IF NOT EXISTS "match_candidates_project_method_idx"
  ON "match_candidates" ("projectId", "method");

-- MatchCandidate: dedup check in master-rules-matcher
CREATE INDEX IF NOT EXISTS "match_candidates_store_target_idx"
  ON "match_candidates" ("storeItemId", "targetType", "targetId");

-- MatchCandidate: per-item match lookup with status filter
CREATE INDEX IF NOT EXISTS "match_candidates_project_store_status_idx"
  ON "match_candidates" ("projectId", "storeItemId", "status");

-- MasterRule: stage-0 batch fetch
CREATE INDEX IF NOT EXISTS "master_rules_enabled_scope_type_idx"
  ON "master_rules" ("enabled", "scope", "ruleType");

-- MasterRule: positive rule lookup by store part number
CREATE INDEX IF NOT EXISTS "master_rules_enabled_scope_store_pn_idx"
  ON "master_rules" ("enabled", "scope", "storePartNumber");
