/**
 * Vercel Cron — Background Job Processor
 *
 * Architecture decision (simplified from pg-boss dual-dispatch):
 *
 * The cron directly calls /api/jobs/[id]/process for each active job.
 * This is more reliable than the pg-boss → QStash → dispatch chain because:
 *
 *  1. Fewer moving parts — no QStash signature verification, no pg-boss fetch race
 *  2. Direct HTTP with x-internal-call secret — same auth as before our refactor
 *  3. The process route is idempotent and has its own atomic lock (updateMany WHERE status)
 *  4. Stale job recovery resets stuck 'processing' jobs back to 'queued'
 *  5. 'pending' status (used by fuzzy/AI matchers for multi-batch jobs) is also picked up
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
      take: 10, // Safety cap per tick — each job may take up to 60s
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
    // 3. Directly trigger /api/jobs/[id]/process for each active job
    //    Uses x-internal-call secret — bypasses session auth in the handler
    // ------------------------------------------------------------------
    const baseUrl = process.env.NEXT_PUBLIC_URL ||
      `https://${req.headers.get('host')}`;
    const cronSecret = process.env.CRON_SECRET || '';

    const results = await Promise.allSettled(
      activeJobs.map(async (job) => {
        const url = `${baseUrl}/api/jobs/${job.id}/process`;
        apiLogger.info({ jobId: job.id, status: job.status, url }, '[CRON] Triggering process');

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-call': cronSecret,
          },
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        }

        const data = await res.json();
        apiLogger.info({ jobId: job.id, status: data?.job?.status }, '[CRON] Process response');
        return { jobId: job.id, triggered: true, status: data?.job?.status };
      })
    );

    const summary = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      apiLogger.error(
        { jobId: activeJobs[i].id, error: r.reason?.message },
        '[CRON] Process trigger failed'
      );
      return { jobId: activeJobs[i].id, triggered: false, error: r.reason?.message };
    });

    const elapsed = Date.now() - startedAt;
    apiLogger.info({ elapsed, summary }, '[CRON] Complete');

    return NextResponse.json({
      success: true,
      elapsed,
      staleRecovered: staleJobs.length,
      triggered: summary.filter(r => r.triggered).length,
      results: summary,
    });
  } catch (error: any) {
    apiLogger.error({ error: error.message }, '[CRON] Fatal error');
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
