-- Functional Indexes for Postgres Native Matcher V2.0
-- 
-- These indexes pre-compute the normalized part numbers, making the
-- REGEXP_REPLACE queries instant (< 10ms instead of seconds).
--
-- WARNING: This may take several minutes on large databases (10,000+ items).
-- Run during off-peak hours.
--
-- Usage:
--   psql -d your_database -f scripts/functional-indexes.sql

-- Functional index for normalized store part numbers
-- Handles: UPPER + remove non-alphanumeric + strip leading zeros
CREATE INDEX IF NOT EXISTS idx_norm_part_store 
ON "store_items" (
  LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
);

-- Functional index for normalized supplier part numbers
CREATE INDEX IF NOT EXISTS idx_norm_part_supplier 
ON "supplier_items" (
  LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
);

-- Functional index for normalized store line codes
-- Partial index (only where lineCode IS NOT NULL) for efficiency
CREATE INDEX IF NOT EXISTS idx_norm_line_store 
ON "store_items" (
  LTRIM(UPPER(REGEXP_REPLACE("lineCode", '[^a-zA-Z0-9]', '', 'g')), '0')
) WHERE "lineCode" IS NOT NULL;

-- Functional index for normalized supplier line codes
CREATE INDEX IF NOT EXISTS idx_norm_line_supplier 
ON "supplier_items" (
  LTRIM(UPPER(REGEXP_REPLACE("lineCode", '[^a-zA-Z0-9]', '', 'g')), '0')
) WHERE "lineCode" IS NOT NULL;

-- Composite index for project + normalized part (most common query pattern)
-- This is the MOST IMPORTANT index for performance
CREATE INDEX IF NOT EXISTS idx_project_norm_part_store 
ON "store_items" (
  "projectId",
  LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
);

-- Composite index for project + normalized part (supplier side)
CREATE INDEX IF NOT EXISTS idx_project_norm_part_supplier 
ON "supplier_items" (
  "projectId",
  LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0')
);

-- Verify indexes were created
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE indexname LIKE 'idx_norm%' OR indexname LIKE 'idx_project_norm%'
ORDER BY tablename, indexname;

-- Check index sizes
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE indexrelname LIKE 'idx_norm%' OR indexrelname LIKE 'idx_project_norm%'
ORDER BY pg_relation_size(indexrelid) DESC;
