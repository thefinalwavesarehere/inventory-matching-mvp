# Vercel Cron-Based Background Job System

## Overview

The inventory matching system uses **Vercel Cron** to process background jobs automatically without requiring browser polling or user interaction.

## How It Works

```
User clicks "Start Fuzzy Matching"
         ↓
   Job created (status: pending)
         ↓
   Vercel Cron runs every minute
         ↓
   Finds all pending/processing jobs
         ↓
   Calls /api/jobs/[id]/process for each job
         ↓
   Processes one chunk (3000 items for fuzzy)
         ↓
   Updates job progress in database
         ↓
   Returns (completes in <60s)
         ↓
   Next cron run continues from where it left off
         ↓
   Repeat until job complete
```

## Architecture

### 1. Cron Function
**File:** `/app/api/cron/process-jobs/route.ts`

- Runs every minute (configured in `vercel.json`)
- Queries database for active jobs
- Processes one chunk per job
- Updates job status and progress
- Max execution time: 60 seconds

### 2. Job Processor
**File:** `/app/api/jobs/[id]/process/route.ts`

- Processes a single chunk of items
- Supports fuzzy, AI, and web search matching
- Updates database with results
- Returns immediately after chunk completes
- Can be called by cron OR manually via UI

### 3. UI Component
**File:** `/app/components/BackgroundJobControls.tsx`

- Polls job status every 2 seconds (read-only)
- Displays progress bars and ETAs
- Does NOT trigger processing (cron does that)
- Refreshes project data when jobs complete

## Configuration

### vercel.json
```json
{
  "crons": [
    {
      "path": "/api/cron/process-jobs",
      "schedule": "* * * * *"
    }
  ]
}
```

**Schedule:** `* * * * *` = Every minute

### Environment Variables

**Required:**
- `CRON_SECRET` - Secret token to authenticate cron requests
- `NEXT_PUBLIC_URL` - Base URL for internal API calls

**Set in Vercel Dashboard:**
1. Go to Project Settings → Environment Variables
2. Add `CRON_SECRET` with a random secure string (e.g., `openssl rand -hex 32`)
3. Add to all environments (Production, Preview, Development)

## Job Types & Batch Sizes

| Type | Batch Size | Processing Time | Batches for 13K items |
|------|-----------|----------------|---------------------|
| Fuzzy | 3000 | ~2 min | 5 batches (~10 min total) |
| AI | 100 | ~3 min | 130 batches (~6.5 hours) |
| Web Search | 20 | ~1 min | 650 batches (~11 hours) |

## Security

### Cron Authentication
The cron endpoint checks for `Authorization: Bearer {CRON_SECRET}` header.

### Internal API Calls
The cron function calls `/api/jobs/[id]/process` with `x-internal-call: {CRON_SECRET}` header to bypass user authentication.

## Monitoring

### Logs
Check Vercel logs for cron execution:
```
[CRON] Starting job processor...
[CRON] Found 2 active jobs
[CRON] Processing job abc123 (Fuzzy Matching)
[CRON] Job abc123 chunk complete: 3000/13347 items
[CRON] Processed 2 jobs
```

### Job Status
Query the database:
```sql
SELECT id, status, currentStageName, processedItems, totalItems, progressPercentage
FROM MatchingJob
WHERE status IN ('pending', 'processing')
ORDER BY createdAt DESC;
```

## Advantages Over Polling

| Feature | Old (UI Polling) | New (Vercel Cron) |
|---------|-----------------|-------------------|
| **Reliability** | Stops if browser closes | Continues even if browser closed |
| **Timeouts** | 300s limit per request | 60s per chunk, infinite total |
| **Server Load** | Constant polling (every 2s) | Runs only when needed (every 1 min) |
| **Scalability** | One user at a time | Multiple users/projects |
| **Cost** | High (many API calls) | Low (cron is free) |
| **User Experience** | Must keep page open | Can close and come back |

## Troubleshooting

### Cron Not Running
1. Check `vercel.json` is committed and deployed
2. Verify `CRON_SECRET` is set in Vercel environment variables
3. Check Vercel logs for cron execution

### Jobs Stuck in "Processing"
1. Check if cron is running (Vercel logs)
2. Verify `/api/jobs/[id]/process` endpoint is working
3. Check for errors in job processor logs

### Jobs Completing Too Slowly
1. Increase batch sizes (if not timing out)
2. Optimize matching algorithms
3. Consider using a dedicated worker service

## Future Improvements

1. **Retry Logic** - Automatically retry failed chunks
2. **Priority Queue** - Process high-priority jobs first
3. **Parallel Processing** - Process multiple chunks simultaneously
4. **Progress Notifications** - Email/SMS when jobs complete
5. **Job Scheduling** - Schedule jobs to run at specific times
6. **Rate Limiting** - Limit concurrent jobs per user

## Testing

### Local Testing
Cron functions don't run locally. To test:

1. **Manual trigger:**
   ```bash
   curl -X GET http://localhost:3000/api/cron/process-jobs \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

2. **Simulate cron:**
   ```bash
   while true; do
     curl -X GET http://localhost:3000/api/cron/process-jobs \
       -H "Authorization: Bearer YOUR_CRON_SECRET"
     sleep 60
   done
   ```

### Production Testing
1. Deploy to Vercel
2. Create a test job via UI
3. Check Vercel logs to see cron execution
4. Verify job progresses every minute

## Cost Estimate

**Vercel Cron:** Free (included in all plans)

**Function Invocations:**
- Cron runs: 1,440 times/day (every minute)
- Job processing: Depends on active jobs
- Estimated: 2,000-5,000 invocations/day
- **Cost:** Free (within Vercel limits)

**Database Queries:**
- Job status checks: ~1,500/day
- Job updates: ~500/day
- **Cost:** Minimal (within free tier for most databases)

**Total Monthly Cost:** $0 (for typical usage)
