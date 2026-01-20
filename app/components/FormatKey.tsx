'use client';

import { useState } from 'react';

interface ColumnSpec {
  name: string;
  required: boolean;
  dataType: string;
  description: string;
  example?: string;
}

interface FormatKeyProps {
  fileType: 'store-inventory' | 'supplier-catalog' | 'interchange-rules' | 'manual-review';
  columns: ColumnSpec[];
  templateUrl?: string;
  notes?: string[];
}

export default function FormatKey({ fileType, columns, templateUrl, notes }: FormatKeyProps) {
  const [expanded, setExpanded] = useState(false);

  const requiredColumns = columns.filter(c => c.required);
  const optionalColumns = columns.filter(c => !c.required);

  const fileTypeLabels = {
    'store-inventory': 'Store Inventory',
    'supplier-catalog': 'Supplier Catalog',
    'interchange-rules': 'Interchange Rules',
    'manual-review': 'Manual Review Export',
  };

  return (
    <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">📋</span>
            <h3 className="text-lg font-semibold text-blue-900">
              {fileTypeLabels[fileType]} Format Requirements
            </h3>
          </div>
          <p className="text-sm text-blue-700 mb-3">
            Upload an Excel (.xlsx) file with the following columns:
          </p>

          {/* Quick summary */}
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              {requiredColumns.length} required column{requiredColumns.length !== 1 ? 's' : ''}
            </span>
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              {optionalColumns.length} optional column{optionalColumns.length !== 1 ? 's' : ''}
            </span>
          </div>

          {!expanded && (
            <div className="text-sm text-blue-700">
              <strong>Required:</strong> {requiredColumns.map(c => c.name).join(', ')}
            </div>
          )}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          {expanded ? 'Hide Details' : 'Show Details'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Required Columns */}
          <div>
            <h4 className="font-semibold text-blue-900 mb-2">Required Columns</h4>
            <div className="bg-white rounded-lg border border-blue-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-blue-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-blue-900">Column Name</th>
                    <th className="px-4 py-2 text-left font-semibold text-blue-900">Data Type</th>
                    <th className="px-4 py-2 text-left font-semibold text-blue-900">Description</th>
                    <th className="px-4 py-2 text-left font-semibold text-blue-900">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-100">
                  {requiredColumns.map((col, idx) => (
                    <tr key={idx} className="hover:bg-blue-50">
                      <td className="px-4 py-2 font-mono font-medium text-blue-900">{col.name}</td>
                      <td className="px-4 py-2 text-gray-700">{col.dataType}</td>
                      <td className="px-4 py-2 text-gray-700">{col.description}</td>
                      <td className="px-4 py-2 font-mono text-sm text-gray-600">{col.example || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Optional Columns */}
          {optionalColumns.length > 0 && (
            <div>
              <h4 className="font-semibold text-blue-900 mb-2">Optional Columns</h4>
              <div className="bg-white rounded-lg border border-blue-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-blue-100">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-blue-900">Column Name</th>
                      <th className="px-4 py-2 text-left font-semibold text-blue-900">Data Type</th>
                      <th className="px-4 py-2 text-left font-semibold text-blue-900">Description</th>
                      <th className="px-4 py-2 text-left font-semibold text-blue-900">Example</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-100">
                    {optionalColumns.map((col, idx) => (
                      <tr key={idx} className="hover:bg-blue-50">
                        <td className="px-4 py-2 font-mono font-medium text-gray-700">{col.name}</td>
                        <td className="px-4 py-2 text-gray-700">{col.dataType}</td>
                        <td className="px-4 py-2 text-gray-700">{col.description}</td>
                        <td className="px-4 py-2 font-mono text-sm text-gray-600">{col.example || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Notes */}
          {notes && notes.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <h4 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                <span>⚠️</span> Important Notes
              </h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
                {notes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Template Download */}
          {templateUrl && (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-2xl">📥</span>
              <div className="flex-1">
                <h4 className="font-semibold text-green-900 mb-1">Download Template</h4>
                <p className="text-sm text-green-700">
                  Use this pre-formatted template to avoid formatting errors
                </p>
              </div>
              <a
                href={templateUrl}
                download
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
              >
                Download Template
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
