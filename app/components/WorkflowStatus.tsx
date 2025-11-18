'use client';

import { useEffect, useState } from 'react';

interface ProgressData {
  progress: {
    currentStage: string;
    standardCompleted: boolean;
    standardProcessed: number;
    standardTotalItems: number;
    aiCompleted: boolean;
    aiProcessed: number;
    aiTotalItems: number;
    webSearchCompleted: boolean;
    webSearchProcessed: number;
    webSearchTotalItems: number;
  };
  matchCounts: {
    pending: number;
    confirmed: number;
    rejected: number;
  };
  totalMatches: number;
}

export default function WorkflowStatus({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProgress();
    // Refresh every 10 seconds
    const interval = setInterval(loadProgress, 10000);
    return () => clearInterval(interval);
  }, [projectId]);

  const loadProgress = async () => {
    try {
      const res = await fetch(`/api/progress?projectId=${projectId}`);
      if (res.ok) {
        const progressData = await res.json();
        setData(progressData);
      }
    } catch (err) {
      console.error('Failed to load progress:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) {
    return <div className="text-gray-500">Loading workflow status...</div>;
  }

  const { progress, matchCounts, totalMatches } = data;

  const stages = [
    {
      name: 'Upload Files',
      key: 'UPLOAD',
      completed: progress.currentStage !== 'UPLOAD',
      description: 'Upload store inventory, supplier catalog, and interchange files',
    },
    {
      name: 'Standard Matching',
      key: 'STANDARD',
      completed: progress.standardCompleted,
      progress: progress.standardTotalItems > 0 
        ? (progress.standardProcessed / progress.standardTotalItems) * 100 
        : 0,
      description: `Exact + Fuzzy matching (${progress.standardProcessed}/${progress.standardTotalItems} items)`,
    },
    {
      name: 'AI Matching',
      key: 'AI',
      completed: progress.aiCompleted,
      progress: progress.aiTotalItems > 0 
        ? (progress.aiProcessed / progress.aiTotalItems) * 100 
        : 0,
      description: `AI-powered matching against catalog (${progress.aiProcessed}/${progress.aiTotalItems} items)`,
    },
    {
      name: 'Web Search',
      key: 'WEB_SEARCH',
      completed: progress.webSearchCompleted,
      progress: progress.webSearchTotalItems > 0 
        ? (progress.webSearchProcessed / progress.webSearchTotalItems) * 100 
        : 0,
      description: `Search web for unmatched parts (${progress.webSearchProcessed}/${progress.webSearchTotalItems} items)`,
    },
    {
      name: 'Review & Confirm',
      key: 'REVIEW',
      completed: matchCounts.pending === 0 && totalMatches > 0,
      progress: totalMatches > 0 
        ? ((matchCounts.confirmed + matchCounts.rejected) / totalMatches) * 100 
        : 0,
      description: `Review and confirm matches (${matchCounts.confirmed} confirmed, ${matchCounts.pending} pending)`,
    },
  ];

  const currentStageIndex = stages.findIndex(s => s.key === progress.currentStage);

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
      <h2 className="text-xl font-bold mb-4">Workflow Progress</h2>
      
      <div className="space-y-4">
        {stages.map((stage, index) => {
          const isActive = index === currentStageIndex;
          const isCompleted = stage.completed;
          const isPending = index > currentStageIndex;

          return (
            <div key={stage.key} className="flex items-start gap-4">
              {/* Stage indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isActive
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {isCompleted ? '✓' : index + 1}
                </div>
                {index < stages.length - 1 && (
                  <div
                    className={`w-0.5 h-12 ${
                      isCompleted ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>

              {/* Stage info */}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3
                    className={`font-semibold ${
                      isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500'
                    }`}
                  >
                    {stage.name}
                  </h3>
                  {stage.progress !== undefined && stage.progress > 0 && (
                    <span className="text-sm text-gray-600">
                      {stage.progress.toFixed(0)}%
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-2">{stage.description}</p>

                {/* Progress bar */}
                {stage.progress !== undefined && stage.progress > 0 && !isCompleted && (
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${stage.progress}%` }}
                    />
                  </div>
                )}

                {/* Next action hint */}
                {isActive && !isCompleted && (
                  <div className="mt-2 text-sm text-blue-600 font-medium">
                    → {getNextAction(stage.key)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 pt-6 border-t">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-600">{totalMatches}</div>
            <div className="text-sm text-gray-600">Total Matches</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">{matchCounts.confirmed}</div>
            <div className="text-sm text-gray-600">Confirmed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600">{matchCounts.pending}</div>
            <div className="text-sm text-gray-600">Pending Review</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getNextAction(stage: string): string {
  switch (stage) {
    case 'UPLOAD':
      return 'Upload your files to begin matching';
    case 'STANDARD':
      return 'Click "Run Matching Algorithm" to start';
    case 'AI':
      return 'Click "Run AI Matching" to find more matches';
    case 'WEB_SEARCH':
      return 'Click "Run Web Search Matching" to search the web';
    case 'REVIEW':
      return 'Review and confirm pending matches';
    default:
      return 'Continue to next step';
  }
}
