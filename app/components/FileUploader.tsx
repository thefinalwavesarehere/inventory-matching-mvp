'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Only create client if credentials are available
let supabase: any = null;
if (supabaseUrl && supabaseAnonKey && typeof window !== 'undefined') {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

const BUCKET_NAME = 'inventory-files';

interface FileUploaderProps {
  projectId: string;
  fileType: 'store' | 'supplier' | 'interchange';
  onUploadComplete?: (result: any) => void;
  onUploadError?: (error: string) => void;
}

export default function FileUploader({
  projectId,
  fileType,
  onUploadComplete,
  onUploadError,
}: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setMessage('Uploading file to storage...');

    try {
      // Check if Supabase is configured
      if (!supabase) {
        throw new Error('Supabase not configured. Please set environment variables.');
      }

      // Step 1: Upload to Supabase Storage
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

      setProgress(50);
      setMessage('Processing file...');

      // Step 2: Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);

      // Step 3: Notify backend to process the file
      const response = await fetch('/api/upload/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId,
          fileUrl: publicUrl,
          fileType,
          fileName: file.name,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Processing failed');
      }

      setProgress(100);
      setMessage(`Success! Imported ${result.rowCount} rows`);
      
      if (onUploadComplete) {
        onUploadComplete(result);
      }

      // Reset after 2 seconds
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
        setMessage('');
      }, 2000);
    } catch (error: any) {
      console.error('Upload error:', error);
      setMessage(`Error: ${error.message}`);
      
      if (onUploadError) {
        onUploadError(error.message);
      }

      setTimeout(() => {
        setUploading(false);
        setProgress(0);
        setMessage('');
      }, 3000);
    }
  };

  const getFileTypeLabel = () => {
    switch (fileType) {
      case 'store':
        return 'Store Inventory';
      case 'supplier':
        return 'Supplier Catalog';
      case 'interchange':
        return 'Interchange Data';
      default:
        return 'File';
    }
  };

  return (
    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
      <label className="block">
        <span className="text-sm font-medium text-gray-700">
          Upload {getFileTypeLabel()}
        </span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileUpload}
          disabled={uploading}
          className="mt-2 block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-md file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100
            disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </label>

      {uploading && (
        <div className="mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="mt-2 text-sm text-gray-600">{message}</p>
        </div>
      )}

      {message && !uploading && (
        <p className={`mt-2 text-sm ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
