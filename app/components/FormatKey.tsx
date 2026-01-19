'use client';

import { useState } from 'react';
// Using inline SVG icons instead of heroicons

interface FormatKeyProps {
  fileType: 'store' | 'supplier' | 'interchange' | 'review';
  className?: string;
}

const FORMAT_SCHEMAS = {
  store: {
    title: 'Store Inventory Format',
    description: 'Expected format for store inventory CSV files',
    columns: [
      { name: 'part_with_line_code', description: 'Full part number including line code (e.g., "01-ABC123")', example: '01-ABC123' },
      { name: 'line_code', description: 'Line code only (e.g., "01")', example: '01' },
      { name: 'part_number', description: 'Part number without line code (e.g., "ABC123")', example: 'ABC123' },
      { name: 'description', description: 'Part description', example: 'BRAKE PAD SET' },
      { name: 'cost', description: 'Cost in dollars (optional)', example: '45.99' },
    ],
    notes: [
      'All columns are required except cost',
      'Line code and part number should be separated',
      'part_with_line_code should be the concatenation of line_code + "-" + part_number',
    ],
  },
  supplier: {
    title: 'Supplier Catalog Format',
    description: 'Expected format for supplier catalog CSV files',
    columns: [
      { name: 'part_with_line_code', description: 'Full part number including line code (e.g., "01-ABC123")', example: '01-ABC123' },
      { name: 'line_code', description: 'Line code only (e.g., "01")', example: '01' },
      { name: 'part_number', description: 'Part number without line code (e.g., "ABC123")', example: 'ABC123' },
      { name: 'description', description: 'Part description', example: 'BRAKE PAD SET' },
      { name: 'cost', description: 'Cost in dollars (optional)', example: '45.99' },
    ],
    notes: [
      'All columns are required except cost',
      'Format is identical to Store Inventory',
      'Supplier part numbers may use different formatting conventions',
    ],
  },
  interchange: {
    title: 'Interchange/Rules Format',
    description: 'Expected format for interchange mapping CSV files',
    columns: [
      { name: 'vendor', description: 'Vendor/manufacturer name', example: 'ACME' },
      { name: 'subcategory', description: 'Product subcategory (optional)', example: 'BRAKES' },
      { name: 'vendor_part_number', description: 'Vendor part number WITHOUT line code', example: 'ABC123' },
      { name: 'merrill_part_number', description: 'Merrill part number WITH line code', example: '01-ABC123' },
      { name: 'notes', description: 'Additional notes (optional)', example: 'Direct replacement' },
    ],
    notes: [
      'vendor_part_number should NOT include line code',
      'merrill_part_number SHOULD include line code (format: "XX-PARTNUM")',
      'This is a critical distinction for correct matching',
      'Vendor and merrill_part_number are required; other fields are optional',
    ],
  },
  review: {
    title: 'Manual Review CSV Format & Workflow',
    description: 'How to review matches: Export → Edit in Excel → Re-import',
    columns: [
      { name: 'status', description: 'Match status (do not edit)', example: 'pending' },
      { name: 'method', description: 'Matching method used (do not edit)', example: 'fuzzy' },
      { name: 'confidence', description: 'Confidence score (do not edit)', example: '0.85' },
      { name: 'store_part_number', description: 'Store part number (do not edit)', example: '01-ABC123' },
      { name: 'store_line_code', description: 'Store line code (do not edit)', example: '01' },
      { name: 'store_description', description: 'Store part description (do not edit)', example: 'BRAKE PAD SET' },
      { name: 'supplier_part_number', description: 'Supplier part number (do not edit)', example: '01-XYZ789' },
      { name: 'supplier_line_code', description: 'Supplier line code (do not edit)', example: '01' },
      { name: 'supplier_description', description: 'Supplier part description (do not edit)', example: 'BRAKE PAD KIT' },
      { name: 'review_decision', description: '✏️ EDIT THIS: "approve", "reject", or leave blank to correct', example: 'approve' },
      { name: 'corrected_supplier_part_number', description: '✏️ EDIT THIS: Only if review_decision is blank', example: '01-CORRECT123' },
    ],
    notes: [
      '✅ To APPROVE a match: Set review_decision = "approve" (case-insensitive)',
      '❌ To REJECT a match: Set review_decision = "reject" (case-insensitive)',
      '✏️ To CORRECT a match: Leave review_decision blank AND provide corrected_supplier_part_number',
      '📥 Workflow: Click "Export Pending" → Open CSV in Excel → Edit review_decision column → Save → Click "Import CSV"',
      '⚠️ Do NOT edit any columns except review_decision and corrected_supplier_part_number',
      '💡 Tip: Use Excel filters to review matches by method or confidence score',
    ],
  },
};

export default function FormatKey({ fileType, className = '' }: FormatKeyProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const schema = FORMAT_SCHEMAS[fileType];

  const downloadTemplate = () => {
    // Generate CSV content
    const headers = schema.columns.map(col => col.name).join(',');
    const examples = schema.columns.map(col => col.example).join(',');
    const csvContent = `${headers}\n${examples}\n`;

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${fileType}_template.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-950 ${className}`}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-3">
          <div className="text-blue-600 dark:text-blue-400 font-semibold text-lg">
            📋 {schema.title}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              downloadTemplate();
            }}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download Template
          </button>
          {isExpanded ? (
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 pt-0 space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">{schema.description}</p>

          {/* Column Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-gray-300 dark:border-gray-700">
              <thead className="bg-gray-100 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold border-b border-gray-300 dark:border-gray-700">Column Name</th>
                  <th className="px-3 py-2 text-left font-semibold border-b border-gray-300 dark:border-gray-700">Description</th>
                  <th className="px-3 py-2 text-left font-semibold border-b border-gray-300 dark:border-gray-700">Example</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900">
                {schema.columns.map((col, idx) => (
                  <tr key={idx} className="border-b border-gray-200 dark:border-gray-800">
                    <td className="px-3 py-2 font-mono text-xs text-blue-600 dark:text-blue-400">{col.name}</td>
                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{col.description}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">{col.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Important Notes */}
          {schema.notes.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded p-3">
              <div className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">⚠️ Important Notes:</div>
              <ul className="list-disc list-inside space-y-1 text-sm text-yellow-700 dark:text-yellow-300">
                {schema.notes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
