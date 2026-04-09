import { describe, it, expect } from 'vitest';
import {
  mapCopyleaksResultsToSentences,
  type CopyleaksResult,
} from '../copyleaks-sentences';

// ── Helper to create mock Copyleaks results ──────────────────────────────

function createAIResult(charPositions: Array<[number, number]>): CopyleaksResult {
  return {
    classification: 2, // AI
    matches: charPositions.map(([start, length]) => ({
      text: {
        chars: {
          starts: [start],
          lengths: [length],
        },
      },
    })),
  };
}

function createHumanResult(charPositions: Array<[number, number]>): CopyleaksResult {
  return {
    classification: 1, // Human
    matches: charPositions.map(([start, length]) => ({
      text: {
        chars: {
          starts: [start],
          lengths: [length],
        },
      },
    })),
  };
}

// ── All-AI scenario tests ────────────────────────────────────────────────

describe('mapCopyleaksResultsToSentences – all-AI text', () => {
  it('marks all sentences as AI (score 1.0) when entire text is AI-classified', () => {
    const text = 'This is first sentence. This is second sentence. This is third.';
    // All 63 characters (0-62) are marked as AI
    const results = [createAIResult([[0, 62]])];

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      sentence: 'This is first sentence.',
      score: 1.0,
    });
    expect(result[1]).toEqual({
      sentence: 'This is second sentence.',
      score: 1.0,
    });
    expect(result[2]).toEqual({
      sentence: 'This is third.',
      score: 1.0,
    });
  });

  it('marks only overlapping sentences as AI', () => {
    // Text: "This is AI. This is human."
    const text = 'This is AI. This is human.';
    // Only first 11 characters are AI (covers "This is AI.")
    const results = [createAIResult([[0, 11]])];

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result).toHaveLength(2);
    expect(result[0].score).toBe(1.0); // Overlaps AI range
    expect(result[1].score).toBe(0.5); // No overlap (ambiguous)
  });

  it('handles multiple AI match ranges in single result', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    // Mock multiple matches in one AI result
    const results = [
      {
        classification: 2,
        matches: [
          {
            text: {
              chars: { starts: [0], lengths: [15] }, // "First sentence."
            },
          },
          {
            text: {
              chars: { starts: [33], lengths: [15] }, // "Third sentence."
            },
          },
        ],
      },
    ];

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result).toHaveLength(3);
    expect(result[0].score).toBe(1.0); // Overlaps first match
    expect(result[1].score).toBe(0.5); // No match
    expect(result[2].score).toBe(1.0); // Overlaps second match
  });
});

// ── All-human scenario tests ─────────────────────────────────────────────

describe('mapCopyleaksResultsToSentences – all-human text', () => {
  it('marks all sentences as human (score 0.0) when entire text is human-classified', () => {
    const text = 'This is first sentence. This is second sentence.';
    // All characters marked as human
    const results = [createHumanResult([[0, 49]])];

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result).toHaveLength(2);
    expect(result[0].score).toBe(0.0);
    expect(result[1].score).toBe(0.0);
  });

  it('prioritizes AI score over human score when both overlap', () => {
    // If classification is done at character level and both classify same char,
    // the logic processes AI first (priority), then human
    const text = 'This is ambiguous.';
    const results = [
      {
        classification: 2, // AI
        matches: [
          {
            text: {
              chars: { starts: [0], lengths: [10] }, // "This is am"
            },
          },
        ],
      },
      {
        classification: 1, // Human
        matches: [
          {
            text: {
              chars: { starts: [5], lengths: [12] }, // "is ambiguous"
            },
          },
        ],
      },
    ];

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result).toHaveLength(1);
    // Should be AI because AI check comes first
    expect(result[0].score).toBe(1.0);
  });
});

// ── No-match scenario tests ──────────────────────────────────────────────

describe('mapCopyleaksResultsToSentences – no matches', () => {
  it('marks all sentences as ambiguous (score 0.5) when results are empty', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const results: CopyleaksResult[] = [];

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result).toHaveLength(3);
    expect(result[0].score).toBe(0.5);
    expect(result[1].score).toBe(0.5);
    expect(result[2].score).toBe(0.5);
  });

  it('marks sentences as ambiguous when results have neither AI nor human classifications', () => {
    const text = 'First sentence. Second sentence.';
    const results = [
      {
        classification: 0, // Unknown
        matches: [
          {
            text: {
              chars: { starts: [0], lengths: [5] },
            },
          },
        ],
      },
    ];

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result).toHaveLength(2);
    expect(result[0].score).toBe(0.5);
    expect(result[1].score).toBe(0.5);
  });

  it('returns empty array for empty text', () => {
    const text = '';
    const results: CopyleaksResult[] = [];

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result).toEqual([]);
  });
});

// ── Mixed AI/human scenario tests ────────────────────────────────────────

describe('mapCopyleaksResultsToSentences – mixed AI and human', () => {
  it('correctly classifies mixed AI and human sentences', () => {
    const text = 'This is AI. This is human. This is ambiguous.';
    const results = [
      createAIResult([[0, 11]]), // "This is AI."
      createHumanResult([[12, 13]]), // "This is human."
    ];

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result).toHaveLength(3);
    expect(result[0].score).toBe(1.0); // AI
    expect(result[1].score).toBe(0.0); // Human
    expect(result[2].score).toBe(0.5); // Ambiguous
  });

  it('handles partial sentence overlaps correctly', () => {
    const text = 'First sentence. Second sentence.';
    // Mark only first 20 characters as AI (partial overlap with both sentences)
    const results = [createAIResult([[0, 20]])];

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result).toHaveLength(2);
    // First sentence is mostly within the 20-char range, so it overlaps
    expect(result[0].score).toBe(1.0);
    // Second sentence partially overlaps (characters 16-20 of the AI range)
    expect(result[1].score).toBe(1.0);
  });
});

// ── Edge case tests ──────────────────────────────────────────────────────

describe('mapCopyleaksResultsToSentences – edge cases', () => {
  it('handles single sentence text', () => {
    const text = 'This is a single sentence.';
    const results = [createAIResult([[0, text.length]])];

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      sentence: 'This is a single sentence.',
      score: 1.0,
    });
  });

  it('handles text with multiple punctuation marks (!!?, .., etc)', () => {
    const text = 'What?! Really!! Absolutely.';
    const results: CopyleaksResult[] = [];

    const result = mapCopyleaksResultsToSentences(text, results);

    // Should split on each punctuation cluster
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((s) => s.score === 0.5)).toBe(true); // All ambiguous
  });

  it('handles text with only punctuation', () => {
    const text = '...';
    const results: CopyleaksResult[] = [];

    const result = mapCopyleaksResultsToSentences(text, results);

    // May be empty or treated as single sentence depending on implementation
    expect(result.every((s) => s.score === 0.5)).toBe(true);
  });

  it('handles text with mixed whitespace around sentences', () => {
    const text = 'First sentence.   Second sentence.';
    const results = [createAIResult([[0, 15]])]; // Covers "First sentence."

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].score).toBe(1.0); // First overlaps AI
  });

  it('preserves exact sentence text from original', () => {
    const text = 'Keep this exact sentence.';
    const results: CopyleaksResult[] = [];

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result).toHaveLength(1);
    expect(result[0].sentence).toBe('Keep this exact sentence.');
  });

  it('handles multiple AI results with overlapping ranges', () => {
    const text = 'This is overlapping text.';
    const results = [
      {
        classification: 2,
        matches: [
          {
            text: {
              chars: { starts: [0, 10], lengths: [10, 14] },
            },
          },
        ],
      },
    ];

    const result = mapCopyleaksResultsToSentences(text, results);

    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(1.0);
  });
});
