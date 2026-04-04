import React, { MouseEvent, useEffect, useRef, useState } from 'react';
import type { AnalysisSuccessResponse } from '@/app/api/analyze/route';
import type { UseRevisedAnalysisStateReturn } from '@/app/useRevisedAnalysisState';
import { deriveRevisedText } from '@/app/useRevisedAnalysisState';
import type { SuggestionCacheEntry } from '@/lib/review/revisedAnalysisReducer';

export function shouldSkipSuggestionFetch(cached: SuggestionCacheEntry | undefined): boolean {
  if (!cached) return false;
  if (cached.status === 'loading') return true;
  if (cached.status === 'success' && !cached.unavailable) return true;
  return false;
}

interface ReviewPanelProps {
  result: AnalysisSuccessResponse;
  revisedState?: UseRevisedAnalysisStateReturn;
  voiceProfile?: string;
}

export function ReviewPanel({ result, revisedState, voiceProfile }: ReviewPanelProps) {
  const { text, highlights, score } = result;
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!revisedState || !revisedState.state.drawerOpen || revisedState.state.selectedSentenceIndex === null) {
      setPopoverPos(null);
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const updatePosition = () => {
      const target = container.querySelector(`span[data-sentence-index="${revisedState.state.selectedSentenceIndex}"]`);
      if (target) {
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        setPopoverPos({
          top: targetRect.bottom - containerRect.top + container.scrollTop,
          left: Math.max(0, targetRect.left - containerRect.left + container.scrollLeft)
        });
      } else {
        setPopoverPos(null);
      }
    };

    requestAnimationFrame(updatePosition);

    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [revisedState, text]);

  const handleSentenceClick = async (e: MouseEvent, sentenceIndex: number, sentenceText: string, spanScore: number) => {
    e.stopPropagation();
    if (!revisedState) return;

    const target = e.currentTarget as HTMLElement;
    const container = containerRef.current;
    if (container && target) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      setPopoverPos({
        top: targetRect.bottom - containerRect.top + container.scrollTop,
        left: Math.max(0, targetRect.left - containerRect.left + container.scrollLeft)
      });
    }

    revisedState.selectSentence(sentenceIndex);
    
    const cached = revisedState.getSuggestionCacheEntry(sentenceIndex);
    // Dedupe: skip re-fetch only for in-flight requests or already-successful rewrites.
    // Cached "unavailable" entries (status === 'success' with unavailable: true) are
    // intentionally NOT short-circuited so the user can retry on a later click.
    if (shouldSkipSuggestionFetch(cached)) {
      return;
    }

    revisedState.dispatch({ type: 'SUGGESTION_FETCH_START', payload: { sentenceIndex } });

    try {
      const payload = {
        text: result.text,
        sentenceIndex,
        sentence: sentenceText,
        score: spanScore,
        ...(voiceProfile ? { voiceProfile } : {})
      };
      
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        revisedState.dispatch({ type: 'SUGGESTION_FETCH_ERROR', payload: { sentenceIndex } });
        return;
      }

      const data = await res.json();
      if (data.available) {
        if (data.alternatives && Array.isArray(data.alternatives) && data.alternatives.length > 0) {
          revisedState.dispatch({ 
            type: 'SUGGESTION_FETCH_SUCCESS', 
            payload: { sentenceIndex, alternatives: data.alternatives } 
          });
        } else if (data.rewrite) {
          revisedState.dispatch({ 
            type: 'SUGGESTION_FETCH_SUCCESS', 
            payload: { sentenceIndex, rewrite: data.rewrite, explanation: data.explanation } 
          });
        } else {
          // Fallback if available:true but no actual rewrites returned
          revisedState.dispatch({ type: 'SUGGESTION_FETCH_UNAVAILABLE', payload: { sentenceIndex } });
        }
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

  const renderPopover = () => {
    if (!revisedState) return null;
    const { selectedSentenceIndex, drawerOpen } = revisedState.state;
    if (selectedSentenceIndex === null || !drawerOpen || !popoverPos) return null;

    const cacheEntry = revisedState.getSuggestionCacheEntry(selectedSentenceIndex);
    
    return (
      <div 
        className="absolute z-10 w-96 max-w-[80vw] rounded-lg border border-slate-200 bg-white p-4 shadow-xl font-sans text-base normal-case tracking-normal leading-normal whitespace-normal cursor-auto"
        style={{
          top: `${popoverPos.top + 8}px`,
          left: `${popoverPos.left}px`,
        }}
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
        ) : cacheEntry.unavailable || !cacheEntry.alternatives || cacheEntry.alternatives.length === 0 ? (
          <div className="py-2 text-sm text-slate-600" data-testid="suggestion-empty" role="status" aria-live="polite">
            We couldn&apos;t generate a rewrite suggestion for this sentence at this time.
          </div>
        ) : (
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2" data-testid="suggestion-success">
            {cacheEntry.alternatives?.map((alt, index) => (
              <div 
                key={index} 
                className="flex flex-col gap-3 pb-4 border-b border-slate-100 last:border-b-0 last:pb-0" 
                data-testid={`suggestion-alternative-${index}`}
              >
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                    Alternative {index + 1}
                  </span>
                  <p className="text-sm text-green-700 bg-green-50 rounded p-2 border border-green-100">
                    {alt.rewrite}
                  </p>
                </div>
                {alt.explanation && (
                  <div>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      {alt.previewScore !== undefined ? `Why (${(alt.previewScore * 100).toFixed(1)}% AI if replaced)` : 'Why'}
                    </span>
                    <p className="text-sm text-slate-600 italic">
                      {alt.explanation}
                    </p>
                  </div>
                )}
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                    onClick={(e) => handleApply(e, selectedSentenceIndex, alt.rewrite)}
                    data-testid={`apply-suggestion-btn-${index}`}
                  >
                    Apply
                  </button>
                </div>
              </div>
            ))}
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

      <div 
        ref={containerRef}
        className="relative rounded-lg border bg-slate-50 p-6 leading-relaxed whitespace-pre-wrap font-serif text-slate-800"
      >
        {renderHighlightedText()}
        {renderPopover()}
      </div>
    </div>
  );
}
