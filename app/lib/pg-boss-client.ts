/**
 * pg-boss v10 — Postgres-native durable job queue
 * https://github.com/timgit/pg-boss
 *
 * Pinned to v10.x (LTS maintenance branch) — v12 uses import assertions
 * that are incompatible with Next.js 13 webpack bundler.
 *
 * v10 API differences from v12:
 *  - fetch() returns Job<T>[] (array), not Job<T> | null
 *  - complete(name, id) and fail(name, id) require queue name as first arg
 *  - onComplete removed → use deadLetter instead
 *  - noSupervisor removed → use supervise: false
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
  if (globalThis.__pgBoss) return globalThis.__pgBoss;
  if (bossReady) return bossReady;

  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('[PG-BOSS] DATABASE_URL / DIRECT_URL env var not set');
  }

  bossReady = (async () => {
    const boss = new PgBoss({
      connectionString,
      schema: 'pgboss',
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 600,
      maintenanceIntervalSeconds: 60,
      supervise: false,
    });

    boss.on('error', (err: Error) => {
      console.error('[PG-BOSS] Error:', err.message);
    });

    await boss.start();
    globalThis.__pgBoss = boss;
    return boss;
  })();

  return bossReady;
}

// ---------------------------------------------------------------------------
// Queue names
// ---------------------------------------------------------------------------

export const QUEUES = {
  MATCH_JOB:    'match-job',
  MATCH_STAGE:  'match-stage',
  EMBED_JOB:    'embed-job',
} as const;

export type QueueName = typeof QUEUES[keyof typeof QUEUES];

// ---------------------------------------------------------------------------
// Typed helpers
// ---------------------------------------------------------------------------

export interface MatchJobPayload {
  jobId: string;
  projectId: string;
  jobType?: string;
}

/**
 * Enqueue a matching job with deduplication.
 * singletonKey ensures only one job per jobId is queued at a time.
 */
export async function enqueueMatchJob(payload: MatchJobPayload): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(QUEUES.MATCH_JOB, payload, {
    singletonKey: payload.jobId,
    priority: 0,
    retryLimit: 3,
    retryBackoff: true,
  });
}

/**
 * Fetch and lock the next available matching job.
 * Returns null if queue is empty.
 * v10: fetch() returns Job<T>[] — we take the first item.
 */
export async function fetchNextMatchJob(): Promise<PgBoss.Job<MatchJobPayload> | null> {
  const boss = await getBoss();
  const jobs = await boss.fetch<MatchJobPayload>(QUEUES.MATCH_JOB, { batchSize: 1 });
  return jobs?.[0] ?? null;
}

/**
 * Mark a job as complete.
 * v10: complete(queueName, jobId)
 */
export async function completeMatchJob(jobId: string): Promise<void> {
  const boss = await getBoss();
  await boss.complete(QUEUES.MATCH_JOB, jobId);
}

/**
 * Mark a job as failed (will be retried up to retryLimit).
 * v10: fail(queueName, jobId, errorData)
 */
export async function failMatchJob(jobId: string, error: Error): Promise<void> {
  const boss = await getBoss();
  await boss.fail(QUEUES.MATCH_JOB, jobId, { message: error.message, stack: error.stack });
}
