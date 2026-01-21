# Deployment Guide - Master Rules & P3 Features

## Overview

This guide covers the deployment and testing of the newly implemented P2/P3 features:

1. **Master Rules Learning System** - Learns from manual approvals/rejections
2. **Interchange to Master Rules Conversion** - Converts existing interchange data
3. **Line Code Normalization** - Normalizes part numbers before matching
4. **Vendor Action Evaluation** - Assigns manufacturer-specific actions

## Recent Fixes

### ✅ Fixed: Master Rules Creation from UI Approvals

**Problem:** Master rules were not being created when users approved/rejected matches in the UI due to a foreign key constraint violation.

**Solution:** Added projectId validation before creating master rules (commit 543c130).

**Files Changed:**
- `app/lib/master-rules-learner.ts` - Added projectId validation
- `app/api/projects/[id]/matches/bulk/route.ts` - Enhanced logging

**Testing:**
```bash
# Run diagnostic script to verify rules are created
npx tsx scripts/test-master-rule-creation.ts

# Check database for master rules
npx tsx scripts/check-master-rules.ts
```

### ✅ Implemented: Interchange to Master Rules Conversion

**Files Created:**
- `app/lib/services/interchange-to-master-rules.ts` - Conversion service
- `app/api/master-rules/convert-interchange/route.ts` - API endpoint
- `scripts/convert-interchange-to-master-rules.ts` - CLI script

**Usage:**

```bash
# Convert all interchange rules to master rules (global)
npx tsx scripts/convert-interchange-to-master-rules.ts

# Convert for specific project
npx tsx scripts/convert-interchange-to-master-rules.ts <projectId>
```

**API Endpoint:**
```bash
POST /api/master-rules/convert-interchange
{
  "projectId": "optional-project-id"
}
```

**What Gets Converted:**
1. **Interchange** table → POSITIVE_MAP rules (merrillPN ↔ vendorPN)
2. **PartNumberInterchange** table → POSITIVE_MAP rules (source → target with line codes)
3. **InterchangeMapping** table → POSITIVE_MAP rules (competitor → arnold mappings)

## Deployment Steps

### 1. Pre-Deployment Checks

```bash
# Ensure all dependencies are installed
npm install

# Generate Prisma client
npx prisma generate

# Run TypeScript type check
npm run build
```

### 2. Database Migration

No new migrations required - all tables already exist in schema.

### 3. Deploy to Vercel

```bash
# Push to GitHub (triggers Vercel deployment)
git push origin master

# Or deploy manually
vercel --prod
```

### 4. Post-Deployment Verification

#### A. Verify Master Rules Creation

1. Log in to the application
2. Navigate to a project with matches
3. Approve or reject some matches via the UI
4. Navigate to `/master-rules` page
5. Verify rules appear in the list

**Expected Result:** Rules should appear with:
- Rule type (POSITIVE_MAP or NEGATIVE_BLOCK)
- Store part number
- Supplier part number
- Confidence: 1.0
- Enabled: true
- Created by: your user ID
- Project ID: source project

#### B. Verify Interchange Conversion

**Option 1: Via API**
```bash
curl -X POST https://your-app.vercel.app/api/master-rules/convert-interchange \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectId": "optional-project-id"}'
```

**Option 2: Via CLI (on server with DATABASE_URL)**
```bash
npx tsx scripts/convert-interchange-to-master-rules.ts
```

**Expected Result:**
- Created: X rules
- Skipped: Y rules (duplicates)
- Errors: 0

#### C. Verify Master Rules Matching

1. Create a new project or use existing one
2. Upload store inventory and supplier catalog
3. Create a master rules matching job:
   ```bash
   POST /api/jobs/create
   {
     "projectId": "your-project-id",
     "jobType": "master-rules"
   }
   ```
4. Wait for job to complete (check `/api/jobs/[id]`)
5. Verify matches were created with method: `MASTER_RULE`

**Expected Result:**
- Matches created for all rules that apply to the project
- Match status: CONFIRMED (auto-approved)
- Match stage: 0 (Stage 0 = Master Rules)
- Features contain: `{ ruleId, ruleType, autoConfirmed: true }`

### 5. Monitoring

#### Check Logs

**Vercel Dashboard:**
- Go to your project → Logs
- Filter by "MASTER-RULES" or "BULK_OPERATIONS"

**Key Log Messages:**
```
[MASTER-RULES] Created POSITIVE_MAP rule: <ruleId>
[MASTER-RULES-MATCHER] Created match: <storePN> → <supplierPN>
[BULK_OPERATIONS] Created X master rules from bulk ACCEPTED
[INTERCHANGE-CONVERTER] Conversion complete: X created, Y skipped
```

#### Database Queries

```sql
-- Count master rules
SELECT COUNT(*) FROM master_rules;

-- Count by type
SELECT rule_type, COUNT(*) FROM master_rules GROUP BY rule_type;

-- Count by status
SELECT enabled, COUNT(*) FROM master_rules GROUP BY enabled;

-- Recent rules
SELECT * FROM master_rules ORDER BY created_at DESC LIMIT 10;

-- Rules with usage stats
SELECT 
  id, 
  rule_type, 
  store_part_number, 
  supplier_part_number,
  applied_count,
  last_applied_at
FROM master_rules 
WHERE applied_count > 0
ORDER BY applied_count DESC;
```

## Feature Status

### ✅ Completed

- [x] Master rules database schema
- [x] Master rules learning service (from approvals/rejections)
- [x] Master rules matcher (Stage 0 in matching pipeline)
- [x] Master rules management UI (`/master-rules` page)
- [x] CSV re-import workflow with master rules creation
- [x] Bulk operations API with master rules learning
- [x] Interchange to master rules conversion service
- [x] Foreign key validation fix
- [x] Enhanced logging and diagnostics

### 🔄 Partially Implemented

- [ ] **Line Code Normalization** - Service exists but not integrated into job workflow
  - Files: `app/lib/line-code-normalizer.ts`, `app/api/line-code-normalizer/route.ts`
  - TODO: Add UI trigger on project page
  - TODO: Integrate into preprocessing stage

- [ ] **Vendor Action Evaluation** - Service exists but not integrated into matching
  - Files: `app/lib/vendor-action-evaluator.ts`, `app/api/vendor-action-evaluator/route.ts`
  - TODO: Call during match creation
  - TODO: Add vendor action rules management UI

### 📋 Remaining Work

1. **Line Code Normalization Integration**
   - Add "Normalize Line Codes" button on project page
   - Call normalization before running matching jobs
   - Show normalization results in UI

2. **Vendor Action Integration**
   - Call vendor action evaluator after creating matches
   - Populate `vendor_action` field in match_candidates
   - Add vendor action rules management page

3. **Testing**
   - Unit tests for master rules learner
   - Integration tests for bulk operations
   - E2E tests for master rules workflow

4. **Documentation**
   - User guide for master rules feature
   - Admin guide for interchange conversion
   - API documentation

## Troubleshooting

### Master Rules Not Created

**Symptom:** Approving matches doesn't create master rules

**Checks:**
1. Check browser console for errors
2. Check Vercel logs for `[BULK_OPERATIONS]` messages
3. Verify projectId exists in database
4. Run diagnostic script: `npx tsx scripts/test-master-rule-creation.ts`

**Common Causes:**
- Foreign key constraint violation (fixed in commit 543c130)
- Missing supplier part number
- Duplicate rule already exists

### Interchange Conversion Fails

**Symptom:** Conversion script errors or creates 0 rules

**Checks:**
1. Verify DATABASE_URL is set
2. Check if interchange tables have data
3. Look for foreign key errors in logs

**Common Causes:**
- Missing projectId in interchange records
- Null normalized part numbers
- Duplicate rules already exist

### Master Rules Not Applied

**Symptom:** Master rules exist but matches aren't created

**Checks:**
1. Verify rules are enabled (`enabled = true`)
2. Check rule scope (GLOBAL vs PROJECT_SPECIFIC)
3. Verify part numbers match exactly
4. Check if matches already exist

**Common Causes:**
- Rule disabled
- Part numbers don't match (case-sensitive)
- Supplier items not in project
- Matches already created by another stage

## Rollback Plan

If issues occur after deployment:

### 1. Disable Master Rules Matching

```sql
-- Disable all master rules
UPDATE master_rules SET enabled = false;
```

### 2. Revert Code Changes

```bash
# Revert to previous commit
git revert HEAD
git push origin master
```

### 3. Delete Master Rules (if needed)

```sql
-- Delete all master rules (CAUTION: irreversible)
DELETE FROM master_rules;
```

## Support

For issues or questions:
- Check logs in Vercel dashboard
- Run diagnostic scripts in `scripts/` directory
- Review code comments in changed files
- Contact: solutions@moorecre8ive.com

## Changelog

### 2026-01-21 - Commit 2a4b19c
- Implemented interchange to master rules conversion
- Added conversion service, API endpoint, and CLI script
- Supports Interchange, PartNumberInterchange, and InterchangeMapping tables

### 2026-01-21 - Commit 543c130
- Fixed master rules creation from UI approvals
- Added projectId validation to prevent foreign key errors
- Enhanced logging in bulk operations route
- Added diagnostic scripts for testing

### Previous
- Implemented master rules database schema
- Created master rules learning service
- Built master rules matcher (Stage 0)
- Added master rules management UI
