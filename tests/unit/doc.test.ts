import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  garbledCharRatio,
  isGarbled,
  GARBLED_CHAR_RATIO_THRESHOLD,
  DOC_MIN_TEXT_LENGTH,
  DOC_MAX_TEXT_LENGTH,
  extractDoc,
} from '@/lib/files/doc';
import { FileProcessingError } from '@/lib/files/errors';

const FIXTURES = join(process.cwd(), 'tests', 'fixtures');

describe('garbledCharRatio', () => {
  it('returns 0 for empty string', () => {
    expect(garbledCharRatio('')).toBe(0);
  });

  it('returns 0 for clean printable ASCII text', () => {
    expect(garbledCharRatio('Hello, World!')).toBe(0);
  });

  it('does not count TAB, LF, CR as non-printable', () => {
    const textWithWhitespace = 'Line one\nLine two\rLine three\tTabbed';
    expect(garbledCharRatio(textWithWhitespace)).toBe(0);
  });

  it('counts NUL bytes as non-printable', () => {
    const nulOnly = '\x00\x00\x00\x00';
    expect(garbledCharRatio(nulOnly)).toBe(1.0);
  });

  it('counts DEL (0x7f) as non-printable', () => {
    const withDel = 'abc\x7f';
    expect(garbledCharRatio(withDel)).toBeCloseTo(0.25);
  });

  it('returns correct ratio for mixed clean + control chars', () => {
    const tenChars = 'abcdefgh\x01\x02';
    expect(garbledCharRatio(tenChars)).toBeCloseTo(0.2);
  });

  it('returns 0 for unicode multibyte printable text', () => {
    expect(garbledCharRatio('안녕하세요')).toBe(0);
  });
});

describe('isGarbled', () => {
  it('returns false for clean text', () => {
    expect(isGarbled('Clean essay text about education.')).toBe(false);
  });

  it('returns true for text at exactly 5% non-printable', () => {
    const text = 'a'.repeat(95) + '\x01'.repeat(5);
    expect(garbledCharRatio(text)).toBeCloseTo(0.05);
    expect(isGarbled(text)).toBe(true);
  });

  it('returns true for text above the threshold', () => {
    const text = 'a'.repeat(90) + '\x01'.repeat(10);
    expect(isGarbled(text)).toBe(true);
  });

  it('returns false for text below 5% non-printable', () => {
    const text = 'a'.repeat(951) + '\x01'.repeat(49);
    expect(isGarbled(text)).toBe(false);
  });

  it('threshold constant equals 0.05', () => {
    expect(GARBLED_CHAR_RATIO_THRESHOLD).toBe(0.05);
  });
});

describe('DOC_MIN_TEXT_LENGTH / DOC_MAX_TEXT_LENGTH constants', () => {
  it('MIN is 300', () => {
    expect(DOC_MIN_TEXT_LENGTH).toBe(300);
  });

  it('MAX is 100,000', () => {
    expect(DOC_MAX_TEXT_LENGTH).toBe(100_000);
  });
});

describe('extractDoc - valid fixture', () => {
  it('extracts readable text from a real .doc fixture', async () => {
    const buf = await readFile(join(FIXTURES, 'valid_essay.doc'));
    const result = await extractDoc(buf);

    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThanOrEqual(DOC_MIN_TEXT_LENGTH);
    expect(result.text.length).toBeLessThanOrEqual(DOC_MAX_TEXT_LENGTH);
    expect(result.text).toContain('essay');
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('normalises CRLF and lone CR to LF in output', async () => {
    const buf = await readFile(join(FIXTURES, 'valid_essay.doc'));
    const result = await extractDoc(buf);
    expect(result.text).not.toMatch(/\r/);
  });

  it('returns trimmed text with no leading/trailing whitespace', async () => {
    const buf = await readFile(join(FIXTURES, 'valid_essay.doc'));
    const result = await extractDoc(buf);
    expect(result.text).toBe(result.text.trim());
  });

  it('passes isGarbled check on the extracted text', async () => {
    const buf = await readFile(join(FIXTURES, 'valid_essay.doc'));
    const result = await extractDoc(buf);
    expect(isGarbled(result.text)).toBe(false);
  });
});

describe('extractDoc - garbled/corrupted fixture', () => {
  it('throws EXTRACTION_FAILED for a file with OLE2 magic but corrupted structure', async () => {
    const buf = await readFile(join(FIXTURES, 'garbled.doc'));

    await expect(extractDoc(buf)).rejects.toThrow(FileProcessingError);
    try {
      await extractDoc(buf);
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('EXTRACTION_FAILED');
    }
  });
});

describe('extractDoc - garbage buffer (no OLE2 magic)', () => {
  it('throws EXTRACTION_FAILED when word-extractor rejects the buffer', async () => {
    const buf = Buffer.alloc(512, 0xff);

    await expect(extractDoc(buf)).rejects.toThrow(FileProcessingError);
    try {
      await extractDoc(buf);
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('EXTRACTION_FAILED');
    }
  });
});
