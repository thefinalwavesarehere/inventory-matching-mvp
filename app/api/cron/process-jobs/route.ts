/**
 * Vercel Cron — Background Job Processor
 *
 * Architecture: FIRE-AND-FORGET
 *
 * The cron finds active jobs and fires POST /api/jobs/[id]/process for each,
 * but does NOT await the response. The process endpoint:
 *   - Has its own atomic lock (updateMany WHERE status IN queued|pending)
 *   - Is idempotent — safe to call multiple times
 *   - Self-chains via triggerNextBatch() for multi-batch jobs
 *   - Takes up to 90s per AI batch — far exceeding the cron's 60s limit
 *
 * By not awaiting, the cron returns 200 in <500ms and never hits the 60s timeout.
 * The process function runs to completion in its own serverless invocation.
 *
 * Cron schedule: every 1 minute (vercel.json)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';
import { apiLogger } from '@/app/lib/structured-logger';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Jobs stuck in 'processing' longer than this are considered stale. */
const STALE_PROCESSING_MS = 10 * 60 * 1000; // 10 minutes

/** Statuses that mean "this job needs to be processed". */
const ACTIVE_STATUSES = ['queued', 'pending', 'processing'];

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
    // 1. Recover stale jobs (stuck in 'processing' > 10 min with no update)
    // ------------------------------------------------------------------
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_MS);
    const staleJobs = await prisma.matchingJob.findMany({
      where: {
        status: 'processing',
        updatedAt: { lt: staleThreshold },
      },
      select: { id: true, projectId: true },
    });

    if (staleJobs.length > 0) {
      await prisma.matchingJob.updateMany({
        where: { id: { in: staleJobs.map(j => j.id) } },
        data: { status: 'queued', startedAt: null },
      });
      apiLogger.warn(
        { staleCount: staleJobs.length, ids: staleJobs.map(j => j.id) },
        '[CRON] Reset stale jobs to queued'
      );
    }

    // ------------------------------------------------------------------
    // 2. Find all jobs that need processing
    //    - 'queued'     : newly created, not yet started
    //    - 'pending'    : mid-flight multi-batch job (fuzzy/AI), needs next batch
    //    - 'processing' : just recovered from stale (rare, but safe to re-trigger)
    // ------------------------------------------------------------------
    const activeJobs = await prisma.matchingJob.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        cancellationRequested: false,
      },
      orderBy: [{ priority: 'desc' }, { queuedAt: 'asc' }],
      take: 10,
      select: { id: true, projectId: true, status: true },
    });

    apiLogger.info({ activeCount: activeJobs.length }, '[CRON] Active jobs found');

    if (activeJobs.length === 0) {
      return NextResponse.json({
        success: true,
        elapsed: Date.now() - startedAt,
        staleRecovered: staleJobs.length,
        triggered: 0,
        results: [],
      });
    }

    // ------------------------------------------------------------------
    // 3. FIRE-AND-FORGET: trigger /api/jobs/[id]/process for each job
    //
    //    CRITICAL: Do NOT await the fetch. AI batches take ~76s which
    //    exceeds Vercel's 60s cron limit and causes a 504 that kills the
    //    cron before it can return. The process endpoint is idempotent
    //    with its own atomic lock — safe to trigger without waiting.
    // ------------------------------------------------------------------
    const baseUrl = process.env.NEXT_PUBLIC_URL ||
      `https://${req.headers.get('host')}`;
    const cronSecret = process.env.CRON_SECRET || '';

    const triggered: string[] = [];

    for (const job of activeJobs) {
      const url = `${baseUrl}/api/jobs/${job.id}/process`;
      apiLogger.info({ jobId: job.id, status: job.status, url }, '[CRON] Triggering process (fire-and-forget)');

      // Fire-and-forget — intentionally no await
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-call': cronSecret,
        },
      }).catch((err: Error) => {
        apiLogger.error({ jobId: job.id, error: err.message }, '[CRON] Fire-and-forget fetch error');
      });

      triggered.push(job.id);
    }

    const elapsed = Date.now() - startedAt;
    apiLogger.info({ elapsed, triggered }, '[CRON] Complete — all jobs triggered');

    return NextResponse.json({
      success: true,
      elapsed,
      staleRecovered: staleJobs.length,
      triggered: triggered.length,
      results: triggered.map(id => ({ jobId: id, triggered: true })),
    });
  } catch (error: any) {
    apiLogger.error({ error: error.message }, '[CRON] Fatal error');
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
