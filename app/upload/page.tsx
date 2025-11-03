'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function Upload() {
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get('projectId');

  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'arnold' | 'supplier' | 'interchange' | 'inventory_report'>('arnold');
  const [customFileName, setCustomFileName] = useState<string>('');
  const [projectId, setProjectId] = useState<string>(initialProjectId || '');
  const [projectName, setProjectName] = useState<string>('');
  const [projects, setProjects] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunningMatch, setIsRunningMatch] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    // Auto-populate custom file name from selected file
    if (file && !customFileName) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setCustomFileName(nameWithoutExt);
    }
  }, [file]);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/upload');
      const data = await response.json();
      if (data.success) {
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    if (!projectId && !projectName) {
      setError('Please select an existing project or enter a new project name');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', fileType);
      formData.append('customFileName', customFileName || file.name);
      if (projectId) {
        formData.append('projectId', projectId);
      } else if (projectName) {
        formData.append('projectName', projectName);
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      let result;
      try {
        result = await response.json();
      } catch (jsonError) {
        // If JSON parsing fails, try to get the text response
        const textResponse = await response.text();
        console.error('Failed to parse JSON response:', textResponse);
        throw new Error(`Server returned invalid response. Status: ${response.status}`);
      }

      if (!response.ok) {
        // Retry logic for failed uploads
        if (retryCount < maxRetries && response.status >= 500) {
          setRetryCount(retryCount + 1);
          setError(`Upload failed. Retrying... (Attempt ${retryCount + 1}/${maxRetries})`);
          setTimeout(() => handleSubmit(e), 2000); // Retry after 2 seconds
          return;
        }
        throw new Error(result.error || result.message || 'Failed to upload file');
      }
      
      // Reset retry count on success
      setRetryCount(0);

      setUploadResult(result.data);
      setFile(null);
      setCustomFileName('');
      setProjectId(result.data.projectId); // Update to current project
      fetchProjects(); // Refresh project list
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRunMatching = async () => {
    if (!uploadResult?.projectId) {
      setError('No project available for matching');
      return;
    }

    setIsRunningMatch(true);
    setError(null);

    try {
      const response = await fetch('/api/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: uploadResult.projectId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to run matching');
      }

      // Redirect to match page
      window.location.href = `/match?projectId=${uploadResult.projectId}`;
    } catch (err: any) {
      setError(err.message || 'An error occurred during matching');
    } finally {
      setIsRunningMatch(false);
    }
  };

  // Get friendly file type names
  const getFileTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      arnold: 'Arnold Inventory',
      supplier: 'Supplier Catalog',
      interchange: 'Interchange Mappings',
      inventory_report: 'Inventory Report',
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex gap-4 mb-4">
            <Link href="/" className="text-blue-600 hover:text-blue-800 inline-block">
              ← Back to Home
            </Link>
            {projectId && (
              <Link href={`/projects`} className="text-blue-600 hover:text-blue-800 inline-block">
                ← Back to Project
              </Link>
            )}
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Upload Files</h1>
          <p className="text-gray-600 mt-2">
            Upload Arnold inventory, supplier catalogs, or interchange files for matching
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Project Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project
              </label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Select Existing Project
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => {
                      setProjectId(e.target.value);
                      if (e.target.value) setProjectName('');
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">-- Select a project --</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} ({project._count?.uploadSessions || 0} files)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-center text-gray-500 text-sm">OR</div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Create New Project
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => {
                      setProjectName(e.target.value);
                      if (e.target.value) setProjectId('');
                    }}
                    placeholder="Enter new project name (e.g., Q4 2024 Inventory)"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* File Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File Type
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center space-x-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  style={{ borderColor: fileType === 'arnold' ? '#3B82F6' : '#E5E7EB' }}>
                  <input
                    type="radio"
                    name="fileType"
                    value="arnold"
                    checked={fileType === 'arnold'}
                    onChange={(e) => setFileType(e.target.value as any)}
                    className="text-blue-600"
                  />
                  <span className="font-medium">Arnold Inventory</span>
                </label>

                <label className="flex items-center space-x-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  style={{ borderColor: fileType === 'supplier' ? '#3B82F6' : '#E5E7EB' }}>
                  <input
                    type="radio"
                    name="fileType"
                    value="supplier"
                    checked={fileType === 'supplier'}
                    onChange={(e) => setFileType(e.target.value as any)}
                    className="text-blue-600"
                  />
                  <span className="font-medium">Supplier Catalog</span>
                </label>

                <label className="flex items-center space-x-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  style={{ borderColor: fileType === 'interchange' ? '#3B82F6' : '#E5E7EB' }}>
                  <input
                    type="radio"
                    name="fileType"
                    value="interchange"
                    checked={fileType === 'interchange'}
                    onChange={(e) => setFileType(e.target.value as any)}
                    className="text-blue-600"
                  />
                  <span className="font-medium">Interchange File</span>
                </label>

                <label className="flex items-center space-x-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  style={{ borderColor: fileType === 'inventory_report' ? '#3B82F6' : '#E5E7EB' }}>
                  <input
                    type="radio"
                    name="fileType"
                    value="inventory_report"
                    checked={fileType === 'inventory_report'}
                    onChange={(e) => setFileType(e.target.value as any)}
                    className="text-blue-600"
                  />
                  <span className="font-medium">Inventory Report</span>
                </label>
              </div>
            </div>

            {/* File Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select File (Excel or CSV format)
              </label>
              <input
                type="file"
                onChange={handleFileChange}
                accept=".xlsx,.xls,.csv"
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100
                  cursor-pointer"
              />
              {file && (
                <p className="mt-2 text-sm text-gray-600">
                  Selected file: {file.name}
                </p>
              )}
            </div>

            {/* Custom File Name */}
            {file && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Display Name (Optional)
                </label>
                <input
                  type="text"
                  value={customFileName}
                  onChange={(e) => setCustomFileName(e.target.value)}
                  placeholder="Enter a custom name for this file"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-gray-500">
                  This name will be displayed in the system instead of the original filename
                </p>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isUploading || !file}
              className="w-full bg-black text-white py-3 px-6 rounded-lg font-semibold
                hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed
                transition-colors"
            >
              {isUploading ? 'Uploading...' : 'Upload File'}
            </button>
          </form>
        </div>

        {/* Upload Result */}
        {uploadResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-green-900 mb-4">
              ✓ Upload Successful
            </h2>
            <div className="space-y-2 text-sm text-green-800">
              <p><strong>Project:</strong> {uploadResult.projectName}</p>
              <p><strong>File:</strong> {uploadResult.fileName}</p>
              <p><strong>Type:</strong> {getFileTypeLabel(uploadResult.fileType)}</p>
              <p><strong>Rows Processed:</strong> {uploadResult.rowCount.toLocaleString()}</p>
            </div>

            {/* Preview Data */}
            {uploadResult.preview && uploadResult.preview.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-green-900 mb-2">Preview (First 10 items):</h3>
                <div className="bg-white rounded border border-green-200 p-3 max-h-60 overflow-auto">
                  <pre className="text-xs text-gray-700">
                    {JSON.stringify(uploadResult.preview, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleRunMatching}
                disabled={isRunningMatch}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold
                  hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed
                  transition-colors"
              >
                {isRunningMatch ? 'Running Matching...' : 'Run Matching Algorithm'}
              </button>

              <Link
                href={`/match?projectId=${uploadResult.projectId}`}
                className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-lg font-semibold text-center
                  hover:bg-gray-700 transition-colors"
              >
                View Matches
              </Link>
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-3">
            📋 File Upload Guide
          </h2>
          <div className="space-y-3 text-sm text-blue-800">
            <div>
              <strong>Arnold Inventory:</strong> Contains your internal part numbers, usage, and costs
            </div>
            <div>
              <strong>Supplier Catalog:</strong> Contains supplier part numbers, descriptions, and pricing (e.g., CarQuest)
            </div>
            <div>
              <strong>Interchange File:</strong> Known mappings between your parts and supplier parts
            </div>
            <div>
              <strong>Inventory Report:</strong> Detailed inventory with descriptions for enrichment
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-blue-200">
            <p className="text-sm text-blue-700">
              <strong>Recommended Order:</strong> Interchange → Arnold → Supplier → Inventory Report
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
