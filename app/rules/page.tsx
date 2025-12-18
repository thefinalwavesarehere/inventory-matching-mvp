'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface VendorActionRule {
  id: string;
  projectId: string | null;
  supplierLineCode: string;
  categoryPattern: string;
  subcategoryPattern: string;
  action: 'NONE' | 'LIFT' | 'REBOX' | 'UNKNOWN' | 'CONTACT_VENDOR';
  active: boolean;
  scope: 'global' | 'project';
  createdAt: string;
  updatedAt: string;
}

export default function RulesManagementPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId');
  
  const [rules, setRules] = useState<VendorActionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRule, setEditingRule] = useState<VendorActionRule | null>(null);

  useEffect(() => {
    loadRules();
  }, [projectId]);

  const loadRules = async () => {
    try {
      setLoading(true);
      setError('');
      
      const url = projectId 
        ? `/api/projects/${projectId}/rules`
        : `/api/rules`;
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load rules');
      
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRule = () => {
    setEditingRule(null);
    setShowCreateModal(true);
  };

  const handleEditRule = (rule: VendorActionRule) => {
    setEditingRule(rule);
    setShowCreateModal(true);
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      const res = await fetch(`/api/rules/${ruleId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete rule');

      // Reload rules
      await loadRules();
    } catch (err: any) {
      alert('Error deleting rule: ' + err.message);
    }
  };

  const handleToggleActive = async (rule: VendorActionRule) => {
    try {
      const res = await fetch(`/api/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !rule.active }),
      });

      if (!res.ok) throw new Error('Failed to update rule');

      // Reload rules
      await loadRules();
    } catch (err: any) {
      alert('Error updating rule: ' + err.message);
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'LIFT': return 'bg-blue-100 text-blue-700';
      case 'REBOX': return 'bg-purple-100 text-purple-700';
      case 'UNKNOWN': return 'bg-yellow-100 text-yellow-700';
      case 'CONTACT_VENDOR': return 'bg-pink-100 text-pink-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'LIFT': return '🔵';
      case 'REBOX': return '📦';
      case 'UNKNOWN': return '❓';
      case 'CONTACT_VENDOR': return '📞';
      default: return '⊘';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Vendor Action Rules</h1>
              <p className="text-gray-600 text-sm mt-1">
                {projectId 
                  ? 'Manage automated vendor action rules for this project' 
                  : 'Manage global vendor action rules (apply to all projects)'}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCreateRule}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                + Create Rule
              </button>
              {projectId && (
                <button
                  onClick={() => router.push(`/match?projectId=${projectId}`)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  ← Back to Matches
                </button>
              )}
              {!projectId && (
                <button
                  onClick={() => router.push('/')}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  ← Back to Home
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">ℹ️</div>
            <div className="text-sm text-blue-700">
              <p className="font-medium mb-1">How Vendor Action Rules Work:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Supplier Line Code:</strong> Must match exactly (e.g., "GATES", "PICO")</li>
                <li><strong>Category/Subcategory:</strong> Use "*" for wildcard or exact text</li>
                <li><strong>Priority:</strong> Project-specific rules override global rules</li>
                <li><strong>Pattern Priority:</strong> Exact matches beat wildcards</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Rules List */}
        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <div className="animate-spin text-4xl mb-4">⚙️</div>
              Loading rules...
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <div className="text-red-600 mb-4">❌ {error}</div>
              <button
                onClick={loadRules}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : rules.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">⚙️</div>
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                No Rules Yet
              </h3>
              <p className="text-gray-500 mb-6">
                Create your first vendor action rule to automate match tagging
              </p>
              <button
                onClick={handleCreateRule}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Create First Rule
              </button>
              
              {/* Rule Examples */}
              <div className="mt-12 max-w-2xl mx-auto text-left">
                <h4 className="font-semibold text-gray-700 mb-4">Example Rules:</h4>
                <div className="space-y-3">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="font-medium text-blue-900">GATES Belts → LIFT</div>
                    <div className="text-sm text-blue-700 mt-1">
                      Line Code: GATES | Category: belts | Subcategory: * → Action: LIFT
                    </div>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="font-medium text-purple-900">PICO Wiring → REBOX</div>
                    <div className="text-sm text-purple-700 mt-1">
                      Line Code: PICO | Category: wiring | Subcategory: * → Action: REBOX
                    </div>
                  </div>
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="font-medium text-yellow-900">Unknown Brands → UNKNOWN</div>
                    <div className="text-sm text-yellow-700 mt-1">
                      Line Code: GENERIC | Category: * | Subcategory: * → Action: UNKNOWN
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scope</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Line Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subcategory</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded font-medium ${
                          rule.scope === 'project' 
                            ? 'bg-indigo-100 text-indigo-700' 
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {rule.scope === 'project' ? '📁 Project' : '🌐 Global'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm">{rule.supplierLineCode}</td>
                      <td className="px-6 py-4 text-sm">{rule.categoryPattern}</td>
                      <td className="px-6 py-4 text-sm">{rule.subcategoryPattern}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded font-medium ${getActionColor(rule.action)}`}>
                          {getActionIcon(rule.action)} {rule.action}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleActive(rule)}
                          className={`px-2 py-1 text-xs rounded font-medium ${
                            rule.active 
                              ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {rule.active ? '✓ Active' : '✗ Inactive'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleEditRule(rule)}
                            className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <RuleModal
          rule={editingRule}
          projectId={projectId}
          onClose={() => {
            setShowCreateModal(false);
            setEditingRule(null);
          }}
          onSave={() => {
            setShowCreateModal(false);
            setEditingRule(null);
            loadRules();
          }}
        />
      )}
    </div>
  );
}

// Rule Modal Component
function RuleModal({ 
  rule, 
  projectId, 
  onClose, 
  onSave 
}: { 
  rule: VendorActionRule | null; 
  projectId: string | null; 
  onClose: () => void; 
  onSave: () => void; 
}) {
  const [formData, setFormData] = useState({
    supplierLineCode: rule?.supplierLineCode || '',
    categoryPattern: rule?.categoryPattern || '*',
    subcategoryPattern: rule?.subcategoryPattern || '*',
    action: rule?.action || 'NONE',
    active: rule?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.supplierLineCode.trim()) {
      setError('Supplier Line Code is required');
      return;
    }

    try {
      setSaving(true);
      setError('');

      if (rule) {
        // Update existing rule
        const res = await fetch(`/api/rules/${rule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (!res.ok) throw new Error('Failed to update rule');
      } else {
        // Create new rule
        const url = projectId 
          ? `/api/projects/${projectId}/rules`
          : `/api/rules`;

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (!res.ok) throw new Error('Failed to create rule');
      }

      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">
            {rule ? 'Edit Rule' : 'Create New Rule'}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {projectId 
              ? 'This rule will apply only to this project' 
              : 'This rule will apply globally to all projects'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Supplier Line Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Supplier Line Code *
            </label>
            <input
              type="text"
              value={formData.supplierLineCode}
              onChange={(e) => setFormData({ ...formData, supplierLineCode: e.target.value.toUpperCase() })}
              placeholder="e.g., GATES, PICO, DAYCO"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Must match exactly (case-insensitive, will be converted to uppercase)
            </p>
          </div>

          {/* Category Pattern */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category Pattern *
            </label>
            <input
              type="text"
              value={formData.categoryPattern}
              onChange={(e) => setFormData({ ...formData, categoryPattern: e.target.value })}
              placeholder="e.g., belts, hoses, or * for any"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Use "*" for wildcard (matches any category)
            </p>
          </div>

          {/* Subcategory Pattern */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subcategory Pattern *
            </label>
            <input
              type="text"
              value={formData.subcategoryPattern}
              onChange={(e) => setFormData({ ...formData, subcategoryPattern: e.target.value })}
              placeholder="e.g., V-belt, coolant, or * for any"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Use "*" for wildcard (matches any subcategory)
            </p>
          </div>

          {/* Vendor Action */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vendor Action *
            </label>
            <select
              value={formData.action}
              onChange={(e) => setFormData({ ...formData, action: e.target.value as any })}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="NONE">⊘ None</option>
              <option value="LIFT">🔵 Lift</option>
              <option value="REBOX">📦 Rebox</option>
              <option value="UNKNOWN">❓ Unknown</option>
              <option value="CONTACT_VENDOR">📞 Contact Vendor</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Action to apply when this rule matches
            </p>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <label htmlFor="active" className="text-sm font-medium text-gray-700">
              Active (rule will be applied immediately)
            </label>
          </div>

          {/* Priority Info */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
            <p className="font-medium mb-1">Rule Priority:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Project-specific rules override global rules</li>
              <li>Exact patterns beat wildcards</li>
              <li>More specific patterns have higher priority</li>
            </ul>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? 'Saving...' : (rule ? 'Update Rule' : 'Create Rule')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
