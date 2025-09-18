import { NextRequest, NextResponse } from 'next/server';
import { processExcelFile } from '@/app/lib/utils/fileProcessing';

export async function POST(request: NextRequest) {
  try {
    // For MVP, we'll use FormData to handle file uploads
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const fileType = formData.get('fileType') as string | null;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    if (!fileType || !['arnold', 'supplier'].includes(fileType)) {
      return NextResponse.json(
        { error: 'Invalid file type. Must be "arnold" or "supplier"' },
        { status: 400 }
      );
    }
    
    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Process the file
    const items = processExcelFile(
      buffer, 
      fileType as 'arnold' | 'supplier'
    );
    
    // For MVP, we'll just return the processed items
    // In a real app, we would store them in the database
    return NextResponse.json({ 
      success: true, 
      count: items.length,
      items: items.slice(0, 10), // Just return first 10 for preview
      message: `Successfully processed ${items.length} items`
    });
    
  } catch (error) {
    console.error('Error processing file:', error);
    return NextResponse.json(
      { error: 'Failed to process file' },
      { status: 500 }
    );
  }
}

// For demo purposes, we'll also support GET to retrieve sample data
export async function GET() {
  // In a real app, this would come from the database
  return NextResponse.json({
    success: true,
    message: 'Sample data retrieved successfully',
    sampleFiles: [
      {
        name: 'arnold_inventory_sample.xlsx',
        description: 'Sample Arnold inventory data',
        url: '/sample-data/arnold_inventory_sample.xlsx'
      },
      {
        name: 'carquest_catalog_sample.xlsx',
        description: 'Sample CarQuest catalog data',
        url: '/sample-data/carquest_catalog_sample.xlsx'
      }
    ]
  });
}
