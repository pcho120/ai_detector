import { describe, it, expect } from 'vitest';
import {
  validateFileBuffer,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/files/validate';
import { FileProcessingError } from '@/lib/files/errors';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOC_MIME = 'application/msword';

function makeDocxBuffer(extraBytes = 100): Buffer {
  const magic = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const padding = Buffer.alloc(extraBytes);
  return Buffer.concat([magic, padding]);
}

function makeDocBuffer(extraBytes = 100): Buffer {
  const magic = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const padding = Buffer.alloc(extraBytes);
  return Buffer.concat([magic, padding]);
}

function makeGarbageBuffer(size = 100): Buffer {
  return Buffer.alloc(size, 0xff);
}

describe('validateFileBuffer - size', () => {
  it('accepts a file exactly at the 5 MB limit', () => {
    const buf = makeDocxBuffer(MAX_FILE_SIZE_BYTES - 4);
    const result = validateFileBuffer('essay.docx', DOCX_MIME, buf);
    expect(result.sizeBytes).toBe(MAX_FILE_SIZE_BYTES);
  });

  it('rejects a file one byte over the 5 MB limit with FILE_TOO_LARGE', () => {
    const buf = makeDocxBuffer(MAX_FILE_SIZE_BYTES - 4 + 1);
    expect(() => validateFileBuffer('essay.docx', DOCX_MIME, buf)).toThrow(FileProcessingError);
    try {
      validateFileBuffer('essay.docx', DOCX_MIME, buf);
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('FILE_TOO_LARGE');
    }
  });
});

describe('validateFileBuffer - extension', () => {
  it('rejects unsupported extension with UNSUPPORTED_FORMAT', () => {
    const buf = makeDocxBuffer();
    expect(() => validateFileBuffer('essay.pdf', DOCX_MIME, buf)).toThrow(FileProcessingError);
    try {
      validateFileBuffer('essay.pdf', DOCX_MIME, buf);
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('rejects files with no extension with UNSUPPORTED_FORMAT', () => {
    const buf = makeDocxBuffer();
    try {
      validateFileBuffer('essay', DOCX_MIME, buf);
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });
});

describe('validateFileBuffer - MIME type', () => {
  it('rejects an invalid MIME type with UNSUPPORTED_FORMAT', () => {
    const buf = makeDocxBuffer();
    try {
      validateFileBuffer('essay.docx', 'text/plain', buf);
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('accepts application/octet-stream as a valid MIME type for .docx', () => {
    const buf = makeDocxBuffer();
    const result = validateFileBuffer('essay.docx', 'application/octet-stream', buf);
    expect(result.extension).toBe('.docx');
  });

  it('accepts application/octet-stream as a valid MIME type for .doc', () => {
    const buf = makeDocBuffer();
    const result = validateFileBuffer('essay.doc', 'application/octet-stream', buf);
    expect(result.extension).toBe('.doc');
  });

  it('rejects .docx with application/msword MIME (wrong-format MIME) with UNSUPPORTED_FORMAT', () => {
    const buf = makeDocxBuffer();
    try {
      validateFileBuffer('essay.docx', 'application/msword', buf);
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('rejects .doc with docx MIME (wrong-format MIME) with UNSUPPORTED_FORMAT', () => {
    const buf = makeDocBuffer();
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    try {
      validateFileBuffer('essay.doc', DOCX_MIME, buf);
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });
});

describe('validateFileBuffer - magic bytes', () => {
  it('accepts a valid .docx buffer with correct DOCX magic bytes', () => {
    const buf = makeDocxBuffer();
    const result = validateFileBuffer('essay.docx', DOCX_MIME, buf);
    expect(result.extension).toBe('.docx');
  });

  it('accepts a valid .doc buffer with correct DOC magic bytes', () => {
    const buf = makeDocBuffer();
    const result = validateFileBuffer('essay.doc', DOC_MIME, buf);
    expect(result.extension).toBe('.doc');
  });

  it('rejects garbage bytes regardless of extension with UNSUPPORTED_FORMAT', () => {
    const buf = makeGarbageBuffer();
    try {
      validateFileBuffer('essay.docx', DOCX_MIME, buf);
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('rejects .docx extension with DOC magic bytes (spoofed extension) with UNSUPPORTED_FORMAT', () => {
    const buf = makeDocBuffer();
    try {
      validateFileBuffer('essay.docx', DOCX_MIME, buf);
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });

  it('rejects .doc extension with DOCX magic bytes (spoofed extension) with UNSUPPORTED_FORMAT', () => {
    const buf = makeDocxBuffer();
    try {
      validateFileBuffer('essay.doc', DOC_MIME, buf);
    } catch (err) {
      expect((err as FileProcessingError).code).toBe('UNSUPPORTED_FORMAT');
    }
  });
});

describe('validateFileBuffer - returned shape', () => {
  it('returns correct extension and sizeBytes on success', () => {
    const buf = makeDocxBuffer(200);
    const result = validateFileBuffer('essay.docx', DOCX_MIME, buf);
    expect(result.extension).toBe('.docx');
    expect(result.sizeBytes).toBe(buf.length);
    expect(result.buffer).toBe(buf);
  });

  it('is case-insensitive for file extension', () => {
    const buf = makeDocxBuffer();
    const result = validateFileBuffer('ESSAY.DOCX', DOCX_MIME, buf);
    expect(result.extension).toBe('.docx');
  });
});
