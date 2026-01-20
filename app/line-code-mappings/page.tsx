'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface Mapping {
  id: string;
  scope: 'project' | 'global';
  projectId: string | null;
  projectName: string | null;
  clientLineCode: string;
  manufacturerName: string | null;
  manufacturerLineCode: string | null;
  confidence: number;
  source: string;
  notes: string | null;
  createdAt: string;
}

export default function LineCodeMappingsPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');

  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'project' | 'global'>('all');

  // Create form state
  const [createForm, setCreateForm] = useState({
    scope: 'project' as 'project' | 'global',
    projectId: projectId || '',
    clientLineCode: '',
    manufacturerName: '',
    manufacturerLineCode: '',
    confidence: 1.0,
    source: 'manual',
    notes: '',
  });

  useEffect(() => {
    loadMappings();
  }, [projectId, scopeFilter]);

  const loadMappings = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (scopeFilter !== 'all') params.set('scope', scopeFilter);

      const res = await fetch(`/api/line-code-mappings?${params}`);
      if (!res.ok) throw new Error('Failed to load mappings');

      const data = await res.json();
      setMappings(data.mappings || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createMapping = async () => {
    try {
      const res = await fetch('/api/line-code-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create mapping');
      }

      setShowCreateModal(false);
      setCreateForm({
        scope: 'project',
        projectId: projectId || '',
        clientLineCode: '',
        manufacturerName: '',
        manufacturerLineCode: '',
        confidence: 1.0,
        source: 'manual',
        notes: '',
      });
      loadMappings();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const deleteMapping = async (id: string, scope: 'project' | 'global') => {
    if (!confirm('Are you sure you want to delete this mapping?')) return;

    try {
      const res = await fetch(`/api/line-code-mappings/${id}?scope=${scope}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete mapping');
      }

      loadMappings();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const filteredMappings = mappings.filter(m => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        m.clientLineCode.toLowerCase().includes(query) ||
        m.manufacturerLineCode?.toLowerCase().includes(query) ||
        m.manufacturerName?.toLowerCase().includes(query) ||
        m.projectName?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Line Code Mappings</h1>
        <p className="text-gray-600">
          Manage client-to-manufacturer line code mappings for preprocessing
        </p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-800 p-4 rounded mb-6">
          {error}
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-center">
          <input
            type="text"
            placeholder="Search mappings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border rounded"
          />

          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as any)}
            className="px-3 py-2 border rounded"
          >
            <option value="all">All Scopes</option>
            <option value="project">Project Only</option>
            <option value="global">Global Only</option>
          </select>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + Create Mapping
          </button>

          <button
            onClick={loadMappings}
            className="px-4 py-2 bg-gray-100 border rounded hover:bg-gray-200"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Mappings Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client Line Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Manufacturer</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mfr Line Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Loading mappings...
                </td>
              </tr>
            ) : filteredMappings.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No mappings found
                </td>
              </tr>
            ) : (
              filteredMappings.map((mapping) => (
                <tr key={mapping.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        mapping.scope === 'global'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {mapping.scope}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold">{mapping.clientLineCode}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{mapping.manufacturerName || '-'}</td>
                  <td className="px-4 py-3 font-mono font-semibold">{mapping.manufacturerLineCode || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{mapping.projectName || '-'}</td>
                  <td className="px-4 py-3 text-sm">{(mapping.confidence * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deleteMapping(mapping.id, mapping.scope)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold mb-4">Create Line Code Mapping</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Scope</label>
                <select
                  value={createForm.scope}
                  onChange={(e) => setCreateForm({ ...createForm, scope: e.target.value as any })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="project">Project-Specific</option>
                  <option value="global">Global</option>
                </select>
              </div>

              {createForm.scope === 'project' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Project ID</label>
                  <input
                    type="text"
                    value={createForm.projectId}
                    onChange={(e) => setCreateForm({ ...createForm, projectId: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                    placeholder="Enter project ID"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">Client Line Code *</label>
                <input
                  type="text"
                  value={createForm.clientLineCode}
                  onChange={(e) => setCreateForm({ ...createForm, clientLineCode: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="e.g., GS"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Manufacturer Name</label>
                <input
                  type="text"
                  value={createForm.manufacturerName}
                  onChange={(e) => setCreateForm({ ...createForm, manufacturerName: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="e.g., Gates"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Manufacturer Line Code *</label>
                <input
                  type="text"
                  value={createForm.manufacturerLineCode}
                  onChange={(e) => setCreateForm({ ...createForm, manufacturerLineCode: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="e.g., GSP"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Confidence</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={createForm.confidence}
                  onChange={(e) => setCreateForm({ ...createForm, confidence: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Notes</label>
                <textarea
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  rows={2}
                  placeholder="Optional notes"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={createMapping}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
