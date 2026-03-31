// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/analyze/revised/route';
import type { AnalysisSuccessResponse } from '@/app/api/analyze/route';

const FIXTURES = join(__dirname, '../fixtures');

function loadJsonFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8'));
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

function buildJsonRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/analyze/revised', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('POST /api/analyze/revised — success path', () => {
  it('returns 200 with AnalysisSuccessResponse shape for valid text', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingSuccess();

    const req = buildJsonRequest({ text: 'This is revised text for analysis.' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as AnalysisSuccessResponse;
    expect(typeof body.score).toBe('number');
    expect(typeof body.text).toBe('string');
    expect(Array.isArray(body.sentences)).toBe(true);
    expect(Array.isArray(body.highlights)).toBe(true);
    expect(Array.isArray(body.suggestions)).toBe(true);
  });

  it('returns the provided text in the response body', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingSuccess();

    const revisedText = 'This is a revised version of the original essay text.';
    const req = buildJsonRequest({ text: revisedText });
    const res = await POST(req);

    const body = (await res.json()) as AnalysisSuccessResponse;
    expect(body.text).toBe(revisedText);
  });

  it('score matches detection fixture score', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingSuccess();

    const fixture = loadJsonFixture('sapling-success.json') as { score: number };
    const req = buildJsonRequest({ text: 'Some text to reanalyze.' });
    const res = await POST(req);
    const body = (await res.json()) as AnalysisSuccessResponse;

    expect(body.score).toBe(fixture.score);
  });

  it('highlights contain valid span entries with sentenceIndex', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingAiLike();

    const req = buildJsonRequest({ text: 'This sentence has AI-like phrasing and should be flagged.' });
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

  it('response shape matches AnalysisSuccessResponse exactly', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingSuccess();

    const req = buildJsonRequest({ text: 'Some revised text.' });
    const res = await POST(req);
    const body = (await res.json()) as AnalysisSuccessResponse;

    expect(body).toHaveProperty('score');
    expect(body).toHaveProperty('text');
    expect(body).toHaveProperty('sentences');
    expect(body).toHaveProperty('highlights');
    expect(body).toHaveProperty('suggestions');
  });
});

describe('POST /api/analyze/revised — invalid request', () => {
  it('returns 400 when body is not JSON', async () => {
    const req = new NextRequest('http://localhost/api/analyze/revised', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when text field is missing', async () => {
    const req = buildJsonRequest({ other: 'value' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when text is empty string', async () => {
    const req = buildJsonRequest({ text: '' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when text is whitespace only', async () => {
    const req = buildJsonRequest({ text: '   ' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when text is a number', async () => {
    const req = buildJsonRequest({ text: 42 });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });
});

describe('POST /api/analyze/revised — detection failure', () => {
  it('returns 503 when SAPLING_API_KEY is missing', async () => {
    delete process.env.SAPLING_API_KEY;

    const req = buildJsonRequest({ text: 'Some revised text to analyze.' });
    const res = await POST(req);

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('DETECTION_FAILED');
  });

  it('returns 502 when Sapling returns HTTP 500', async () => {
    process.env.SAPLING_API_KEY = 'test-key';
    mockSaplingFailure(500);

    const req = buildJsonRequest({ text: 'Some revised text to analyze.' });
    const res = await POST(req);

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('DETECTION_FAILED');
  });

  it('error responses have error and message fields', async () => {
    delete process.env.SAPLING_API_KEY;

    const req = buildJsonRequest({ text: 'Some text.' });
    const res = await POST(req);
    const body = (await res.json()) as { error: string; message: string };

    expect(typeof body.error).toBe('string');
    expect(typeof body.message).toBe('string');
  });
});
