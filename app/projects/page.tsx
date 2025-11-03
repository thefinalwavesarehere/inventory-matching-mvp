'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface UploadSession {
  id: string;
  fileName: string;
  fileType: string;
  uploadedAt: string;
  rowCount: number;
  status: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  uploadSessions: UploadSession[];
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'project' | 'file'; id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDeleteFile = async (sessionId: string) => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/delete?sessionId=${sessionId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete file');
      }

      // Refresh projects
      await fetchProjects();
      setDeleteConfirm(null);
    } catch (err: any) {
      alert(err.message || 'An error occurred while deleting');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/delete?projectId=${projectId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete project');
      }

      // Refresh projects
      await fetchProjects();
      setDeleteConfirm(null);
    } catch (err: any) {
      alert(err.message || 'An error occurred while deleting');
    } finally {
      setIsDeleting(false);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-blue-600 hover:text-blue-800 mb-4 inline-block">
            ← Back to Home
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Project Management</h1>
          <p className="text-gray-600 mt-2">
            Manage your projects and uploaded files
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
          </div>
        ) : projects.length > 0 ? (
          <div className="space-y-6">
            {projects.map((project) => (
              <div key={project.id} className="bg-white rounded-lg shadow-md p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                      {project.name}
                    </h2>
                    {project.description && (
                      <p className="text-gray-600 mb-2">{project.description}</p>
                    )}
                    <p className="text-sm text-gray-500">
                      Created: {formatDate(project.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/upload?projectId=${project.id}`}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      Add Files
                    </Link>
                    <button
                      onClick={() => setDeleteConfirm({ type: 'project', id: project.id, name: project.name })}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                    >
                      Delete Project
                    </button>
                  </div>
                </div>

                {/* Files List */}
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-3">
                    Files ({project.uploadSessions.length})
                  </h3>

                  {project.uploadSessions.length > 0 ? (
                    <div className="space-y-3">
                      {project.uploadSessions.map((session) => (
                        <div
                          key={session.id}
                          className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-semibold text-gray-900">
                                {session.fileName}
                              </h4>
                              <span className={`text-xs px-2 py-1 rounded ${getFileTypeBadgeColor(session.fileType)}`}>
                                {getFileTypeLabel(session.fileType)}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${
                                session.status === 'completed' 
                                  ? 'bg-green-100 text-green-800' 
                                  : session.status === 'failed'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {session.status}
                              </span>
                            </div>
                            <div className="flex gap-4 text-sm text-gray-600">
                              <span>📊 {session.rowCount.toLocaleString()} rows</span>
                              <span>🕒 {formatDate(session.uploadedAt)}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Link
                              href={`/upload?projectId=${project.id}`}
                              className="px-3 py-1 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
                            >
                              Replace
                            </Link>
                            <button
                              onClick={() => setDeleteConfirm({ type: 'file', id: session.id, name: session.fileName })}
                              className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">
                      No files uploaded yet
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
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

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Confirm Deletion
              </h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete {deleteConfirm.type === 'project' ? 'the project' : 'the file'}{' '}
                <strong>"{deleteConfirm.name}"</strong>?
                {deleteConfirm.type === 'project' && (
                  <span className="block mt-2 text-red-600">
                    This will delete all files and data associated with this project.
                  </span>
                )}
                <span className="block mt-2 text-sm text-gray-500">
                  This action cannot be undone.
                </span>
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (deleteConfirm.type === 'project') {
                      handleDeleteProject(deleteConfirm.id);
                    } else {
                      handleDeleteFile(deleteConfirm.id);
                    }
                  }}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
