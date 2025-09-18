'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Demo() {
  const [isLoading, setIsLoading] = useState(true);
  const [matches, setMatches] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<any>(null);

  useEffect(() => {
    const fetchSampleMatches = async () => {
      try {
        const response = await fetch('/api/match');
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to fetch sample matches');
        }
        
        setMatches(data.matches || []);
      } catch (err: any) {
        setError(err.message || 'An error occurred while fetching sample matches');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSampleMatches();
  }, []);

  const handleSelectMatch = (match: any) => {
    setSelectedMatch(match);
  };

  const getConfidenceClass = (score: number) => {
    if (score >= 0.9) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    if (score >= 0.7) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  };

  const getConfidenceStars = (score: number) => {
    const fullStars = Math.floor(score * 5);
    let stars = '';
    for (let i = 0; i < fullStars; i++) {
      stars += '★';
    }
    for (let i = fullStars; i < 5; i++) {
      stars += '☆';
    }
    return stars;
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-24">
      <div className="w-full max-w-6xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Inventory Matching Demo</h1>
          <Link 
            href="/"
            className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            Back to Home
          </Link>
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
            <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Potential Matches</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {matches.length} matches found in sample data
              </p>
              
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {matches.map((match, index) => (
                  <div 
                    key={index}
                    className={`p-4 rounded-md cursor-pointer border transition-colors
                      ${selectedMatch === match 
                        ? 'border-black dark:border-white' 
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    onClick={() => handleSelectMatch(match)}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">
                        {match.arnoldItem.lineCode} {match.arnoldItem.partNumber}
                      </span>
                      <span 
                        className={`text-xs px-2 py-1 rounded-full ${getConfidenceClass(match.confidenceScore)}`}
                      >
                        {(match.confidenceScore * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 truncate">
                      {match.arnoldItem.description}
                    </p>
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {getConfidenceStars(match.confidenceScore)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="lg:col-span-2">
              {selectedMatch ? (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold">Match Details</h2>
                    <span 
                      className={`text-sm px-3 py-1 rounded-full ${getConfidenceClass(selectedMatch.confidenceScore)}`}
                    >
                      {getConfidenceStars(selectedMatch.confidenceScore)} {(selectedMatch.confidenceScore * 100).toFixed(0)}% Confidence
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
                      <h3 className="text-lg font-medium mb-3">Arnold Inventory</h3>
                      <div className="space-y-2">
                        <div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Line Code:</span>
                          <p className="font-mono">{selectedMatch.arnoldItem.lineCode}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Part Number:</span>
                          <p className="font-mono">{selectedMatch.arnoldItem.partNumber}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Description:</span>
                          <p>{selectedMatch.arnoldItem.description}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Unit:</span>
                          <p>{selectedMatch.arnoldItem.unitOfIssue}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Price:</span>
                          <p>${selectedMatch.arnoldItem.unitPrice.toFixed(2)}</p>
                        </div>
                        {selectedMatch.arnoldItem.piecesPerBox && (
                          <div>
                            <span className="text-sm text-gray-500 dark:text-gray-400">Pieces Per Box:</span>
                            <p>{selectedMatch.arnoldItem.piecesPerBox}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4">
                      <h3 className="text-lg font-medium mb-3">Supplier Catalog</h3>
                      <div className="space-y-2">
                        <div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Line Code:</span>
                          <p className="font-mono">{selectedMatch.supplierItem.supplierLineCode}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Part Number:</span>
                          <p className="font-mono">{selectedMatch.supplierItem.supplierPartNumber}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Description:</span>
                          <p>{selectedMatch.supplierItem.description}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Unit:</span>
                          <p>{selectedMatch.supplierItem.unitOfIssue}</p>
                        </div>
                        <div>
                          <span className="text-sm text-gray-500 dark:text-gray-400">Price:</span>
                          <p>${selectedMatch.supplierItem.unitPrice.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6">
                    <h3 className="text-lg font-medium mb-3">Match Reasons</h3>
                    <ul className="list-disc pl-5 space-y-1">
                      {selectedMatch.matchReasons.map((reason: string, index: number) => (
                        <li key={index} className="text-sm">{reason}</li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="mt-6 flex space-x-4">
                    <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                      Confirm Match
                    </button>
                    <button className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
                      Reject Match
                    </button>
                    <button className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
                      Skip
                    </button>
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
