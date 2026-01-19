/**
 * Vitest global setup file
 * Runs before all tests
 */

// Mock environment variables for testing
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

// Add any global test utilities here
