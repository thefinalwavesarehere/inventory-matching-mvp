import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { UserProfile } from '@prisma/client';
import type { Session } from '@supabase/supabase-js';
import { prisma } from '@/app/lib/db/prisma';

/**
 * Get current session and user profile (server-side)
 * Use this in API routes and Server Components
 */
export async function getCurrentUser(): Promise<{
  session: Session | null;
  profile: UserProfile | null;
}> {
  const supabase = createRouteHandlerClient({ cookies });
  
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) {
    return { session: null, profile: null };
  }

  const profile = await prisma.userProfile.findUnique({
    where: { id: session.user.id },
  });

  return { session, profile };
}

/**
 * Require authentication (throw error if not authenticated)
 * Use this in API routes that require authentication
 */
export async function requireAuth(): Promise<{
  session: Session;
  profile: UserProfile;
}> {
  const { session, profile } = await getCurrentUser();

  if (!session || !profile) {
    throw new Error('Authentication required');
  }

  return { session, profile };
}

/**
 * Require admin role (throw error if not admin)
 * Use this in admin-only API routes
 */
export async function requireAdminRole(): Promise<{
  session: Session;
  profile: UserProfile;
}> {
  const { session, profile } = await requireAuth();

  if (profile.role !== 'ADMIN') {
    throw new Error('Admin role required');
  }

  return { session, profile };
}

/**
 * Check if current user is admin
 */
export async function isAdmin(): Promise<boolean> {
  const { profile } = await getCurrentUser();
  return profile?.role === 'ADMIN';
}

/**
 * Check if current user is editor or admin
 */
export async function canEdit(): Promise<boolean> {
  const { profile } = await getCurrentUser();
  return profile?.role === 'ADMIN' || profile?.role === 'EDITOR';
}
