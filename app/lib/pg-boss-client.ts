/**
 * pg-boss — Postgres-native durable job queue
 * https://github.com/timgit/pg-boss  (⭐ 4.6k)
 *
 * Why pg-boss over pure QStash/cron:
 *  - Jobs are stored in Postgres → survives serverless cold starts, no message loss
 *  - Built-in deduplication (singletonKey) prevents duplicate processing
 *  - Automatic retry with exponential back-off
 *  - Dead-letter queue for failed jobs
 *  - No extra infrastructure — reuses the existing Postgres connection
 *
 * Usage pattern (serverless-safe):
 *   const boss = await getBoss();
 *   await boss.send('match-job', { jobId }, { singletonKey: jobId });
 *
 * Workers run inside the cron endpoint or QStash handler:
 *   const boss = await getBoss();
 *   const job = await boss.fetch('match-job');
 *   if (job) { await processJob(job.data); await boss.complete(job.id); }
 */

import PgBoss from 'pg-boss';

// ---------------------------------------------------------------------------
// Singleton — reuse across warm invocations in the same process
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __pgBoss: PgBoss | undefined;
}

let bossReady: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  // Return existing singleton if already started
  if (globalThis.__pgBoss) return globalThis.__pgBoss;
  if (bossReady) return bossReady;

  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('[PG-BOSS] DATABASE_URL / DIRECT_URL env var not set');
  }

  bossReady = (async () => {
    const boss = new PgBoss({
      connectionString,
      // Schema isolation — keeps pg-boss tables out of public schema
      schema: 'pgboss',
      // Retry policy
      retryLimit: 3,
      retryDelay: 30,       // seconds
      retryBackoff: true,   // exponential back-off
      // Expiry — jobs not started within 10 min are considered expired
      expireInSeconds: 600,
      // Dead-letter: failed jobs move to DLQ after retryLimit exhausted
      onComplete: true,
      // Maintenance — run cleanup every 60s (safe in serverless: no-op if already running)
      maintenanceIntervalSeconds: 60,
      // Monitoring interval
      monitorStateIntervalSeconds: 30,
      // Max connections used by pg-boss (separate from app pool)
      max: 2,
      // Prevent pg-boss from keeping the process alive (serverless-safe)
      noSupervisor: true,
    });

    boss.on('error', (err) => {
      console.error('[PG-BOSS] Error:', err.message);
    });

    await boss.start();
    globalThis.__pgBoss = boss;
    return boss;
  })();

  return bossReady;
}

// ---------------------------------------------------------------------------
// Queue names — centralised to avoid typos
// ---------------------------------------------------------------------------

export const QUEUES = {
  MATCH_JOB:    'match-job',
  MATCH_STAGE:  'match-stage',
  EMBED_JOB:    'embed-job',
} as const;

export type QueueName = typeof QUEUES[keyof typeof QUEUES];

// ---------------------------------------------------------------------------
// Typed send helpers
// ---------------------------------------------------------------------------

export interface MatchJobPayload {
  jobId: string;
  projectId: string;
  jobType?: string;
}

/**
 * Enqueue a matching job with deduplication.
 * If a job with the same jobId is already queued/processing, this is a no-op.
 */
export async function enqueueMatchJob(payload: MatchJobPayload): Promise<string | null> {
  const boss = await getBoss();
  const id = await boss.send(QUEUES.MATCH_JOB, payload, {
    // Deduplication: only one job per jobId in the queue at a time
    singletonKey: payload.jobId,
    // Priority: higher = processed first (0 = default)
    priority: 0,
    // Retry config (overrides global defaults if needed)
    retryLimit: 3,
    retryBackoff: true,
  });
  return id;
}

/**
 * Fetch and lock the next available matching job (for cron/worker use).
 * Returns null if queue is empty.
 */
export async function fetchNextMatchJob(): Promise<PgBoss.Job<MatchJobPayload> | null> {
  const boss = await getBoss();
  return boss.fetch<MatchJobPayload>(QUEUES.MATCH_JOB);
}

/**
 * Mark a job as complete.
 */
export async function completeMatchJob(jobId: string): Promise<void> {
  const boss = await getBoss();
  await boss.complete(jobId);
}

/**
 * Mark a job as failed (will be retried up to retryLimit).
 */
export async function failMatchJob(jobId: string, error: Error): Promise<void> {
  const boss = await getBoss();
  await boss.fail(jobId, error);
}
