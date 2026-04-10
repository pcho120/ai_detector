import { describe, it, expect, vi, afterEach } from 'vitest';
import { RuleBasedSuggestionService } from '@/lib/suggestions/rule-based';
import { containsBannedPhrase, applyGuardrails } from '@/lib/suggestions/guardrails';
import { LlmSuggestionService, generateSingleSuggestion, generateAlternativeSuggestions } from '@/lib/suggestions/llm';
import {
  sanitizeVoiceProfile,
  detectProfileLanguage,
  getPresetDescriptor,
  buildProfileGenerationPrompt,
  buildRewriteContextBlock,
  PRESET_DESCRIPTORS,
  MAX_PROFILE_LENGTH,
  type VoicePresetKey,
} from '@/lib/suggestions/voiceProfile';

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

describe('generateAlternativeSuggestions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('returns null when apiKey is undefined', async () => {
    const result = await generateAlternativeSuggestions(undefined, 'In conclusion, this matters.', 0, 0.9);
    expect(result).toBeNull();
  });

  it('returns null when apiKey is empty string', async () => {
    const result = await generateAlternativeSuggestions('', 'In conclusion, this matters.', 0, 0.9);
    expect(result).toBeNull();
  });

  it('returns 2-3 alternatives on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: 'The study reveals a consistent upward trend in outcomes.', explanation: 'Replaced vague conclusion with a direct empirical claim.' },
                    { rewrite: 'Evidence from the study points to measurable improvement across groups.', explanation: 'Grounded claim in evidence rather than formulaic opener.' },
                    { rewrite: 'Analysis of the data shows a statistically significant improvement.', explanation: 'Introduced specificity by referencing statistical analysis.' },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateAlternativeSuggestions('test-key', 'In conclusion, the experiment shows improved outcomes.', 0, 0.9);

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(2);
    expect(result!.length).toBeLessThanOrEqual(3);
    expect(typeof result![0].rewrite).toBe('string');
    expect(typeof result![0].explanation).toBe('string');
  });

  it('alternatives[0] matches expected rewrite and explanation', async () => {
    const firstRewrite = 'The study reveals a consistent upward trend in outcomes.';
    const firstExplanation = 'Replaced vague conclusion with a direct empirical claim.';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: firstRewrite, explanation: firstExplanation },
                    { rewrite: 'Evidence from the study points to measurable improvement.', explanation: 'Grounded claim in evidence.' },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateAlternativeSuggestions('test-key', 'In conclusion, the experiment shows improved outcomes.', 0, 0.9);

    expect(result![0].rewrite).toBe(firstRewrite);
    expect(result![0].explanation).toBe(firstExplanation);
  });

  it('works without voiceProfile (generic alternatives)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: 'The data indicates a measurable positive outcome.', explanation: 'Direct empirical phrasing.' },
                    { rewrite: 'Results demonstrate consistent improvement across all cohorts.', explanation: 'Replaced vague language with specific scope.' },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateAlternativeSuggestions('test-key', 'Furthermore, the data shows improvement.', 1, 0.8);

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(2);
  });

  it('accepts voiceProfile and still returns alternatives', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: 'The data indicates a measurable positive outcome.', explanation: 'Direct empirical phrasing.' },
                    { rewrite: 'Results demonstrate consistent improvement across all cohorts.', explanation: 'Replaced vague language.' },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateAlternativeSuggestions(
      'test-key',
      'Furthermore, the data shows improvement.',
      1,
      0.8,
      'concise sentences, active verbs, first-person academic voice',
    );

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(2);
  });

  it('returns null when all alternatives contain banned phrases', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: 'This will help you avoid detection by AI tools.', explanation: 'Better phrasing.' },
                    { rewrite: 'Use this to bypass the AI checker.', explanation: 'Cleaner text.' },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateAlternativeSuggestions('test-key', 'Furthermore, this demonstrates the concept.', 2, 0.75);
    expect(result).toBeNull();
  });

  it('filters only unsafe alternatives and returns the safe ones', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: 'Use this to avoid detection.', explanation: 'Cleaner phrasing.' },
                    { rewrite: 'The evidence consistently supports this interpretation.', explanation: 'Replaced vague connector with direct claim.' },
                    { rewrite: 'Data from the study confirms this relationship.', explanation: 'Grounded the claim in evidence.' },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateAlternativeSuggestions('test-key', 'Furthermore, this confirms it.', 2, 0.75);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    expect(result![0].rewrite).toBe('The evidence consistently supports this interpretation.');
  });

  it('returns null when LLM call fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await generateAlternativeSuggestions('test-key', 'Furthermore, the data confirms this.', 1, 0.8);
    expect(result).toBeNull();
  });

  it('returns null on malformed JSON from LLM', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'not valid json' } }],
        }),
      }),
    );

    const result = await generateAlternativeSuggestions('test-key', 'In conclusion, this matters.', 0, 0.9);
    expect(result).toBeNull();
  });

  it('falls back gracefully when LLM returns single-object format instead of array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rewrite: 'The experiment revealed consistent improvement across cohorts.',
                  explanation: 'Replaced vague conclusion with a direct empirical claim.',
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateAlternativeSuggestions('test-key', 'In conclusion, results are positive.', 0, 0.85);
    expect(result).toBeNull();
  });

  it('strips markdown code fences from multi-alternative response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '```json\n' + JSON.stringify({
                  alternatives: [
                    { rewrite: 'The study presents new evidence.', explanation: 'Removed filler opener.' },
                    { rewrite: 'Research findings point to novel conclusions.', explanation: 'More specific framing.' },
                  ],
                }) + '\n```',
              },
            },
          ],
        }),
      }),
    );

    const result = await generateAlternativeSuggestions('test-key', 'In conclusion, the study presents new evidence.', 0, 0.8);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    expect(result![0].rewrite).toBe('The study presents new evidence.');
  });

  it('embeds voiceProfile context block in the LLM prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                alternatives: [
                  { rewrite: 'The data indicates a measurable positive outcome.', explanation: 'Direct empirical phrasing.' },
                  { rewrite: 'Results demonstrate consistent improvement across cohorts.', explanation: 'Evidence-anchored claim.' },
                ],
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateAlternativeSuggestions(
      'test-key',
      'Furthermore, the data shows improvement.',
      1,
      0.8,
      'concise sentences, active verbs, first-person academic voice',
    );

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    const callBody = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = callBody.messages[1].content;
    expect(userContent).toContain('Author voice profile:');
    expect(userContent).toContain('concise sentences, active verbs, first-person academic voice');
  });

  it('sanitizes wrapper-prefixed voiceProfile before embedding in LLM prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                alternatives: [
                  { rewrite: 'The data indicates measurable improvement.', explanation: 'Empirically direct phrasing.' },
                  { rewrite: 'Results show consistent gains across cohorts.', explanation: 'Specific scope.' },
                ],
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateAlternativeSuggestions(
      'test-key',
      'Furthermore, the data shows improvement.',
      1,
      0.8,
      'Voice profile: analytical and structured academic prose',
    );

    const callBody = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = callBody.messages[1].content;
    expect(userContent).toContain('analytical and structured academic prose');
    expect(userContent).not.toContain('Voice profile:');
  });

  it('omits voiceProfile block from LLM prompt when voiceProfile is undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                alternatives: [
                  { rewrite: 'The data indicates a measurable positive outcome.', explanation: 'Direct phrasing.' },
                  { rewrite: 'Results demonstrate consistent improvement.', explanation: 'Specific claim.' },
                ],
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await generateAlternativeSuggestions('test-key', 'Furthermore, the data shows improvement.', 1, 0.8);

    const callBody = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = callBody.messages[1].content;
    expect(userContent).not.toContain('Author voice profile:');
    expect(userContent).not.toContain('작성자의 목소리 프로필:');
  });
});

describe('generateAlternativeSuggestions — unavailable branch isolation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('branch: missing COACHING_LLM_API_KEY → returns null', async () => {
    const result = await generateAlternativeSuggestions(
      undefined,
      'Furthermore, the data supports this hypothesis.',
      3,
      0.85,
    );
    expect(result).toBeNull();
  });

  it('branch: multi-call parse failure (malformed JSON) → returns null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{ broken json :::' } }],
        }),
      }),
    );

    const result = await generateAlternativeSuggestions(
      'test-key',
      'In conclusion, the experiment shows improved outcomes.',
      0,
      0.9,
    );
    expect(result).toBeNull();
  });

  it('branch: all alternatives guardrail-filtered → returns null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: 'This will help you avoid detection by AI tools.', explanation: 'Cleaner phrasing.' },
                    { rewrite: 'Use these changes to bypass the AI checker entirely.', explanation: 'Better structure.' },
                    { rewrite: 'This approach makes your writing completely undetectable.', explanation: 'Third option.' },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateAlternativeSuggestions(
      'test-key',
      'Furthermore, this demonstrates the concept.',
      2,
      0.78,
    );
    expect(result).toBeNull();
  });

  it('branch: <2 safe alternatives after guardrail filtering → returns null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: 'The experiment revealed consistent improvement across cohorts.', explanation: 'Direct empirical claim.' },
                    { rewrite: 'Results indicate a trend.', explanation: 'This change makes it undetectable to AI tools.' },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    );

    const result = await generateAlternativeSuggestions(
      'test-key',
      'In conclusion, the experiment shows improved outcomes.',
      5,
      0.9,
    );
    expect(result).toBeNull();
  });
});

describe('generateAlternativeSuggestions — recovery path', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  it('recovery: first call gives 1 safe alt, second call provides more → returns 2 safe alternatives', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                alternatives: [
                  { rewrite: 'The experiment revealed consistent improvement.', explanation: 'Direct empirical claim.' },
                  { rewrite: 'Results indicate a trend.', explanation: 'This change makes it undetectable to AI tools.' },
                ],
              }),
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                alternatives: [
                  { rewrite: 'The study demonstrates a measurable positive trend.', explanation: 'Evidence-anchored restatement.' },
                  { rewrite: 'Analysis confirms a consistent pattern of improvement.', explanation: 'Grounded in data analysis.' },
                ],
              }),
            },
          }],
        }),
      })
      .mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateAlternativeSuggestions(
      'test-key',
      'In conclusion, the experiment shows improved outcomes.',
      0,
      0.9,
    );

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(2);
    expect(result!.length).toBeLessThanOrEqual(3);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('recovery: first call gives single-object format (1 item), second call provides 2 safe alts → returns 2 alts', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                rewrite: 'The experiment revealed consistent improvement across cohorts.',
                explanation: 'Direct empirical claim.',
              }),
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                alternatives: [
                  { rewrite: 'The study demonstrates a measurable positive trend.', explanation: 'Evidence-anchored restatement.' },
                  { rewrite: 'Analysis confirms a consistent pattern of improvement.', explanation: 'Grounded in data analysis.' },
                ],
              }),
            },
          }],
        }),
      })
      .mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateAlternativeSuggestions(
      'test-key',
      'In conclusion, the experiment shows improved outcomes.',
      0,
      0.9,
    );

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(2);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('recovery: deduplicates identical rewrites between first and second call', async () => {
    const sharedAlt = { rewrite: 'The experiment revealed consistent improvement across cohorts.', explanation: 'Direct empirical claim.' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                alternatives: [
                  sharedAlt,
                  { rewrite: 'Results indicate a trend.', explanation: 'This change makes it undetectable to AI tools.' },
                ],
              }),
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                alternatives: [
                  sharedAlt,
                  { rewrite: 'Analysis confirms measurable gains in the study data.', explanation: 'Precise scope and evidence.' },
                ],
              }),
            },
          }],
        }),
      })
      .mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateAlternativeSuggestions(
      'test-key',
      'In conclusion, the experiment shows improved outcomes.',
      0,
      0.9,
    );

    expect(result).not.toBeNull();
    expect(result!.length).toBeGreaterThanOrEqual(2);
    const rewrites = result!.map((a) => a.rewrite);
    expect(new Set(rewrites).size).toBe(rewrites.length);
  });

  it('recovery: both calls return all-banned alternatives → returns null (truly unavailable)', async () => {
    const bannedAlt = { rewrite: 'Use this to bypass the AI checker.', explanation: 'Cleaner phrasing.' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({ alternatives: [bannedAlt, bannedAlt] }),
            },
          }],
        }),
      }),
    );

    const result = await generateAlternativeSuggestions(
      'test-key',
      'In conclusion, the experiment shows improved outcomes.',
      0,
      0.9,
    );
    expect(result).toBeNull();
  });

  it('recovery: second call fails (network error) → returns null', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                alternatives: [
                  { rewrite: 'The experiment revealed consistent improvement.', explanation: 'Direct empirical claim.' },
                  { rewrite: 'Results indicate a trend.', explanation: 'This change makes it undetectable to AI tools.' },
                ],
              }),
            },
          }],
        }),
      })
      .mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateAlternativeSuggestions(
      'test-key',
      'In conclusion, the experiment shows improved outcomes.',
      0,
      0.9,
    );
    expect(result).toBeNull();
  });
});

describe('voiceProfile – sanitizeVoiceProfile', () => {
  it('strips English wrapper "Your voice profile is:"', () => {
    expect(sanitizeVoiceProfile('Your voice profile is: writes clearly')).toBe('writes clearly');
  });

  it('strips English wrapper "Voice profile:" (case-insensitive)', () => {
    expect(sanitizeVoiceProfile('Voice profile: concise and direct')).toBe('concise and direct');
  });

  it('strips English wrapper "My writing style is:"', () => {
    expect(sanitizeVoiceProfile('My writing style is: formal and precise')).toBe('formal and precise');
  });

  it('strips English wrapper "Writing style:"', () => {
    expect(sanitizeVoiceProfile('Writing style: narrative')).toBe('narrative');
  });

  it('strips English wrapper "Style profile:"', () => {
    expect(sanitizeVoiceProfile('Style profile: technical')).toBe('technical');
  });

  it('strips Korean wrapper "당신의 목소리는"', () => {
    expect(sanitizeVoiceProfile('당신의 목소리는: 간결하고 명확한 문체')).toBe('간결하고 명확한 문체');
  });

  it('strips Korean wrapper "목소리 프로필:"', () => {
    expect(sanitizeVoiceProfile('목소리 프로필: 직접적인 어조')).toBe('직접적인 어조');
  });

  it('strips Korean wrapper "나의 글쓰기 스타일은"', () => {
    expect(sanitizeVoiceProfile('나의 글쓰기 스타일은: 서사적인 목소리')).toBe('서사적인 목소리');
  });

  it('strips Korean wrapper "글쓰기 스타일:"', () => {
    expect(sanitizeVoiceProfile('글쓰기 스타일: 학술적')).toBe('학술적');
  });

  it('strips Korean full-sentence wrapper "당신의 목소리는 \'...\' 입니다."', () => {
    expect(sanitizeVoiceProfile("당신의 목소리는 '간결하고 명확한 문체' 입니다.")).toBe('간결하고 명확한 문체');
  });

  it('strips Korean full-sentence wrapper with extra whitespace', () => {
    expect(sanitizeVoiceProfile("당신의 목소리는  '직접적인 어조'  입니다.  ")).toBe('직접적인 어조');
  });

  it('passes through plain text unchanged', () => {
    expect(sanitizeVoiceProfile('concise sentences, active verbs')).toBe('concise sentences, active verbs');
  });

  it('trims surrounding whitespace from plain text', () => {
    expect(sanitizeVoiceProfile('  plain profile  ')).toBe('plain profile');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeVoiceProfile('')).toBe('');
  });

  it('clamps text exceeding MAX_PROFILE_LENGTH to exactly 2000 chars', () => {
    const over = 'a'.repeat(MAX_PROFILE_LENGTH + 500);
    const result = sanitizeVoiceProfile(over);
    expect(result.length).toBe(MAX_PROFILE_LENGTH);
  });

  it('does not clamp text at exactly MAX_PROFILE_LENGTH', () => {
    const exact = 'b'.repeat(MAX_PROFILE_LENGTH);
    expect(sanitizeVoiceProfile(exact)).toBe(exact);
  });

  it('clamps wrapped text after stripping prefix', () => {
    const longBody = 'c'.repeat(MAX_PROFILE_LENGTH + 100);
    const result = sanitizeVoiceProfile(`Voice profile: ${longBody}`);
    expect(result.length).toBe(MAX_PROFILE_LENGTH);
  });

  it('only strips one leading wrapper — not mid-text occurrences', () => {
    const input = 'Voice profile: good writer. Voice profile: also concise.';
    const result = sanitizeVoiceProfile(input);
    expect(result).toBe('good writer. Voice profile: also concise.');
  });
});

describe('voiceProfile – detectProfileLanguage', () => {
  it('returns "en" for plain English text', () => {
    expect(detectProfileLanguage('concise sentences with active verbs')).toBe('en');
  });

  it('returns "en" for empty string', () => {
    expect(detectProfileLanguage('')).toBe('en');
  });

  it('returns "ko" when Hangul syllables are present', () => {
    expect(detectProfileLanguage('간결하고 명확한 문체')).toBe('ko');
  });

  it('returns "ko" for mixed EN+KO text (Hangul present)', () => {
    expect(detectProfileLanguage('This is 한국어 mixed text')).toBe('ko');
  });

  it('returns "en" for text with only digits and punctuation', () => {
    expect(detectProfileLanguage('1234 !@#$%')).toBe('en');
  });
});

describe('voiceProfile – getPresetDescriptor', () => {
  const KEYS: VoicePresetKey[] = ['academic', 'conversational', 'formal', 'narrative', 'technical'];

  it('returns a non-empty string for every supported preset', () => {
    for (const key of KEYS) {
      const descriptor = getPresetDescriptor(key);
      expect(typeof descriptor).toBe('string');
      expect(descriptor.length).toBeGreaterThan(0);
    }
  });

  it('returns the same value on repeated calls (deterministic)', () => {
    for (const key of KEYS) {
      expect(getPresetDescriptor(key)).toBe(getPresetDescriptor(key));
    }
  });

  it('matches PRESET_DESCRIPTORS object exactly', () => {
    for (const key of KEYS) {
      expect(getPresetDescriptor(key)).toBe(PRESET_DESCRIPTORS[key]);
    }
  });

  it('throws TypeError for an unknown preset key', () => {
    expect(() => getPresetDescriptor('unknown' as VoicePresetKey)).toThrow(TypeError);
  });
});

describe('voiceProfile – buildProfileGenerationPrompt', () => {
  it('defaults to English when no lang provided', () => {
    const prompt = buildProfileGenerationPrompt();
    expect(prompt).toContain('writing coach');
    expect(prompt).toContain('English');
  });

  it('returns English prompt for lang="en"', () => {
    const prompt = buildProfileGenerationPrompt('en');
    expect(prompt).toContain('distinctive voice');
    expect(prompt).not.toContain('코치');
  });

  it('returns Korean prompt for lang="ko"', () => {
    const prompt = buildProfileGenerationPrompt('ko');
    expect(prompt).toContain('글쓰기 코치');
    expect(prompt).toContain('한국어');
  });

  it('does not mention AI detection or evasion in English prompt', () => {
    const prompt = buildProfileGenerationPrompt('en');
    expect(prompt.toLowerCase()).not.toContain('bypass');
    expect(prompt.toLowerCase()).not.toContain('evad');
    expect(prompt.toLowerCase()).not.toContain('undetect');
  });

  it('does not mention AI detection or evasion in Korean prompt', () => {
    const prompt = buildProfileGenerationPrompt('ko');
    expect(prompt).not.toContain('우회');
    expect(prompt).not.toContain('탐지 회피');
    expect(prompt).not.toContain('undetect');
  });
});

describe('voiceProfile – buildRewriteContextBlock', () => {
  it('returns empty string for empty profile', () => {
    expect(buildRewriteContextBlock('')).toBe('');
  });

  it('returns empty string for whitespace-only profile', () => {
    expect(buildRewriteContextBlock('   ')).toBe('');
  });

  it('returns English-labelled block by default', () => {
    const block = buildRewriteContextBlock('concise and direct');
    expect(block).toBe('Author voice profile:\nconcise and direct');
  });

  it('returns English-labelled block for lang="en"', () => {
    const block = buildRewriteContextBlock('formal register', 'en');
    expect(block).toContain('Author voice profile:');
    expect(block).toContain('formal register');
  });

  it('returns Korean-labelled block for lang="ko"', () => {
    const block = buildRewriteContextBlock('간결한 문체', 'ko');
    expect(block).toBe('작성자의 목소리 프로필:\n간결한 문체');
  });

  it('trims internal whitespace from profile before embedding', () => {
    const block = buildRewriteContextBlock('  spaced profile  ');
    expect(block).toBe('Author voice profile:\nspaced profile');
  });
});
