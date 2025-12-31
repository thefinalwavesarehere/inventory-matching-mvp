/**
 * Quick Match Page
 * 
 * This page provides a simple interface for uploading inventory files
 * and getting matched results via the Python FastAPI matching service.
 * 
 * Unlike the main matching workflow, this provides instant CSV download
 * without storing results in the database.
 */

'use client';

import { useState } from 'react';
import PythonMatchUploader from '../components/PythonMatchUploader';

export default function QuickMatchPage() {
  const [matchStats, setMatchStats] = useState<{
    totalItems: number;
    matched: number;
    matchRate: number;
  } | null>(null);

  const handleMatchComplete = (csvData: string) => {
    // Parse CSV to get stats
    const lines = csvData.split('\n').filter(line => line.trim());
    const totalItems = lines.length - 1; // Exclude header
    
    // Count matched items (those with Matched_SKU)
    let matched = 0;
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',');
      if (columns[3] && columns[3].trim()) { // Matched_SKU is 4th column
        matched++;
      }
    }

    const matchRate = totalItems > 0 ? (matched / totalItems) * 100 : 0;

    setMatchStats({
      totalItems,
      matched,
      matchRate,
    });
  };

  const handleMatchError = (error: string) => {
    console.error('Match error:', error);
    setMatchStats(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Quick Match</h1>
          <p className="mt-2 text-sm text-gray-600">
            Upload your client inventory file and get instant matched results via our Python matching engine.
          </p>
        </div>

        {/* Stats Card */}
        {matchStats && (
          <div className="mb-6 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Match Results</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">{matchStats.totalItems}</div>
                <div className="text-sm text-gray-600 mt-1">Total Items</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">{matchStats.matched}</div>
                <div className="text-sm text-gray-600 mt-1">Matched</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">{matchStats.matchRate.toFixed(1)}%</div>
                <div className="text-sm text-gray-600 mt-1">Match Rate</div>
              </div>
            </div>
          </div>
        )}

        {/* Upload Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Inventory File</h2>
          <PythonMatchUploader
            onMatchComplete={handleMatchComplete}
            onMatchError={handleMatchError}
          />
        </div>

        {/* How it Works */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">How It Works</h2>
          <ol className="space-y-3 text-sm text-gray-700">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-semibold">1</span>
              <span><strong>Upload your file:</strong> Excel or CSV with client inventory (part numbers, manufacturers, costs)</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-semibold">2</span>
              <span><strong>Automatic matching:</strong> Our Python engine matches against the master catalog using the 3-character line code strategy</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center font-semibold">3</span>
              <span><strong>Download results:</strong> Get a CSV with matched SKUs, confidence scores, and cost comparisons</span>
            </li>
          </ol>
        </div>

        {/* Features */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-purple-600 mb-2">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">Fast Processing</h3>
            <p className="text-sm text-gray-600 mt-1">Optimized Python engine handles large files efficiently</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-purple-600 mb-2">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">High Accuracy</h3>
            <p className="text-sm text-gray-600 mt-1">Advanced normalization and fuzzy matching algorithms</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-purple-600 mb-2">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <h3 className="font-semibold text-gray-900">Flexible Input</h3>
            <p className="text-sm text-gray-600 mt-1">Automatically normalizes varied column names</p>
          </div>
        </div>
      </div>
    </div>
  );
}
