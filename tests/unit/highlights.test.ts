import { describe, it, expect } from 'vitest';
import {
  buildHighlightSpans,
  scoreToLabel,
  HIGH_RISK_THRESHOLD,
  MEDIUM_RISK_THRESHOLD,
} from '@/lib/highlights/spans';
import type { SentenceScore, HighlightSpan } from '@/lib/highlights/spans';

const TEXT_A = 'The quick brown fox jumps over the lazy dog.';
const TEXT_TWO_SENTENCES = 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.';

describe('buildHighlightSpans - empty inputs', () => {
  it('returns empty array for empty sentence list', () => {
    const spans = buildHighlightSpans(TEXT_A, []);
    expect(spans).toEqual([]);
  });

  it('returns empty array when text is empty string', () => {
    const sentences: SentenceScore[] = [{ sentence: 'Hello world', score: 0.9 }];
    const spans = buildHighlightSpans('', sentences);
    expect(spans).toEqual([]);
  });

  it('returns empty array when all sentences are empty strings', () => {
    const sentences: SentenceScore[] = [{ sentence: '', score: 0.9 }, { sentence: '   ', score: 0.5 }];
    const spans = buildHighlightSpans(TEXT_A, sentences);
    expect(spans).toEqual([]);
  });

  it('returns empty array when no sentence matches the text', () => {
    const sentences: SentenceScore[] = [{ sentence: 'Completely unrelated content XYZ123', score: 0.8 }];
    const spans = buildHighlightSpans(TEXT_A, sentences);
    expect(spans).toEqual([]);
  });
});

describe('buildHighlightSpans - single sentence', () => {
  it('maps a single sentence to correct start/end offsets', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog.';
    const spans = buildHighlightSpans(TEXT_A, [{ sentence, score: 0.8 }]);
    expect(spans).toHaveLength(1);
    expect(spans[0].start).toBe(0);
    expect(spans[0].end).toBe(TEXT_A.length);
    expect(TEXT_A.slice(spans[0].start, spans[0].end)).toBe(sentence);
  });

  it('span text slice matches the original extracted text (not the sentence string)', () => {
    const spans = buildHighlightSpans(TEXT_TWO_SENTENCES, [
      { sentence: 'Pack my box with five dozen liquor jugs.', score: 0.5 },
    ]);
    expect(spans).toHaveLength(1);
    const sliced = TEXT_TWO_SENTENCES.slice(spans[0].start, spans[0].end);
    expect(sliced).toBe('Pack my box with five dozen liquor jugs.');
  });

  it('attaches correct score to the span', () => {
    const spans = buildHighlightSpans(TEXT_A, [{ sentence: 'The quick brown fox jumps over the lazy dog.', score: 0.75 }]);
    expect(spans[0].score).toBe(0.75);
  });
});

describe('buildHighlightSpans - multiple sentences', () => {
  it('returns spans for both sentences in a two-sentence text', () => {
    const sentences: SentenceScore[] = [
      { sentence: 'The quick brown fox jumps over the lazy dog.', score: 0.8 },
      { sentence: 'Pack my box with five dozen liquor jugs.', score: 0.3 },
    ];
    const spans = buildHighlightSpans(TEXT_TWO_SENTENCES, sentences);
    expect(spans).toHaveLength(2);
  });

  it('output is sorted ascending by start offset regardless of sentence input order', () => {
    const sentences: SentenceScore[] = [
      { sentence: 'Pack my box with five dozen liquor jugs.', score: 0.3 },
      { sentence: 'The quick brown fox jumps over the lazy dog.', score: 0.8 },
    ];
    const spans = buildHighlightSpans(TEXT_TWO_SENTENCES, sentences);
    expect(spans).toHaveLength(2);
    expect(spans[0].start).toBeLessThan(spans[1].start);
    expect(spans[0].start).toBe(0);
  });

  it('spans do not overlap for adjacent non-overlapping sentences', () => {
    const sentences: SentenceScore[] = [
      { sentence: 'The quick brown fox jumps over the lazy dog.', score: 0.8 },
      { sentence: 'Pack my box with five dozen liquor jugs.', score: 0.3 },
    ];
    const spans = buildHighlightSpans(TEXT_TWO_SENTENCES, sentences);
    expect(spans[0].end).toBeLessThanOrEqual(spans[1].start);
  });
});

describe('buildHighlightSpans - duplicate sentences', () => {
  const REPEATED_TEXT = 'Hello world. Some other text. Hello world. More text.';

  it('maps first occurrence to the first position', () => {
    const sentences: SentenceScore[] = [
      { sentence: 'Hello world.', score: 0.9 },
    ];
    const spans = buildHighlightSpans(REPEATED_TEXT, sentences);
    expect(spans).toHaveLength(1);
    expect(spans[0].start).toBe(0);
  });

  it('maps two identical sentences to two different offsets', () => {
    const sentences: SentenceScore[] = [
      { sentence: 'Hello world.', score: 0.9 },
      { sentence: 'Hello world.', score: 0.7 },
    ];
    const spans = buildHighlightSpans(REPEATED_TEXT, sentences);
    expect(spans).toHaveLength(2);
    expect(spans[0].start).not.toBe(spans[1].start);
  });

  it('second duplicate maps to later offset than first', () => {
    const sentences: SentenceScore[] = [
      { sentence: 'Hello world.', score: 0.9 },
      { sentence: 'Hello world.', score: 0.7 },
    ];
    const spans = buildHighlightSpans(REPEATED_TEXT, sentences);
    expect(spans[0].start).toBeLessThan(spans[1].start);
  });

  it('third occurrence of a sentence is not returned when only two provided', () => {
    const tripled = 'Hello world. Hello world. Hello world.';
    const sentences: SentenceScore[] = [
      { sentence: 'Hello world.', score: 0.9 },
      { sentence: 'Hello world.', score: 0.7 },
    ];
    const spans = buildHighlightSpans(tripled, sentences);
    expect(spans).toHaveLength(2);
  });

  it('preserves correct score per duplicate occurrence', () => {
    const sentences: SentenceScore[] = [
      { sentence: 'Hello world.', score: 0.9 },
      { sentence: 'Hello world.', score: 0.4 },
    ];
    const spans = buildHighlightSpans(REPEATED_TEXT, sentences);
    expect(spans).toHaveLength(2);
    const first = spans.find((s) => s.start < 20)!;
    const second = spans.find((s) => s.start >= 20)!;
    expect(first.score).toBe(0.9);
    expect(second.score).toBe(0.4);
  });
});

describe('buildHighlightSpans - whitespace/punctuation normalisation', () => {
  it('matches sentence with extra surrounding whitespace in the detector output', () => {
    const text = 'Hello world. Some text here.';
    const sentences: SentenceScore[] = [{ sentence: '  Hello world.  ', score: 0.8 }];
    const spans = buildHighlightSpans(text, sentences);
    expect(spans).toHaveLength(1);
  });

  it('matches sentence with internal whitespace variations', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const sentences: SentenceScore[] = [
      { sentence: 'The quick  brown fox jumps  over the lazy dog.', score: 0.8 },
    ];
    const spans = buildHighlightSpans(text, sentences);
    expect(spans).toHaveLength(1);
  });

  it('does not mutate the original text string', () => {
    const original = 'Hello world. Some text.';
    const frozen = original;
    buildHighlightSpans(original, [{ sentence: 'Hello world.', score: 0.9 }]);
    expect(original).toBe(frozen);
  });
});

describe('buildHighlightSpans - offset correctness', () => {
  it('span offsets are valid indices into the original text', () => {
    const text = 'First sentence here. Second sentence there.';
    const sentences: SentenceScore[] = [
      { sentence: 'First sentence here.', score: 0.6 },
      { sentence: 'Second sentence there.', score: 0.8 },
    ];
    const spans = buildHighlightSpans(text, sentences);
    for (const span of spans) {
      expect(span.start).toBeGreaterThanOrEqual(0);
      expect(span.end).toBeLessThanOrEqual(text.length);
      expect(span.start).toBeLessThan(span.end);
    }
  });

  it('unmatched sentences are skipped without affecting matched ones', () => {
    const text = 'The quick brown fox. Something else entirely.';
    const sentences: SentenceScore[] = [
      { sentence: 'The quick brown fox.', score: 0.7 },
      { sentence: 'This sentence does not appear anywhere.', score: 0.9 },
    ];
    const spans = buildHighlightSpans(text, sentences);
    expect(spans).toHaveLength(1);
    expect(spans[0].score).toBe(0.7);
  });
});

describe('buildHighlightSpans - label assignment', () => {
  it('assigns high label for scores at or above HIGH_RISK_THRESHOLD', () => {
    const text = 'Some sample sentence for testing.';
    const spans = buildHighlightSpans(text, [
      { sentence: 'Some sample sentence for testing.', score: HIGH_RISK_THRESHOLD },
    ]);
    expect(spans[0].label).toBe('high');
  });

  it('assigns medium label for scores at MEDIUM_RISK_THRESHOLD', () => {
    const text = 'Some sample sentence for testing.';
    const spans = buildHighlightSpans(text, [
      { sentence: 'Some sample sentence for testing.', score: MEDIUM_RISK_THRESHOLD },
    ]);
    expect(spans[0].label).toBe('medium');
  });

  it('assigns low label for scores below MEDIUM_RISK_THRESHOLD', () => {
    const text = 'Some sample sentence for testing.';
    const spans = buildHighlightSpans(text, [
      { sentence: 'Some sample sentence for testing.', score: 0.1 },
    ]);
    expect(spans[0].label).toBe('low');
  });
});

describe('scoreToLabel', () => {
  it('returns high for score at exactly HIGH_RISK_THRESHOLD', () => {
    expect(scoreToLabel(HIGH_RISK_THRESHOLD)).toBe('high');
  });

  it('returns high for score above HIGH_RISK_THRESHOLD', () => {
    expect(scoreToLabel(1.0)).toBe('high');
    expect(scoreToLabel(0.99)).toBe('high');
  });

  it('returns medium for score at exactly MEDIUM_RISK_THRESHOLD', () => {
    expect(scoreToLabel(MEDIUM_RISK_THRESHOLD)).toBe('medium');
  });

  it('returns medium for score between MEDIUM_RISK_THRESHOLD and HIGH_RISK_THRESHOLD', () => {
    expect(scoreToLabel(0.5)).toBe('medium');
    expect(scoreToLabel(0.69)).toBe('medium');
  });

  it('returns low for score below MEDIUM_RISK_THRESHOLD', () => {
    expect(scoreToLabel(0.0)).toBe('low');
    expect(scoreToLabel(0.39)).toBe('low');
  });
});

describe('buildHighlightSpans - deterministic ordering', () => {
  it('output order is stable across multiple calls with same inputs', () => {
    const text = 'Alpha sentence here. Beta sentence there. Gamma sentence finally.';
    const sentences: SentenceScore[] = [
      { sentence: 'Gamma sentence finally.', score: 0.9 },
      { sentence: 'Alpha sentence here.', score: 0.5 },
      { sentence: 'Beta sentence there.', score: 0.7 },
    ];

    const spans1 = buildHighlightSpans(text, sentences);
    const spans2 = buildHighlightSpans(text, sentences);

    expect(spans1.map((s) => s.start)).toEqual(spans2.map((s) => s.start));
  });

  it('spans are sorted by start offset even with out-of-order sentence input', () => {
    const text = 'First. Second. Third.';
    const sentences: SentenceScore[] = [
      { sentence: 'Third.', score: 0.9 },
      { sentence: 'First.', score: 0.4 },
      { sentence: 'Second.', score: 0.7 },
    ];
    const spans = buildHighlightSpans(text, sentences);
    expect(spans).toHaveLength(3);
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].start);
    }
  });
});

describe('buildHighlightSpans - sentenceIndex correctness', () => {
  it('single sentence gets sentenceIndex 0', () => {
    const text = 'Only one sentence here.';
    const spans = buildHighlightSpans(text, [{ sentence: 'Only one sentence here.', score: 0.8 }]);
    expect(spans).toHaveLength(1);
    expect(spans[0].sentenceIndex).toBe(0);
  });

  it('sentenceIndex reflects original array position, not sorted span position', () => {
    const text = 'Alpha goes first. Beta goes second.';
    const betaFirstSentences: SentenceScore[] = [
      { sentence: 'Beta goes second.', score: 0.9 },
      { sentence: 'Alpha goes first.', score: 0.5 },
    ];
    const spans = buildHighlightSpans(text, betaFirstSentences);
    expect(spans).toHaveLength(2);
    const alphaSpan = spans.find((s) => text.slice(s.start, s.end).startsWith('Alpha'))!;
    const betaSpan = spans.find((s) => text.slice(s.start, s.end).startsWith('Beta'))!;
    expect(alphaSpan.sentenceIndex).toBe(1);
    expect(betaSpan.sentenceIndex).toBe(0);
  });

  it('duplicate sentences get distinct sentenceIndex values matching their input positions', () => {
    const REPEATED_TEXT = 'Hello world. Some other text. Hello world. More text.';
    const sentences: SentenceScore[] = [
      { sentence: 'Hello world.', score: 0.9 },
      { sentence: 'Hello world.', score: 0.7 },
    ];
    const spans = buildHighlightSpans(REPEATED_TEXT, sentences);
    expect(spans).toHaveLength(2);
    const firstOccurrence = spans.find((s) => s.start < 20)!;
    const secondOccurrence = spans.find((s) => s.start >= 20)!;
    expect(firstOccurrence.sentenceIndex).toBe(0);
    expect(secondOccurrence.sentenceIndex).toBe(1);
  });

  it('sentenceIndex is within bounds of the sentences array', () => {
    const text = 'First sentence here. Second sentence there. Third sentence last.';
    const sentences: SentenceScore[] = [
      { sentence: 'First sentence here.', score: 0.6 },
      { sentence: 'Second sentence there.', score: 0.8 },
      { sentence: 'Third sentence last.', score: 0.4 },
    ];
    const spans = buildHighlightSpans(text, sentences);
    for (const span of spans) {
      expect(span.sentenceIndex).toBeGreaterThanOrEqual(0);
      expect(span.sentenceIndex).toBeLessThan(sentences.length);
    }
  });

  it('sentenceIndex of matched span indexes back into the sentences input array', () => {
    const text = 'First sentence here. Second sentence there.';
    const sentences: SentenceScore[] = [
      { sentence: 'First sentence here.', score: 0.6 },
      { sentence: 'Second sentence there.', score: 0.8 },
    ];
    const spans = buildHighlightSpans(text, sentences);
    for (const span of spans) {
      expect(sentences[span.sentenceIndex]).toBeDefined();
      expect(typeof sentences[span.sentenceIndex].sentence).toBe('string');
    }
  });

  it('unmatched sentences do not affect sentenceIndex of matched spans', () => {
    const text = 'The quick brown fox. Something else entirely.';
    const unmatchedFirstSentences: SentenceScore[] = [
      { sentence: 'This sentence does not appear anywhere.', score: 0.9 },
      { sentence: 'The quick brown fox.', score: 0.7 },
    ];
    const spans = buildHighlightSpans(text, unmatchedFirstSentences);
    expect(spans).toHaveLength(1);
    expect(spans[0].sentenceIndex).toBe(1);
  });
});

describe('buildHighlightSpans - result is a HighlightSpan array', () => {
  it('each span has start, end, score, label properties', () => {
    const text = 'Testing the output shape.';
    const spans = buildHighlightSpans(text, [{ sentence: 'Testing the output shape.', score: 0.8 }]);
    const span: HighlightSpan = spans[0];
    expect(typeof span.start).toBe('number');
    expect(typeof span.end).toBe('number');
    expect(typeof span.score).toBe('number');
    expect(['low', 'medium', 'high']).toContain(span.label);
  });

  it('each span has a sentenceIndex property that is a number', () => {
    const text = 'Testing sentenceIndex field.';
    const spans = buildHighlightSpans(text, [{ sentence: 'Testing sentenceIndex field.', score: 0.8 }]);
    expect(typeof spans[0].sentenceIndex).toBe('number');
  });
});
