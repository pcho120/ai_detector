import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createAnalysisDetectionAdapter } from '@/lib/analysis/analyzeText';
import { FileProcessingError } from '@/lib/files/errors';
import { SaplingDetectionAdapter } from '@/lib/detection/sapling';
import { WinstonDetectionAdapter } from '@/lib/detection/adapters/winston';
import { OriginalityDetectionAdapter } from '@/lib/detection/adapters/originality';
import { GPTZeroDetectionAdapter } from '@/lib/detection/adapters/gptzero';

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

const ENV_KEYS = [
  'DETECTION_PROVIDER',
  'SAPLING_API_KEY',
  'WINSTON_API_KEY',
  'ORIGINALITY_API_KEY',
  'GPTZERO_API_KEY',
];

// ── Factory branch selection ──────────────────────────────────────────────────

describe('createAnalysisDetectionAdapter – factory branch selection', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveEnv(ENV_KEYS);
    for (const k of ENV_KEYS) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    restoreEnv(saved);
  });

  it('returns SaplingDetectionAdapter when provider is unset and SAPLING_API_KEY is set', () => {
    process.env.SAPLING_API_KEY = 'test-key';

    const adapter = createAnalysisDetectionAdapter();

    expect(adapter).toBeInstanceOf(SaplingDetectionAdapter);
  });

  it('returns SaplingDetectionAdapter when DETECTION_PROVIDER=sapling', () => {
    process.env.DETECTION_PROVIDER = 'sapling';
    process.env.SAPLING_API_KEY = 'test-key';

    const adapter = createAnalysisDetectionAdapter();

    expect(adapter).toBeInstanceOf(SaplingDetectionAdapter);
  });

  it('returns WinstonDetectionAdapter when DETECTION_PROVIDER=winston', () => {
    process.env.DETECTION_PROVIDER = 'winston';
    process.env.WINSTON_API_KEY = 'test-key';

    const adapter = createAnalysisDetectionAdapter();

    expect(adapter).toBeInstanceOf(WinstonDetectionAdapter);
  });

  it('returns OriginalityDetectionAdapter when DETECTION_PROVIDER=originality', () => {
    process.env.DETECTION_PROVIDER = 'originality';
    process.env.ORIGINALITY_API_KEY = 'test-key';

    const adapter = createAnalysisDetectionAdapter();

    expect(adapter).toBeInstanceOf(OriginalityDetectionAdapter);
  });

  it('returns GPTZeroDetectionAdapter when DETECTION_PROVIDER=gptzero', () => {
    process.env.DETECTION_PROVIDER = 'gptzero';
    process.env.GPTZERO_API_KEY = 'test-key';

    const adapter = createAnalysisDetectionAdapter();

    expect(adapter).toBeInstanceOf(GPTZeroDetectionAdapter);
  });

  it('throws FileProcessingError with DETECTION_FAILED code for unknown provider', () => {
    process.env.DETECTION_PROVIDER = 'bogus';

    expect(() => createAnalysisDetectionAdapter()).toThrow(FileProcessingError);

    try {
      createAnalysisDetectionAdapter();
    } catch (err) {
      expect(err).toBeInstanceOf(FileProcessingError);
      expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
    }
  });

  it('error message for unknown provider contains provider name', () => {
    process.env.DETECTION_PROVIDER = 'bogus';

    expect(() => createAnalysisDetectionAdapter()).toThrowError(/bogus/);
  });
});

// ── Missing key error message (load-bearing) ──────────────────────────────────

describe('createAnalysisDetectionAdapter – missing API key throws exact message', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = saveEnv(ENV_KEYS);
    for (const k of ENV_KEYS) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    restoreEnv(saved);
  });

  it('sapling: throws with exact message "Detection service is not configured."', () => {
    process.env.DETECTION_PROVIDER = 'sapling';
    // SAPLING_API_KEY intentionally absent

    expect(() => createAnalysisDetectionAdapter()).toThrowError(
      'Detection service is not configured.',
    );
  });

  it('sapling: thrown error is FileProcessingError with DETECTION_FAILED', () => {
    process.env.DETECTION_PROVIDER = 'sapling';

    try {
      createAnalysisDetectionAdapter();
    } catch (err) {
      expect(err).toBeInstanceOf(FileProcessingError);
      expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
      expect((err as FileProcessingError).message).toBe('Detection service is not configured.');
    }
  });

  it('winston: throws with exact message "Detection service is not configured."', () => {
    process.env.DETECTION_PROVIDER = 'winston';
    // WINSTON_API_KEY intentionally absent

    expect(() => createAnalysisDetectionAdapter()).toThrowError(
      'Detection service is not configured.',
    );
  });

  it('originality: throws with exact message "Detection service is not configured."', () => {
    process.env.DETECTION_PROVIDER = 'originality';
    // ORIGINALITY_API_KEY intentionally absent

    expect(() => createAnalysisDetectionAdapter()).toThrowError(
      'Detection service is not configured.',
    );
  });

  it('gptzero: throws with exact message "Detection service is not configured."', () => {
    process.env.DETECTION_PROVIDER = 'gptzero';
    // GPTZERO_API_KEY intentionally absent

    expect(() => createAnalysisDetectionAdapter()).toThrowError(
      'Detection service is not configured.',
    );
  });
});

// ── Stub adapter detect() throws FileProcessingError ─────────────────────────

describe('WinstonDetectionAdapter – stub throws FileProcessingError', () => {
  it('detect() throws FileProcessingError (not a generic Error)', async () => {
    const adapter = new WinstonDetectionAdapter('any-key');

    await expect(adapter.detect('some text')).rejects.toBeInstanceOf(FileProcessingError);
  });

  it('detect() throws with code DETECTION_FAILED', async () => {
    const adapter = new WinstonDetectionAdapter('any-key');

    try {
      await adapter.detect('some text');
    } catch (err) {
      expect(err).toBeInstanceOf(FileProcessingError);
      expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
    }
  });
});

describe('OriginalityDetectionAdapter – stub throws FileProcessingError', () => {
  it('detect() throws FileProcessingError (not a generic Error)', async () => {
    const adapter = new OriginalityDetectionAdapter('any-key');

    await expect(adapter.detect('some text')).rejects.toBeInstanceOf(FileProcessingError);
  });

  it('detect() throws with code DETECTION_FAILED', async () => {
    const adapter = new OriginalityDetectionAdapter('any-key');

    try {
      await adapter.detect('some text');
    } catch (err) {
      expect(err).toBeInstanceOf(FileProcessingError);
      expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
    }
  });
});

describe('GPTZeroDetectionAdapter – stub throws FileProcessingError', () => {
  it('detect() throws FileProcessingError (not a generic Error)', async () => {
    const adapter = new GPTZeroDetectionAdapter('any-key');

    await expect(adapter.detect('some text')).rejects.toBeInstanceOf(FileProcessingError);
  });

  it('detect() throws with code DETECTION_FAILED', async () => {
    const adapter = new GPTZeroDetectionAdapter('any-key');

    try {
      await adapter.detect('some text');
    } catch (err) {
      expect(err).toBeInstanceOf(FileProcessingError);
      expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
    }
  });
});
