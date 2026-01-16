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
  vendor?: string; // V4: Vendor from interchange (e.g., "GSP")
  matchedOn?: string; // V4: "MERRILL" | "VENDOR"
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
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (projectId) {
      loadMatches();
    }
  }, [projectId, filter, methodFilter, currentPage, rowsPerPage, searchQuery, sortBy, sortOrder]);

  const loadMatches = async () => {
    try {
      setLoading(true);
      const statusParam = filter === 'all' ? 'all' : filter.toUpperCase();
      const methodParam = methodFilter === 'all' ? 'all' : methodFilter.toUpperCase();
      const searchParam = searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : '';
      const sortParam = `&sortBy=${sortBy}&sortOrder=${sortOrder}`;
      const res = await fetch(
        `/api/match?projectId=${projectId}&status=${statusParam}&method=${methodParam}&page=${currentPage}&limit=${rowsPerPage}${searchParam}${sortParam}`
      );
      if (!res.ok) throw new Error('Failed to load matches');
      const data = await res.json();
      setMatches(data.matches || []);
      setTotalCount(data.metadata?.total || 0);
      setTotalPages(data.metadata?.totalPages || 0);
      // Clear selection when page changes
      setSelectedMatches(new Set());
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

  // Server now handles filtering and sorting via pagination
  // filteredMatches is just matches from current page
  const filteredMatches = matches;

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
          <div className="flex gap-3 flex-wrap">
            <a
              href={`/api/match/export?projectId=${projectId}&status=confirmed`}
              download
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium inline-flex items-center gap-2"
            >
              📥 Export Confirmed
            </a>
            <a
              href={`/api/match/export?projectId=${projectId}&status=pending`}
              download
              className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium inline-flex items-center gap-2"
            >
              📥 Export Pending
            </a>
            {selectedMatches.size > 0 && (
              <a
                href={`/api/match/export?projectId=${projectId}&ids=${Array.from(selectedMatches).join(',')}`}
                download
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium inline-flex items-center gap-2"
              >
                📥 Export Selected ({selectedMatches.size})
              </a>
            )}
            {methodFilter !== 'all' && (
              <a
                href={`/api/match/export?projectId=${projectId}&method=${methodFilter}&status=${filter === 'all' ? 'all' : filter.toUpperCase()}`}
                download
                className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium inline-flex items-center gap-2"
              >
                📥 Export {methodFilter === 'EXACT_NORMALIZED' ? 'Exact' : methodFilter === 'FUZZY_SUBSTRING' ? 'Fuzzy' : methodFilter === 'AI' ? 'AI' : methodFilter === 'WEB_SEARCH' ? 'Web Search' : methodFilter}
              </a>
            )}
            <label className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium inline-flex items-center gap-2 cursor-pointer">
              📄 Import CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                className="hidden"
              />
            </label>
            <button
              onClick={() => router.push(`/analytics?projectId=${projectId}`)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
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
          <div className="flex flex-wrap gap-4 items-center mb-4">
            <div className="flex-1 min-w-[300px]">
              <label className="text-sm text-gray-600 mr-2">🔍 Search:</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1); // Reset to first page on search
                }}
                placeholder="Search by part number, description..."
                className="border rounded px-3 py-1.5 w-full max-w-md"
              />
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                title="Clear search"
              >
                ✕ Clear
              </button>
            )}
          </div>
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
              <label className="text-sm text-gray-600 mr-2">Method:</label>
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
                className="border rounded px-3 py-1.5"
              >
                <option value="all">All Methods</option>
                <option value="INTERCHANGE">Interchange</option>
                <option value="EXACT_NORMALIZED">Exact Match</option>
                <option value="FUZZY_SUBSTRING">Fuzzy Match</option>
                <option value="AI">AI Match</option>
                <option value="WEB_SEARCH">Web Search</option>
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
                title={`Sort ${sortOrder === 'asc' ? 'Ascending' : 'Descending'}`}
              >
                {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            </div>
            <div className="ml-auto text-sm text-gray-500">
              Total: {totalCount} matches
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
                <div className="flex items-center justify-between">
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
                  
                  {/* Batch Selection Dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Select by:</span>
                    <select
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === 'none') return;
                        
                        let matchesToSelect: string[] = [];
                        
                        // Method-based selection
                        if (value === 'INTERCHANGE') {
                          matchesToSelect = filteredMatches.filter(m => m.method === 'INTERCHANGE').map(m => m.id);
                        } else if (value === 'EXACT_NORM') {
                          matchesToSelect = filteredMatches.filter(m => m.method === 'EXACT_NORM').map(m => m.id);
                        } else if (value === 'FUZZY_SUBSTRING') {
                          matchesToSelect = filteredMatches.filter(m => m.method === 'FUZZY_SUBSTRING').map(m => m.id);
                        } else if (value === 'AI') {
                          matchesToSelect = filteredMatches.filter(m => m.method === 'AI').map(m => m.id);
                        } else if (value === 'WEB_SEARCH') {
                          matchesToSelect = filteredMatches.filter(m => m.method === 'WEB_SEARCH').map(m => m.id);
                        }
                        // Confidence-based selection
                        else if (value === 'conf_high') {
                          matchesToSelect = filteredMatches.filter(m => m.confidence >= 0.9).map(m => m.id);
                        } else if (value === 'conf_medium') {
                          matchesToSelect = filteredMatches.filter(m => m.confidence >= 0.7 && m.confidence < 0.9).map(m => m.id);
                        } else if (value === 'conf_low') {
                          matchesToSelect = filteredMatches.filter(m => m.confidence < 0.7).map(m => m.id);
                        }
                        
                        setSelectedMatches(new Set(matchesToSelect));
                        e.target.value = 'none'; // Reset dropdown
                      }}
                      className="border rounded px-3 py-1.5 text-sm"
                    >
                      <option value="none">Choose...</option>
                      <optgroup label="By Method">
                        <option value="INTERCHANGE">Interchange Matches</option>
                        <option value="EXACT_NORMALIZED">Exact Matches</option>
                        <option value="FUZZY_SUBSTRING">Fuzzy Matches</option>
                        <option value="AI">AI Matches</option>
                        <option value="WEB_SEARCH">Web Search Matches</option>
                      </optgroup>
                      <optgroup label="By Confidence">
                        <option value="conf_high">High Confidence (≥90%)</option>
                        <option value="conf_medium">Medium Confidence (70-89%)</option>
                        <option value="conf_low">Low Confidence (&lt;70%)</option>
                      </optgroup>
                    </select>
                    
                    {/* Rules Management Button */}
                    <button
                      onClick={() => router.push(`/rules?projectId=${projectId}`)}
                      className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 text-sm font-medium flex items-center gap-2"
                      title="Manage matching rules"
                    >
                      ⚙️ Rules
                    </button>
                  </div>
                </div>
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
                        {match.storeItem.lineCode && (
                          <div>
                            <span className="text-xs text-gray-500 uppercase">Line Code</span>
                            <p className="text-sm font-medium text-blue-600">{match.storeItem.lineCode}</p>
                          </div>
                        )}
                        {match.storeItem.description && (
                          <div>
                            <span className="text-xs text-gray-500 uppercase">Description</span>
                            <p className="text-sm">{match.storeItem.description}</p>
                          </div>
                        )}
                        {match.storeItem.cost !== undefined && match.storeItem.cost !== null && (
                          <div>
                            <span className="text-xs text-gray-500 uppercase">Cost</span>
                            <p className="text-sm font-semibold text-green-600">${match.storeItem.cost.toFixed(2)}</p>
                          </div>
                        )}
                        {match.vendor && (
                          <div>
                            <span className="text-xs text-gray-500 uppercase">Vendor</span>
                            <p className="text-sm font-medium text-blue-600">{match.vendor}</p>
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
                          {(match.targetItem as any).lineCode && (
                            <div>
                              <span className="text-xs text-gray-500 uppercase">Line Code</span>
                              <p className="text-sm font-medium text-blue-600">{(match.targetItem as any).lineCode}</p>
                            </div>
                          )}
                          {match.targetItem.description && (
                            <div>
                              <span className="text-xs text-gray-500 uppercase">Description</span>
                              <p className="text-sm">{match.targetItem.description}</p>
                            </div>
                          )}
                          {match.targetItem.cost !== undefined && match.targetItem.cost !== null && (
                            <div>
                              <span className="text-xs text-gray-500 uppercase">Cost</span>
                              <p className="text-sm font-semibold text-green-600">${match.targetItem.cost.toFixed(2)}</p>
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

      {/* Pagination Control Bar */}
      {totalCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                Showing {((currentPage - 1) * rowsPerPage) + 1} to {Math.min(currentPage * rowsPerPage, totalCount)} of {totalCount}
              </span>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Rows per page:</label>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setRowsPerPage(value === 0 ? totalCount : value);
                    setCurrentPage(1);
                  }}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="20">20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="0">ALL</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                ← Previous
              </button>
              <span className="text-sm text-gray-700 font-medium">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}

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
