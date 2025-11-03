'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface UploadSession {
  id: string;
  fileName: string;
  fileType: string;
  uploadedAt: string;
  rowCount: number;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  uploadSessions: UploadSession[];
  _count?: {
    uploadSessions: number;
  };
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/upload');
      const data = await response.json();
      if (data.success) {
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getFileTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      arnold: 'Arnold Inventory',
      supplier: 'Supplier Catalog',
      interchange: 'Interchange',
      inventory_report: 'Inventory Report',
    };
    return labels[type] || type;
  };

  const getFileTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      arnold: 'bg-blue-100 text-blue-800',
      supplier: 'bg-green-100 text-green-800',
      interchange: 'bg-purple-100 text-purple-800',
      inventory_report: 'bg-orange-100 text-orange-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getLastUploadDate = (project: Project) => {
    if (!project.uploadSessions || project.uploadSessions.length === 0) {
      return null;
    }
    const dates = project.uploadSessions.map(s => new Date(s.uploadedAt).getTime());
    const latest = new Date(Math.max(...dates));
    return latest;
  };

  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const getTotalRows = (project: Project) => {
    return project.uploadSessions.reduce((sum, session) => sum + (session.rowCount || 0), 0);
  };

  const getFileTypeCounts = (project: Project) => {
    const counts: Record<string, number> = {};
    project.uploadSessions.forEach(session => {
      counts[session.fileType] = (counts[session.fileType] || 0) + 1;
    });
    return counts;
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
          <Link
            href="/upload"
            className="bg-black text-white p-6 rounded-lg hover:bg-gray-800 transition-colors"
          >
            <div className="text-3xl mb-2">📤</div>
            <h2 className="text-xl font-semibold mb-1">Upload Files</h2>
            <p className="text-sm text-gray-300">
              Upload inventory, catalogs, or interchange files
            </p>
          </Link>

          <Link
            href="/match"
            className="bg-blue-600 text-white p-6 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <div className="text-3xl mb-2">🔍</div>
            <h2 className="text-xl font-semibold mb-1">View Matches</h2>
            <p className="text-sm text-blue-100">
              Review and confirm part matches
            </p>
          </Link>

          <Link
            href="/projects"
            className="bg-gray-600 text-white p-6 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <div className="text-3xl mb-2">📁</div>
            <h2 className="text-xl font-semibold mb-1">Manage Projects</h2>
            <p className="text-sm text-gray-300">
              View, delete, and manage your projects and files
            </p>
          </Link>
        </div>

        {/* Projects Section */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Projects</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 rounded ${
                  viewMode === 'grid'
                    ? 'bg-black text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 rounded ${
                  viewMode === 'list'
                    ? 'bg-black text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                List
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
            </div>
          ) : projects.length > 0 ? (
            viewMode === 'grid' ? (
              /* Grid View */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map((project) => {
                  const lastUpload = getLastUploadDate(project);
                  const fileTypeCounts = getFileTypeCounts(project);
                  const totalRows = getTotalRows(project);

                  return (
                    <div
                      key={project.id}
                      className="border border-gray-200 rounded-lg p-5 hover:shadow-lg transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="font-bold text-lg text-gray-900 flex-1">
                          {project.name}
                        </h3>
                      </div>

                      {project.description && (
                        <p className="text-sm text-gray-600 mb-3">
                          {project.description}
                        </p>
                      )}

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center text-sm text-gray-600">
                          <span className="font-medium mr-2">📁 Files:</span>
                          <span>{project.uploadSessions.length}</span>
                        </div>

                        <div className="flex items-center text-sm text-gray-600">
                          <span className="font-medium mr-2">📊 Total Rows:</span>
                          <span>{totalRows.toLocaleString()}</span>
                        </div>

                        {lastUpload && (
                          <div className="flex items-center text-sm text-gray-600">
                            <span className="font-medium mr-2">🕒 Last Upload:</span>
                            <span>{formatRelativeTime(lastUpload)}</span>
                          </div>
                        )}

                        <div className="flex items-center text-sm text-gray-600">
                          <span className="font-medium mr-2">📅 Created:</span>
                          <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {/* File Type Badges */}
                      <div className="flex flex-wrap gap-1 mb-4">
                        {Object.entries(fileTypeCounts).map(([type, count]) => (
                          <span
                            key={type}
                            className={`text-xs px-2 py-1 rounded ${getFileTypeBadgeColor(type)}`}
                          >
                            {getFileTypeLabel(type)} ({count})
                          </span>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <Link
                          href={`/match?projectId=${project.id}`}
                          className="flex-1 text-center text-sm px-3 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors"
                        >
                          View Matches
                        </Link>
                        <Link
                          href={`/upload?projectId=${project.id}`}
                          className="flex-1 text-center text-sm px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
                        >
                          Add Files
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* List View */
              <div className="space-y-4">
                {projects.map((project) => {
                  const lastUpload = getLastUploadDate(project);
                  const fileTypeCounts = getFileTypeCounts(project);
                  const totalRows = getTotalRows(project);

                  return (
                    <div
                      key={project.id}
                      className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-bold text-xl text-gray-900 mb-2">
                            {project.name}
                          </h3>
                          {project.description && (
                            <p className="text-sm text-gray-600 mb-3">
                              {project.description}
                            </p>
                          )}

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Files</div>
                              <div className="font-semibold">{project.uploadSessions.length}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Total Rows</div>
                              <div className="font-semibold">{totalRows.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Last Upload</div>
                              <div className="font-semibold">
                                {lastUpload ? formatRelativeTime(lastUpload) : 'Never'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500 mb-1">Created</div>
                              <div className="font-semibold">
                                {new Date(project.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>

                          {/* File Type Badges */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            {Object.entries(fileTypeCounts).map(([type, count]) => (
                              <span
                                key={type}
                                className={`text-xs px-2 py-1 rounded ${getFileTypeBadgeColor(type)}`}
                              >
                                {getFileTypeLabel(type)} ({count})
                              </span>
                            ))}
                          </div>

                          {/* File List */}
                          {project.uploadSessions.length > 0 && (
                            <details className="text-sm">
                              <summary className="cursor-pointer text-blue-600 hover:text-blue-800 mb-2">
                                View {project.uploadSessions.length} file(s)
                              </summary>
                              <div className="ml-4 space-y-1">
                                {project.uploadSessions.map((session) => (
                                  <div key={session.id} className="text-gray-600">
                                    • {session.fileName} ({session.rowCount.toLocaleString()} rows) - {formatRelativeTime(new Date(session.uploadedAt))}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 ml-4">
                          <Link
                            href={`/match?projectId=${project.id}`}
                            className="text-center text-sm px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors whitespace-nowrap"
                          >
                            View Matches
                          </Link>
                          <Link
                            href={`/upload?projectId=${project.id}`}
                            className="text-center text-sm px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors whitespace-nowrap"
                          >
                            Add Files
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="bg-gray-100 p-12 rounded-lg text-center">
              <div className="text-6xl mb-4">📦</div>
              <p className="text-gray-600 text-lg mb-4">
                No projects yet. Upload your first file to get started!
              </p>
              <Link
                href="/upload"
                className="inline-block px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                Upload Files
              </Link>
            </div>
          )}
        </div>

        {/* Features Section */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl mb-2">🎯</div>
            <h3 className="font-semibold text-lg mb-2">Multi-Stage Matching</h3>
            <p className="text-sm text-gray-600">
              Part number → Part name → Description → Web search fallback
            </p>
          </div>

          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl mb-2">🤖</div>
            <h3 className="font-semibold text-lg mb-2">AI-Powered Search</h3>
            <p className="text-sm text-gray-600">
              Automatic web search for unmatched parts using OpenAI Agents
            </p>
          </div>

          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl mb-2">✅</div>
            <h3 className="font-semibold text-lg mb-2">Human-in-the-Loop</h3>
            <p className="text-sm text-gray-600">
              Review, confirm, or reject matches with enrichment data
            </p>
          </div>

          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl mb-2">📊</div>
            <h3 className="font-semibold text-lg mb-2">Comprehensive Reports</h3>
            <p className="text-sm text-gray-600">
              Export unmatched parts and confirmed matches to Excel
            </p>
          </div>

          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl mb-2">📁</div>
            <h3 className="font-semibold text-lg mb-2">Project Management</h3>
            <p className="text-sm text-gray-600">
              Group files into projects for organized workflow
            </p>
          </div>

          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200">
            <div className="text-2xl mb-2">💾</div>
            <h3 className="font-semibold text-lg mb-2">Persistent Storage</h3>
            <p className="text-sm text-gray-600">
              All data saved to Prisma Postgres database
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
