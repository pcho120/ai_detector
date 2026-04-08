import { NextRequest, NextResponse } from 'next/server';
import { executeBulkRewrite } from '@/lib/bulk-rewrite/bulkRewrite';
import { sanitizeVoiceProfile } from '@/lib/suggestions/voiceProfile';
import type { BulkRewriteRequest } from '@/lib/bulk-rewrite/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const TARGET_SCORE_MIN = 10;
const TARGET_SCORE_MAX = 100;

function isValidSentenceEntry(entry: unknown): entry is { sentence: string; score: number; sentenceIndex: number } {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'sentence' in entry &&
    'score' in entry &&
    'sentenceIndex' in entry &&
    typeof (entry as Record<string, unknown>).sentence === 'string' &&
    ((entry as Record<string, unknown>).sentence as string).trim().length > 0 &&
    typeof (entry as Record<string, unknown>).score === 'number' &&
    typeof (entry as Record<string, unknown>).sentenceIndex === 'number' &&
    Number.isInteger((entry as Record<string, unknown>).sentenceIndex) &&
    ((entry as Record<string, unknown>).sentenceIndex as number) >= 0
  );
}

function isValidRequest(body: unknown): body is {
  sentences: Array<{ sentence: string; score: number; sentenceIndex: number }>;
  targetScore: number;
  text: string;
  voiceProfile?: unknown;
  manualReplacements?: unknown;
} {
  if (typeof body !== 'object' || body === null) return false;

  const b = body as Record<string, unknown>;

  if (!('sentences' in b) || !Array.isArray(b.sentences) || b.sentences.length === 0) return false;
  if (!b.sentences.every(isValidSentenceEntry)) return false;

  if (!('targetScore' in b) || typeof b.targetScore !== 'number') return false;
  if (!Number.isFinite(b.targetScore)) return false;
  if (b.targetScore < TARGET_SCORE_MIN || b.targetScore > TARGET_SCORE_MAX) return false;

  if (!('text' in b) || typeof b.text !== 'string' || (b.text as string).trim().length === 0) return false;

  return true;
}

function isValidManualReplacements(value: unknown): value is Record<number, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([k, v]) => Number.isInteger(Number(k)) && typeof v === 'string',
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  if (!isValidRequest(body)) {
    return NextResponse.json(
      {
        error: 'INVALID_REQUEST',
        message:
          'Body must include: sentences (non-empty array of {sentence, score, sentenceIndex}), targetScore (number 10-100), and text (non-empty string).',
      },
      { status: 400 },
    );
  }

  const apiKey = process.env.COACHING_LLM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: 'COACHING_LLM_NOT_CONFIGURED',
        message: 'Bulk rewrite service is not configured.',
      },
      { status: 503 },
    );
  }

  const rawVoiceProfile = (body as Record<string, unknown>).voiceProfile;
  const voiceProfile =
    typeof rawVoiceProfile === 'string' ? sanitizeVoiceProfile(rawVoiceProfile) : undefined;

  const rawManualReplacements = (body as Record<string, unknown>).manualReplacements;
  let manualReplacements: Record<number, string> | undefined;
  if (rawManualReplacements !== undefined && rawManualReplacements !== null) {
    if (!isValidManualReplacements(rawManualReplacements)) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: 'manualReplacements must be an object mapping sentence indices to replacement strings.',
        },
        { status: 400 },
      );
    }
    manualReplacements = Object.fromEntries(
      Object.entries(rawManualReplacements as Record<string, string>).map(([k, v]) => [Number(k), v]),
    ) as Record<number, string>;
  }

  const rewriteRequest: BulkRewriteRequest = {
    sentences: body.sentences,
    targetScore: body.targetScore,
    text: body.text,
    voiceProfile: voiceProfile ?? undefined,
    manualReplacements,
  };

  try {
    const result = await executeBulkRewrite(rewriteRequest);
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: 'BULK_REWRITE_FAILED', message: 'Bulk rewrite encountered an unexpected error.' },
      { status: 500 },
    );
  }
}
