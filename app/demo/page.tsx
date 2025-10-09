'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Match, FilterOptions, SortField, SortDirection } from '../lib/types';
import { 
  calculateStatistics, 
  filterMatches, 
  sortMatches, 
  exportToCSV, 
  getUniqueLineCodes,
  groupByConfidence,
  downloadFile
} from '../lib/utils';

export default function Demo() {
  const [isLoading, setIsLoading] = useState(true);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  
  // View state
  const [currentView, setCurrentView] = useState<'dashboard' | 'matches' | 'analytics'>('dashboard');
  
  // Filter and sort state
  const [filters, setFilters] = useState<FilterOptions>({});
  const [sortField, setSortField] = useState<SortField>('confidence');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  
  // Selection state for batch actions
  const [selectedMatches, setSelectedMatches] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchMatches();
  }, []);

  const fetchMatches = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/match');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch matches');
      }
      
      setAllMatches(data.matches || []);
      
      if (data.matches && data.matches.length > 0) {
        setSelectedMatch(data.matches[0]);
      }
      
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching matches');
    } finally {
      setIsLoading(false);
    }
  };

  // Apply filters and sorting
  const displayedMatches = useMemo(() => {
    let filtered = filterMatches(allMatches, filters);
    return sortMatches(filtered, sortField, sortDirection);
  }, [allMatches, filters, sortField, sortDirection]);

  const statistics = useMemo(() => 
    calculateStatistics(displayedMatches), 
    [displayedMatches]
  );

  const groupedMatches = useMemo(() => 
    groupByConfidence(displayedMatches), 
    [displayedMatches]
  );

  const uniqueLineCodes = useMemo(() => 
    getUniqueLineCodes(allMatches), 
    [allMatches]
  );

  const handleExportCSV = () => {
    const csv = exportToCSV(displayedMatches);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(csv, `inventory-matches-${timestamp}.csv`, 'text/csv');
  };

  const handleToggleSelection = (index: number) => {
    const newSelection = new Set(selectedMatches);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedMatches(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedMatches.size === displayedMatches.length) {
      setSelectedMatches(new Set());
    } else {
      setSelectedMatches(new Set(displayedMatches.map((_, i) => i)));
    }
  };

  const getConfidenceClass = (score: number): string => {
    if (score >= 0.9) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (score >= 0.75) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
  };

  const getConfidenceLabel = (score: number): string => {
    if (score >= 0.9) return 'High';
    if (score >= 0.75) return 'Medium';
    return 'Review';
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading matches...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md w-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-red-800 dark:text-red-200 mb-2">Error</h2>
          <p className="text-red-700 dark:text-red-300">{error}</p>
          <button 
            onClick={fetchMatches}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Inventory Matching System</h1>
              <p className="text-gray-600 dark:text-gray-400">
                AI-powered matching between Arnold inventory and CarQuest catalog
              </p>
            </div>
            <Link 
              href="/"
              className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
            >
              ← Home
            </Link>
          </div>

          {/* View Tabs */}
          <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`px-4 py-2 font-medium transition-colors ${
                currentView === 'dashboard'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              📊 Dashboard
            </button>
            <button
              onClick={() => setCurrentView('matches')}
              className={`px-4 py-2 font-medium transition-colors ${
                currentView === 'matches'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              🎯 Matches ({displayedMatches.length})
            </button>
            <button
              onClick={() => setCurrentView('analytics')}
              className={`px-4 py-2 font-medium transition-colors ${
                currentView === 'analytics'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              📈 Analytics
            </button>
          </div>
        </div>

        {/* Dashboard View */}
        {currentView === 'dashboard' && (
          <div className="space-y-6">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Matches</div>
                <div className="text-3xl font-bold text-blue-600">{statistics.totalMatches}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {((statistics.totalMatches / 15) * 100).toFixed(1)}% coverage
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Avg Confidence</div>
                <div className="text-3xl font-bold text-green-600">
                  {(statistics.averageConfidence * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {statistics.highConfidence} high confidence
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Unit Conversions</div>
                <div className="text-3xl font-bold text-purple-600">{statistics.unitConversions}</div>
                <div className="text-xs text-gray-500 mt-1">
                  BOX → EACH normalized
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Value</div>
                <div className="text-3xl font-bold text-orange-600">
                  ${statistics.totalValue.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Inventory value matched
                </div>
              </div>
            </div>

            {/* Confidence Distribution */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">Match Confidence Distribution</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-green-600 font-medium">High (≥90%)</span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {statistics.highConfidence} matches
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div 
                      className="bg-green-600 h-3 rounded-full transition-all"
                      style={{ width: `${(statistics.highConfidence / statistics.totalMatches) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-yellow-600 font-medium">Medium (75-89%)</span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {statistics.mediumConfidence} matches
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div 
                      className="bg-yellow-600 h-3 rounded-full transition-all"
                      style={{ width: `${(statistics.mediumConfidence / statistics.totalMatches) * 100}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-orange-600 font-medium">Needs Review (&lt;75%)</span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {statistics.lowConfidence} matches
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div 
                      className="bg-orange-600 h-3 rounded-full transition-all"
                      style={{ width: `${(statistics.lowConfidence / statistics.totalMatches) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setCurrentView('matches')}
                  className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
                >
                  Review All Matches →
                </button>
                <button
                  onClick={handleExportCSV}
                  className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium"
                >
                  📥 Export to CSV
                </button>
                <button
                  onClick={() => {
                    setFilters({ confidenceMin: 0.9 });
                    setCurrentView('matches');
                  }}
                  className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors font-medium"
                >
                  View High Confidence
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Matches View */}
        {currentView === 'matches' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Filters and Match List */}
            <div className="lg:col-span-1 space-y-4">
              {/* Filters */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                <h3 className="font-semibold mb-3">Filters</h3>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">
                      Confidence Level
                    </label>
                    <select
                      value={filters.confidenceMin || ''}
                      onChange={(e) => setFilters({
                        ...filters,
                        confidenceMin: e.target.value ? parseFloat(e.target.value) : undefined
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    >
                      <option value="">All</option>
                      <option value="0.9">High (≥90%)</option>
                      <option value="0.75">Medium (≥75%)</option>
                      <option value="0.7">All Above Threshold</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">
                      Line Code
                    </label>
                    <select
                      value={filters.lineCode || ''}
                      onChange={(e) => setFilters({
                        ...filters,
                        lineCode: e.target.value || undefined
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                    >
                      <option value="">All</option>
                      {uniqueLineCodes.map(code => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={filters.unitConversion || false}
                        onChange={(e) => setFilters({
                          ...filters,
                          unitConversion: e.target.checked ? true : undefined
                        })}
                        className="rounded"
                      />
                      <span className="text-sm">Unit Conversions Only</span>
                    </label>
                  </div>

                  <button
                    onClick={() => setFilters({})}
                    className="w-full px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>

              {/* Sort and Actions */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                <h3 className="font-semibold mb-3">Sort By</h3>
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 mb-2"
                >
                  <option value="confidence">Confidence</option>
                  <option value="partNumber">Part Number</option>
                  <option value="price">Price</option>
                  <option value="lineCode">Line Code</option>
                </select>
                
                <button
                  onClick={() => setSortDirection(d => d === 'asc' ? 'desc' : 'asc')}
                  className="w-full px-3 py-2 text-sm bg-gray-200 dark:bg-gray-700 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  {sortDirection === 'asc' ? '↑ Ascending' : '↓ Descending'}
                </button>
              </div>

              {/* Match List */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold">Matches ({displayedMatches.length})</h3>
                  <button
                    onClick={handleExportCSV}
                    className="text-sm px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Export
                  </button>
                </div>
                
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {displayedMatches.map((match, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-md cursor-pointer border-2 transition-all hover:shadow-md ${
                        selectedMatch === match
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700'
                      }`}
                      onClick={() => setSelectedMatch(match)}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-mono font-medium text-sm">
                          {match.arnoldItem.partNumber}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full ${getConfidenceClass(match.confidenceScore)}`}>
                          {(match.confidenceScore * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                        {match.arnoldItem.description}
                      </p>
                      {match.unitConversion?.needsConversion && (
                        <div className="mt-1 text-xs text-purple-600 dark:text-purple-400">
                          🔄 Unit conversion
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Match Details */}
            <div className="lg:col-span-2">
              {selectedMatch ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-semibold">Match Details</h2>
                    <div className="text-right">
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                        Confidence Score
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-mono font-bold">
                          {(selectedMatch.confidenceScore * 100).toFixed(0)}%
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getConfidenceClass(selectedMatch.confidenceScore)}`}>
                          {getConfidenceLabel(selectedMatch.confidenceScore)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {/* Arnold Item */}
                    <div className="border-2 border-blue-200 dark:border-blue-800 rounded-lg p-5 bg-blue-50/50 dark:bg-blue-900/10">
                      <h3 className="text-lg font-semibold mb-4 text-blue-900 dark:text-blue-100">
                        Arnold Motor Supply
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Line Code</span>
                          <p className="font-mono font-semibold text-lg">{selectedMatch.arnoldItem.lineCode}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Part Number</span>
                          <p className="font-mono font-semibold text-lg">{selectedMatch.arnoldItem.partNumber}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Description</span>
                          <p className="text-sm">{selectedMatch.arnoldItem.description}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Unit</span>
                            <p className="font-medium">{selectedMatch.arnoldItem.unitOfIssue}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Price</span>
                            <p className="font-semibold text-green-600 dark:text-green-400">
                              ${selectedMatch.arnoldItem.unitPrice.toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Quantity</span>
                            <p className="font-medium">{selectedMatch.arnoldItem.quantity}</p>
                          </div>
                          {selectedMatch.arnoldItem.piecesPerBox && (
                            <div>
                              <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pieces/Box</span>
                              <p className="font-medium">{selectedMatch.arnoldItem.piecesPerBox}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Supplier Item */}
                    <div className="border-2 border-purple-200 dark:border-purple-800 rounded-lg p-5 bg-purple-50/50 dark:bg-purple-900/10">
                      <h3 className="text-lg font-semibold mb-4 text-purple-900 dark:text-purple-100">
                        Supplier (CarQuest)
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Line Code</span>
                          <p className="font-mono font-semibold text-lg">{selectedMatch.supplierItem.supplierLineCode}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Part Number</span>
                          <p className="font-mono font-semibold text-lg">{selectedMatch.supplierItem.supplierPartNumber}</p>
                        </div>
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Description</span>
                          <p className="text-sm">{selectedMatch.supplierItem.description}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Unit</span>
                            <p className="font-medium">{selectedMatch.supplierItem.unitOfIssue}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Price</span>
                            <p className="font-semibold text-green-600 dark:text-green-400">
                              ${selectedMatch.supplierItem.unitPrice.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Unit Conversion Details */}
                  {selectedMatch.unitConversion?.needsConversion && (
                    <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                      <h3 className="text-lg font-semibold mb-3 text-purple-900 dark:text-purple-100">
                        🔄 Unit Conversion Analysis
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Conversion Ratio</span>
                          <p className="font-semibold text-lg">
                            {selectedMatch.unitConversion.conversionRatio} pieces/box
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Normalized Price</span>
                          <p className="font-semibold text-lg text-green-600 dark:text-green-400">
                            ${selectedMatch.unitConversion.normalizedSupplierPrice?.toFixed(2)}/box
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">Price Match</span>
                          <p className="font-semibold text-lg">
                            {selectedMatch.unitConversion.priceMatchPercentage?.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Match Reasons */}
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Match Analysis</h3>
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                      <ul className="space-y-2">
                        {selectedMatch.matchReasons.map((reason, index) => (
                          <li key={index} className="flex items-start text-sm">
                            <span className="mr-2 mt-0.5">
                              {reason.startsWith('✓') ? '✓' : reason.startsWith('ℹ') ? 'ℹ' : '•'}
                            </span>
                            <span>{reason.replace(/^[✓ℹ]\s*/, '')}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-3">
                    <button className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium">
                      ✓ Approve Match
                    </button>
                    <button className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium">
                      ✗ Reject Match
                    </button>
                    <button className="px-6 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors font-medium">
                      ⚠ Flag for Review
                    </button>
                    <button className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors font-medium">
                      → Skip
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-12 flex flex-col items-center justify-center h-full">
                  <div className="text-6xl mb-4">📦</div>
                  <p className="text-xl text-gray-500 dark:text-gray-400">
                    Select a match to view details
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Analytics View */}
        {currentView === 'analytics' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-semibold mb-6">Match Analytics</h2>
              
              {/* Confidence Groups */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">Matches by Confidence Level</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border-2 border-green-200 dark:border-green-800 rounded-lg p-4 bg-green-50 dark:bg-green-900/10">
                    <div className="text-sm text-green-700 dark:text-green-300 mb-1">High Confidence (≥90%)</div>
                    <div className="text-3xl font-bold text-green-600">{groupedMatches.high.length}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      {groupedMatches.high.map(m => m.arnoldItem.partNumber).join(', ')}
                    </div>
                  </div>
                  
                  <div className="border-2 border-yellow-200 dark:border-yellow-800 rounded-lg p-4 bg-yellow-50 dark:bg-yellow-900/10">
                    <div className="text-sm text-yellow-700 dark:text-yellow-300 mb-1">Medium Confidence (75-89%)</div>
                    <div className="text-3xl font-bold text-yellow-600">{groupedMatches.medium.length}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      {groupedMatches.medium.map(m => m.arnoldItem.partNumber).join(', ')}
                    </div>
                  </div>
                  
                  <div className="border-2 border-orange-200 dark:border-orange-800 rounded-lg p-4 bg-orange-50 dark:bg-orange-900/10">
                    <div className="text-sm text-orange-700 dark:text-orange-300 mb-1">Needs Review (&lt;75%)</div>
                    <div className="text-3xl font-bold text-orange-600">{groupedMatches.low.length}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      {groupedMatches.low.map(m => m.arnoldItem.partNumber).join(', ')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Unit Conversions */}
              <div className="mb-8">
                <h3 className="text-lg font-semibold mb-4">Unit Conversion Summary</h3>
                <div className="bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Total Conversions</div>
                      <div className="text-2xl font-bold text-purple-600">{statistics.unitConversions}</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Perfect Price Matches</div>
                      <div className="text-2xl font-bold text-green-600">{statistics.perfectPriceMatches}</div>
                    </div>
                  </div>
                  <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                    {displayedMatches
                      .filter(m => m.unitConversion?.needsConversion)
                      .map(m => (
                        <div key={m.arnoldItem.partNumber} className="py-1">
                          <span className="font-mono">{m.arnoldItem.partNumber}</span>: 
                          {m.unitConversion?.conversionRatio} pieces/box, 
                          {m.unitConversion?.priceMatchPercentage?.toFixed(1)}% price match
                        </div>
                      ))
                    }
                  </div>
                </div>
              </div>

              {/* Line Code Distribution */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Matches by Line Code</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {uniqueLineCodes.map(code => {
                    const count = displayedMatches.filter(m => m.arnoldItem.lineCode === code).length;
                    return (
                      <div key={code} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-center">
                        <div className="font-mono font-bold text-2xl">{code}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">{count} matches</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

