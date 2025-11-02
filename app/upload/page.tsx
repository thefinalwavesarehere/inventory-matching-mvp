'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export default function Upload() {
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get('projectId');

  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'arnold' | 'supplier' | 'interchange' | 'inventory_report'>('arnold');
  const [projectId, setProjectId] = useState<string>(initialProjectId || '');
  const [projectName, setProjectName] = useState<string>('');
  const [projects, setProjects] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunningMatch, setIsRunningMatch] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

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
      if (projectId) {
        formData.append('projectId', projectId);
      } else if (projectName) {
        formData.append('projectName', projectName);
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to upload file');
      }

      setUploadResult(result.data);
      setProjectId(result.data.projectId);
      await fetchProjects(); // Refresh project list
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload');
      setUploadResult(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRunMatching = async () => {
    if (!uploadResult?.projectId) {
      setError('No project ID available');
      return;
    }

    setIsRunningMatch(true);
    setError(null);

    try {
      const response = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: uploadResult.projectId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to run matching');
      }

      alert(`Matching complete! ${result.stats.matched} out of ${result.stats.total} items matched.`);
      
      // Redirect to match page
      window.location.href = `/match?projectId=${uploadResult.projectId}`;
    } catch (err: any) {
      setError(err.message || 'An error occurred during matching');
    } finally {
      setIsRunningMatch(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-8 md:p-24">
      <div className="w-full max-w-4xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Upload Inventory Files</h1>
          <Link
            href="/"
            className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            Back to Home
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Project Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Project
              </label>
              <div className="space-y-2">
                <select
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    if (e.target.value) setProjectName('');
                  }}
                  className="block w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="">-- Create New Project --</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.uploadSessions.length} files)
                    </option>
                  ))}
                </select>

                {!projectId && (
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Enter new project name"
                    className="block w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                  />
                )}
              </div>
            </div>

            {/* File Type Selection */}
            <div>
              <label className="block text-sm font-medium mb-2">
                File Type
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    className="form-radio"
                    name="fileType"
                    value="arnold"
                    checked={fileType === 'arnold'}
                    onChange={() => setFileType('arnold')}
                  />
                  <span className="ml-2">Arnold Inventory</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    className="form-radio"
                    name="fileType"
                    value="supplier"
                    checked={fileType === 'supplier'}
                    onChange={() => setFileType('supplier')}
                  />
                  <span className="ml-2">Supplier Catalog</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    className="form-radio"
                    name="fileType"
                    value="interchange"
                    checked={fileType === 'interchange'}
                    onChange={() => setFileType('interchange')}
                  />
                  <span className="ml-2">Interchange File</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="radio"
                    className="form-radio"
                    name="fileType"
                    value="inventory_report"
                    checked={fileType === 'inventory_report'}
                    onChange={() => setFileType('inventory_report')}
                  />
                  <span className="ml-2">Inventory Report</span>
                </label>
              </div>
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Select File (Excel or CSV format)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-gray-200 file:text-gray-700
                  hover:file:bg-gray-300
                  dark:file:bg-gray-700 dark:file:text-gray-200
                  dark:hover:file:bg-gray-600"
              />
              {file && (
                <p className="mt-2 text-sm text-gray-500">
                  Selected file: {file.name}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={isUploading || !file}
                className={`w-full py-2 px-4 rounded-md text-white font-medium
                  ${isUploading || !file
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-black hover:bg-gray-800'
                  }`}
              >
                {isUploading ? 'Uploading...' : 'Upload File'}
              </button>
            </div>
          </form>

          {/* Error Display */}
          {error && (
            <div className="mt-6 p-4 bg-red-100 text-red-700 rounded-md">
              <p>{error}</p>
            </div>
          )}

          {/* Upload Result */}
          {uploadResult && (
            <div className="mt-6">
              <h2 className="text-xl font-semibold mb-4">Upload Result</h2>
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-medium">Status:</span> Success ✓
                </p>
                <p className="mb-2">
                  <span className="font-medium">Project:</span> {uploadResult.projectName}
                </p>
                <p className="mb-2">
                  <span className="font-medium">File:</span> {uploadResult.fileName}
                </p>
                <p className="mb-4">
                  <span className="font-medium">Items Processed:</span> {uploadResult.rowCount}
                </p>

                {uploadResult.preview && uploadResult.preview.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-lg font-medium mb-2">Preview (first 10 items):</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600 text-sm">
                        <thead>
                          <tr>
                            {Object.keys(uploadResult.preview[0]).slice(0, 5).map((key) => (
                              <th
                                key={key}
                                className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                              >
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                          {uploadResult.preview.slice(0, 5).map((item: any, index: number) => (
                            <tr key={index}>
                              {Object.values(item).slice(0, 5).map((value: any, i: number) => (
                                <td
                                  key={i}
                                  className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100"
                                >
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value).substring(0, 30)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="flex space-x-4">
                  {uploadResult.fileType !== 'interchange' && (
                    <button
                      onClick={handleRunMatching}
                      disabled={isRunningMatch}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      {isRunningMatch ? 'Running Matching...' : 'Run Matching Algorithm'}
                    </button>
                  )}
                  <Link
                    href={`/match?projectId=${uploadResult.projectId}`}
                    className="inline-block px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800"
                  >
                    View Matches
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
