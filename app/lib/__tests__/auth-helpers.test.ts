/**
 * Unit tests for authentication helpers
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCurrentUser, requireAuth, requireAdminRole, isAdmin, canEdit } from '../auth-helpers';
import { prisma } from '../db/prisma';
import type { UserProfile } from '@prisma/client';

// Mock dependencies
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn(),
    },
  })),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('../db/prisma', () => ({
  prisma: {
    userProfile: {
      findUnique: vi.fn(),
    },
  },
}));

describe('getCurrentUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null session and profile when not authenticated', async () => {
    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const result = await getCurrentUser();

    expect(result.session).toBeNull();
    expect(result.profile).toBeNull();
  });

  it('should return session and profile when authenticated', async () => {
    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
    };

    const mockProfile: UserProfile = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'EDITOR',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(mockProfile);

    const result = await getCurrentUser();

    expect(result.session).toEqual(mockSession);
    expect(result.profile).toEqual(mockProfile);
    expect(prisma.userProfile.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-123' },
    });
  });

  it('should return null profile when user profile not found in database', async () => {
    const mockSession = {
      user: { id: 'user-404', email: 'notfound@example.com' },
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
    };

    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(null);

    const result = await getCurrentUser();

    expect(result.session).toEqual(mockSession);
    expect(result.profile).toBeNull();
  });
});

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw error when not authenticated', async () => {
    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(requireAuth()).rejects.toThrow('Authentication required');
  });

  it('should throw error when profile not found', async () => {
    const mockSession = {
      user: { id: 'user-404', email: 'test@example.com' },
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
    };

    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(null);

    await expect(requireAuth()).rejects.toThrow('Authentication required');
  });

  it('should return session and profile when authenticated', async () => {
    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
    };

    const mockProfile: UserProfile = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'EDITOR',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(mockProfile);

    const result = await requireAuth();

    expect(result.session).toEqual(mockSession);
    expect(result.profile).toEqual(mockProfile);
  });
});

describe('requireAdminRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw error when not authenticated', async () => {
    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    await expect(requireAdminRole()).rejects.toThrow('Authentication required');
  });

  it('should throw error when user is not admin', async () => {
    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
    };

    const mockProfile: UserProfile = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'EDITOR',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(mockProfile);

    await expect(requireAdminRole()).rejects.toThrow('Admin role required');
  });

  it('should return session and profile when user is admin', async () => {
    const mockSession = {
      user: { id: 'admin-123', email: 'admin@example.com' },
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
    };

    const mockProfile: UserProfile = {
      id: 'admin-123',
      email: 'admin@example.com',
      fullName: 'Admin User',
      role: 'ADMIN',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(mockProfile);

    const result = await requireAdminRole();

    expect(result.session).toEqual(mockSession);
    expect(result.profile).toEqual(mockProfile);
  });
});

describe('isAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when not authenticated', async () => {
    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const result = await isAdmin();

    expect(result).toBe(false);
  });

  it('should return false when user is not admin', async () => {
    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
    };

    const mockProfile: UserProfile = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'EDITOR',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(mockProfile);

    const result = await isAdmin();

    expect(result).toBe(false);
  });

  it('should return true when user is admin', async () => {
    const mockSession = {
      user: { id: 'admin-123', email: 'admin@example.com' },
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
    };

    const mockProfile: UserProfile = {
      id: 'admin-123',
      email: 'admin@example.com',
      fullName: 'Admin User',
      role: 'ADMIN',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(mockProfile);

    const result = await isAdmin();

    expect(result).toBe(true);
  });
});

describe('canEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when not authenticated', async () => {
    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const result = await canEdit();

    expect(result).toBe(false);
  });

  it('should return false when user is viewer', async () => {
    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
    };

    const mockProfile: UserProfile = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'VIEWER',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(mockProfile);

    const result = await canEdit();

    expect(result).toBe(false);
  });

  it('should return true when user is editor', async () => {
    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
    };

    const mockProfile: UserProfile = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'EDITOR',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(mockProfile);

    const result = await canEdit();

    expect(result).toBe(true);
  });

  it('should return true when user is admin', async () => {
    const mockSession = {
      user: { id: 'admin-123', email: 'admin@example.com' },
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      expires_at: Date.now() / 1000 + 3600,
      token_type: 'bearer',
    };

    const mockProfile: UserProfile = {
      id: 'admin-123',
      email: 'admin@example.com',
      fullName: 'Admin User',
      role: 'ADMIN',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs');
    const mockSupabase = createRouteHandlerClient({ cookies: vi.fn() });
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });
    vi.mocked(prisma.userProfile.findUnique).mockResolvedValue(mockProfile);

    const result = await canEdit();

    expect(result).toBe(true);
  });
});
