import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SaplingDetectionAdapter, normalizeSaplingResponse } from '@/lib/detection/sapling';
import { FileProcessingError } from '@/lib/files/errors';

const FIXTURES = join(__dirname, '../fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8'));
}

describe('normalizeSaplingResponse - score preservation', () => {
  it('preserves overall score directly (no inversion)', () => {
    const fixture = loadFixture('sapling-success.json') as {
      score: number;
      sentence_scores: { score: number; sentence: string }[];
      text: string;
      tokens: string[];
      token_probs: number[];
    };
    const result = normalizeSaplingResponse(fixture);
    expect(result.score).toBe(fixture.score);
  });

  it('preserves first sentence score directly from fixture', () => {
    const fixture = loadFixture('sapling-success.json') as {
      score: number;
      sentence_scores: { score: number; sentence: string }[];
      text: string;
      tokens: string[];
      token_probs: number[];
    };
    const result = normalizeSaplingResponse(fixture);
    expect(result.sentences[0].score).toBe(fixture.sentence_scores[0].score);
  });

  it('maps all sentence scores from the fixture without transformation', () => {
    const fixture = loadFixture('sapling-success.json') as {
      score: number;
      sentence_scores: { score: number; sentence: string }[];
      text: string;
      tokens: string[];
      token_probs: number[];
    };
    const result = normalizeSaplingResponse(fixture);
    expect(result.sentences).toHaveLength(fixture.sentence_scores.length);
    fixture.sentence_scores.forEach((s, i) => {
      expect(result.sentences[i].score).toBe(s.score);
      expect(result.sentences[i].sentence).toBe(s.sentence);
    });
  });

  it('handles high AI-like fixture — scores near 1', () => {
    const fixture = loadFixture('sapling-ai-like.json') as {
      score: number;
      sentence_scores: { score: number; sentence: string }[];
      text: string;
      tokens: string[];
      token_probs: number[];
    };
    const result = normalizeSaplingResponse(fixture);
    expect(result.score).toBeGreaterThan(0.9);
    result.sentences.forEach((s) => {
      expect(s.score).toBeGreaterThan(0.9);
    });
  });

  it('handles human-like fixture — scores near 0', () => {
    const fixture = loadFixture('sapling-human-like.json') as {
      score: number;
      sentence_scores: { score: number; sentence: string }[];
      text: string;
      tokens: string[];
      token_probs: number[];
    };
    const result = normalizeSaplingResponse(fixture);
    expect(result.score).toBeLessThan(0.1);
    result.sentences.forEach((s) => {
      expect(s.score).toBeLessThan(0.1);
    });
  });

  it('returns empty sentences array when sentence_scores is missing', () => {
    const fixture = { score: 0.5, text: 'test', tokens: [], token_probs: [] } as unknown as {
      score: number;
      sentence_scores: { score: number; sentence: string }[];
      text: string;
      tokens: string[];
      token_probs: number[];
    };
    const result = normalizeSaplingResponse(fixture);
    expect(result.sentences).toEqual([]);
  });
});

describe('SaplingDetectionAdapter - constructor', () => {
  it('throws when constructed with an empty API key', () => {
    expect(() => new SaplingDetectionAdapter('')).toThrow();
  });

  it('constructs successfully with a non-empty API key', () => {
    expect(() => new SaplingDetectionAdapter('test-key-abc')).not.toThrow();
  });
});

describe('SaplingDetectionAdapter.detect - success path', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => loadFixture('sapling-success.json'),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns normalized DetectionResult on HTTP 200', async () => {
    const adapter = new SaplingDetectionAdapter('test-key');
    const result = await adapter.detect('Some text to analyze.');
    expect(result.score).toBeTypeOf('number');
    expect(result.sentences).toBeInstanceOf(Array);
    expect(result.sentences.length).toBeGreaterThan(0);
  });

  it('returns score that matches fixture overall score', async () => {
    const fixture = loadFixture('sapling-success.json') as { score: number };
    const adapter = new SaplingDetectionAdapter('test-key');
    const result = await adapter.detect('Some text to analyze.');
    expect(result.score).toBe(fixture.score);
  });

  it('first sentence score equals fixture sentence_scores[0].score', async () => {
    const fixture = loadFixture('sapling-success.json') as {
      sentence_scores: { score: number; sentence: string }[];
    };
    const adapter = new SaplingDetectionAdapter('test-key');
    const result = await adapter.detect('Some text to analyze.');
    expect(result.sentences[0].score).toBe(fixture.sentence_scores[0].score);
  });

  it('sends sent_scores:true and API key in request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => loadFixture('sapling-success.json'),
    });
    vi.stubGlobal('fetch', mockFetch);

    const adapter = new SaplingDetectionAdapter('my-secret-key');
    await adapter.detect('Hello world.');

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string) as {
      key: string;
      text: string;
      sent_scores: boolean;
    };
    expect(body.key).toBe('my-secret-key');
    expect(body.sent_scores).toBe(true);
    expect(body.text).toBe('Hello world.');
  });
});

describe('SaplingDetectionAdapter.detect - HTTP error paths', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws DETECTION_FAILED on HTTP 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => loadFixture('sapling-error-401.json'),
      }),
    );
    const adapter = new SaplingDetectionAdapter('bad-key');
    await expect(adapter.detect('test')).rejects.toMatchObject({
      code: 'DETECTION_FAILED',
    });
  });

  it('throws FileProcessingError on HTTP 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => loadFixture('sapling-error-401.json'),
      }),
    );
    const adapter = new SaplingDetectionAdapter('bad-key');
    await expect(adapter.detect('test')).rejects.toBeInstanceOf(FileProcessingError);
  });

  it('throws DETECTION_FAILED on HTTP 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => loadFixture('sapling-error-429.json'),
      }),
    );
    const adapter = new SaplingDetectionAdapter('test-key');
    await expect(adapter.detect('test')).rejects.toMatchObject({
      code: 'DETECTION_FAILED',
    });
  });

  it('throws DETECTION_FAILED on HTTP 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ msg: 'Internal Server Error' }),
      }),
    );
    const adapter = new SaplingDetectionAdapter('test-key');
    await expect(adapter.detect('test')).rejects.toMatchObject({
      code: 'DETECTION_FAILED',
    });
  });

  it('does not leak upstream msg directly — error message contains HTTP status only', async () => {
    const sensitiveMsg = 'Internal database connection string: postgres://secret@host/db';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ msg: sensitiveMsg }),
      }),
    );
    const adapter = new SaplingDetectionAdapter('test-key');
    let thrownError: FileProcessingError | undefined;
    try {
      await adapter.detect('test');
    } catch (e) {
      thrownError = e as FileProcessingError;
    }
    expect(thrownError).toBeDefined();
    expect(thrownError!.code).toBe('DETECTION_FAILED');
    expect(thrownError!.message).toContain('500');
    expect(thrownError!.message).not.toContain('postgres://');
  });
});

describe('SaplingDetectionAdapter.detect - network error paths', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws DETECTION_FAILED on AbortError (timeout)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })),
    );
    const adapter = new SaplingDetectionAdapter('test-key');
    const err = await adapter.detect('test').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FileProcessingError);
    expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
    expect((err as FileProcessingError).message).toContain('timed out');
  });

  it('throws DETECTION_FAILED on generic network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const adapter = new SaplingDetectionAdapter('test-key');
    await expect(adapter.detect('test')).rejects.toMatchObject({
      code: 'DETECTION_FAILED',
    });
  });

  it('throws DETECTION_FAILED when response JSON is malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      }),
    );
    const adapter = new SaplingDetectionAdapter('test-key');
    await expect(adapter.detect('test')).rejects.toMatchObject({
      code: 'DETECTION_FAILED',
    });
  });
});
