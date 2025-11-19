'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface StageMetrics {
  stage: string;
  itemsProcessed: number;
  matchesFound: number;
  matchRate: number;
  avgConfidence: number;
  executionTimeMs: number;
}

interface MatchingJobMetrics {
  id: string;
  createdAt: string;
  totalItems: number;
  matchedItems: number;
  matchRate: number;
  executionTimeMs: number;
  stageMetrics: StageMetrics[];
}

interface ConfidenceBucket {
  range: string;
  count: number;
  percentage: number;
}

export default function AnalyticsPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState<MatchingJobMetrics[]>([]);
  const [selectedJob, setSelectedJob] = useState<MatchingJobMetrics | null>(null);
  const [confidenceDistribution, setConfidenceDistribution] = useState<ConfidenceBucket[]>([]);

  useEffect(() => {
    if (projectId) {
      loadAnalytics();
    }
  }, [projectId]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      
      // Load matching jobs with metrics
      const jobsRes = await fetch(`/api/analytics/jobs?projectId=${projectId}`);
      if (!jobsRes.ok) throw new Error('Failed to load job metrics');
      const jobsData = await jobsRes.json();
      setJobs(jobsData.jobs || []);
      
      if (jobsData.jobs && jobsData.jobs.length > 0) {
        setSelectedJob(jobsData.jobs[0]);
      }
      
      // Load confidence distribution
      const confRes = await fetch(`/api/analytics/confidence?projectId=${projectId}`);
      if (!confRes.ok) throw new Error('Failed to load confidence distribution');
      const confData = await confRes.json();
      setConfidenceDistribution(confData.distribution || []);
      
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
        ) : (
          <div className="space-y-6">
            {/* Overall Stats */}
            {selectedJob && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="text-sm text-gray-600 mb-1">Total Items</div>
                  <div className="text-3xl font-bold text-gray-900">
                    {selectedJob.totalItems.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="text-sm text-gray-600 mb-1">Matched Items</div>
                  <div className="text-3xl font-bold text-green-600">
                    {selectedJob.matchedItems.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="text-sm text-gray-600 mb-1">Match Rate</div>
                  <div className="text-3xl font-bold text-blue-600">
                    {(selectedJob.matchRate * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="text-sm text-gray-600 mb-1">Execution Time</div>
                  <div className="text-3xl font-bold text-purple-600">
                    {(selectedJob.executionTimeMs / 1000).toFixed(1)}s
                  </div>
                </div>
              </div>
            )}

            {/* Stage-by-Stage Metrics */}
            {selectedJob && selectedJob.stageMetrics.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Stage-by-Stage Performance
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Breakdown of matching performance by stage
                  </p>
                </div>
                <div className="p-6">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Stage
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Items Processed
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Matches Found
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Match Rate
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Avg Confidence
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Time (ms)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedJob.stageMetrics.map((metric, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                metric.stage === 'Stage 1' ? 'bg-blue-100 text-blue-800' :
                                metric.stage === 'Stage 2' ? 'bg-purple-100 text-purple-800' :
                                metric.stage === 'Stage 3' ? 'bg-orange-100 text-orange-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {metric.stage}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">
                              {metric.itemsProcessed.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-green-600">
                              {metric.matchesFound.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                metric.matchRate >= 0.3 ? 'bg-green-100 text-green-800' :
                                metric.matchRate >= 0.15 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {(metric.matchRate * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">
                              {(metric.avgConfidence * 100).toFixed(0)}%
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              {metric.executionTimeMs.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Visual Stage Breakdown */}
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Match Distribution by Stage</h3>
                    <div className="space-y-3">
                      {selectedJob.stageMetrics.map((metric, idx) => {
                        const percentage = selectedJob.matchedItems > 0 
                          ? (metric.matchesFound / selectedJob.matchedItems) * 100 
                          : 0;
                        return (
                          <div key={idx}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-gray-700">{metric.stage}</span>
                              <span className="text-gray-600">
                                {metric.matchesFound} matches ({percentage.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3">
                              <div
                                className={`h-3 rounded-full ${
                                  metric.stage === 'Stage 1' ? 'bg-blue-600' :
                                  metric.stage === 'Stage 2' ? 'bg-purple-600' :
                                  metric.stage === 'Stage 3' ? 'bg-orange-600' :
                                  'bg-gray-600'
                                }`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Confidence Distribution */}
            {confidenceDistribution.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Confidence Distribution
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Distribution of match confidence scores
                  </p>
                </div>
                <div className="p-6">
                  <div className="space-y-3">
                    {confidenceDistribution.map((bucket, idx) => (
                      <div key={idx}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700 font-medium">{bucket.range}</span>
                          <span className="text-gray-600">
                            {bucket.count} matches ({bucket.percentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-4">
                          <div
                            className={`h-4 rounded-full ${
                              bucket.range.includes('95-100') ? 'bg-green-600' :
                              bucket.range.includes('85-94') ? 'bg-yellow-600' :
                              bucket.range.includes('60-84') ? 'bg-orange-600' :
                              'bg-red-600'
                            }`}
                            style={{ width: `${bucket.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Historical Jobs */}
            {jobs.length > 1 && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-xl font-semibold text-gray-900">
                    Historical Matching Jobs
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Track match rate trends over time
                  </p>
                </div>
                <div className="p-6">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total Items
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Matched
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Match Rate
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Time
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {jobs.map((job) => (
                          <tr 
                            key={job.id} 
                            className={`hover:bg-gray-50 ${selectedJob?.id === job.id ? 'bg-blue-50' : ''}`}
                          >
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {new Date(job.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">
                              {job.totalItems.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-semibold text-green-600">
                              {job.matchedItems.toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                job.matchRate >= 0.3 ? 'bg-green-100 text-green-800' :
                                job.matchRate >= 0.15 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {(job.matchRate * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-600">
                              {(job.executionTimeMs / 1000).toFixed(1)}s
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => setSelectedJob(job)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Key Insights */}
            {selectedJob && (
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg shadow p-6 border border-blue-200">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  💡 Key Insights
                </h2>
                <div className="space-y-2 text-sm text-gray-700">
                  {selectedJob.matchRate >= 0.3 ? (
                    <p>✅ <strong>Excellent match rate!</strong> You've achieved the target of 30-40% match rate.</p>
                  ) : selectedJob.matchRate >= 0.15 ? (
                    <p>⚠️ <strong>Good progress.</strong> Match rate is improving but hasn't reached the 30% target yet.</p>
                  ) : (
                    <p>📈 <strong>Room for improvement.</strong> Consider reviewing and approving more patterns to build up matching rules.</p>
                  )}
                  
                  {selectedJob.stageMetrics.length > 0 && (
                    <>
                      {(selectedJob.stageMetrics.find(m => m.stage === 'Stage 1')?.matchRate ?? 0) >= 0.25 && (
                        <p>🎯 <strong>Strong deterministic matching!</strong> Stage 1 is performing well, minimizing API costs.</p>
                      )}
                      {(selectedJob.stageMetrics.find(m => m.stage === 'Stage 2')?.matchesFound ?? 0) > 0 && (
                        <p>🔍 <strong>Fuzzy matching is contributing.</strong> Stage 2 is finding additional matches with cost-aware scoring.</p>
                      )}
                    </>
                  )}
                  
                  <p className="mt-4 pt-4 border-t border-blue-200">
                    <strong>Tip:</strong> Approve matches with clear patterns to enable bulk approvals and build up your rule library for future runs.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
