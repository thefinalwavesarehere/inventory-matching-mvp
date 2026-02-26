/**
 * Authentication and Authorization Middleware
 * 
 * Provides secure, reusable auth patterns following backend engineering best practices:
 * - Clear API contracts with typed responses
 * - Consistent error handling
 * - Role-based access control (RBAC)
 * - Audit logging for security events
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { prisma } from '@/app/lib/db/prisma';
import type { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  isApproved: boolean;
}

export interface AuthContext {
  user: AuthenticatedUser;
  supabaseUserId: string;
}

/**
 * Authentication error types for consistent error handling
 */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public code: string = 'UNAUTHENTICATED',
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public code: string = 'FORBIDDEN',
    public statusCode: number = 403
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Core authentication function - validates session and fetches user profile
 * 
 * @throws {AuthenticationError} If session is invalid or user not found
 */
export async function requireAuth(): Promise<AuthContext> {
  const supabase = createRouteHandlerClient({ cookies });
  
  // Verify Supabase session
  const { data: { user: supabaseUser }, error: sessionError } = await supabase.auth.getUser();
  
  if (sessionError || !supabaseUser) {
    throw new AuthenticationError(
      'Authentication required. Please log in.',
      'UNAUTHENTICATED'
    );
  }

  // Fetch user profile from database
  const profile = await prisma.userProfile.findUnique({
    where: { id: supabaseUser.id },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isApproved: true,
    },
  });

  if (!profile) {
    throw new AuthenticationError(
      'User profile not found. Please contact support.',
      'PROFILE_NOT_FOUND'
    );
  }

  if (!profile.isApproved) {
    throw new AuthorizationError(
      'Your account is pending approval. Please contact an administrator.',
      'ACCOUNT_NOT_APPROVED'
    );
  }

  return {
    user: profile,
    supabaseUserId: supabaseUser.id,
  };
}

/**
 * Role-based authorization check
 * 
 * @param allowedRoles - Array of roles that are allowed access
 * @throws {AuthorizationError} If user role is not in allowed roles
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<AuthContext> {
  const context = await requireAuth();
  
  if (!allowedRoles.includes(context.user.role)) {
    throw new AuthorizationError(
      `Access denied. Required role: ${allowedRoles.join(' or ')}`,
      'INSUFFICIENT_PERMISSIONS'
    );
  }
  
  return context;
}

/**
 * Admin-only authorization
 */
export async function requireAdmin(): Promise<AuthContext> {
  return requireRole(['ADMIN']);
}

/**
 * Editor or Admin authorization (can create/edit projects)
 */
export async function requireEditor(): Promise<AuthContext> {
  return requireRole(['ADMIN', 'EDITOR']);
}

/**
 * Middleware wrapper for API routes with automatic error handling
 * 
 * Usage:
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   return withAuth(request, async (context) => {
 *     // Your authenticated route logic here
 *     // Access user via context.user
 *   });
 * }
 * ```
 */
export async function withAuth(
  request: NextRequest,
  handler: (context: AuthContext) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const context = await requireAuth();
    return await handler(context);
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * Middleware wrapper for admin-only routes
 */
export async function withAdmin(
  request: NextRequest,
  handler: (context: AuthContext) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const context = await requireAdmin();
    return await handler(context);
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * Middleware wrapper for editor/admin routes
 */
export async function withEditor(
  request: NextRequest,
  handler: (context: AuthContext) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const context = await requireEditor();
    return await handler(context);
  } catch (error) {
    return handleAuthError(error);
  }
}

/**
 * Consistent error response formatting
 */
function handleAuthError(error: unknown): NextResponse {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
      },
      { status: error.statusCode }
    );
  }

  // Unexpected error - log and return generic message
  console.error('[AUTH_ERROR]', error);
  
  return NextResponse.json(
    {
      error: 'An unexpected error occurred during authentication.',
      code: 'INTERNAL_ERROR',
    },
    { status: 500 }
  );
}
