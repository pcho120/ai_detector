import React, { MouseEvent } from 'react';
import type { AnalysisSuccessResponse } from '@/app/api/analyze/route';
import type { UseRevisedAnalysisStateReturn } from '@/app/useRevisedAnalysisState';
import { deriveRevisedText } from '@/app/useRevisedAnalysisState';

interface ReviewPanelProps {
  result: AnalysisSuccessResponse;
  revisedState?: UseRevisedAnalysisStateReturn; // optional for fallback if needed
}

export function ReviewPanel({ result, revisedState }: ReviewPanelProps) {
  const { text, highlights, score } = result;

  const handleSentenceClick = async (e: MouseEvent, sentenceIndex: number, sentenceText: string, spanScore: number) => {
    e.stopPropagation();
    if (!revisedState) return;

    revisedState.selectSentence(sentenceIndex);
    
    const cached = revisedState.getSuggestionCacheEntry(sentenceIndex);
    if (cached && cached.status !== 'error') {
      return;
    }

    revisedState.dispatch({ type: 'SUGGESTION_FETCH_START', payload: { sentenceIndex } });

    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: result.text, sentenceIndex, sentence: sentenceText, score: spanScore })
      });

      if (!res.ok) {
        revisedState.dispatch({ type: 'SUGGESTION_FETCH_ERROR', payload: { sentenceIndex } });
        return;
      }

      const data = await res.json();
      if (data.available) {
        revisedState.dispatch({ 
          type: 'SUGGESTION_FETCH_SUCCESS', 
          payload: { sentenceIndex, rewrite: data.rewrite, explanation: data.explanation } 
        });
      } else {
        revisedState.dispatch({ type: 'SUGGESTION_FETCH_UNAVAILABLE', payload: { sentenceIndex } });
      }
    } catch {
      revisedState.dispatch({ type: 'SUGGESTION_FETCH_ERROR', payload: { sentenceIndex } });
    }
  };

  const handleApply = (e: MouseEvent, sentenceIndex: number, rewrite: string) => {
    e.stopPropagation();
    if (revisedState && revisedState.state.originalResult) {
      revisedState.applySentenceReplacement(sentenceIndex, rewrite);
      const nextReplacements = {
        ...revisedState.state.appliedReplacements,
        [sentenceIndex]: rewrite,
      };
      const revisedText = deriveRevisedText(revisedState.state.originalResult, nextReplacements);
      void revisedState.triggerRevisedAnalysis(revisedText);
    }
  };

  const renderPopover = (sentenceIndex: number) => {
    if (!revisedState) return null;
    if (revisedState.state.selectedSentenceIndex !== sentenceIndex || !revisedState.state.drawerOpen) return null;

    const cacheEntry = revisedState.getSuggestionCacheEntry(sentenceIndex);
    
    return (
      <div 
        className="absolute top-full left-0 mt-2 z-10 w-96 max-w-[80vw] rounded-lg border border-slate-200 bg-white p-4 shadow-xl font-sans text-base normal-case tracking-normal leading-normal whitespace-normal cursor-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="suggestion-popover"
      >
        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
          <h4 className="text-sm font-semibold text-slate-800">Sentence Suggestion</h4>
          <button 
            type="button" 
            className="text-slate-400 hover:text-slate-600 transition-colors"
            onClick={(e) => { e.stopPropagation(); revisedState.closeDrawer(); }}
            aria-label="Close suggestion"
          >
            &times;
          </button>
        </div>

        {!cacheEntry || cacheEntry.status === 'loading' ? (
          <div className="flex items-center justify-center py-4 text-sm text-slate-500" data-testid="suggestion-loading">
            <span className="animate-pulse">Loading suggestion...</span>
          </div>
        ) : cacheEntry.status === 'error' ? (
          <div className="py-2 text-sm text-red-600" data-testid="suggestion-error">
            Failed to load suggestion. Please try again.
          </div>
        ) : cacheEntry.unavailable ? (
          <div className="py-2 text-sm text-slate-600" data-testid="suggestion-empty">
            No rewrite suggestion available for this sentence.
          </div>
        ) : (
          <div className="flex flex-col gap-3" data-testid="suggestion-success">
            <div>
              <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Rewrite</span>
              <p className="text-sm text-green-700 bg-green-50 rounded p-2 border border-green-100">
                {cacheEntry.rewrite}
              </p>
            </div>
            {cacheEntry.explanation && (
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Why</span>
                <p className="text-sm text-slate-600 italic">
                  {cacheEntry.explanation}
                </p>
              </div>
            )}
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                onClick={(e) => handleApply(e, sentenceIndex, cacheEntry.rewrite!)}
                data-testid="apply-suggestion-btn"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

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
          <span key={`text-${i}`}>{text.slice(currentIndex, start)}</span>
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
        title = `Low risk`;
        labelText = 'Low Risk';
      }

      if (end > start) {
        const highlightedText = text.slice(start, end);
        
        const sentenceObj = result.sentences[highlight.sentenceIndex];
        const fullSentence = sentenceObj ? sentenceObj.sentence : highlightedText;

        const isSelected = revisedState?.state.selectedSentenceIndex === highlight.sentenceIndex && revisedState.state.drawerOpen;
        const activeClass = isSelected ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-slate-50' : '';

        elements.push(
          <span
            key={`hl-${i}`}
            className={`relative ${bgClass} ${activeClass} rounded px-1 py-0.5 mx-px cursor-pointer transition-colors hover:brightness-95 leading-loose`}
            title={title}
            data-testid="highlight-score"
            data-ai-score={highlight.score}
            data-sentence-index={highlight.sentenceIndex}
            onClick={(e) => handleSentenceClick(e, highlight.sentenceIndex, fullSentence, highlight.score)}
          >
            {highlightedText}
            <span className="inline-block ml-1.5 px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-widest bg-black/10 text-slate-800 align-middle whitespace-nowrap">
              {labelText}
            </span>
            {renderPopover(highlight.sentenceIndex)}
          </span>
        );
      }

      currentIndex = end;
    });

    if (currentIndex < text.length) {
      elements.push(
        <span key="text-end">{text.slice(currentIndex)}</span>
      );
    }

    return elements;
  };

  return (
    <div className="flex flex-col gap-6" data-testid="review-panel">
      <div className="flex items-center justify-between border-b pb-4">
        <h2 className="text-xl font-semibold">Analysis Results</h2>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-500">Overall Score:</span>
          <span className={`text-lg font-bold ${score >= 0.7 ? 'text-red-600' : score >= 0.4 ? 'text-orange-500' : 'text-green-600'}`}>
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
