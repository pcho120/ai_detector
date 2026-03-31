import { describe, it, expect } from 'vitest';
import {
  revisedAnalysisReducer,
  initialRevisedAnalysisState,
  deriveRevisedText,
  hasAppliedReplacements,
} from '@/lib/review/revisedAnalysisReducer';
import type {
  RevisedAnalysisState,
  RevisedAnalysisAction,
} from '@/lib/review/revisedAnalysisReducer';
import type { AnalysisSuccessResponse } from '@/app/api/analyze/route';

function makeResult(overrides?: Partial<AnalysisSuccessResponse>): AnalysisSuccessResponse {
  return {
    score: 0.5,
    text: 'First sentence. Second sentence. Third sentence.',
    sentences: [
      { sentence: 'First sentence.', score: 0.2 },
      { sentence: 'Second sentence.', score: 0.7 },
      { sentence: 'Third sentence.', score: 0.4 },
    ],
    highlights: [
      { start: 16, end: 32, score: 0.7, label: 'high', sentenceIndex: 1 },
    ],
    suggestions: [
      { sentence: 'Second sentence.', rewrite: 'A rewritten second.', explanation: 'Plainer.', sentenceIndex: 1 },
    ],
    ...overrides,
  };
}

function dispatch(state: RevisedAnalysisState, action: RevisedAnalysisAction): RevisedAnalysisState {
  return revisedAnalysisReducer(state, action);
}

describe('revisedAnalysisReducer', () => {
  describe('SET_ORIGINAL_RESULT', () => {
    it('sets originalResult and resets all other fields', () => {
      const stateWithStuff: RevisedAnalysisState = {
        ...initialRevisedAnalysisState,
        selectedSentenceIndex: 2,
        drawerOpen: true,
        appliedReplacements: { 1: 'replaced' },
      };
      const result = makeResult();
      const next = dispatch(stateWithStuff, { type: 'SET_ORIGINAL_RESULT', payload: result });

      expect(next.originalResult).toBe(result);
      expect(next.selectedSentenceIndex).toBeNull();
      expect(next.drawerOpen).toBe(false);
      expect(next.appliedReplacements).toEqual({});
      expect(next.revisedResult).toBeNull();
    });
  });

  describe('RESET', () => {
    it('returns to initial state', () => {
      const stateWithData: RevisedAnalysisState = {
        ...initialRevisedAnalysisState,
        originalResult: makeResult(),
        selectedSentenceIndex: 0,
        drawerOpen: true,
        appliedReplacements: { 0: 'x' },
        revisedLoading: true,
      };
      const next = dispatch(stateWithData, { type: 'RESET' });
      expect(next).toEqual(initialRevisedAnalysisState);
    });
  });

  describe('SELECT_SENTENCE', () => {
    it('updates selectedSentenceIndex and opens drawer', () => {
      const next = dispatch(initialRevisedAnalysisState, {
        type: 'SELECT_SENTENCE',
        payload: { sentenceIndex: 2 },
      });
      expect(next.selectedSentenceIndex).toBe(2);
      expect(next.drawerOpen).toBe(true);
    });

    it('allows re-selecting a different sentence index', () => {
      let state = dispatch(initialRevisedAnalysisState, {
        type: 'SELECT_SENTENCE',
        payload: { sentenceIndex: 0 },
      });
      state = dispatch(state, { type: 'SELECT_SENTENCE', payload: { sentenceIndex: 1 } });
      expect(state.selectedSentenceIndex).toBe(1);
    });
  });

  describe('CLOSE_DRAWER', () => {
    it('closes drawer but retains selected sentence index', () => {
      let state = dispatch(initialRevisedAnalysisState, {
        type: 'SELECT_SENTENCE',
        payload: { sentenceIndex: 1 },
      });
      state = dispatch(state, { type: 'CLOSE_DRAWER' });
      expect(state.drawerOpen).toBe(false);
      expect(state.selectedSentenceIndex).toBe(1);
    });
  });

  describe('SUGGESTION_FETCH_START', () => {
    it('sets status to loading for the given index', () => {
      const next = dispatch(initialRevisedAnalysisState, {
        type: 'SUGGESTION_FETCH_START',
        payload: { sentenceIndex: 3 },
      });
      expect(next.suggestionCache[3]).toEqual({ status: 'loading' });
    });

    it('does not affect other cache entries', () => {
      let state = dispatch(initialRevisedAnalysisState, {
        type: 'SUGGESTION_FETCH_SUCCESS',
        payload: { sentenceIndex: 0, rewrite: 'r', explanation: 'e' },
      });
      state = dispatch(state, {
        type: 'SUGGESTION_FETCH_START',
        payload: { sentenceIndex: 1 },
      });
      expect(state.suggestionCache[0]?.status).toBe('success');
      expect(state.suggestionCache[1]?.status).toBe('loading');
    });
  });

  describe('SUGGESTION_FETCH_SUCCESS', () => {
    it('stores rewrite and explanation with success status', () => {
      const next = dispatch(initialRevisedAnalysisState, {
        type: 'SUGGESTION_FETCH_SUCCESS',
        payload: { sentenceIndex: 2, rewrite: 'Rewritten.', explanation: 'Cleaner phrasing.' },
      });
      expect(next.suggestionCache[2]).toEqual({
        status: 'success',
        rewrite: 'Rewritten.',
        explanation: 'Cleaner phrasing.',
      });
    });
  });

  describe('SUGGESTION_FETCH_UNAVAILABLE', () => {
    it('marks the entry as success with unavailable:true', () => {
      const next = dispatch(initialRevisedAnalysisState, {
        type: 'SUGGESTION_FETCH_UNAVAILABLE',
        payload: { sentenceIndex: 1 },
      });
      expect(next.suggestionCache[1]).toEqual({ status: 'success', unavailable: true });
    });
  });

  describe('SUGGESTION_FETCH_ERROR', () => {
    it('marks the entry as error', () => {
      const next = dispatch(initialRevisedAnalysisState, {
        type: 'SUGGESTION_FETCH_ERROR',
        payload: { sentenceIndex: 0 },
      });
      expect(next.suggestionCache[0]).toEqual({ status: 'error' });
    });
  });

  describe('APPLY_REPLACEMENT', () => {
    it('stores replacement keyed by sentence index', () => {
      const next = dispatch(initialRevisedAnalysisState, {
        type: 'APPLY_REPLACEMENT',
        payload: { sentenceIndex: 1, replacement: 'New sentence.' },
      });
      expect(next.appliedReplacements[1]).toBe('New sentence.');
    });

    it('overwrites a previous replacement for the same index', () => {
      let state = dispatch(initialRevisedAnalysisState, {
        type: 'APPLY_REPLACEMENT',
        payload: { sentenceIndex: 1, replacement: 'First.' },
      });
      state = dispatch(state, {
        type: 'APPLY_REPLACEMENT',
        payload: { sentenceIndex: 1, replacement: 'Second.' },
      });
      expect(state.appliedReplacements[1]).toBe('Second.');
    });

    it('allows multiple concurrent replacements at different indices', () => {
      let state = dispatch(initialRevisedAnalysisState, {
        type: 'APPLY_REPLACEMENT',
        payload: { sentenceIndex: 0, replacement: 'R0.' },
      });
      state = dispatch(state, {
        type: 'APPLY_REPLACEMENT',
        payload: { sentenceIndex: 2, replacement: 'R2.' },
      });
      expect(state.appliedReplacements[0]).toBe('R0.');
      expect(state.appliedReplacements[2]).toBe('R2.');
      expect(Object.keys(state.appliedReplacements)).toHaveLength(2);
    });
  });

  describe('REMOVE_REPLACEMENT', () => {
    it('removes the replacement for the given index and clears revised state if no edits remain', () => {
      let state = dispatch(initialRevisedAnalysisState, {
        type: 'APPLY_REPLACEMENT',
        payload: { sentenceIndex: 1, replacement: 'Rewritten.' },
      });
      state = { ...state, revisedResult: makeResult({ score: 0.1 }) };
      state = dispatch(state, { type: 'REMOVE_REPLACEMENT', payload: { sentenceIndex: 1 } });
      expect(state.appliedReplacements[1]).toBeUndefined();
      expect(Object.keys(state.appliedReplacements)).toHaveLength(0);
      expect(state.revisedResult).toBeNull();
    });

    it('leaves other replacements intact when removing one and keeps revised result', () => {
      let state = dispatch(initialRevisedAnalysisState, {
        type: 'APPLY_REPLACEMENT',
        payload: { sentenceIndex: 0, replacement: 'R0.' },
      });
      state = dispatch(state, {
        type: 'APPLY_REPLACEMENT',
        payload: { sentenceIndex: 1, replacement: 'R1.' },
      });
      state = { ...state, revisedResult: makeResult({ score: 0.1 }) };
      state = dispatch(state, { type: 'REMOVE_REPLACEMENT', payload: { sentenceIndex: 0 } });
      expect(state.appliedReplacements[0]).toBeUndefined();
      expect(state.appliedReplacements[1]).toBe('R1.');
      expect(state.revisedResult).not.toBeNull();
    });

    it('is a no-op if the index was not applied', () => {
      const next = dispatch(initialRevisedAnalysisState, {
        type: 'REMOVE_REPLACEMENT',
        payload: { sentenceIndex: 99 },
      });
      expect(next.appliedReplacements).toEqual({});
    });
  });

  describe('REVISED_ANALYSIS_START', () => {
    it('sets revisedLoading to true and clears error', () => {
      const stateWithError: RevisedAnalysisState = {
        ...initialRevisedAnalysisState,
        revisedError: 'previous error',
      };
      const next = dispatch(stateWithError, { type: 'REVISED_ANALYSIS_START' });
      expect(next.revisedLoading).toBe(true);
      expect(next.revisedError).toBeNull();
    });
  });

  describe('REVISED_ANALYSIS_SUCCESS', () => {
    it('stores the result and clears loading/error', () => {
      const loadingState: RevisedAnalysisState = {
        ...initialRevisedAnalysisState,
        revisedLoading: true,
      };
      const revisedResult = makeResult({ score: 0.3 });
      const next = dispatch(loadingState, {
        type: 'REVISED_ANALYSIS_SUCCESS',
        payload: revisedResult,
      });
      expect(next.revisedLoading).toBe(false);
      expect(next.revisedError).toBeNull();
      expect(next.revisedResult).toBe(revisedResult);
    });
  });

  describe('REVISED_ANALYSIS_ERROR', () => {
    it('stores the error message and clears loading', () => {
      const loadingState: RevisedAnalysisState = {
        ...initialRevisedAnalysisState,
        revisedLoading: true,
      };
      const next = dispatch(loadingState, {
        type: 'REVISED_ANALYSIS_ERROR',
        payload: { message: 'Network error.' },
      });
      expect(next.revisedLoading).toBe(false);
      expect(next.revisedError).toBe('Network error.');
    });
  });
});

describe('deriveRevisedText', () => {
  const result = makeResult();

  it('returns all original sentences joined when no replacements', () => {
    const text = deriveRevisedText(result, {});
    expect(text).toBe('First sentence. Second sentence. Third sentence.');
  });

  it('replaces only the targeted sentence index', () => {
    const text = deriveRevisedText(result, { 1: 'A rewritten second.' });
    expect(text).toBe('First sentence. A rewritten second. Third sentence.');
  });

  it('applies multiple replacements simultaneously', () => {
    const text = deriveRevisedText(result, {
      0: 'New first.',
      2: 'New third.',
    });
    expect(text).toBe('New first. Second sentence. New third.');
  });

  it('returns to original when replacements are empty', () => {
    const withReplacement = deriveRevisedText(result, { 1: 'Replaced.' });
    const afterUndo = deriveRevisedText(result, {});
    expect(withReplacement).not.toBe(afterUndo);
    expect(afterUndo).toBe('First sentence. Second sentence. Third sentence.');
  });

  it('does not mutate original result', () => {
    const originalText = result.text;
    const originalSentences = result.sentences.map((s) => s.sentence);
    deriveRevisedText(result, { 0: 'Mutated.' });
    expect(result.text).toBe(originalText);
    expect(result.sentences.map((s) => s.sentence)).toEqual(originalSentences);
  });

  it('handles duplicate sentence text — only targeted index is replaced', () => {
    const dupResult: AnalysisSuccessResponse = {
      score: 0.5,
      text: 'Same sentence. Same sentence. Other sentence.',
      sentences: [
        { sentence: 'Same sentence.', score: 0.1 },
        { sentence: 'Same sentence.', score: 0.8 },
        { sentence: 'Other sentence.', score: 0.3 },
      ],
      highlights: [
        { start: 15, end: 29, score: 0.8, label: 'high', sentenceIndex: 1 },
      ],
      suggestions: [],
    };

    const text = deriveRevisedText(dupResult, { 1: 'Unique replacement.' });
    expect(text).toBe('Same sentence. Unique replacement. Other sentence.');
  });

  it('handles a single-sentence document', () => {
    const single: AnalysisSuccessResponse = {
      score: 0.9,
      text: 'Only sentence.',
      sentences: [{ sentence: 'Only sentence.', score: 0.9 }],
      highlights: [{ start: 0, end: 14, score: 0.9, label: 'high', sentenceIndex: 0 }],
      suggestions: [],
    };
    expect(deriveRevisedText(single, { 0: 'Replaced.' })).toBe('Replaced.');
    expect(deriveRevisedText(single, {})).toBe('Only sentence.');
  });

  it('preserves untouched sentences when only first or last index is replaced', () => {
    expect(deriveRevisedText(result, { 0: 'New first.' })).toBe(
      'New first. Second sentence. Third sentence.'
    );
    expect(deriveRevisedText(result, { 2: 'New third.' })).toBe(
      'First sentence. Second sentence. New third.'
    );
  });
});

describe('Task 6: apply flow — cumulative text derivation', () => {
  const result = makeResult();

  it('second apply accumulates with first — both sentences replaced in derived text', () => {
    let appliedReplacements: Record<number, string> = {};
    appliedReplacements = { ...appliedReplacements, [0]: 'New first sentence.' };
    const textAfterFirst = deriveRevisedText(result, appliedReplacements);
    expect(textAfterFirst).toBe('New first sentence. Second sentence. Third sentence.');

    appliedReplacements = { ...appliedReplacements, [2]: 'New third sentence.' };
    const textAfterSecond = deriveRevisedText(result, appliedReplacements);
    expect(textAfterSecond).toBe('New first sentence. Second sentence. New third sentence.');
  });

  it('each apply step produces correct cumulative text for rescoring payload', () => {
    let applied: Record<number, string> = {};

    applied = { ...applied, [1]: 'Rewritten second.' };
    expect(deriveRevisedText(result, applied)).toBe(
      'First sentence. Rewritten second. Third sentence.'
    );

    applied = { ...applied, [0]: 'Rewritten first.' };
    expect(deriveRevisedText(result, applied)).toBe(
      'Rewritten first. Rewritten second. Third sentence.'
    );

    applied = { ...applied, [2]: 'Rewritten third.' };
    expect(deriveRevisedText(result, applied)).toBe(
      'Rewritten first. Rewritten second. Rewritten third.'
    );
  });

  it('replacing the same sentence index twice keeps only the latest rewrite', () => {
    let applied: Record<number, string> = { [1]: 'First rewrite.' };
    applied = { ...applied, [1]: 'Second rewrite.' };
    const text = deriveRevisedText(result, applied);
    expect(text).toBe('First sentence. Second rewrite. Third sentence.');
    expect(Object.keys(applied)).toHaveLength(1);
  });

  it('APPLY_REPLACEMENT reducer does not drop earlier entries when adding a new index', () => {
    let state = dispatch(initialRevisedAnalysisState, {
      type: 'APPLY_REPLACEMENT',
      payload: { sentenceIndex: 0, replacement: 'R0.' },
    });
    state = dispatch(state, {
      type: 'APPLY_REPLACEMENT',
      payload: { sentenceIndex: 2, replacement: 'R2.' },
    });
    expect(state.appliedReplacements[0]).toBe('R0.');
    expect(state.appliedReplacements[2]).toBe('R2.');
    expect(state.appliedReplacements[1]).toBeUndefined();
    expect(Object.keys(state.appliedReplacements)).toHaveLength(2);
  });

  it('derived text payload matches cumulative state even after a second apply', () => {
    const currentApplied: Record<number, string> = { [1]: 'Already rewritten second.' };
    const nextReplacements = { ...currentApplied, [0]: 'Also rewritten first.' };
    const payload = deriveRevisedText(result, nextReplacements);
    expect(payload).toBe('Also rewritten first. Already rewritten second. Third sentence.');
  });
});

describe('Task 6: apply flow — duplicate sentence safety', () => {
  const dupResult: AnalysisSuccessResponse = {
    score: 0.6,
    text: 'Same text here. Same text here. Unique ending.',
    sentences: [
      { sentence: 'Same text here.', score: 0.3 },
      { sentence: 'Same text here.', score: 0.8 },
      { sentence: 'Unique ending.', score: 0.2 },
    ],
    highlights: [
      { start: 16, end: 30, score: 0.8, label: 'high', sentenceIndex: 1 },
    ],
    suggestions: [],
  };

  it('applying index 1 of duplicate text leaves index 0 unchanged', () => {
    const text = deriveRevisedText(dupResult, { 1: 'Distinct replacement.' });
    expect(text).toBe('Same text here. Distinct replacement. Unique ending.');
  });

  it('applying index 0 of duplicate text leaves index 1 unchanged', () => {
    const text = deriveRevisedText(dupResult, { 0: 'Only first replaced.' });
    expect(text).toBe('Only first replaced. Same text here. Unique ending.');
  });

  it('applying both duplicate indices produces two independent replacements', () => {
    const text = deriveRevisedText(dupResult, {
      0: 'Replacement A.',
      1: 'Replacement B.',
    });
    expect(text).toBe('Replacement A. Replacement B. Unique ending.');
  });

  it('APPLY_REPLACEMENT reducer tracks duplicate indices as separate keys', () => {
    let state = dispatch(initialRevisedAnalysisState, {
      type: 'APPLY_REPLACEMENT',
      payload: { sentenceIndex: 0, replacement: 'Dup 0 rewrite.' },
    });
    state = dispatch(state, {
      type: 'APPLY_REPLACEMENT',
      payload: { sentenceIndex: 1, replacement: 'Dup 1 rewrite.' },
    });
    expect(state.appliedReplacements[0]).toBe('Dup 0 rewrite.');
    expect(state.appliedReplacements[1]).toBe('Dup 1 rewrite.');
    state = dispatch(state, { type: 'REMOVE_REPLACEMENT', payload: { sentenceIndex: 0 } });
    expect(state.appliedReplacements[0]).toBeUndefined();
    expect(state.appliedReplacements[1]).toBe('Dup 1 rewrite.');
  });
});

describe('hasAppliedReplacements', () => {
  it('returns false on initial state', () => {
    expect(hasAppliedReplacements(initialRevisedAnalysisState)).toBe(false);
  });

  it('returns true when at least one replacement exists', () => {
    const state: RevisedAnalysisState = {
      ...initialRevisedAnalysisState,
      appliedReplacements: { 0: 'x' },
    };
    expect(hasAppliedReplacements(state)).toBe(true);
  });

  it('returns false after all replacements are removed', () => {
    let state: RevisedAnalysisState = {
      ...initialRevisedAnalysisState,
      appliedReplacements: { 1: 'x' },
    };
    state = dispatch(state, { type: 'REMOVE_REPLACEMENT', payload: { sentenceIndex: 1 } });
    expect(hasAppliedReplacements(state)).toBe(false);
  });
});
