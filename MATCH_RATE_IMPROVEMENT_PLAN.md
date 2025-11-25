# Match Rate Improvement Plan
## Goal: 44.7% → 60%+ Match Rate

Based on client's manual matching process analysis and current performance.

---

## Current State (44.7% Total)

- **Stage 1 (Deterministic)**: 44.2% (9,605 matches)
- **Stage 2 (Fuzzy)**: 0.8% (109 matches) ❌ TOO LOW
- **Interchange**: Not showing in results ❌ NOT WORKING

---

## Critical Missing Features

### 1. Part Number Core Extraction ⚠️ HIGH PRIORITY
**Problem**: Not properly splitting 3-char line code from part number

**Current**: `MEVES409LT` treated as one field  
**Should Be**:
- `line_code`: "MEV"
- `part_number_core`: "ES409LT"
- `part_number_full`: "MEVES409LT"

**Impact**: +5-8% match rate

---

### 2. Better Punctuation Normalization ⚠️ HIGH PRIORITY
**Problem**: Current normalization too simple

**Current**: Removes `-`, `/`, `.`  
**Should Be**:
- Normalize `GM-8167`, `GM/8167`, `GM.8167` → same value
- Handle spaces, underscores, other punctuation
- Lowercase everything
- Collapse repeated whitespace

**Impact**: +3-5% match rate

---

### 3. Manufacturer/Brand Filtering ⚠️ MEDIUM PRIORITY
**Problem**: Cross-brand collisions (e.g., 51515 exists in Wix, Kurt, Goodyear, Gates)

**Solution**:
- Add manufacturer/brand field to matching
- Filter candidates by brand when available
- Use line code descriptors to infer brand

**Impact**: +1-2% match rate, prevents false positives

---

### 4. Description Similarity ⚠️ MEDIUM PRIORITY
**Problem**: Not using descriptions as a matching signal

**Solution**:
- Calculate token overlap / cosine similarity
- Boost confidence when descriptions match
- Demote when descriptions clearly different

**Impact**: +2-4% match rate

---

### 5. Interchange Matching Broken ⚠️ CRITICAL
**Problem**: 1,809 mappings loaded but not showing in results

**Investigation Needed**:
- Check if reverse index is working
- Verify interchange matching is being called
- Add logging to see what's happening

**Expected Impact**: +7-9% match rate

---

### 6. Fuzzy Matching Too Conservative ⚠️ HIGH PRIORITY
**Problem**: Only 109 matches (0.8%) when should be 200-400 (1-2%)

**Issues**:
- Threshold too high (70% still strict)
- Candidate selection not optimal
- Not catching common patterns

**Solutions**:
- Lower threshold to 65%
- Add more pattern-based matching
- Better substring detection

**Impact**: +0.5-1% match rate

---

## Implementation Priority

### Phase 1: Quick Wins (Today)
1. ✅ Fix interchange matching (investigate why not working)
2. ✅ Improve part number core extraction
3. ✅ Better punctuation normalization

**Expected**: 44.7% → 55-58%

### Phase 2: Signal Enrichment (Next)
4. ✅ Add description similarity scoring
5. ✅ Manufacturer/brand filtering
6. ✅ Enhanced fuzzy matching

**Expected**: 55-58% → 60-65%

### Phase 3: Rule Engine (Future)
7. Pattern learning from approvals
8. Bulk apply discovered patterns
9. Tenant-level rule persistence

**Expected**: 60-65% → 70-75%

---

## Success Metrics

**Target Match Rates**:
- **Stage 1 (Deterministic)**: 50-55% (currently 44.2%)
- **Interchange**: 7-9% (currently 0%)
- **Stage 2 (Fuzzy)**: 1-2% (currently 0.8%)
- **Total**: 60-65% (currently 44.7%)

**Cost Savings**:
- Fewer items needing AI/web search
- Estimated savings: $60-80 per run

---

## Next Steps

1. Investigate interchange matching
2. Implement part number core extraction
3. Enhance normalization
4. Deploy and test
5. Measure improvement
6. Move to Phase 2

