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
    return NextResponse.json(
      { error: 'Database connection failed' },
      { status: 500 }
    );
  }
}
