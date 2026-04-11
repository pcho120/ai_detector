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

    expect(result).toMatch(/^The following sentences are examples of this author's writing\./);
    expect(result).toContain('sentence structure');
    expect(result).toContain('vocabulary');
    expect(result).toContain('tone');
    expect(result).toContain('1. "The weather was surprisingly cold."');
    expect(result).toContain('2. "I grabbed my coat and headed out."');
    expect(result).toContain('3. "Nobody seemed to notice the change."');
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
    expect(result).toContain('sentence structure');
    expect(result).toContain('vocabulary');
    expect(result).toContain('tone');
    expect(result).toContain('Rewrite to sound like this specific author');
  });

  it('truncation ends on a complete sentence boundary, not mid-sentence', () => {
    const longSentences = Array.from({ length: 50 }, (_, i) =>
      `This is sentence number ${i + 1} written to be a moderately long example of human writing style with natural phrasing.`
    );
    const result = buildFewShotContextBlock(longSentences);
    expect(result.length).toBeLessThanOrEqual(MAX_FEWSHOT_CONTEXT_LENGTH);
    expect(result.trimEnd()).toMatch(/"\s*\nRewrite to sound like this specific author/s);
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
    expect(prompt).toContain("The following sentences are examples of this author's writing.");
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
    expect(multiPrompt).toContain("The following sentences are examples of this author's writing.");
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

describe('generateAlternativeSuggestions Pass2 skip with few-shot', () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockCompleteMulti.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does NOT call adapter.complete (Pass2) when fewShotExamples are provided', async () => {
    mockCompleteMulti.mockResolvedValueOnce({
      content: JSON.stringify({
        alternatives: [
          { rewrite: 'Alt one.', explanation: 'e1' },
          { rewrite: 'Alt two.', explanation: 'e2' },
          { rewrite: 'Alt three.', explanation: 'e3' },
        ],
      }),
    });

    const result = await generateAlternativeSuggestions(
      'api-key',
      'Test sentence.',
      0,
      0.9,
      undefined,
      'openai',
      ['Example one.', 'Example two.'],
    );

    expect(mockComplete).not.toHaveBeenCalled();
    expect(result).toHaveLength(3);
    expect(result?.[0].rewrite).toBe('Alt one.');
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
