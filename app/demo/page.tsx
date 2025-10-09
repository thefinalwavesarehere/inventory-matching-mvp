'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Match } from '../lib/types';

export default function Demo() {
  const [isLoading, setIsLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

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
      
      setMatches(data.matches || []);
      
      // Auto-select first match
      if (data.matches && data.matches.length > 0) {
        setSelectedMatch(data.matches[0]);
      }
      
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching matches');
    } finally {
      setIsLoading(false);
    }
  };

  const getConfidenceClass = (score: number): string => {
    if (score >= 0.9) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (score >= 0.7) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  };

  const getConfidenceStars = (score: number): string => {
    const fullStars = Math.floor(score * 5);
    return '★'.repeat(fullStars) + '☆'.repeat(5 - fullStars);
  };

  const getConfidenceLabel = (score: number): string => {
    if (score >= 0.9) return 'High';
    if (score >= 0.7) return 'Medium';
    return 'Low';
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-8 lg:p-12">
      <div className="w-full max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Inventory Matching Demo</h1>
            <p className="text-gray-600 dark:text-gray-400">
              AI-powered matching between Arnold inventory and supplier catalogs
            </p>
          </div>
          <Link 
            href="/"
            className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
        
        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
          </div>
        )}
        
        {/* Error State */}
        {error && !isLoading && (
          <div className="p-4 bg-red-100 text-red-700 rounded-md">
            <p className="font-semibold">Error</p>
            <p>{error}</p>
          </div>
        )}
        
        {/* Main Content */}
        {!isLoading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Match List Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md sticky top-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Matches Found</h2>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full text-sm font-medium">
                    {matches.length}
                  </span>
                </div>
                
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Click on a match to view details
                </p>
                
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {matches.map((match, index) => (
                    <div 
                      key={index}
                      className={`p-4 rounded-md cursor-pointer border-2 transition-all hover:shadow-md
                        ${selectedMatch === match 
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      onClick={() => setSelectedMatch(match)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-mono font-medium text-sm">
                          {match.arnoldItem.lineCode} {match.arnoldItem.partNumber}
                        </span>
                        <span 
                          className={`text-xs px-2 py-1 rounded-full font-medium ${getConfidenceClass(match.confidenceScore)}`}
                        >
                          {(match.confidenceScore * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mb-2">
                        {match.arnoldItem.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {getConfidenceStars(match.confidenceScore)}
                        </span>
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          {getConfidenceLabel(match.confidenceScore)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Match Details */}
            <div className="lg:col-span-2">
              {selectedMatch ? (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                  {/* Header */}
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-2xl font-semibold">Match Details</h2>
                    <div className="text-right">
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                        Confidence Score
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-mono font-bold">
                          {(selectedMatch.confidenceScore * 100).toFixed(0)}%
                        </span>
                        <span 
                          className={`text-xs px-2 py-1 rounded-full font-medium ${getConfidenceClass(selectedMatch.confidenceScore)}`}
                        >
                          {getConfidenceLabel(selectedMatch.confidenceScore)}
                        </span>
                      </div>
                      <div className="text-lg mt-1">
                        {getConfidenceStars(selectedMatch.confidenceScore)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Item Comparison */}
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
                  
                  {/* Match Reasons */}
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3">Why This Match?</h3>
                    <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4">
                      <ul className="space-y-2">
                        {selectedMatch.matchReasons.map((reason, index) => (
                          <li key={index} className="flex items-start">
                            <span className="text-green-500 mr-2 mt-1">✓</span>
                            <span className="text-sm">{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex flex-wrap gap-3">
                    <button className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors font-medium">
                      ✓ Confirm Match
                    </button>
                    <button className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium">
                      ✗ Reject Match
                    </button>
                    <button className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition-colors font-medium">
                      → Skip
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-gray-800 p-12 rounded-lg shadow-md flex flex-col items-center justify-center h-full">
                  <div className="text-6xl mb-4">📦</div>
                  <p className="text-xl text-gray-500 dark:text-gray-400 mb-2">
                    No match selected
                  </p>
                  <p className="text-sm text-gray-400 dark:text-gray-500">
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

