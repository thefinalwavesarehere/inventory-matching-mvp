# Deployment Guide - Inventory Matching System

## Overview

This guide provides complete instructions for deploying the Inventory Matching System to production using Vercel and Supabase.

## Prerequisites

- GitHub account
- Vercel account (sign up at https://vercel.com)
- Supabase account (sign up at https://supabase.com)
- Node.js 18+ installed locally (for testing)

## Part 1: Supabase Setup

### 1.1 Create Supabase Project

1. Go to https://app.supabase.com
2. Click "New Project"
3. Fill in project details:
   - **Name**: `inventory-matching-prod`
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to your users (e.g., `us-east-1`)
   - **Pricing Plan**: Free tier is sufficient for MVP
4. Click "Create new project"
5. Wait 1-2 minutes for provisioning

### 1.2 Get Database Connection Strings

1. In Supabase dashboard, go to **Project Settings** → **Database**
2. Scroll to "Connection string" section
3. Copy **TWO** connection strings:

**Connection Pooling (for Vercel):**
```
postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**Direct Connection (for migrations):**
```
postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
```

4. Save these for later use

### 1.3 Run Database Migrations

On your local machine:

```bash
# Navigate to project directory
cd inventory-matching-mvp

# Install dependencies
npm install

# Create .env.local file
cat > .env.local << EOF
DATABASE_URL="[YOUR-CONNECTION-POOLING-URL]?pgbouncer=true"
DIRECT_URL="[YOUR-DIRECT-CONNECTION-URL]"
OPENAI_API_KEY="[YOUR-OPENAI-KEY]"
NODE_ENV=development
EOF

# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# Verify tables were created
npx prisma studio
```

### 1.4 Seed Known Interchanges (Optional)

If you want to pre-populate known interchange mappings:

```bash
# Upload the Interchange.xlsx file through the UI
# OR create a seed script
npx prisma db seed
```

## Part 2: Vercel Deployment

### 2.1 Push Code to GitHub

```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Initial commit - production ready"

# Create GitHub repository and push
gh repo create inventory-matching-mvp --private --source=. --remote=origin --push
```

### 2.2 Connect to Vercel

1. Go to https://vercel.com/new
2. Click "Import Project"
3. Select your GitHub repository: `inventory-matching-mvp`
4. Configure project:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
5. Click "Deploy" (it will fail first time - this is expected)

### 2.3 Configure Environment Variables

1. In Vercel dashboard, go to your project
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

| Name | Value | Environment |
|------|-------|-------------|
| `DATABASE_URL` | Your Supabase connection pooling URL with `?pgbouncer=true` | Production, Preview, Development |
| `DIRECT_URL` | Your Supabase direct connection URL | Production, Preview, Development |
| `OPENAI_API_KEY` | Your OpenAI API key (optional but recommended) | Production, Preview, Development |
| `NODE_ENV` | `production` | Production |

4. Click "Save"

### 2.4 Redeploy

1. Go to **Deployments** tab
2. Click on the latest deployment
3. Click "Redeploy"
4. Wait for deployment to complete (2-3 minutes)

### 2.5 Verify Deployment

1. Click "Visit" to open your deployed application
2. Test the following:
   - Home page loads
   - Upload page is accessible
   - Can create a new project
   - Can upload a file (use sample files from `/home/ubuntu/upload/`)

## Part 3: Post-Deployment Configuration

### 3.1 Custom Domain (Optional)

1. In Vercel project settings, go to **Domains**
2. Add your custom domain
3. Follow DNS configuration instructions
4. Wait for SSL certificate provisioning

### 3.2 Enable Vercel Analytics (Optional)

1. In Vercel project settings, go to **Analytics**
2. Click "Enable Analytics"
3. Add to your `app/layout.tsx`:

```tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
```

### 3.3 Set Up Monitoring

1. **Supabase Monitoring**:
   - Go to Supabase dashboard → **Database** → **Logs**
   - Monitor query performance
   - Set up alerts for high CPU usage

2. **Vercel Monitoring**:
   - Go to Vercel dashboard → **Analytics**
   - Monitor function execution times
   - Check for errors in **Logs** tab

## Part 4: Testing the Production System

### 4.1 Upload Test Files

1. Navigate to your deployed URL
2. Click "Upload Files"
3. Create a new project: "Test Project"
4. Upload files in this order:
   - **Interchange.xlsx** (file type: interchange)
   - **ArnoldFile.xlsx** (file type: arnold)
   - **CQFile.xlsx** (file type: supplier)
   - **inventoryinforeport.xls** (file type: inventory_report)

### 4.2 Run Matching

1. After uploading Arnold and Supplier files, click "Run Matching Algorithm"
2. Wait for matching to complete (may take 1-2 minutes for large files)
3. Click "View Matches"

### 4.3 Review and Confirm Matches

1. Browse through the match list
2. Click on a match to view details
3. Test the following actions:
   - **Confirm Match**: Add enrichment data and confirm
   - **Reject Match**: Reject a low-confidence match
   - **Web Search**: For unmatched parts, try web search

### 4.4 Generate Reports

1. In the match page, add a download button (or use API directly)
2. Download unmatched parts report:
   ```
   GET /api/report?projectId=[YOUR-PROJECT-ID]&format=xlsx
   ```
3. Download confirmed matches:
   ```
   POST /api/report
   Body: { "projectId": "[YOUR-PROJECT-ID]", "includeEnrichment": true }
   ```

## Part 5: Troubleshooting

### Common Issues

#### 1. Database Connection Errors

**Error**: `Can't reach database server`

**Solution**:
- Verify DATABASE_URL and DIRECT_URL are correct
- Check Supabase project is running (not paused)
- Ensure `?pgbouncer=true` is added to DATABASE_URL

#### 2. Prisma Client Not Found

**Error**: `Cannot find module '@prisma/client'`

**Solution**:
```bash
npx prisma generate
```

#### 3. Build Failures on Vercel

**Error**: `Module not found: Can't resolve '@prisma/client'`

**Solution**:
- Add `postinstall` script to `package.json`:
```json
{
  "scripts": {
    "postinstall": "prisma generate"
  }
}
```

#### 4. OpenAI API Errors

**Error**: `OPENAI_API_KEY not configured`

**Solution**:
- Add OPENAI_API_KEY to Vercel environment variables
- Or disable web search feature temporarily

#### 5. File Upload Fails

**Error**: `Failed to process file`

**Solution**:
- Check file format matches expected columns
- Verify file size is under Vercel's limit (4.5MB for free tier)
- Check Vercel function logs for specific error

### Performance Optimization

1. **Enable Prisma Connection Pooling**:
   - Already configured with `?pgbouncer=true`

2. **Optimize Large File Uploads**:
   - For files > 10,000 rows, consider batch processing
   - Add pagination to match results

3. **Cache Frequently Accessed Data**:
   - Add Redis caching for known interchanges
   - Cache line code mappings

## Part 6: Maintenance

### Regular Tasks

1. **Weekly**:
   - Review Vercel function logs for errors
   - Check Supabase database size (free tier: 500MB)
   - Monitor API usage (OpenAI)

2. **Monthly**:
   - Review and optimize slow queries in Supabase
   - Clean up old/unused projects
   - Update dependencies: `npm update`

3. **Quarterly**:
   - Review and update known interchange mappings
   - Analyze match accuracy and improve algorithm
   - Update documentation

### Backup Strategy

1. **Database Backups**:
   - Supabase automatically backs up daily (free tier: 7 days retention)
   - For manual backup:
   ```bash
   pg_dump [YOUR-DIRECT-URL] > backup.sql
   ```

2. **Code Backups**:
   - GitHub automatically stores all commits
   - Tag releases: `git tag -a v1.0.0 -m "Production release"`

## Part 7: Scaling Considerations

### When to Upgrade

**Supabase**:
- Database size > 500MB → Upgrade to Pro ($25/month)
- Concurrent connections > 60 → Upgrade to Pro
- Need longer backup retention → Upgrade to Pro

**Vercel**:
- Function execution time > 10s → Upgrade to Pro ($20/month)
- Need team collaboration → Upgrade to Pro
- Custom domains > 1 → Upgrade to Pro

**OpenAI**:
- API costs > $20/month → Consider caching or rate limiting
- Need faster responses → Upgrade to GPT-4 Turbo

### Performance Benchmarks

Expected performance on free tier:
- **File Upload**: < 5 seconds for 10,000 rows
- **Matching**: < 30 seconds for 10,000 Arnold items vs 20,000 supplier items
- **Web Search**: 2-5 seconds per part
- **Report Generation**: < 10 seconds for 1,000 unmatched parts

## Part 8: Security Checklist

- [ ] Environment variables are set in Vercel (not in code)
- [ ] `.env.local` is in `.gitignore`
- [ ] Supabase Row Level Security (RLS) enabled (optional for MVP)
- [ ] HTTPS enabled (automatic with Vercel)
- [ ] API rate limiting implemented (optional)
- [ ] User authentication added (future enhancement)

## Support

For issues or questions:
1. Check Vercel deployment logs
2. Check Supabase database logs
3. Review this documentation
4. Contact development team

## Next Steps

After successful deployment:
1. Train team on using the system
2. Process initial batch of inventory files
3. Review match accuracy and adjust thresholds
4. Collect feedback for future improvements
5. Plan for additional features (multi-supplier support, advanced analytics, etc.)
