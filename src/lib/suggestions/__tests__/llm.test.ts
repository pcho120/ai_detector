import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockComplete = vi.fn();

vi.mock('../llm-adapter', () => ({
  createLlmAdapter: vi.fn(() => ({
    complete: mockComplete,
  })),
}));

vi.mock('../guardrails', () => ({
  applyGuardrails: vi.fn((suggestions) => suggestions),
}));

import { generateSingleSuggestionWithProvider } from '../llm';

describe('generateSingleSuggestionWithProvider', () => {
  beforeEach(() => {
    mockComplete.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('threads voiceProfile into both rewrite prompts', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass one rewrite.', explanation: 'first pass' }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass two rewrite.', explanation: 'second pass' }),
      });

    const result = await generateSingleSuggestionWithProvider(
      'api-key',
      'Original sentence.',
      0,
      0.9,
      'openai',
      'Direct, concise, and lightly conversational.',
    );

    expect(result?.rewrite).toBe('Pass two rewrite.');
    expect(mockComplete).toHaveBeenCalledTimes(2);
    expect(mockComplete.mock.calls[0]?.[0].userPrompt).toContain('Author voice profile:');
    expect(mockComplete.mock.calls[0]?.[0].userPrompt).toContain('Original sentence.');
    expect(mockComplete.mock.calls[1]?.[0].userPrompt).toContain('Author voice profile:');
    expect(mockComplete.mock.calls[1]?.[0].userPrompt).toContain('Pass one rewrite.');
  });
});

describe('twoPassRewrite call count', () => {
  beforeEach(() => {
    mockComplete.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls adapter.complete exactly once when fewShotExamples are provided', async () => {
    mockComplete.mockResolvedValueOnce({
      content: JSON.stringify({ rewrite: 'Pass one result.', explanation: 'first pass' }),
    });

    const result = await generateSingleSuggestionWithProvider(
      'api-key',
      'Original sentence.',
      0,
      0.9,
      'openai',
      undefined,
      ['Example one.', 'Example two.'],
    );

    expect(mockComplete).toHaveBeenCalledTimes(1);
    expect(result?.rewrite).toBe('Pass one result.');
  });

  it('calls adapter.complete exactly twice when no fewShotExamples (regression)', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass one result.', explanation: 'first pass' }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass two result.', explanation: 'second pass' }),
      });

    const result = await generateSingleSuggestionWithProvider(
      'api-key',
      'Original sentence.',
      0,
      0.9,
      'openai',
      undefined,
    );

    expect(mockComplete).toHaveBeenCalledTimes(2);
    expect(result?.rewrite).toBe('Pass two result.');
  });
});
