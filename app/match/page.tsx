'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface MatchCandidate {
  id: string;
  storeItem: {
    partNumber: string;
    lineCode?: string;
    description?: string;
  };
  targetId: string;
  targetType: string;
  confidence: number;
  method: string;
  status: string;
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <h3 className="font-semibold text-sm text-gray-500 mb-2">Store Item</h3>
                    <p className="font-mono text-sm">{match.storeItem.partNumber}</p>
                    {match.storeItem.lineCode && (
                      <p className="text-sm text-gray-600">Line: {match.storeItem.lineCode}</p>
                    )}
                    {match.storeItem.description && (
                      <p className="text-sm text-gray-600 mt-1">{match.storeItem.description}</p>
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold text-sm text-gray-500 mb-2">Match Details</h3>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Confidence:</span>
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          match.confidence >= 95 ? 'bg-green-100 text-green-800' :
                          match.confidence >= 85 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-orange-100 text-orange-800'
                        }`}>
                          {match.confidence}%
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">Method: {match.method}</p>
                      <p className="text-sm text-gray-600">Target: {match.targetType}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    {match.status === 'PENDING' ? (
                      <>
                        <button
                          onClick={() => handleConfirm(match.id)}
                          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => handleReject(match.id)}
                          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span className={`px-4 py-2 rounded font-semibold ${
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
