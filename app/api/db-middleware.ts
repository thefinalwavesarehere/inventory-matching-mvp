import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import dbConnect from '../lib/db/mongodb-config';

// Middleware to connect to MongoDB before API routes
export async function withMongoDB(
  req: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  try {
    // Connect to MongoDB
    await dbConnect();
    
    // Call the API route handler
    return await handler(req);
  } catch (error) {
    console.error('MongoDB connection error:', error);
    
    // For MVP demo, continue with the request even if DB connection fails
    try {
      return await handler(req);
    } catch (handlerError) {
      console.error('API handler error:', handlerError);
      return NextResponse.json(
        { error: 'An error occurred processing the request' },
        { status: 500 }
      );
    }
  }
}
