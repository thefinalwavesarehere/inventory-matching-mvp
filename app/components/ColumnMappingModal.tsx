'use client';

import { useState, useEffect } from 'react';

export type FileTypeForMapping = 
  | 'STORE_INVENTORY'
  | 'SUPPLIER_CATALOG'
  | 'LINE_CODE_INTERCHANGE'
  | 'PART_NUMBER_INTERCHANGE';

interface ColumnMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  headers: string[];
  missingRoles: string[];
  missingFieldNames: string[];
  fileType: FileTypeForMapping;
  projectId: string;
  onSave: (mappings: Record<string, string>) => Promise<void>;
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  part_number: 'The unique part number or SKU',
  line_code: 'The brand, manufacturer, or line code',
  description: 'Product description or name',
  quantity: 'Quantity on hand or in stock',
  cost: 'Unit cost or purchase price',
  price: 'Selling price or list price',
  location: 'Warehouse location or bin',
  category: 'Product category',
  subcategory: 'Product subcategory',
  source_line_code: 'Source/original line code',
  target_line_code: 'Target/replacement line code',
  source_supplier_line_code: 'Source supplier line code',
  source_part_number: 'Source part number',
  target_supplier_line_code: 'Target supplier line code',
  target_part_number: 'Target part number',
  priority: 'Priority level (higher = more important)',
};

export default function ColumnMappingModal({
  isOpen,
  onClose,
  headers,
  missingRoles,
  missingFieldNames,
  fileType,
  projectId,
  onSave,
}: ColumnMappingModalProps) {
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset mappings when modal opens
  useEffect(() => {
    if (isOpen) {
      setMappings({});
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleMappingChange = (semanticRole: string, columnName: string) => {
    setMappings((prev) => ({
      ...prev,
      [semanticRole]: columnName,
    }));
    setError(null);
  };

  const allRequiredMapped = () => {
    return missingRoles.every((role) => mappings[role] && mappings[role] !== '');
  };

  const handleSave = async () => {
    if (!allRequiredMapped()) {
      setError('Please map all required fields before continuing.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Convert to API format
      const apiMappings = Object.entries(mappings).map(([semanticRole, columnName]) => ({
        semanticRole,
        columnName,
      }));

      // Save to backend
      const response = await fetch(`/api/projects/${projectId}/column-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileType,
          mappings: apiMappings,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save mappings');
      }

      // Call parent callback
      await onSave(mappings);
      onClose();
    } catch (err: any) {
      console.error('Error saving mappings:', err);
      setError(err.message || 'Failed to save column mappings');
    } finally {
      setSaving(false);
    }
  };

  const getUsedColumns = () => {
    return new Set(Object.values(mappings).filter((v) => v !== ''));
  };

  const usedColumns = getUsedColumns();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white px-6 py-4 rounded-t-lg">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <span>🗺️</span> Map Your Columns
          </h2>
          <p className="text-blue-100 text-sm mt-1">
            We couldn't automatically detect all required columns. Please map them manually.
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Info Box */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-gray-800">
              <strong>What's this?</strong> Your CSV file uses different column names than we expect. 
              Please tell us which columns in your file correspond to our required fields.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          {/* Mapping Grid */}
          <div className="space-y-4">
            {missingRoles.map((role, index) => (
              <div
                key={role}
                className="p-4 bg-gray-50 border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors"
              >
                <div className="flex items-start gap-4">
                  {/* Role Info */}
                  <div className="flex-1">
                    <label className="block text-sm font-semibold text-gray-900 mb-1">
                      {missingFieldNames[index]} <span className="text-red-500">*</span>
                    </label>
                    <p className="text-xs text-gray-600 mb-3">
                      {ROLE_DESCRIPTIONS[role] || 'Required field'}
                    </p>
                  </div>

                  {/* Dropdown */}
                  <div className="flex-1">
                    <select
                      value={mappings[role] || ''}
                      onChange={(e) => handleMappingChange(role, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    >
                      <option value="">Select column from your file...</option>
                      {headers.map((header) => (
                        <option
                          key={header}
                          value={header}
                          disabled={usedColumns.has(header) && mappings[role] !== header}
                        >
                          {header}
                          {usedColumns.has(header) && mappings[role] !== header ? ' (already used)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Preview */}
          {Object.keys(mappings).length > 0 && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Mapping Preview:</h3>
              <div className="space-y-1">
                {Object.entries(mappings)
                  .filter(([_, col]) => col !== '')
                  .map(([role, col]) => (
                    <div key={role} className="text-xs text-gray-700">
                      <span className="font-mono bg-white px-2 py-1 rounded">{col}</span>
                      {' → '}
                      <span className="font-semibold">{missingFieldNames[missingRoles.indexOf(role)]}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!allRequiredMapped() || saving}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
          >
            {saving ? 'Saving...' : 'Save Mapping & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
