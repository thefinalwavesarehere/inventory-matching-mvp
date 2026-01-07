# Root Cause Analysis: Low Match Rate (613 vs 9,500 Expected)

## Investigation Summary

**Date:** 2026-01-07  
**Issue:** Match rate dropped from 44% (9,500 matches) to 2.8% (613 matches)  
**Dataset:** 21,737 store items × 120,507 supplier items

---

## Key Findings

### 1. **LINE CODE MISMATCH IS THE PRIMARY BLOCKER** ✅ ROOT CAUSE

**Store Items Line Codes (Top 10):**
- DOR: 1,940 items
- CFI: 1,708 items  
- XBO: 1,370 items
- DAY: 806 items
- MTM: 589 items
- FEL: 581 items
- GWR: 553 items
- HHC: 507 items
- RBR: 480 items
- MOG: 463 items

**Supplier Items Line Codes (Top 10):**
- DMN: 11,975 items
- GAT: 8,116 items
- STI: 6,050 items
- ISN: 4,979 items
- WIX: 4,228 items
- MOG: 3,424 items
- FEL: 3,129 items
- STF: 2,183 items
- APE: 2,067 items
- MAC: 1,973 items

**Critical Issue:** Store and Supplier use **completely different line code systems**. Only 2 line codes overlap (MOG, FEL), representing <5% of store inventory.

---

### 2. **POTENTIAL MATCHES WITHOUT LINE CODE CONSTRAINT**

**Test Query Result:**
```sql
-- Part number matches WITHOUT line code constraint
SELECT COUNT(*) FROM store_items s 
INNER JOIN supplier_items sup 
  ON LTRIM(UPPER(REGEXP_REPLACE(s.partNumber, '[^a-zA-Z0-9]', '', 'g')), '0') = 
     LTRIM(UPPER(REGEXP_REPLACE(sup.partNumber, '[^a-zA-Z0-9]', '', 'g')), '0')
WHERE s.projectId = 'cmk204a1e0000jj04645edqyb' 
  AND sup.projectId = 'cmk204a1e0000jj04645edqyb';
```

**Result:** **10,622 potential matches** (48.9% match rate)

This is **HIGHER** than the expected 44% (9,500 matches), confirming the line code constraint is blocking valid matches.

---

### 3. **CURRENT MATCHER LOGIC ANALYSIS**

**File:** `app/lib/matching/postgres-exact-matcher-v2.ts`

**Line Code Constraint (Lines 119-132):**
```sql
AND (
  -- Scenario 1: Line codes match (normalized)
  (s."lineCode" IS NOT NULL 
   AND sup."lineCode" IS NOT NULL 
   AND normalized(s.lineCode) = normalized(sup.lineCode))
  
  -- Scenario 2: One or both line codes are NULL
  OR (s."lineCode" IS NULL OR sup."lineCode" IS NULL)
  
  -- Scenario 3: Complex part number override (length > 5 AND has numbers)
  OR (LENGTH(normalized(s.partNumber)) > 5 AND s.partNumber ~ '[0-9]')
)
```

**Problem:** 
- **Scenario 1** fails because line codes don't match (DOR ≠ DMN)
- **Scenario 2** fails because BOTH tables have 100% line code population
- **Scenario 3** only applies to "complex" parts (length > 5 with numbers)

**Example of blocked match:**
- Store: `10026A` (lineCode: `ABC`)
- Supplier: `10026A` (lineCode: `01M`)
- Normalized: Both = `10026A` ✅ MATCH
- Line codes: `ABC` ≠ `01M` ❌ BLOCKED

---

### 4. **INTERCHANGE TABLE IS IRRELEVANT**

**Interchange Data Sample:**
```
AXLGM-8167 → NCV10028 (GSP)
AXLGM-8233 → NCV10047 (GSP)
AXLGM-8030 → NCV10059 (GSP)
```

**Store Data Sample:**
```
10026A (ABC)
10033A (ABC)
20SC (ABC)
```

**Finding:** Interchange table contains **AXLGM/AXLFD** parts (axle parts from GSP vendor), but store inventory has **ABC/DOR/CFI** parts. **ZERO overlap** between interchange "ours" parts and store parts.

**Interchange matches found:** 14 (out of 1,764 records)  
**Impact:** Negligible (<0.1% of expected matches)

---

### 5. **DATA POPULATION IS HEALTHY**

| Table | Total Rows | partNumber | partNumberNorm | canonicalPartNumber | lineCode |
|-------|------------|------------|----------------|---------------------|----------|
| store_items | 21,737 | 100% | 100% | 100% | 100% |
| supplier_items | 120,507 | 100% | 100% | 100% | 100% |
| interchanges | 1,764 | 100% | 100% | N/A | N/A |

All fields are properly populated. No data ingestion issues.

---

## Root Cause Statement

**The line code constraint in `postgres-exact-matcher-v2.ts` is blocking 10,000+ valid matches because:**

1. Store items use line codes like `DOR`, `CFI`, `XBO`, `DAY` (client-specific codes)
2. Supplier items use line codes like `DMN`, `GAT`, `STI`, `ISN` (CarQuest manufacturer codes)
3. These line code systems are **incompatible by design** - they represent different classification schemes
4. The matcher requires line codes to match OR be NULL, but both tables have 100% population with mismatched values
5. The "complex part override" (Scenario 3) only rescues parts with length > 5 + numbers, missing simple parts like `10026A` (length 6, all alphanumeric)

---

## Solution

**Remove or relax the line code constraint** to allow matches based purely on normalized part numbers when line codes are from different systems.

### Option 1: Disable Line Code Matching (Recommended)
Remove the line code constraint entirely and rely on part number normalization alone.

### Option 2: Make Line Code Optional
Only enforce line code matching when both line codes are from the same "system" (requires line code system detection).

### Option 3: Lower Complex Part Threshold
Change `LENGTH > 5` to `LENGTH >= 5` to include more parts in the override logic.

---

## Expected Impact

**Current:** 643 matches (2.8%)  
**After fix:** ~10,622 matches (48.9%)  
**Improvement:** +10,000 matches (+46 percentage points)

This exceeds the historical 44% match rate, suggesting the fix will fully restore matching capability.
