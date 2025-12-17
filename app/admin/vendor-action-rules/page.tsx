'use client';

/**
 * Vendor Action Rules Admin Page
 * 
 * Allows admins to:
 * - View existing vendor action rules
 * - Import rules from CSV
 * - Download CSV template
 * - Delete rules
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface VendorActionRule {
  id: string;
  supplierLineCode: string;
  categoryPattern: string;
  subcategoryPattern: string;
  action: string;
  active: boolean;
  createdAt: string;
}

export default function VendorActionRulesPage() {
  const [rules, setRules] = useState<VendorActionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);

  // Load rules on mount
  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/vendor-action-rules');
      const data = await response.json();
      setRules(data.rules || []);
    } catch (error) {
      console.error('Failed to load rules:', error);
      alert('Failed to load vendor action rules');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      setImportResult(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('replaceExisting', replaceExisting.toString());

      const response = await fetch('/api/vendor-action-rules/import', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        setImportResult(result);
        alert(`Import failed: ${result.message || result.error}`);
      } else {
        setImportResult(result);
        alert(`Import successful!\n\n${result.message}\n\nImported: ${result.importedRows}\nSkipped: ${result.skippedRows}`);
        await loadRules();
      }
    } catch (error: any) {
      console.error('Import error:', error);
      alert(`Import failed: ${error.message}`);
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const handleDownloadTemplate = () => {
    window.location.href = '/api/vendor-action-rules/import';
  };

  const handleDeleteAll = async () => {
    if (!confirm('Are you sure you want to delete ALL vendor action rules? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/vendor-action-rules', {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('All rules deleted successfully');
        await loadRules();
      } else {
        alert('Failed to delete rules');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete rules');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Vendor Action Rules</h1>
              <p className="text-gray-600 mt-2">
                Configure automatic vendor action tagging for matches
              </p>
            </div>
            <Link
              href="/"
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              ← Back to Home
            </Link>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Actions</h2>
          
          <div className="flex flex-wrap gap-4">
            {/* Download Template */}
            <button
              onClick={handleDownloadTemplate}
              className="px-6 py-3 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
            >
              📥 Download CSV Template
            </button>

            {/* Import Rules */}
            <label className={`px-6 py-3 rounded font-semibold cursor-pointer ${
              importing
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}>
              {importing ? '⏳ Importing...' : '📤 Import Rules from CSV'}
              <input
                type="file"
                accept=".csv"
                onChange={handleImport}
                disabled={importing}
                className="hidden"
              />
            </label>

            {/* Replace Existing Checkbox */}
            <label className="flex items-center gap-2 px-4 py-3 bg-gray-100 rounded">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Replace existing rules on import</span>
            </label>

            {/* Delete All */}
            <button
              onClick={handleDeleteAll}
              className="px-6 py-3 bg-red-600 text-white rounded font-semibold hover:bg-red-700"
              disabled={rules.length === 0}
            >
              🗑️ Delete All Rules
            </button>
          </div>

          {/* Import Result */}
          {importResult && (
            <div className={`mt-4 p-4 rounded ${
              importResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              <p className="font-semibold">{importResult.message}</p>
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium">Errors:</p>
                  <ul className="text-sm list-disc list-inside">
                    {importResult.errors.slice(0, 10).map((err: any, i: number) => (
                      <li key={i}>Row {err.row}: {err.error}</li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li>... and {importResult.errors.length - 10} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rules Table */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">
              Current Rules ({rules.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">
              Loading rules...
            </div>
          ) : rules.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No vendor action rules configured.
              <br />
              Import a CSV file to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Supplier Line Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Subcategory
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {rule.supplierLineCode}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {rule.categoryPattern}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {rule.subcategoryPattern}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-semibold rounded ${
                          rule.action === 'LIFT' ? 'bg-green-100 text-green-800' :
                          rule.action === 'REBOX' ? 'bg-blue-100 text-blue-800' :
                          rule.action === 'UNKNOWN' ? 'bg-yellow-100 text-yellow-800' :
                          rule.action === 'CONTACT_VENDOR' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {rule.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {rule.active ? (
                          <span className="text-green-600">● Active</span>
                        ) : (
                          <span className="text-gray-400">○ Inactive</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(rule.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">
            How It Works
          </h3>
          <ul className="text-sm text-blue-800 space-y-2">
            <li>
              <strong>1. Download Template:</strong> Get a CSV template with the correct format
            </li>
            <li>
              <strong>2. Edit Rules:</strong> Add your vendor action rules (supplier line code, category, subcategory, action)
            </li>
            <li>
              <strong>3. Import:</strong> Upload the CSV to import rules
            </li>
            <li>
              <strong>4. Automatic Tagging:</strong> New matches will automatically be tagged with vendor actions based on these rules
            </li>
          </ul>
          
          <div className="mt-4 p-4 bg-white rounded border border-blue-200">
            <p className="text-sm font-semibold text-blue-900 mb-2">Rule Priority:</p>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Exact Category + Exact Subcategory (highest priority)</li>
              <li>Exact Category + Wildcard (*) Subcategory</li>
              <li>Wildcard (*) Category + Wildcard (*) Subcategory (lowest priority)</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
