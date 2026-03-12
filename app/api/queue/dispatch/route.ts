/**
 * QStash Webhook — Job Dispatcher
 * POST /api/queue/dispatch
 *
 * Receives QStash messages and immediately triggers the job process endpoint.
 * This eliminates the up-to-60s cron polling delay for new jobs.
 *
 * Security: QStash signs all requests — we verify the signature before processing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { qstashReceiver } from '@/app/lib/qstash';
import { apiLogger } from '@/app/lib/structured-logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // ── Signature verification ──────────────────────────────────────────────
  if (qstashReceiver) {
    const signature = req.headers.get('upstash-signature') ?? '';
    const body = await req.text();

    try {
      const isValid = await qstashReceiver.verify({
        signature,
        body,
      });
      if (!isValid) {
        apiLogger.warn('[QUEUE/DISPATCH] Invalid QStash signature');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // Parse body after verification
      const payload = JSON.parse(body) as { jobId?: string };
      return await dispatchJob(payload.jobId, req);
    } catch (err: any) {
      apiLogger.error('[QUEUE/DISPATCH] Signature verification error:', err.message);
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
    }
  }

  // ── Fallback: no receiver configured (dev/local) ─────────────────────────
  // Accept internal calls with CRON_SECRET header
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

  const baseUrl = process.env.NEXT_PUBLIC_URL || `https://${req.headers.get('host')}`;
  const processUrl = `${baseUrl}/api/jobs/${jobId}/process`;

  apiLogger.info(`[QUEUE/DISPATCH] Dispatching job=${jobId} → ${processUrl}`);

  // Fire-and-forget: trigger the process endpoint
  fetch(processUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-call': process.env.CRON_SECRET || 'internal',
    },
  }).catch((err: any) => {
    apiLogger.error(`[QUEUE/DISPATCH] Dispatch failed for job=${jobId}: ${err.message}`);
  });

  return NextResponse.json({ success: true, jobId, dispatched: true });
}
