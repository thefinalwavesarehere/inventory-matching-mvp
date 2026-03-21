/**
 * QStash Webhook — Job Dispatcher (pg-boss edition)
 * POST /api/queue/dispatch
 *
 * Receives a QStash message carrying a jobId, fetches the next pg-boss job
 * for that jobId, and calls /api/jobs/[id]/process synchronously.
 *
 * Why synchronous (not fire-and-forget):
 *  - QStash retries on non-2xx. If we return 200 immediately and the process
 *    call fails silently, the job is lost. Awaiting the call means QStash
 *    will retry the whole dispatch if the process endpoint returns 5xx.
 *  - Vercel maxDuration = 300s (Pro) gives plenty of headroom.
 *
 * Security: QStash signs all requests — we verify the signature before processing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { qstashReceiver } from '@/app/lib/qstash';
import { apiLogger } from '@/app/lib/structured-logger';
import { fetchNextMatchJob, completeMatchJob, failMatchJob } from '@/app/lib/pg-boss-client';

export const maxDuration = 300; // Vercel Pro max; hobby = 60
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // ── Signature verification ──────────────────────────────────────────────
  if (qstashReceiver) {
    const signature = req.headers.get('upstash-signature') ?? '';
    const body = await req.text();

    try {
      const isValid = await qstashReceiver.verify({ signature, body });
      if (!isValid) {
        apiLogger.warn('[QUEUE/DISPATCH] Invalid QStash signature');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const payload = JSON.parse(body) as { jobId?: string };
      return await dispatchJob(payload.jobId, req);
    } catch (err: any) {
      apiLogger.error({ error: err.message }, '[QUEUE/DISPATCH] Signature verification error');
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
    }
  }

  // ── Fallback: dev / internal calls ───────────────────────────────────────
  const internalKey = req.headers.get('x-internal-call');
  if (internalKey !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const payload = (await req.json()) as { jobId?: string };
  return await dispatchJob(payload.jobId, req);
}

async function dispatchJob(jobId: string | undefined, req: NextRequest): Promise<NextResponse> {
  if (!jobId) {
    return NextResponse.json({ error: 'jobId required' }, { status: 400 });
  }

  // Fetch the pg-boss job (locks it — prevents concurrent processing)
  const pgJob = await fetchNextMatchJob();
  if (!pgJob) {
    // Job may have already been processed by another worker — idempotent OK
    apiLogger.info({ jobId }, '[QUEUE/DISPATCH] No pg-boss job found (already processed or expired)');
    return NextResponse.json({ success: true, jobId, status: 'already_processed' });
  }

  const targetJobId = pgJob.data?.jobId ?? jobId;
  const baseUrl = process.env.NEXT_PUBLIC_URL || `https://${req.headers.get('host')}`;
  const processUrl = `${baseUrl}/api/jobs/${targetJobId}/process`;

  apiLogger.info({ jobId: targetJobId, pgBossJobId: pgJob.id }, '[QUEUE/DISPATCH] Processing');

  try {
    // Synchronous call — QStash will retry on 5xx
    const res = await fetch(processUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-call': process.env.CRON_SECRET || 'internal',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Process endpoint returned ${res.status}: ${text}`);
    }

    await completeMatchJob(pgJob.id);
    apiLogger.info({ jobId: targetJobId }, '[QUEUE/DISPATCH] Complete');
    return NextResponse.json({ success: true, jobId: targetJobId });
  } catch (err: any) {
    await failMatchJob(pgJob.id, err);
    apiLogger.error({ jobId: targetJobId, error: err.message }, '[QUEUE/DISPATCH] Failed — pg-boss will retry');
    // Return 500 so QStash also retries at the message level
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
