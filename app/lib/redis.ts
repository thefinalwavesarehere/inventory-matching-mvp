/**
 * Upstash Redis client (serverless-safe HTTP transport)
 * Uses v2_storage_KV_REST_API_URL / v2_storage_KV_REST_API_TOKEN env vars
 */
import { Redis } from '@upstash/redis';

// Vercel KV uses these variable names
const url = process.env.v2_storage_KV_REST_API_URL;
const token = process.env.v2_storage_KV_REST_API_TOKEN;

if (!url || !token) {
  console.warn('[REDIS] v2_storage_KV_REST_API_URL or v2_storage_KV_REST_API_TOKEN not set — Redis disabled');
}

export const redis: Redis | null =
  url && token
    ? new Redis({ url, token })
    : null;

export const REDIS_AVAILABLE = !!redis;
