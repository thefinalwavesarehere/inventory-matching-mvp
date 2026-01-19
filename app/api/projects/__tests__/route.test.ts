/**
 * Integration tests for projects API
 * Tests the GET /api/projects endpoint for authorization bugs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '../route';
import { NextRequest } from 'next/server';
import { prisma } from '@/app/lib/db/prisma';
import type { UserProfile } from '@prisma/client';

// Mock dependencies
vi.mock('@/app/lib/auth-helpers', () => ({
  requireAuth: vi.fn(),
}));

vi.mock('@/app/lib/db/prisma', () => ({
  default: {
    project: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    matchingProgress: {
      findMany: vi.fn(),
    },
    matchCandidate: {
      groupBy: vi.fn(),
    },
    projectSettings: {
      create: vi.fn(),
    },
  },
}));

describe('GET /api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return projects list when authenticated', async () => {
    const mockProfile: UserProfile = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'EDITOR',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'token',
    };

    const mockProjects = [
      {
        id: 'project-1',
        name: 'Test Project 1',
        description: 'Description 1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        _count: {
          storeItems: 100,
          supplierItems: 500,
          matchCandidates: 80,
        },
      },
      {
        id: 'project-2',
        name: 'Test Project 2',
        description: 'Description 2',
        createdAt: new Date('2024-01-03'),
        updatedAt: new Date('2024-01-04'),
        _count: {
          storeItems: 50,
          supplierItems: 300,
          matchCandidates: 40,
        },
      },
    ];

    const mockProgress = [
      {
        id: 'progress-1',
        projectId: 'project-1',
        currentStage: 'FUZZY',
        standardCompleted: true,
        aiCompleted: false,
        webSearchCompleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Mock auth
    const { requireAuth } = await import('@/app/lib/auth-helpers');
    vi.mocked(requireAuth).mockResolvedValue({ session: mockSession as any, profile: mockProfile });

    // Mock database queries
    vi.mocked(prisma.project.findMany).mockResolvedValue(mockProjects as any);
    vi.mocked(prisma.matchingProgress.findMany).mockResolvedValue(mockProgress as any);
    vi.mocked(prisma.matchCandidate.groupBy).mockImplementation((async () => {
      // Return different counts for different projects
      return [{ storeItemId: 'item-1' }];
    }) as any);

    const req = new NextRequest('http://localhost:3000/api/projects');
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.projects).toHaveLength(2);
    expect(data.projects[0].id).toBe('project-1');
    expect(data.projects[0].name).toBe('Test Project 1');
    expect(data.projects[0]._count.storeItems).toBe(100);
    expect(data.projects[0].progress).toBeDefined();
    expect(data.projects[0].progress.currentStage).toBe('FUZZY');
  });

  it('should return 500 when authentication fails', async () => {
    const { requireAuth } = await import('@/app/lib/auth-helpers');
    vi.mocked(requireAuth).mockRejectedValue(new Error('Authentication required'));

    const req = new NextRequest('http://localhost:3000/api/projects');
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Failed to fetch projects');
  });

  it('should handle empty projects list', async () => {
    const mockProfile: UserProfile = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'EDITOR',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'token',
    };

    const { requireAuth } = await import('@/app/lib/auth-helpers');
    vi.mocked(requireAuth).mockResolvedValue({ session: mockSession as any, profile: mockProfile });
    vi.mocked(prisma.project.findMany).mockResolvedValue([]);
    vi.mocked(prisma.matchingProgress.findMany).mockResolvedValue([]);

    const req = new NextRequest('http://localhost:3000/api/projects');
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.projects).toHaveLength(0);
  });

  it('should handle projects with no matches (regression test for Unauthorized bug)', async () => {
    // This test specifically addresses the "Unauthorized projects" bug
    // by ensuring that projects with no store items don't cause errors
    const mockProfile: UserProfile = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'EDITOR',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'token',
    };

    const mockProjects = [
      {
        id: 'empty-project',
        name: 'Empty Project',
        description: 'No store items',
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: {
          storeItems: 0,
          supplierItems: 0,
          matchCandidates: 0,
        },
      },
    ];

    const { requireAuth } = await import('@/app/lib/auth-helpers');
    vi.mocked(requireAuth).mockResolvedValue({ session: mockSession as any, profile: mockProfile });
    vi.mocked(prisma.project.findMany).mockResolvedValue(mockProjects as any);
    vi.mocked(prisma.matchingProgress.findMany).mockResolvedValue([]);

    const req = new NextRequest('http://localhost:3000/api/projects');
    const response = await GET(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].matchRate).toBe(0);
    expect(data.projects[0].uniqueMatchedItems).toBe(0);
  });
});

describe('POST /api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a new project when authenticated', async () => {
    const mockProfile: UserProfile = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'EDITOR',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'token',
    };

    const mockProject = {
      id: 'new-project',
      name: 'New Test Project',
      description: 'Test Description',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const { requireAuth } = await import('@/app/lib/auth-helpers');
    vi.mocked(requireAuth).mockResolvedValue({ session: mockSession as any, profile: mockProfile });
    vi.mocked(prisma.project.create).mockResolvedValue(mockProject as any);
    vi.mocked(prisma.projectSettings.create).mockResolvedValue({} as any);

    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: 'New Test Project',
        description: 'Test Description',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.project.id).toBe('new-project');
    expect(data.project.name).toBe('New Test Project');
    expect(prisma.projectSettings.create).toHaveBeenCalledWith({
      data: {
        projectId: 'new-project',
        autoConfirmMin: 0.92,
        reviewBandMin: 0.65,
        autoRejectMax: 0.40,
        aiEnabled: false,
      },
    });
  });

  it('should return 400 when project name is missing', async () => {
    const mockProfile: UserProfile = {
      id: 'user-123',
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'EDITOR',
      isApproved: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockSession = {
      user: { id: 'user-123', email: 'test@example.com' },
      access_token: 'token',
    };

    const { requireAuth } = await import('@/app/lib/auth-helpers');
    vi.mocked(requireAuth).mockResolvedValue({ session: mockSession as any, profile: mockProfile });

    const req = new NextRequest('http://localhost:3000/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        description: 'Test Description',
      }),
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Project name is required');
  });
});
