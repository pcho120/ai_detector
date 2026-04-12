// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/bulk-rewrite/route';

vi.mock('@/lib/bulk-rewrite/bulkRewrite', () => ({
  executeBulkRewrite: vi.fn(),
}));

function buildBulkRewriteRequest(body: unknown, extraHeaders?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/api/bulk-rewrite', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe('POST /api/bulk-rewrite', () => {
  it('returns 200 with mocked bulk rewrite result', async () => {
    const { executeBulkRewrite } = await import('@/lib/bulk-rewrite/bulkRewrite');
    vi.mocked(executeBulkRewrite).mockResolvedValue({
      rewrites: { 0: 'This is a rewritten test sentence.' },
      achievedScore: 25,
      targetMet: true,
      totalRewritten: 1,
      iterations: 1,
    });

    const req = buildBulkRewriteRequest(
      {
        sentences: [
          { sentence: 'This is a test sentence.', score: 0.8, sentenceIndex: 0 },
        ],
        targetScore: 30,
        text: 'This is a test sentence.',
      },
      { 'x-llm-api-key': 'test-api-key' },
    );

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      rewrites: { 0: 'This is a rewritten test sentence.' },
      achievedScore: 25,
      targetMet: true,
      totalRewritten: 1,
      iterations: 1,
    });

    expect(executeBulkRewrite).toHaveBeenCalledTimes(1);
    expect(executeBulkRewrite).toHaveBeenCalledWith(
      {
        sentences: [
          { sentence: 'This is a test sentence.', score: 0.8, sentenceIndex: 0 },
        ],
        targetScore: 30,
        text: 'This is a test sentence.',
        voiceProfile: undefined,
        fewShotExamples: undefined,
        manualReplacements: undefined,
      },
      undefined,
      expect.objectContaining({
        deadlineMs: 100_000,
        llmApiKey: 'test-api-key',
      }),
    );
  });

  it('passes deadlineMs: 100_000 to executeBulkRewrite', async () => {
    const { executeBulkRewrite } = await import('@/lib/bulk-rewrite/bulkRewrite');
    vi.mocked(executeBulkRewrite).mockResolvedValue({
      rewrites: {},
      achievedScore: 30,
      targetMet: false,
      totalRewritten: 0,
      iterations: 0,
    });

    const req = buildBulkRewriteRequest(
      {
        sentences: [
          { sentence: 'This is a test sentence.', score: 0.8, sentenceIndex: 0 },
        ],
        targetScore: 30,
        text: 'This is a test sentence.',
      },
      { 'x-llm-api-key': 'test-api-key' },
    );

    await POST(req);

    const callConfig = vi.mocked(executeBulkRewrite).mock.calls[0]?.[2];
    expect(callConfig).toEqual(expect.objectContaining({ deadlineMs: 100_000 }));
  });
});
