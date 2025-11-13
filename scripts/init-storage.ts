/**
 * Initialize Supabase Storage Bucket
 * Run this once to create the inventory-files bucket
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase credentials in environment variables');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const BUCKET_NAME = 'inventory-files';

async function initializeBucket() {
  try {
    console.log('Checking for existing bucket...');
    
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      throw listError;
    }
    
    const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);
    
    if (bucketExists) {
      console.log(`✓ Bucket "${BUCKET_NAME}" already exists`);
      return;
    }
    
    console.log(`Creating bucket "${BUCKET_NAME}"...`);
    
    const { data, error } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv', // .csv
      ],
    });
    
    if (error) {
      throw error;
    }
    
    console.log(`✓ Bucket "${BUCKET_NAME}" created successfully`);
    console.log('  - Public access: enabled');
    console.log('  - Max file size: 50MB');
    console.log('  - Allowed types: Excel (.xlsx, .xls) and CSV');
  } catch (error: any) {
    console.error('Failed to initialize bucket:', error.message);
    process.exit(1);
  }
}

initializeBucket();
