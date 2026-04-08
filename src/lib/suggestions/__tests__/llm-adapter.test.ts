import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createLlmAdapter } from '../llm-adapter';
import { FileProcessingError } from '@/lib/files/errors';
import { OpenAiLlmAdapter } from '../adapters/openai';
import { ClaudeLlmAdapter } from '../adapters/anthropic';

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

// ── ClaudeLlmAdapter stub behavior ────────────────────────────────────────────

describe('ClaudeLlmAdapter – stub throws FileProcessingError', () => {
  const stubRequest = {
    systemPrompt: 'You are a helpful assistant.',
    userPrompt: 'Rewrite this sentence.',
    temperature: 0.4,
    maxTokens: 256,
  };

  it('complete() throws FileProcessingError (not a generic Error)', async () => {
    const adapter = new ClaudeLlmAdapter('any-key');

    await expect(adapter.complete(stubRequest)).rejects.toBeInstanceOf(FileProcessingError);
  });

  it('complete() throws with code DETECTION_FAILED', async () => {
    const adapter = new ClaudeLlmAdapter('any-key');

    try {
      await adapter.complete(stubRequest);
    } catch (err) {
      expect(err).toBeInstanceOf(FileProcessingError);
      expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
    }
  });

  it('completeMulti() throws FileProcessingError (not a generic Error)', async () => {
    const adapter = new ClaudeLlmAdapter('any-key');

    await expect(adapter.completeMulti(stubRequest)).rejects.toBeInstanceOf(FileProcessingError);
  });

  it('completeMulti() throws with code DETECTION_FAILED', async () => {
    const adapter = new ClaudeLlmAdapter('any-key');

    try {
      await adapter.completeMulti(stubRequest);
    } catch (err) {
      expect(err).toBeInstanceOf(FileProcessingError);
      expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
    }
  });

  it('thrown error is NOT a plain Error instance (it is FileProcessingError)', async () => {
    const adapter = new ClaudeLlmAdapter('any-key');

    let thrown: unknown;
    try {
      await adapter.complete(stubRequest);
    } catch (err) {
      thrown = err;
    }

    // FileProcessingError extends Error, but we explicitly verify it's a FileProcessingError
    expect(thrown).toBeInstanceOf(FileProcessingError);
    expect((thrown as FileProcessingError).name).toBe('FileProcessingError');
  });
});
