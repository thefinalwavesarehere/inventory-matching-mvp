'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from './hooks/useCurrentUser';

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  _count: {
    storeItems: number;
    supplierItems: number;
    matchCandidates: number;
  };
  progress?: {
    currentStage: string;
    standardCompleted: boolean;
    aiCompleted: boolean;
    webSearchCompleted: boolean;
  };
  matchRate?: number;
  uniqueMatchedItems?: number;
}

export default function Home() {
  const router = useRouter();
  const { profile: currentUser, loading: userLoading } = useCurrentUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [latestProject, setLatestProject] = useState<Project | null>(null);

  // Show pending approval message if user is not approved
  if (!userLoading && currentUser && !currentUser.isApproved) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">⏳</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Account Pending Approval
          </h1>
          <p className="text-gray-600 mb-6">
            Your account has been created successfully! An administrator needs to approve your account before you can access projects and features.
          </p>
          <p className="text-sm text-gray-500 mb-4">
            You will receive an email notification once your account is approved.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4">
            <p className="text-sm text-blue-800">
              <strong>Email:</strong> {currentUser.email}
            </p>
            <p className="text-sm text-blue-800">
              <strong>Role:</strong> {currentUser.role}
            </p>
          </div>
          <button
            onClick={() => router.push('/profile')}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            View Profile
          </button>
        </div>
      </main>
    );
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'Failed to fetch projects');
      }
      const data = await response.json();
      const projectList = data.projects || [];
      setProjects(projectList);
      
      // Find the most recently updated project
      if (projectList.length > 0) {
        const sorted = [...projectList].sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setLatestProject(sorted[0]);
      }
    } catch (err: any) {
      console.error('Failed to fetch projects:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const runMatching = async (projectId: string) => {
    try {
      const res = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error('Failed to run matching');
      alert('Matching completed!');
      fetchProjects(); // Reload
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Hero Section */}
        <div className="mb-8 bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl shadow-xl p-8 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">
                Inventory Matching System
              </h1>
              <p className="text-indigo-100 text-lg">
                AI-powered inventory matching for Arnold Motor Supply
              </p>
            </div>
            {latestProject && (
              <button
                onClick={() => router.push(`/match?projectId=${latestProject.id}`)}
                className="px-6 py-3 bg-white text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors font-semibold shadow-lg flex items-center gap-2"
              >
                <span>▶</span>
                <div className="text-left">
                  <div className="text-xs text-indigo-500">Resume Latest</div>
                  <div className="font-bold">{latestProject.name}</div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className={`grid grid-cols-1 gap-4 mb-8 ${currentUser?.role === 'ADMIN' ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
          <button
            onClick={() => router.push('/upload')}
            className="bg-black text-white p-6 rounded-lg hover:bg-gray-800 transition-colors text-left shadow-lg"
          >
            <div className="text-3xl mb-2">📤</div>
            <h2 className="text-xl font-semibold mb-1">Upload Files</h2>
            <p className="text-sm text-gray-300">
              Upload inventory, catalogs, or interchange files
            </p>
          </button>

          <button
            onClick={() => router.push('/rules')}
            className="bg-indigo-600 text-white p-6 rounded-lg hover:bg-indigo-700 transition-colors text-left shadow-lg"
          >
            <div className="text-3xl mb-2">⚙️</div>
            <h2 className="text-xl font-semibold mb-1">Rules Engine</h2>
            <p className="text-sm text-indigo-100">
              Manage automated matching rules
            </p>
          </button>

          {/* Admin-Only Quick Actions */}
          {currentUser?.role === 'ADMIN' && (
            <>
              <button
                onClick={() => router.push('/admin/users')}
                className="bg-emerald-600 text-white p-6 rounded-lg hover:bg-emerald-700 transition-colors text-left"
              >
                <div className="text-3xl mb-2">👥</div>
                <h2 className="text-xl font-semibold mb-1">User Management</h2>
                <p className="text-sm text-emerald-100">
                  Manage users and roles
                </p>
              </button>

              <button
                onClick={() => router.push('/admin/activity')}
                className="bg-amber-600 text-white p-6 rounded-lg hover:bg-amber-700 transition-colors text-left"
              >
                <div className="text-3xl mb-2">📋</div>
                <h2 className="text-xl font-semibold mb-1">Activity Log</h2>
                <p className="text-sm text-amber-100">
                  View audit trail
                </p>
              </button>
            </>
          )}
        </div>

        {/* Projects Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Recent Projects</h2>
            <button
              onClick={() => router.push('/upload')}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              + New Project
            </button>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
            </div>
          ) : projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="border border-gray-200 rounded-lg p-5 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => router.push(`/projects/${project.id}`)}
                >
                  <h3 className="font-bold text-lg text-gray-900 mb-2">
                    {project.name}
                  </h3>

                  {project.description && (
                    <p className="text-sm text-gray-600 mb-4">
                      {project.description}
                    </p>
                  )}

                  {/* Progress Badges */}
                  {project.progress && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {project.progress.standardCompleted && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">
                          ✓ Standard
                        </span>
                      )}
                      {project.progress.aiCompleted && (
                        <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-semibold rounded">
                          ✓ AI
                        </span>
                      )}
                      {project.progress.webSearchCompleted && (
                        <span className="px-2 py-1 bg-pink-100 text-pink-800 text-xs font-semibold rounded">
                          ✓ Web Search
                        </span>
                      )}
                      {!project.progress.standardCompleted && !project.progress.aiCompleted && !project.progress.webSearchCompleted && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded">
                          Not Started
                        </span>
                      )}
                    </div>
                  )}

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Store Items:</span>
                      <span className="font-semibold">{project._count.storeItems}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Supplier Items:</span>
                      <span className="font-semibold">{project._count.supplierItems}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Matches:</span>
                      <span className="font-semibold">{project._count.matchCandidates}</span>
                    </div>
                    {project.matchRate !== undefined && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Match Rate:</span>
                        <span className="font-semibold text-blue-600">
                          {(project.matchRate * 100).toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {project._count.matchCandidates > 0 ? (
                      <button
                        onClick={() => router.push(`/match?projectId=${project.id}`)}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Review Matches
                      </button>
                    ) : project._count.storeItems > 0 && project._count.supplierItems > 0 ? (
                      <button
                        onClick={() => runMatching(project.id)}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Run Matching
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full px-4 py-2 bg-gray-300 text-gray-500 rounded cursor-not-allowed"
                      >
                        Upload Files First
                      </button>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t text-xs text-gray-500">
                    Created {new Date(project.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📁</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                No Projects Yet
              </h3>
              <p className="text-gray-600 mb-6">
                Create your first project to get started with inventory matching
              </p>
              <button
                onClick={() => router.push('/upload')}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Project
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
