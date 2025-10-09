/**
 * Match API Route
 * Handles matching requests between Arnold inventory and supplier catalogs
 */

import { NextRequest, NextResponse } from 'next/server';
import { findMatches } from '../../lib/matching';
import { getSampleData } from '../../lib/sampleData';

/**
 * GET /api/match
 * Returns matches using sample data for demo purposes
 */
export async function GET() {
  try {
    // Get sample data
    const { arnoldInventory, supplierCatalog } = getSampleData();
    
    // Find matches with default threshold (0.7)
    const matches = findMatches(arnoldInventory, supplierCatalog);
    
    return NextResponse.json({
      success: true,
      count: matches.length,
      matches,
      message: `Found ${matches.length} potential matches in sample data`
    });
    
  } catch (error) {
    console.error('Error generating sample matches:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to generate sample matches',
        matches: []
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/match
 * Accepts custom inventory and supplier data for matching
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const arnoldItems = body.arnoldItems || [];
    const supplierItems = body.supplierItems || [];
    const threshold = body.threshold || 0.7;
    
    // Validate input
    if (!Array.isArray(arnoldItems) || arnoldItems.length === 0) {
      return NextResponse.json(
        { 
          success: false,
          error: 'No Arnold inventory items provided',
          matches: []
        },
        { status: 400 }
      );
    }
    
    if (!Array.isArray(supplierItems) || supplierItems.length === 0) {
      return NextResponse.json(
        { 
          success: false,
          error: 'No supplier items provided',
          matches: []
        },
        { status: 400 }
      );
    }
    
    // Find matches
    const matches = findMatches(arnoldItems, supplierItems, threshold);
    
    return NextResponse.json({
      success: true,
      count: matches.length,
      matches,
      message: `Found ${matches.length} potential matches`
    });
    
  } catch (error) {
    console.error('Error finding matches:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to process matching request',
        matches: []
      },
      { status: 500 }
    );
  }
}

