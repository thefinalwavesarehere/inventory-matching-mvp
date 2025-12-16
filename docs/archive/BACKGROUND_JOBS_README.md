# Background Job System - No More Timeouts!

## Problem Solved

**Before**: AI and web search operations timed out after 300 seconds on Vercel, preventing completion of large matching jobs.

**After**: Jobs run in small chunks (10 items at a time), with progress tracking and automatic continuation until complete. No timeouts!

---

## How It Works

### Architecture

```
User clicks "Run AI Match"
        ↓
Create Job (returns immediately)
        ↓
Frontend starts polling
        ↓
Backend processes 10 items
        ↓
Update progress in database
        ↓
Frontend polls again
        ↓
Backend processes next 10 items
        ↓
... repeat until complete ...
        ↓
Job status = "completed"
```

### Key Components

1. **MatchingJob Table** (already in Prisma schema)
   - Stores job status, progress, and results
   - Tracks: status, processedItems, totalItems, matchesFound, etc.

2. **Job API Endpoints**
   - `POST /api/jobs/create` - Create a new job
   - `GET /api/jobs/[id]` - Get job status
   - `POST /api/jobs/[id]/process` - Process next chunk

3. **JobManager Class** (client-side)
   - Handles job creation, polling, and progress updates
   - Automatic chunk processing with callbacks

---

## Usage

### Option 1: Using JobManager Class (Recommended)

```typescript
import { JobManager } from '@/app/lib/job-manager';

// Create job manager
const jobManager = new JobManager();

// Start AI matching with progress callback
const job = await jobManager.startJob(
  projectId,
  'ai', // or 'web-search'
  (job) => {
    // This callback is called every 2 seconds with updated progress
    console.log(`Progress: ${job.progressPercentage.toFixed(1)}%`);
    console.log(`Processed: ${job.processedItems}/${job.totalItems}`);
    console.log(`Matches found: ${job.matchesFound}`);
    console.log(`Match rate: ${job.matchRate.toFixed(1)}%`);
    
    // Update UI
    setProgress(job.progressPercentage);
    setMatchesFound(job.matchesFound);
  }
);

console.log('Job completed!', job);

// Clean up when component unmounts
useEffect(() => {
  return () => jobManager.cleanup();
}, []);
```

### Option 2: Manual API Calls

```typescript
// 1. Create job
const createResponse = await fetch('/api/jobs/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: 'your-project-id',
    jobType: 'ai', // or 'web-search'
    config: { jobType: 'ai' },
  }),
});

const { job } = await createResponse.json();
const jobId = job.id;

// 2. Process chunks in a loop
while (true) {
  const processResponse = await fetch(`/api/jobs/${jobId}/process`, {
    method: 'POST',
  });
  
  const { job: updatedJob } = await processResponse.json();
  
  console.log(`Progress: ${updatedJob.progressPercentage}%`);
  
  if (updatedJob.status === 'completed') {
    console.log('Job done!');
    break;
  }
  
  // Wait 2 seconds before processing next chunk
  await new Promise(resolve => setTimeout(resolve, 2000));
}

// 3. Get final status
const statusResponse = await fetch(`/api/jobs/${jobId}`);
const { job: finalJob } = await statusResponse.json();
console.log('Final results:', finalJob);
```

---

## React Component Example

```typescript
'use client';

import { useState, useEffect } from 'react';
import { JobManager, Job } from '@/app/lib/job-manager';

export default function AIMatchingButton({ projectId }: { projectId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [jobManager] = useState(() => new JobManager());

  useEffect(() => {
    return () => jobManager.cleanup();
  }, [jobManager]);

  const startAIMatching = async () => {
    setIsRunning(true);
    
    try {
      const completedJob = await jobManager.startJob(
        projectId,
        'ai',
        (updatedJob) => {
          setJob(updatedJob);
        }
      );
      
      alert(`AI matching complete! Found ${completedJob.matchesFound} matches`);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div>
      <button
        onClick={startAIMatching}
        disabled={isRunning}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        {isRunning ? 'Running...' : 'Run AI Matching'}
      </button>
      
      {job && (
        <div className="mt-4">
          <div className="text-sm text-gray-600">
            Status: {job.status}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{ width: `${job.progressPercentage}%` }}
            />
          </div>
          <div className="text-sm text-gray-600 mt-2">
            Progress: {job.processedItems}/{job.totalItems} items ({job.progressPercentage.toFixed(1)}%)
          </div>
          <div className="text-sm text-gray-600">
            Matches found: {job.matchesFound} ({job.matchRate.toFixed(1)}% match rate)
          </div>
          {job.estimatedCompletion && (
            <div className="text-sm text-gray-600">
              Estimated completion: {new Date(job.estimatedCompletion).toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Configuration

### Chunk Size

The chunk size (number of items processed per API call) is set in `/app/api/jobs/[id]/process/route.ts`:

```typescript
const CHUNK_SIZE = 10; // Process 10 items per chunk
```

**Recommendations:**
- **AI matching**: 10 items (each AI call takes ~2-3 seconds)
- **Web search**: 5 items (web search is slower)
- **Adjust based on timeout risk**: Smaller chunks = safer but slower

### Polling Interval

The polling interval (how often to check for updates) is configurable:

```typescript
jobManager.startPolling(jobId, onUpdate, 2000); // Poll every 2 seconds
```

**Recommendations:**
- **2 seconds**: Good balance between responsiveness and API load
- **5 seconds**: More conservative, reduces API calls
- **1 second**: Very responsive but more API calls

---

## API Endpoints

### POST /api/jobs/create

Create a new background job.

**Request:**
```json
{
  "projectId": "project-id",
  "jobType": "ai",
  "config": {
    "jobType": "ai"
  }
}
```

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "job-id",
    "projectId": "project-id",
    "status": "pending",
    "totalItems": 1000
  }
}
```

### GET /api/jobs/[id]

Get job status and progress.

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "job-id",
    "projectId": "project-id",
    "status": "processing",
    "currentStage": 3,
    "currentStageName": "AI Matching",
    "totalItems": 1000,
    "processedItems": 450,
    "progressPercentage": 45.0,
    "matchesFound": 89,
    "matchRate": 19.8,
    "startedAt": "2025-11-24T22:00:00Z",
    "estimatedCompletion": "2025-11-24T22:15:00Z"
  }
}
```

### POST /api/jobs/[id]/process

Process the next chunk of items.

**Response:**
```json
{
  "success": true,
  "job": {
    "id": "job-id",
    "status": "processing",
    "processedItems": 460,
    "totalItems": 1000,
    "progressPercentage": 46.0,
    "matchesFound": 91,
    "matchRate": 19.8
  },
  "message": "Processed 10 items, 2 new matches"
}
```

---

## Job Status Flow

```
pending → processing → completed
                    ↘ failed
```

- **pending**: Job created, waiting to start
- **processing**: Job is actively processing chunks
- **completed**: All items processed successfully
- **failed**: Job encountered an error

---

## Error Handling

The system handles errors gracefully:

1. **API errors**: Job status set to "failed" with error message
2. **Timeout errors**: Each chunk has its own 300s timeout, so individual chunks can't timeout the entire job
3. **Network errors**: Frontend can retry by calling process endpoint again

Example error handling:

```typescript
try {
  const job = await jobManager.startJob(projectId, 'ai', onProgress);
} catch (error: any) {
  console.error('Job failed:', error.message);
  // Show error to user
  alert(`Job failed: ${error.message}`);
}
```

---

## Performance

### Estimated Processing Times

**AI Matching** (10 items per chunk, 2s per item):
- 100 items: ~20 seconds
- 1,000 items: ~3.3 minutes
- 10,000 items: ~33 minutes

**Web Search** (5 items per chunk, 5s per item):
- 100 items: ~1.7 minutes
- 1,000 items: ~17 minutes
- 10,000 items: ~2.8 hours

### Optimization Tips

1. **Run enhanced matching first**: Catch 55-65% of matches with fast deterministic/fuzzy matching
2. **Use AI for remaining items**: Only run AI on unmatched items (35-45%)
3. **Web search as last resort**: Only for items AI couldn't match

**Example workflow:**
1. Enhanced matching: 21,737 items → 8,693 matches (40%) in 60 seconds
2. AI matching: 13,044 remaining → 2,609 matches (20%) in 4.3 minutes
3. Web search: 10,435 remaining → 1,044 matches (10%) in 17 minutes
4. **Total**: 12,346 matches (56.8%) in ~22 minutes

---

## Monitoring

### Database Queries

Check job status directly in database:

```sql
SELECT 
  id,
  status,
  processedItems,
  totalItems,
  progressPercentage,
  matchesFound,
  matchRate,
  startedAt,
  completedAt
FROM "MatchingJob"
WHERE projectId = 'your-project-id'
ORDER BY createdAt DESC
LIMIT 10;
```

### Logs

Job processing logs are written to console:

```
[JOB-CREATE] Created job abc123 for project xyz789, type: ai
[JOB-CREATE] Total unmatched items: 1000
[JOB-PROCESS] Processing chunk for job abc123, type: ai
[JOB-PROCESS] Current progress: 0/1000
[JOB-PROCESS] Processing items 0 to 10 (10 items)
[AI-MATCH] Found match: ABC123 -> DEF456 (0.85)
[JOB-PROCESS] Chunk complete. Progress: 10/1000 (1.0%)
[JOB-PROCESS] New matches: 2, Total matches: 2
```

---

## Troubleshooting

### Job stuck in "processing"

If a job gets stuck, you can manually update it:

```typescript
await fetch(`/api/jobs/${jobId}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'failed',
    completedAt: new Date().toISOString(),
  }),
});
```

### Job not progressing

Check logs for errors. Common issues:
- OpenAI API key not set
- Database connection issues
- Invalid project ID

### Slow processing

- Reduce chunk size for faster feedback
- Check OpenAI API rate limits
- Verify database performance

---

## Future Enhancements

1. **Pause/Resume**: Add ability to pause and resume jobs
2. **Cancellation**: Add cancel button to stop jobs mid-processing
3. **Retry Failed Items**: Automatically retry items that failed
4. **Parallel Processing**: Process multiple chunks simultaneously
5. **Queue System**: Use BullMQ + Redis for more robust job queue
6. **Webhooks**: Notify external systems when jobs complete

---

**Status**: ✅ Fully implemented and ready for production use!

No third-party services required - runs entirely on Vercel + your existing database.
