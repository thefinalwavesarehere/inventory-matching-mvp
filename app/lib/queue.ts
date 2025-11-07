/**
 * Job Queue Configuration (BullMQ + Redis)
 * 
 * Provides async job processing for:
 * - File parsing
 * - Matching algorithms
 * - Export generation
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection (optional - gracefully degrades if not available)
let connection: IORedis | null = null;

try {
  if (process.env.REDIS_URL) {
    connection = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
  }
} catch (error) {
  console.warn('Redis not available - job queue features disabled');
}

/**
 * Queue Definitions (null if Redis not available)
 */

export const parseFileQueue = connection ? new Queue('parse-file', { connection }) : null;
export const matchProjectQueue = connection ? new Queue('match-project', { connection }) : null;
export const exportQueue = connection ? new Queue('export', { connection }) : null;

/**
 * Job Data Types
 */

export interface ParseFileJobData {
  fileId: string;
  projectId: string;
  userId: string;
}

export interface MatchProjectJobData {
  projectId: string;
  userId: string;
  options?: {
    useKnownInterchanges?: boolean;
    partNumberThreshold?: number;
    nameThreshold?: number;
    descriptionThreshold?: number;
    aiEnabled?: boolean;
  };
}

export interface ExportJobData {
  projectId: string;
  userId: string;
  format: 'csv' | 'xlsx' | 'pdf';
  filters?: {
    status?: 'PENDING' | 'CONFIRMED' | 'REJECTED';
    minConfidence?: number;
    maxConfidence?: number;
  };
}

/**
 * Add jobs to queues
 */

export async function addParseFileJob(data: ParseFileJobData) {
  if (!parseFileQueue) {
    throw new Error('Job queue not available - Redis not configured');
  }
  return parseFileQueue.add('parse-file', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep failed jobs for 7 days
    },
  });
}

export async function addMatchProjectJob(data: MatchProjectJobData) {
  if (!matchProjectQueue) {
    throw new Error('Job queue not available - Redis not configured');
  }
  return matchProjectQueue.add('match-project', data, {
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 10000,
    },
    timeout: 600000, // 10 minutes
    removeOnComplete: {
      age: 24 * 3600,
      count: 100,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  });
}

export async function addExportJob(data: ExportJobData) {
  if (!exportQueue) {
    throw new Error('Job queue not available - Redis not configured');
  }
  return exportQueue.add('export', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    timeout: 300000, // 5 minutes
    removeOnComplete: {
      age: 24 * 3600,
      count: 500,
    },
    removeOnFail: {
      age: 7 * 24 * 3600,
    },
  });
}

/**
 * Get job status
 */

export async function getJobStatus(queueName: string, jobId: string) {
  let queue: Queue;
  
  switch (queueName) {
    case 'parse-file':
      queue = parseFileQueue;
      break;
    case 'match-project':
      queue = matchProjectQueue;
      break;
    case 'export':
      queue = exportQueue;
      break;
    default:
      throw new Error(`Unknown queue: ${queueName}`);
  }

  const job = await queue.getJob(jobId);
  
  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = job.progress;
  const failedReason = job.failedReason;

  return {
    id: job.id,
    name: job.name,
    data: job.data,
    state,
    progress,
    failedReason,
    finishedOn: job.finishedOn,
    processedOn: job.processedOn,
    timestamp: job.timestamp,
  };
}

/**
 * Queue event listeners
 */

export function createQueueEventListeners() {
  const parseFileEvents = new QueueEvents('parse-file', { connection });
  const matchProjectEvents = new QueueEvents('match-project', { connection });
  const exportEvents = new QueueEvents('export', { connection });

  parseFileEvents.on('completed', ({ jobId }) => {
    console.log(`[parse-file] Job ${jobId} completed`);
  });

  parseFileEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`[parse-file] Job ${jobId} failed:`, failedReason);
  });

  matchProjectEvents.on('completed', ({ jobId }) => {
    console.log(`[match-project] Job ${jobId} completed`);
  });

  matchProjectEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`[match-project] Job ${jobId} failed:`, failedReason);
  });

  exportEvents.on('completed', ({ jobId }) => {
    console.log(`[export] Job ${jobId} completed`);
  });

  exportEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`[export] Job ${jobId} failed:`, failedReason);
  });

  return {
    parseFileEvents,
    matchProjectEvents,
    exportEvents,
  };
}

/**
 * Graceful shutdown
 */

export async function closeQueues() {
  await parseFileQueue.close();
  await matchProjectQueue.close();
  await exportQueue.close();
  await connection.quit();
}
