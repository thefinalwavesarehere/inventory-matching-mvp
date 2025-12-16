# Quick Deployment Checklist

## 🚨 CRITICAL FIX: File Upload Now Works!

The application now uses **Supabase Storage** to bypass Vercel's 4.5MB limit. Follow these steps to deploy the fix.

---

## ✅ Pre-Deployment Checklist

Before deploying, complete these steps:

### 1. Get Supabase Storage Credentials

Go to https://app.supabase.com → Your Project → Settings → API

Copy these values:
- [ ] **Project URL**: `https://xxxxx.supabase.co`
- [ ] **Anon Key**: `eyJhbGc...` (long string)

### 2. Add to Vercel Environment Variables

Go to https://vercel.com → Your Project → Settings → Environment Variables

Add these TWO new variables:
- [ ] `NEXT_PUBLIC_SUPABASE_URL` = `https://YOUR-PROJECT-REF.supabase.co`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `YOUR-ANON-KEY`

**Important**: Select "All" environments (Production, Preview, Development)

### 3. Create Supabase Storage Bucket

Go to https://app.supabase.com → Your Project → Storage

- [ ] Click "Create a new bucket"
- [ ] Name: `inventory-files`
- [ ] Public: **YES** ✅
- [ ] File size limit: `52428800` (50MB)
- [ ] Click "Create bucket"

---

## 🚀 Deploy

### Push to GitHub

```bash
cd /home/ubuntu/inventory-matching-mvp
git push origin master
```

Vercel will automatically deploy in 2-3 minutes.

---

## 🧪 Test After Deployment

Visit: https://inventory-matching-mvp.vercel.app

1. [ ] Login works
2. [ ] Click "Upload Files"
3. [ ] Upload a test Excel file (any size, even > 4.5MB)
4. [ ] Verify upload completes (no 413 error!)
5. [ ] Check data imported successfully
6. [ ] Run matching algorithm
7. [ ] Review matches

---

## ❌ If Upload Still Fails

### Check These:

1. **Environment variables set?**
   - Vercel → Settings → Environment Variables
   - Both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` present

2. **Bucket created?**
   - Supabase → Storage → `inventory-files` bucket exists
   - Bucket is **Public**

3. **Redeployed after adding variables?**
   - Vercel → Deployments → Redeploy latest

4. **Clear browser cache**
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

---

## 📊 What Changed

**Before (Broken):**
```
Browser → Vercel API (4.5MB limit) → 413 Error ❌
```

**After (Fixed):**
```
Browser → Supabase Storage (50MB) → Vercel API → Database ✅
```

---

## 🎉 New Features

After deployment, you'll have:

✅ **File uploads work** (up to 50MB)  
✅ **Project management** (edit, delete, view details)  
✅ **Upload files to existing projects**  
✅ **Improved matching algorithm**  
✅ **Better error handling**  

---

## 📚 Full Documentation

For detailed setup and troubleshooting:
- `SUPABASE_SETUP.md` - Complete Supabase configuration guide
- `DEPLOYMENT_GUIDE.md` - Full deployment documentation

---

## 🆘 Quick Troubleshooting

| Error | Solution |
|-------|----------|
| "Supabase not configured" | Add environment variables in Vercel, then redeploy |
| "Bucket not found" | Create `inventory-files` bucket in Supabase Storage |
| 413 error still happening | Clear browser cache, verify using latest deployment |
| Upload completes but no data | Check Vercel function logs at `/api/upload/process` |

---

## ⏱️ Time Estimate

- **Get credentials**: 2 minutes
- **Add to Vercel**: 3 minutes
- **Create bucket**: 1 minute
- **Deploy**: 3 minutes
- **Test**: 5 minutes

**Total**: ~15 minutes to fix the upload issue! 🚀
