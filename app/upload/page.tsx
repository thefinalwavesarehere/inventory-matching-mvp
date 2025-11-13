'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Only create client if credentials are available (runtime check)
let supabase: any = null;
if (supabaseUrl && supabaseAnonKey && typeof window !== 'undefined') {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

const BUCKET_NAME = 'inventory-files';

interface Project {
  id: string;
  name: string;
  description?: string;
}

export default function UploadPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedProjectId = searchParams.get('projectId');

  const [mode, setMode] = useState<'new' | 'existing'>(preselectedProjectId ? 'existing' : 'new');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(preselectedProjectId || '');
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  
  const [storeFile, setStoreFile] = useState<File | null>(null);
  const [supplierFile, setSupplierFile] = useState<File | null>(null);
  const [interchangeFile, setInterchangeFile] = useState<File | null>(null);
  
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    store?: string;
    supplier?: string;
    interchange?: string;
  }>({});
  const [error, setError] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) throw new Error('Failed to load projects');
      const data = await res.json();
      setProjects(data.projects || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
    }
  };

  const uploadFile = async (file: File, fileType: string, projectId: string) => {
    // Check if Supabase is configured
    if (!supabase) {
      throw new Error('Supabase not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.');
    }

    // Step 1: Upload to Supabase Storage (bypasses Vercel 4.5MB limit)
    const timestamp = Date.now();
    const fileName = `${projectId}/${fileType}-${timestamp}.xlsx`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Step 2: Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    // Step 3: Notify backend to process the file
    const res = await fetch('/api/upload/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        fileUrl: publicUrl,
        fileType,
        fileName: file.name,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Processing failed');
    }

    return await res.json();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUploading(true);
    setUploadProgress({});

    try {
      let projectId = selectedProjectId;

      // Create new project if needed
      if (mode === 'new') {
        if (!projectName.trim()) {
          throw new Error('Project name is required');
        }

        setUploadProgress({ store: 'Creating project...' });
        const projectRes = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: projectName, description }),
        });

        if (!projectRes.ok) {
          throw new Error('Failed to create project');
        }

        const { project } = await projectRes.json();
        projectId = project.id;
      }

      if (!projectId) {
        throw new Error('Please select a project');
      }

      // Upload store file
      if (storeFile) {
        setUploadProgress(prev => ({ ...prev, store: 'Uploading...' }));
        await uploadFile(storeFile, 'store', projectId);
        setUploadProgress(prev => ({ ...prev, store: '✓ Complete' }));
      }

      // Upload supplier file
      if (supplierFile) {
        setUploadProgress(prev => ({ ...prev, supplier: 'Uploading...' }));
        await uploadFile(supplierFile, 'supplier', projectId);
        setUploadProgress(prev => ({ ...prev, supplier: '✓ Complete' }));
      }

      // Upload interchange file
      if (interchangeFile) {
        setUploadProgress(prev => ({ ...prev, interchange: 'Uploading...' }));
        await uploadFile(interchangeFile, 'interchange', projectId);
        setUploadProgress(prev => ({ ...prev, interchange: '✓ Complete' }));
      }

      // Success - redirect to homepage
      setTimeout(() => {
        router.push('/');
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      setUploading(false);
    }
  };

  const hasFiles = storeFile || supplierFile || interchangeFile;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Upload Files</h1>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Project Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">Project</label>
              <div className="flex gap-4 mb-4">
                <button
                  type="button"
                  onClick={() => setMode('new')}
                  className={`px-4 py-2 rounded ${
                    mode === 'new'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  disabled={uploading}
                >
                  Create New Project
                </button>
                <button
                  type="button"
                  onClick={() => setMode('existing')}
                  className={`px-4 py-2 rounded ${
                    mode === 'existing'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                  disabled={uploading}
                >
                  Add to Existing Project
                </button>
              </div>

              {mode === 'new' ? (
                <>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    required
                    disabled={uploading}
                    className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500 mb-3"
                    placeholder="e.g., Q4 2024 Inventory Match"
                  />
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={uploading}
                    className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                    placeholder="Optional description"
                    rows={2}
                  />
                </>
              ) : (
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  required
                  disabled={uploading}
                  className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a project...</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* File Uploads */}
            <div className="space-y-4">
              {/* Store File */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Store Inventory File (Excel) *
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setStoreFile(e.target.files?.[0] || null)}
                  disabled={uploading}
                  required
                  className="w-full px-4 py-2 border rounded"
                />
                <p className="text-sm text-gray-600 mt-1">
                  Your current inventory items to match
                </p>
                {uploadProgress.store && (
                  <p className="text-sm mt-1 text-blue-600">{uploadProgress.store}</p>
                )}
              </div>

              {/* Supplier File */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Supplier Catalog File (Excel) *
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setSupplierFile(e.target.files?.[0] || null)}
                  disabled={uploading}
                  required
                  className="w-full px-4 py-2 border rounded"
                />
                <p className="text-sm text-gray-600 mt-1">
                  Supplier parts to match against
                </p>
                {uploadProgress.supplier && (
                  <p className="text-sm mt-1 text-blue-600">{uploadProgress.supplier}</p>
                )}
              </div>

              {/* Interchange File */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Interchange File (Excel) - Optional
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setInterchangeFile(e.target.files?.[0] || null)}
                  disabled={uploading}
                  className="w-full px-4 py-2 border rounded"
                />
                <p className="text-sm text-gray-600 mt-1">
                  Known part number interchanges for 100% matches
                </p>
                {uploadProgress.interchange && (
                  <p className="text-sm mt-1 text-blue-600">{uploadProgress.interchange}</p>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={uploading || !hasFiles}
                className={`flex-1 px-6 py-3 rounded font-semibold ${
                  uploading || !hasFiles
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {uploading ? 'Uploading...' : mode === 'new' ? 'Upload & Create Project' : 'Upload Files'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
