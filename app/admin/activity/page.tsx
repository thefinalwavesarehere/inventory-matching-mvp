'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';

interface ActivityLog {
  id: string;
  projectId: string | null;
  userId: string;
  action: string;
  details: any;
  ipAddress: string | null;
  createdAt: string;
  user: {
    email: string;
    fullName: string | null;
  };
  project?: {
    name: string;
  };
}

export default function AdminActivityPage() {
  const router = useRouter();
  const { profile: currentUser, loading: userLoading } = useCurrentUser();
  
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Check if current user is admin
  useEffect(() => {
    if (!userLoading && currentUser?.role !== 'ADMIN') {
      router.push('/');
    }
  }, [currentUser, userLoading, router]);

  // Load activities
  useEffect(() => {
    if (currentUser?.role === 'ADMIN') {
      loadActivities();
    }
  }, [currentUser, filter, page]);

  const loadActivities = async () => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        ...(filter !== 'all' && { action: filter }),
      });

      const res = await fetch(`/api/admin/activity?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load activities');
      }

      const data = await res.json();
      setActivities(data.activities || []);
      setTotalPages(data.totalPages || 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('BULK_ACCEPT') || action.includes('ACCEPT')) return 'bg-green-100 text-green-700';
    if (action.includes('BULK_REJECT') || action.includes('REJECT')) return 'bg-red-100 text-red-700';
    if (action.includes('RULE')) return 'bg-purple-100 text-purple-700';
    if (action.includes('USER')) return 'bg-blue-100 text-blue-700';
    if (action.includes('FILE')) return 'bg-yellow-100 text-yellow-700';
    return 'bg-gray-100 text-gray-700';
  };

  const formatActionName = (action: string) => {
    return action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  };

  if (userLoading || (currentUser?.role === 'ADMIN' && loading && activities.length === 0)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⚙️</div>
          <p className="text-gray-600">Loading activity log...</p>
        </div>
      </div>
    );
  }

  if (currentUser?.role !== 'ADMIN') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-blue-600 hover:text-blue-700 mb-4 flex items-center gap-2"
          >
            ← Back to Home
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Activity Log</h1>
          <p className="text-gray-600 mt-1">Comprehensive audit trail of all user actions</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Filter by Action:</label>
            <select
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Actions</option>
              <option value="BULK_ACCEPT">Bulk Accept</option>
              <option value="BULK_REJECT">Bulk Reject</option>
              <option value="BULK_SET_VENDOR_ACTION">Bulk Set Vendor Action</option>
              <option value="RULE_CREATED">Rule Created</option>
              <option value="RULE_UPDATED">Rule Updated</option>
              <option value="RULE_DELETED">Rule Deleted</option>
              <option value="USER_ROLE_CHANGED">User Role Changed</option>
              <option value="PASSWORD_RESET_SENT">Password Reset Sent</option>
              <option value="FILE_UPLOADED">File Uploaded</option>
            </select>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Activity Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    IP Address
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {activities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                      No activities found
                    </td>
                  </tr>
                ) : (
                  activities.map((activity) => (
                    <tr key={activity.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(activity.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">
                          {activity.user.fullName || 'No name'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {activity.user.email}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 text-xs rounded-full font-medium ${getActionBadgeColor(activity.action)}`}>
                          {formatActionName(activity.action)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {activity.project?.name || (activity.projectId ? 'Unknown Project' : 'System')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <details className="cursor-pointer">
                          <summary className="text-blue-600 hover:text-blue-700">
                            View Details
                          </summary>
                          <pre className="mt-2 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                            {JSON.stringify(activity.details, null, 2)}
                          </pre>
                        </details>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                        {activity.ipAddress || 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-gray-700">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-3xl font-bold text-gray-900">
              {activities.length}
            </div>
            <div className="text-sm text-gray-600 mt-1">Activities on This Page</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-3xl font-bold text-blue-600">
              {activities.filter(a => a.action.includes('BULK')).length}
            </div>
            <div className="text-sm text-gray-600 mt-1">Bulk Operations</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-3xl font-bold text-purple-600">
              {activities.filter(a => a.action.includes('RULE')).length}
            </div>
            <div className="text-sm text-gray-600 mt-1">Rule Changes</div>
          </div>
        </div>
      </div>
    </div>
  );
}
