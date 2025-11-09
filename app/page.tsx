'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

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
}

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('Failed to fetch projects');
      const data = await response.json();
      setProjects(data.projects || []);
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
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Inventory Matching System
          </h1>
          <p className="text-gray-600">
            AI-powered inventory matching for Arnold Motor Supply
          </p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button
            onClick={() => router.push('/upload')}
            className="bg-black text-white p-6 rounded-lg hover:bg-gray-800 transition-colors text-left"
          >
            <div className="text-3xl mb-2">📤</div>
            <h2 className="text-xl font-semibold mb-1">Upload Files</h2>
            <p className="text-sm text-gray-300">
              Upload inventory, catalogs, or interchange files
            </p>
          </button>

          <button
            onClick={() => router.push('/match')}
            className="bg-blue-600 text-white p-6 rounded-lg hover:bg-blue-700 transition-colors text-left"
          >
            <div className="text-3xl mb-2">🔍</div>
            <h2 className="text-xl font-semibold mb-1">View Matches</h2>
            <p className="text-sm text-blue-100">
              Review and confirm part matches
            </p>
          </button>

          <button
            onClick={() => router.push('/projects')}
            className="bg-gray-600 text-white p-6 rounded-lg hover:bg-gray-700 transition-colors text-left"
          >
            <div className="text-3xl mb-2">📁</div>
            <h2 className="text-xl font-semibold mb-1">Manage Projects</h2>
            <p className="text-sm text-gray-300">
              View and manage your projects
            </p>
          </button>
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
                  className="border border-gray-200 rounded-lg p-5 hover:shadow-lg transition-shadow"
                >
                  <h3 className="font-bold text-lg text-gray-900 mb-2">
                    {project.name}
                  </h3>

                  {project.description && (
                    <p className="text-sm text-gray-600 mb-4">
                      {project.description}
                    </p>
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
