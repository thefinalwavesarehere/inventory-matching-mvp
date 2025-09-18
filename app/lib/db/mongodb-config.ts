// MongoDB connection configuration for Vercel deployment

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || '';

// Define the cached connection interface
interface CachedConnection {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Define the global mongoose object
declare global {
  var mongoose: CachedConnection | undefined;
}

// Initialize the cached connection
let cached: CachedConnection = global.mongoose || { conn: null, promise: null };

// Store in global for reuse
if (!global.mongoose) {
  global.mongoose = cached;
}

async function dbConnect() {
  // For MVP demo, allow running without a real MongoDB connection
  if (!MONGODB_URI || MONGODB_URI.includes('placeholder')) {
    console.warn('No valid MongoDB URI provided. Running in demo mode without database connection.');
    return mongoose;
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error('MongoDB connection error:', e);
  }
  
  return cached.conn || mongoose;
}

export default dbConnect;
