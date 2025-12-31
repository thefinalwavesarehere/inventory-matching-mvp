/**
 * Python Match Uploader Component
 * 
 * This component uploads inventory files to the Python FastAPI matching service
 * via the Next.js proxy route and downloads the matched results.
 * 
 * Usage: For quick matching without storing in database (direct CSV download)
 */

'use client';

import { useState } from 'react';

interface PythonMatchUploaderProps {
  onMatchComplete?: (csvData: string) => void;
  onMatchError?: (error: string) => void;
}

export default function PythonMatchUploader({
  onMatchComplete,
  onMatchError,
}: PythonMatchUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!validExtensions.includes(fileExtension)) {
      setMessage('Error: Please upload an Excel (.xlsx, .xls) or CSV file');
      return;
    }

    setUploading(true);
    setProgress(0);
    setMessage('Uploading file...');

    try {
      // Create FormData
      const formData = new FormData();
      formData.append('file', file);

      setProgress(20);
      setMessage('Processing with Python matching engine...');

      // Send to Next.js proxy route
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

      const response = await fetch('/api/match/proxy', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      setProgress(80);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      // Get the CSV data
      const csvData = await response.text();
      
      setProgress(100);
      setMessage('Match complete! Downloading results...');

      // Trigger download
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `matched_results_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      if (onMatchComplete) {
        onMatchComplete(csvData);
      }

      // Reset after 2 seconds
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
        setMessage('');
        // Reset file input
        e.target.value = '';
      }, 2000);

    } catch (error: any) {
      console.error('Match error:', error);

      let errorMessage = error.message;
      if (error.name === 'AbortError') {
        errorMessage = 'Matching timed out. The file may be too large. Please try a smaller file or contact support.';
      }

      setMessage(`Error: ${errorMessage}`);

      if (onMatchError) {
        onMatchError(errorMessage);
      }

      setTimeout(() => {
        setUploading(false);
        setProgress(0);
        setMessage('');
        // Reset file input
        e.target.value = '';
      }, 5000);
    }
  };

  return (
    <div className="relative">
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileUpload}
        disabled={uploading}
        id="python-match-file"
        className="hidden"
      />
      <label
        htmlFor="python-match-file"
        className={`block border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
          uploading
            ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
            : 'border-purple-300 bg-purple-50 hover:border-purple-500 hover:bg-purple-100'
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <svg className="w-12 h-12 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <div>
            <div className="text-lg font-semibold text-gray-900">
              {uploading ? 'Matching...' : 'Upload Client Inventory'}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              Click to browse or drag and drop
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Excel (.xlsx, .xls) or CSV files
            </div>
            <div className="text-xs text-purple-600 mt-2 font-medium">
              🐍 Python Matching Engine (Fast & Accurate)
            </div>
          </div>
        </div>
      </label>

      {uploading && (
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-purple-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="mt-2 text-sm text-gray-600">{message}</p>
        </div>
      )}

      {message && !uploading && (
        <p className={`mt-2 text-sm ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
          {message}
        </p>
      )}

      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">📋 Supported Column Names:</h4>
        <ul className="text-xs text-blue-800 space-y-1">
          <li><strong>Part Number:</strong> Part #, Part_Number, Item #, PartNumber, etc.</li>
          <li><strong>Line/Manufacturer:</strong> Line, Manufacturer, Mfg, Brand, etc.</li>
          <li><strong>Cost:</strong> Cost, Price, Unit Cost, Cost $, etc.</li>
        </ul>
        <p className="text-xs text-blue-700 mt-2">
          💡 The system automatically normalizes column names - no need to match exactly!
        </p>
      </div>
    </div>
  );
}
