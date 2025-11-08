'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UploadPage() {
  const router = useRouter();
  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [storeFile, setStoreFile] = useState<File | null>(null);
  const [supplierFile, setSupplierFile] = useState<File | null>(null);
  const [interchangeFile, setInterchangeFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUploading(true);

    try {
      // Create project first
      const projectRes = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName, description }),
      });

      if (!projectRes.ok) {
        throw new Error('Failed to create project');
      }

      const { project } = await projectRes.json();

      // Upload files
      const formData = new FormData();
      formData.append('projectId', project.id);
      
      if (storeFile) {
        formData.append('storeFile', storeFile);
      }
      if (supplierFile) {
        formData.append('supplierFile', supplierFile);
      }
      if (interchangeFile) {
        formData.append('interchangeFile', interchangeFile);
      }

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload files');
      }

      // Redirect to homepage
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-6">Upload Files</h1>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Project Info */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Project Name *
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
                className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Q4 2024 Inventory Match"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                placeholder="Optional description"
              />
            </div>

            {/* File Uploads */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Store Inventory File (Excel)
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setStoreFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2 border rounded"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Your current inventory items to match
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Supplier Catalog File (Excel)
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setSupplierFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2 border rounded"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Supplier parts to match against
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Interchange File (Excel) - Optional
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => setInterchangeFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2 border rounded"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Known part number interchanges for 100% matches
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={uploading || !projectName}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : 'Upload & Create Project'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="px-6 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
