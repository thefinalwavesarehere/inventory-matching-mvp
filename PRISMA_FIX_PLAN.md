# Prisma Tech Debt Resolution Plan

**Date:** December 16, 2025  
**Project:** Inventory Matching MVP  
**Status:** 🔴 READY TO EXECUTE

---

## 🔍 Investigation Summary

I've analyzed your repository and identified the exact issue:

### What Happened (Timeline)

**December 8, 2025 - 11:01 AM:**
- ✅ Created migration `20251208110101_add_excel_review_fields`
- ✅ Migration adds 5 new fields to `match_candidates` table:
  - `vendorAction` (enum: NONE, LIFT, REBOX, UNKNOWN, CONTACT_VENDOR)
  - `correctedSupplierPartNumber` (text)
  - `reviewSource` (enum: UI, EXCEL)
  - `reviewedAt` (timestamp)
  - `reviewedByUserId` (text)

**December 8, 2025 - 11:06 AM (5 minutes later):**
- 🔴 Commit: "Temporarily comment out new schema fields to unblock export"
- Fields commented out in `prisma/schema.prisma`
- Reason: "Export will work with existing fields only"

**December 8, 2025 - 11:07 AM (1 minute later):**
- 🔴 Commit: "Remove prisma migrate deploy from build script to unblock deployment"
- Removed `prisma migrate deploy` from build script
- Reason: "Migration was hanging during Vercel build"

### Root Cause Analysis

**The migration was never applied to the database.**

Here's what happened:
1. Migration file was created successfully
2. Migration was probably NOT run locally (`pnpm prisma migrate dev`)
3. When trying to deploy to Vercel, the build script tried to run `prisma migrate deploy`
4. Vercel build hung/failed (likely missing DATABASE_URL or connection timeout)
5. Quick fix: Comment out fields and remove migration from build
6. Result: **Schema and database are out of sync**

### Current State

**Schema File (`prisma/schema.prisma`):**
- ✅ Has migration file: `20251208110101_add_excel_review_fields`
- 🔴 Fields are commented out (lines 255-260)
- 🔴 Enums are commented out (lines 301-312)

**Database:**
- ❓ Unknown state - migration may or may not have been applied
- Need to check migration status

**Build Script (`package.json`):**
- 🔴 Missing `prisma migrate deploy`
- Current: `"build": "prisma generate && next build"`
- Should be: `"build": "prisma generate && prisma migrate deploy && next build"`

**Environment:**
- 🔴 `.env.local` has placeholder DATABASE_URL: `[YOUR-PASSWORD]` and `[YOUR-PROJECT-REF]`
- This is why migrations can't run

---

## 🎯 Resolution Strategy

We have **two options**. I recommend **Option A** for production safety.

### Option A: Safe Production Path (RECOMMENDED)

This approach ensures we don't break anything in production.

**Step 1: Check Current Database State**
```bash
# You'll need to provide real DATABASE_URL
# Check if migration was already applied
pnpm prisma migrate status
```

**Step 2a: If Migration NOT Applied (Most Likely)**
```bash
# 1. Uncomment the fields in schema.prisma
# 2. Apply the migration
pnpm prisma migrate deploy

# 3. Regenerate Prisma Client
pnpm prisma generate

# 4. Test locally
pnpm run dev
```

**Step 2b: If Migration WAS Applied**
```bash
# Just uncomment the fields and regenerate
# 1. Uncomment fields in schema.prisma
# 2. Regenerate Prisma Client
pnpm prisma generate

# 3. Test locally
pnpm run dev
```

**Step 3: Fix Build Script**
```json
{
  "scripts": {
    "build": "prisma generate && prisma migrate deploy && next build"
  }
}
```

**Step 4: Configure Vercel**
- Add real `DATABASE_URL` to Vercel environment variables
- Use direct connection (port 5432): `postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres`

**Step 5: Deploy and Verify**
```bash
git add .
git commit -m "fix: Restore Prisma schema fields and migrations"
git push
```

### Option B: Fresh Start (If Database is Empty/Dev Only)

If your database doesn't have production data:

```bash
# 1. Reset everything
pnpm prisma migrate reset --force

# 2. Uncomment all fields in schema.prisma

# 3. Create a fresh migration
pnpm prisma migrate dev --name consolidated_schema

# 4. This will apply all migrations from scratch
```

---

## 📝 Step-by-Step Execution Guide

I'll guide you through **Option A** (safe path).

### Phase 1: Prepare Environment

**Action Required:** You need to provide your real Supabase credentials.

1. Go to your Supabase project dashboard
2. Navigate to: Settings → Database → Connection String
3. Copy the **Direct Connection** string (port 5432)
4. It should look like: `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`

**Update `.env.local`:**
```bash
DATABASE_URL="postgresql://postgres:[YOUR-REAL-PASSWORD]@db.[YOUR-REAL-PROJECT-REF].supabase.co:5432/postgres"
```

### Phase 2: Check Migration Status

```bash
cd /home/ubuntu/inventory-matching-mvp
pnpm prisma migrate status
```

**Expected Outputs:**

**Scenario A: Migration Pending**
```
The following migrations have not yet been applied:
20251208110101_add_excel_review_fields
```
→ **Action:** Proceed to Phase 3A

**Scenario B: All Migrations Applied**
```
Database schema is up to date!
```
→ **Action:** Proceed to Phase 3B

**Scenario C: Connection Error**
```
Error: P1001: Can't reach database server
```
→ **Action:** Fix DATABASE_URL in .env.local

### Phase 3A: Apply Pending Migration

If migration is pending:

```bash
# 1. First, uncomment the fields in schema.prisma
# I'll do this for you in the next step

# 2. Apply the migration
pnpm prisma migrate deploy

# 3. Regenerate Prisma Client
pnpm prisma generate

# 4. Verify
pnpm prisma migrate status
```

### Phase 3B: Schema Already Migrated

If migration was already applied:

```bash
# 1. Just uncomment the fields in schema.prisma
# I'll do this for you in the next step

# 2. Regenerate Prisma Client
pnpm prisma generate

# 3. Verify schema matches database
pnpm prisma validate
```

### Phase 4: Uncomment Schema Fields

I'll create a fixed version of the schema file with fields uncommented:

**Changes to make in `prisma/schema.prisma`:**

**Line 255-260 (MatchCandidate model):**
```prisma
// BEFORE (commented):
  // Excel review fields (commented out until migration runs)
  // vendorAction     VendorAction @default(NONE)
  // correctedSupplierPartNumber String?
  // reviewSource     ReviewSource?
  // reviewedAt       DateTime?
  // reviewedByUserId String?

// AFTER (uncommented):
  // Excel review fields
  vendorAction     VendorAction @default(NONE)
  correctedSupplierPartNumber String?
  reviewSource     ReviewSource?
  reviewedAt       DateTime?
  reviewedByUserId String?
```

**Line 300-312 (Enum definitions):**
```prisma
// BEFORE (commented):
// Commented out until migration runs
// enum VendorAction {
//   NONE
//   LIFT
//   REBOX
//   UNKNOWN
//   CONTACT_VENDOR
// }
// enum ReviewSource {
//   UI
//   EXCEL
// }

// AFTER (uncommented):
enum VendorAction {
  NONE
  LIFT
  REBOX
  UNKNOWN
  CONTACT_VENDOR
}

enum ReviewSource {
  UI
  EXCEL
}
```

### Phase 5: Fix Build Script

**Update `package.json`:**
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && prisma migrate deploy && next build",
    "start": "next start",
    "lint": "next lint",
    "postinstall": "prisma generate"
  }
}
```

### Phase 6: Test Locally

```bash
# 1. Build the project
pnpm run build

# 2. If build succeeds, start dev server
pnpm run dev

# 3. Test Excel export functionality
# Navigate to your project and try exporting
```

### Phase 7: Configure Vercel

**In Vercel Dashboard:**
1. Go to: Project → Settings → Environment Variables
2. Add `DATABASE_URL` for **Production, Preview, and Development**
3. Value: Your Supabase direct connection string (port 5432)
4. Save changes

### Phase 8: Deploy

```bash
# 1. Commit all changes
git add prisma/schema.prisma package.json
git commit -m "fix: Restore Prisma schema fields and enable migrations in build

- Uncomment Excel review fields (vendorAction, correctedSupplierPartNumber, etc.)
- Uncomment VendorAction and ReviewSource enums
- Restore prisma migrate deploy to build script
- This enables full Excel export functionality"

# 2. Push to trigger deployment
git push

# 3. Monitor Vercel deployment
# Check build logs for:
# - "Running prisma generate" ✅
# - "Running prisma migrate deploy" ✅
# - "Build completed" ✅
```

### Phase 9: Verify Production

1. Check Vercel deployment logs
2. Verify migration ran successfully
3. Test Excel export in production
4. Verify all new fields are working

---

## 🚨 Troubleshooting Guide

### Issue: "Migration was hanging during Vercel build"

**Cause:** DATABASE_URL not set in Vercel environment variables

**Fix:**
1. Go to Vercel Dashboard → Settings → Environment Variables
2. Add `DATABASE_URL` with your Supabase connection string
3. Ensure you're using **direct connection** (port 5432), not pooled (port 6543)

### Issue: "P1001: Can't reach database server"

**Cause:** Invalid DATABASE_URL or network issue

**Fix:**
1. Verify your Supabase project is active
2. Check connection string format
3. Ensure password is correct (no special characters that need escaping)
4. Test connection: `pnpm prisma db execute --stdin <<< "SELECT 1;"`

### Issue: "Migration already applied"

**Cause:** Migration was applied to database but schema was commented out

**Fix:**
1. Just uncomment the fields
2. Run `pnpm prisma generate`
3. No need to run migration again

### Issue: "Enum already exists"

**Cause:** Enums were created in database but commented in schema

**Fix:**
1. Uncomment the enum definitions
2. Run `pnpm prisma generate`
3. Schema will sync with existing database enums

### Issue: "Build timeout on Vercel"

**Cause:** Migration taking too long or connection timeout

**Fix:**
1. Check if you're using connection pooler URL (port 6543) - don't use this for migrations
2. Use direct connection (port 5432)
3. Increase Vercel build timeout (requires Pro plan)
4. Consider running migrations separately before deployment

---

## ✅ Success Criteria

You'll know the fix is complete when:

- ✅ `pnpm prisma migrate status` shows "Database schema is up to date!"
- ✅ `pnpm prisma validate` shows no errors
- ✅ `pnpm run build` completes successfully
- ✅ Vercel deployment succeeds with migration logs
- ✅ Excel export functionality works with all new fields
- ✅ No TypeScript errors related to missing fields
- ✅ Production application runs without schema errors

---

## 📊 Files to Modify

| File | Changes Required | Status |
|------|-----------------|--------|
| `prisma/schema.prisma` | Uncomment lines 256-260 (fields) | 🔴 TODO |
| `prisma/schema.prisma` | Uncomment lines 301-312 (enums) | 🔴 TODO |
| `package.json` | Add `prisma migrate deploy` to build script | 🔴 TODO |
| `.env.local` | Update with real DATABASE_URL | 🔴 TODO |
| Vercel Environment | Add DATABASE_URL variable | 🔴 TODO |

---

## 🎯 Next Steps

**I'm ready to execute this fix for you. Here's what I need from you:**

1. **Provide your Supabase DATABASE_URL** (or confirm you want me to use a placeholder for now)
2. **Confirm you want me to proceed** with uncommenting the schema fields
3. **Choose your approach:**
   - **Option A:** Safe production path (check migration status first)
   - **Option B:** Fresh start (reset and reapply all migrations)

Once you provide this information, I'll:
1. Update the schema file
2. Update the build script
3. Run the migration (if you provide DATABASE_URL)
4. Generate a commit with all changes
5. Provide you with the exact commands to deploy

**Ready to proceed?** Let me know your DATABASE_URL and which option you prefer!
