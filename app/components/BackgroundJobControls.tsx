'use client';

import { useState, useEffect, useRef } from 'react';

interface BackgroundJobControlsProps {
  projectId: string;
  onJobComplete?: () => void;
}

interface Job {
  id: string;
  status: string;
  currentStageName: string;
  processedItems: number;
  totalItems: number;
  progressPercentage: number;
  matchesFound: number;
  matchRate: number;
  estimatedCompletion?: string;
  cancellationRequested?: boolean;
  cancellationType?: string;
}

export default function BackgroundJobControls({ projectId, onJobComplete }: BackgroundJobControlsProps) {
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll for active jobs
  useEffect(() => {
    loadActiveJobs();
    
    // Start polling if there are active jobs
    const interval = setInterval(() => {
      loadActiveJobs();
    }, 2000); // Poll every 2 seconds
    
    pollingIntervalRef.current = interval;
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [projectId]);

  const loadActiveJobs = async () => {
    try {
      const res = await fetch(`/api/jobs?projectId=${projectId}&status=processing,queued`);
      if (!res.ok) return;

      const data = await res.json();
      const jobs = data.jobs || [];

      setActiveJobs(jobs);

      // Jobs are now processed by Vercel Cron, we just monitor status
    } catch (err) {
      console.error('Failed to load jobs:', err);
    }
  };

  // Check if any jobs completed and trigger refresh
  useEffect(() => {
    const completedJobs = activeJobs.filter(j => j.status === 'completed');
    if (completedJobs.length > 0 && onJobComplete) {
      onJobComplete();
    }
  }, [activeJobs, onJobComplete]);

  const startJob = async (jobType: 'fuzzy' | 'ai' | 'web-search') => {
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          jobType,
          config: { jobType },
        }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create job');
      }
      
      const data = await res.json();
      
      // Job created, it will be picked up by polling
      loadActiveJobs();
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'GRACEFUL' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to cancel job');
      }

      loadActiveJobs();
    } catch (err: any) {
      console.error('Failed to cancel job:', err);
      setError(err.message || 'Failed to cancel job');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Background Matching Jobs</h2>
      
      {error && (
        <div className="bg-red-50 text-red-800 p-3 rounded mb-4">
          {error}
        </div>
      )}
      
      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-medium mb-3">Active Jobs</h3>
          {activeJobs.map((job) => (
            <div key={job.id} className="border rounded p-4 mb-3">
              <div className="flex justify-between items-center mb-2">
                <div>
                  <span className="font-medium">{job.currentStageName}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    ({job.cancellationRequested ? 'cancelling...' : job.status})
                  </span>
                </div>
                <button
                  onClick={() => cancelJob(job.id)}
                  disabled={job.cancellationRequested}
                  className="text-red-600 hover:text-red-800 text-sm disabled:text-gray-400 disabled:cursor-not-allowed"
                >
                  {job.cancellationRequested ? 'Cancelling...' : 'Cancel'}
                </button>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${job.progressPercentage || 0}%` }}
                ></div>
              </div>
              
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                <div>
                  <span className="font-medium">Progress:</span> {job.processedItems || 0}/{job.totalItems || 0}
                </div>
                <div>
                  <span className="font-medium">Matches:</span> {job.matchesFound || 0} ({(job.matchRate || 0).toFixed(1)}%)
                </div>
                {job.estimatedCompletion && (
                  <div>
                    <span className="font-medium">ETA:</span> {new Date(job.estimatedCompletion).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Start Job Buttons */}
      <div className="grid grid-cols-3 gap-4">
        <button
          onClick={() => startJob('fuzzy')}
          disabled={loading || activeJobs.some(j => j.currentStageName.includes('Fuzzy'))}
          className="bg-green-600 text-white px-4 py-3 rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <div className="font-medium">Start Fuzzy Matching</div>
          <div className="text-xs mt-1">3000 items/batch, auto-continues</div>
        </button>
        
        <button
          onClick={() => startJob('ai')}
          disabled={loading || activeJobs.some(j => j.currentStageName.includes('AI'))}
          className="bg-blue-600 text-white px-4 py-3 rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <div className="font-medium">Start AI Matching</div>
          <div className="text-xs mt-1">100 items/batch, auto-continues</div>
        </button>
        
        <button
          onClick={() => startJob('web-search')}
          disabled={loading || activeJobs.some(j => j.currentStageName.includes('Web'))}
          className="bg-purple-600 text-white px-4 py-3 rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <div className="font-medium">Start Web Search</div>
          <div className="text-xs mt-1">20 items/batch, auto-continues</div>
        </button>
      </div>
      
      <div className="mt-4">
        <p className="flex items-start gap-2 text-sm text-gray-600">
          <span>💡</span>
          <span><strong>Tip:</strong> Background jobs are processed by Vercel Cron every minute. You can close this page and come back later - jobs will continue running automatically.</span>
        </p>
      </div>
    </div>
  );
}