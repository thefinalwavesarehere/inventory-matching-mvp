'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/app/lib/auth-helpers';

interface MasterRule {
  id: string;
  ruleType: 'POSITIVE_MAP' | 'NEGATIVE_BLOCK';
  scope: 'GLOBAL' | 'PROJECT_SPECIFIC';
  storePartNumber: string;
  supplierPartNumber: string | null;
  lineCode: string | null;
  confidence: number;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  projectId: string | null;
  appliedCount: number;
  lastAppliedAt: string | null;
  project?: {
    id: string;
    name: string;
  };
}

export default function MasterRulesPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useCurrentUser();
  
  const [rules, setRules] = useState<MasterRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('enabled');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'POSITIVE_MAP' | 'NEGATIVE_BLOCK'>('all');
  
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);
  
  useEffect(() => {
    if (user) {
      fetchRules();
    }
  }, [user, filter, typeFilter, search]);
  
  const fetchRules = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('enabled', filter === 'enabled' ? 'true' : 'false');
      if (typeFilter !== 'all') params.set('ruleType', typeFilter);
      if (search) params.set('search', search);
      
      const res = await fetch(`/api/master-rules?${params.toString()}`);
      const data = await res.json();
      
      if (data.success) {
        setRules(data.rules);
      }
    } catch (error) {
      console.error('Error fetching rules:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const toggleRule = async (ruleId: string, currentlyEnabled: boolean) => {
    try {
      const res = await fetch('/api/master-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId, enabled: !currentlyEnabled }),
      });
      
      if (res.ok) {
        fetchRules();
      }
    } catch (error) {
      console.error('Error toggling rule:', error);
    }
  };
  
  const deleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule? This action cannot be undone.')) {
      return;
    }
    
    try {
      const res = await fetch(`/api/master-rules?ruleId=${ruleId}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        fetchRules();
      }
    } catch (error) {
      console.error('Error deleting rule:', error);
    }
  };
  
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Master Rules
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage learned rules from manual review decisions. These rules are automatically applied in future matching jobs.
          </p>
        </div>
        
        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Search Part Numbers
              </label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Status
              </label>
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">All Rules</option>
                <option value="enabled">Enabled Only</option>
                <option value="disabled">Disabled Only</option>
              </select>
            </div>
            
            {/* Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Rule Type
              </label>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="all">All Types</option>
                <option value="POSITIVE_MAP">Positive Map (Always Match)</option>
                <option value="NEGATIVE_BLOCK">Negative Block (Never Match)</option>
              </select>
            </div>
          </div>
        </div>
        
        {/* Rules List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          {rules.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              No rules found. Rules are automatically created when you approve or reject matches.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Store Part Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Supplier Part Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Scope
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Applied
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {rules.map((rule) => (
                    <tr key={rule.id} className={!rule.enabled ? 'opacity-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {rule.ruleType === 'POSITIVE_MAP' ? (
                          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded">
                            ✓ Always Match
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded">
                            ✗ Never Match
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                        {rule.storePartNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                        {rule.supplierPartNumber || <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {rule.scope === 'GLOBAL' ? (
                          <span>🌐 Global</span>
                        ) : (
                          <span title={rule.project?.name}>📁 {rule.project?.name || 'Project'}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {rule.appliedCount} times
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {rule.enabled ? (
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                            Enabled
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 rounded">
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                        <button
                          onClick={() => toggleRule(rule.id, rule.enabled)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          {rule.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {/* Stats */}
        <div className="mt-6 text-sm text-gray-600 dark:text-gray-400">
          Showing {rules.length} rule{rules.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  );
}
