/**
 * Rate Limiter Utility for OpenAI API Calls
 * 
 * OpenAI Rate Limits (as of 2024):
 * - GPT-4: 10,000 TPM (tokens per minute), 500 RPM (requests per minute)
 * - GPT-4.1: Similar limits
 * 
 * This utility helps respect rate limits by:
 * 1. Adding delays between requests
 * 2. Tracking request counts
 * 3. Implementing exponential backoff on errors
 */

interface RateLimiterConfig {
  requestsPerMinute: number;
  requestsPerSecond?: number;
  minDelayMs?: number;
  maxRetries?: number;
}

interface RequestTracker {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private config: Required<RateLimiterConfig>;
  private tracker: RequestTracker;
  private queue: Array<() => void> = [];
  private processing = false;

  constructor(config: RateLimiterConfig) {
    this.config = {
      requestsPerMinute: config.requestsPerMinute,
      requestsPerSecond: config.requestsPerSecond || Math.floor(config.requestsPerMinute / 60),
      minDelayMs: config.minDelayMs || 100,
      maxRetries: config.maxRetries || 3,
    };

    this.tracker = {
      count: 0,
      resetTime: Date.now() + 60000,
    };
  }

  /**
   * Wait for the appropriate delay based on rate limits
   */
  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Reset counter if minute has passed
    if (now >= this.tracker.resetTime) {
      this.tracker.count = 0;
      this.tracker.resetTime = now + 60000;
    }

    // Check if we've hit the per-minute limit
    if (this.tracker.count >= this.config.requestsPerMinute) {
      const waitTime = this.tracker.resetTime - now;
      console.log(`Rate limit reached. Waiting ${waitTime}ms...`);
      await this.delay(waitTime);
      this.tracker.count = 0;
      this.tracker.resetTime = Date.now() + 60000;
    }

    // Calculate delay based on requests per second
    const delayMs = Math.max(
      this.config.minDelayMs,
      1000 / this.config.requestsPerSecond
    );

    await this.delay(delayMs);
    this.tracker.count++;
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>, retries = 0): Promise<T> {
    await this.waitForSlot();

    try {
      return await fn();
    } catch (error: any) {
      // Check if it's a rate limit error
      if (this.isRateLimitError(error) && retries < this.config.maxRetries) {
        const backoffDelay = Math.min(1000 * Math.pow(2, retries), 30000); // Exponential backoff, max 30s
        console.log(`Rate limit error. Retrying in ${backoffDelay}ms... (attempt ${retries + 1}/${this.config.maxRetries})`);
        await this.delay(backoffDelay);
        return this.execute(fn, retries + 1);
      }
      throw error;
    }
  }

  /**
   * Execute multiple functions in sequence with rate limiting
   */
  async executeBatch<T>(
    fns: Array<() => Promise<T>>,
    onProgress?: (completed: number, total: number) => void
  ): Promise<T[]> {
    const results: T[] = [];

    for (let i = 0; i < fns.length; i++) {
      const result = await this.execute(fns[i]);
      results.push(result);

      if (onProgress) {
        onProgress(i + 1, fns.length);
      }
    }

    return results;
  }

  /**
   * Check if an error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code || error.status;

    return (
      errorCode === 429 ||
      errorCode === 'rate_limit_exceeded' ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests')
    );
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current rate limit status
   */
  getStatus() {
    const now = Date.now();
    const timeUntilReset = Math.max(0, this.tracker.resetTime - now);
    const remainingRequests = Math.max(0, this.config.requestsPerMinute - this.tracker.count);

    return {
      requestsUsed: this.tracker.count,
      requestsRemaining: remainingRequests,
      requestsPerMinute: this.config.requestsPerMinute,
      timeUntilResetMs: timeUntilReset,
    };
  }
}

// Default rate limiters for different OpenAI models
export const openaiRateLimiters = {
  // Conservative limits for GPT-4/GPT-4.1
  gpt4: new RateLimiter({
    requestsPerMinute: 400, // Conservative: 80% of 500 RPM limit
    requestsPerSecond: 6,   // ~6 requests per second
    minDelayMs: 150,        // Minimum 150ms between requests
    maxRetries: 3,
  }),

  // More aggressive limits for GPT-3.5 (higher limits)
  gpt35: new RateLimiter({
    requestsPerMinute: 2800, // Conservative: 80% of 3500 RPM limit
    requestsPerSecond: 40,
    minDelayMs: 25,
    maxRetries: 3,
  }),
};

// Export the default GPT-4 rate limiter
export default openaiRateLimiters.gpt4;

/**
 * Helper function to wrap any async function with rate limiting
 */
export function withRateLimit<T>(
  fn: () => Promise<T>,
  limiter: RateLimiter = openaiRateLimiters.gpt4
): Promise<T> {
  return limiter.execute(fn);
}

/**
 * Helper function to process an array with rate limiting
 */
export async function batchWithRateLimit<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  options: {
    limiter?: RateLimiter;
    onProgress?: (completed: number, total: number) => void;
  } = {}
): Promise<R[]> {
  const limiter = options.limiter || openaiRateLimiters.gpt4;
  const fns = items.map(item => () => fn(item));
  return limiter.executeBatch(fns, options.onProgress);
}
