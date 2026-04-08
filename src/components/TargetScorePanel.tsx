import React from 'react';

export interface TargetScorePanelProps {
  targetScore: string;
  onTargetScoreChange: (value: string) => void;
  onRewrite: (targetScore: number) => Promise<void>;
  isLoading: boolean;
  disabled: boolean;
  progress: { current: number; total: number; phase: string } | null;
  result: { achievedScore: number; targetMet: boolean; targetScore: number } | null;
}

export function TargetScorePanel({
  targetScore,
  onTargetScoreChange,
  onRewrite,
  isLoading,
  disabled,
  progress,
  result,
}: TargetScorePanelProps) {
  const parsedScore = parseInt(targetScore, 10);
  let error: string | null = null;
  
  if (targetScore !== '') {
    if (isNaN(parsedScore)) {
      error = 'Please enter a valid number.';
    } else if (parsedScore < 10) {
      error = 'Minimum target is 10%';
    } else if (parsedScore > 100) {
      error = 'Maximum target is 100%';
    }
  }

  const isValid = targetScore !== '' && error === null;

  return (
    <div className="flex flex-col gap-6" data-testid="target-score-panel">
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Bulk Rewrite to Target Score</h2>
        <p className="text-sm text-slate-500">
          Automatically rewrite high-risk sentences to achieve your desired AI detection score (10-100%).
        </p>
      </header>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-slate-700" htmlFor="target-score">
            Target Score (%)
          </label>
          <input
            id="target-score"
            type="number"
            min="10"
            max="100"
            value={targetScore}
            onChange={(e) => onTargetScoreChange(e.target.value)}
            disabled={isLoading || disabled}
            data-testid="target-score-input"
            className={`w-32 rounded-md border p-2 text-sm focus:outline-none focus:ring-1 disabled:bg-slate-50 disabled:text-slate-500 ${
              error 
                ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'
            }`}
            placeholder="e.g. 80"
          />
          {error && (
            <span className="text-xs text-red-600 font-medium">{error}</span>
          )}
        </div>

        <button
          onClick={() => onRewrite(parsedScore)}
          disabled={isLoading || disabled || !isValid}
          data-testid="bulk-rewrite-btn"
          className="w-fit rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Rewriting...' : 'Rewrite to Target'}
        </button>

        {isLoading && progress && (
          <div className="flex flex-col gap-2 mt-2">
            <div className="flex items-center justify-between text-sm text-slate-600 font-medium">
              <span>Rewriting {progress.current}/{progress.total} sentences...</span>
              <span>{progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%</span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progress.total > 0 ? Math.max(0, Math.min(100, (progress.current / progress.total) * 100)) : 0}%` }}
                data-testid="bulk-progress-bar"
              />
            </div>
          </div>
        )}

        {result && !isLoading && (
          <div 
            className={`mt-2 rounded-md border p-3 text-sm ${
              result.targetMet 
                ? 'border-green-200 bg-green-50 text-green-800' 
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
            data-testid="bulk-result-message"
          >
            {result.targetMet 
              ? `Score reduced to ${Math.round(result.achievedScore)}%!`
              : `Best achieved: ${Math.round(result.achievedScore)}% (target: ${Math.round(result.targetScore)}%). Try editing individual sentences.`}
          </div>
        )}
      </div>
    </div>
  );
}
