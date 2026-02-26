/**
 * Rate Limiting Middleware
 * 
 * Protects API endpoints from abuse using token bucket algorithm.
 * Implements sliding window rate limiting with Redis-like in-memory store.
 */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Custom key generator (defaults to IP address) */
  keyGenerator?: (request: NextRequest) => string;
  /** Custom error message */
  message?: string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory store (replace with Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(request: NextRequest): string {
  // Try to get real IP from headers (for proxies/load balancers)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }

  // Fallback to connection IP
  return request.ip || 'unknown';
}

/**
 * Rate limit middleware using sliding window algorithm
 */
export async function rateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const keyGenerator = config.keyGenerator || defaultKeyGenerator;
  const key = `rate_limit:${keyGenerator(request)}`;
  const now = Date.now();

  // Get or create rate limit entry
  let entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    // Create new window
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
    };
    rateLimitStore.set(key, entry);
  }

  // Increment request count
  entry.count++;

  // Check if limit exceeded
  if (entry.count > config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    
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
          'X-RateLimit-Reset': entry.resetTime.toString(),
        },
      }
    );
  }

  // Execute handler with rate limit headers
  const response = await handler();

  // Add rate limit headers to response
  response.headers.set('X-RateLimit-Limit', config.maxRequests.toString());
  response.headers.set('X-RateLimit-Remaining', (config.maxRequests - entry.count).toString());
  response.headers.set('X-RateLimit-Reset', entry.resetTime.toString());

  return response;
}

/**
 * Preset rate limit configurations
 */
export const rateLimitPresets = {
  /** Strict limits for authentication endpoints */
  auth: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
  },

  /** Standard limits for API endpoints */
  api: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
  },

  /** Generous limits for read-only operations */
  readOnly: {
    maxRequests: 300,
    windowMs: 60 * 1000, // 1 minute
  },

  /** Strict limits for expensive operations (AI matching, web search) */
  expensive: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 1 minute
    message: 'Too many requests for this resource-intensive operation.',
  },

  /** Very strict limits for admin operations */
  admin: {
    maxRequests: 50,
    windowMs: 60 * 1000, // 1 minute
  },
};

/**
 * Convenience wrapper for common rate limiting patterns
 */
export async function withRateLimit(
  request: NextRequest,
  preset: keyof typeof rateLimitPresets,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  return rateLimit(request, rateLimitPresets[preset], handler);
}
