import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CopyleaksDetectionAdapter } from '../copyleaks';
import { FileProcessingError } from '@/lib/files/errors';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeLoginResponse(overrides?: Partial<{ access_token: string; expires: string; expiry: string }>) {
  return {
    access_token: 'test-token-abc',
    expires: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  };
}

function makeDetectResponse(aiScore = 0.85) {
  return {
    summary: { ai: aiScore },
    results: [
      {
        classification: 2,
        matches: [{ text: { chars: { starts: [0], lengths: [15] } } }],
      },
    ],
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EMAIL = 'test@example.com';
const API_KEY = 'secret-key-123';
const LONG_TEXT = 'a'.repeat(25_001);
const VALID_TEXT = 'This is valid text. It is short enough for Copyleaks.';

// ── Length guard ──────────────────────────────────────────────────────────────

describe('CopyleaksDetectionAdapter – length guard', () => {
  it('throws FileProcessingError with DETECTION_FAILED when text exceeds 25,000 chars', async () => {
    const adapter = new CopyleaksDetectionAdapter({ email: EMAIL, apiKey: API_KEY });

    await expect(adapter.detect(LONG_TEXT)).rejects.toMatchObject({
      code: 'DETECTION_FAILED',
      message: expect.stringContaining('25,000'),
    });
  });

  it('thrown error is a FileProcessingError instance', async () => {
    const adapter = new CopyleaksDetectionAdapter({ email: EMAIL, apiKey: API_KEY });

    await expect(adapter.detect(LONG_TEXT)).rejects.toBeInstanceOf(FileProcessingError);
  });

  it('does NOT call fetch when text is too long', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse({}));
    const adapter = new CopyleaksDetectionAdapter({ email: EMAIL, apiKey: API_KEY });

    await expect(adapter.detect(LONG_TEXT)).rejects.toBeInstanceOf(FileProcessingError);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('does NOT throw for text at exactly 25,000 chars', async () => {
    const boundaryText = 'a'.repeat(25_000);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(makeLoginResponse()))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()));

    const adapter = new CopyleaksDetectionAdapter({
      email: `boundary-${Date.now()}@example.com`,
      apiKey: API_KEY,
    });

    await expect(adapter.detect(boundaryText)).resolves.toBeDefined();

    fetchSpy.mockRestore();
  });
});

// ── Token cache re-use ────────────────────────────────────────────────────────

describe('CopyleaksDetectionAdapter – token cache re-use', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls login only once for two detect() calls with the same credentials', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(makeLoginResponse()))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()));

    // Use unique credentials to isolate from other tests' cached tokens
    const email = `cache-reuse-${Date.now()}@example.com`;
    const adapter = new CopyleaksDetectionAdapter({ email, apiKey: API_KEY });

    await adapter.detect(VALID_TEXT);
    await adapter.detect(VALID_TEXT);

    // 1 login + 2 detects = 3 total
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    const firstUrl = fetchSpy.mock.calls[0][0] as string;
    const secondUrl = fetchSpy.mock.calls[1][0] as string;
    const thirdUrl = fetchSpy.mock.calls[2][0] as string;

    expect(firstUrl).toContain('id.copyleaks.com');
    expect(secondUrl).toContain('copyleaks.com/v2/writer-detector');
    expect(thirdUrl).toContain('copyleaks.com/v2/writer-detector');
  });

  it('calls login again after token expires (expires already in the past)', async () => {
    const expiredLogin = makeLoginResponse({
      expires: new Date(Date.now() - 1000).toISOString(), // expired 1s ago
    });
    const freshLogin = makeLoginResponse();

    fetchSpy
      .mockResolvedValueOnce(makeResponse(expiredLogin))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()))
      .mockResolvedValueOnce(makeResponse(freshLogin))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()));

    const email = `cache-expiry-${Date.now()}@example.com`;
    const adapter = new CopyleaksDetectionAdapter({ email, apiKey: API_KEY });

    await adapter.detect(VALID_TEXT);
    await adapter.detect(VALID_TEXT);

    const loginCalls = (fetchSpy.mock.calls as Array<[string, unknown]>).filter(([url]) =>
      url.includes('id.copyleaks.com'),
    );
    expect(loginCalls).toHaveLength(2);
  });

  it('uses `expires` field (documented Copyleaks field) to determine token validity', async () => {
    // Token with `expires` far in the future – must be cached (no second login)
    const loginWithExpires = {
      access_token: 'expires-field-token',
      expires: new Date(Date.now() + 3_600_000).toISOString(),
    };

    fetchSpy
      .mockResolvedValueOnce(makeResponse(loginWithExpires))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()));

    const email = `expires-field-${Date.now()}@example.com`;
    const adapter = new CopyleaksDetectionAdapter({ email, apiKey: API_KEY });

    await adapter.detect(VALID_TEXT);
    await adapter.detect(VALID_TEXT);

    // Token should have been cached; login called only once
    const loginCalls = (fetchSpy.mock.calls as Array<[string, unknown]>).filter(([url]) =>
      url.includes('id.copyleaks.com'),
    );
    expect(loginCalls).toHaveLength(1);
  });

  it('`expires` field in the past causes re-login (not treated as valid token)', async () => {
    const expiredViaExpires = {
      access_token: 'expired-via-expires',
      expires: new Date(Date.now() - 1000).toISOString(), // in the past
    };
    const freshLogin = makeLoginResponse();

    fetchSpy
      .mockResolvedValueOnce(makeResponse(expiredViaExpires))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()))
      .mockResolvedValueOnce(makeResponse(freshLogin))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()));

    const email = `expires-expired-${Date.now()}@example.com`;
    const adapter = new CopyleaksDetectionAdapter({ email, apiKey: API_KEY });

    await adapter.detect(VALID_TEXT);
    await adapter.detect(VALID_TEXT);

    const loginCalls = (fetchSpy.mock.calls as Array<[string, unknown]>).filter(([url]) =>
      url.includes('id.copyleaks.com'),
    );
    expect(loginCalls).toHaveLength(2);
  });
});

// ── Login 429 error ───────────────────────────────────────────────────────────

describe('CopyleaksDetectionAdapter – login 429 handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws FileProcessingError when login returns 429', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchSpy);

    const adapter = new CopyleaksDetectionAdapter({
      email: `rate-limit-${Date.now()}@example.com`,
      apiKey: 'rate-limit-key',
    });

    await expect(adapter.detect(VALID_TEXT)).rejects.toMatchObject({
      code: 'DETECTION_FAILED',
      message: expect.stringMatching(/rate limit/i),
    });
  });

  it('thrown error is a FileProcessingError instance (login 429)', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchSpy);

    const adapter = new CopyleaksDetectionAdapter({
      email: `rate-limit2-${Date.now()}@example.com`,
      apiKey: 'rate-limit-key2',
    });

    await expect(adapter.detect(VALID_TEXT)).rejects.toBeInstanceOf(FileProcessingError);
  });

  it('error message mentions "5 minutes"', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchSpy);

    const adapter = new CopyleaksDetectionAdapter({
      email: `rate-limit3-${Date.now()}@example.com`,
      apiKey: 'rate-limit-key3',
    });

    await expect(adapter.detect(VALID_TEXT)).rejects.toMatchObject({
      message: expect.stringContaining('5 minutes'),
    });
  });
});

// ── Normalized detect() success path ─────────────────────────────────────────

describe('CopyleaksDetectionAdapter – normalized detect() success', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns DetectionResult with score equal to summary.ai', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(makeLoginResponse()))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse(0.72)));

    const adapter = new CopyleaksDetectionAdapter({
      email: `success-${Date.now()}@example.com`,
      apiKey: API_KEY,
    });

    const result = await adapter.detect(VALID_TEXT);

    expect(result.score).toBe(0.72);
  });

  it('returns DetectionResult with a sentences array', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(makeLoginResponse()))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse(0.9)));

    const adapter = new CopyleaksDetectionAdapter({
      email: `success2-${Date.now()}@example.com`,
      apiKey: API_KEY,
    });

    const result = await adapter.detect(VALID_TEXT);

    expect(Array.isArray(result.sentences)).toBe(true);
    expect(result.sentences.length).toBeGreaterThan(0);
  });

  it('each sentence has { sentence: string, score: number } in [0,1]', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(makeLoginResponse()))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse(0.5)));

    const adapter = new CopyleaksDetectionAdapter({
      email: `success3-${Date.now()}@example.com`,
      apiKey: API_KEY,
    });

    const result = await adapter.detect(VALID_TEXT);

    for (const s of result.sentences) {
      expect(typeof s.sentence).toBe('string');
      expect(typeof s.score).toBe('number');
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it('passes sandbox: true in request body when constructed with sandbox: true', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(makeLoginResponse()))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()));

    const adapter = new CopyleaksDetectionAdapter({
      email: `sandbox-${Date.now()}@example.com`,
      apiKey: API_KEY,
      sandbox: true,
    });

    await adapter.detect(VALID_TEXT);

    const detectCallInit = fetchSpy.mock.calls[1][1] as RequestInit;
    const body = JSON.parse(detectCallInit.body as string) as Record<string, unknown>;
    expect(body.sandbox).toBe(true);
  });

  it('posts sensitivity: 2 in detect body', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(makeLoginResponse()))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()));

    const adapter = new CopyleaksDetectionAdapter({
      email: `sensitivity-${Date.now()}@example.com`,
      apiKey: API_KEY,
    });

    await adapter.detect(VALID_TEXT);

    const detectCallInit = fetchSpy.mock.calls[1][1] as RequestInit;
    const body = JSON.parse(detectCallInit.body as string) as Record<string, unknown>;
    expect(body.sensitivity).toBe(2);
  });

  it('does NOT include explain field in detect body', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(makeLoginResponse()))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()));

    const adapter = new CopyleaksDetectionAdapter({
      email: `no-explain-${Date.now()}@example.com`,
      apiKey: API_KEY,
    });

    await adapter.detect(VALID_TEXT);

    const detectCallInit = fetchSpy.mock.calls[1][1] as RequestInit;
    const body = JSON.parse(detectCallInit.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty('explain');
  });

  it('uses Authorization Bearer token from login in detect call', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(makeLoginResponse({ access_token: 'my-token-xyz' })))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()));

    const adapter = new CopyleaksDetectionAdapter({
      email: `bearer-${Date.now()}@example.com`,
      apiKey: API_KEY,
    });

    await adapter.detect(VALID_TEXT);

    const detectCallInit = fetchSpy.mock.calls[1][1] as RequestInit;
    const headers = detectCallInit.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-token-xyz');
  });

  it('handles empty results array gracefully', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(makeLoginResponse()))
      .mockResolvedValueOnce(makeResponse({ summary: { ai: 0.1 }, results: [] }));

    const adapter = new CopyleaksDetectionAdapter({
      email: `empty-results-${Date.now()}@example.com`,
      apiKey: API_KEY,
    });

    const result = await adapter.detect(VALID_TEXT);

    expect(result.score).toBe(0.1);
    expect(Array.isArray(result.sentences)).toBe(true);
  });
});

// ── Sandbox default behavior ──────────────────────────────────────────────────

describe('CopyleaksDetectionAdapter – sandbox defaults to false', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses sandbox: true when constructed with sandbox: true', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(makeLoginResponse()))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()));

    const adapter = new CopyleaksDetectionAdapter({
      email: `sandbox-explicit-${Date.now()}@example.com`,
      apiKey: API_KEY,
      sandbox: true,
    });

    await adapter.detect(VALID_TEXT);

    const detectCallInit = fetchSpy.mock.calls[1][1] as RequestInit;
    const body = JSON.parse(detectCallInit.body as string) as Record<string, unknown>;
    expect(body.sandbox).toBe(true);
  });

  it('uses sandbox: false when sandbox option is omitted', async () => {
    fetchSpy
      .mockResolvedValueOnce(makeResponse(makeLoginResponse()))
      .mockResolvedValueOnce(makeResponse(makeDetectResponse()));

    const adapter = new CopyleaksDetectionAdapter({
      email: `sandbox-default-${Date.now()}@example.com`,
      apiKey: API_KEY,
    });

    await adapter.detect(VALID_TEXT);

    const detectCallInit = fetchSpy.mock.calls[1][1] as RequestInit;
    const body = JSON.parse(detectCallInit.body as string) as Record<string, unknown>;
    expect(body.sandbox).toBe(false);
  });
});
