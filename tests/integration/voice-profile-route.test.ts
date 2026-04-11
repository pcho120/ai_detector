// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/voice-profile/generate/route';
import type { VoiceProfileResponse } from '@/app/api/voice-profile/generate/route';

function buildRequest(body: unknown, extraHeaders?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/voice-profile/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function mockLlmSuccess(profileText: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: profileText } }],
      }),
    }),
  );
}

function mockLlmFailure(status = 500): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
}

function mockLlmNetworkError(): void {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('POST /api/voice-profile/generate — success path', () => {
  it('returns 200 with profile and language for presets-only input', async () => {
    mockLlmSuccess('Clear, evidence-grounded prose with logical structure and precise vocabulary.');

    const req = buildRequest({ presets: ['academic'] }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as VoiceProfileResponse;
    expect(typeof body.profile).toBe('string');
    expect(body.profile.length).toBeGreaterThan(0);
    expect(body.language).toBe('en');
  });

  it('returns 200 with profile and language for writingSample-only input', async () => {
    mockLlmSuccess('Conversational and direct with natural first-person flow.');

    const req = buildRequest({ writingSample: 'I think this approach really works well for most cases.' }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as VoiceProfileResponse;
    expect(typeof body.profile).toBe('string');
    expect(body.profile.length).toBeGreaterThan(0);
    expect(body.language).toBe('en');
  });

  it('returns 200 with profile for mixed presets + writingSample', async () => {
    mockLlmSuccess('Technical and structured with precise terminology.');

    const req = buildRequest({
      presets: ['technical', 'formal'],
      writingSample: 'The system initializes the pipeline by invoking the bootstrapper.',
    }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as VoiceProfileResponse;
    expect(body.profile.length).toBeGreaterThan(0);
  });

  it('uses languageHint to override detected language', async () => {
    mockLlmSuccess('Precise academic voice with structured evidence.');

    const req = buildRequest({ presets: ['academic'], languageHint: 'ko' }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as VoiceProfileResponse;
    expect(body.language).toBe('ko');
  });

  it('detects Korean language from writingSample when no hint given', async () => {
    mockLlmSuccess('자연스러운 대화체 문장과 직접적인 어조.');

    const req = buildRequest({ writingSample: '나는 이 접근법이 효과적이라고 생각한다.' }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as VoiceProfileResponse;
    expect(body.language).toBe('ko');
  });

  it('strips common wrapper prefix from LLM profile output', async () => {
    mockLlmSuccess('Voice profile: Analytical and precise with clear logical transitions.');

    const req = buildRequest({ presets: ['academic'] }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    const body = (await res.json()) as VoiceProfileResponse;
    expect(body.profile).not.toMatch(/^voice\s+profile\s*:/i);
    expect(body.profile.length).toBeGreaterThan(0);
  });

  it('clamps profile to MAX_PROFILE_LENGTH characters', async () => {
    const longText = 'A'.repeat(3000);
    mockLlmSuccess(longText);

    const req = buildRequest({ presets: ['narrative'] }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    const body = (await res.json()) as VoiceProfileResponse;
    expect(body.profile.length).toBeLessThanOrEqual(2000);
  });

  it('response contains exactly profile and language fields', async () => {
    mockLlmSuccess('Direct and concise voice.');

    const req = buildRequest({ presets: ['conversational'] }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);

    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['language', 'profile']);
  });
});

describe('POST /api/voice-profile/generate — request validation', () => {
  it('returns 400 for non-JSON body', async () => {
    const req = new NextRequest('http://localhost/api/voice-profile/generate', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'text/plain' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when body is empty object (no input source)', async () => {
    const req = buildRequest({});
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when presets is an empty array', async () => {
    const req = buildRequest({ presets: [] });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when presets contains an invalid key', async () => {
    const req = buildRequest({ presets: ['academic', 'invalid-key'] });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when presets is not an array', async () => {
    const req = buildRequest({ presets: 'academic' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when writingSample is an empty string', async () => {
    const req = buildRequest({ writingSample: '   ' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when writingSample is not a string', async () => {
    const req = buildRequest({ writingSample: 42 });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 400 when languageHint is invalid', async () => {
    const req = buildRequest({ presets: ['academic'], languageHint: 'fr' });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('error responses include error and message fields', async () => {
    const req = buildRequest({});
    const res = await POST(req);
    const body = (await res.json()) as { error: string; message: string };
    expect(typeof body.error).toBe('string');
    expect(typeof body.message).toBe('string');
  });
});

describe('POST /api/voice-profile/generate — safe degradation', () => {
  it('returns 503 when COACHING_LLM_API_KEY is missing', async () => {
    const req = buildRequest({ presets: ['academic'] });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('SERVICE_UNAVAILABLE');
  });

  it('returns 503 when LLM API returns non-OK status', async () => {
    mockLlmFailure(503);

    const req = buildRequest({ presets: ['formal'] }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('SERVICE_UNAVAILABLE');
  });

  it('returns 503 when LLM call throws a network error', async () => {
    mockLlmNetworkError();

    const req = buildRequest({ presets: ['technical'] }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('SERVICE_UNAVAILABLE');
  });

  it('503 error body does not include profile, language, or alternatives fields', async () => {
    const req = buildRequest({ presets: ['academic'] });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.error).toBe('SERVICE_UNAVAILABLE');
    expect(body.profile).toBeUndefined();
    expect(body.language).toBeUndefined();
    expect(body.alternatives).toBeUndefined();
  });

  it('503 from LLM failure also preserves strict error-only contract', async () => {
    mockLlmFailure(429);

    const req = buildRequest({ presets: ['narrative'] }, { 'x-llm-api-key': 'test-key' });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.error).toBe('SERVICE_UNAVAILABLE');
    expect(body.profile).toBeUndefined();
    expect(body.language).toBeUndefined();
  });
});

describe('POST /api/voice-profile/generate — all valid preset keys accepted', () => {
  const VALID_PRESETS = ['academic', 'conversational', 'formal', 'narrative', 'technical'] as const;

  for (const preset of VALID_PRESETS) {
    it(`accepts preset "${preset}"`, async () => {
      mockLlmSuccess(`Voice profile for ${preset} style.`);

      const req = buildRequest({ presets: [preset] }, { 'x-llm-api-key': 'test-key' });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  }
});
