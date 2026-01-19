/**
 * Job Queue Manager
 *
 * Manages job concurrency, queueing, and cancellation for matching pipelines.
 *
 * Concurrency Limits:
 * - Global: Maximum 5 jobs running concurrently across all users/projects
 * - Per-user: Maximum 2 jobs running per user
 * - Per-project: Maximum 1 job running per project
 * - Per-stage (AI/Web): Maximum 3 AI/web jobs running concurrently
 */

import { prisma } from './db/prisma';
import { MatchingJob } from '@prisma/client';

// Concurrency limits
const LIMITS = {
  GLOBAL_MAX: 5,
  PER_USER_MAX: 2,
  PER_PROJECT_MAX: 1,
  AI_WEB_STAGE_MAX: 3,
};

// Job statuses
export const JobStatus = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type JobStatusType = typeof JobStatus[keyof typeof JobStatus];

// Cancellation types
export const CancellationType = {
  GRACEFUL: 'GRACEFUL', // Finish current stage, then stop
  IMMEDIATE: 'IMMEDIATE', // Stop immediately
} as const;

export type CancellationTypeType = typeof CancellationType[keyof typeof CancellationType];

export interface QueueCheckResult {
  canStart: boolean;
  reason?: string;
  waitingFor?: {
    globalCount?: number;
    userCount?: number;
    projectJobs?: string[];
  };
}

export interface JobCounts {
  global: number;
  perUser: Map<string, number>;
  perProject: Map<string, number>;
  aiWebStage: number;
}

/**
 * Get current job counts for all concurrency limits
 */
export async function getCurrentJobCounts(): Promise<JobCounts> {
  // Get all currently processing jobs
  const processingJobs = await prisma.matchingJob.findMany({
    where: {
      status: JobStatus.PROCESSING,
    },
    select: {
      id: true,
      userId: true,
      projectId: true,
      currentStageName: true,
    },
  });

  const counts: JobCounts = {
    global: processingJobs.length,
    perUser: new Map(),
    perProject: new Map(),
    aiWebStage: 0,
  };

  // Count per-user and per-project jobs
  for (const job of processingJobs) {
    // Per-user count
    if (job.userId) {
      const userCount = counts.perUser.get(job.userId) || 0;
      counts.perUser.set(job.userId, userCount + 1);
    }

    // Per-project count
    const projectCount = counts.perProject.get(job.projectId) || 0;
    counts.perProject.set(job.projectId, projectCount + 1);

    // AI/Web stage count
    if (job.currentStageName && (job.currentStageName.includes('AI') || job.currentStageName.includes('WEB'))) {
      counts.aiWebStage++;
    }
  }

  return counts;
}

/**
 * Check if a new job can start processing based on concurrency limits
 */
export async function canJobStart(
  projectId: string,
  userId?: string
): Promise<QueueCheckResult> {
  const counts = await getCurrentJobCounts();

  // Check global limit
  if (counts.global >= LIMITS.GLOBAL_MAX) {
    return {
      canStart: false,
      reason: `Global concurrency limit reached (${LIMITS.GLOBAL_MAX} jobs running)`,
      waitingFor: { globalCount: counts.global },
    };
  }

  // Check per-user limit
  if (userId) {
    const userCount = counts.perUser.get(userId) || 0;
    if (userCount >= LIMITS.PER_USER_MAX) {
      return {
        canStart: false,
        reason: `User concurrency limit reached (${LIMITS.PER_USER_MAX} jobs per user)`,
        waitingFor: { userCount },
      };
    }
  }

  // Check per-project limit
  const projectCount = counts.perProject.get(projectId) || 0;
  if (projectCount >= LIMITS.PER_PROJECT_MAX) {
    // Get the running job(s) for this project
    const projectJobs = await prisma.matchingJob.findMany({
      where: {
        projectId,
        status: JobStatus.PROCESSING,
      },
      select: { id: true },
    });

    return {
      canStart: false,
      reason: `Project already has a running job (max ${LIMITS.PER_PROJECT_MAX} per project)`,
      waitingFor: { projectJobs: projectJobs.map(j => j.id) },
    };
  }

  return { canStart: true };
}

/**
 * Check if AI/Web stage can start based on stage-specific concurrency limit
 */
export async function canAiWebStageStart(): Promise<boolean> {
  const counts = await getCurrentJobCounts();
  return counts.aiWebStage < LIMITS.AI_WEB_STAGE_MAX;
}

/**
 * Create a new job in queued state
 */
export async function createQueuedJob(
  projectId: string,
  userId?: string,
  config?: any
): Promise<MatchingJob> {
  const job = await prisma.matchingJob.create({
    data: {
      projectId,
      userId,
      status: JobStatus.QUEUED,
      queuedAt: new Date(),
      config,
    },
  });

  return job;
}

/**
 * Try to start the next queued job if concurrency limits allow
 * Returns the job that was started, or null if none could start
 */
export async function tryStartNextQueuedJob(): Promise<MatchingJob | null> {
  // Get all queued jobs ordered by priority (desc) then queuedAt (asc)
  const queuedJobs = await prisma.matchingJob.findMany({
    where: {
      status: JobStatus.QUEUED,
      cancellationRequested: false,
    },
    orderBy: [
      { priority: 'desc' },
      { queuedAt: 'asc' },
    ],
  });

  // Try each queued job until we find one that can start
  for (const job of queuedJobs) {
    const checkResult = await canJobStart(job.projectId, job.userId || undefined);

    if (checkResult.canStart) {
      // Mark job as processing
      const startedJob = await prisma.matchingJob.update({
        where: { id: job.id },
        data: {
          status: JobStatus.PROCESSING,
          startedAt: new Date(),
        },
      });

      return startedJob;
    }
  }

  return null;
}

/**
 * Request cancellation of a job
 */
export async function requestJobCancellation(
  jobId: string,
  cancelledBy: string,
  type: CancellationTypeType = CancellationType.GRACEFUL
): Promise<MatchingJob> {
  const job = await prisma.matchingJob.update({
    where: { id: jobId },
    data: {
      cancellationRequested: true,
      cancellationType: type,
      cancelledBy,
    },
  });

  return job;
}

/**
 * Check if a job has been cancelled
 */
export async function isJobCancelled(jobId: string): Promise<boolean> {
  const job = await prisma.matchingJob.findUnique({
    where: { id: jobId },
    select: { cancellationRequested: true },
  });

  return job?.cancellationRequested || false;
}

/**
 * Get cancellation type for a job
 */
export async function getJobCancellationType(jobId: string): Promise<CancellationTypeType | null> {
  const job = await prisma.matchingJob.findUnique({
    where: { id: jobId },
    select: { cancellationType: true },
  });

  return job?.cancellationType as CancellationTypeType | null;
}

/**
 * Mark a job as cancelled
 */
export async function markJobCancelled(
  jobId: string,
  errorMessage?: string
): Promise<MatchingJob> {
  const job = await prisma.matchingJob.update({
    where: { id: jobId },
    data: {
      status: JobStatus.CANCELLED,
      cancelledAt: new Date(),
      errorMessage: errorMessage || 'Job cancelled by user',
    },
  });

  // Try to start the next queued job
  await tryStartNextQueuedJob();

  return job;
}

/**
 * Mark a job as completed
 */
export async function markJobCompleted(
  jobId: string,
  matchesFound: number,
  matchRate: number,
  metrics?: any
): Promise<MatchingJob> {
  const job = await prisma.matchingJob.update({
    where: { id: jobId },
    data: {
      status: JobStatus.COMPLETED,
      completedAt: new Date(),
      matchesFound,
      matchRate,
      metrics,
    },
  });

  // Try to start the next queued job
  await tryStartNextQueuedJob();

  return job;
}

/**
 * Mark a job as failed
 */
export async function markJobFailed(
  jobId: string,
  errorMessage: string
): Promise<MatchingJob> {
  const job = await prisma.matchingJob.update({
    where: { id: jobId },
    data: {
      status: JobStatus.FAILED,
      completedAt: new Date(),
      errorMessage,
    },
  });

  // Try to start the next queued job
  await tryStartNextQueuedJob();

  return job;
}

/**
 * Update job progress
 */
export async function updateJobProgress(
  jobId: string,
  progress: {
    currentStage?: number;
    currentStageName?: string;
    processedItems?: number;
    progressPercentage?: number;
    estimatedCompletion?: Date;
  }
): Promise<MatchingJob> {
  const job = await prisma.matchingJob.update({
    where: { id: jobId },
    data: {
      ...progress,
      updatedAt: new Date(),
    },
  });

  return job;
}

/**
 * Get queue status for a project
 */
export async function getProjectQueueStatus(projectId: string): Promise<{
  running: MatchingJob | null;
  queued: MatchingJob[];
  position?: number;
}> {
  const running = await prisma.matchingJob.findFirst({
    where: {
      projectId,
      status: JobStatus.PROCESSING,
    },
  });

  const queued = await prisma.matchingJob.findMany({
    where: {
      projectId,
      status: JobStatus.QUEUED,
    },
    orderBy: [
      { priority: 'desc' },
      { queuedAt: 'asc' },
    ],
  });

  // Calculate position in global queue
  let position: number | undefined;
  if (queued.length > 0) {
    const allQueued = await prisma.matchingJob.findMany({
      where: {
        status: JobStatus.QUEUED,
      },
      orderBy: [
        { priority: 'desc' },
        { queuedAt: 'asc' },
      ],
      select: { id: true },
    });

    position = allQueued.findIndex(j => j.id === queued[0].id) + 1;
  }

  return { running, queued, position };
}
