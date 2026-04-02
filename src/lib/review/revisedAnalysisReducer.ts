/**
 * Reducer-based state management for the revised-analysis workflow.
 *
 * This module provides:
 *  - `RevisedAnalysisState` — full state shape
 *  - `RevisedAnalysisAction` — discriminated-union of all legal actions
 *  - `revisedAnalysisReducer` — pure reducer (no side-effects)
 *  - `deriveRevisedText` — deterministic text derivation helper
 *
 * The upload/initial-submission state in `page.tsx` is intentionally NOT
 * managed here — this file is scoped to the post-result editing workflow.
 */

import type { AnalysisSuccessResponse } from '@/app/api/analyze/route';
import type { SuggestionAlternative } from '@/lib/suggestions/llm';

// ---------------------------------------------------------------------------
// Suggestion cache entry
// ---------------------------------------------------------------------------

/** Possible fetch states for a single sentence's on-demand suggestion. */
export type SuggestionFetchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface SuggestionCacheEntry {
  status: SuggestionFetchStatus;
  /**
   * All fetched alternatives when status === 'success' and a suggestion is available.
   * The primary/first alternative is always at index 0.
   */
  alternatives?: SuggestionAlternative[];
  /**
   * Alias for alternatives[0].rewrite — kept for backward compatibility.
   * Always equals alternatives[0].rewrite when alternatives is present.
   */
  rewrite?: string;
  /**
   * Alias for alternatives[0].explanation — kept for backward compatibility.
   * Always equals alternatives[0].explanation when alternatives is present.
   */
  explanation?: string;
  /** True when status === 'success' but the endpoint returned available:false */
  unavailable?: boolean;
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface RevisedAnalysisState {
  /** The immutable original analysis result set after a successful upload. */
  originalResult: AnalysisSuccessResponse | null;

  /**
   * Zero-based sentence index currently selected by the user.
   * `null` means no sentence is actively selected / suggestion drawer closed.
   */
  selectedSentenceIndex: number | null;

  /**
   * Per-sentence suggestion fetch/cache state, keyed by sentenceIndex.
   * Entries are only present for sentences that have been clicked at least once.
   */
  suggestionCache: Record<number, SuggestionCacheEntry>;

  /**
   * Whether the suggestion drawer/popover is open.
   * Distinct from selectedSentenceIndex so the drawer can be explicitly
   * dismissed while the index is retained for UX continuity.
   */
  drawerOpen: boolean;

  /**
   * Applied sentence replacements, keyed by the zero-based sentence index.
   * Value is the full rewritten sentence string that replaces the original.
   * Removing a key corresponds to the "undo" action for that sentence.
   */
  appliedReplacements: Record<number, string>;

  /**
   * Rescored analysis result for the revised text.
   * `null` until the first Apply triggers a rescoring request.
   */
  revisedResult: AnalysisSuccessResponse | null;

  /** True while a revised-analysis request is in flight. */
  revisedLoading: boolean;

  /** Non-null when the revised-analysis request has returned an error. */
  revisedError: string | null;
}

export const initialRevisedAnalysisState: RevisedAnalysisState = {
  originalResult: null,
  selectedSentenceIndex: null,
  suggestionCache: {},
  drawerOpen: false,
  appliedReplacements: {},
  revisedResult: null,
  revisedLoading: false,
  revisedError: null,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type RevisedAnalysisAction =
  /** Set or replace the original analysis result (after a successful upload). */
  | { type: 'SET_ORIGINAL_RESULT'; payload: AnalysisSuccessResponse }

  /** Clear everything — used when the user uploads a new document. */
  | { type: 'RESET' }

  /** Select a sentence by its zero-based index and open the suggestion drawer. */
  | { type: 'SELECT_SENTENCE'; payload: { sentenceIndex: number } }

  /** Close the suggestion drawer without clearing the selected index. */
  | { type: 'CLOSE_DRAWER' }

  /** Mark a sentence's suggestion as loading (fetch started). */
  | { type: 'SUGGESTION_FETCH_START'; payload: { sentenceIndex: number } }

  /** Store a successfully fetched suggestion for a sentence. */
  | {
      type: 'SUGGESTION_FETCH_SUCCESS';
      payload:
        | { sentenceIndex: number; alternatives: SuggestionAlternative[] }
        | { sentenceIndex: number; rewrite: string; explanation: string };
    }

  /** Store an "unavailable" result (endpoint returned available:false). */
  | { type: 'SUGGESTION_FETCH_UNAVAILABLE'; payload: { sentenceIndex: number } }

  /** Store an error result for a failed suggestion fetch. */
  | { type: 'SUGGESTION_FETCH_ERROR'; payload: { sentenceIndex: number } }

  /** Apply a rewritten sentence replacement for a given sentence index. */
  | { type: 'APPLY_REPLACEMENT'; payload: { sentenceIndex: number; replacement: string } }

  /** Remove a previously applied replacement (undo). */
  | { type: 'REMOVE_REPLACEMENT'; payload: { sentenceIndex: number } }

  /** Mark the revised-analysis request as started. */
  | { type: 'REVISED_ANALYSIS_START' }

  /** Store a successful revised-analysis result. */
  | { type: 'REVISED_ANALYSIS_SUCCESS'; payload: AnalysisSuccessResponse }

  /** Store an error from the revised-analysis request. */
  | { type: 'REVISED_ANALYSIS_ERROR'; payload: { message: string } };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function revisedAnalysisReducer(
  state: RevisedAnalysisState,
  action: RevisedAnalysisAction,
): RevisedAnalysisState {
  switch (action.type) {
    case 'SET_ORIGINAL_RESULT':
      return {
        ...initialRevisedAnalysisState,
        originalResult: action.payload,
      };

    case 'RESET':
      return { ...initialRevisedAnalysisState };

    case 'SELECT_SENTENCE':
      return {
        ...state,
        selectedSentenceIndex: action.payload.sentenceIndex,
        drawerOpen: true,
      };

    case 'CLOSE_DRAWER':
      return {
        ...state,
        drawerOpen: false,
      };

    case 'SUGGESTION_FETCH_START': {
      const idx = action.payload.sentenceIndex;
      return {
        ...state,
        suggestionCache: {
          ...state.suggestionCache,
          [idx]: { status: 'loading' },
        },
      };
    }

    case 'SUGGESTION_FETCH_SUCCESS': {
      const { sentenceIndex } = action.payload;
      const alternatives: SuggestionAlternative[] =
        'alternatives' in action.payload
          ? action.payload.alternatives
          : [{ rewrite: action.payload.rewrite, explanation: action.payload.explanation }];
      const first = alternatives[0];
      return {
        ...state,
        suggestionCache: {
          ...state.suggestionCache,
          [sentenceIndex]: {
            status: 'success',
            alternatives,
            rewrite: first.rewrite,
            explanation: first.explanation,
          },
        },
      };
    }

    case 'SUGGESTION_FETCH_UNAVAILABLE': {
      const idx = action.payload.sentenceIndex;
      return {
        ...state,
        suggestionCache: {
          ...state.suggestionCache,
          [idx]: { status: 'success', unavailable: true },
        },
      };
    }

    case 'SUGGESTION_FETCH_ERROR': {
      const idx = action.payload.sentenceIndex;
      return {
        ...state,
        suggestionCache: {
          ...state.suggestionCache,
          [idx]: { status: 'error' },
        },
      };
    }

    case 'APPLY_REPLACEMENT': {
      const { sentenceIndex, replacement } = action.payload;
      return {
        ...state,
        appliedReplacements: {
          ...state.appliedReplacements,
          [sentenceIndex]: replacement,
        },
      };
    }

    case 'REMOVE_REPLACEMENT': {
      const next = { ...state.appliedReplacements };
      delete next[action.payload.sentenceIndex];
      const hasAny = Object.keys(next).length > 0;
      return {
        ...state,
        appliedReplacements: next,
        revisedResult: hasAny ? state.revisedResult : null,
        revisedLoading: hasAny ? state.revisedLoading : false,
        revisedError: hasAny ? state.revisedError : null,
      };
    }

    case 'REVISED_ANALYSIS_START':
      return {
        ...state,
        revisedLoading: true,
        revisedError: null,
      };

    case 'REVISED_ANALYSIS_SUCCESS':
      return {
        ...state,
        revisedLoading: false,
        revisedError: null,
        revisedResult: action.payload,
      };

    case 'REVISED_ANALYSIS_ERROR':
      return {
        ...state,
        revisedLoading: false,
        revisedError: action.payload.message,
      };

    default: {
      void (action as never);
      return state;
    }
  }
}

// ---------------------------------------------------------------------------
// Pure text-derivation helper
// ---------------------------------------------------------------------------

/**
 * Derive the revised text from the immutable original analysis result and the
 * current set of applied sentence replacements.
 *
 * Algorithm:
 *  1. Walk the original `sentences` array in order.
 *  2. For each sentence, if a replacement is recorded at that sentence's index,
 *     substitute it in place; otherwise keep the original sentence text.
 *  3. Rejoin using a single space between sentences, mirroring the typical
 *     whitespace that analysis pipelines normalise to.
 *
 * This is deliberately offset-free — it works at the sentence granularity
 * and never mutates `result.text` or any other field on the original result.
 *
 * @param originalResult - the immutable original AnalysisSuccessResponse
 * @param appliedReplacements - map of sentenceIndex → replacement text
 * @returns the full derived revised text string
 */
export function deriveRevisedText(
  originalResult: AnalysisSuccessResponse,
  appliedReplacements: Record<number, string>,
): string {
  return originalResult.sentences
    .map((entry, idx) => {
      const replacement = appliedReplacements[idx];
      return replacement !== undefined ? replacement : entry.sentence;
    })
    .join(' ');
}

/**
 * Returns true if there are any applied replacements in the state.
 * Convenience predicate for rendering the revised panel.
 */
export function hasAppliedReplacements(state: RevisedAnalysisState): boolean {
  return Object.keys(state.appliedReplacements).length > 0;
}
