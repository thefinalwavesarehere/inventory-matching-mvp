'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import FormatKey from './FormatKey';

const BUCKET_NAME = 'inventory-files';

// Lazy initialization - only create client when actually needed
function getSupabaseClient() {
  // Support both naming conventions (with and without lowercase supabase_)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_supabase_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_supabase_SUPABASE_ANON_KEY || '';
  
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }
  
  try {
    return createClient(supabaseUrl, supabaseAnonKey);
  } catch (error) {
    console.error('Failed to create Supabase client:', error);
    return null;
  }
}

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
      // Get Supabase client
      const supabase = getSupabaseClient();
      
      if (!supabase) {
        throw new Error('Supabase Storage not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables in Vercel.');
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
      setMessage('Processing file... This may take a few minutes for large files.');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout
      
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
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Processing failed';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

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
      
      let errorMessage = error.message;
      if (error.name === 'AbortError') {
        errorMessage = 'File processing timed out. The file may be too large. Please try a smaller file or contact support.';
      }
      
      setMessage(`Error: ${errorMessage}`);
      
      if (onUploadError) {
        onUploadError(errorMessage);
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
    <div className="space-y-4">
      {/* Format Key */}
      <FormatKey fileType={fileType} />
      
      {/* File Upload */}
      <div className="relative">
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileUpload}
        disabled={uploading}
        id={`file-${fileType}`}
        className="hidden"
      />
      <label
        htmlFor={`file-${fileType}`}
        className={`block border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer ${
          uploading
            ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
            : 'border-indigo-300 bg-indigo-50 hover:border-indigo-500 hover:bg-indigo-100'
        }`}
      >
        <div className="flex flex-col items-center gap-3">
          <svg className="w-12 h-12 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <div>
            <div className="text-lg font-semibold text-gray-900">
              {uploading ? 'Uploading...' : `Upload ${getFileTypeLabel()}`}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              Click to browse or drag and drop
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Excel (.xlsx, .xls) or CSV files
            </div>
          </div>
        </div>
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
    </div>
  );
}
