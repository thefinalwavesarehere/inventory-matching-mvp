'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

interface MatchingRule {
  id: string;
  name: string;
  description: string;
  ruleType: string;
  conditions: any;
  actions: any;
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function RulesManagementPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId');
  
  const [rules, setRules] = useState<MatchingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (projectId) {
      loadRules();
    }
  }, [projectId]);

  const loadRules = async () => {
    try {
      setLoading(true);
      // TODO: Create API endpoint for rules
      // const res = await fetch(`/api/projects/${projectId}/rules`);
      // if (!res.ok) throw new Error('Failed to load rules');
      // const data = await res.json();
      // setRules(data.rules || []);
      
      // For now, show placeholder
      setRules([]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Matching Rules</h1>
              <p className="text-gray-600 text-sm mt-1">
                Create and manage automated matching rules for this project
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                + Create Rule
              </button>
              <button
                onClick={() => router.push(`/match?projectId=${projectId}`)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
              >
                ← Back to Matches
              </button>
            </div>
          </div>
        </div>

        {/* Rules List */}
        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="p-12 text-center text-gray-500">
              Loading rules...
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <div className="text-red-600 mb-4">{error}</div>
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
                Create your first matching rule to automate part number matching
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Create First Rule
              </button>
              
              {/* Rule Examples */}
              <div className="mt-12 max-w-2xl mx-auto text-left">
                <h4 className="font-semibold text-gray-700 mb-4">Example Rules:</h4>
                <div className="space-y-3">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="font-medium text-blue-900">Auto-Accept High Confidence Interchange</div>
                    <div className="text-sm text-blue-700 mt-1">
                      If method = "INTERCHANGE" AND confidence ≥ 95% → Auto-accept
                    </div>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="font-medium text-green-900">Flag Price Discrepancies</div>
                    <div className="text-sm text-green-700 mt-1">
                      If cost_difference &gt; $50 → Set vendor_action = "CONTACT_VENDOR"
                    </div>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <div className="font-medium text-purple-900">Pattern-Based Matching</div>
                    <div className="text-sm text-purple-700 mt-1">
                      If part_number matches pattern "^[A-Z]{3}[0-9]{5}$" → Boost confidence by 10%
                    </div>
                  </div>
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="font-medium text-yellow-900">Reject Low Confidence Fuzzy</div>
                    <div className="text-sm text-yellow-700 mt-1">
                      If method = "FUZZY_SUBSTRING" AND confidence &lt; 60% → Auto-reject
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              {rules.map((rule) => (
                <div key={rule.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">{rule.name}</h3>
                        <span className={`px-2 py-1 text-xs rounded ${
                          rule.enabled 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <span className="text-sm text-gray-500">
                          Priority: {rule.priority}
                        </span>
                      </div>
                      <p className="text-gray-600 text-sm mb-3">
                        {rule.description}
                      </p>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>Type: {rule.ruleType}</span>
                        <span>•</span>
                        <span>Created: {new Date(rule.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Coming Soon Notice */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="text-3xl">🚧</div>
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">
                Rules Engine - Coming Soon
              </h3>
              <p className="text-blue-700 text-sm mb-3">
                The advanced rules engine is currently under development. This feature will allow you to:
              </p>
              <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                <li>Create custom matching rules with complex conditions</li>
                <li>Auto-accept or auto-reject matches based on criteria</li>
                <li>Set vendor actions automatically based on patterns</li>
                <li>Boost or penalize confidence scores</li>
                <li>Apply rules in priority order</li>
                <li>Test rules before enabling them</li>
              </ul>
              <p className="text-blue-700 text-sm mt-3">
                For now, use the <strong>batch selection</strong> and <strong>bulk actions</strong> features 
                on the Match Review page to efficiently manage large volumes of matches.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
