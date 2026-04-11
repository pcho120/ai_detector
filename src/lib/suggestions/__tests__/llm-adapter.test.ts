import { describe, it, expect, beforeEach, vi } from 'vitest';
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

// ── Factory branch selection ──────────────────────────────────────────────────

describe('createLlmAdapter – factory branch selection', () => {
  it('returns OpenAiLlmAdapter with undefined apiKey when called with no args', () => {
    const adapter = createLlmAdapter();

    expect(adapter).toBeInstanceOf(OpenAiLlmAdapter);
  });

  it('returns OpenAiLlmAdapter when provider is "openai"', () => {
    const adapter = createLlmAdapter('test-key', 'openai');

    expect(adapter).toBeInstanceOf(OpenAiLlmAdapter);
  });

  it('returns OpenAiLlmAdapter when provider is "OPENAI" (uppercase normalized)', () => {
    const adapter = createLlmAdapter('test-key', 'OPENAI');

    expect(adapter).toBeInstanceOf(OpenAiLlmAdapter);
  });

  it('returns ClaudeLlmAdapter when provider is "anthropic"', () => {
    const adapter = createLlmAdapter('test-key', 'anthropic');

    expect(adapter).toBeInstanceOf(ClaudeLlmAdapter);
  });

  it('throws FileProcessingError with DETECTION_FAILED code for unknown provider', () => {
    expect(() => createLlmAdapter(undefined, 'bogus')).toThrow(FileProcessingError);

    try {
      createLlmAdapter(undefined, 'bogus');
    } catch (err) {
      expect(err).toBeInstanceOf(FileProcessingError);
      expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
    }
  });

  it('error message for unknown provider contains provider name', () => {
    expect(() => createLlmAdapter(undefined, 'bogus')).toThrowError(/bogus/);
  });

  it('accepts an explicit apiKey argument and forwards it to the adapter', () => {
    // Provider unset → openai; explicit key passed
    const adapter = createLlmAdapter('explicit-key');

    expect(adapter).toBeInstanceOf(OpenAiLlmAdapter);
  });

  it('defaults provider to openai when no provider argument is given', () => {
    const adapter = createLlmAdapter('test-key');

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

  it('complete() passes only top_p (no temperature) when topP is provided', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Result.' }],
    });

    const adapter = new ClaudeLlmAdapter('test-api-key');
    await adapter.complete({
      systemPrompt: 'System',
      userPrompt: 'User',
      temperature: 0.7,
      maxTokens: 256,
      topP: 0.9,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ top_p: 0.9 })
    );
    const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('temperature');
  });

  it('complete() passes only temperature (no top_p) when topP is not provided', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Result.' }],
    });

    const adapter = new ClaudeLlmAdapter('test-api-key');
    await adapter.complete({
      systemPrompt: 'System',
      userPrompt: 'User',
      temperature: 0.7,
      maxTokens: 256,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: 0.7 })
    );
    const callArgs = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty('top_p');
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
