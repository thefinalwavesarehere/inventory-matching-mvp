'use client';

import { useState } from 'react';

export type VendorAction = 'NONE' | 'LIFT' | 'REBOX' | 'UNKNOWN' | 'CONTACT_VENDOR';

interface BulkActionBarProps {
  selectedCount: number;
  onAccept: () => void;
  onReject: () => void;
  onSetVendorAction: (action: VendorAction) => void;
  onClearSelection: () => void;
  loading?: boolean;
}

const VENDOR_ACTIONS: { value: VendorAction; label: string; color: string; icon: string }[] = [
  { value: 'NONE', label: 'None', color: 'bg-gray-100 text-gray-700', icon: '⊘' },
  { value: 'LIFT', label: 'Lift', color: 'bg-blue-100 text-blue-700', icon: '⬆️' },
  { value: 'REBOX', label: 'Rebox', color: 'bg-purple-100 text-purple-700', icon: '📦' },
  { value: 'UNKNOWN', label: 'Unknown', color: 'bg-yellow-100 text-yellow-700', icon: '❓' },
  { value: 'CONTACT_VENDOR', label: 'Contact Vendor', color: 'bg-orange-100 text-orange-700', icon: '📞' },
];

export default function BulkActionBar({
  selectedCount,
  onAccept,
  onReject,
  onSetVendorAction,
  onClearSelection,
  loading = false,
}: BulkActionBarProps) {
  const [showVendorActionMenu, setShowVendorActionMenu] = useState(false);

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
      <div className="max-w-7xl mx-auto px-4 pb-6">
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-lg shadow-2xl p-4">
          <div className="flex items-center justify-between gap-4">
            {/* Selection Count */}
            <div className="flex items-center gap-3">
              <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
                <span className="text-white font-bold text-lg">
                  {selectedCount}
                </span>
                <span className="text-white/90 text-sm ml-2">
                  {selectedCount === 1 ? 'match' : 'matches'} selected
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              {/* Accept Button */}
              <button
                onClick={onAccept}
                disabled={loading}
                className="px-6 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span>✓</span>
                <span>Accept ({selectedCount})</span>
              </button>

              {/* Reject Button */}
              <button
                onClick={onReject}
                disabled={loading}
                className="px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span>✗</span>
                <span>Reject ({selectedCount})</span>
              </button>

              {/* Vendor Action Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowVendorActionMenu(!showVendorActionMenu)}
                  disabled={loading}
                  className="px-6 py-2.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <span>🏷️</span>
                  <span>Set Action...</span>
                  <span className={`transition-transform ${showVendorActionMenu ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>

                {/* Dropdown Menu */}
                {showVendorActionMenu && (
                  <div className="absolute bottom-full mb-2 right-0 bg-white rounded-lg shadow-2xl border border-gray-200 py-2 min-w-[200px]">
                    {VENDOR_ACTIONS.map((action) => (
                      <button
                        key={action.value}
                        onClick={() => {
                          onSetVendorAction(action.value);
                          setShowVendorActionMenu(false);
                        }}
                        className={`w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors`}
                      >
                        <span className={`px-2 py-1 rounded text-sm font-medium ${action.color}`}>
                          {action.icon}
                        </span>
                        <span className="text-gray-800 font-medium">{action.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Clear Selection Button */}
              <button
                onClick={onClearSelection}
                disabled={loading}
                className="px-4 py-2.5 bg-white/10 backdrop-blur-sm hover:bg-white/20 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Clear selection"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Loading Indicator */}
          {loading && (
            <div className="mt-3 bg-white/10 backdrop-blur-sm rounded-lg p-2">
              <div className="flex items-center gap-2 text-white text-sm">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                <span>Processing...</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
