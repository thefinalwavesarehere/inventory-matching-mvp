'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import BulkApprovalModal from '../components/BulkApprovalModal';

interface MatchCandidate {
  id: string;
  storeItem: {
    partNumber: string;
    lineCode?: string;
    description?: string;
    price?: number;
    cost?: number;
  };
  targetItem?: {
    partNumber: string;
    description?: string;
    price?: number;
    cost?: number;
    listPrice?: number;
  };
  targetId: string;
  targetType: string;
  confidence: number;
  method: string;
  status: string;
  features?: any;
  matchStage?: string;
  rulesApplied?: string[];
  transformationSignature?: string;
  costDifference?: number;
  costSimilarity?: number;
}

export default function MatchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId');
  
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'rejected'>('pending');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'confidence' | 'method' | 'date'>('confidence');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [bulkSuggestion, setBulkSuggestion] = useState<any>(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkModalLoading, setBulkModalLoading] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadMatches();
    }
  }, [projectId, filter]);

  const loadMatches = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/match?projectId=${projectId}&status=${filter === 'all' ? '' : filter.toUpperCase()}`);
      if (!res.ok) throw new Error('Failed to load matches');
      const data = await res.json();
      setMatches(data.matches || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!projectId) {
      alert('Project ID is missing');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', projectId);

      const res = await fetch('/api/match/import', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || error.error || 'Failed to import CSV');
      }

      const result = await res.json();
      
      // Show summary
      alert(
        `Import Complete!\n\n` +
        `Total Rows: ${result.summary.totalRows}\n` +
        `Successful Updates: ${result.summary.successfulUpdates}\n` +
        `Failed Updates: ${result.summary.failedUpdates}\n` +
        `Parse Errors: ${result.summary.parseErrors}\n\n` +
        (result.errors.length > 0 ? `Errors:\n${result.errors.slice(0, 5).join('\n')}` : '')
      );

      // Reload matches to show updated statuses
      loadMatches();
      
      // Reset file input
      event.target.value = '';
    } catch (err: any) {
      console.error('Import error:', err);
      alert(`Error importing CSV: ${err.message}`);
      event.target.value = '';
    }
  };

  const handleConfirm = async (matchId: string) => {
    try {
      const res = await fetch('/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, action: 'confirm' }),
      });
      if (!res.ok) throw new Error('Failed to confirm match');
      
      // After confirming, check for pattern-based bulk approval suggestions
      await detectPatternSuggestion(matchId);
      
      loadMatches();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const detectPatternSuggestion = async (matchId: string) => {
    try {
      const res = await fetch('/api/patterns/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, projectId }),
      });
      
      if (!res.ok) {
        // Pattern detection is optional, don't throw error
        return;
      }
      
      const data = await res.json();
      
      if (data.suggestion && data.suggestion.affectedItems > 1) {
        setBulkSuggestion(data.suggestion);
        setShowBulkModal(true);
      }
    } catch (err) {
      // Silently fail pattern detection
      console.error('Pattern detection failed:', err);
    }
  };

  const handleBulkApprove = async (createRule: boolean) => {
    if (!bulkSuggestion) return;
    
    try {
      setBulkModalLoading(true);
      
      const res = await fetch('/api/patterns/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          pattern: bulkSuggestion.pattern,
          createRule,
        }),
      });
      
      if (!res.ok) throw new Error('Failed to apply bulk approval');
      
      const data = await res.json();
      
      setShowBulkModal(false);
      setBulkSuggestion(null);
      
      // Show success message
      alert(`Successfully approved ${data.approvedCount} matches!`);
      
      // Reload matches
      loadMatches();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBulkModalLoading(false);
    }
  };

  const handleBulkDecline = () => {
    setShowBulkModal(false);
    setBulkSuggestion(null);
  };

  const handleReject = async (matchId: string) => {
    try {
      const res = await fetch('/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, action: 'reject' }),
      });
      if (!res.ok) throw new Error('Failed to reject match');
      loadMatches();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleSelectAll = () => {
    if (selectedMatches.size === filteredMatches.length) {
      setSelectedMatches(new Set());
    } else {
      setSelectedMatches(new Set(filteredMatches.map(m => m.id)));
    }
  };

  const toggleSelect = (matchId: string) => {
    const newSelected = new Set(selectedMatches);
    if (newSelected.has(matchId)) {
      newSelected.delete(matchId);
    } else {
      newSelected.add(matchId);
    }
    setSelectedMatches(newSelected);
  };

  const handleBulkAction = async (action: 'confirm' | 'reject') => {
    if (selectedMatches.size === 0) {
      alert('Please select at least one match');
      return;
    }

    if (!confirm(`Are you sure you want to ${action} ${selectedMatches.size} matches?`)) {
      return;
    }

    try {
      setBulkProcessing(true);
      const res = await fetch('/api/confirm/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          matchIds: Array.from(selectedMatches), 
          action 
        }),
      });
      if (!res.ok) throw new Error(`Failed to ${action} matches`);
      setSelectedMatches(new Set());
      loadMatches();
      alert(`Successfully ${action}ed ${selectedMatches.size} matches`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleEnrichMatches = async () => {
    if (selectedMatches.size === 0) {
      alert('Please select at least one match to enrich');
      return;
    }

    if (!confirm(`Enhance ${selectedMatches.size} matches with web search?\n\nThis will search the web for part details, pricing, and specifications using Perplexity AI.\n\nEstimated cost: ~$${(selectedMatches.size * 0.01).toFixed(2)}`)) {
      return;
    }

    try {
      setEnriching(true);
      const res = await fetch('/api/match/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          matchIds: Array.from(selectedMatches)
        }),
      });
      if (!res.ok) throw new Error('Failed to enrich matches');
      const data = await res.json();
      alert(`Successfully enriched ${data.enrichedCount} matches with web data!\n\nCheck the match details to see the enriched information.`);
      loadMatches();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setEnriching(false);
    }
  };

  // Filter and sort matches
  const filteredMatches = matches
    .filter(m => {
      if (methodFilter === 'all') return true;
      return m.method === methodFilter;
    })
    .sort((a, b) => {
      let comparison = 0;
      
      if (sortBy === 'confidence') {
        comparison = a.confidence - b.confidence;
      } else if (sortBy === 'method') {
        comparison = a.method.localeCompare(b.method);
      } else if (sortBy === 'date') {
        // Assuming matches have a createdAt field, otherwise use confidence as proxy
        comparison = 0; // Will implement when createdAt is available
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  if (!projectId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">No Project Selected</h1>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Match Review</h1>
            <p className="text-gray-600 text-sm mt-1">Review and confirm inventory matches</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/analytics?projectId=${projectId}`)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium flex items-center gap-2"
            >
              📊 Analytics
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              ← Back to Home
            </button>
          </div>
        </div>

        {/* Status Filter */}
        <div className="mb-4 flex justify-between items-center">
          <div className="flex gap-2">
            {['all', 'pending', 'confirmed', 'rejected'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f as any)}
                className={`px-4 py-2 rounded ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border hover:bg-gray-50'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <a
              href={`/api/match/export?projectId=${projectId}&status=confirmed`}
              download
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 inline-flex items-center gap-2"
            >
              📥 Export Confirmed
            </a>
            <a
              href={`/api/match/export?projectId=${projectId}&status=pending`}
              download
              className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 inline-flex items-center gap-2"
            >
              📥 Export Pending
            </a>
            <a
              href={`/api/match/export?projectId=${projectId}&status=all`}
              download
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 inline-flex items-center gap-2"
            >
              📥 Export All
            </a>
            <label className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 inline-flex items-center gap-2 cursor-pointer">
              📄 Import CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Method Filter & Bulk Actions */}
        <div className="mb-6 flex justify-between items-center">
          <div className="flex gap-4 items-center">
            <label className="text-sm font-medium text-gray-700">Filter by Method:</label>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="px-3 py-2 border rounded"
            >
              <option value="all">All Methods</option>
              <option value="INTERCHANGE">Interchange</option>
              <option value="EXACT_NORM">Exact Match</option>
              <option value="FUZZY_SUBSTRING">Fuzzy Match</option>
              <option value="AI">AI Match</option>
              <option value="WEB_SEARCH">Web Search</option>
            </select>
            <label className="text-sm font-medium text-gray-700 ml-6">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'confidence' | 'method' | 'date')}
              className="px-3 py-2 border rounded"
            >
              <option value="confidence">Confidence Score</option>
              <option value="method">Match Method</option>
              <option value="date">Date Created</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 border rounded hover:bg-gray-50"
              title={`Sort ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
            >
              {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
            </button>
            <span className="text-sm text-gray-500">
              Showing {filteredMatches.length} of {matches.length} matches
            </span>
          </div>
          
          {selectedMatches.size > 0 && (
            <div className="flex gap-2">
              <span className="px-3 py-2 bg-blue-50 text-blue-700 rounded font-medium">
                {selectedMatches.size} selected
              </span>
              <button
                onClick={() => handleBulkAction('confirm')}
                disabled={bulkProcessing}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300"
              >
                {bulkProcessing ? 'Processing...' : 'Confirm Selected'}
              </button>
              <button
                onClick={() => handleBulkAction('reject')}
                disabled={bulkProcessing}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300"
              >
                {bulkProcessing ? 'Processing...' : 'Reject Selected'}
              </button>
              <button
                onClick={handleEnrichMatches}
                disabled={enriching || bulkProcessing}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300"
                title="Search the web for part details, pricing, and specifications"
              >
                {enriching ? 'Searching Web...' : '🔍 Enhance with Web Search'}
              </button>
              <button
                onClick={() => setSelectedMatches(new Set())}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Clear Selection
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="text-gray-500">Loading matches...</div>
          </div>
        ) : matches.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">No matches found</p>
          </div>
        ) : (
          <>
            {/* Select All Checkbox */}
            {filteredMatches.length > 0 && (
              <div className="bg-white rounded-lg shadow p-4 mb-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMatches.size === filteredMatches.length && filteredMatches.length > 0}
                    onChange={toggleSelectAll}
                    className="w-5 h-5 rounded border-gray-300"
                  />
                  <span className="font-medium text-gray-700">
                    Select All ({filteredMatches.length} matches)
                  </span>
                </label>
              </div>
            )}
            
            <div className="space-y-4">
              {filteredMatches.map((match) => (
                <div key={match.id} className="bg-white rounded-lg shadow p-6">
                  {/* Checkbox */}
                  <div className="mb-4 flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedMatches.has(match.id)}
                      onChange={() => toggleSelect(match.id)}
                      className="w-5 h-5 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-600">Select this match</span>
                  </div>
                  
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Store Item Column */}
                  <div className="border-r pr-6">
                    <h3 className="font-semibold text-lg text-gray-700 mb-3 flex items-center gap-2">
                      <span className="text-blue-600">🏪</span> Store Item
                    </h3>
                    <div className="space-y-2">
                      <div>
                        <span className="text-xs text-gray-500 uppercase">Part Number</span>
                        <p className="font-mono text-base font-semibold">{match.storeItem.partNumber}</p>
                      </div>
                      {match.storeItem.lineCode && (
                        <div>
                          <span className="text-xs text-gray-500 uppercase">Line</span>
                          <p className="text-sm">{match.storeItem.lineCode}</p>
                        </div>
                      )}
                      {match.storeItem.description && (
                        <div>
                          <span className="text-xs text-gray-500 uppercase">Description</span>
                          <p className="text-sm">{match.storeItem.description}</p>
                        </div>
                      )}
                      {(match.storeItem.price || match.storeItem.cost) && (
                        <div className="flex gap-4 pt-2">
                          {match.storeItem.price && (
                            <div>
                              <span className="text-xs text-gray-500 uppercase">Price</span>
                              <p className="text-sm font-semibold text-green-600">${match.storeItem.price.toFixed(2)}</p>
                            </div>
                          )}
                          {match.storeItem.cost && (
                            <div>
                              <span className="text-xs text-gray-500 uppercase">Cost</span>
                              <p className="text-sm font-semibold text-gray-600">${match.storeItem.cost.toFixed(2)}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Supplier Item Column */}
                  <div>
                    <h3 className="font-semibold text-lg text-gray-700 mb-3 flex items-center gap-2">
                      <span className="text-purple-600">📦</span> Supplier Item
                    </h3>
                    {match.targetItem ? (
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs text-gray-500 uppercase">Part Number</span>
                          <p className="font-mono text-base font-semibold">{match.targetItem.partNumber}</p>
                        </div>
                        {match.targetItem.description && (
                          <div>
                            <span className="text-xs text-gray-500 uppercase">Description</span>
                            <p className="text-sm">{match.targetItem.description}</p>
                          </div>
                        )}
                        {(match.targetItem.price || match.targetItem.cost || match.targetItem.listPrice) && (
                          <div className="flex gap-4 pt-2">
                            {match.targetItem.listPrice && (
                              <div>
                                <span className="text-xs text-gray-500 uppercase">List Price</span>
                                <p className="text-sm font-semibold text-green-600">${match.targetItem.listPrice.toFixed(2)}</p>
                              </div>
                            )}
                            {match.targetItem.price && (
                              <div>
                                <span className="text-xs text-gray-500 uppercase">Price</span>
                                <p className="text-sm font-semibold text-green-600">${match.targetItem.price.toFixed(2)}</p>
                              </div>
                            )}
                            {match.targetItem.cost && (
                              <div>
                                <span className="text-xs text-gray-500 uppercase">Cost</span>
                                <p className="text-sm font-semibold text-gray-600">${match.targetItem.cost.toFixed(2)}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No supplier item data available</p>
                    )}
                  </div>
                </div>

                {/* Match Details & Actions Row */}
                <div className="mt-6 pt-6 border-t flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Confidence:</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        match.confidence >= 0.95 ? 'bg-green-100 text-green-800' :
                        match.confidence >= 0.85 ? 'bg-yellow-100 text-yellow-800' :
                        match.confidence >= 0.60 ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {(match.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-semibold">Method:</span> {match.method}
                    </div>
                    {match.features && (
                      <div className="text-xs text-gray-500">
                        {match.features.partSimilarity && (
                          <span>Part: {(match.features.partSimilarity * 100).toFixed(0)}%</span>
                        )}
                        {match.features.descSimilarity > 0 && (
                          <span className="ml-2">Desc: {(match.features.descSimilarity * 100).toFixed(0)}%</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {match.status === 'PENDING' ? (
                      <>
                        <button
                          onClick={() => handleConfirm(match.id)}
                          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => handleReject(match.id)}
                          className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span className={`px-6 py-2 rounded-lg font-semibold ${
                        match.status === 'CONFIRMED' 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {match.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
      </div>
      
      {/* Bulk Approval Modal */}
      <BulkApprovalModal
        isOpen={showBulkModal}
        suggestion={bulkSuggestion}
        onApprove={handleBulkApprove}
        onDecline={handleBulkDecline}
        loading={bulkModalLoading}
      />
    </div>
  );
}
