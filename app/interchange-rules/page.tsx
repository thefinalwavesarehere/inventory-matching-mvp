'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function InterchangeRulesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [interchangeCount, setInterchangeCount] = useState(0);
  const [rulesCount, setRulesCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    loadCounts();
  }, []);

  async function loadCounts() {
    try {
      const [interchangeRes, rulesRes] = await Promise.all([
        fetch('/api/interchange'),
        fetch('/api/rules?count=true')
      ]);
      
      const interchangeData = await interchangeRes.json();
      const rulesData = await rulesRes.json();
      
      setInterchangeCount(interchangeData.count || 0);
      setRulesCount(rulesData.count || 0);
    } catch (error) {
      console.error('Failed to load counts:', error);
    }
  }

  async function handleInterchangeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/interchange/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        setUploadMessage(`✅ Uploaded ${result.count} interchange mappings`);
        loadCounts();
      } else {
        setUploadMessage(`❌ Upload failed: ${result.error}`);
      }
    } catch (error: any) {
      setUploadMessage(`❌ Upload error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  }

  if (status === 'loading') {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Global Interchange & Rules Management</h1>
      
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
        <p className="text-yellow-700">
          <strong>⚠️ Global System:</strong> These interchange mappings and rules are shared across ALL projects. 
          Changes here affect the entire matching system.
        </p>
      </div>

      {/* Interchange Mappings Section */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-semibold mb-4">Interchange Mappings</h2>
        <p className="text-gray-600 mb-4">
          Current mappings: <strong>{interchangeCount.toLocaleString()}</strong>
        </p>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Interchange File (CSV/XLSX)
          </label>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={handleInterchangeUpload}
            disabled={uploading}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded file:border-0
              file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100
              disabled:opacity-50"
          />
          <p className="text-xs text-gray-500 mt-1">
            Expected columns: VENDOR PART #, MERRILL PART #, VENDOR, SUB CATEGORY
          </p>
        </div>

        {uploadMessage && (
          <div className={`p-3 rounded ${uploadMessage.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {uploadMessage}
          </div>
        )}

        {uploading && (
          <div className="flex items-center gap-2 text-blue-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span>Processing...</span>
          </div>
        )}
      </div>

      {/* Matching Rules Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">Matching Rules</h2>
        <p className="text-gray-600 mb-4">
          Active rules: <strong>{rulesCount}</strong>
        </p>
        
        <div className="bg-gray-50 p-4 rounded">
          <p className="text-sm text-gray-600">
            Rules are automatically applied during exact matching to improve accuracy.
            Rule management UI coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
