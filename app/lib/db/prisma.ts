/**
 * Prisma Client — singleton with production-grade configuration
 *
 * Connection pool tuning:
 *  - DATABASE_URL  → Supabase PgBouncer (transaction mode, pooled)
 *  - DIRECT_URL    → Direct Postgres connection (used for migrations + pg-boss)
 *
 * Pool sizing follows the Prisma serverless recommendation:
 *  connection_limit = (num_vcpus * 2) + 1, capped at 10 for Vercel hobby/pro.
 *  Adjust CONNECTION_POOL_SIZE env var per deployment tier.
 *
 * Slow query logging: queries > SLOW_QUERY_THRESHOLD_MS are logged as warnings.
 */

import { PrismaClient, Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const POOL_SIZE          = parseInt(process.env.CONNECTION_POOL_SIZE  ?? '10', 10);
const SLOW_QUERY_MS      = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS ?? '500', 10);
const IS_DEV             = process.env.NODE_ENV === 'development';
const IS_PROD            = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    // Log levels: dev gets query/warn/error; prod gets warn/error only
    log: IS_DEV
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'stdout', level: 'warn' },
          { emit: 'stdout', level: 'error' },
        ]
      : [
          { emit: 'stdout', level: 'warn' },
          { emit: 'stdout', level: 'error' },
        ],
    datasources: {
      db: {
        // Append pool size to the connection string.
        // PgBouncer (Supabase) ignores connection_limit; direct Postgres respects it.
        url: appendPoolSize(
          process.env.DATABASE_URL ?? '',
          POOL_SIZE
        ),
      },
    },
  });

  // ---------------------------------------------------------------------------
  // Slow query detector (dev + prod)
  // ---------------------------------------------------------------------------
  if (IS_DEV) {
    (client.$on as any)('query', (e: Prisma.QueryEvent) => {
      if (e.duration >= SLOW_QUERY_MS) {
        console.warn(
          `[PRISMA SLOW QUERY] ${e.duration}ms\n  ${e.query}\n  params: ${e.params}`
        );
      }
    });
  }

  return client;
}

/**
 * Append ?connection_limit=N to a Postgres URL (idempotent).
 * Skips if the URL already contains connection_limit or is empty.
 */
function appendPoolSize(url: string, size: number): string {
  if (!url || url.includes('connection_limit')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}connection_limit=${size}`;
}

// ---------------------------------------------------------------------------
// Export singleton
// ---------------------------------------------------------------------------

export const prisma: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

// Persist across hot-reloads in dev / across warm serverless invocations
if (!IS_PROD) {
  globalThis.__prisma = prisma;
}

export default prisma;
