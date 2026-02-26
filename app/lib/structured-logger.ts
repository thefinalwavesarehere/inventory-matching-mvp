/**
 * Structured Logging Utility (Pino-based)
 * 
 * Production-grade logging to replace console.log statements.
 * Provides:
 * - Structured JSON output for log aggregation
 * - Log levels (trace, debug, info, warn, error, fatal)
 * - Request correlation IDs
 * - Performance timing
 * - Error serialization
 * 
 * Usage:
 * import { matchingLogger, startTimer } from '@/app/lib/structured-logger';
 * 
 * const timer = startTimer(matchingLogger, 'ai-matching');
 * // ... do work ...
 * timer.end({ itemsProcessed: 100 });
 */

import pino from 'pino';

// Create base logger instance
const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Pretty print in development, JSON in production
  ...(process.env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

/**
 * Create a child logger with additional context
 */
export function createLogger(context: Record<string, unknown>) {
  return baseLogger.child(context);
}

/**
 * Logger for matching operations
 */
export const matchingLogger = createLogger({ module: 'matching' });

/**
 * Logger for API routes
 */
export const apiLogger = createLogger({ module: 'api' });

/**
 * Logger for database operations
 */
export const dbLogger = createLogger({ module: 'database' });

/**
 * Logger for authentication
 */
export const authLogger = createLogger({ module: 'auth' });

/**
 * Performance timing utility
 */
export class PerformanceTimer {
  private startTime: number;
  private logger: pino.Logger;
  private operation: string;

  constructor(logger: pino.Logger, operation: string) {
    this.logger = logger;
    this.operation = operation;
    this.startTime = Date.now();
    this.logger.debug({ operation }, 'Operation started');
  }

  /**
   * End timer and log duration
   */
  end(metadata?: Record<string, unknown>): void {
    const duration = Date.now() - this.startTime;
    this.logger.info(
      {
        operation: this.operation,
        duration,
        ...metadata,
      },
      `Operation completed in ${duration}ms`
    );
  }

  /**
   * End timer with error
   */
  error(error: Error, metadata?: Record<string, unknown>): void {
    const duration = Date.now() - this.startTime;
    this.logger.error(
      {
        operation: this.operation,
        duration,
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        ...metadata,
      },
      `Operation failed after ${duration}ms`
    );
  }
}

/**
 * Create a performance timer
 */
export function startTimer(logger: pino.Logger, operation: string): PerformanceTimer {
  return new PerformanceTimer(logger, operation);
}

/**
 * Log error with full context
 */
export function logError(
  logger: pino.Logger,
  error: Error,
  context?: Record<string, unknown>
): void {
  logger.error(
    {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
        ...(error.cause ? { cause: error.cause } : {}),
      },
      ...context,
    },
    error.message
  );
}

/**
 * Log request/response for API routes
 */
export function logRequest(params: {
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  userId?: string;
  metadata?: Record<string, unknown>;
}): void {
  apiLogger.info(
    {
      method: params.method,
      path: params.path,
      statusCode: params.statusCode,
      duration: params.duration,
      userId: params.userId,
      ...params.metadata,
    },
    `${params.method} ${params.path} ${params.statusCode} ${params.duration}ms`
  );
}

/**
 * Log matching operation
 */
export function logMatching(params: {
  stage: string;
  jobId: string;
  itemsProcessed: number;
  matchesFound: number;
  duration: number;
  cost?: number;
  metadata?: Record<string, unknown>;
}): void {
  matchingLogger.info(
    {
      stage: params.stage,
      jobId: params.jobId,
      itemsProcessed: params.itemsProcessed,
      matchesFound: params.matchesFound,
      duration: params.duration,
      cost: params.cost,
      ...params.metadata,
    },
    `[${params.stage}] Processed ${params.itemsProcessed} items, found ${params.matchesFound} matches in ${params.duration}ms`
  );
}

export default baseLogger;
