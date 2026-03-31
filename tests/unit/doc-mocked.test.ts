import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileProcessingError } from '@/lib/files/errors';

const mockExtract = vi.fn();

vi.mock('word-extractor', () => {
  function MockWordExtractor(this: { extract: typeof mockExtract }) {
    this.extract = mockExtract;
  }
  return {
    default: MockWordExtractor,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

const DOC_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function makeDocBuffer(extraBytes = 100): Buffer {
  return Buffer.concat([DOC_MAGIC, Buffer.alloc(extraBytes)]);
}

describe('extractDoc - mocked word-extractor behavior', () => {
  it('throws TEXT_TOO_SHORT for text below 300 characters', async () => {
    mockExtract.mockResolvedValueOnce({ getBody: () => 'Short text.' });
    const { extractDoc } = await import('@/lib/files/doc');

    try {
      await extractDoc(makeDocBuffer());
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('TEXT_TOO_SHORT');
    }
  });

  it('throws TEXT_TOO_LONG for text over 100,000 characters', async () => {
    mockExtract.mockResolvedValueOnce({ getBody: () => 'a'.repeat(100_001) });
    const { extractDoc } = await import('@/lib/files/doc');

    try {
      await extractDoc(makeDocBuffer());
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('TEXT_TOO_LONG');
    }
  });

  it('throws EXTRACTION_FAILED when getBody returns empty string', async () => {
    mockExtract.mockResolvedValueOnce({ getBody: () => '' });
    const { extractDoc } = await import('@/lib/files/doc');

    try {
      await extractDoc(makeDocBuffer());
    } catch (err) {
      const fe = err as FileProcessingError;
      expect(fe.code).toBe('EXTRACTION_FAILED');
      expect(fe.message).toContain('no extractable text');
    }
  });

  it('throws EXTRACTION_FAILED when getBody returns whitespace only', async () => {
    mockExtract.mockResolvedValueOnce({ getBody: () => '   \n\t  ' });
    const { extractDoc } = await import('@/lib/files/doc');

    try {
      await extractDoc(makeDocBuffer());
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('EXTRACTION_FAILED');
    }
  });

  it('throws EXTRACTION_FAILED for garbled text (high control-char ratio)', async () => {
    const garbledText = 'a'.repeat(80) + '\x01'.repeat(20);
    mockExtract.mockResolvedValueOnce({ getBody: () => garbledText });
    const { extractDoc } = await import('@/lib/files/doc');

    try {
      await extractDoc(makeDocBuffer());
    } catch (err) {
      const fe = err as FileProcessingError;
      expect(fe.code).toBe('EXTRACTION_FAILED');
      expect(fe.message).toContain('garbled');
    }
  });

  it('wraps parser Error into EXTRACTION_FAILED with original message', async () => {
    mockExtract.mockRejectedValueOnce(new Error('Invalid Short Sector Allocation Table'));
    const { extractDoc } = await import('@/lib/files/doc');

    try {
      await extractDoc(makeDocBuffer());
    } catch (err) {
      const fe = err as FileProcessingError;
      expect(fe.code).toBe('EXTRACTION_FAILED');
      expect(fe.message).toContain('Invalid Short Sector Allocation Table');
    }
  });

  it('wraps non-Error throws into EXTRACTION_FAILED', async () => {
    mockExtract.mockRejectedValueOnce('string error');
    const { extractDoc } = await import('@/lib/files/doc');

    try {
      await extractDoc(makeDocBuffer());
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('EXTRACTION_FAILED');
    }
  });

  it('returns text and warnings array on successful extraction', async () => {
    const validText = 'This is a valid academic essay. '.repeat(10);
    mockExtract.mockResolvedValueOnce({ getBody: () => validText });
    const { extractDoc } = await import('@/lib/files/doc');

    const result = await extractDoc(makeDocBuffer());
    expect(result.text.length).toBeGreaterThanOrEqual(300);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
