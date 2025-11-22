'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import FileUploader from '@/app/components/FileUploader';
import WorkflowStatus from '@/app/components/WorkflowStatus';

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    storeItems: number;
    supplierItems: number;
    interchanges: number;
    matchCandidates: number;
  };
}

interface UploadedFile {
  name: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [runningMatch, setRunningMatch] = useState(false);
  const [runningAiMatch, setRunningAiMatch] = useState(false);
  const [runningWebSearch, setRunningWebSearch] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [batchProgress, setBatchProgress] = useState<{
    processed: number;
    total: number;
    remaining: number;
    hasMore: boolean;
    nextOffset: number | null;
  } | null>(null);
  const [aiBatchProgress, setAiBatchProgress] = useState<{
    processed: number;
    total: number;
    remaining: number;
    hasMore: boolean;
    nextOffset: number | null;
    estimatedCost: string;
  } | null>(null);
  const [webSearchBatchProgress, setWebSearchBatchProgress] = useState<{
    processed: number;
    total: number;
    remaining: number;
    hasMore: boolean;
    nextOffset: number | null;
    estimatedCost: string;
  } | null>(null);

  useEffect(() => {
    loadProject();
    loadFiles();
  }, [projectId]);

  const loadProject = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error('Failed to load project');
      const data = await res.json();
      setProject(data.project);
      setEditName(data.project.name);
      setEditDescription(data.project.description || '');
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const loadFiles = async () => {
    try {
      setLoadingFiles(true);
      const res = await fetch(`/api/projects/${projectId}/files`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
      }
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleDeleteFile = async (fileName: string) => {
    if (!confirm(`Are you sure you want to delete ${fileName}?`)) {
      return;
    }

    try {
      const res = await fetch(
        `/api/projects/${projectId}/files?fileName=${encodeURIComponent(fileName)}`,
        { method: 'DELETE' }
      );

      if (!res.ok) throw new Error('Failed to delete file');

      await loadFiles();
      await loadProject(); // Refresh counts
    } catch (err: any) {
      alert(err.message);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileType = (fileName: string) => {
    if (fileName.includes('store')) return 'Store Inventory';
    if (fileName.includes('supplier')) return 'Supplier Catalog';
    if (fileName.includes('interchange')) return 'Interchange';
    return 'Unknown';
  };

  const handleUpdate = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          description: editDescription,
        }),
      });

      if (!res.ok) throw new Error('Failed to update project');
      
      await loadProject();
      setEditing(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this project? This will delete all associated data.')) {
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete project');
      
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRunMatch = async () => {
    try {
      setRunningMatch(true);
      setMatchError('');
      
      console.log('Starting enhanced matching for project:', projectId);
      
      // Use the enhanced matching endpoint with multi-stage algorithm
      const res = await fetch('/api/match/enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectId,
          options: {
            stage1Enabled: true,
            stage2Enabled: true,
            fuzzyThreshold: 0.75,
            costTolerancePercent: 10,
            maxCandidatesPerItem: 500,
          }
        }),
      });

      console.log('Enhanced match response status:', res.status);
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to run enhanced matching');
      }
      
      const data = await res.json();
      console.log('Enhanced match result:', data);
      
      // Display results with stage breakdown
      if (data.summary && data.metrics) {
        const matchRate = (data.summary.overallMatchRate * 100).toFixed(1);
        const stage1Rate = data.metrics[0] ? (data.metrics[0].matchRate * 100).toFixed(1) : '0';
        const stage2Rate = data.metrics[1] ? (data.metrics[1].matchRate * 100).toFixed(1) : '0';
        
        alert(
          `Enhanced Matching Complete!\n\n` +
          `Total Matches: ${data.summary.totalMatches} / ${data.summary.totalItems} (${matchRate}%)\n\n` +
          `Stage 1 (Deterministic): ${data.summary.stage1Matches} matches (${stage1Rate}%)\n` +
          `Stage 2 (Fuzzy): ${data.summary.stage2Matches} matches (${stage2Rate}%)\n\n` +
          `${data.message}`
        );
        
        // Clear batch progress since enhanced matcher doesn't use batching
        setBatchProgress(null);
      } else {
        alert(`Matching complete! Found ${data.matchCount || 0} matches`);
      }
      
      await loadProject();
    } catch (err: any) {
      console.error('Enhanced match error:', err);
      setMatchError(err.message);
      alert(`Error: ${err.message}`);
    } finally {
      setRunningMatch(false);
    }
  };

  const handleRunAiMatch = async () => {
    try {
      setRunningAiMatch(true);
      setMatchError('');
      
      // Use existing batch progress or start from 0
      const offset = aiBatchProgress?.nextOffset ?? 0;
      
      console.log('Starting AI match for project:', projectId, 'offset:', offset);
      
      const res = await fetch('/api/match/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectId,
          batchOffset: offset,
          batchSize: 100,
        }),
      });

      console.log('AI match response status:', res.status);
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to run AI matching');
      }
      
      const data = await res.json();
      console.log('AI match result:', data);
      
      // Update batch progress
      if (data.batch) {
        setAiBatchProgress(data.batch);
        
        if (data.batch.hasMore) {
          alert(`AI Batch complete!\n\nProcessed: ${data.batch.processed}/${data.batch.total} items\nMatches found: ${data.matchCount}\nCost: ~$${data.batch.estimatedCost}\nTotal estimated: ~$${data.batch.totalEstimatedCost}\n\nClick "Run AI Matching" again to continue.`);
        } else {
          alert(`AI Matching complete!\n\nProcessed all ${data.batch.total} items\nTotal matches: ${data.matchCount}\nTotal cost: ~$${data.batch.estimatedCost}`);
          setAiBatchProgress(null); // Reset for next run
        }
      } else {
        alert(`AI Matching complete! Found ${data.matchCount} additional matches from ${data.processed} items`);
      }
      
      await loadProject();
    } catch (err: any) {
      console.error('AI match error:', err);
      setMatchError(err.message);
      alert(`Error: ${err.message}`);
    } finally {
      setRunningAiMatch(false);
    }
  };

  const handleRunWebSearch = async () => {
    try {
      setRunningWebSearch(true);
      setMatchError('');
      
      // Use existing batch progress or start from 0
      const offset = webSearchBatchProgress?.nextOffset ?? 0;
      
      console.log('Starting web search match for project:', projectId, 'offset:', offset);
      
      const res = await fetch('/api/match/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectId,
          batchOffset: offset,
          batchSize: 50,
        }),
      });

      console.log('Web search response status:', res.status);
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to run web search matching');
      }
      
      const data = await res.json();
      console.log('Web search result:', data);
      
      // Update batch progress
      if (data.batch) {
        setWebSearchBatchProgress(data.batch);
        
        if (data.batch.hasMore) {
          alert(`Web Search Batch complete!\n\nProcessed: ${data.batch.processed}/${data.batch.total} items\nMatches found: ${data.matchCount}\nCost: ~$${data.batch.estimatedCost}\nTotal estimated: ~$${data.batch.totalEstimatedCost}\n\nClick "Run Web Search Matching" again to continue.`);
        } else {
          alert(`Web Search Matching complete!\n\nProcessed all ${data.batch.total} items\nTotal matches: ${data.matchCount}\nTotal cost: ~$${data.batch.estimatedCost}`);
          setWebSearchBatchProgress(null); // Reset for next run
        }
      } else {
        alert(`Web Search Matching complete! Found ${data.matchCount} additional matches from ${data.processed} items`);
      }
      
      await loadProject();
    } catch (err: any) {
      console.error('Web search error:', err);
      setMatchError(err.message);
      alert(`Error: ${err.message}`);
    } finally {
      setRunningWebSearch(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-red-600">{error || 'Project not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              {editing ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-2 border rounded text-2xl font-bold"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full px-4 py-2 border rounded"
                    rows={2}
                    placeholder="Description"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleUpdate}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      className="px-4 py-2 border rounded hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold mb-2">{project.name}</h1>
                  {project.description && (
                    <p className="text-gray-600">{project.description}</p>
                  )}
                </>
              )}
            </div>
            
            {!editing && (
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => setEditing(true)}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Back
                </button>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t">
            <div>
              <div className="text-sm text-gray-600">Store Items</div>
              <div className="text-2xl font-bold">{project._count.storeItems}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Supplier Items</div>
              <div className="text-2xl font-bold">{project._count.supplierItems}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Interchanges</div>
              <div className="text-2xl font-bold">{project._count.interchanges}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Matches Found</div>
              <div className="text-2xl font-bold">{project._count.matchCandidates}</div>
            </div>
          </div>
        </div>

        {/* Workflow Status Dashboard */}
        <WorkflowStatus projectId={projectId} />

        {/* Uploaded Files Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Uploaded Files</h2>
          {loadingFiles ? (
            <div className="text-gray-500">Loading files...</div>
          ) : files.length === 0 ? (
            <div className="text-gray-500">No files uploaded yet</div>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.name}
                  className="flex items-center justify-between p-4 border rounded hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="font-semibold">{getFileType(file.name)}</div>
                    <div className="text-sm text-gray-600">
                      {file.name} • {formatFileSize(file.size)} • Uploaded{' '}
                      {new Date(file.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded"
                    >
                      Download
                    </a>
                    <button
                      onClick={() => handleDeleteFile(file.name)}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 rounded"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* File Upload Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Upload New Files</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FileUploader
              projectId={projectId}
              fileType="store"
              onUploadComplete={() => {
                loadProject();
                loadFiles();
              }}
            />
            <FileUploader
              projectId={projectId}
              fileType="supplier"
              onUploadComplete={() => {
                loadProject();
                loadFiles();
              }}
            />
            <FileUploader
              projectId={projectId}
              fileType="interchange"
              onUploadComplete={() => {
                loadProject();
                loadFiles();
              }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Actions</h2>
          <div className="flex gap-4">
            <button
              onClick={handleRunMatch}
              disabled={runningMatch || project._count.storeItems === 0 || project._count.supplierItems === 0}
              className={`px-6 py-3 rounded font-semibold ${
                runningMatch || project._count.storeItems === 0 || project._count.supplierItems === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : batchProgress?.hasMore
                  ? 'bg-orange-600 text-white hover:bg-orange-700'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {runningMatch 
                ? 'Running...' 
                : batchProgress?.hasMore 
                ? `Continue Matching (${batchProgress.processed}/${batchProgress.total} done)`
                : 'Run Matching Algorithm'
              }
            </button>
            {batchProgress && batchProgress.hasMore && (
              <div className="text-sm text-gray-600 mt-2">
                Progress: {batchProgress.processed}/{batchProgress.total} items processed
                ({batchProgress.remaining} remaining)
              </div>
            )}
            <button
              onClick={handleRunAiMatch}
              disabled={runningAiMatch || project._count.storeItems === 0 || project._count.supplierItems === 0}
              className={`px-6 py-3 rounded font-semibold ${
                runningAiMatch || project._count.storeItems === 0 || project._count.supplierItems === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : aiBatchProgress?.hasMore
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
              title="Uses AI to find matches for items that the standard algorithm couldn't match"
            >
              {runningAiMatch 
                ? 'AI Matching...' 
                : aiBatchProgress?.hasMore 
                ? `Continue AI Matching (${aiBatchProgress.processed}/${aiBatchProgress.total} done, ~$${aiBatchProgress.estimatedCost})`
                : 'Run AI Matching (100 items/batch)'
              }
            </button>
            {aiBatchProgress && aiBatchProgress.hasMore && (
              <div className="text-sm text-gray-600 mt-2">
                AI Progress: {aiBatchProgress.processed}/{aiBatchProgress.total} items processed
                ({aiBatchProgress.remaining} remaining, ~${aiBatchProgress.estimatedCost} per batch)
              </div>
            )}
            <button
              onClick={handleRunWebSearch}
              disabled={runningWebSearch || project._count.storeItems === 0}
              className={`px-6 py-3 rounded font-semibold ${
                runningWebSearch || project._count.storeItems === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : webSearchBatchProgress?.hasMore
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
              title="Uses Perplexity AI to search the entire web for matching parts from any supplier"
            >
              {runningWebSearch 
                ? '🌐 Searching Web...' 
                : webSearchBatchProgress?.hasMore 
                ? `Continue Web Search (${webSearchBatchProgress.processed}/${webSearchBatchProgress.total} done, ~$${webSearchBatchProgress.estimatedCost})`
                : '🌐 Run Web Search Matching (50 items/batch)'
              }
            </button>
            {webSearchBatchProgress && webSearchBatchProgress.hasMore && (
              <div className="text-sm text-gray-600 mt-2">
                Web Search Progress: {webSearchBatchProgress.processed}/{webSearchBatchProgress.total} items processed
                ({webSearchBatchProgress.remaining} remaining, ~${webSearchBatchProgress.estimatedCost} per batch)
              </div>
            )}
            {matchError && (
              <div className="text-red-600 text-sm mt-2">
                Error: {matchError}
              </div>
            )}
            <button
              onClick={() => router.push(`/match?projectId=${projectId}`)}
              disabled={project._count.matchCandidates === 0}
              className={`px-6 py-3 rounded font-semibold ${
                project._count.matchCandidates === 0
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              Review Matches ({project._count.matchCandidates})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
