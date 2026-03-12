/**
 * Upstash QStash client
 * Used to enqueue job dispatch messages for immediate processing
 * (eliminates the 60s cron polling delay)
 */
import { Client, Receiver } from '@upstash/qstash';

const token = process.env.qstash_QSTASH_TOKEN;

if (!token) {
  console.warn('[QSTASH] qstash_QSTASH_TOKEN not set — QStash disabled, falling back to cron');
}

export const qstash: Client | null = token ? new Client({ token }) : null;

export const qstashReceiver: Receiver | null =
  process.env.qstash_QSTASH_CURRENT_SIGNING_KEY && process.env.qstash_QSTASH_NEXT_SIGNING_KEY
    ? new Receiver({
        currentSigningKey: process.env.qstash_QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: process.env.qstash_QSTASH_NEXT_SIGNING_KEY,
      })
    : null;

export const QSTASH_AVAILABLE = !!qstash;

/**
 * Enqueue a job dispatch message via QStash.
 * The target endpoint /api/queue/dispatch will call /api/jobs/[id]/process.
 * Falls back silently if QStash is unavailable (cron will pick it up).
 */
export async function enqueueJobDispatch(jobId: string): Promise<void> {
  if (!qstash) return;

  const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://inventory-matching-mvp.vercel.app';
  const url = `${baseUrl}/api/queue/dispatch`;

  try {
    await qstash.publishJSON({
      url,
      body: { jobId },
      retries: 3,
      delay: 0,
    });
    console.log(`[QSTASH] Enqueued dispatch for job=${jobId}`);
  } catch (err: any) {
    // Non-fatal: cron will pick it up within 60s
    console.warn(`[QSTASH] Enqueue failed for job=${jobId}: ${err.message}`);
  }
}
