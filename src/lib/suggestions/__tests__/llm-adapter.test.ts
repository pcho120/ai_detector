import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLlmAdapter } from '../llm-adapter';
import { FileProcessingError } from '@/lib/files/errors';
import { OpenAiLlmAdapter } from '../adapters/openai';
import { ClaudeLlmAdapter } from '../adapters/anthropic';
import Anthropic from '@anthropic-ai/sdk';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: {
      create: mockCreate,
    },
  })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function saveEnv(keys: string[]) {
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) {
    saved[k] = process.env[k];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

const ENV_KEYS = ['LLM_PROVIDER', 'COACHING_LLM_API_KEY'];

// ── Factory branch selection ──────────────────────────────────────────────────

describe('createLlmAdapter – factory branch selection', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveEnv(ENV_KEYS);
    delete process.env.LLM_PROVIDER;
    delete process.env.COACHING_LLM_API_KEY;
  });

  afterEach(() => {
    restoreEnv(saved);
  });

  it('returns OpenAiLlmAdapter when provider is unset and COACHING_LLM_API_KEY is set', () => {
    process.env.COACHING_LLM_API_KEY = 'test-key';

    const adapter = createLlmAdapter();

    expect(adapter).toBeInstanceOf(OpenAiLlmAdapter);
  });

  it('returns OpenAiLlmAdapter when LLM_PROVIDER=openai', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.COACHING_LLM_API_KEY = 'test-key';

    const adapter = createLlmAdapter();

    expect(adapter).toBeInstanceOf(OpenAiLlmAdapter);
  });

  it('returns OpenAiLlmAdapter when LLM_PROVIDER=OPENAI (uppercase normalized)', () => {
    process.env.LLM_PROVIDER = 'OPENAI';
    process.env.COACHING_LLM_API_KEY = 'test-key';

    const adapter = createLlmAdapter();

    expect(adapter).toBeInstanceOf(OpenAiLlmAdapter);
  });

  it('returns ClaudeLlmAdapter when LLM_PROVIDER=anthropic', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    process.env.COACHING_LLM_API_KEY = 'test-key';

    const adapter = createLlmAdapter();

    expect(adapter).toBeInstanceOf(ClaudeLlmAdapter);
  });

  it('throws FileProcessingError with DETECTION_FAILED code for unknown provider', () => {
    process.env.LLM_PROVIDER = 'bogus';

    expect(() => createLlmAdapter()).toThrow(FileProcessingError);

    try {
      createLlmAdapter();
    } catch (err) {
      expect(err).toBeInstanceOf(FileProcessingError);
      expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
    }
  });

  it('error message for unknown provider contains provider name', () => {
    process.env.LLM_PROVIDER = 'bogus';

    expect(() => createLlmAdapter()).toThrowError(/bogus/);
  });

  it('accepts an explicit apiKey argument and forwards it to the adapter', () => {
    // Provider unset → openai; explicit key passed
    const adapter = createLlmAdapter('explicit-key');

    expect(adapter).toBeInstanceOf(OpenAiLlmAdapter);
  });
});

// ── ClaudeLlmAdapter behavior with mocked SDK ─────────────────────────────────

describe('ClaudeLlmAdapter – with mocked Anthropic SDK', () => {
  const testRequest = {
    systemPrompt: 'You are a helpful assistant.',
    userPrompt: 'Rewrite this sentence.',
    temperature: 0.4,
    maxTokens: 256,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('complete() returns { content } for a text block', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Rewritten text.' }],
    });

    const adapter = new ClaudeLlmAdapter('test-api-key');
    const result = await adapter.complete(testRequest);

    expect(result).toEqual({ content: 'Rewritten text.' });
  });

  it('complete() returns null for empty content array', async () => {
    mockCreate.mockResolvedValue({
      content: [],
    });

    const adapter = new ClaudeLlmAdapter('test-api-key');
    const result = await adapter.complete(testRequest);

    expect(result).toBeNull();
  });

  it('complete() returns null for non-text first block', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'image', url: 'https://example.com/image.jpg' }],
    });

    const adapter = new ClaudeLlmAdapter('test-api-key');
    const result = await adapter.complete(testRequest);

    expect(result).toBeNull();
  });

  it('complete() returns null when SDK throws', async () => {
    mockCreate.mockRejectedValue(new Error('API error'));

    const adapter = new ClaudeLlmAdapter('test-api-key');
    const result = await adapter.complete(testRequest);

    expect(result).toBeNull();
  });

  it('completeMulti() delegates through messages.create and results in exactly one SDK call', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Multi result.' }],
    });

    const adapter = new ClaudeLlmAdapter('test-api-key');
    const result = await adapter.completeMulti(testRequest);

    expect(result).toEqual({ content: 'Multi result.' });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('complete() clamps temperature: 1.5 to 1.0 in SDK call arguments', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Clamped response.' }],
    });

    const adapter = new ClaudeLlmAdapter('test-api-key');
    await adapter.complete({
      systemPrompt: 'Test system',
      userPrompt: 'Test user',
      temperature: 1.5,
      maxTokens: 100,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 1.0,
      })
    );
  });

  it('constructor passes the apiKey to the Anthropic SDK', () => {
    new ClaudeLlmAdapter('test-api-key');

    expect(vi.mocked(Anthropic)).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-api-key',
      })
    );
  });
});
