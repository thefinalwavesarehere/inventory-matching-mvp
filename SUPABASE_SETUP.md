# Supabase Storage Setup Guide

## Overview

The application now uses **Supabase Storage** for file uploads to bypass Vercel's 4.5MB serverless body size limit. This allows users to upload large Excel files (up to 50MB).

## Setup Steps

### 1. Get Supabase Credentials

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Navigate to **Settings** → **API**
3. Copy the following values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **Anon/Public Key** (starts with `eyJ...`)

### 2. Add Environment Variables

#### Local Development (.env.local)

Update your `.env.local` file with the Supabase credentials:

```bash
# Supabase Storage (for file uploads)
NEXT_PUBLIC_SUPABASE_URL="https://YOUR-PROJECT-REF.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR-ANON-KEY-HERE"
```

**Note:** These are public credentials and safe to expose in client-side code. The `NEXT_PUBLIC_` prefix makes them available in the browser.

#### Vercel Deployment

Add the same environment variables in Vercel:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://YOUR-PROJECT-REF.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `YOUR-ANON-KEY-HERE`
4. Make sure to select **All** environments (Production, Preview, Development)
5. Click **Save**

### 3. Create Storage Bucket

Run the initialization script to create the storage bucket:

```bash
npm run init-storage
```

This will:
- Create a public bucket named `inventory-files`
- Set max file size to 50MB
- Configure allowed file types (Excel and CSV)

**Alternatively**, you can create the bucket manually in Supabase:

1. Go to **Storage** in your Supabase dashboard
2. Click **Create a new bucket**
3. Name it `inventory-files`
4. Make it **Public**
5. Set file size limit to **52428800** bytes (50MB)
6. Click **Create bucket**

### 4. Configure Storage Policies (Optional)

By default, the bucket is public and allows uploads. For production, you may want to add Row Level Security (RLS) policies:

1. Go to **Storage** → **Policies**
2. Add policies for:
   - **SELECT**: Allow public read access
   - **INSERT**: Allow authenticated users to upload
   - **DELETE**: Allow authenticated users to delete their own files

Example policy for INSERT:

```sql
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'inventory-files');
```

## How It Works

### Upload Flow

1. **Client-side**: User selects Excel file in browser
2. **Direct Upload**: File is uploaded directly to Supabase Storage (bypasses Vercel)
3. **Get Public URL**: Supabase returns a public URL for the uploaded file
4. **Process File**: Frontend sends the URL to backend API
5. **Download & Parse**: Backend downloads file from Supabase, parses Excel, imports to database
6. **Complete**: User sees success message with row count

### File Organization

Files are stored in Supabase Storage with the following structure:

```
inventory-files/
├── {projectId}/
│   ├── store-{timestamp}.xlsx
│   ├── supplier-{timestamp}.xlsx
│   └── interchange-{timestamp}.xlsx
```

### Benefits

- ✅ **No 4.5MB Limit**: Upload files up to 50MB
- ✅ **Fast Uploads**: Direct upload to Supabase CDN
- ✅ **Scalable**: Supabase handles file storage and delivery
- ✅ **Secure**: Public bucket for easy access, can add auth later
- ✅ **Cost-Effective**: Supabase free tier includes 1GB storage

## Troubleshooting

### "Missing Supabase credentials" Error

Make sure you've added the environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Restart your dev server after adding them:

```bash
npm run dev
```

### "Bucket not found" Error

Run the initialization script:

```bash
npm run init-storage
```

Or create the bucket manually in Supabase dashboard.

### Upload Fails with "413 Request Entity Too Large"

This means the file is still being sent through Vercel. Check that:
1. You're using the updated `/app/upload/page.tsx` component
2. The component is importing and using `@supabase/supabase-js`
3. The upload is going to `/api/upload/process` (not `/api/upload`)

### Files Not Processing

Check the backend logs in Vercel:
1. Go to Vercel dashboard → **Deployments**
2. Click on the latest deployment
3. Go to **Functions** tab
4. Check logs for `/api/upload/process`

Common issues:
- File URL not accessible (check Supabase bucket is public)
- Excel parsing error (check file format)
- Database connection issue (check DATABASE_URL)

## Testing

Test the complete flow:

1. Start dev server: `npm run dev`
2. Go to http://localhost:3000
3. Click "Upload Files"
4. Create a new project or select existing
5. Upload a small Excel file (< 1MB) first
6. Check console for upload progress
7. Verify data imported in database

## Production Deployment

After setting up Supabase credentials in Vercel:

```bash
git add .
git commit -m "Add Supabase Storage for file uploads"
git push origin main
```

Vercel will automatically deploy with the new environment variables.

## Next Steps

- [ ] Add file upload progress bar
- [ ] Add file validation (check columns before import)
- [ ] Add ability to delete uploaded files
- [ ] Add file history/audit log
- [ ] Implement file compression for large files
- [ ] Add support for CSV files
