'use client';

import { useState } from 'react';

interface BulkApprovalSuggestion {
  message: string;
  affectedItems: number;
  pattern: {
    transformation: string;
    lineCode?: string;
    matchCount: number;
    confidence: number;
  };
  preview: Array<{
    storePartNumber: string;
    supplierPartNumber: string;
    lineCode?: string;
  }>;
}

interface BulkApprovalModalProps {
  isOpen: boolean;
  suggestion: BulkApprovalSuggestion | null;
  onApprove: (createRule: boolean) => void;
  onDecline: () => void;
  loading?: boolean;
}

export default function BulkApprovalModal({
  isOpen,
  suggestion,
  onApprove,
  onDecline,
  loading = false,
}: BulkApprovalModalProps) {
  const [createRule, setCreateRule] = useState(true);

  if (!isOpen || !suggestion) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-t-lg">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <span>🎯</span> Bulk Approval Suggestion
          </h2>
          <p className="text-blue-100 text-sm mt-1">
            We found a pattern that can save you time!
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Message */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-gray-800 text-lg">{suggestion.message}</p>
          </div>

          {/* Pattern Details */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Transformation</div>
              <div className="font-semibold text-gray-900">{suggestion.pattern.transformation}</div>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Affected Items</div>
              <div className="font-semibold text-gray-900 text-2xl">{suggestion.affectedItems}</div>
            </div>
            {suggestion.pattern.lineCode && (
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-sm text-gray-600 mb-1">Line Code</div>
                <div className="font-semibold text-gray-900">{suggestion.pattern.lineCode}</div>
              </div>
            )}
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="text-sm text-gray-600 mb-1">Confidence</div>
              <div className="font-semibold text-gray-900">{(suggestion.pattern.confidence * 100).toFixed(0)}%</div>
            </div>
          </div>

          {/* Preview */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Preview (First 10 items)</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Store Part
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      →
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Supplier Part
                    </th>
                    {suggestion.preview.some(p => p.lineCode) && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Line
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {suggestion.preview.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-mono text-gray-900">
                        {item.storePartNumber}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-400">
                        →
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-900">
                        {item.supplierPartNumber}
                      </td>
                      {suggestion.preview.some(p => p.lineCode) && (
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {item.lineCode || '-'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {suggestion.affectedItems > 10 && (
              <p className="text-sm text-gray-500 mt-2 text-center">
                ... and {suggestion.affectedItems - 10} more items
              </p>
            )}
          </div>

          {/* Create Rule Option */}
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={createRule}
                onChange={(e) => setCreateRule(e.target.checked)}
                className="mt-1 w-5 h-5 rounded border-gray-300"
              />
              <div>
                <div className="font-semibold text-green-900">
                  Create a rule for future matching
                </div>
                <div className="text-sm text-green-700 mt-1">
                  This pattern will be automatically applied to future matching runs, saving you even more time.
                </div>
              </div>
            </label>
          </div>

          {/* Warning */}
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-yellow-600 text-xl">⚠️</span>
              <div>
                <div className="font-semibold text-yellow-900">Review Carefully</div>
                <div className="text-sm text-yellow-700 mt-1">
                  Bulk approval will confirm all {suggestion.affectedItems} matches at once. 
                  Please review the preview to ensure the pattern is correct.
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onDecline}
              disabled={loading}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              No Thanks
            </button>
            <button
              onClick={() => onApprove(createRule)}
              disabled={loading}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Approving...
                </>
              ) : (
                <>
                  ✓ Approve All {suggestion.affectedItems} Matches
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
