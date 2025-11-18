'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

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
}

export default function MatchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId');
  
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'rejected'>('pending');

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

  const handleConfirm = async (matchId: string) => {
    try {
      const res = await fetch('/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, action: 'confirm' }),
      });
      if (!res.ok) throw new Error('Failed to confirm match');
      loadMatches();
    } catch (err: any) {
      alert(err.message);
    }
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
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Match Review</h1>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            Back to Projects
          </button>
        </div>

        <div className="mb-6 flex gap-2">
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
          <div className="space-y-4">
            {matches.map((match) => (
              <div key={match.id} className="bg-white rounded-lg shadow p-6">
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
        )}
      </div>
    </div>
  );
}
