/**
 * Epic B1: Enhanced Match Page with Bulk Operations
 * 
 * This is an updated version of the match page that integrates:
 * - BulkActionBar component
 * - New bulk operations API
 * - Vendor action bulk updates
 * 
 * To use: Replace app/match/page.tsx with this file
 */

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import BulkApprovalModal from '../components/BulkApprovalModal';
import BulkActionBar, { VendorAction } from '../components/BulkActionBar';

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
  vendorAction?: VendorAction;
  features?: any;
  matchStage?: string;
  rulesApplied?: string[];
  transformationSignature?: string;
  costDifference?: number;
  costSimilarity?: number;
}

export default function MatchPageWithBulkActions() {
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

  /**
   * Epic B1: Bulk Accept using new API
   */
  const handleBulkAccept = async () => {
    if (selectedMatches.size === 0) return;

    if (!confirm(`Accept ${selectedMatches.size} matches?`)) {
      return;
    }

    try {
      setBulkProcessing(true);
      const res = await fetch(`/api/projects/${projectId}/matches/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          operation: 'update_status',
          matchIds: Array.from(selectedMatches), 
          status: 'ACCEPTED'
        }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to accept matches');
      }

      setSelectedMatches(new Set());
      await loadMatches();
      alert(`✓ Successfully accepted ${selectedMatches.size} matches`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setBulkProcessing(false);
    }
  };

  /**
   * Epic B1: Bulk Reject using new API
   */
  const handleBulkReject = async () => {
    if (selectedMatches.size === 0) return;

    if (!confirm(`Reject ${selectedMatches.size} matches?`)) {
      return;
    }

    try {
      setBulkProcessing(true);
      const res = await fetch(`/api/projects/${projectId}/matches/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          operation: 'update_status',
          matchIds: Array.from(selectedMatches), 
          status: 'REJECTED'
        }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to reject matches');
      }

      setSelectedMatches(new Set());
      await loadMatches();
      alert(`✓ Successfully rejected ${selectedMatches.size} matches`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setBulkProcessing(false);
    }
  };

  /**
   * Epic B1: Bulk Set Vendor Action using new API
   */
  const handleBulkSetVendorAction = async (vendorAction: VendorAction) => {
    if (selectedMatches.size === 0) return;

    if (!confirm(`Set vendor action to "${vendorAction}" for ${selectedMatches.size} matches?`)) {
      return;
    }

    try {
      setBulkProcessing(true);
      const res = await fetch(`/api/projects/${projectId}/matches/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          operation: 'update_vendor_action',
          matchIds: Array.from(selectedMatches), 
          vendorAction
        }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update vendor action');
      }

      setSelectedMatches(new Set());
      await loadMatches();
      alert(`✓ Successfully updated vendor action for ${selectedMatches.size} matches`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleClearSelection = () => {
    setSelectedMatches(new Set());
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
        comparison = 0;
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
    <div className="min-h-screen bg-gray-50 py-8 pb-32">
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
              onClick={() => router.push(`/projects/${projectId}`)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            >
              ← Back to Project
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="text-sm text-gray-600 mr-2">Status:</label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="border rounded px-3 py-1.5"
              >
                <option value="all">All</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600 mr-2">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="border rounded px-3 py-1.5"
              >
                <option value="confidence">Confidence</option>
                <option value="method">Method</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="ml-2 px-3 py-1.5 border rounded hover:bg-gray-50"
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
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
                  {selectedMatches.size > 0 && selectedMatches.size < filteredMatches.length && (
                    <span className="text-sm text-gray-500">
                      ({selectedMatches.size} selected)
                    </span>
                  )}
                </label>
              </div>
            )}
            
            {/* Match Cards */}
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
                    
                    {/* Vendor Action Badge */}
                    {match.vendorAction && match.vendorAction !== 'NONE' && (
                      <span className="ml-auto px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                        {match.vendorAction}
                      </span>
                    )}
                  </div>
                  
                  {/* Match details would continue here - same as original */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Store Item */}
                    <div className="border-r pr-6">
                      <h3 className="font-semibold text-lg text-gray-700 mb-3">
                        🏪 Store Item
                      </h3>
                      <div className="space-y-2">
                        <div>
                          <span className="text-xs text-gray-500 uppercase">Part Number</span>
                          <p className="font-mono text-base font-semibold">{match.storeItem.partNumber}</p>
                        </div>
                        {match.storeItem.description && (
                          <div>
                            <span className="text-xs text-gray-500 uppercase">Description</span>
                            <p className="text-sm">{match.storeItem.description}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Supplier Item */}
                    <div>
                      <h3 className="font-semibold text-lg text-gray-700 mb-3">
                        📦 Supplier Item
                      </h3>
                      {match.targetItem && (
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
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Match Info */}
                  <div className="mt-4 pt-4 border-t flex items-center justify-between">
                    <div className="flex gap-4">
                      <span className="text-sm">
                        <span className="text-gray-500">Confidence:</span>{' '}
                        <span className="font-semibold">{(match.confidence * 100).toFixed(1)}%</span>
                      </span>
                      <span className="text-sm">
                        <span className="text-gray-500">Method:</span>{' '}
                        <span className="font-semibold">{match.method}</span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Epic B1: Floating Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedMatches.size}
        onAccept={handleBulkAccept}
        onReject={handleBulkReject}
        onSetVendorAction={handleBulkSetVendorAction}
        onClearSelection={handleClearSelection}
        loading={bulkProcessing}
      />
    </div>
  );
}
