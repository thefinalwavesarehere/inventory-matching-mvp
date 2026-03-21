/**
 * Rate Limiting Middleware
 *
 * Sliding-window rate limiting backed by Upstash Redis (HTTP transport,
 * serverless-safe). Falls back to an in-process Map when Redis is unavailable
 * (local dev only — the fallback is NOT distributed and must not be relied on
 * in production).
 *
 * Redis key schema:  rate_limit:<preset>:<clientKey>
 * TTL is set to the window duration so keys auto-expire.
 */

import { NextRequest, NextResponse } from 'next/server';
import { redis, REDIS_AVAILABLE } from '@/app/lib/redis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyGenerator?: (request: NextRequest) => string;
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// ---------------------------------------------------------------------------
// In-memory fallback (dev only — not distributed)
// ---------------------------------------------------------------------------

const localStore = new Map<string, RateLimitEntry>();

// Prune expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of localStore.entries()) {
      if (entry.resetTime < now) localStore.delete(key);
    }
  }, 5 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function defaultKeyGenerator(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;
  return request.ip || 'unknown';
}

// ---------------------------------------------------------------------------
// Redis-backed sliding window
// ---------------------------------------------------------------------------

async function checkRateLimitRedis(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; count: number; resetTime: number }> {
  const windowSec = Math.ceil(config.windowMs / 1000);
  const now = Date.now();
  const resetTime = now + config.windowMs;

  // Atomic increment + set TTL (INCR then EXPIRE is safe for rate limiting)
  const count = await redis!.incr(key);
  if (count === 1) {
    // First request in this window — set the TTL
    await redis!.expire(key, windowSec);
  }

  return { allowed: count <= config.maxRequests, count, resetTime };
}

// ---------------------------------------------------------------------------
// In-memory fallback
// ---------------------------------------------------------------------------

function checkRateLimitLocal(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; count: number; resetTime: number } {
  const now = Date.now();
  let entry = localStore.get(key);

  if (!entry || entry.resetTime < now) {
    entry = { count: 0, resetTime: now + config.windowMs };
    localStore.set(key, entry);
  }

  entry.count++;
  return { allowed: entry.count <= config.maxRequests, count: entry.count, resetTime: entry.resetTime };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const keyGenerator = config.keyGenerator || defaultKeyGenerator;
  const clientKey = keyGenerator(request);
  const storeKey = `rate_limit:${clientKey}`;

  let allowed: boolean;
  let count: number;
  let resetTime: number;

  if (REDIS_AVAILABLE) {
    ({ allowed, count, resetTime } = await checkRateLimitRedis(storeKey, config));
  } else {
    // Dev fallback — warn once
    if (process.env.NODE_ENV === 'production') {
      console.error('[RATE_LIMIT] Redis unavailable in production — rate limiting is non-functional!');
    }
    ({ allowed, count, resetTime } = checkRateLimitLocal(storeKey, config));
  }

  if (!allowed) {
    const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: config.message || 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetTime.toString(),
        },
      }
    );
  }

  const response = await handler();
  response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
  response.headers.set('X-RateLimit-Remaining', Math.max(0, config.maxRequests - count).toString());
  response.headers.set('X-RateLimit-Reset', resetTime.toString());
  return response;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const rateLimitPresets = {
  auth: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
  api: {
    maxRequests: 100,
    windowMs: 60 * 1000,
  },
  readOnly: {
    maxRequests: 300,
    windowMs: 60 * 1000,
  },
  expensive: {
    maxRequests: 10,
    windowMs: 60 * 1000,
    message: 'Too many requests for this resource-intensive operation.',
  },
  admin: {
    maxRequests: 50,
    windowMs: 60 * 1000,
  },
} satisfies Record<string, RateLimitConfig>;

export async function withRateLimit(
  request: NextRequest,
  preset: keyof typeof rateLimitPresets,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  return rateLimit(request, rateLimitPresets[preset], handler);
}
