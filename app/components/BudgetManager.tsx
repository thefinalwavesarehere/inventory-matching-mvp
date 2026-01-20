'use client';

import { useState, useEffect } from 'react';

interface BudgetStatus {
  totalSpent: number;
  budgetLimit: number | null;
  remaining: number | null;
  percentUsed: number | null;
  canProceed: boolean;
  withinBudget: boolean;
}

interface CostSummary {
  totalCost: number;
  aiCost: number;
  webSearchCost: number;
  itemsProcessed: number;
  budgetStatus: BudgetStatus;
}

interface BudgetManagerProps {
  projectId: string;
}

export default function BudgetManager({ projectId }: BudgetManagerProps) {
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingBudget, setEditingBudget] = useState(false);
  const [newBudgetLimit, setNewBudgetLimit] = useState('');

  useEffect(() => {
    loadBudgetStatus();
  }, [projectId]);

  const loadBudgetStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${projectId}/budget`);
      if (!res.ok) throw new Error('Failed to load budget status');

      const data = await res.json();
      setCostSummary(data);
      setNewBudgetLimit(data.budgetStatus.budgetLimit?.toString() || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateBudgetLimit = async () => {
    try {
      const budgetLimit = newBudgetLimit === '' ? null : parseFloat(newBudgetLimit);

      if (budgetLimit !== null && (isNaN(budgetLimit) || budgetLimit < 0)) {
        alert('Budget limit must be a positive number or empty for unlimited');
        return;
      }

      const res = await fetch(`/api/projects/${projectId}/budget`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ budgetLimit }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update budget');
      }

      setEditingBudget(false);
      loadBudgetStatus();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-500">Loading budget status...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-800 p-4 rounded">
        {error}
      </div>
    );
  }

  if (!costSummary) return null;

  const { budgetStatus } = costSummary;
  const percentUsed = budgetStatus.percentUsed || 0;
  const isNearLimit = budgetStatus.budgetLimit !== null && percentUsed >= 80;
  const isOverBudget = !budgetStatus.withinBudget;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Budget & Cost Tracking</h2>
        <button
          onClick={() => setEditingBudget(!editingBudget)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {editingBudget ? 'Cancel' : 'Edit Budget'}
        </button>
      </div>

      {/* Budget Limit Editor */}
      {editingBudget && (
        <div className="mb-4 p-4 bg-gray-50 rounded">
          <label className="block text-sm font-medium mb-2">
            Budget Limit (USD) - Leave empty for unlimited
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              value={newBudgetLimit}
              onChange={(e) => setNewBudgetLimit(e.target.value)}
              placeholder="Unlimited"
              min="0"
              step="0.01"
              className="flex-1 px-3 py-2 border rounded"
            />
            <button
              onClick={updateBudgetLimit}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Budget Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-gray-50 rounded">
          <div className="text-sm text-gray-600 mb-1">Budget Limit</div>
          <div className="text-2xl font-bold">
            {budgetStatus.budgetLimit !== null
              ? `$${budgetStatus.budgetLimit.toFixed(2)}`
              : 'Unlimited'}
          </div>
        </div>

        <div className={`p-4 rounded ${isOverBudget ? 'bg-red-50' : isNearLimit ? 'bg-yellow-50' : 'bg-gray-50'}`}>
          <div className="text-sm text-gray-600 mb-1">Total Spent</div>
          <div className="text-2xl font-bold">
            ${budgetStatus.totalSpent.toFixed(2)}
          </div>
          {budgetStatus.budgetLimit !== null && (
            <div className="text-sm text-gray-600 mt-1">
              {percentUsed.toFixed(1)}% of budget
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {budgetStatus.budgetLimit !== null && (
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-1">
            <span>Budget Usage</span>
            <span className={isOverBudget ? 'text-red-600 font-semibold' : ''}>
              {budgetStatus.remaining !== null
                ? `$${Math.max(0, budgetStatus.remaining).toFixed(2)} remaining`
                : 'Over budget!'}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all ${
                isOverBudget ? 'bg-red-600' :
                isNearLimit ? 'bg-yellow-500' :
                'bg-green-600'
              }`}
              style={{ width: `${Math.min(100, percentUsed)}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Warning Messages */}
      {isOverBudget && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-red-800 text-sm font-medium">
            ⚠️ Budget exceeded! AI and web search jobs will be blocked until budget is increased.
          </p>
        </div>
      )}

      {isNearLimit && !isOverBudget && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-yellow-800 text-sm font-medium">
            ⚡ Approaching budget limit ({percentUsed.toFixed(1)}% used)
          </p>
        </div>
      )}

      {/* Cost Breakdown */}
      <div className="border-t pt-4">
        <h3 className="font-semibold mb-3">Cost Breakdown</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">AI Matching</span>
            <span className="font-mono">${costSummary.aiCost.toFixed(4)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Web Search</span>
            <span className="font-mono">${costSummary.webSearchCost.toFixed(4)}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold pt-2 border-t">
            <span>Total</span>
            <span className="font-mono">${costSummary.totalCost.toFixed(4)}</span>
          </div>
        </div>
      </div>

      {/* Items Processed */}
      <div className="mt-4 pt-4 border-t">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Items Processed (AI + Web)</span>
          <span className="font-semibold">{costSummary.itemsProcessed}</span>
        </div>
        <div className="flex justify-between text-sm mt-2">
          <span className="text-gray-600">Average Cost per Item</span>
          <span className="font-mono">
            ${costSummary.itemsProcessed > 0
              ? (costSummary.totalCost / costSummary.itemsProcessed).toFixed(4)
              : '0.0000'}
          </span>
        </div>
      </div>
    </div>
  );
}
