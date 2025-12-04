'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface AnalyticsSummary {
  totalStoreItems: number;
  uniqueMatchedItems: number;
  totalMatchCandidates: number;
  matchRate: number;
  matchCounts: {
    pending: number;
    confirmed: number;
    rejected: number;
  };
  sourceBreakdown: {
    exact: number;
    interchange: number;
    fuzzy: number;
    ai: number;
    web: number;
  };
}

interface ConfidenceBucket {
  range: string;
  count: number;
  percentage: number;
}

interface BackgroundJob {
  id: string;
  jobType: string;
  status: string;
  totalItems: number;
  processedItems: number;
  matchesFound: number;
  createdAt: string;
  completedAt: string | null;
}

export default function AnalyticsPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [confidenceDistribution, setConfidenceDistribution] = useState<ConfidenceBucket[]>([]);
  const [backgroundJobs, setBackgroundJobs] = useState<BackgroundJob[]>([]);

  useEffect(() => {
    if (projectId) {
      loadAnalytics();
    }
  }, [projectId]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      
      // Load summary metrics
      const summaryRes = await fetch(`/api/analytics/summary?projectId=${projectId}`);
      if (!summaryRes.ok) throw new Error('Failed to load summary');
      const summaryData = await summaryRes.json();
      setSummary(summaryData);
      
      // Load confidence distribution
      const confRes = await fetch(`/api/analytics/confidence?projectId=${projectId}`);
      if (!confRes.ok) throw new Error('Failed to load confidence distribution');
      const confData = await confRes.json();
      setConfidenceDistribution(confData.distribution || []);
      
      // Load background jobs
      const jobsRes = await fetch(`/api/jobs?projectId=${projectId}&status=completed`);
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setBackgroundJobs(jobsData.jobs || []);
      }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!projectId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">No project selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Navigation Bar */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => window.location.href = '/'}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
          >
            ← Back to Home
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.href = `/match?projectId=${projectId}`}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              Match Review
            </button>
            <button
              className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium"
            >
              Analytics
            </button>
          </div>
        </div>
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            📊 Analytics Dashboard
          </h1>
          <p className="text-gray-600">
            Track matching performance, stage-by-stage metrics, and confidence distribution
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="text-gray-500">Loading analytics...</div>
          </div>
        ) : summary ? (
          <div className="space-y-6">
            {/* Overall Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-1">Total Items</div>
                <div className="text-3xl font-bold text-gray-900">
                  {summary.totalStoreItems.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">Store inventory items</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-1">Matched Items</div>
                <div className="text-3xl font-bold text-green-600">
                  {summary.uniqueMatchedItems.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">Unique items with matches</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-1">Match Rate</div>
                <div className="text-3xl font-bold text-blue-600">
                  {(summary.matchRate * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">Items matched / Total items</div>
              </div>
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-gray-600 mb-1">Total Candidates</div>
                <div className="text-3xl font-bold text-purple-600">
                  {summary.totalMatchCandidates.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">All potential matches</div>
              </div>
            </div>

            {/* Match Status Breakdown */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Match Status</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">
                    {summary.matchCounts.pending.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Pending Review</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {summary.matchCounts.confirmed.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Confirmed</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {summary.matchCounts.rejected.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">Rejected</div>
                </div>
              </div>
            </div>

            {/* Match Source Breakdown */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Matches by Source</h2>
              <div className="space-y-3">
                {Object.entries(summary.sourceBreakdown).map(([source, count]) => {
                  const percentage = summary.totalMatchCandidates > 0 
                    ? (count / summary.totalMatchCandidates) * 100 
                    : 0;
                  const label = source.charAt(0).toUpperCase() + source.slice(1).replace('_', ' ');
                  const color = 
                    source === 'exact' ? 'bg-green-500' :
                    source === 'interchange' ? 'bg-blue-500' :
                    source === 'fuzzy' ? 'bg-purple-500' :
                    source === 'ai' ? 'bg-orange-500' :
                    'bg-pink-500';
                  
                  return (
                    <div key={source}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 font-medium">{label}</span>
                        <span className="text-gray-600">
                          {count.toLocaleString()} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`${color} h-3 rounded-full transition-all duration-300`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Confidence Distribution */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Confidence Distribution</h2>
              <p className="text-sm text-gray-600 mb-4">Distribution of match confidence scores</p>
              <div className="space-y-3">
                {confidenceDistribution.map((bucket) => {
                  const color = 
                    bucket.range === '95-100%' ? 'bg-green-500' :
                    bucket.range === '85-94%' ? 'bg-green-400' :
                    bucket.range === '80-84%' ? 'bg-yellow-500' :
                    bucket.range === '75-79%' ? 'bg-yellow-400' :
                    bucket.range === '70-74%' ? 'bg-orange-400' :
                    bucket.range === '60-69%' ? 'bg-orange-500' :
                    'bg-red-500';
                  
                  return (
                    <div key={bucket.range}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-700 font-medium">{bucket.range}</span>
                        <span className="text-gray-600">
                          {bucket.count.toLocaleString()} matches ({bucket.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`${color} h-3 rounded-full transition-all duration-300`}
                          style={{ width: `${bucket.percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Historical Matching Jobs */}
            {backgroundJobs.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Historical Matching Jobs
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Track match rate trends over time
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Job Type
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Items
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Matched
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Match Rate
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {backgroundJobs.map((job) => {
                        const matchRate = job.totalItems > 0 ? (job.matchesFound / job.totalItems) * 100 : 0;
                        const jobTypeLabel = 
                          job.jobType === 'fuzzy' ? 'Fuzzy Matching' :
                          job.jobType === 'ai' ? 'AI Matching' :
                          job.jobType === 'web' ? 'Web Search' :
                          job.jobType;
                        
                        return (
                          <tr 
                            key={job.id} 
                            className="hover:bg-gray-50"
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {new Date(job.createdAt).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-semibold rounded ${
                                job.jobType === 'fuzzy' ? 'bg-purple-100 text-purple-800' :
                                job.jobType === 'ai' ? 'bg-orange-100 text-orange-800' :
                                'bg-pink-100 text-pink-800'
                              }`}>
                                {jobTypeLabel}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                              {job.totalItems.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-semibold text-green-600">
                              {job.matchesFound.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                matchRate >= 30 ? 'bg-green-100 text-green-800' :
                                matchRate >= 15 ? 'bg-yellow-100 text-yellow-800' :
                                matchRate >= 5 ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {matchRate.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <span className={`px-2 py-1 text-xs font-semibold rounded ${
                                job.status === 'completed' ? 'bg-green-100 text-green-800' :
                                job.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                                job.status === 'failed' ? 'bg-red-100 text-red-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {job.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">📌 Understanding the Metrics</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li><strong>Total Items:</strong> Number of parts in your store inventory</li>
                <li><strong>Matched Items:</strong> Unique store items that have at least one supplier match</li>
                <li><strong>Match Rate:</strong> Percentage of your inventory that has been matched</li>
                <li><strong>Total Candidates:</strong> All potential matches (one item can have multiple matches)</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="text-gray-500">No analytics data available</div>
          </div>
        )}
      </div>
    </div>
  );
}
