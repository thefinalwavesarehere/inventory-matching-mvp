'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface LinearPipelineProps {
  projectId: string;
  project: {
    _count: {
      storeItems: number;
      supplierItems: number;
      interchanges: number;
      matchCandidates: number;
    };
  };
  onRefresh: () => void;
}

interface Job {
  id: string;
  status: string;
  currentStageName: string;
  processedItems: number;
  totalItems: number;
  progressPercentage: number;
  matchesFound: number;
}

export default function LinearPipeline({ projectId, project, onRefresh }: LinearPipelineProps) {
  const router = useRouter();
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJobType, setSelectedJobType] = useState<'exact' | 'fuzzy' | 'ai' | 'web-search'>('exact');

  useEffect(() => {
    loadActiveJobs();
    const interval = setInterval(loadActiveJobs, 2000);
    return () => clearInterval(interval);
  }, [projectId]);

  const loadActiveJobs = async () => {
    try {
      const res = await fetch(`/api/jobs?projectId=${projectId}&status=processing,queued`);
      if (!res.ok) return;
      const data = await res.json();
      setActiveJobs(data.jobs || []);
    } catch (err) {
      console.error('Failed to load jobs:', err);
    }
  };

  const startJob = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/jobs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, jobType: selectedJobType, config: { jobType: selectedJobType } }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create job');
      }
      
      await loadActiveJobs();
      onRefresh();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      await fetch(`/api/jobs/${jobId}/cancel`, {
        method: 'POST',
      });
      await loadActiveJobs();
      onRefresh();
    } catch (err) {
      console.error('Failed to cancel job:', err);
      alert('Failed to cancel job');
    }
  };

  const hasData = project._count.storeItems > 0 && project._count.supplierItems > 0;
  const hasMatches = project._count.matchCandidates > 0;
  const isRunning = activeJobs.length > 0;

  return (
    <div className="glass-panel-strong p-8 mb-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-900">Matching Pipeline</h2>
      
      {/* Step 1: Data Status */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-center font-bold">
            1
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Data Status</h3>
        </div>
        <div className="ml-11 grid grid-cols-3 gap-4">
          <div className={`p-4 rounded-lg border-2 ${project._count.storeItems > 0 ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              {project._count.storeItems > 0 ? (
                <span className="text-2xl">✅</span>
              ) : (
                <span className="text-2xl">⚪</span>
              )}
              <span className="font-semibold">Inventory</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{project._count.storeItems.toLocaleString()}</div>
            <div className="text-sm text-gray-600">items</div>
          </div>
          
          <div className={`p-4 rounded-lg border-2 ${project._count.supplierItems > 0 ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              {project._count.supplierItems > 0 ? (
                <span className="text-2xl">✅</span>
              ) : (
                <span className="text-2xl">⚪</span>
              )}
              <span className="font-semibold">Supplier Catalog</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{project._count.supplierItems.toLocaleString()}</div>
            <div className="text-sm text-gray-600">items</div>
          </div>
          
          <div className={`p-4 rounded-lg border-2 ${project._count.interchanges > 0 ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              {project._count.interchanges > 0 ? (
                <span className="text-2xl">✅</span>
              ) : (
                <span className="text-2xl">⚪</span>
              )}
              <span className="font-semibold">Interchange</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{project._count.interchanges.toLocaleString()}</div>
            <div className="text-sm text-gray-600">mappings</div>
          </div>
        </div>
      </div>

      {/* Step 2: Execution */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-center font-bold">
            2
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Run Matching</h3>
        </div>
        <div className="ml-11">
          {isRunning ? (
            <div className="space-y-4">
              {activeJobs.map((job) => (
                <div key={job.id} className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-blue-900">{job.currentStageName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-blue-700">{job.status}</span>
                      <button
                        onClick={() => cancelJob(job.id)}
                        className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 font-medium"
                      >
                        ✕ Cancel
                      </button>
                    </div>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-3 mb-2">
                    <div
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${(job.totalItems || 0) > 0 ? ((job.matchesFound || 0) / (job.totalItems || 1)) * 100 : 0}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-sm text-blue-800">
                    <span>{(job.processedItems || 0).toLocaleString()} / {(job.totalItems || 0).toLocaleString()} items</span>
                    <span>{(job.matchesFound || 0).toLocaleString()} matches found</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <select
                value={selectedJobType}
                onChange={(e) => setSelectedJobType(e.target.value as 'exact' | 'fuzzy' | 'ai' | 'web-search')}
                className="w-full py-3 px-4 rounded-lg border-2 border-gray-300 font-medium text-gray-900 bg-white"
              >
                <option value="exact">✅ Exact Matching (Instant, Free)</option>
                <option value="fuzzy">🔍 Fuzzy Matching (Fast, Free)</option>
                <option value="ai">🤖 AI Matching (100 items/batch, ~$0.50)</option>
                <option value="web-search">🌐 Web Search (20 items/batch, ~$2.00)</option>
              </select>
              <button
                onClick={startJob}
                disabled={!hasData || loading}
                className={`w-full py-4 rounded-lg font-semibold text-lg transition-all ${
                  !hasData || loading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-700 hover:to-emerald-700 shadow-lg'
                }`}
              >
                {loading ? '⚙️ Starting...' : '▶️ Start Matching'}
              </button>
            </div>
          )}
          {!hasData && (
            <p className="mt-2 text-sm text-gray-600">
              ⚠️ Upload inventory and supplier files to begin matching
            </p>
          )}
        </div>
      </div>

      {/* Step 3: Review */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-center font-bold">
            3
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Review Matches</h3>
        </div>
        <div className="ml-11">
          <button
            onClick={() => router.push(`/match?projectId=${projectId}`)}
            disabled={!hasMatches}
            className={`w-full py-4 rounded-lg font-semibold text-lg transition-all ${
              !hasMatches
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg'
            }`}
          >
            📋 Review {hasMatches ? `${project._count.matchCandidates.toLocaleString()} Matches` : 'Matches'}
          </button>
        </div>
      </div>

      {/* Step 4: Export */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-center font-bold">
            4
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Export Results</h3>
        </div>
        <div className="ml-11">
          <select
            disabled={!hasMatches}
            onChange={(e) => {
              if (e.target.value === 'excel') {
                window.location.href = `/api/projects/${projectId}/export`;
              }
              e.target.value = '';
            }}
            className={`w-full py-4 px-4 rounded-lg font-semibold text-lg border-2 transition-all ${
              !hasMatches
                ? 'bg-gray-100 text-gray-500 border-gray-300 cursor-not-allowed'
                : 'bg-white text-gray-900 border-gray-300 hover:border-indigo-500 cursor-pointer'
            }`}
          >
            <option value="">Choose Export Format...</option>
            <option value="excel">📊 Excel Spreadsheet (.xlsx)</option>
          </select>
        </div>
      </div>


    </div>
  );
}
