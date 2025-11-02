'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

interface MatchResult {
  id: string;
  arnoldItem: any;
  supplierItem: any;
  matchStage: string;
  confidenceScore: number;
  matchReasons: string[];
  status: string;
  enrichmentData: any[];
}

export default function MatchPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');

  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState<string>('all');
  const [enrichmentForm, setEnrichmentForm] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (projectId) {
      fetchMatches();
    }
  }, [projectId, filter]);

  const fetchMatches = async () => {
    try {
      setIsLoading(true);
      const filterParam = filter !== 'all' ? `&status=${filter}` : '';
      const response = await fetch(`/api/match?projectId=${projectId}${filterParam}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch matches');
      }

      setMatches(data.matches || []);
      setStats(data.stats || null);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching matches');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async (matchId: string) => {
    try {
      setIsProcessing(true);
      const response = await fetch('/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          action: 'confirm',
          enrichmentData: enrichmentForm,
          confirmedBy: 'user', // In production, use actual user ID
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to confirm match');
      }

      // Refresh matches
      await fetchMatches();
      setSelectedMatch(null);
      setEnrichmentForm({});
    } catch (err: any) {
      alert(err.message || 'Failed to confirm match');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async (matchId: string) => {
    try {
      setIsProcessing(true);
      const response = await fetch('/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId,
          action: 'reject',
          confirmedBy: 'user',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject match');
      }

      // Refresh matches
      await fetchMatches();
      setSelectedMatch(null);
    } catch (err: any) {
      alert(err.message || 'Failed to reject match');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleWebSearch = async (arnoldItemId: string) => {
    try {
      setIsProcessing(true);
      const response = await fetch('/api/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arnoldItemId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to perform web search');
      }

      alert('Web search completed! Check the results.');
      await fetchMatches();
    } catch (err: any) {
      alert(err.message || 'Failed to perform web search');
    } finally {
      setIsProcessing(false);
    }
  };

  const getConfidenceClass = (score: number) => {
    if (score >= 0.9) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (score >= 0.7) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  };

  const getStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      part_number: 'Part Number Match',
      part_name: 'Part Name Match',
      description: 'Description Match',
      web_search: 'Web Search Match',
      manual: 'Manual Match',
      no_match: 'No Match',
    };
    return labels[stage] || stage;
  };

  if (!projectId) {
    return (
      <main className="flex min-h-screen flex-col items-center p-8 md:p-24">
        <div className="w-full max-w-4xl">
          <h1 className="text-3xl font-bold mb-8">Match Workflow</h1>
          <div className="bg-yellow-100 text-yellow-800 p-4 rounded-md">
            <p>No project selected. Please upload files first.</p>
            <Link href="/upload" className="text-blue-600 underline mt-2 inline-block">
              Go to Upload
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-24">
      <div className="w-full max-w-7xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Match Workflow</h1>
          <div className="flex space-x-4">
            <Link
              href={`/upload?projectId=${projectId}`}
              className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              Upload More Files
            </Link>
            <Link
              href="/"
              className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              Back to Home
            </Link>
          </div>
        </div>

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
              <div className="text-sm text-gray-500 dark:text-gray-400">Total Matches</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>
            <div className="bg-green-100 dark:bg-green-900 p-4 rounded-lg shadow">
              <div className="text-sm text-green-700 dark:text-green-300">Confirmed</div>
              <div className="text-2xl font-bold text-green-800 dark:text-green-200">
                {stats.byStatus.confirmed}
              </div>
            </div>
            <div className="bg-yellow-100 dark:bg-yellow-900 p-4 rounded-lg shadow">
              <div className="text-sm text-yellow-700 dark:text-yellow-300">Pending</div>
              <div className="text-2xl font-bold text-yellow-800 dark:text-yellow-200">
                {stats.byStatus.pending}
              </div>
            </div>
            <div className="bg-red-100 dark:bg-red-900 p-4 rounded-lg shadow">
              <div className="text-sm text-red-700 dark:text-red-300">Rejected</div>
              <div className="text-2xl font-bold text-red-800 dark:text-red-200">
                {stats.byStatus.rejected}
              </div>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="mb-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-4 py-2 border rounded-md dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="all">All Matches</option>
            <option value="pending">Pending Only</option>
            <option value="confirmed">Confirmed Only</option>
            <option value="rejected">Rejected Only</option>
          </select>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
          </div>
        ) : error ? (
          <div className="p-4 bg-red-100 text-red-700 rounded-md">
            <p>{error}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Match List */}
            <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md max-h-[800px] overflow-y-auto">
              <h2 className="text-xl font-semibold mb-4">Matches ({matches.length})</h2>

              <div className="space-y-4">
                {matches.map((match) => (
                  <div
                    key={match.id}
                    className={`p-4 rounded-md cursor-pointer border transition-colors ${
                      selectedMatch?.id === match.id
                        ? 'border-black dark:border-white'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                    onClick={() => setSelectedMatch(match)}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium font-mono text-sm">
                        {match.arnoldItem.partNumber}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full ${getConfidenceClass(match.confidenceScore)}`}>
                        {(match.confidenceScore * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">
                      {getStageLabel(match.matchStage)}
                    </div>
                    <div className="text-xs">
                      <span
                        className={`px-2 py-1 rounded ${
                          match.status === 'confirmed'
                            ? 'bg-green-200 text-green-800'
                            : match.status === 'rejected'
                            ? 'bg-red-200 text-red-800'
                            : 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        {match.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Match Details */}
            <div className="lg:col-span-2">
              {selectedMatch ? (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold">Match Details</h2>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-500">{getStageLabel(selectedMatch.matchStage)}</span>
                      <span className={`text-sm px-3 py-1 rounded-full ${getConfidenceClass(selectedMatch.confidenceScore)}`}>
                        {(selectedMatch.confidenceScore * 100).toFixed(0)}% Confidence
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Arnold Item */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
                      <h3 className="text-lg font-medium mb-3">Arnold Inventory</h3>
                      <div className="space-y-2">
                        <div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Part Number:</span>
                          <p className="font-mono">{selectedMatch.arnoldItem.partNumber}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Usage (Last 12):</span>
                          <p>{selectedMatch.arnoldItem.usageLast12 || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Cost:</span>
                          <p>${selectedMatch.arnoldItem.cost?.toFixed(2) || 'N/A'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Supplier Item */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
                      <h3 className="text-lg font-medium mb-3">Supplier Catalog</h3>
                      {selectedMatch.supplierItem ? (
                        <div className="space-y-2">
                          <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">Part Number:</span>
                            <p className="font-mono">{selectedMatch.supplierItem.partFull}</p>
                          </div>
                          <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">Line Code:</span>
                            <p>{selectedMatch.supplierItem.lineCode}</p>
                          </div>
                          <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">Description:</span>
                            <p>{selectedMatch.supplierItem.description || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">Qty Available:</span>
                            <p>{selectedMatch.supplierItem.qtyAvail || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">Cost:</span>
                            <p>${selectedMatch.supplierItem.cost?.toFixed(2) || 'N/A'}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-gray-500">No supplier match found</p>
                      )}
                    </div>
                  </div>

                  {/* Match Reasons */}
                  <div className="mb-6">
                    <h3 className="text-lg font-medium mb-3">Match Reasons</h3>
                    <ul className="list-disc pl-5 space-y-1">
                      {selectedMatch.matchReasons.map((reason: string, index: number) => (
                        <li key={index} className="text-sm">{reason}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Enrichment Form */}
                  {selectedMatch.status === 'pending' && (
                    <div className="mb-6">
                      <h3 className="text-lg font-medium mb-3">Additional Information (Optional)</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">Box Size</label>
                          <input
                            type="text"
                            value={enrichmentForm.box_size || ''}
                            onChange={(e) => setEnrichmentForm({ ...enrichmentForm, box_size: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                            placeholder="e.g., 25 pieces"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Qty Per Box</label>
                          <input
                            type="number"
                            value={enrichmentForm.qty_per_box || ''}
                            onChange={(e) => setEnrichmentForm({ ...enrichmentForm, qty_per_box: e.target.value })}
                            className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                            placeholder="e.g., 25"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex space-x-4">
                    {selectedMatch.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleConfirm(selectedMatch.id)}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
                        >
                          {isProcessing ? 'Processing...' : 'Confirm Match'}
                        </button>
                        <button
                          onClick={() => handleReject(selectedMatch.id)}
                          disabled={isProcessing}
                          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400"
                        >
                          Reject Match
                        </button>
                        {selectedMatch.matchStage === 'no_match' && (
                          <button
                            onClick={() => handleWebSearch(selectedMatch.arnoldItem.id)}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                          >
                            Try Web Search
                          </button>
                        )}
                      </>
                    )}
                    {selectedMatch.status === 'confirmed' && (
                      <div className="text-green-600 font-medium">✓ Match Confirmed</div>
                    )}
                    {selectedMatch.status === 'rejected' && (
                      <div className="text-red-600 font-medium">✗ Match Rejected</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex flex-col items-center justify-center h-full">
                  <p className="text-gray-500 dark:text-gray-400 mb-4">
                    Select a match from the list to view details
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
