'use client';

import { useReducer, useCallback } from 'react';
import {
  revisedAnalysisReducer,
  initialRevisedAnalysisState,
  hasAppliedReplacements,
} from '@/lib/review/revisedAnalysisReducer';
import type {
  RevisedAnalysisState,
  RevisedAnalysisAction,
  SuggestionCacheEntry,
} from '@/lib/review/revisedAnalysisReducer';
import type { AnalysisSuccessResponse } from '@/app/api/analyze/route';
import type { AppSettings } from '@/lib/settings/types';
import { buildRequestHeaders } from '@/hooks/useSettings';
import { deriveTextWithRewrites } from '@/lib/bulk-rewrite/textUtils';

export type { RevisedAnalysisState, RevisedAnalysisAction, SuggestionCacheEntry };
export { hasAppliedReplacements };

export interface UseRevisedAnalysisStateReturn {
  state: RevisedAnalysisState;
  dispatch: React.Dispatch<RevisedAnalysisAction>;
  derivedRevisedText: string | null;
  hasReplacements: boolean;
  setOriginalResult: (result: AnalysisSuccessResponse) => void;
  reset: () => void;
  selectSentence: (sentenceIndex: number) => void;
  closeDrawer: () => void;
  applySentenceReplacement: (sentenceIndex: number, replacement: string) => void;
  removeSentenceReplacement: (sentenceIndex: number) => void;
  getSuggestionCacheEntry: (sentenceIndex: number) => SuggestionCacheEntry | undefined;
  triggerRevisedAnalysis: (revisedText: string) => Promise<void>;
}

export function useRevisedAnalysisState(settings: AppSettings): UseRevisedAnalysisStateReturn {
  const [state, dispatch] = useReducer(revisedAnalysisReducer, initialRevisedAnalysisState);

  const derivedRevisedText =
    state.originalResult && hasAppliedReplacements(state)
      ? deriveTextWithRewrites(state.originalResult.text, state.originalResult.sentences, state.appliedReplacements)
      : null;

  const hasReplacements = hasAppliedReplacements(state);

  function setOriginalResult(result: AnalysisSuccessResponse) {
    dispatch({ type: 'SET_ORIGINAL_RESULT', payload: result });
  }

  function reset() {
    dispatch({ type: 'RESET' });
  }

  function selectSentence(sentenceIndex: number) {
    dispatch({ type: 'SELECT_SENTENCE', payload: { sentenceIndex } });
  }

  function closeDrawer() {
    dispatch({ type: 'CLOSE_DRAWER' });
  }

  function applySentenceReplacement(sentenceIndex: number, replacement: string) {
    dispatch({ type: 'APPLY_REPLACEMENT', payload: { sentenceIndex, replacement } });
  }

  function removeSentenceReplacement(sentenceIndex: number) {
    dispatch({ type: 'REMOVE_REPLACEMENT', payload: { sentenceIndex } });
  }

  function getSuggestionCacheEntry(sentenceIndex: number): SuggestionCacheEntry | undefined {
    return state.suggestionCache[sentenceIndex];
  }

  const triggerRevisedAnalysis = useCallback(async (revisedText: string): Promise<void> => {
    dispatch({ type: 'REVISED_ANALYSIS_START' });
    try {
      const res = await fetch('/api/analyze/revised', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildRequestHeaders(settings) },
        body: JSON.stringify({ text: revisedText }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as Record<string, unknown>;
        const msg = typeof errData.message === 'string' ? errData.message : 'Revised analysis failed.';
        dispatch({ type: 'REVISED_ANALYSIS_ERROR', payload: { message: msg } });
        return;
      }
      const data = (await res.json()) as AnalysisSuccessResponse;
      dispatch({ type: 'REVISED_ANALYSIS_SUCCESS', payload: data });
    } catch {
      dispatch({ type: 'REVISED_ANALYSIS_ERROR', payload: { message: 'A network error occurred during revised analysis.' } });
    }
  }, [settings]);

  return {
    state,
    dispatch,
    derivedRevisedText,
    hasReplacements,
    setOriginalResult,
    reset,
    selectSentence,
    closeDrawer,
    applySentenceReplacement,
    removeSentenceReplacement,
    getSuggestionCacheEntry,
    triggerRevisedAnalysis,
  };
}
