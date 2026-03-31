import { describe, it, expect, vi, afterEach } from 'vitest';
import { RuleBasedSuggestionService } from '@/lib/suggestions/rule-based';
import { containsBannedPhrase, applyGuardrails } from '@/lib/suggestions/guardrails';
import { LlmSuggestionService, generateSingleSuggestion } from '@/lib/suggestions/llm';

describe('RuleBasedSuggestionService', () => {
  const service = new RuleBasedSuggestionService();

  describe('empty input', () => {
    it('returns empty array for no sentences', async () => {
      const result = await service.suggest([]);
      expect(result).toEqual([]);
    });
  });

  describe('safe suggestions returned', () => {
    it('generates a suggestion for "In conclusion" opener', async () => {
      const sentence = 'In conclusion, this study demonstrates the importance of diversity.';
      const result = await service.suggest([{ sentence, index: 0 }]);

      expect(result).toHaveLength(1);
      expect(result[0].sentence).toBe(sentence);
      expect(typeof result[0].rewrite).toBe('string');
      expect(result[0].rewrite.length).toBeGreaterThan(0);
      expect(typeof result[0].explanation).toBe('string');
      expect(result[0].sentenceIndex).toBe(0);
    });

    it('generates a suggestion for "Furthermore" connector', async () => {
      const sentence = 'Furthermore, the data supports the hypothesis that climate change is accelerating.';
      const result = await service.suggest([{ sentence, index: 3 }]);

      expect(result).toHaveLength(1);
      expect(result[0].sentence).toBe(sentence);
      expect(result[0].explanation).toContain('connector');
      expect(result[0].sentenceIndex).toBe(3);
    });

    it('generates a suggestion for "it is important to note"', async () => {
      const sentence = 'It is important to note that the results may vary by region.';
      const result = await service.suggest([{ sentence, index: 2 }]);

      expect(result).toHaveLength(1);
      expect(result[0].explanation).toContain('filler');
      expect(result[0].sentenceIndex).toBe(2);
    });

    it('generates a suggestion for "delve into"', async () => {
      const sentence = 'This paper will delve into the mechanisms of neuroplasticity.';
      const result = await service.suggest([{ sentence, index: 5 }]);

      expect(result).toHaveLength(1);
      expect(result[0].explanation).toContain('Delve');
      expect(result[0].sentenceIndex).toBe(5);
    });

    it('generates a suggestion for "utilize" / "utilization"', async () => {
      const sentence = 'The team chose to utilize machine learning for image classification.';
      const result = await service.suggest([{ sentence, index: 1 }]);

      expect(result).toHaveLength(1);
      expect(result[0].explanation).toContain('Use');
      expect(result[0].sentenceIndex).toBe(1);
    });

    it('generates a suggestion for "plays a crucial role in"', async () => {
      const sentence = 'Education plays a crucial role in reducing poverty rates.';
      const result = await service.suggest([{ sentence, index: 7 }]);

      expect(result).toHaveLength(1);
      expect(result[0].explanation).toContain('vague');
      expect(result[0].sentenceIndex).toBe(7);
    });

    it('generates a suggestion for "a wide range of"', async () => {
      const sentence = 'The report covers a wide range of environmental issues.';
      const result = await service.suggest([{ sentence, index: 4 }]);

      expect(result).toHaveLength(1);
      expect(result[0].explanation).toContain('vague');
      expect(result[0].sentenceIndex).toBe(4);
    });

    it('returns at most one suggestion per sentence', async () => {
      const sentence = 'Furthermore, it is important to note that this plays a crucial role.';
      const result = await service.suggest([{ sentence, index: 0 }]);

      expect(result).toHaveLength(1);
    });

    it('returns suggestions for multiple distinct high-risk sentences', async () => {
      const sentences = [
        'In conclusion, this research has explored key themes.',
        'Furthermore, the evidence shows a clear trend.',
      ];
      const result = await service.suggest([
        { sentence: sentences[0], index: 0 },
        { sentence: sentences[1], index: 1 },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].sentence).toBe(sentences[0]);
      expect(result[0].sentenceIndex).toBe(0);
      expect(result[1].sentence).toBe(sentences[1]);
      expect(result[1].sentenceIndex).toBe(1);
    });

    it('preserves non-contiguous indices when only some sentences are high-risk', async () => {
      const result = await service.suggest([
        { sentence: 'In conclusion, the data is clear.', index: 2 },
        { sentence: 'Furthermore, it confirms the trend.', index: 5 },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].sentenceIndex).toBe(2);
      expect(result[1].sentenceIndex).toBe(5);
    });

    it('returns empty array for sentences with no matched patterns', async () => {
      const sentences = [
        'The cat sat on the mat.',
        'She walked to the store and bought milk.',
        'I disagree with this interpretation entirely.',
      ];
      const result = await service.suggest(sentences.map((sentence, index) => ({ sentence, index })));
      expect(result).toEqual([]);
    });
  });

  describe('suggestion shape', () => {
    it('each suggestion has sentence, rewrite, explanation, and sentenceIndex fields', async () => {
      const sentence = 'In conclusion, the data supports our thesis.';
      const result = await service.suggest([{ sentence, index: 0 }]);

      expect(result).toHaveLength(1);
      const s = result[0];
      expect(typeof s.sentence).toBe('string');
      expect(typeof s.rewrite).toBe('string');
      expect(typeof s.explanation).toBe('string');
      expect(typeof s.sentenceIndex).toBe('number');
      expect(s.sentence).toBe(sentence);
      expect(s.sentenceIndex).toBe(0);
    });

    it('rewrite is shorter than a full essay paragraph (coaching hint, not full rewrite)', async () => {
      const sentence = 'Furthermore, the results indicate a positive correlation.';
      const result = await service.suggest([{ sentence, index: 0 }]);

      expect(result[0].rewrite.length).toBeLessThan(300);
    });

    it('sentenceIndex is a non-negative integer', async () => {
      const sentence = 'In conclusion, the data supports our thesis.';
      const result = await service.suggest([{ sentence, index: 10 }]);

      expect(result[0].sentenceIndex).toBe(10);
      expect(Number.isInteger(result[0].sentenceIndex)).toBe(true);
      expect(result[0].sentenceIndex).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('containsBannedPhrase', () => {
  it('returns false for clean text', () => {
    expect(containsBannedPhrase('Consider using a more direct verb here.')).toBe(false);
    expect(containsBannedPhrase('Replace this phrase with a concrete example.')).toBe(false);
  });

  it('detects "avoid detection"', () => {
    expect(containsBannedPhrase('This rewrite will help you avoid detection by AI tools.')).toBe(true);
  });

  it('detects "bypass" variants', () => {
    expect(containsBannedPhrase('Use these tips to bypass AI detection systems.')).toBe(true);
    expect(containsBannedPhrase('You can bypass the checker with this approach.')).toBe(true);
  });

  it('detects "undetectable"', () => {
    expect(containsBannedPhrase('This makes your text completely undetectable.')).toBe(true);
  });

  it('detects "fool the AI"', () => {
    expect(containsBannedPhrase('These changes will fool the AI detector.')).toBe(true);
  });

  it('detects "lower your AI score"', () => {
    expect(containsBannedPhrase('This will lower your AI score significantly.')).toBe(true);
  });

  it('detects "make it look human"', () => {
    expect(containsBannedPhrase('Use this to make it look human to the detector.')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(containsBannedPhrase('AVOID DETECTION with these tricks.')).toBe(true);
    expect(containsBannedPhrase('Bypass AI checker using synonyms.')).toBe(true);
  });
});

describe('applyGuardrails', () => {
  it('passes through suggestions with clean text', () => {
    const suggestions = [
      { sentence: 'In conclusion, this works.', rewrite: 'Try a specific closing insight.', explanation: 'Formulaic closer.', sentenceIndex: 0 },
      { sentence: 'Furthermore, data shows this.', rewrite: 'State the logical connection directly.', explanation: 'Connector overuse.', sentenceIndex: 1 },
    ];
    expect(applyGuardrails(suggestions)).toHaveLength(2);
  });

  it('removes suggestions whose rewrite contains banned phrases', () => {
    const suggestions = [
      { sentence: 'In conclusion, this works.', rewrite: 'This will help you avoid detection.', explanation: 'Safe explanation.', sentenceIndex: 0 },
      { sentence: 'Furthermore, data shows this.', rewrite: 'State the logical connection directly.', explanation: 'Connector overuse.', sentenceIndex: 1 },
    ];
    const result = applyGuardrails(suggestions);
    expect(result).toHaveLength(1);
    expect(result[0].sentence).toBe('Furthermore, data shows this.');
  });

  it('removes suggestions whose explanation contains banned phrases', () => {
    const suggestions = [
      { sentence: 'Utilize ML here.', rewrite: 'Use ML here.', explanation: 'Bypass the checker by using simpler words.', sentenceIndex: 0 },
    ];
    const result = applyGuardrails(suggestions);
    expect(result).toHaveLength(0);
  });

  it('returns empty array when all suggestions are unsafe', () => {
    const suggestions = [
      { sentence: 'S1', rewrite: 'Makes text undetectable.', explanation: 'Safe.', sentenceIndex: 0 },
      { sentence: 'S2', rewrite: 'Clean rewrite.', explanation: 'Fool the AI detector with this change.', sentenceIndex: 1 },
    ];
    expect(applyGuardrails(suggestions)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(applyGuardrails([])).toHaveLength(0);
  });
});

describe('LlmSuggestionService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
    delete process.env.COACHING_LLM_API_KEY;
  });

  it('returns empty array when COACHING_LLM_API_KEY is absent', async () => {
    delete process.env.COACHING_LLM_API_KEY;
    const service = new LlmSuggestionService();
    const result = await service.suggest([{ sentence: 'In conclusion, this matters.', index: 0 }]);
    expect(result).toEqual([]);
  });

  it('returns empty array when key is explicitly undefined', async () => {
    const service = new LlmSuggestionService(undefined);
    const result = await service.suggest([{ sentence: 'Furthermore, the data confirms this.', index: 1 }]);
    expect(result).toEqual([]);
  });

  it('returns full-sentence rewrites from LLM response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rewrite: 'This research reveals critical insights about climate resilience.',
                  explanation: 'Replaced vague conclusion phrase with a direct, specific claim.',
                }),
              },
            },
          ],
        }),
      }),
    );

    const service = new LlmSuggestionService('test-key');
    const result = await service.suggest([{ sentence: 'In conclusion, this matters greatly.', index: 2 }]);

    expect(result).toHaveLength(1);
    expect(result[0].rewrite).toBe('This research reveals critical insights about climate resilience.');
    expect(result[0].explanation).toBe('Replaced vague conclusion phrase with a direct, specific claim.');
    expect(result[0].sentenceIndex).toBe(2);
    expect(result[0].sentence).toBe('In conclusion, this matters greatly.');
  });

  it('rewrite is a full sentence, not a short hint', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rewrite: 'The evidence consistently demonstrates a strong positive correlation between early intervention and long-term outcomes.',
                  explanation: 'Replaced hedge phrase with a direct claim.',
                }),
              },
            },
          ],
        }),
      }),
    );

    const service = new LlmSuggestionService('test-key');
    const result = await service.suggest([{ sentence: 'Furthermore, it has the potential to improve outcomes.', index: 0 }]);

    expect(result).toHaveLength(1);
    expect(result[0].rewrite.split(' ').length).toBeGreaterThan(5);
  });

  it('returns empty array when LLM HTTP call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    const service = new LlmSuggestionService('test-key');
    const result = await service.suggest([{ sentence: 'In conclusion, this matters.', index: 0 }]);
    expect(result).toEqual([]);
  });

  it('returns empty array when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const service = new LlmSuggestionService('test-key');
    const result = await service.suggest([{ sentence: 'Furthermore, the data shows this.', index: 0 }]);
    expect(result).toEqual([]);
  });

  it('filters out LLM suggestions that contain banned phrases', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rewrite: 'Use this phrasing to avoid detection by AI tools.',
                  explanation: 'A cleaner sentence.',
                }),
              },
            },
          ],
        }),
      }),
    );

    const service = new LlmSuggestionService('test-key');
    const result = await service.suggest([{ sentence: 'In conclusion, this matters.', index: 0 }]);
    expect(result).toHaveLength(0);
  });

  it('handles malformed JSON from LLM gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'not valid json at all' } }],
        }),
      }),
    );

    const service = new LlmSuggestionService('test-key');
    const result = await service.suggest([{ sentence: 'In conclusion, this matters.', index: 0 }]);
    expect(result).toHaveLength(0);
  });

  it('strips markdown code fences from LLM JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '```json\n{"rewrite":"The study presents new evidence.","explanation":"Removed filler opener."}\n```',
              },
            },
          ],
        }),
      }),
    );

    const service = new LlmSuggestionService('test-key');
    const result = await service.suggest([{ sentence: 'In conclusion, the study presents new evidence.', index: 0 }]);

    expect(result).toHaveLength(1);
    expect(result[0].rewrite).toBe('The study presents new evidence.');
  });

  it('preserves sentenceIndex from input entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rewrite: 'Educators directly shape economic mobility outcomes.',
                  explanation: 'Replaced vague role phrase with a direct mechanism.',
                }),
              },
            },
          ],
        }),
      }),
    );

    const service = new LlmSuggestionService('test-key');
    const result = await service.suggest([{ sentence: 'Education plays a crucial role in reducing poverty.', index: 7 }]);

    expect(result[0].sentenceIndex).toBe(7);
  });
});

describe('generateSingleSuggestion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('returns null when apiKey is undefined', async () => {
    const result = await generateSingleSuggestion(undefined, 'In conclusion, this matters.', 0, 0.9);
    expect(result).toBeNull();
  });

  it('returns null when apiKey is empty string', async () => {
    const result = await generateSingleSuggestion('', 'In conclusion, this matters.', 0, 0.9);
    expect(result).toBeNull();
  });

  it('returns a full suggestion on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rewrite: 'The findings highlight a clear positive trend across all demographics.',
                  explanation: 'Replaced formulaic conclusion with a direct empirical claim.',
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateSingleSuggestion('test-key', 'In conclusion, data shows a trend.', 3, 0.85);

    expect(result).not.toBeNull();
    expect(result!.sentenceIndex).toBe(3);
    expect(result!.rewrite).toBe('The findings highlight a clear positive trend across all demographics.');
    expect(result!.explanation).toBe('Replaced formulaic conclusion with a direct empirical claim.');
    expect(result!.sentence).toBe('In conclusion, data shows a trend.');
  });

  it('returns null when LLM call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await generateSingleSuggestion('test-key', 'Furthermore, the data confirms this.', 1, 0.8);
    expect(result).toBeNull();
  });

  it('returns null when generated rewrite contains banned phrases', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rewrite: 'This version will help you bypass the AI checker.',
                  explanation: 'Safe explanation.',
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateSingleSuggestion('test-key', 'Furthermore, this confirms it.', 2, 0.75);
    expect(result).toBeNull();
  });

  it('returns null when explanation contains banned phrases', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rewrite: 'The research demonstrates a consistent pattern.',
                  explanation: 'This change makes it undetectable to AI tools.',
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateSingleSuggestion('test-key', 'Furthermore, the pattern is clear.', 4, 0.8);
    expect(result).toBeNull();
  });
});
