import { describe, it, expect, vi } from 'vitest';
import { CompositeDetectionAdapter } from '../composite';
import { FileProcessingError } from '@/lib/files/errors';
import type { DetectionAdapter, DetectionResult } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAdapter(result: DetectionResult): DetectionAdapter {
  return {
    detect: vi.fn().mockResolvedValue(result),
  };
}

const SAPLING_RESULT: DetectionResult = {
  score: 0.3,
  sentences: [
    { sentence: 'Hello world.', score: 0.2 },
    { sentence: 'This is AI text.', score: 0.9 },
  ],
};

const COPYLEAKS_RESULT: DetectionResult = {
  score: 0.75,
  sentences: [
    { sentence: 'Hello world.', score: 1.0 },
  ],
};

// ── Both providers present ────────────────────────────────────────────────────

describe('CompositeDetectionAdapter – both providers present', () => {
  it('uses Copyleaks score as the overall score', async () => {
    const sapling = makeAdapter(SAPLING_RESULT);
    const copyleaks = makeAdapter(COPYLEAKS_RESULT);

    const adapter = new CompositeDetectionAdapter({ sapling, copyleaks });
    const result = await adapter.detect('Hello world. This is AI text.');

    expect(result.score).toBe(COPYLEAKS_RESULT.score);
  });

  it('uses Sapling sentences as the per-sentence breakdown', async () => {
    const sapling = makeAdapter(SAPLING_RESULT);
    const copyleaks = makeAdapter(COPYLEAKS_RESULT);

    const adapter = new CompositeDetectionAdapter({ sapling, copyleaks });
    const result = await adapter.detect('Hello world. This is AI text.');

    expect(result.sentences).toStrictEqual(SAPLING_RESULT.sentences);
  });

  it('calls both adapters exactly once', async () => {
    const sapling = makeAdapter(SAPLING_RESULT);
    const copyleaks = makeAdapter(COPYLEAKS_RESULT);

    const adapter = new CompositeDetectionAdapter({ sapling, copyleaks });
    await adapter.detect('some text');

    expect(sapling.detect).toHaveBeenCalledTimes(1);
    expect(copyleaks.detect).toHaveBeenCalledTimes(1);
  });

  it('passes the same text to both adapters', async () => {
    const sapling = makeAdapter(SAPLING_RESULT);
    const copyleaks = makeAdapter(COPYLEAKS_RESULT);

    const adapter = new CompositeDetectionAdapter({ sapling, copyleaks });
    const text = 'Check that both adapters receive this text.';
    await adapter.detect(text);

    expect(sapling.detect).toHaveBeenCalledWith(text);
    expect(copyleaks.detect).toHaveBeenCalledWith(text);
  });

  it('propagates rejection if sapling throws', async () => {
    const err = new FileProcessingError('DETECTION_FAILED', 'Sapling failed');
    const sapling: DetectionAdapter = { detect: vi.fn().mockRejectedValue(err) };
    const copyleaks = makeAdapter(COPYLEAKS_RESULT);

    const adapter = new CompositeDetectionAdapter({ sapling, copyleaks });

    await expect(adapter.detect('text')).rejects.toBeInstanceOf(FileProcessingError);
  });

  it('propagates rejection if copyleaks throws', async () => {
    const err = new FileProcessingError('DETECTION_FAILED', 'Copyleaks failed');
    const sapling = makeAdapter(SAPLING_RESULT);
    const copyleaks: DetectionAdapter = { detect: vi.fn().mockRejectedValue(err) };

    const adapter = new CompositeDetectionAdapter({ sapling, copyleaks });

    await expect(adapter.detect('text')).rejects.toBeInstanceOf(FileProcessingError);
  });
});

// ── Sapling only ──────────────────────────────────────────────────────────────

describe('CompositeDetectionAdapter – sapling only', () => {
  it('delegates to sapling and returns its result unchanged', async () => {
    const sapling = makeAdapter(SAPLING_RESULT);
    const adapter = new CompositeDetectionAdapter({ sapling });

    const result = await adapter.detect('some text');

    expect(result).toStrictEqual(SAPLING_RESULT);
  });

  it('calls sapling.detect exactly once', async () => {
    const sapling = makeAdapter(SAPLING_RESULT);
    const adapter = new CompositeDetectionAdapter({ sapling });

    await adapter.detect('some text');

    expect(sapling.detect).toHaveBeenCalledTimes(1);
  });
});

// ── Copyleaks only ────────────────────────────────────────────────────────────

describe('CompositeDetectionAdapter – copyleaks only', () => {
  it('delegates to copyleaks and returns its result unchanged', async () => {
    const copyleaks = makeAdapter(COPYLEAKS_RESULT);
    const adapter = new CompositeDetectionAdapter({ copyleaks });

    const result = await adapter.detect('some text');

    expect(result).toStrictEqual(COPYLEAKS_RESULT);
  });

  it('calls copyleaks.detect exactly once', async () => {
    const copyleaks = makeAdapter(COPYLEAKS_RESULT);
    const adapter = new CompositeDetectionAdapter({ copyleaks });

    await adapter.detect('some text');

    expect(copyleaks.detect).toHaveBeenCalledTimes(1);
  });
});

// ── No providers ──────────────────────────────────────────────────────────────

describe('CompositeDetectionAdapter – no providers', () => {
  it('throws FileProcessingError when no adapters provided', async () => {
    const adapter = new CompositeDetectionAdapter({});

    await expect(adapter.detect('some text')).rejects.toBeInstanceOf(FileProcessingError);
  });

  it('thrown error has DETECTION_FAILED code', async () => {
    const adapter = new CompositeDetectionAdapter({});

    try {
      await adapter.detect('some text');
    } catch (err) {
      expect(err).toBeInstanceOf(FileProcessingError);
      expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
    }
  });

  it('error message mentions provider configuration', async () => {
    const adapter = new CompositeDetectionAdapter({});

    await expect(adapter.detect('some text')).rejects.toMatchObject({
      message: expect.stringMatching(/No detection provider configured/),
    });
  });
});
