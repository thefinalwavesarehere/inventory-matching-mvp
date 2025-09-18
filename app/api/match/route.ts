import { NextRequest, NextResponse } from 'next/server';
import { findMatches } from '../../lib/ml/matching';
import { generateSampleData } from '../../lib/utils/fileProcessing';
import { IInventoryItem, ISupplierItem } from '../../lib/db/models';

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    
    // Extract Arnold and supplier items
    const arnoldItems = body.arnoldItems as IInventoryItem[];
    const supplierItems = body.supplierItems as ISupplierItem[];
    const threshold = body.threshold as number || 0.7;
    
    if (!arnoldItems || !Array.isArray(arnoldItems) || arnoldItems.length === 0) {
      return NextResponse.json(
        { error: 'No Arnold inventory items provided' },
        { status: 400 }
      );
    }
    
    if (!supplierItems || !Array.isArray(supplierItems) || supplierItems.length === 0) {
      return NextResponse.json(
        { error: 'No supplier items provided' },
        { status: 400 }
      );
    }
    
    // Find matches
    const matches = findMatches(arnoldItems, supplierItems, threshold);
    
    // Return the matches
    return NextResponse.json({
      success: true,
      count: matches.length,
      matches,
      message: `Found ${matches.length} potential matches`
    });
    
  } catch (error) {
    console.error('Error finding matches:', error);
    return NextResponse.json(
      { error: 'Failed to find matches' },
      { status: 500 }
    );
  }
}

// For demo purposes, we'll also support GET to retrieve sample matches
export async function GET() {
  try {
    // Generate sample data
    const { arnoldItems, supplierItems } = generateSampleData();
    
    // Find matches using the sample data
    const matches = findMatches(arnoldItems, supplierItems);
    
    // Return the matches
    return NextResponse.json({
      success: true,
      count: matches.length,
      matches,
      message: `Found ${matches.length} potential matches in sample data`
    });
    
  } catch (error) {
    console.error('Error generating sample matches:', error);
    return NextResponse.json(
      { error: 'Failed to generate sample matches' },
      { status: 500 }
    );
  }
}
