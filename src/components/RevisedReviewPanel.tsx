import React from 'react';
import type { AnalysisSuccessResponse } from '@/app/api/analyze/route';

interface RevisedReviewPanelProps {
  result: AnalysisSuccessResponse;
  isLoading: boolean;
  error: string | null;
  appliedReplacements?: Record<number, string>;
  onRevert?: (sentenceIndex: number) => void;
}

export function RevisedReviewPanel({ result, isLoading, error, appliedReplacements = {}, onRevert }: RevisedReviewPanelProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6" data-testid="revised-review-panel">
        <div className="flex items-center justify-between border-b pb-4">
          <h2 className="text-xl font-semibold text-slate-600">Revised Analysis</h2>
        </div>
        <div
          className="flex items-center justify-center rounded-lg border bg-slate-50 p-12 text-sm text-slate-500"
          data-testid="revised-loading"
        >
          <span className="animate-pulse">Re-analyzing revised text…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6" data-testid="revised-review-panel">
        <div className="flex items-center justify-between border-b pb-4">
          <h2 className="text-xl font-semibold text-slate-600">Revised Analysis</h2>
        </div>
        <div
          className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          data-testid="revised-error"
        >
          {error}
        </div>
      </div>
    );
  }

  const { text, highlights, score } = result;

  const renderHighlightedText = () => {
    if (!highlights || highlights.length === 0) {
      return <span>{text}</span>;
    }

    const elements: React.ReactNode[] = [];
    let currentIndex = 0;

    highlights.forEach((highlight, i) => {
      const start = Math.max(highlight.start, currentIndex);
      const end = Math.max(highlight.end, currentIndex);

      if (start > currentIndex) {
        elements.push(
          <span key={`text-${i}`}>{text.slice(currentIndex, start)}</span>,
        );
      }

      let bgClass = 'bg-transparent';
      let title = '';
      let labelText = '';
      if (highlight.label === 'high') {
        bgClass = 'bg-red-200';
        title = `High AI-like phrasing risk (Score: ${(highlight.score * 100).toFixed(1)}%)`;
        labelText = 'High Risk';
      } else if (highlight.label === 'medium') {
        bgClass = 'bg-orange-200';
        title = `Medium AI-like phrasing risk (Score: ${(highlight.score * 100).toFixed(1)}%)`;
        labelText = 'Medium Risk';
      } else {
        bgClass = 'bg-green-100';
        title = 'Low risk';
        labelText = 'Low Risk';
      }

      if (end > start) {
        const isReplaced = appliedReplacements[highlight.sentenceIndex] !== undefined;

        elements.push(
          <span
            key={`hl-${i}`}
            className={`${bgClass} rounded px-1 py-0.5 mx-px leading-loose ${isReplaced ? 'cursor-pointer hover:ring-2 hover:ring-slate-400 transition-all group relative' : ''}`}
            title={title}
            data-testid="revised-highlight-score"
            data-ai-score={highlight.score}
            data-sentence-index={highlight.sentenceIndex}
            onClick={isReplaced && onRevert ? () => onRevert(highlight.sentenceIndex) : undefined}
          >
            {text.slice(start, end)}
            <span className="inline-block ml-1.5 px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-black/10 text-slate-800 align-middle whitespace-nowrap">
              {labelText}
            </span>
            {isReplaced && (
              <span className="absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 bg-slate-800 text-white rounded-full text-xs font-bold shadow-sm z-10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200" title="Click to revert">
                &times;
              </span>
            )}
          </span>,
        );
      }

      currentIndex = end;
    });

    if (currentIndex < text.length) {
      elements.push(<span key="text-end">{text.slice(currentIndex)}</span>);
    }

    return elements;
  };

  return (
    <div className="flex flex-col gap-6" data-testid="revised-review-panel">
      <div className="flex items-center justify-between border-b pb-4">
        <h2 className="text-xl font-semibold text-slate-600">Revised Analysis</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-500">Revised Score:</span>
          <span
            className={`text-lg font-bold ${score >= 0.7 ? 'text-red-600' : score >= 0.4 ? 'text-orange-500' : 'text-green-600'}`}
            data-testid="revised-overall-score"
          >
            {(score * 100).toFixed(1)}% AI
          </span>
        </div>
      </div>

      <div className="rounded-lg border bg-slate-50 p-6 leading-relaxed whitespace-pre-wrap font-serif text-slate-800">
        {renderHighlightedText()}
      </div>
    </div>
  );
}
