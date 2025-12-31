/**
 * Proxy Route for Python Matching Service
 * 
 * This route forwards file uploads from the Next.js frontend to the Python FastAPI
 * matching service and streams the response back to the client.
 * 
 * Security: Uses a shared secret (API_SECRET) to authenticate requests between
 * Next.js and the Python backend.
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Maximum file size: 50MB
export const maxDuration = 300; // 5 minutes for large files

export async function POST(request: NextRequest) {
  try {
    // Get the Python matching service URL from environment
    const matchingServiceUrl = process.env.MATCHING_SERVICE_URL;
    const apiSecret = process.env.API_SECRET;

    if (!matchingServiceUrl) {
      console.error('[PROXY] MATCHING_SERVICE_URL not configured');
      return NextResponse.json(
        { error: 'Matching service not configured' },
        { status: 500 }
      );
    }

    console.log('[PROXY] Forwarding request to matching service:', matchingServiceUrl);

    // Get the uploaded file from the request
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    console.log('[PROXY] File received:', {
      name: file.name,
      size: file.size,
      type: file.type
    });

    // Create a new FormData to forward to Python service
    const forwardFormData = new FormData();
    forwardFormData.append('file', file);

    // Forward the request to Python backend
    const headers: HeadersInit = {};
    
    // Add authentication header if API secret is configured
    if (apiSecret) {
      headers['X-API-Secret'] = apiSecret;
    }

    console.log('[PROXY] Sending request to Python backend...');
    
    const response = await fetch(`${matchingServiceUrl}/match-inventory`, {
      method: 'POST',
      body: forwardFormData,
      headers: headers,
    });

    console.log('[PROXY] Python backend response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PROXY] Python backend error:', errorText);
      
      try {
        const errorJson = JSON.parse(errorText);
        return NextResponse.json(
          { error: errorJson.detail || 'Matching service error' },
          { status: response.status }
        );
      } catch {
        return NextResponse.json(
          { error: errorText || 'Matching service error' },
          { status: response.status }
        );
      }
    }

    // Stream the CSV response back to the client
    const csvData = await response.text();
    console.log('[PROXY] Received CSV response, size:', csvData.length);

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="matched_results_${Date.now()}.csv"`,
      },
    });

  } catch (error) {
    console.error('[PROXY] Error forwarding request:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  const matchingServiceUrl = process.env.MATCHING_SERVICE_URL;
  
  if (!matchingServiceUrl) {
    return NextResponse.json(
      { 
        status: 'error',
        message: 'Matching service not configured'
      },
      { status: 500 }
    );
  }

  try {
    // Check if Python backend is reachable
    const response = await fetch(`${matchingServiceUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        status: 'ok',
        backend: data,
        url: matchingServiceUrl
      });
    } else {
      return NextResponse.json(
        { 
          status: 'error',
          message: 'Backend service unhealthy',
          url: matchingServiceUrl
        },
        { status: 503 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'error',
        message: 'Cannot reach backend service',
        url: matchingServiceUrl,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 503 }
    );
  }
}
