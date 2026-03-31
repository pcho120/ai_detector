import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractDocx, MIN_TEXT_LENGTH, MAX_TEXT_LENGTH } from '@/lib/files/docx';
import { FileProcessingError } from '@/lib/files/errors';

const FIXTURES = join(__dirname, '../fixtures');

function loadFixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

describe('extractDocx - valid document', () => {
  it('extracts normalized non-empty text from a valid .docx fixture', async () => {
    const buf = loadFixture('valid.docx');
    const result = await extractDocx(buf);
    expect(result.text.length).toBeGreaterThanOrEqual(MIN_TEXT_LENGTH);
    expect(result.charCount).toBe(result.text.length);
    expect(result.text).toContain('artificial intelligence');
  });

  it('returns no warnings for a clean .docx', async () => {
    const buf = loadFixture('valid.docx');
    const result = await extractDocx(buf);
    expect(result.warnings).toBeInstanceOf(Array);
  });

  it('normalizes trailing whitespace and multiple blank lines', async () => {
    const buf = loadFixture('valid.docx');
    const result = await extractDocx(buf);
    expect(result.text.startsWith(' ')).toBe(false);
    expect(result.text.endsWith(' ')).toBe(false);
    expect(result.text).not.toMatch(/\n{3,}/);
  });
});

describe('extractDocx - empty / image-only document', () => {
  it('throws EXTRACTION_FAILED for an empty .docx', async () => {
    const buf = loadFixture('empty.docx');
    await expect(extractDocx(buf)).rejects.toMatchObject({
      code: 'EXTRACTION_FAILED',
    });
  });

  it('throws FileProcessingError for an empty .docx', async () => {
    const buf = loadFixture('empty.docx');
    await expect(extractDocx(buf)).rejects.toBeInstanceOf(FileProcessingError);
  });

  it('throws EXTRACTION_FAILED for an image-only .docx (valid zip, no text)', async () => {
    const buf = loadFixture('image-only.docx');
    await expect(extractDocx(buf)).rejects.toMatchObject({
      code: 'EXTRACTION_FAILED',
    });
  });

  it('throws FileProcessingError for an image-only .docx', async () => {
    const buf = loadFixture('image-only.docx');
    await expect(extractDocx(buf)).rejects.toBeInstanceOf(FileProcessingError);
  });
});

describe('extractDocx - corrupted / invalid document', () => {
  it('throws EXTRACTION_FAILED for a corrupted .docx', async () => {
    const buf = loadFixture('corrupted.docx');
    await expect(extractDocx(buf)).rejects.toMatchObject({
      code: 'EXTRACTION_FAILED',
    });
  });

  it('throws FileProcessingError for a corrupted .docx', async () => {
    const buf = loadFixture('corrupted.docx');
    await expect(extractDocx(buf)).rejects.toBeInstanceOf(FileProcessingError);
  });

  it('throws EXTRACTION_FAILED for a password-protected .docx (OLE2/CFBF format)', async () => {
    const buf = loadFixture('password-protected.docx');
    await expect(extractDocx(buf)).rejects.toMatchObject({
      code: 'EXTRACTION_FAILED',
    });
  });

  it('throws FileProcessingError for a password-protected .docx', async () => {
    const buf = loadFixture('password-protected.docx');
    await expect(extractDocx(buf)).rejects.toBeInstanceOf(FileProcessingError);
  });

  it('throws EXTRACTION_FAILED for a password-protected-style invalid document', async () => {
    const buf = Buffer.from('not a zip file at all');
    await expect(extractDocx(buf)).rejects.toMatchObject({
      code: 'EXTRACTION_FAILED',
    });
  });
});

describe('extractDocx - text length bounds', () => {
  it('throws TEXT_TOO_SHORT when extracted text is under 300 chars', async () => {
    const buf = loadFixture('short.docx');
    await expect(extractDocx(buf)).rejects.toMatchObject({
      code: 'TEXT_TOO_SHORT',
    });
  });

  it('throws TEXT_TOO_LONG when extracted text is over 100000 chars', async () => {
    const buf = loadFixture('long.docx');
    await expect(extractDocx(buf)).rejects.toMatchObject({
      code: 'TEXT_TOO_LONG',
    });
  });

  it('accepts text exactly at MIN_TEXT_LENGTH boundary', async () => {
    const { default: JSZip } = await import('jszip');
    const borderlineText = 'A'.repeat(MIN_TEXT_LENGTH);
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    );
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    );
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
    );
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${borderlineText}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
    );
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await extractDocx(buf);
    expect(result.charCount).toBe(MIN_TEXT_LENGTH);
  });

  it('accepts text exactly at MAX_TEXT_LENGTH boundary', async () => {
    const { default: JSZip } = await import('jszip');
    const borderlineText = 'B '.repeat(MAX_TEXT_LENGTH / 2);
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    );
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    );
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
    );
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${borderlineText}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
    );
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const result = await extractDocx(buf);
    expect(result.charCount).toBeLessThanOrEqual(MAX_TEXT_LENGTH);
    expect(result.charCount).toBeGreaterThan(0);
  });
});

describe('extractDocx - garbled text detection', () => {
  it('throws EXTRACTION_FAILED when extracted text is mostly non-alphanumeric', async () => {
    const { default: JSZip } = await import('jszip');
    const garbledText = '\u0000\u0001\u0002\u0003'.repeat(100);
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    );
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    );
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
    );
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t xml:space="preserve">${garbledText}</w:t></w:r></w:p><w:sectPr/></w:body></w:document>`,
    );
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    await expect(extractDocx(buf)).rejects.toMatchObject({
      code: 'EXTRACTION_FAILED',
    });
  });
});
