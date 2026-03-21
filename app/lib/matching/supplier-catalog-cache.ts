/**
 * Supplier Catalog Cache — v2.0
 *
 * Tiered caching strategy:
 *   L1: In-process Map (per Vercel invocation, ~0ms)
 *   L2: Upstash Redis (survives cold starts, shared across instances, ~5ms)
 *   L3: Postgres (source of truth, ~200–500ms for large catalogs)
 *
 * TTL: 1 hour (Redis), 5 minutes (in-process)
 */
import prisma from '@/app/lib/db/prisma';
import { redis } from '@/app/lib/redis';
import { apiLogger } from '@/app/lib/structured-logger';

interface SupplierItem {
  id: string;
  partNumber: string;
  lineCode: string | null;
  description: string | null;
  currentCost: any;
}

interface L1Entry {
  data: SupplierItem[];
  expiresAt: number;
}

const L1: Map<string, L1Entry> = new Map();
const L1_TTL_MS = 5 * 60 * 1000;
const REDIS_TTL_SEC = 3600;

function redisKey(projectId: string): string {
  return `catalog:v2:${projectId}`;
}

export async function getSupplierCatalog(projectId: string): Promise<SupplierItem[]> {
  const now = Date.now();

  // L1 hit
  const l1 = L1.get(projectId);
  if (l1 && l1.expiresAt > now) {
    apiLogger.info(`[CACHE] L1 HIT project=${projectId} items=${l1.data.length}`);
    return l1.data;
  }

  // L2 Redis hit
  if (redis) {
    try {
      const cached = await redis.get<SupplierItem[]>(redisKey(projectId));
      if (cached && Array.isArray(cached)) {
        apiLogger.info(`[CACHE] Redis HIT project=${projectId} items=${cached.length}`);
        L1.set(projectId, { data: cached, expiresAt: now + L1_TTL_MS });
        return cached;
      }
    } catch (err: any) {
      apiLogger.warn('[CACHE] Redis GET error (falling back to DB):', err.message);
    }
  }

  // L3 Postgres
  apiLogger.info(`[CACHE] DB fetch project=${projectId}`);
  const suppliers = await prisma.supplierItem.findMany({
    where: { projectId },
    select: { id: true, partNumber: true, lineCode: true, description: true, currentCost: true },
    orderBy: { partNumber: 'asc' },
    take: 500_000, // Safety cap — catalogs >500k items should be streamed, not cached
  });

  apiLogger.info(`[CACHE] Fetched ${suppliers.length} suppliers from DB`);

  L1.set(projectId, { data: suppliers, expiresAt: now + L1_TTL_MS });

  if (redis) {
    redis
      .set(redisKey(projectId), suppliers, { ex: REDIS_TTL_SEC })
      .then(() => apiLogger.info(`[CACHE] Redis SET project=${projectId}`))
      .catch((err: any) => apiLogger.warn('[CACHE] Redis SET error:', err.message));
  }

  return suppliers;
}

export async function invalidateCache(projectId: string): Promise<void> {
  L1.delete(projectId);
  if (redis) {
    try {
      await redis.del(redisKey(projectId));
    } catch (err: any) {
      apiLogger.warn('[CACHE] Redis DEL error:', err.message);
    }
  }
  apiLogger.info(`[CACHE] Invalidated project=${projectId}`);
}

export function clearAllCache(): void {
  L1.clear();
  apiLogger.info('[CACHE] L1 cleared');
}

export function getCacheStats() {
  return {
    l1Entries: L1.size,
    redisAvailable: !!redis,
    projects: Array.from(L1.keys()),
  };
}
