// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/suggestions/route';
import type { SuggestionResponse } from '@/app/api/suggestions/route';

const SAMPLE_TEXT =
  'In conclusion, the experiment shows improved outcomes. Furthermore, the data supports this hypothesis.';

function buildSuggestionRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/suggestions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockLlmSuccess(rewrite: string, explanation: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ rewrite, explanation }),
            },
          },
        ],
      }),
    }),
  );
}

function mockLlmFailure(status = 500): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  delete process.env.COACHING_LLM_API_KEY;
});

describe('POST /api/suggestions — success path', () => {
  it('returns 200 with available suggestion when COACHING_LLM_API_KEY is set', async () => {
    process.env.COACHING_LLM_API_KEY = 'test-key';
    mockLlmSuccess(
      'The experiment consistently demonstrated improved outcomes across all test groups.',
      'Replaced vague conclusion with a direct empirical claim.',
    );

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionResponse;
    expect(body.available).toBe(true);
    if (body.available) {
      expect(body.sentenceIndex).toBe(0);
      expect(typeof body.rewrite).toBe('string');
      expect(body.rewrite.length).toBeGreaterThan(0);
      expect(typeof body.explanation).toBe('string');
      expect(body.explanation.length).toBeGreaterThan(0);
    }
  });

  it('links response to the requested sentenceIndex', async () => {
    process.env.COACHING_LLM_API_KEY = 'test-key';
    mockLlmSuccess(
      'Machine learning algorithms enable accurate image classification at scale.',
      'Replaced passive hedge with an active direct claim.',
    );

    const req = buildSuggestionRequest({
      text: 'Furthermore, machine learning can be utilized for image classification. Deep learning is a subset of machine learning. Neural networks are used extensively.',
      sentenceIndex: 5,
      sentence: 'Furthermore, machine learning can be utilized for image classification.',
      score: 0.75,
    });
    const res = await POST(req);
    const body = (await res.json()) as SuggestionResponse;

    expect(body.sentenceIndex).toBe(5);
  });

  it('rewrite is a full sentence replacement, not a coaching hint', async () => {
    process.env.COACHING_LLM_API_KEY = 'test-key';
    const fullSentence = 'Recent educational research demonstrates that early literacy programs substantially reduce long-term achievement gaps.';
    mockLlmSuccess(fullSentence, 'Replaced generic importance claim with specific evidence-backed statement.');

    const req = buildSuggestionRequest({
      text: 'The importance of education cannot be overstated in today\'s society. Students benefit from structured learning environments.',
      sentenceIndex: 2,
      sentence: 'The importance of education cannot be overstated in today\'s society.',
      score: 0.8,
    });
    const res = await POST(req);
    const body = (await res.json()) as SuggestionResponse;

    expect(body.available).toBe(true);
    if (body.available) {
      expect(body.rewrite).toBe(fullSentence);
      expect(body.rewrite.split(' ').length).toBeGreaterThan(5);
    }
  });

  it('returns available=false when COACHING_LLM_API_KEY is missing', async () => {
    delete process.env.COACHING_LLM_API_KEY;

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 1,
      sentence: 'Furthermore, the data supports this hypothesis.',
      score: 0.82,
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionResponse;
    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(1);
  });

  it('returns available=false when LLM call fails', async () => {
    process.env.COACHING_LLM_API_KEY = 'test-key';
    mockLlmFailure(503);

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 3,
      sentence: 'In conclusion, the results are significant.',
      score: 0.9,
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionResponse;
    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(3);
  });

  it('returns available=false when LLM output contains banned phrases', async () => {
    process.env.COACHING_LLM_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rewrite: 'This will help you avoid detection by AI checkers.',
                  explanation: 'Cleaner phrasing.',
                }),
              },
            },
          ],
        }),
      }),
    );

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 2,
      sentence: 'Furthermore, this approach demonstrates the concept.',
      score: 0.78,
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionResponse;
    expect(body.available).toBe(false);
  });

  it('response does not contain evasion language even on success', async () => {
    process.env.COACHING_LLM_API_KEY = 'test-key';
    mockLlmSuccess(
      'The data clearly indicates a measurable improvement in student engagement.',
      'Replaced vague connector with a direct evidence statement.',
    );

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'Furthermore, the data shows improvement.',
      score: 0.8,
    });
    const res = await POST(req);
    const body = (await res.json()) as SuggestionResponse;

    const BANNED = /avoid.?detection|bypass|undetect(able|ed)|fool.*(ai|detector)|lower.*score/i;
    if (body.available) {
      expect(body.rewrite).not.toMatch(BANNED);
      expect(body.explanation).not.toMatch(BANNED);
    }
  });
});

describe('POST /api/suggestions — request validation', () => {
  it('returns 400 for non-JSON body', async () => {
    const req = new NextRequest('http://localhost/api/suggestions', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'text/plain' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when text is missing', async () => {
    const req = buildSuggestionRequest({ sentenceIndex: 0, sentence: 'Some sentence.', score: 0.8 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when text is empty string', async () => {
    const req = buildSuggestionRequest({ text: '   ', sentenceIndex: 0, sentence: 'Some sentence.', score: 0.8 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when sentenceIndex is missing', async () => {
    const req = buildSuggestionRequest({ text: SAMPLE_TEXT, sentence: 'Some sentence.', score: 0.8 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when sentence is missing', async () => {
    const req = buildSuggestionRequest({ text: SAMPLE_TEXT, sentenceIndex: 0, score: 0.8 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when score is missing', async () => {
    const req = buildSuggestionRequest({ text: SAMPLE_TEXT, sentenceIndex: 0, sentence: 'Some sentence.' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when sentenceIndex is not an integer', async () => {
    const req = buildSuggestionRequest({ text: SAMPLE_TEXT, sentenceIndex: 1.5, sentence: 'Some sentence.', score: 0.8 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when sentenceIndex is negative', async () => {
    const req = buildSuggestionRequest({ text: SAMPLE_TEXT, sentenceIndex: -1, sentence: 'Some sentence.', score: 0.8 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when sentence is empty string', async () => {
    const req = buildSuggestionRequest({ text: SAMPLE_TEXT, sentenceIndex: 0, sentence: '   ', score: 0.8 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('error responses include error and message fields', async () => {
    const req = buildSuggestionRequest({});
    const res = await POST(req);
    const body = (await res.json()) as { error: string; message: string };
    expect(typeof body.error).toBe('string');
    expect(typeof body.message).toBe('string');
  });
});

describe('POST /api/suggestions — safe degradation does not break analyze flow', () => {
  it('suggestion endpoint failure does not affect analyze route (isolated modules)', async () => {
    delete process.env.COACHING_LLM_API_KEY;

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'In conclusion, this shows the impact.',
      score: 0.9,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionResponse;
    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(0);
  });
});
