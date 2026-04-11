import { describe, it, expect } from 'vitest';
import { createAnalysisDetectionAdapter } from '@/lib/analysis/analyzeText';
import { FileProcessingError } from '@/lib/files/errors';
import { SaplingDetectionAdapter } from '@/lib/detection/sapling';
import { WinstonDetectionAdapter } from '@/lib/detection/adapters/winston';
import { OriginalityDetectionAdapter } from '@/lib/detection/adapters/originality';
import { GPTZeroDetectionAdapter } from '@/lib/detection/adapters/gptzero';
import { CompositeDetectionAdapter } from '@/lib/detection/composite';

// ── Factory branch selection ──────────────────────────────────────────────────

describe('createAnalysisDetectionAdapter – factory branch selection', () => {
  it('returns SaplingDetectionAdapter when provider is unset and apiKey is provided', () => {
    const adapter = createAnalysisDetectionAdapter({ apiKey: 'test-key' });

    expect(adapter).toBeInstanceOf(SaplingDetectionAdapter);
  });

  it('returns SaplingDetectionAdapter when provider=sapling', () => {
    const adapter = createAnalysisDetectionAdapter({ provider: 'sapling', apiKey: 'test-key' });

    expect(adapter).toBeInstanceOf(SaplingDetectionAdapter);
  });

  it('throws "not yet implemented" for stub provider winston', () => {
    expect(() => createAnalysisDetectionAdapter({ provider: 'winston', apiKey: 'test-key' })).toThrow(FileProcessingError);
    expect(() => createAnalysisDetectionAdapter({ provider: 'winston', apiKey: 'test-key' })).toThrowError(
      /not yet implemented/,
    );
  });

  it('throws "not yet implemented" for stub provider originality', () => {
    expect(() => createAnalysisDetectionAdapter({ provider: 'originality', apiKey: 'test-key' })).toThrow(FileProcessingError);
    expect(() => createAnalysisDetectionAdapter({ provider: 'originality', apiKey: 'test-key' })).toThrowError(
      /not yet implemented/,
    );
  });

  it('throws "not yet implemented" for stub provider gptzero', () => {
    expect(() => createAnalysisDetectionAdapter({ provider: 'gptzero', apiKey: 'test-key' })).toThrow(FileProcessingError);
    expect(() => createAnalysisDetectionAdapter({ provider: 'gptzero', apiKey: 'test-key' })).toThrowError(
      /not yet implemented/,
    );
  });

  it('throws FileProcessingError with DETECTION_FAILED code for unknown provider', () => {
    expect(() => createAnalysisDetectionAdapter({ provider: 'bogus' })).toThrow(FileProcessingError);

    try {
      createAnalysisDetectionAdapter({ provider: 'bogus' });
    } catch (err) {
      expect(err).toBeInstanceOf(FileProcessingError);
      expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
    }
  });

  it('error message for unknown provider contains provider name', () => {
    expect(() => createAnalysisDetectionAdapter({ provider: 'bogus' })).toThrowError(/bogus/);
  });
});

// ── No config → throws (detection not configured) ─────────────────────────────

describe('createAnalysisDetectionAdapter – no config throws', () => {
  it('throws FileProcessingError when called with no config at all', () => {
    expect(() => createAnalysisDetectionAdapter()).toThrow(FileProcessingError);
  });

  it('thrown error has code DETECTION_FAILED', () => {
    try {
      createAnalysisDetectionAdapter();
    } catch (err) {
      expect(err).toBeInstanceOf(FileProcessingError);
      expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
    }
  });

  it('thrown error message is "Detection service is not configured."', () => {
    expect(() => createAnalysisDetectionAdapter()).toThrowError(
      'Detection service is not configured.',
    );
  });
});

// ── Missing key error message (load-bearing) ──────────────────────────────────

describe('createAnalysisDetectionAdapter – missing API key throws exact message', () => {
  it('sapling: throws with exact message "Detection service is not configured."', () => {
    expect(() => createAnalysisDetectionAdapter({ provider: 'sapling' })).toThrowError(
      'Detection service is not configured.',
    );
  });

  it('sapling: thrown error is FileProcessingError with DETECTION_FAILED', () => {
    try {
      createAnalysisDetectionAdapter({ provider: 'sapling' });
    } catch (err) {
      expect(err).toBeInstanceOf(FileProcessingError);
      expect((err as FileProcessingError).code).toBe('DETECTION_FAILED');
      expect((err as FileProcessingError).message).toBe('Detection service is not configured.');
    }
  });

  it('winston: throws "not yet implemented" (stub provider, before API key check)', () => {
    expect(() => createAnalysisDetectionAdapter({ provider: 'winston' })).toThrowError(
      /not yet implemented/,
    );
  });

  it('originality: throws "not yet implemented" (stub provider, before API key check)', () => {
    expect(() => createAnalysisDetectionAdapter({ provider: 'originality' })).toThrowError(
      /not yet implemented/,
    );
  });

  it('gptzero: throws "not yet implemented" (stub provider, before API key check)', () => {
    expect(() => createAnalysisDetectionAdapter({ provider: 'gptzero' })).toThrowError(
      /not yet implemented/,
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

// ── Factory: Copyleaks composite selection ────────────────────────────────────

describe('createAnalysisDetectionAdapter – composite adapter selection with Copyleaks', () => {
  it('returns CompositeDetectionAdapter when sapling + copyleaks credentials are present', () => {
    const adapter = createAnalysisDetectionAdapter({
      provider: 'sapling',
      apiKey: 'sapling-key',
      copyleaksEmail: 'user@example.com',
      copyleaksApiKey: 'copyleaks-key',
    });

    expect(adapter).toBeInstanceOf(CompositeDetectionAdapter);
  });

  it('returns SaplingDetectionAdapter (not composite) when sapling key present but no copyleaks', () => {
    const adapter = createAnalysisDetectionAdapter({
      provider: 'sapling',
      apiKey: 'sapling-key',
    });

    expect(adapter).toBeInstanceOf(SaplingDetectionAdapter);
  });

  it('passes copyleaksEmail and copyleaksApiKey from config to build composite', () => {
    const adapter = createAnalysisDetectionAdapter({
      provider: 'sapling',
      apiKey: 'sapling-key',
      copyleaksEmail: 'user@example.com',
      copyleaksApiKey: 'copyleaks-key',
    });

    expect(adapter).toBeInstanceOf(CompositeDetectionAdapter);
  });

  it('returns SaplingDetectionAdapter when only copyleaksEmail provided (no apiKey)', () => {
    const adapter = createAnalysisDetectionAdapter({
      provider: 'sapling',
      apiKey: 'sapling-key',
      copyleaksEmail: 'user@example.com',
    });

    expect(adapter).toBeInstanceOf(SaplingDetectionAdapter);
  });

  it('returns SaplingDetectionAdapter when only copyleaksApiKey provided (no email)', () => {
    const adapter = createAnalysisDetectionAdapter({
      provider: 'sapling',
      apiKey: 'sapling-key',
      copyleaksApiKey: 'copyleaks-key',
    });

    expect(adapter).toBeInstanceOf(SaplingDetectionAdapter);
  });

  it('returns CompositeDetectionAdapter when only copyleaks credentials present (no sapling key)', () => {
    const adapter = createAnalysisDetectionAdapter({
      provider: 'sapling',
      copyleaksEmail: 'user@example.com',
      copyleaksApiKey: 'copyleaks-key',
    });

    expect(adapter).toBeInstanceOf(CompositeDetectionAdapter);
  });

  it('copyleaks-only: returns adapter via config without any env vars', () => {
    const adapter = createAnalysisDetectionAdapter({
      provider: 'sapling',
      copyleaksEmail: 'user@example.com',
      copyleaksApiKey: 'copyleaks-key',
    });

    expect(adapter).toBeInstanceOf(CompositeDetectionAdapter);
  });

  it('throws when neither sapling nor copyleaks credentials are present', () => {
    expect(() => createAnalysisDetectionAdapter({ provider: 'sapling' })).toThrow(FileProcessingError);
  });
});
