-- Diagnostic Queries for Low Match Rate Investigation
-- Run these queries to identify data population issues

-- ============================================
-- 1. CHECK STORE ITEM FIELD POPULATION
-- ============================================
SELECT 
  COUNT(*) as total_store_items,
  COUNT("partNumber") as has_partNumber,
  COUNT("partNumberNorm") as has_partNumberNorm,
  COUNT("canonicalPartNumber") as has_canonicalPartNumber,
  COUNT("lineCode") as has_lineCode,
  COUNT("mfrPartNumber") as has_mfrPartNumber,
  ROUND(100.0 * COUNT("partNumber") / NULLIF(COUNT(*), 0), 2) as pct_partNumber,
  ROUND(100.0 * COUNT("partNumberNorm") / NULLIF(COUNT(*), 0), 2) as pct_partNumberNorm,
  ROUND(100.0 * COUNT("canonicalPartNumber") / NULLIF(COUNT(*), 0), 2) as pct_canonicalPartNumber,
  ROUND(100.0 * COUNT("lineCode") / NULLIF(COUNT(*), 0), 2) as pct_lineCode,
  ROUND(100.0 * COUNT("mfrPartNumber") / NULLIF(COUNT(*), 0), 2) as pct_mfrPartNumber
FROM "store_items";

-- ============================================
-- 2. SAMPLE STORE ITEMS DATA
-- ============================================
SELECT 
  id, 
  "partNumber",
  "partNumberNorm",
  "canonicalPartNumber",
  "lineCode",
  "mfrPartNumber",
  description
FROM "store_items" 
LIMIT 20;

-- ============================================
-- 3. CHECK SUPPLIER ITEM FIELD POPULATION
-- ============================================
SELECT 
  COUNT(*) as total_supplier_items,
  COUNT("partNumber") as has_partNumber,
  COUNT("partNumberNorm") as has_partNumberNorm,
  COUNT("canonicalPartNumber") as has_canonicalPartNumber,
  COUNT("lineCode") as has_lineCode,
  COUNT("mfrPartNumber") as has_mfrPartNumber,
  ROUND(100.0 * COUNT("partNumber") / NULLIF(COUNT(*), 0), 2) as pct_partNumber,
  ROUND(100.0 * COUNT("partNumberNorm") / NULLIF(COUNT(*), 0), 2) as pct_partNumberNorm,
  ROUND(100.0 * COUNT("canonicalPartNumber") / NULLIF(COUNT(*), 0), 2) as pct_canonicalPartNumber,
  ROUND(100.0 * COUNT("lineCode") / NULLIF(COUNT(*), 0), 2) as pct_lineCode,
  ROUND(100.0 * COUNT("mfrPartNumber") / NULLIF(COUNT(*), 0), 2) as pct_mfrPartNumber
FROM "supplier_items";

-- ============================================
-- 4. SAMPLE SUPPLIER ITEMS DATA
-- ============================================
SELECT 
  id,
  "partNumber",
  "partNumberNorm",
  "canonicalPartNumber",
  "lineCode",
  "mfrPartNumber",
  description
FROM "supplier_items" 
LIMIT 20;

-- ============================================
-- 5. CHECK INTERCHANGE TABLE
-- ============================================
SELECT 
  COUNT(*) as total_interchange_records,
  COUNT("oursPartNumber") as has_oursPartNumber,
  COUNT("theirsPartNumber") as has_theirsPartNumber,
  COUNT("merrillPartNumber") as has_merrillPartNumber,
  COUNT("vendorPartNumber") as has_vendorPartNumber,
  COUNT("merrillPartNumberNorm") as has_merrillPartNumberNorm,
  COUNT("vendorPartNumberNorm") as has_vendorPartNumberNorm,
  COUNT(DISTINCT "projectId") as distinct_projects
FROM "interchanges";

-- ============================================
-- 6. SAMPLE INTERCHANGE DATA
-- ============================================
SELECT 
  id,
  "projectId",
  "oursPartNumber",
  "theirsPartNumber",
  "merrillPartNumber",
  "vendorPartNumber",
  vendor,
  confidence
FROM "interchanges" 
LIMIT 20;

-- ============================================
-- 7. CHECK MATCH CANDIDATES
-- ============================================
SELECT 
  COUNT(*) as total_matches,
  method,
  COUNT(*) as count_by_method,
  AVG(confidence) as avg_confidence
FROM "match_candidates"
GROUP BY method
ORDER BY count_by_method DESC;

-- ============================================
-- 8. TEST NORMALIZATION LOGIC
-- ============================================
-- Test if the normalization SQL works correctly
SELECT 
  "partNumber",
  LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0') as normalized,
  "partNumberNorm",
  "canonicalPartNumber"
FROM "store_items"
WHERE "partNumber" IS NOT NULL
LIMIT 10;

-- ============================================
-- 9. CHECK FOR POTENTIAL MATCHES MANUALLY
-- ============================================
-- Test if there SHOULD be matches by checking normalized values
WITH store_normalized AS (
  SELECT 
    id,
    "partNumber",
    LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0') as norm_part
  FROM "store_items"
  LIMIT 100
),
supplier_normalized AS (
  SELECT 
    id,
    "partNumber",
    LTRIM(UPPER(REGEXP_REPLACE("partNumber", '[^a-zA-Z0-9]', '', 'g')), '0') as norm_part
  FROM "supplier_items"
  LIMIT 1000
)
SELECT 
  s."partNumber" as store_part,
  sup."partNumber" as supplier_part,
  s.norm_part as normalized
FROM store_normalized s
INNER JOIN supplier_normalized sup
  ON s.norm_part = sup.norm_part
LIMIT 20;

-- ============================================
-- 10. CHECK PROJECT IDS
-- ============================================
-- Verify all tables use the same projectId
SELECT 'store_items' as table_name, COUNT(DISTINCT "projectId") as distinct_projects FROM "store_items"
UNION ALL
SELECT 'supplier_items', COUNT(DISTINCT "projectId") FROM "supplier_items"
UNION ALL
SELECT 'interchanges', COUNT(DISTINCT "projectId") FROM "interchanges"
UNION ALL
SELECT 'match_candidates', COUNT(DISTINCT "projectId") FROM "match_candidates";
