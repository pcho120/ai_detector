import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  generateAlternativeSuggestions,
  generateSingleSuggestionWithProvider,
  getMultiSystemPrompt,
  getSystemPrompt,
} from '../llm';

const ORIGINAL_SYSTEM_PROMPT = `You are a writing assistant that rewrites sentences to sound like they were written by a real person, not an AI.

Respond with ONLY valid JSON in this exact shape:
{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence explaining the change>"}

Rules:
- rewrite must be a complete, grammatically correct replacement sentence.
- Make the tone slightly informal but still appropriate for academic context.
- Break any repetitive or predictable patterns from the original.
- Avoid generic or vague wording — prefer specific, concrete language.
- Add subtle variation in sentence length and flow.
- Keep the core meaning intact.
- Do NOT mention AI detection, evasion, or scores.
- explanation must be one sentence, <= 120 characters.`;

const STYLE_SYSTEM_PROMPT_TEXT = `You are an expert writing coach specializing in individual authorship style adaptation.

Respond with ONLY valid JSON in this exact shape:
{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence explaining the change>"}

Rules:
- rewrite must be a complete, grammatically correct replacement sentence.
- Your PRIMARY goal is to make the rewrite sound like the specific author whose examples are provided.
- Match the author's vocabulary level, sentence rhythm, and characteristic patterns — not generic informal writing.
- When style examples are provided, prioritize style fidelity over generic humanization.
- Preserve the core meaning while adopting the author's voice.
- Do NOT mention AI detection, evasion, or scores.
- explanation must be one sentence, <= 120 characters.`;

const ORIGINAL_MULTI_SYSTEM_PROMPT = `You are a writing assistant that rewrites sentences to sound like they were written by a real person, not an AI.

Respond with ONLY valid JSON in this exact shape:
{"alternatives":[{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"},{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"},{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"}]}

Rules:
- Each rewrite must be a complete, grammatically correct replacement sentence.
- Produce exactly 3 alternatives, each with noticeably different phrasing and sentence shape.
- Make the tone slightly informal but still appropriate for academic context.
- Break repetitive or predictable patterns — vary structure across all 3 alternatives.
- Avoid generic or vague wording — use specific, concrete language.
- Add subtle variation in sentence length and flow within each rewrite.
- Use a slightly conversational style — not stiff or overly formal.
- Keep the meaning but make it feel less "perfect" and more human.
- Do NOT mention AI detection, evasion, or scores.
- Each explanation must be one sentence, <= 120 characters.`;

const STYLE_MULTI_SYSTEM_PROMPT_TEXT = `You are an expert writing coach specializing in individual authorship style adaptation.

Respond with ONLY valid JSON in this exact shape:
{"alternatives":[{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"},{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"},{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"}]}

Rules:
- Each rewrite must be a complete, grammatically correct replacement sentence.
- Produce exactly 3 alternatives, each with noticeably different phrasing and sentence shape.
- Your PRIMARY goal is to make each rewrite sound like the specific author whose examples are provided.
- Match the author's vocabulary level, sentence rhythm, and characteristic patterns.
- When style examples are provided, prioritize style fidelity over generic humanization.
- Keep the meaning but make it feel like this specific person wrote it.
- Do NOT mention AI detection, evasion, or scores.
- Each explanation must be one sentence, <= 120 characters.`;

describe('system prompt selectors', () => {
  it('getSystemPrompt(false) returns the original system prompt', () => {
    expect(getSystemPrompt(false)).toBe(ORIGINAL_SYSTEM_PROMPT);
  });

  it('getSystemPrompt(true) returns the style-aware system prompt', () => {
    expect(getSystemPrompt(true)).toBe(STYLE_SYSTEM_PROMPT_TEXT);
  });

  it('getMultiSystemPrompt(false) returns the original multi system prompt', () => {
    expect(getMultiSystemPrompt(false)).toBe(ORIGINAL_MULTI_SYSTEM_PROMPT);
  });

  it('getMultiSystemPrompt(true) returns the style-aware multi system prompt', () => {
    expect(getMultiSystemPrompt(true)).toBe(STYLE_MULTI_SYSTEM_PROMPT_TEXT);
  });
});

describe('generateSingleSuggestionWithProvider', () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockCompleteMulti.mockReset();
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

  it('calls adapter.complete exactly twice when fewShotExamples are provided', async () => {
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
      ['Example one.', 'Example two.'],
    );

    expect(mockComplete).toHaveBeenCalledTimes(2);
    expect(result?.rewrite).toBe('Pass two result.');
    expect(mockComplete.mock.calls[1]?.[0].topP).toBe(0.9);
  });

  it('Pass2 uses style-aware system prompt when fewShotExamples are provided', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass one result.', explanation: 'first pass' }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass two result.', explanation: 'second pass' }),
      });

    await generateSingleSuggestionWithProvider(
      'api-key',
      'Original sentence.',
      0,
      0.9,
      'openai',
      undefined,
      ['Example one.', 'Example two.'],
    );

    expect(mockComplete.mock.calls[1]?.[0].systemPrompt).toBe(getSystemPrompt(true));
  });

  it('Pass2 includes fewShotExamples in the user prompt when provided', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass one result.', explanation: 'first pass' }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass two result.', explanation: 'second pass' }),
      });

    await generateSingleSuggestionWithProvider(
      'api-key',
      'Original sentence.',
      0,
      0.9,
      'openai',
      undefined,
      ['Example one.', 'Example two.'],
    );

    expect(mockComplete.mock.calls[1]?.[0].userPrompt).toContain('Example one.');
    expect(mockComplete.mock.calls[1]?.[0].userPrompt).toContain('Example two.');
    expect(mockComplete.mock.calls[1]?.[0].userPrompt).toContain('Pass one result.');
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

  it('uses the original system prompt when fewShotExamples are not provided', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass one result.', explanation: 'first pass' }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass two result.', explanation: 'second pass' }),
      });

    await generateSingleSuggestionWithProvider('api-key', 'Original sentence.', 0, 0.9, 'openai');

    expect(mockComplete.mock.calls[0]?.[0].systemPrompt).toBe(ORIGINAL_SYSTEM_PROMPT);
    expect(mockComplete.mock.calls[1]?.[0].systemPrompt).toBe(ORIGINAL_SYSTEM_PROMPT);
  });
});

describe('generateAlternativeSuggestions system prompts', () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockCompleteMulti.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses the style-aware multi system prompt when fewShotExamples are provided', async () => {
    mockCompleteMulti.mockResolvedValueOnce({
      content: JSON.stringify({
        alternatives: [
          { rewrite: 'Alt one.', explanation: 'e1' },
          { rewrite: 'Alt two.', explanation: 'e2' },
          { rewrite: 'Alt three.', explanation: 'e3' },
        ],
      }),
    });

    await generateAlternativeSuggestions(
      'api-key',
      'Original sentence.',
      0,
      0.9,
      undefined,
      'openai',
      ['Example one.', 'Example two.'],
    );

    expect(mockCompleteMulti).toHaveBeenCalledTimes(1);
    expect(mockCompleteMulti.mock.calls[0]?.[0].systemPrompt).toBe(STYLE_MULTI_SYSTEM_PROMPT_TEXT);
  });

  it('runs Pass2 refinement for generated alternatives when fewShotExamples are provided', async () => {
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
      'Original sentence.',
      0,
      0.9,
      undefined,
      'openai',
      ['Example one.', 'Example two.'],
    );

    expect(mockComplete).toHaveBeenCalledTimes(3);
    expect(mockComplete.mock.calls[0]?.[0].systemPrompt).toBe(getSystemPrompt(true));
    expect(mockComplete.mock.calls[0]?.[0].userPrompt).toContain('Example one.');
    expect(mockComplete.mock.calls[0]?.[0].topP).toBe(0.9);
    expect(result?.map((entry) => entry.rewrite)).toEqual(['Refined one.', 'Refined two.', 'Refined three.']);
  });

  it('uses the original multi system prompt when fewShotExamples are not provided', async () => {
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

    await generateAlternativeSuggestions('api-key', 'Original sentence.', 0, 0.9, undefined, 'openai');

    expect(mockCompleteMulti.mock.calls[0]?.[0].systemPrompt).toBe(ORIGINAL_MULTI_SYSTEM_PROMPT);
  });
});

describe('score-aware prompts', () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockCompleteMulti.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should include detection score in user prompt when score is provided', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass one.', explanation: 'first' }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass two.', explanation: 'second' }),
      });

    await generateSingleSuggestionWithProvider('api-key', 'Original sentence.', 0, 0.85, 'openai');

    const pass1Prompt = mockComplete.mock.calls[0]?.[0].userPrompt as string;
    expect(pass1Prompt).toContain('85% likely AI-generated');
    expect(pass1Prompt).toContain('making it sound distinctly human');

    // Pass 2 should NOT contain score context
    const pass2Prompt = mockComplete.mock.calls[1]?.[0].userPrompt as string;
    expect(pass2Prompt).not.toContain('likely AI-generated');
  });

  it('should not include score context when score is 0', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass one.', explanation: 'first' }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass two.', explanation: 'second' }),
      });

    await generateSingleSuggestionWithProvider('api-key', 'Original sentence.', 0, 0, 'openai');

    const pass1Prompt = mockComplete.mock.calls[0]?.[0].userPrompt as string;
    expect(pass1Prompt).not.toContain('likely AI-generated');
  });

  it('should not include score context when score is very low (below threshold)', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass one.', explanation: 'first' }),
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'Pass two.', explanation: 'second' }),
      });

    await generateSingleSuggestionWithProvider('api-key', 'Original sentence.', 0, 0, 'openai');

    const pass1Prompt = mockComplete.mock.calls[0]?.[0].userPrompt as string;
    expect(pass1Prompt).not.toContain('0% likely');
    expect(pass1Prompt).not.toContain('likely AI-generated');
  });
});

describe('parseRewritePayload handling through single suggestion flow', () => {
  beforeEach(() => {
    mockComplete.mockReset();
    mockCompleteMulti.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('extracts JSON when chain-of-thought text appears before the payload', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: 'Style analysis: vocabulary is formal.\n\n{"rewrite":"test","explanation":"test"}',
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'second pass', explanation: 'second pass' }),
      });

    const result = await generateSingleSuggestionWithProvider('api-key', 'Original sentence.', 0, 0.9, 'openai');

    expect(result?.explanation).toBe('test');
  });

  it('still handles plain JSON payloads', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: '{"rewrite":"test","explanation":"test"}',
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'second pass', explanation: 'second pass' }),
      });

    const result = await generateSingleSuggestionWithProvider('api-key', 'Original sentence.', 0, 0.9, 'openai');

    expect(result?.explanation).toBe('test');
  });

  it('still handles fenced JSON payloads', async () => {
    mockComplete
      .mockResolvedValueOnce({
        content: '```json\n{"rewrite":"test","explanation":"test"}\n```',
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ rewrite: 'second pass', explanation: 'second pass' }),
      });

    const result = await generateSingleSuggestionWithProvider('api-key', 'Original sentence.', 0, 0.9, 'openai');

    expect(result?.explanation).toBe('test');
  });
});
