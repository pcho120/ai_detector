import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeBulkRewrite, deriveTextWithRewrites } from '../bulkRewrite';
import type { BulkRewriteRequest, BulkRewriteProgress } from '../types';

// ── Module-level mocks ───────────────────────────────────────────────────────
vi.mock('@/lib/analysis/analyzeText', () => ({
  createAnalysisDetectionAdapter: vi.fn(() => ({})),
  analyzeText: vi.fn(),
}));

vi.mock('@/lib/suggestions/llm', () => ({
  generateSingleSuggestion: vi.fn(),
  generateSingleSuggestionWithProvider: vi.fn(),
}));

vi.mock('@/lib/suggestions/guardrails', () => ({
  applyGuardrails: vi.fn((suggestions) => suggestions),
}));

import { analyzeText } from '@/lib/analysis/analyzeText';
import { generateSingleSuggestion, generateSingleSuggestionWithProvider } from '@/lib/suggestions/llm';
import { applyGuardrails } from '@/lib/suggestions/guardrails';

const mockAnalyzeText = vi.mocked(analyzeText);
const mockGenerateSingleSuggestion = vi.mocked(generateSingleSuggestion);
const mockGenerateSingleSuggestionWithProvider = vi.mocked(generateSingleSuggestionWithProvider);
const mockApplyGuardrails = vi.mocked(applyGuardrails);

// For test compatibility, both functions should share behavior
beforeEach(() => {
  // Default behavior: delegate provider variant to the standard function
  // This allows tests to mock generateSingleSuggestion and have it work for both
  mockGenerateSingleSuggestionWithProvider.mockImplementation(async (apiKey, sentence, sentenceIndex, score) =>
    mockGenerateSingleSuggestion(apiKey, sentence, sentenceIndex, score)
  );
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSentence(sentence: string, score: number, sentenceIndex: number) {
  return { sentence, score, sentenceIndex };
}

function makeAnalysisResult(score: number, sentences: Array<{ sentence: string; score: number }>) {
  return {
    score,
    text: sentences.map((s) => s.sentence).join(' '),
    sentences,
    highlights: [],
    suggestions: [],
  };
}

function makeSuggestion(sentenceIndex: number, rewrite: string) {
  return {
    sentenceIndex,
    sentence: `sentence-${sentenceIndex}`,
    rewrite,
    explanation: 'test explanation',
  };
}

function makeRequest(overrides: Partial<BulkRewriteRequest> = {}): BulkRewriteRequest {
  return {
    text: 'Sentence one. Sentence two.',
    targetScore: 30,
    sentences: [
      makeSentence('Sentence one.', 0.9, 0),
      makeSentence('Sentence two.', 0.8, 1),
    ],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('deriveTextWithRewrites', () => {
  it('returns original sentences when no rewrites', () => {
    const originalText = 'First. Second.';
    const originals = [{ sentence: 'First.' }, { sentence: 'Second.' }];
    expect(deriveTextWithRewrites(originalText, originals, {})).toBe(originalText);
  });

  it('substitutes rewritten sentences at matching indices', () => {
    const originalText = 'Original A. Original B. Original C.';
    const originals = [{ sentence: 'Original A.' }, { sentence: 'Original B.' }, { sentence: 'Original C.' }];
    const rewrites = { 1: 'Rewritten B.' };
    expect(deriveTextWithRewrites(originalText, originals, rewrites)).toBe('Original A. Rewritten B. Original C.');
  });

  it('applies multiple rewrites across the text', () => {
    const originalText = 'A. B. C.';
    const originals = [{ sentence: 'A.' }, { sentence: 'B.' }, { sentence: 'C.' }];
    const rewrites = { 0: 'New A.', 2: 'New C.' };
    expect(deriveTextWithRewrites(originalText, originals, rewrites)).toBe('New A. B. New C.');
  });

  it('returns empty string for empty sentences array', () => {
    expect(deriveTextWithRewrites('', [], {})).toBe('');
  });

  it('preserves paragraph breaks and original whitespace when applying rewrites', () => {
    const originalText = 'First sentence.\n\nSecond sentence.  Third sentence.';
    const originals = [
      { sentence: 'First sentence.', sentenceIndex: 0 },
      { sentence: 'Second sentence.', sentenceIndex: 1 },
      { sentence: 'Third sentence.', sentenceIndex: 2 },
    ];

    expect(deriveTextWithRewrites(originalText, originals, { 1: 'Updated second sentence.' })).toBe(
      'First sentence.\n\nUpdated second sentence.  Third sentence.',
    );
  });
});

describe('executeBulkRewrite – already-at-target short circuit', () => {
  afterEach(() => vi.resetAllMocks());

  it('returns immediately when initial score is already at or below target', async () => {
    // targetScore 50% → normalized 0.5; initial score 0.4 ≤ 0.5 → short circuit
    mockAnalyzeText.mockResolvedValueOnce(makeAnalysisResult(0.4, [{ sentence: 'Fine text.', score: 0.4 }]));

    const result = await executeBulkRewrite(makeRequest({ targetScore: 50 }));

    expect(result.targetMet).toBe(true);
    expect(result.iterations).toBe(0);
    expect(result.totalRewritten).toBe(0);
    expect(result.rewrites).toEqual({});
    // achievedScore is returned as percent
    expect(result.achievedScore).toBeCloseTo(40);
    expect(mockGenerateSingleSuggestion).not.toHaveBeenCalled();
  });

  it('short circuit when initial score exactly equals target', async () => {
    mockAnalyzeText.mockResolvedValueOnce(makeAnalysisResult(0.3, [{ sentence: 'Text.', score: 0.3 }]));

    const result = await executeBulkRewrite(makeRequest({ targetScore: 30 }));

    expect(result.targetMet).toBe(true);
    expect(result.iterations).toBe(0);
  });
});

describe('executeBulkRewrite – single round rewrite', () => {
  afterEach(() => vi.resetAllMocks());

  it('rewrites eligible sentences and re-analyzes in one round when target is met', async () => {
    // Initial score above target
    mockAnalyzeText
      .mockResolvedValueOnce(
        makeAnalysisResult(0.8, [
          { sentence: 'AI sentence one.', score: 0.9 },
          { sentence: 'AI sentence two.', score: 0.85 },
        ]),
      )
      // Re-analysis after rewrites
      .mockResolvedValueOnce(
        makeAnalysisResult(0.25, [
          { sentence: 'Human sentence one.', score: 0.2 },
          { sentence: 'Human sentence two.', score: 0.3 },
        ]),
      );

    mockGenerateSingleSuggestion
      .mockResolvedValueOnce(makeSuggestion(0, 'Human sentence one.'))
      .mockResolvedValueOnce(makeSuggestion(1, 'Human sentence two.'));

    const result = await executeBulkRewrite(makeRequest({ targetScore: 30 }), undefined, { llmApiKey: 'test-key' });

    expect(result.targetMet).toBe(true);
    expect(result.iterations).toBe(1);
    expect(result.rewrites[0]).toBe('Human sentence one.');
    expect(result.rewrites[1]).toBe('Human sentence two.');
    expect(result.totalRewritten).toBe(2);
    expect(result.achievedScore).toBeCloseTo(25);
  });

  it('returns rewrites keyed by sentenceIndex (percent output contract)', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(
        makeAnalysisResult(0.7, [
          { sentence: 'First AI sentence.', score: 0.75 },
        ]),
      )
      .mockResolvedValueOnce(makeAnalysisResult(0.2, [{ sentence: 'Rewritten.', score: 0.2 }]));

    mockGenerateSingleSuggestion.mockResolvedValueOnce(makeSuggestion(0, 'Human version.'));

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 30,
      sentences: [makeSentence('First AI sentence.', 0.75, 0)],
    }), undefined, { llmApiKey: 'test-key' });

    expect(typeof result.rewrites).toBe('object');
    expect(Object.keys(result.rewrites).map(Number)).toEqual([0]);
    expect(result.achievedScore).toBeGreaterThanOrEqual(0);
    expect(result.achievedScore).toBeLessThanOrEqual(100);
  });
});

describe('executeBulkRewrite – null suggestion skip', () => {
  afterEach(() => { vi.resetAllMocks(); });

  it('skips sentences where generateSingleSuggestion returns null', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(
        makeAnalysisResult(0.85, [
          { sentence: 'AI sentence one.', score: 0.9 },
          { sentence: 'AI sentence two.', score: 0.8 },
        ]),
      )
      .mockResolvedValueOnce(
        makeAnalysisResult(0.75, [
          { sentence: 'AI sentence one.', score: 0.9 },
          { sentence: 'Human sentence two.', score: 0.2 },
        ]),
      );

    // first sentence: null (no rewrite); second sentence: valid suggestion
    mockGenerateSingleSuggestion
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeSuggestion(1, 'Human sentence two.'));

    const result = await executeBulkRewrite(makeRequest({ targetScore: 30 }), undefined, { llmApiKey: 'test-key' });

    expect(result.rewrites[0]).toBeUndefined();
    expect(result.rewrites[1]).toBe('Human sentence two.');
    expect(result.totalRewritten).toBe(1);
  });
});

describe('executeBulkRewrite – guardrails filtering', () => {
  afterEach(() => { vi.resetAllMocks(); });

  it('does not store rewrite when applyGuardrails filters it out (returns empty array)', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(
        makeAnalysisResult(0.8, [{ sentence: 'AI text.', score: 0.9 }]),
      )
      .mockResolvedValueOnce(makeAnalysisResult(0.8, [{ sentence: 'AI text.', score: 0.9 }]));

    mockGenerateSingleSuggestion.mockResolvedValueOnce(makeSuggestion(0, 'Bypass the AI checker.'));
    // guardrails rejects the suggestion
    mockApplyGuardrails.mockReturnValueOnce([]);

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 30,
      sentences: [makeSentence('AI text.', 0.9, 0)],
    }), undefined, { llmApiKey: 'test-key' });

    expect(result.rewrites[0]).toBeUndefined();
    expect(result.totalRewritten).toBe(0);
  });

  it('stores rewrite when applyGuardrails passes it through', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(
        makeAnalysisResult(0.8, [{ sentence: 'AI text.', score: 0.9 }]),
      )
      .mockResolvedValueOnce(makeAnalysisResult(0.2, [{ sentence: 'Human text.', score: 0.1 }]));

    const suggestion = makeSuggestion(0, 'Human text.');
    mockGenerateSingleSuggestion.mockResolvedValueOnce(suggestion);
    mockApplyGuardrails.mockReturnValueOnce([suggestion]);

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 30,
      sentences: [makeSentence('AI text.', 0.9, 0)],
    }), undefined, { llmApiKey: 'test-key' });

    expect(result.rewrites[0]).toBe('Human text.');
    expect(result.totalRewritten).toBe(1);
  });
});

describe('executeBulkRewrite – max rounds limit', () => {
  afterEach(() => { vi.resetAllMocks(); });

  it('should stop when score improvement plateaus (<2% over 2 consecutive rounds)', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(makeAnalysisResult(0.8, [{ sentence: 'AI sentence.', score: 0.9 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.78, [{ sentence: 'AI sentence.', score: 0.88 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.77, [{ sentence: 'AI sentence.', score: 0.87 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.76, [{ sentence: 'AI sentence.', score: 0.86 }]));

    mockGenerateSingleSuggestion.mockResolvedValue(makeSuggestion(0, 'Human sentence.'));

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 30,
      sentences: [makeSentence('AI sentence.', 0.9, 0)],
    }), undefined, { llmApiKey: 'test-key' });

    expect(result.iterations).toBe(3);
    expect(mockAnalyzeText).toHaveBeenCalledTimes(4);
  });

  it('should continue when improvement is above threshold', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(makeAnalysisResult(0.8, [{ sentence: 'AI sentence.', score: 0.9 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.6, [{ sentence: 'AI sentence.', score: 0.7 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.4, [{ sentence: 'AI sentence.', score: 0.5 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.2, [{ sentence: 'AI sentence.', score: 0.3 }]));

    mockGenerateSingleSuggestion.mockResolvedValue(makeSuggestion(0, 'Human sentence.'));

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 30,
      sentences: [makeSentence('AI sentence.', 0.9, 0)],
    }), undefined, { llmApiKey: 'test-key' });

    expect(result.iterations).toBe(3);
    expect(result.targetMet).toBe(true);
    expect(mockAnalyzeText).toHaveBeenCalledTimes(4);
  });

  it('should reset plateau counter when a round has significant improvement', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(makeAnalysisResult(0.8, [{ sentence: 'AI sentence.', score: 0.9 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.78, [{ sentence: 'AI sentence.', score: 0.88 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.6, [{ sentence: 'AI sentence.', score: 0.7 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.59, [{ sentence: 'AI sentence.', score: 0.69 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.58, [{ sentence: 'AI sentence.', score: 0.68 }]));

    mockGenerateSingleSuggestion.mockResolvedValue(makeSuggestion(0, 'Human sentence.'));

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 30,
      sentences: [makeSentence('AI sentence.', 0.9, 0)],
    }), undefined, { llmApiKey: 'test-key' });

    expect(result.iterations).toBe(4);
    expect(mockAnalyzeText).toHaveBeenCalledTimes(5);
  });

  it('stops after MAX_ROUNDS=10 iterations even if target is never met', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(makeAnalysisResult(0.8, [{ sentence: 'AI sentence.', score: 0.85 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.74, [{ sentence: 'AI sentence.', score: 0.8 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.68, [{ sentence: 'AI sentence.', score: 0.74 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.62, [{ sentence: 'AI sentence.', score: 0.68 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.56, [{ sentence: 'AI sentence.', score: 0.62 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.5, [{ sentence: 'AI sentence.', score: 0.56 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.44, [{ sentence: 'AI sentence.', score: 0.5 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.38, [{ sentence: 'AI sentence.', score: 0.44 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.32, [{ sentence: 'AI sentence.', score: 0.38 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.26, [{ sentence: 'AI sentence.', score: 0.32 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.2, [{ sentence: 'AI sentence.', score: 0.26 }]));
    mockGenerateSingleSuggestion.mockResolvedValue(makeSuggestion(0, 'Somewhat human.'));

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 10, // very hard target: 10%
      sentences: [makeSentence('AI sentence.', 0.85, 0)],
    }), undefined, { llmApiKey: 'test-key' });

    expect(result.targetMet).toBe(false);
    expect(result.iterations).toBeLessThanOrEqual(10);
  });

  it('reports iterations count correctly across multiple rounds', async () => {
    // Score: round 0 initial high, then drops but stays above target for 2 rounds, then meets at round 3
    mockAnalyzeText
      .mockResolvedValueOnce(makeAnalysisResult(0.8, [{ sentence: 'S1.', score: 0.85 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.6, [{ sentence: 'S1.', score: 0.65 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.4, [{ sentence: 'S1.', score: 0.45 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.2, [{ sentence: 'S1.', score: 0.25 }]));

    mockGenerateSingleSuggestion.mockResolvedValue(makeSuggestion(0, 'More human.'));

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 25, // 0.25 threshold
      sentences: [makeSentence('S1.', 0.85, 0)],
    }), undefined, { llmApiKey: 'test-key' });

    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.iterations).toBeLessThanOrEqual(10);
  });
});

describe('executeBulkRewrite – time-budget engine', () => {
  afterEach(() => { vi.resetAllMocks(); });

  it('should use time budget instead of fixed MAX_ROUNDS', async () => {
    let callCount = 0;
    const nowMock = vi.fn(() => {
      const checkpoints = [0, 10_000, 10_000, 10_000, 10_000, 20_000, 20_000, 20_000, 20_000, 30_000];
      const value = checkpoints[Math.min(callCount, checkpoints.length - 1)];
      callCount += 1;
      return value;
    });
    const highScoreAnalysis = makeAnalysisResult(0.8, [{ sentence: 'AI sentence.', score: 0.85 }]);

    mockAnalyzeText.mockResolvedValue(highScoreAnalysis);
    mockGenerateSingleSuggestion.mockResolvedValue(makeSuggestion(0, 'Still not enough.'));

    const config = {
      llmApiKey: 'test-key',
      deadlineMs: 25_000,
      now: nowMock,
    };

    const result = await executeBulkRewrite(
      makeRequest({
        targetScore: 10,
        sentences: [makeSentence('AI sentence.', 0.85, 0)],
      }),
      undefined,
      config,
    );

    expect(result.iterations).toBe(2);
  });

  it('should return partial results when deadline is reached mid-run', async () => {
    const nowMock = vi
      .fn<() => number>()
      .mockImplementationOnce(() => Date.now())
      .mockImplementation(() => Number.POSITIVE_INFINITY);

    mockAnalyzeText.mockResolvedValueOnce(
      makeAnalysisResult(0.8, [{ sentence: 'AI sentence.', score: 0.85 }]),
    );
    mockGenerateSingleSuggestion.mockResolvedValue(makeSuggestion(0, 'Fallback rewrite.'));

    const result = await executeBulkRewrite(
      makeRequest({
        targetScore: 10,
        sentences: [makeSentence('AI sentence.', 0.85, 0)],
      }),
      undefined,
      {
        llmApiKey: 'test-key',
        now: nowMock,
      },
    );

    expect(result.targetMet).toBe(false);
    expect(result.rewrites).toEqual(expect.any(Object));
    expect(result.achievedScore).toEqual(expect.any(Number));
  });

  it('should accept injectable now() function and call it', async () => {
    const nowMock = vi.fn(() => 0);

    mockAnalyzeText.mockResolvedValueOnce(
      makeAnalysisResult(0.2, [{ sentence: 'Already okay.', score: 0.2 }]),
    );

    await executeBulkRewrite(makeRequest({ targetScore: 30 }), undefined, {
      llmApiKey: 'test-key',
      now: nowMock,
    });

    expect(nowMock).toHaveBeenCalled();
  });

  it('should cap at MAX_ROUNDS=10 even with remaining time budget', async () => {
    const nowMock = vi.fn(() => 0);
    mockAnalyzeText
      .mockResolvedValueOnce(makeAnalysisResult(0.8, [{ sentence: 'AI sentence.', score: 0.85 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.74, [{ sentence: 'AI sentence.', score: 0.8 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.68, [{ sentence: 'AI sentence.', score: 0.74 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.62, [{ sentence: 'AI sentence.', score: 0.68 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.56, [{ sentence: 'AI sentence.', score: 0.62 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.5, [{ sentence: 'AI sentence.', score: 0.56 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.44, [{ sentence: 'AI sentence.', score: 0.5 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.38, [{ sentence: 'AI sentence.', score: 0.44 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.32, [{ sentence: 'AI sentence.', score: 0.38 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.26, [{ sentence: 'AI sentence.', score: 0.32 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.2, [{ sentence: 'AI sentence.', score: 0.26 }]));
    mockGenerateSingleSuggestion.mockResolvedValue(makeSuggestion(0, 'Still not enough.'));

    const result = await executeBulkRewrite(
      makeRequest({
        targetScore: 10,
        sentences: [makeSentence('AI sentence.', 0.85, 0)],
      }),
      undefined,
      {
        llmApiKey: 'test-key',
        deadlineMs: 500_000,
        now: nowMock,
      },
    );

    expect(result.iterations).toBe(10);
  });

  it('should check deadline before starting each round', async () => {
    const nowMock = vi.fn(() => Number.POSITIVE_INFINITY);

    mockAnalyzeText.mockResolvedValueOnce(
      makeAnalysisResult(0.8, [{ sentence: 'AI sentence.', score: 0.85 }]),
    );

    const result = await executeBulkRewrite(
      makeRequest({
        targetScore: 10,
        sentences: [makeSentence('AI sentence.', 0.85, 0)],
      }),
      undefined,
      {
        llmApiKey: 'test-key',
        deadlineMs: 25_000,
        now: nowMock,
      },
    );

    expect(result.iterations).toBe(0);
    expect(mockGenerateSingleSuggestionWithProvider).not.toHaveBeenCalled();
  });

  it('should return immediately if deadline already passed before first round', async () => {
    mockAnalyzeText.mockResolvedValueOnce(
      makeAnalysisResult(0.8, [{ sentence: 'AI sentence.', score: 0.85 }]),
    );

    const result = await executeBulkRewrite(
      makeRequest({
        targetScore: 10,
        sentences: [makeSentence('AI sentence.', 0.85, 0)],
      }),
      undefined,
      {
        llmApiKey: 'test-key',
        deadlineMs: 0,
        now: () => 1,
      },
    );

    expect(result.iterations).toBe(0);
    expect(mockGenerateSingleSuggestionWithProvider).not.toHaveBeenCalled();
  });
});

describe('executeBulkRewrite – prioritization', () => {
  afterEach(() => { vi.resetAllMocks(); });

  it('processes higher-scored sentences first (highest AI score gets rewritten first)', async () => {
    const callOrder: number[] = [];

    mockAnalyzeText
      .mockResolvedValueOnce(
        makeAnalysisResult(0.9, [
          { sentence: 'Low risk.', score: 0.5 },
          { sentence: 'High risk.', score: 0.95 },
          { sentence: 'Medium risk.', score: 0.7 },
        ]),
      )
      .mockResolvedValueOnce(makeAnalysisResult(0.2, [
        { sentence: 'Low risk.', score: 0.2 },
        { sentence: 'Rewritten high.', score: 0.1 },
        { sentence: 'Rewritten medium.', score: 0.15 },
      ]));

    mockGenerateSingleSuggestion.mockImplementation(async (_key, _sentence, sentenceIndex) => {
      callOrder.push(sentenceIndex);
      return makeSuggestion(sentenceIndex as number, `rewritten-${sentenceIndex}`);
    });

    await executeBulkRewrite(makeRequest({
      targetScore: 30,
      sentences: [
        makeSentence('Low risk.', 0.5, 0),
        makeSentence('High risk.', 0.95, 1),
        makeSentence('Medium risk.', 0.7, 2),
      ],
    }), undefined, { llmApiKey: 'test-key' });

    // Sentence with highest score (sentenceIndex=1, score=0.95) should be called before lower ones
    expect(callOrder.indexOf(1)).toBeLessThan(callOrder.indexOf(0));
    expect(callOrder.indexOf(1)).toBeLessThan(callOrder.indexOf(2));
  });

  it('excludes sentences with score below ELIGIBLE_SCORE_FLOOR (0.05)', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(
        makeAnalysisResult(0.9, [
          { sentence: 'Below floor.', score: 0.03 },
          { sentence: 'At floor.', score: 0.05 },
        ]),
      )
      .mockResolvedValueOnce(makeAnalysisResult(0.2, [
        { sentence: 'Below floor.', score: 0.03 },
        { sentence: 'Rewritten.', score: 0.1 },
      ]));

    mockGenerateSingleSuggestion.mockResolvedValue(makeSuggestion(1, 'Rewritten.'));

    await executeBulkRewrite(makeRequest({
      targetScore: 30,
      sentences: [
        makeSentence('Below floor.', 0.03, 0),
        makeSentence('At floor.', 0.05, 1),
      ],
    }), undefined, { llmApiKey: 'test-key' });

    const calledIndices = mockGenerateSingleSuggestion.mock.calls.map((c) => c[2]);
    expect(calledIndices).not.toContain(0);
    expect(calledIndices).toContain(1);
  });
});

describe('executeBulkRewrite – manual replacements preservation', () => {
  afterEach(() => { vi.resetAllMocks(); });

  it('does not rewrite sentences that have manual replacements', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(
        makeAnalysisResult(0.9, [
          { sentence: 'Manually replaced.', score: 0.95 },
          { sentence: 'To be rewritten.', score: 0.85 },
        ]),
      )
      .mockResolvedValueOnce(makeAnalysisResult(0.2, [
        { sentence: 'Manually replaced.', score: 0.95 },
        { sentence: 'Auto rewritten.', score: 0.1 },
      ]));

    mockGenerateSingleSuggestion.mockResolvedValue(makeSuggestion(1, 'Auto rewritten.'));

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 30,
      sentences: [
        makeSentence('Manually replaced.', 0.95, 0),
        makeSentence('To be rewritten.', 0.85, 1),
      ],
      manualReplacements: { 0: 'Manually replaced.' },
    }), undefined, { llmApiKey: 'test-key' });

    // generateSingleSuggestion should NOT have been called for sentenceIndex=0
    const calledIndices = mockGenerateSingleSuggestion.mock.calls.map((c) => c[2]);
    expect(calledIndices).not.toContain(0);
    expect(calledIndices).toContain(1);
    expect(result.rewrites[1]).toBe('Auto rewritten.');
  });

  it('should retry already-rewritten sentences if score is still above threshold', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(makeAnalysisResult(0.9, [{ sentence: 'AI sentence.', score: 0.9 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.5, [{ sentence: 'rewrite-v1', score: 0.4 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.09, [{ sentence: 'rewrite-v2', score: 0.04 }]));

    mockGenerateSingleSuggestion
      .mockResolvedValueOnce(makeSuggestion(0, 'rewrite-v1'))
      .mockResolvedValueOnce(makeSuggestion(0, 'rewrite-v2'));

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 10,
      sentences: [makeSentence('AI sentence.', 0.9, 0)],
    }), undefined, { llmApiKey: 'test-key' });

    expect(mockGenerateSingleSuggestionWithProvider).toHaveBeenNthCalledWith(
      1,
      'test-key',
      'AI sentence.',
      0,
      0.9,
      undefined,
      undefined,
      undefined,
    );
    expect(mockGenerateSingleSuggestionWithProvider).toHaveBeenNthCalledWith(
      2,
      'test-key',
      'rewrite-v1',
      0,
      0.4,
      undefined,
      undefined,
      undefined,
    );
    expect(result.rewrites[0]).toBe('rewrite-v2');
  });

  it('should keep old rewrite when retry produces higher score (regression protection)', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(makeAnalysisResult(0.9, [{ sentence: 'AI sentence.', score: 0.9 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.5, [{ sentence: 'rewrite-v1', score: 0.5 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.09, [{ sentence: 'rewrite-v2', score: 0.6 }]));

    mockGenerateSingleSuggestion
      .mockResolvedValueOnce(makeSuggestion(0, 'rewrite-v1'))
      .mockResolvedValueOnce(makeSuggestion(0, 'rewrite-v2'));

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 10,
      sentences: [makeSentence('AI sentence.', 0.9, 0)],
    }), undefined, { llmApiKey: 'test-key' });

    expect(result.rewrites[0]).toBe('rewrite-v1');
  });

  it('should use new rewrite when retry produces lower score', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(makeAnalysisResult(0.9, [{ sentence: 'AI sentence.', score: 0.9 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.5, [{ sentence: 'rewrite-v1', score: 0.5 }]))
      .mockResolvedValueOnce(makeAnalysisResult(0.09, [{ sentence: 'rewrite-v2', score: 0.2 }]));

    mockGenerateSingleSuggestion
      .mockResolvedValueOnce(makeSuggestion(0, 'rewrite-v1'))
      .mockResolvedValueOnce(makeSuggestion(0, 'rewrite-v2'));

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 10,
      sentences: [makeSentence('AI sentence.', 0.9, 0)],
    }), undefined, { llmApiKey: 'test-key' });

    expect(result.rewrites[0]).toBe('rewrite-v2');
  });

  it('should preserve manual replacements and never retry them', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(
        makeAnalysisResult(0.9, [
          { sentence: 'Original manual sentence.', score: 0.95 },
          { sentence: 'AI sentence.', score: 0.85 },
        ]),
      )
      .mockResolvedValueOnce(
        makeAnalysisResult(0.5, [
          { sentence: 'Manual replacement.', score: 0.95 },
          { sentence: 'rewrite-v1', score: 0.4 },
        ]),
      )
      .mockResolvedValueOnce(
        makeAnalysisResult(0.09, [
          { sentence: 'Manual replacement.', score: 0.95 },
          { sentence: 'rewrite-v2', score: 0.04 },
        ]),
      );

    mockGenerateSingleSuggestion
      .mockResolvedValueOnce(makeSuggestion(1, 'rewrite-v1'))
      .mockResolvedValueOnce(makeSuggestion(1, 'rewrite-v2'));

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 10,
      text: 'Original manual sentence. AI sentence.',
      sentences: [
        makeSentence('Original manual sentence.', 0.95, 0),
        makeSentence('AI sentence.', 0.85, 1),
      ],
      manualReplacements: { 0: 'Manual replacement.' },
    }), undefined, { llmApiKey: 'test-key' });

    const calledIndices = mockGenerateSingleSuggestionWithProvider.mock.calls.map((call) => call[2]);
    expect(calledIndices).not.toContain(0);
    expect(calledIndices).toEqual([1, 1]);
    expect(result.rewrites[0]).toBe('Manual replacement.');
    expect(result.rewrites[1]).toBe('rewrite-v2');
  });

  it('keeps original sentence indices stable across re-analysis rounds', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(makeAnalysisResult(0.9, [
        { sentence: 'Original first.', score: 0.95 },
        { sentence: 'Original second.', score: 0.85 },
      ]))
      .mockResolvedValueOnce(makeAnalysisResult(0.5, [
        { sentence: 'Rewrite first v1.', score: 0.4 },
        { sentence: 'Rewrite second v1.', score: 0.35 },
      ]))
      .mockResolvedValueOnce(makeAnalysisResult(0.2, [
        { sentence: 'Rewrite first v2.', score: 0.1 },
        { sentence: 'Rewrite second v2.', score: 0.08 },
      ]));

    mockGenerateSingleSuggestion
      .mockResolvedValueOnce(makeSuggestion(4, 'Rewrite first v1.'))
      .mockResolvedValueOnce(makeSuggestion(9, 'Rewrite second v1.'))
      .mockResolvedValueOnce(makeSuggestion(4, 'Rewrite first v2.'))
      .mockResolvedValueOnce(makeSuggestion(9, 'Rewrite second v2.'));

    const result = await executeBulkRewrite(makeRequest({
      text: 'Original first.\n\nOriginal second.',
      targetScore: 10,
      sentences: [
        makeSentence('Original first.', 0.95, 4),
        makeSentence('Original second.', 0.85, 9),
      ],
    }), undefined, { llmApiKey: 'test-key' });

    expect(mockGenerateSingleSuggestionWithProvider).toHaveBeenNthCalledWith(
      3,
      'test-key',
      'Rewrite first v1.',
      4,
      0.4,
      undefined,
      undefined,
      undefined,
    );
    expect(mockGenerateSingleSuggestionWithProvider).toHaveBeenNthCalledWith(
      4,
      'test-key',
      'Rewrite second v1.',
      9,
      0.35,
      undefined,
      undefined,
      undefined,
    );
    expect(result.rewrites).toEqual({
      4: 'Rewrite first v2.',
      9: 'Rewrite second v2.',
    });
  });
});

describe('executeBulkRewrite – concurrency ceiling', () => {
  afterEach(() => { vi.resetAllMocks(); });

  it('processes many candidates without error (respects concurrency ceiling = 5)', async () => {
    // 10 sentences all above floor; concurrency = 5 means they run in batches
    const sentences = Array.from({ length: 10 }, (_, i) =>
      makeSentence(`AI sentence ${i}.`, 0.8, i),
    );

    const analysisResult = makeAnalysisResult(
      0.8,
      sentences.map((s) => ({ sentence: s.sentence, score: s.score })),
    );

    mockAnalyzeText
      .mockResolvedValueOnce(analysisResult)
      .mockResolvedValueOnce(
        makeAnalysisResult(
          0.2,
          sentences.map((s) => ({ sentence: s.sentence, score: 0.1 })),
        ),
      );

    mockGenerateSingleSuggestion.mockImplementation(async (_key, _sentence, sentenceIndex) => {
      return makeSuggestion(sentenceIndex as number, `human-${sentenceIndex}`);
    });

    const result = await executeBulkRewrite({
      text: sentences.map((s) => s.sentence).join(' '),
      targetScore: 30,
      sentences,
    }, undefined, { llmApiKey: 'test-key' });

    expect(result.totalRewritten).toBe(10);
    expect(Object.keys(result.rewrites).length).toBe(10);
  });
});

describe('executeBulkRewrite – no candidates break', () => {
  afterEach(() => { vi.resetAllMocks(); });

  it('exits the loop early if no candidates are eligible (all below floor)', async () => {
    mockAnalyzeText.mockResolvedValueOnce(
      makeAnalysisResult(0.9, [
        { sentence: 'Low score sentence.', score: 0.03 },
      ]),
    );

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 10,
      sentences: [makeSentence('Low score sentence.', 0.03, 0)],
    }), undefined, { llmApiKey: 'test-key' });

    expect(result.iterations).toBe(0);
    expect(mockGenerateSingleSuggestion).not.toHaveBeenCalled();
  });

  it('exits early when all candidates produce no rewrites (rewrittenInRound = 0)', async () => {
    mockAnalyzeText.mockResolvedValueOnce(
      makeAnalysisResult(0.8, [{ sentence: 'High AI.', score: 0.85 }]),
    );

    // All suggestions return null → rewrittenInRound = 0 → loop breaks
    mockGenerateSingleSuggestion.mockResolvedValue(null);

    const result = await executeBulkRewrite(makeRequest({
      targetScore: 10,
      sentences: [makeSentence('High AI.', 0.85, 0)],
    }), undefined, { llmApiKey: 'test-key' });

    expect(result.iterations).toBe(0);
    expect(result.totalRewritten).toBe(0);
  });
});

describe('executeBulkRewrite – progress callback', () => {
  afterEach(() => { vi.resetAllMocks(); });

  it('calls onProgress with rewriting phase during sentence rewrites', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(
        makeAnalysisResult(0.8, [{ sentence: 'AI text.', score: 0.9 }]),
      )
      .mockResolvedValueOnce(makeAnalysisResult(0.2, [{ sentence: 'Human.', score: 0.1 }]));

    mockGenerateSingleSuggestion.mockResolvedValueOnce(makeSuggestion(0, 'Human.'));

    const calls: Array<[number, number, string]> = [];
    const onProgress: BulkRewriteProgress = (current, total, phase) => {
      calls.push([current, total, phase]);
    };

    await executeBulkRewrite(
      makeRequest({ targetScore: 30, sentences: [makeSentence('AI text.', 0.9, 0)] }),
      onProgress,
      { llmApiKey: 'test-key' },
    );

    const rewritingCalls = calls.filter(([, , phase]) => phase === 'rewriting');
    const analyzingCalls = calls.filter(([, , phase]) => phase === 'analyzing');
    expect(rewritingCalls.length).toBeGreaterThan(0);
    expect(analyzingCalls.length).toBeGreaterThan(0);
  });
});

describe('executeBulkRewrite – voice profile threading', () => {
  afterEach(() => { vi.resetAllMocks(); });

  it('passes request.voiceProfile into generateSingleSuggestionWithProvider', async () => {
    mockAnalyzeText
      .mockResolvedValueOnce(
        makeAnalysisResult(0.8, [{ sentence: 'AI text.', score: 0.9 }]),
      )
      .mockResolvedValueOnce(makeAnalysisResult(0.2, [{ sentence: 'Human.', score: 0.1 }]));

    mockGenerateSingleSuggestionWithProvider.mockResolvedValueOnce(makeSuggestion(0, 'Human.'));

    await executeBulkRewrite(
      makeRequest({
        targetScore: 30,
        sentences: [makeSentence('AI text.', 0.9, 0)],
        voiceProfile: 'Author voice profile:\nDirect and conversational.',
      }),
      undefined,
      { llmApiKey: 'test-key' },
    );

    expect(mockGenerateSingleSuggestionWithProvider).toHaveBeenCalledWith(
      'test-key',
      'AI text.',
      0,
      0.9,
      undefined,
      'Author voice profile:\nDirect and conversational.',
      undefined,
    );
  });
});
