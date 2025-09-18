'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<'arnold' | 'supplier'>('arnold');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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
    
    setIsUploading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', fileType);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to upload file');
      }
      
      setUploadResult(result);
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload');
      setUploadResult(null);
    } finally {
      setIsUploading(false);
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
            <div>
              <label className="block text-sm font-medium mb-2">
                File Type
              </label>
              <div className="flex space-x-4">
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
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                Select File (Excel format)
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
          
          {error && (
            <div className="mt-6 p-4 bg-red-100 text-red-700 rounded-md">
              <p>{error}</p>
            </div>
          )}
          
          {uploadResult && (
            <div className="mt-6">
              <h2 className="text-xl font-semibold mb-4">Upload Result</h2>
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-md">
                <p className="mb-2">
                  <span className="font-medium">Status:</span> {uploadResult.success ? 'Success' : 'Failed'}
                </p>
                <p className="mb-2">
                  <span className="font-medium">Message:</span> {uploadResult.message}
                </p>
                <p className="mb-4">
                  <span className="font-medium">Items Processed:</span> {uploadResult.count}
                </p>
                
                {uploadResult.items && uploadResult.items.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium mb-2">Preview (first 10 items):</h3>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                        <thead>
                          <tr>
                            {Object.keys(uploadResult.items[0]).map((key) => (
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
                          {uploadResult.items.map((item: any, index: number) => (
                            <tr key={index}>
                              {Object.values(item).map((value: any, i: number) => (
                                <td 
                                  key={i}
                                  className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100"
                                >
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                
                <div className="mt-6">
                  <Link
                    href="/match"
                    className="inline-block py-2 px-4 bg-black text-white rounded-md hover:bg-gray-800"
                  >
                    Proceed to Matching
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
