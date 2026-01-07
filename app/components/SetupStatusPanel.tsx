'use client';

import { useEffect, useState } from 'react';

interface IndexStatus {
  name: string;
  displayName: string;
  exists: boolean;
  isBuilding: boolean;
  isValid: boolean;
  sizeHuman: string;
  critical: boolean;
  estimatedTimeMins: number;
}

interface SetupStatus {
  isComplete: boolean;
  isReady: boolean;
  extensionEnabled: boolean;
  totalIndexes: number;
  readyIndexes: number;
  buildingIndexes: number;
  failedIndexes: number;
  indexes: IndexStatus[];
  message: string;
  estimatedWaitMins: number;
}

export default function SetupStatusPanel() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/admin/setup-status');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data.status);
        setError(null);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    
    // Auto-refresh every 30 seconds if indexes are building
    const interval = setInterval(() => {
      if (status?.buildingIndexes || 0 > 0) {
        fetchStatus();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [status?.buildingIndexes]);

  if (loading) {
    return (
      <div className="p-4 border rounded-lg bg-gray-50">
        <p className="text-gray-600">Loading setup status...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 border-2 border-red-200 rounded-lg bg-red-50">
        <h3 className="font-bold text-red-800 mb-2">❌ Error</h3>
        <p className="text-red-700">{error}</p>
        <button
          onClick={fetchStatus}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!status) return null;

  const getStatusColor = () => {
    if (status.isComplete) return 'bg-green-50 border-green-200';
    if (status.isReady) return 'bg-blue-50 border-blue-200';
    if (status.buildingIndexes > 0) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const getStatusIcon = () => {
    if (status.isComplete) return '✅';
    if (status.isReady) return '✅';
    if (status.buildingIndexes > 0) return '⏳';
    return '❌';
  };

  return (
    <div className={`p-6 border-2 rounded-lg ${getStatusColor()}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold flex items-center gap-2">
          {getStatusIcon()} Matching System Status
        </h3>
        <button
          onClick={fetchStatus}
          className="px-3 py-1 text-sm bg-white border rounded hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <p className="text-lg mb-4">{status.message}</p>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-3 rounded border">
          <p className="text-sm text-gray-600">Total Indexes</p>
          <p className="text-2xl font-bold">{status.totalIndexes}</p>
        </div>
        <div className="bg-white p-3 rounded border">
          <p className="text-sm text-gray-600">Ready</p>
          <p className="text-2xl font-bold text-green-600">{status.readyIndexes}</p>
        </div>
        <div className="bg-white p-3 rounded border">
          <p className="text-sm text-gray-600">Building</p>
          <p className="text-2xl font-bold text-yellow-600">{status.buildingIndexes}</p>
        </div>
        <div className="bg-white p-3 rounded border">
          <p className="text-sm text-gray-600">Failed</p>
          <p className="text-2xl font-bold text-red-600">{status.failedIndexes}</p>
        </div>
      </div>

      {status.buildingIndexes > 0 && (
        <div className="mb-4 p-3 bg-yellow-100 border border-yellow-300 rounded">
          <p className="font-semibold">⏳ Indexes are building in background</p>
          <p className="text-sm">Estimated time remaining: ~{status.estimatedWaitMins} minutes</p>
          <p className="text-sm mt-1">You can start matching now - it will use adaptive batch sizes</p>
        </div>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer font-semibold">View Index Details</summary>
        <div className="mt-3 space-y-2">
          {status.indexes.map((index) => (
            <div
              key={index.name}
              className={`p-3 rounded border ${
                index.exists && index.isValid
                  ? 'bg-green-50 border-green-200'
                  : index.isBuilding
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-semibold">
                    {index.exists && index.isValid ? '✅' : index.isBuilding ? '⏳' : '⚪'}
                    {' '}{index.displayName}
                    {index.critical && <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded">CRITICAL</span>}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">{index.name}</p>
                </div>
                <div className="text-right">
                  {index.exists && <p className="text-xs text-gray-600">Size: {index.sizeHuman}</p>}
                  {index.isBuilding && <p className="text-xs text-yellow-700">Building (~{index.estimatedTimeMins} min)</p>}
                  {!index.exists && !index.isBuilding && <p className="text-xs text-gray-500">Not created</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
