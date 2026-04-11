import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildFewShotContextBlock, MAX_FEWSHOT_CONTEXT_LENGTH } from '../voiceProfile';

const mockComplete = vi.fn();
const mockCompleteMulti = vi.fn();

vi.mock('../llm-adapter', () => ({
  createLlmAdapter: vi.fn(() => ({
    complete: mockComplete,
    completeMulti: mockCompleteMulti,
  })),
}));

vi.mock('../guardrails', () => ({
  applyGuardrails: vi.fn((suggestions) => suggestions),
}));

import {
  generateSingleSuggestionWithProvider,
  generateAlternativeSuggestions,
} from '../llm';

describe('buildFewShotContextBlock', () => {
  it('formats numbered sentences with correct prefix', () => {
    const result = buildFewShotContextBlock([
      'The weather was surprisingly cold.',
      'I grabbed my coat and headed out.',
      'Nobody seemed to notice the change.',
    ]);

    expect(result).toMatch(/^You will rewrite text to match a specific author's writing style\./);
    expect(result).toContain('First, analyze the author\'s style from these examples:');
    expect(result.toLowerCase()).toContain('sentence structure');
    expect(result.toLowerCase()).toContain('vocabulary');
    expect(result.toLowerCase()).toContain('tone');
    expect(result).toContain('Example 1: "The weather was surprisingly cold."');
    expect(result).toContain('Example 2: "I grabbed my coat and headed out."');
    expect(result).toContain('Example 3: "Nobody seemed to notice the change."');
  });

  it('returns empty string for empty array', () => {
    expect(buildFewShotContextBlock([])).toBe('');
  });

  it('returns empty string for undefined-ish input', () => {
    expect(buildFewShotContextBlock(null as unknown as string[])).toBe('');
    expect(buildFewShotContextBlock(undefined as unknown as string[])).toBe('');
  });

  it('truncates at MAX_FEWSHOT_CONTEXT_LENGTH', () => {
    const longSentences = Array.from({ length: 200 }, (_, i) => `This is a fairly long sentence number ${i + 1} designed to exceed the maximum context length.`);
    const result = buildFewShotContextBlock(longSentences);
    expect(result.length).toBeLessThanOrEqual(MAX_FEWSHOT_CONTEXT_LENGTH);
  });

  it('includes style analysis guidance keywords in output', () => {
    const result = buildFewShotContextBlock(['One sentence here.', 'Another sentence.']);
    expect(result.toLowerCase()).toContain('sentence structure');
    expect(result.toLowerCase()).toContain('vocabulary');
    expect(result.toLowerCase()).toContain('tone');
    expect(result).toContain('Transitions');
    expect(result).toContain('Now rewrite');
  });

  it('truncation ends on a complete sentence boundary, not mid-sentence', () => {
    const longSentences = Array.from({ length: 50 }, (_, i) =>
      `This is sentence number ${i + 1} written to be a moderately long example of human writing style with natural phrasing.`
    );
    const result = buildFewShotContextBlock(longSentences);
    expect(result.length).toBeLessThanOrEqual(MAX_FEWSHOT_CONTEXT_LENGTH);
    expect(result.trimEnd()).toMatch(/"\s*\nConsider these style dimensions:[\s\S]*Now rewrite/s);
  });

  it('output contains a chain-of-thought trigger phrase', () => {
    const result = buildFewShotContextBlock(['Example sentence one.', 'Example sentence two.']);
    expect(result.toLowerCase()).toMatch(/first.*analyz|analyz.*style/);
  });

  it('output contains all four style dimensions', () => {
    const result = buildFewShotContextBlock(['Example sentence one.', 'Example sentence two.']);
    expect(result.toLowerCase()).toContain('vocabulary');
    expect(result.toLowerCase()).toMatch(/sentence structure|syntax/);
    expect(result.toLowerCase()).toContain('tone');
    expect(result.toLowerCase()).toMatch(/transition|linking/);
  });

  it('output ends with a "now rewrite" trigger', () => {
    const result = buildFewShotContextBlock(['Example sentence one.', 'Example sentence two.']);
    expect(result.toLowerCase()).toContain('now rewrite');
  });

  it('output with 5 typical examples fits within MAX_FEWSHOT_CONTEXT_LENGTH', () => {
    const examples = [
      'The author integrates evidence efficiently by pairing each claim with a brief explanatory clause.',
      'Smith (2020) argues that automation has transformed workflows, particularly in manufacturing sectors.',
      'Although the methodology differs slightly, the findings align with previous scholarship on this topic.',
      'This approach allowed the team to identify patterns that were not visible in aggregate statistics.',
      'The conclusion synthesizes the main threads while leaving room for future inquiry into related questions.',
    ];
    const result = buildFewShotContextBlock(examples);
    expect(result.length).toBeLessThanOrEqual(3000);
    expect(result).not.toBe('');
  });

  it('produces valid output with a single example sentence', () => {
    const result = buildFewShotContextBlock(['Single example sentence for edge case testing.']);
    expect(result).not.toBe('');
    expect(result.toLowerCase()).toContain('now rewrite');
  });
});

describe('few-shot mutual exclusivity in single suggestion', () => {
  beforeEach(() => {
    mockComplete.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses few-shot context instead of voiceProfile when both provided', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass one.', explanation: 'first' }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass two.', explanation: 'second' }),
      });

    await generateSingleSuggestionWithProvider(
      'api-key',
      'Test sentence.',
      0,
      0.9,
      'openai',
      'Direct and conversational.',
      ['Example sentence one.', 'Example sentence two.'],
    );

    const prompt = mockComplete.mock.calls[0]?.[0].userPrompt as string;
    expect(prompt).toContain("You will rewrite text to match a specific author's writing style.");
    expect(prompt).not.toContain('Author voice profile:');
  });

  it('falls back to voiceProfile when fewShotExamples is empty array', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass one.', explanation: 'first' }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass two.', explanation: 'second' }),
      });

    await generateSingleSuggestionWithProvider(
      'api-key',
      'Test sentence.',
      0,
      0.9,
      'openai',
      'Direct and conversational.',
      [],
    );

    const prompt = mockComplete.mock.calls[0]?.[0].userPrompt as string;
    expect(prompt).toContain('Author voice profile:');
    expect(prompt).not.toContain('Write in the same style');
  });

  it('uses voiceProfile when fewShotExamples is undefined', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass one.', explanation: 'first' }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass two.', explanation: 'second' }),
      });

    await generateSingleSuggestionWithProvider(
      'api-key',
      'Test sentence.',
      0,
      0.9,
      'openai',
      'Direct and conversational.',
    );

    const prompt = mockComplete.mock.calls[0]?.[0].userPrompt as string;
    expect(prompt).toContain('Author voice profile:');
  });
});

describe('few-shot mutual exclusivity in alternative suggestions', () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockCompleteMulti.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses few-shot context in multi prompt when both provided', async () => {
    mockCompleteMulti.mockResolvedValueOnce({
      content: JSON.stringify({
        alternatives: [
          { rewrite: 'Alt one.', explanation: 'e1' },
          { rewrite: 'Alt two.', explanation: 'e2' },
          { rewrite: 'Alt three.', explanation: 'e3' },
        ],
      }),
    });
    mockComplete
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined one.', explanation: 'r1' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined two.', explanation: 'r2' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined three.', explanation: 'r3' }) });

    await generateAlternativeSuggestions(
      'api-key',
      'Test sentence.',
      0,
      0.9,
      'Some voice profile text.',
      'openai',
      ['Few shot example one.', 'Few shot example two.'],
    );

    const multiPrompt = mockCompleteMulti.mock.calls[0]?.[0].userPrompt as string;
    expect(multiPrompt).toContain("You will rewrite text to match a specific author's writing style.");
    expect(multiPrompt).not.toContain('Author voice profile:');
  });

  it('uses voiceProfile in multi prompt when no few-shot', async () => {
    mockCompleteMulti.mockResolvedValueOnce({
      content: JSON.stringify({
        alternatives: [
          { rewrite: 'Alt one.', explanation: 'e1' },
          { rewrite: 'Alt two.', explanation: 'e2' },
          { rewrite: 'Alt three.', explanation: 'e3' },
        ],
      }),
    });
    mockComplete
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined one.', explanation: 'r1' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined two.', explanation: 'r2' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined three.', explanation: 'r3' }) });

    await generateAlternativeSuggestions(
      'api-key',
      'Test sentence.',
      0,
      0.9,
      'Direct and conversational.',
      'openai',
    );

    const multiPrompt = mockCompleteMulti.mock.calls[0]?.[0].userPrompt as string;
    expect(multiPrompt).toContain('Author voice profile:');
    expect(multiPrompt).not.toContain('Write in the same style');
  });

  it('falls back to voiceProfile when fewShotExamples is empty array', async () => {
    mockCompleteMulti.mockResolvedValueOnce({
      content: JSON.stringify({
        alternatives: [
          { rewrite: 'Alt one.', explanation: 'e1' },
          { rewrite: 'Alt two.', explanation: 'e2' },
          { rewrite: 'Alt three.', explanation: 'e3' },
        ],
      }),
    });
    mockComplete
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined one.', explanation: 'r1' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined two.', explanation: 'r2' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined three.', explanation: 'r3' }) });

    await generateAlternativeSuggestions(
      'api-key',
      'Test sentence.',
      0,
      0.9,
      'Direct and conversational.',
      'openai',
      [],
    );

    const multiPrompt = mockCompleteMulti.mock.calls[0]?.[0].userPrompt as string;
    expect(multiPrompt).toContain('Author voice profile:');
    expect(multiPrompt).not.toContain('Write in the same style');
  });
});

describe('generateAlternativeSuggestions Pass2 behavior with few-shot', () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockCompleteMulti.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls adapter.complete (Pass2) when fewShotExamples are provided', async () => {
    mockCompleteMulti.mockResolvedValueOnce({
      content: JSON.stringify({
        alternatives: [
          { rewrite: 'Alt one.', explanation: 'e1' },
          { rewrite: 'Alt two.', explanation: 'e2' },
          { rewrite: 'Alt three.', explanation: 'e3' },
        ],
      }),
    });
    mockComplete
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined one.', explanation: 'r1' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined two.', explanation: 'r2' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined three.', explanation: 'r3' }) });

    const result = await generateAlternativeSuggestions(
      'api-key',
      'Test sentence.',
      0,
      0.9,
      undefined,
      'openai',
      ['Example one.', 'Example two.'],
    );

    expect(mockComplete).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(3);
    expect(result?.[0].rewrite).toBe('Refined one.');
  });

  it('calls adapter.complete for Pass2 when fewShotExamples are NOT provided (regression)', async () => {
    mockCompleteMulti.mockResolvedValueOnce({
      content: JSON.stringify({
        alternatives: [
          { rewrite: 'Alt one.', explanation: 'e1' },
          { rewrite: 'Alt two.', explanation: 'e2' },
          { rewrite: 'Alt three.', explanation: 'e3' },
        ],
      }),
    });
    mockComplete
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined one.', explanation: 'r1' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined two.', explanation: 'r2' }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ rewrite: 'Refined three.', explanation: 'r3' }) });

    const result = await generateAlternativeSuggestions(
      'api-key',
      'Test sentence.',
      0,
      0.9,
      undefined,
      'openai',
    );

    expect(mockComplete).toHaveBeenCalledTimes(3);
    expect(result?.[0].rewrite).toBe('Refined one.');
  });
});
