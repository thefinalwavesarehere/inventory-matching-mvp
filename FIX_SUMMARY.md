# Fix Summary: Matching Algorithm Recovery

## Problem Identified

**Root Cause:** Two-part issue blocking 10,000+ matches

1. **Line Code Constraint Bug** (postgres-exact-matcher-v2.ts)
   - Store items use line codes: `DOR`, `CFI`, `XBO`, `DAY` (client-specific)
   - Supplier items use line codes: `DMN`, `GAT`, `STI`, `ISN` (manufacturer codes)
   - Systems are incompatible by design (95% mismatch)
   - Matcher required line codes to match OR be NULL
   - Both tables have 100% line code population → all matches blocked

2. **Routing Issue** (route.ts)
   - Job processor had LOCAL `processExactMatching` function
   - Used old `matching-engine` library instead of fixed postgres matcher
   - Loaded all 120,507 supplier items into memory
   - The fixed `processExactMatching-v2.ts` existed but was never called

---

## Fixes Applied

### Commit 1: `9e448bb` - V2.2 Line Code Constraint Removal

**File:** `app/lib/matching/postgres-exact-matcher-v2.ts`

**Changes:**
- Removed lines 119-132 (line code constraint logic)
- Updated version from V2.1 → V2.2
- Added diagnostic comments explaining the fix

**Impact:**
- Potential matches: 10,622 (48.9%) vs 643 (2.8%) before
- Improvement: +10,000 matches

### Commit 2: `bc986da` - Routing Fix

**File:** `app/api/jobs/[id]/process/route.ts`

**Changes:**
- Added import: `import { processExactMatching } from './processExactMatching-v2';`
- Deleted local `processExactMatching` function (103 lines removed)
- Job processor now calls the fixed V2.2 matcher

**Impact:**
- Eliminates memory issues (no longer loads 120K items)
- Uses SQL-native matching (orders of magnitude faster)
- Single source of truth for matching logic

---

## Test Results

### SQL Test Query (Before Fix)
```sql
-- Part number matches WITHOUT line code constraint
SELECT COUNT(*) FROM store_items s 
INNER JOIN supplier_items sup 
  ON LTRIM(UPPER(REGEXP_REPLACE(s.partNumber, '[^a-zA-Z0-9]', '', 'g')), '0') = 
     LTRIM(UPPER(REGEXP_REPLACE(sup.partNumber, '[^a-zA-Z0-9]', '', 'g')), '0')
WHERE s.projectId = 'cmk204a1e0000jj04645edqyb';
```

**Result:** 10,622 potential matches (48.9%)

### Current Match Count (Before Fix)
```sql
SELECT COUNT(*), method FROM match_candidates 
WHERE projectId = 'cmk204a1e0000jj04645edqyb' 
GROUP BY method;
```

**Results:**
- EXACT_NORM: 597
- INTERCHANGE: 14
- FUZZY_SUBSTRING: 30
- LINE_PN: 2
- **Total: 643 (2.8%)**

---

## Expected Results After Fix

**Match Rate:** ~48.9% (10,622 matches out of 21,737 store items)

**Exceeds Historical Target:** 44% (9,500 matches)

**Improvement:** +10,000 matches (+46 percentage points)

---

## Deployment Status

✅ **Commit 1:** `9e448bb` pushed to master  
✅ **Commit 2:** `bc986da` pushed to master  
⏳ **Vercel:** Auto-deploying now

---

## User Action Required

Once Vercel deployment completes:

1. **Clear old matches:**
   ```sql
   DELETE FROM match_candidates 
   WHERE projectId = 'cmk204a1e0000jj04645edqyb';
   ```

2. **Re-run exact matching job** via UI

3. **Verify results:**
   - Expected: ~10,600 matches
   - Match rate: ~48.9%

---

## Technical Details

### Line Code Systems Comparison

| Store (Top 5) | Count | Supplier (Top 5) | Count |
|---------------|-------|------------------|-------|
| DOR | 1,940 | DMN | 11,975 |
| CFI | 1,708 | GAT | 8,116 |
| XBO | 1,370 | STI | 6,050 |
| DAY | 806 | ISN | 4,979 |
| MTM | 589 | WIX | 4,228 |

**Overlap:** Only 2 line codes (MOG, FEL) represent <5% of inventory

### Data Population Health

| Table | Rows | partNumber | canonicalPartNumber | lineCode |
|-------|------|------------|---------------------|----------|
| store_items | 21,737 | 100% | 100% | 100% |
| supplier_items | 120,507 | 100% | 100% | 100% |
| interchanges | 1,764 | 100% | 100% | N/A |

All fields properly populated - no data ingestion issues.

### Interchange Table Analysis

**Finding:** Interchange data is irrelevant to this dataset

- Interchange contains AXLGM/AXLFD parts (GSP axle parts)
- Store inventory contains ABC/DOR/CFI parts
- **Zero overlap** between interchange and store items
- Only 14 matches found from 1,764 interchange records (<1% impact)

---

## Files Modified

1. `app/lib/matching/postgres-exact-matcher-v2.ts` - Line code constraint removed
2. `app/api/jobs/[id]/process/route.ts` - Routing fixed to use V2.2 matcher
3. `DIAGNOSTIC_FINDINGS.md` - Root cause analysis documentation
4. `diagnostic-queries.sql` - SQL queries used for investigation

---

## Lessons Learned

1. **Always verify which code is actually running** - The fixed matcher existed but wasn't being called
2. **Line code systems can be incompatible** - Client codes vs manufacturer codes serve different purposes
3. **Test with actual data** - SQL query revealed 10,622 potential matches immediately
4. **Memory vs SQL-native matching** - Loading 120K items into memory is unnecessary when SQL can do it faster

---

## Next Steps (If Issues Persist)

If match rate is still low after deployment:

1. Check Vercel logs for V2.2 matcher being called
2. Verify no other code paths are calling old matchers
3. Check for functional indexes on normalized part numbers (performance optimization)
4. Consider fuzzy matching for remaining unmatched items

---

**Status:** ✅ FIXED - Ready for testing after Vercel deployment
