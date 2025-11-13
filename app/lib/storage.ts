/**
 * Supabase Storage Utility
 * Handles file uploads to bypass Vercel's 4.5MB body size limit
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_supabase_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_supabase_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BUCKET_NAME = 'inventory-files';

/**
 * Upload file to Supabase Storage
 * @param file File to upload
 * @param projectId Project ID for organizing files
 * @param fileType Type of file (store, supplier, interchange)
 * @returns Public URL of uploaded file
 */
export async function uploadFile(
  file: File,
  projectId: string,
  fileType: 'store' | 'supplier' | 'interchange'
): Promise<string> {
  const timestamp = Date.now();
  const fileName = `${projectId}/${fileType}-${timestamp}.xlsx`;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(fileName);

  return publicUrl;
}

/**
 * Download file from Supabase Storage
 * @param url Public URL of the file
 * @returns File blob
 */
export async function downloadFile(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to download file');
  }
  return response.blob();
}

/**
 * Delete file from Supabase Storage
 * @param filePath Path to file in storage
 */
export async function deleteFile(filePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([filePath]);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

/**
 * Initialize storage bucket (run once)
 */
export async function initializeBucket(): Promise<void> {
  const { data: buckets } = await supabase.storage.listBuckets();
  
  const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);
  
  if (!bucketExists) {
    await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 52428800, // 50MB
    });
  }
}
