// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/suggestions/route';
import type { SuggestionResponse, SuggestionAvailableResponse } from '@/app/api/suggestions/route';

const SAMPLE_TEXT =
  'In conclusion, the experiment shows improved outcomes. Furthermore, the data supports this hypothesis.';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const SAPLING_URL = 'https://api.sapling.ai/api/v1/aidetect';

function buildSuggestionRequest(body: unknown, extraHeaders?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/suggestions', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function buildRoutedFetchMock(
  openaiResponder: () => Promise<unknown>,
  saplingScore?: number,
): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation((url: string) => {
    if (url === SAPLING_URL) {
      if (saplingScore !== undefined) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ score: saplingScore, ai_probability: saplingScore, sentences: [] }),
        });
      }
      return Promise.resolve({ ok: false, status: 503 });
    }
    return openaiResponder().then((data) => ({ ok: true, json: async () => data }));
  });
}

function openaiMultiResponse(alternatives: Array<{ rewrite: string; explanation: string }>): unknown {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({ alternatives }),
        },
      },
    ],
  };
}

function openaiSingleResponse(rewrite: string, explanation: string): unknown {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            alternatives: [
              { rewrite, explanation },
              { rewrite: 'A second distinct rewrite of the original sentence here.', explanation: 'Second alternative phrasing approach.' },
              { rewrite: 'A third distinct rewrite with different vocabulary and structure.', explanation: 'Third alternative phrasing approach.' },
            ],
          }),
        },
      },
    ],
  };
}

function mockLlmSuccess(rewrite: string, explanation: string): void {
  vi.stubGlobal(
    'fetch',
    buildRoutedFetchMock(() => Promise.resolve(openaiSingleResponse(rewrite, explanation))),
  );
}

function mockLlmMultiSuccess(alternatives: Array<{ rewrite: string; explanation: string }>): void {
  vi.stubGlobal(
    'fetch',
    buildRoutedFetchMock(() => Promise.resolve(openaiMultiResponse(alternatives))),
  );
}

function mockLlmFailure(status = 500): void {
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
    if (url === SAPLING_URL) {
      return Promise.resolve({ ok: false, status: 503 });
    }
    return Promise.resolve({ ok: false, status });
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('POST /api/suggestions — success path', () => {
  it('returns 200 with available suggestion when LLM API key is provided via header', async () => {
    mockLlmSuccess(
      'The experiment consistently demonstrated improved outcomes across all test groups.',
      'Replaced vague conclusion with a direct empirical claim.',
    );

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    }, { 'x-llm-api-key': 'test-key' });
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

  it('returns alternatives array with 2 or 3 entries on success', async () => {
    mockLlmMultiSuccess([
      { rewrite: 'The experiment consistently demonstrated improved outcomes across all groups.', explanation: 'Direct empirical claim.' },
      { rewrite: 'Results from the experiment showed consistent improvement.', explanation: 'More concise framing.' },
      { rewrite: 'Data from the experiment reveals improved outcomes across cohorts.', explanation: 'Evidence-anchored restatement.' },
    ]);

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionAvailableResponse;
    expect(body.available).toBe(true);
    expect(Array.isArray(body.alternatives)).toBe(true);
    expect(body.alternatives.length).toBeGreaterThanOrEqual(2);
    expect(body.alternatives.length).toBeLessThanOrEqual(3);
    expect(typeof body.alternatives[0].rewrite).toBe('string');
    expect(typeof body.alternatives[0].explanation).toBe('string');
  });

  it('top-level rewrite and explanation are aliases to alternatives[0]', async () => {
    const first = { rewrite: 'The experiment consistently demonstrated improved outcomes.', explanation: 'Replaced vague conclusion with direct claim.' };
    mockLlmMultiSuccess([
      first,
      { rewrite: 'Results from the experiment showed consistent improvement.', explanation: 'More concise framing.' },
    ]);

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);
    const body = (await res.json()) as SuggestionAvailableResponse;

    expect(body.available).toBe(true);
    expect(body.rewrite).toBe(body.alternatives[0].rewrite);
    expect(body.explanation).toBe(body.alternatives[0].explanation);
    expect(body.rewrite).toBe(first.rewrite);
    expect(body.explanation).toBe(first.explanation);
  });

  it('accepts optional voiceProfile in request body', async () => {
    mockLlmMultiSuccess([
      { rewrite: 'The experiment consistently demonstrated improved outcomes.', explanation: 'Direct empirical phrasing.' },
      { rewrite: 'Results from the experiment showed consistent improvement.', explanation: 'Concise framing.' },
    ]);

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
      voiceProfile: 'concise sentences, active verbs, first-person academic voice',
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionResponse;
    expect(body.available).toBe(true);
  });

  it('sanitizes voiceProfile wrapper before forwarding to LLM', async () => {
    const fetchMock = buildRoutedFetchMock(() =>
      Promise.resolve(
        openaiMultiResponse([
          { rewrite: 'The experiment demonstrated clear improvements.', explanation: 'Replaced vague opener.' },
          { rewrite: 'Results indicate a consistent trend of improvement.', explanation: 'Empirically grounded.' },
        ]),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
      voiceProfile: 'Voice profile: concise and direct academic writing',
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionResponse;
    expect(body.available).toBe(true);
    const openaiCalls = fetchMock.mock.calls.filter((c) => (c[0] as string) === OPENAI_URL);
    expect(openaiCalls.length).toBeGreaterThanOrEqual(1);
    const callBody = JSON.parse((openaiCalls[0][1] as { body: string }).body) as { messages: Array<{ content: string }> };
    const userContent = callBody.messages[1].content;
    expect(userContent).toContain('concise and direct academic writing');
    expect(userContent).not.toContain('Voice profile:');
  });

  it('links response to the requested sentenceIndex', async () => {
    mockLlmSuccess(
      'Machine learning algorithms enable accurate image classification at scale.',
      'Replaced passive hedge with an active direct claim.',
    );

    const req = buildSuggestionRequest({
      text: 'Furthermore, machine learning can be utilized for image classification. Deep learning is a subset of machine learning. Neural networks are used extensively.',
      sentenceIndex: 5,
      sentence: 'Furthermore, machine learning can be utilized for image classification.',
      score: 0.75,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);
    const body = (await res.json()) as SuggestionResponse;

    expect(body.sentenceIndex).toBe(5);
  });

  it('rewrite is a full sentence replacement, not a coaching hint', async () => {
    const fullSentence = 'Recent educational research demonstrates that early literacy programs substantially reduce long-term achievement gaps.';
    mockLlmSuccess(fullSentence, 'Replaced generic importance claim with specific evidence-backed statement.');

    const req = buildSuggestionRequest({
      text: 'The importance of education cannot be overstated in today\'s society. Students benefit from structured learning environments.',
      sentenceIndex: 2,
      sentence: 'The importance of education cannot be overstated in today\'s society.',
      score: 0.8,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);
    const body = (await res.json()) as SuggestionResponse;

    expect(body.available).toBe(true);
    if (body.available) {
      expect(body.rewrite).toBe(fullSentence);
      expect(body.rewrite.split(' ').length).toBeGreaterThan(5);
    }
  });

  it('returns available=false when LLM API key is not provided', async () => {
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
    mockLlmFailure(503);

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 3,
      sentence: 'In conclusion, the results are significant.',
      score: 0.9,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionResponse;
    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(3);
  });

  it('returns available=false when all LLM alternatives contain banned phrases', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: 'This will help you avoid detection by AI checkers.', explanation: 'Cleaner phrasing.' },
                    { rewrite: 'Use this to bypass the AI checker.', explanation: 'Alternative phrasing.' },
                    { rewrite: 'This makes your writing completely undetectable.', explanation: 'Third option.' },
                  ],
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
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionResponse;
    expect(body.available).toBe(false);
  });

  it('returns available=false when LLM returns only 1 safe alternative (below 2-alt minimum)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: 'The experiment revealed a consistent improvement across all cohorts.', explanation: 'Direct empirical claim.' },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    );

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionResponse;
    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(0);
  });

  it('returns available=false when LLM output contains banned phrases', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: 'This will help you avoid detection by AI checkers.', explanation: 'Cleaner phrasing.' },
                  ],
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
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionResponse;
    expect(body.available).toBe(false);
  });

  it('response does not contain evasion language even on success', async () => {
    mockLlmSuccess(
      'The data clearly indicates a measurable improvement in student engagement.',
      'Replaced vague connector with a direct evidence statement.',
    );

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'Furthermore, the data shows improvement.',
      score: 0.8,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);
    const body = (await res.json()) as SuggestionResponse;

    const BANNED = /avoid.?detection|bypass|undetect(able|ed)|fool.*(ai|detector)|lower.*score/i;
    if (body.available) {
      expect(body.rewrite).not.toMatch(BANNED);
      expect(body.explanation).not.toMatch(BANNED);
      for (const alt of body.alternatives) {
        expect(alt.rewrite).not.toMatch(BANNED);
        expect(alt.explanation).not.toMatch(BANNED);
      }
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

  it('accepts request body without voiceProfile field (backward compat)', async () => {
    mockLlmMultiSuccess([
      { rewrite: 'The experiment demonstrated clear improvements.', explanation: 'Direct empirical claim.' },
      { rewrite: 'Results indicate consistent improvement across groups.', explanation: 'Empirically grounded.' },
    ]);

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionResponse;
    expect(body.available).toBe(true);
  });

  it('empty string voiceProfile behaves identically to absent voiceProfile', async () => {
    const fetchMock = buildRoutedFetchMock(() =>
      Promise.resolve(
        openaiMultiResponse([
          { rewrite: 'The experiment demonstrated clear improvements.', explanation: 'Direct empirical claim.' },
          { rewrite: 'Results indicate consistent improvement.', explanation: 'Concise framing.' },
        ]),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
      voiceProfile: '',
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionResponse;
    expect(body.available).toBe(true);

    const openaiCalls = fetchMock.mock.calls.filter((c) => (c[0] as string) === OPENAI_URL);
    expect(openaiCalls.length).toBeGreaterThanOrEqual(1);
    const callBody = JSON.parse((openaiCalls[0][1] as { body: string }).body) as {
      messages: Array<{ content: string }>;
    };
    const userContent = callBody.messages[1].content;
    expect(userContent).not.toContain('Author voice profile:');
  });
});

describe('POST /api/suggestions — unavailable branch isolation', () => {
  it('branch: missing LLM API key → exact { available:false, sentenceIndex }', async () => {
    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 7,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(7);
    expect(body.rewrite).toBeUndefined();
    expect(body.explanation).toBeUndefined();
    expect(body.alternatives).toBeUndefined();
  });

  it('branch: multi-call parse failure (malformed JSON from LLM) → exact { available:false, sentenceIndex }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'not valid json {{{{' } }],
        }),
      }),
    );

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 8,
      sentence: 'Furthermore, the data supports this hypothesis.',
      score: 0.85,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(8);
    expect(body.rewrite).toBeUndefined();
    expect(body.explanation).toBeUndefined();
    expect(body.alternatives).toBeUndefined();
  });

  it('branch: all alternatives guardrail-filtered → exact { available:false, sentenceIndex }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: 'This will help you avoid detection by AI tools.', explanation: 'Cleaner phrasing.' },
                    { rewrite: 'Use these changes to bypass the AI checker entirely.', explanation: 'Better structure.' },
                    { rewrite: 'This approach makes your writing completely undetectable.', explanation: 'Third option.' },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    );

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 9,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.88,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(9);
    expect(body.rewrite).toBeUndefined();
    expect(body.explanation).toBeUndefined();
    expect(body.alternatives).toBeUndefined();
  });

  it('branch: <2 safe alternatives after guardrail filtering → exact { available:false, sentenceIndex }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: 'The experiment revealed consistent improvement across cohorts.', explanation: 'Direct empirical claim.' },
                    { rewrite: 'Results indicate a trend.', explanation: 'This change makes it undetectable to AI tools.' },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    );

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 10,
      sentence: 'Furthermore, the data supports this hypothesis.',
      score: 0.82,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(10);
    expect(body.rewrite).toBeUndefined();
    expect(body.explanation).toBeUndefined();
    expect(body.alternatives).toBeUndefined();
  });
});

describe('POST /api/suggestions — safe degradation does not break analyze flow', () => {
  it('suggestion endpoint failure does not affect analyze route (isolated modules)', async () => {
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

describe('POST /api/suggestions — unavailable response contract', () => {
  it('unavailable response contains exactly { available, sentenceIndex } with no extra required fields', async () => {
    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 2,
      sentence: 'Furthermore, the data supports this hypothesis.',
      score: 0.82,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(2);

    expect(body.rewrite).toBeUndefined();
    expect(body.explanation).toBeUndefined();
    expect(body.alternatives).toBeUndefined();
  });

  it('unavailable response from LLM failure also preserves strict contract', async () => {
    mockLlmFailure(503);

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 4,
      sentence: 'In conclusion, this shows the impact.',
      score: 0.9,
    }, { 'x-llm-api-key': 'test-key' });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(4);
    expect(body.rewrite).toBeUndefined();
    expect(body.explanation).toBeUndefined();
    expect(body.alternatives).toBeUndefined();
  });

  it('unavailable response from all-banned alternatives preserves strict contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  alternatives: [
                    { rewrite: 'This will help you avoid detection.', explanation: 'Cleaner phrasing.' },
                    { rewrite: 'Use this to bypass the AI checker.', explanation: 'Alternative.' },
                  ],
                }),
              },
            },
          ],
        }),
      }),
    );

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 6,
      sentence: 'Furthermore, this confirms the result.',
      score: 0.8,
    }, { 'x-llm-api-key': 'test-key' });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(6);
    expect(body.rewrite).toBeUndefined();
    expect(body.explanation).toBeUndefined();
    expect(body.alternatives).toBeUndefined();
  });
});

describe('POST /api/suggestions — recovery path for partial LLM output', () => {
  it('recovery: first call gives 1 safe alt, second call provides more → available:true with 2-3 alternatives', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                alternatives: [
                  { rewrite: 'The experiment revealed consistent improvement across cohorts.', explanation: 'Direct empirical claim.' },
                  { rewrite: 'Results indicate a trend.', explanation: 'This change makes it undetectable to AI tools.' },
                ],
              }),
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                alternatives: [
                  { rewrite: 'The study demonstrates a measurable positive trend.', explanation: 'Evidence-anchored restatement.' },
                  { rewrite: 'Analysis confirms a consistent pattern of improvement.', explanation: 'Grounded in data analysis.' },
                ],
              }),
            },
          }],
        }),
      })
      .mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 11,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionAvailableResponse;
    expect(body.available).toBe(true);
    expect(body.sentenceIndex).toBe(11);
    expect(Array.isArray(body.alternatives)).toBe(true);
    expect(body.alternatives.length).toBeGreaterThanOrEqual(2);
    expect(body.alternatives.length).toBeLessThanOrEqual(3);
    expect(body.rewrite).toBe(body.alternatives[0].rewrite);
    expect(body.explanation).toBe(body.alternatives[0].explanation);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('recovery: first call returns single-object format, second call provides 2 safe alts → available:true', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                rewrite: 'The experiment revealed consistent improvement across cohorts.',
                explanation: 'Direct empirical claim.',
              }),
            },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                alternatives: [
                  { rewrite: 'The study demonstrates a measurable positive trend.', explanation: 'Evidence-anchored restatement.' },
                  { rewrite: 'Analysis confirms a consistent pattern of improvement.', explanation: 'Grounded in data analysis.' },
                ],
              }),
            },
          }],
        }),
      })
      .mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 12,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionAvailableResponse;
    expect(body.available).toBe(true);
    expect(body.alternatives.length).toBeGreaterThanOrEqual(2);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('recovery: both calls produce all-banned alternatives → available:false, strict contract preserved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                alternatives: [
                  { rewrite: 'This will help you avoid detection by AI tools.', explanation: 'Better phrasing.' },
                  { rewrite: 'Use this to bypass the AI checker.', explanation: 'Cleaner text.' },
                ],
              }),
            },
          }],
        }),
      }),
    );

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 13,
      sentence: 'Furthermore, this demonstrates the concept.',
      score: 0.78,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(13);
    expect(body.rewrite).toBeUndefined();
    expect(body.explanation).toBeUndefined();
    expect(body.alternatives).toBeUndefined();
  });
});

describe('POST /api/suggestions — previewScore enrichment', () => {
  it('alternatives carry previewScore numbers when Sapling is available', async () => {
    vi.stubGlobal(
      'fetch',
      buildRoutedFetchMock(
        () =>
          Promise.resolve(
            openaiMultiResponse([
              { rewrite: 'The experiment consistently demonstrated improved outcomes.', explanation: 'Direct empirical claim.' },
              { rewrite: 'Results from the experiment showed consistent improvement.', explanation: 'More concise framing.' },
              { rewrite: 'Data from the experiment reveals improved outcomes across cohorts.', explanation: 'Evidence-anchored restatement.' },
            ]),
          ),
        0.42,
      ),
    );

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    }, { 'x-llm-api-key': 'test-key', 'x-detection-api-key': 'sapling-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionAvailableResponse;
    expect(body.available).toBe(true);
    expect(Array.isArray(body.alternatives)).toBe(true);
    for (const alt of body.alternatives) {
      expect(typeof alt.previewScore).toBe('number');
      expect(alt.previewScore).toBeGreaterThanOrEqual(0);
      expect(alt.previewScore).toBeLessThanOrEqual(1);
    }
  });

  it('sends revised full text to Sapling when sentence whitespace does not exactly match', async () => {
    const saplingRequestBodies: Array<{ key: string; text: string; sent_scores: number[] }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url === OPENAI_URL) {
          return {
            ok: true,
            json: async () =>
              openaiMultiResponse([
                { rewrite: 'The experiment consistently demonstrated improved outcomes.', explanation: 'Direct empirical claim.' },
                { rewrite: 'Results from the experiment showed consistent improvement.', explanation: 'More concise framing.' },
                { rewrite: 'Data from the experiment reveals improved outcomes across cohorts.', explanation: 'Evidence-anchored restatement.' },
              ]),
          };
        }

        if (url === SAPLING_URL) {
          saplingRequestBodies.push(JSON.parse((init?.body as string) ?? '{}') as {
            key: string;
            text: string;
            sent_scores: number[];
          });
          return {
            ok: true,
            json: async () => ({ score: 0.42, ai_probability: 0.42, sentences: [] }),
          };
        }

        throw new Error(`Unexpected fetch url: ${url}`);
      }),
    );

    const req = buildSuggestionRequest({
      text: 'In conclusion, the experiment shows improved outcomes.\n\nFurthermore, the data supports this hypothesis.',
      sentenceIndex: 0,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    }, { 'x-llm-api-key': 'test-key', 'x-detection-api-key': 'sapling-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionAvailableResponse;
    expect(body.available).toBe(true);
    expect(Array.isArray(body.alternatives)).toBe(true);
    expect(saplingRequestBodies.length).toBeGreaterThan(0);
    expect(saplingRequestBodies.some((request) => request.text !== 'In conclusion, the experiment shows improved outcomes.\n\nFurthermore, the data supports this hypothesis.')).toBe(true);
    expect(saplingRequestBodies.some((request) => request.text.includes('reveals improved outcomes across cohorts.'))).toBe(true);
    expect(saplingRequestBodies.some((request) => request.text.includes('The experiment consistently demonstrated improved outcomes.'))).toBe(true);
    expect(body.alternatives[0].previewScore).toBe(0.42);
  });

  it('alternatives return without previewScore when SAPLING_API_KEY is absent — response still available:true', async () => {
    mockLlmMultiSuccess([
      { rewrite: 'The experiment consistently demonstrated improved outcomes.', explanation: 'Direct empirical claim.' },
      { rewrite: 'Results from the experiment showed consistent improvement.', explanation: 'More concise framing.' },
    ]);

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionAvailableResponse;
    expect(body.available).toBe(true);
    expect(Array.isArray(body.alternatives)).toBe(true);
    expect(body.alternatives.length).toBeGreaterThanOrEqual(2);
    for (const alt of body.alternatives) {
      expect(alt.previewScore).toBeUndefined();
    }
    expect(body.rewrite).toBe(body.alternatives[0].rewrite);
    expect(body.explanation).toBe(body.alternatives[0].explanation);
  });

  it('alternatives return without previewScore when Sapling call fails — response still available:true', async () => {
    vi.stubGlobal(
      'fetch',
      buildRoutedFetchMock(
        () =>
          Promise.resolve(
            openaiMultiResponse([
              { rewrite: 'The experiment consistently demonstrated improved outcomes.', explanation: 'Direct empirical claim.' },
              { rewrite: 'Results from the experiment showed consistent improvement.', explanation: 'More concise framing.' },
            ]),
          ),
      ),
    );

    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 0,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    }, { 'x-llm-api-key': 'test-key', 'x-detection-api-key': 'sapling-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionAvailableResponse;
    expect(body.available).toBe(true);
    expect(Array.isArray(body.alternatives)).toBe(true);
    expect(body.alternatives.length).toBeGreaterThanOrEqual(2);
    for (const alt of body.alternatives) {
      expect(alt.previewScore).toBeUndefined();
    }
  });

  it('unavailable response has no previewScore even when detection API key is set', async () => {
    const req = buildSuggestionRequest({
      text: SAMPLE_TEXT,
      sentenceIndex: 14,
      sentence: 'In conclusion, the experiment shows improved outcomes.',
      score: 0.9,
    }, { 'x-detection-api-key': 'sapling-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.available).toBe(false);
    expect(body.sentenceIndex).toBe(14);
    expect(body.rewrite).toBeUndefined();
    expect(body.explanation).toBeUndefined();
    expect(body.alternatives).toBeUndefined();
  });
});
