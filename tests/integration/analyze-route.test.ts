// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/analyze/route';
import type { AnalysisSuccessResponse } from '@/app/api/analyze/route';
import * as tempModule from '@/lib/files/temp';
import type { TempFileHandle } from '@/lib/files/temp';

const FIXTURES = join(__dirname, '../fixtures');

function loadFixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

function loadJsonFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8'));
}

function buildMultipartRequest(
  fieldName: string,
  filename: string,
  mimeType: string,
  data: Uint8Array,
): NextRequest {
  const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;
  const CRLF = '\r\n';
  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"`,
    `Content-Type: ${mimeType}`,
    '',
    '',
  ].join(CRLF);
  const footer = `${CRLF}--${boundary}--${CRLF}`;
  const headerBytes = new TextEncoder().encode(header);
  const footerBytes = new TextEncoder().encode(footer);
  const body = new Uint8Array(headerBytes.length + data.length + footerBytes.length);
  body.set(headerBytes, 0);
  body.set(data, headerBytes.length);
  body.set(footerBytes, headerBytes.length + data.length);

  return new NextRequest('http://localhost/api/analyze', {
    method: 'POST',
    body,
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
  });
}

function buildDocxRequest(buf: Buffer, filename = 'essay.docx'): NextRequest {
  return buildMultipartRequest(
    'file',
    filename,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    new Uint8Array(buf),
  );
}

function buildDocRequest(buf: Buffer, filename = 'essay.doc'): NextRequest {
  return buildMultipartRequest('file', filename, 'application/msword', new Uint8Array(buf));
}

function mockSaplingSuccess(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => loadJsonFixture('sapling-success.json'),
    }),
  );
}

function mockSaplingAiLike(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => loadJsonFixture('sapling-ai-like.json'),
    }),
  );
}

function mockSaplingFailure(status = 500): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ msg: 'Internal error' }),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('POST /api/analyze — success path (docx)', () => {
  it('returns 200 with score, sentences, highlights, suggestions on valid English docx', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingSuccess();

    const buf = loadFixture('valid.docx');
    const req = buildDocxRequest(buf);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as AnalysisSuccessResponse;
    expect(typeof body.score).toBe('number');
    expect(Array.isArray(body.sentences)).toBe(true);
    expect(Array.isArray(body.highlights)).toBe(true);
    expect(Array.isArray(body.suggestions)).toBe(true);
  });

  it('returns suggestions array (may be empty when no coaching patterns match high-risk sentences)', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingSuccess();

    const buf = loadFixture('valid.docx');
    const req = buildDocxRequest(buf);
    const res = await POST(req);
    const body = (await res.json()) as AnalysisSuccessResponse;

    expect(Array.isArray(body.suggestions)).toBe(true);
    for (const s of body.suggestions) {
      expect(typeof s.sentence).toBe('string');
      expect(typeof s.rewrite).toBe('string');
      expect(typeof s.explanation).toBe('string');
      expect(typeof s.sentenceIndex).toBe('number');
      expect(s.sentenceIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('score matches detection fixture score', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingSuccess();

    const fixture = loadJsonFixture('sapling-success.json') as { score: number };
    const buf = loadFixture('valid.docx');
    const req = buildDocxRequest(buf);
    const res = await POST(req);
    const body = (await res.json()) as AnalysisSuccessResponse;

    expect(body.score).toBe(fixture.score);
  });

  it('sentences array contains entries from detection fixture', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingSuccess();

    const fixture = loadJsonFixture('sapling-success.json') as {
      sentence_scores: { score: number; sentence: string }[];
    };
    const buf = loadFixture('valid.docx');
    const req = buildDocxRequest(buf);
    const res = await POST(req);
    const body = (await res.json()) as AnalysisSuccessResponse;

    expect(body.sentences).toHaveLength(fixture.sentence_scores.length);
    expect(body.sentences[0].score).toBe(fixture.sentence_scores[0].score);
  });

  it('highlights array contains only valid span entries', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingSuccess();

    const buf = loadFixture('valid.docx');
    const req = buildDocxRequest(buf);
    const res = await POST(req);
    const body = (await res.json()) as AnalysisSuccessResponse;

    for (const span of body.highlights) {
      expect(span.start).toBeGreaterThanOrEqual(0);
      expect(span.end).toBeGreaterThan(span.start);
      expect(['low', 'medium', 'high']).toContain(span.label);
      expect(typeof span.score).toBe('number');
      expect(typeof span.sentenceIndex).toBe('number');
      expect(span.sentenceIndex).toBeGreaterThanOrEqual(0);
      expect(span.sentenceIndex).toBeLessThan(body.sentences.length);
    }
  });

  it('returns populated suggestions when AI-like fixture sentences match coaching patterns', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingAiLike();

    const buf = loadFixture('valid.docx');
    const req = buildDocxRequest(buf);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as AnalysisSuccessResponse;

    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
  });

  it('each suggestion has required fields and valid sentenceIndex for AI-like fixture', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingAiLike();

    const buf = loadFixture('valid.docx');
    const req = buildDocxRequest(buf);
    const res = await POST(req);
    const body = (await res.json()) as AnalysisSuccessResponse;

    expect(body.suggestions.length).toBeGreaterThan(0);
    for (const s of body.suggestions) {
      expect(typeof s.sentence).toBe('string');
      expect(typeof s.rewrite).toBe('string');
      expect(typeof s.explanation).toBe('string');
      expect(typeof s.sentenceIndex).toBe('number');
      expect(s.sentenceIndex).toBeGreaterThanOrEqual(0);
      expect(s.sentenceIndex).toBeLessThan(body.sentences.length);
    }
  });

  it('each suggestion sentenceIndex points to the matching sentence in the sentences array', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingAiLike();

    const buf = loadFixture('valid.docx');
    const req = buildDocxRequest(buf);
    const res = await POST(req);
    const body = (await res.json()) as AnalysisSuccessResponse;

    for (const s of body.suggestions) {
      expect(body.sentences[s.sentenceIndex].sentence).toBe(s.sentence);
    }
  });
});

describe('POST /api/analyze — success path (doc)', () => {
  it('returns 200 with score, sentences, highlights on valid .doc fixture', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingSuccess();

    const buf = loadFixture('valid_essay.doc');
    const req = buildDocRequest(buf);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as AnalysisSuccessResponse;
    expect(typeof body.score).toBe('number');
    expect(Array.isArray(body.sentences)).toBe(true);
  });
});

describe('POST /api/analyze — missing file field', () => {
  it('returns 400 when no file field is provided', async () => {
    const boundary = '----FormBoundaryTest';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="other"\r\n\r\nvalue\r\n--${boundary}--\r\n`;
    const req = new NextRequest('http://localhost/api/analyze', {
      method: 'POST',
      body,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const respBody = (await res.json()) as { error: string };
    expect(respBody.error).toBe('UNSUPPORTED_FORMAT');
  });
});

describe('POST /api/analyze — unsupported format', () => {
  it('returns 422 with UNSUPPORTED_FORMAT for a .txt file', async () => {
    const textContent = 'hello world this is plain text';
    const req = buildMultipartRequest('file', 'essay.txt', 'text/plain', new TextEncoder().encode(textContent));

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('UNSUPPORTED_FORMAT');
  });

  it('returns 422 with UNSUPPORTED_FORMAT for a file with .docx extension but doc magic bytes', async () => {
    const docBuf = loadFixture('valid_essay.doc');
    const req = buildMultipartRequest(
      'file',
      'essay.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      new Uint8Array(docBuf),
    );

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('UNSUPPORTED_FORMAT');
  });
});

describe('POST /api/analyze — text length policy', () => {
  it('returns 422 with TEXT_TOO_SHORT for short.docx', async () => {
    const buf = loadFixture('short.docx');
    const req = buildDocxRequest(buf, 'short.docx');

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('TEXT_TOO_SHORT');
  });

  it('returns 422 with EXTRACTION_FAILED for corrupted.docx', async () => {
    const buf = loadFixture('corrupted.docx');
    const req = buildDocxRequest(buf, 'corrupted.docx');

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('EXTRACTION_FAILED');
  });
});

describe('POST /api/analyze — UNSUPPORTED_LANGUAGE', () => {
  it('returns 422 with UNSUPPORTED_LANGUAGE for a non-English docx', async () => {
    process.env.SAPLING_API_KEY = 'test-key';

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const cyrillicText =
      'Искусственный интеллект (ИИ) — это область информатики, занимающаяся созданием интеллектуальных машин. ' +
      'Современные системы машинного обучения способны решать задачи, ранее доступные лишь человеку. ' +
      'Алгоритмы глубокого обучения применяются в медицине, автомобилестроении и финансах. ' +
      'Это создаёт новые возможности и этические вопросы для всего общества. ' +
      'Необходимо разрабатывать этические нормы и стандарты для искусственного интеллекта.';

    const wordXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t xml:space="preserve">${cyrillicText}</w:t></w:r></w:p>
  </w:body>
</w:document>`;

    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    );
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    );
    zip.file('word/document.xml', wordXml);
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`,
    );

    const docxBuf = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
    const req = buildDocxRequest(docxBuf, 'essay.docx');
    const res = await POST(req);

    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('UNSUPPORTED_LANGUAGE');
  });
});

describe('POST /api/analyze — detection failure', () => {
  it('returns 502 with DETECTION_FAILED when Sapling returns HTTP 500', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingFailure(500);

    const buf = loadFixture('valid.docx');
    const req = buildDocxRequest(buf);
    const res = await POST(req);

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('DETECTION_FAILED');
  });

  it('returns 503 with DETECTION_FAILED when SAPLING_API_KEY is missing', async () => {
    delete process.env.SAPLING_API_KEY;

    const buf = loadFixture('valid.docx');
    const req = buildDocxRequest(buf);
    const res = await POST(req);

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('DETECTION_FAILED');
  });

  it('detection error does not leak internal messages', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ msg: 'secret-connection-string://user:pass@host/db' }),
      }),
    );

    const buf = loadFixture('valid.docx');
    const req = buildDocxRequest(buf);
    const res = await POST(req);

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.message).not.toContain('secret-connection-string');
  });
});

describe('POST /api/analyze — error response shape', () => {
  it('all error responses have error and message fields', async () => {
    const boundary = '----FormBoundaryTest';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="other"\r\n\r\nvalue\r\n--${boundary}--\r\n`;
    const req = new NextRequest('http://localhost/api/analyze', {
      method: 'POST',
      body,
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    });

    const res = await POST(req);
    const respBody = (await res.json()) as { error: string; message: string };
    expect(typeof respBody.error).toBe('string');
    expect(typeof respBody.message).toBe('string');
  });

  it('error response does not contain raw file paths', async () => {
    const buf = loadFixture('short.docx');
    const req = buildDocxRequest(buf, 'short.docx');

    const res = await POST(req);
    const body = (await res.json()) as { message: string };
    expect(body.message).not.toMatch(/\\(home|users|tmp)\\/i);
  });
});

/**
 * Spy on withTempFile to capture the TempFileHandle created during a request,
 * then verify that specific file is gone after the response.
 * This is deterministic: we only check the one file created by the request
 * under test, not a whole-directory snapshot that could be polluted by other
 * processes or concurrent tests.
 */
async function captureAndAssertCleanup(
  action: () => Promise<void>,
): Promise<void> {
  let capturedHandle: TempFileHandle | undefined;

  const realWithTempFile = tempModule.withTempFile;
  vi.spyOn(tempModule, 'withTempFile').mockImplementation(async (buf, extension, fn) => {
    return realWithTempFile(buf, extension, async (handle) => {
      capturedHandle = handle;
      return fn(handle);
    });
  });

  try {
    await action();
  } finally {
    vi.restoreAllMocks();
  }

  expect(capturedHandle, 'withTempFile was never called — the route must create a temp file').toBeDefined();
  const stillExists = await tempModule.tempFileExists(capturedHandle!);
  expect(stillExists).toBe(false);
}

describe('POST /api/analyze — temp-file lifecycle cleanup', () => {
  it('cleans up the temp file on the success path (docx)', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingSuccess();

    await captureAndAssertCleanup(async () => {
      const buf = loadFixture('valid.docx');
      const req = buildDocxRequest(buf);
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });

  it('cleans up the temp file on the success path (doc)', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingSuccess();

    await captureAndAssertCleanup(async () => {
      const buf = loadFixture('valid_essay.doc');
      const req = buildDocRequest(buf);
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });

  it('cleans up the temp file when extraction fails (corrupted docx)', async () => {
    await captureAndAssertCleanup(async () => {
      const buf = loadFixture('corrupted.docx');
      const req = buildDocxRequest(buf, 'corrupted.docx');
      const res = await POST(req);
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('EXTRACTION_FAILED');
    });
  });

  it('cleans up the temp file when extraction produces text that is too short', async () => {
    await captureAndAssertCleanup(async () => {
      const buf = loadFixture('short.docx');
      const req = buildDocxRequest(buf, 'short.docx');
      const res = await POST(req);
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('TEXT_TOO_SHORT');
    });
  });
});
