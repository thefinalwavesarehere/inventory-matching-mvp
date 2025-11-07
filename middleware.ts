/**
 * Next.js Middleware for Protected Routes
 * 
 * Redirects unauthenticated users to login page
 */

import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    // Allow request to proceed
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    // Use NextAuth default signin page at /api/auth/signin
    // pages: {
    //   signIn: '/login',
    // },
  }
);

// Protect all routes except API auth and static files
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /api/auth (NextAuth API routes - includes signin page)
     * - /_next (Next.js internals)
     * - /favicon.ico, /robots.txt (static files)
     */
    '/((?!api/auth|_next|favicon.ico|robots.txt).*)',
  ],
};
