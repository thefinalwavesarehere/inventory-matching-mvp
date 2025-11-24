/**
 * Client-side Job Manager
 * Handles background job creation, processing, and polling
 */

export interface Job {
  id: string;
  projectId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  currentStage?: number;
  currentStageName?: string;
  totalItems?: number;
  processedItems: number;
  progressPercentage: number;
  matchesFound: number;
  matchRate: number;
  startedAt?: string;
  completedAt?: string;
  estimatedCompletion?: string;
  error?: string;
}

export class JobManager {
  private pollingInterval?: NodeJS.Timeout;
  private processingInterval?: NodeJS.Timeout;

  /**
   * Create a new background job
   */
  async createJob(projectId: string, jobType: 'ai' | 'web-search'): Promise<Job> {
    const response = await fetch('/api/jobs/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        jobType,
        config: { jobType },
      }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to create job');
    }

    return data.job;
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<Job> {
    const response = await fetch(`/api/jobs/${jobId}`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to get job status');
    }

    return data.job;
  }

  /**
   * Process next chunk of a job
   */
  async processChunk(jobId: string): Promise<Job> {
    const response = await fetch(`/api/jobs/${jobId}/process`, {
      method: 'POST',
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to process chunk');
    }

    return data.job;
  }

  /**
   * Start a job and automatically process chunks until complete
   * Calls onProgress callback with job status updates
   */
  async startJob(
    projectId: string,
    jobType: 'ai' | 'web-search',
    onProgress: (job: Job) => void
  ): Promise<Job> {
    // Create job
    const job = await this.createJob(projectId, jobType);
    onProgress(job);

    // Start processing chunks
    return new Promise((resolve, reject) => {
      this.processingInterval = setInterval(async () => {
        try {
          const updatedJob = await this.processChunk(job.id);
          onProgress(updatedJob);

          if (updatedJob.status === 'completed') {
            this.stopProcessing();
            resolve(updatedJob);
          } else if (updatedJob.status === 'failed') {
            this.stopProcessing();
            reject(new Error(updatedJob.error || 'Job failed'));
          }
        } catch (error: any) {
          this.stopProcessing();
          reject(error);
        }
      }, 2000); // Process chunk every 2 seconds
    });
  }

  /**
   * Poll for job status updates
   * Useful for monitoring a job that's already running
   */
  startPolling(jobId: string, onUpdate: (job: Job) => void, intervalMs: number = 2000) {
    this.stopPolling(); // Clear any existing polling

    this.pollingInterval = setInterval(async () => {
      try {
        const job = await this.getJobStatus(jobId);
        onUpdate(job);

        if (job.status === 'completed' || job.status === 'failed') {
          this.stopPolling();
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop polling for job status
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
  }

  /**
   * Stop processing chunks
   */
  stopProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
  }

  /**
   * Clean up all intervals
   */
  cleanup() {
    this.stopPolling();
    this.stopProcessing();
  }
}

/**
 * Example usage:
 * 
 * const jobManager = new JobManager();
 * 
 * // Start AI matching job
 * const job = await jobManager.startJob(projectId, 'ai', (job) => {
 *   console.log(`Progress: ${job.progressPercentage}%`);
 *   console.log(`Matches found: ${job.matchesFound}`);
 * });
 * 
 * console.log('Job completed!', job);
 * 
 * // Clean up when component unmounts
 * jobManager.cleanup();
 */
