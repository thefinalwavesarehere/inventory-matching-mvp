/**
 * Vercel Cron — Background Job Processor (pg-boss edition)
 *
 * Improvements over the previous fire-and-forget HTTP pattern:
 *
 *  1. Durable dispatch — jobs are enqueued into pg-boss (Postgres-backed).
 *     If the Vercel invocation dies mid-flight, the job stays in the queue
 *     and is retried automatically (retryLimit=3, exponential back-off).
 *
 *  2. Deduplication — singletonKey = jobId prevents the same job from being
 *     dispatched twice when cron and QStash fire concurrently.
 *
 *  3. No fire-and-forget fetch() — the cron enqueues; the QStash handler
 *     (/api/queue/dispatch) fetches + processes. Clean separation of concerns.
 *
 *  4. Stale job recovery — jobs stuck in 'processing' for > 10 min are reset
 *     to 'queued' so they are re-dispatched on the next cron tick.
 *
 * Cron schedule: every 1 minute (vercel.json)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';
import { apiLogger } from '@/app/lib/structured-logger';
import { enqueueMatchJob } from '@/app/lib/pg-boss-client';
import { JobStatus } from '@/app/lib/job-queue-manager';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Jobs stuck in 'processing' longer than this are considered stale. */
const STALE_PROCESSING_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    apiLogger.warn('[CRON] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  apiLogger.info('[CRON] Tick');

  try {
    // ------------------------------------------------------------------
    // 1. Recover stale jobs (stuck in 'processing' > 10 min)
    // ------------------------------------------------------------------
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_MS);
    const staleJobs = await prisma.matchingJob.findMany({
      where: {
        status: JobStatus.PROCESSING,
        updatedAt: { lt: staleThreshold },
      },
      select: { id: true, projectId: true },
    });

    if (staleJobs.length > 0) {
      await prisma.matchingJob.updateMany({
        where: { id: { in: staleJobs.map(j => j.id) } },
        data: { status: JobStatus.QUEUED, startedAt: null },
      });
      apiLogger.warn(
        { staleCount: staleJobs.length, ids: staleJobs.map(j => j.id) },
        '[CRON] Reset stale jobs to queued'
      );
    }

    // ------------------------------------------------------------------
    // 2. Enqueue all pending / queued jobs into pg-boss
    //    pg-boss singletonKey ensures no duplicates even if cron fires twice
    // ------------------------------------------------------------------
    const pendingJobs = await prisma.matchingJob.findMany({
      where: {
        status: { in: [JobStatus.QUEUED, 'pending'] },
        cancellationRequested: false,
      },
      orderBy: [{ priority: 'desc' }, { queuedAt: 'asc' }],
      take: 20, // Safety cap per tick
      select: { id: true, projectId: true, userId: true },
    });

    apiLogger.info({ pendingCount: pendingJobs.length }, '[CRON] Pending jobs found');

    const results: { jobId: string; enqueued: boolean; error?: string }[] = [];

    for (const job of pendingJobs) {
      try {
        const pgBossId = await enqueueMatchJob({
          jobId: job.id,
          projectId: job.projectId,
        });
        results.push({ jobId: job.id, enqueued: !!pgBossId });
        apiLogger.info({ jobId: job.id, pgBossId }, '[CRON] Job enqueued');
      } catch (err: any) {
        results.push({ jobId: job.id, enqueued: false, error: err.message });
        apiLogger.error({ jobId: job.id, error: err.message }, '[CRON] Enqueue failed');
      }
    }

    const elapsed = Date.now() - startedAt;
    apiLogger.info({ elapsed, results }, '[CRON] Complete');

    return NextResponse.json({
      success: true,
      elapsed,
      staleRecovered: staleJobs.length,
      enqueued: results.filter(r => r.enqueued).length,
      results,
    });
  } catch (error: any) {
    apiLogger.error({ error: error.message }, '[CRON] Fatal error');
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
