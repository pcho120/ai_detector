import { NextRequest, NextResponse } from 'next/server';
import { generateAlternativeSuggestions } from '@/lib/suggestions/llm';
import type { SuggestionAlternative } from '@/lib/suggestions/llm';
import { sanitizeVoiceProfile } from '@/lib/suggestions/voiceProfile';
import { createAnalysisDetectionAdapter } from '@/lib/analysis/analyzeText';
import { findSentenceInText } from '@/lib/highlights/spans';

export const runtime = 'nodejs';

export interface SuggestionRequest {
  text: string;
  sentenceIndex: number;
  sentence: string;
  score: number;
  voiceProfile?: string;
}

export interface SuggestionAvailableResponse {
  available: true;
  sentenceIndex: number;
  rewrite: string;
  explanation: string;
  alternatives: SuggestionAlternative[];
}

export interface SuggestionUnavailableResponse {
  available: false;
  sentenceIndex: number;
}

export type SuggestionResponse = SuggestionAvailableResponse | SuggestionUnavailableResponse;

function isValidRequest(body: unknown): body is SuggestionRequest {
  return (
    typeof body === 'object' &&
    body !== null &&
    'text' in body &&
    'sentenceIndex' in body &&
    'sentence' in body &&
    'score' in body &&
    typeof (body as Record<string, unknown>).text === 'string' &&
    ((body as Record<string, unknown>).text as string).trim().length > 0 &&
    typeof (body as Record<string, unknown>).sentenceIndex === 'number' &&
    Number.isInteger((body as Record<string, unknown>).sentenceIndex) &&
    ((body as Record<string, unknown>).sentenceIndex as number) >= 0 &&
    typeof (body as Record<string, unknown>).sentence === 'string' &&
    ((body as Record<string, unknown>).sentence as string).trim().length > 0 &&
    typeof (body as Record<string, unknown>).score === 'number'
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
        message: 'Body must include text (non-empty string), sentenceIndex (integer >= 0), sentence (non-empty string), and score (number).',
      },
      { status: 400 },
    );
  }

  const { sentenceIndex, sentence, score } = body;
  const rawVoiceProfile = (body as unknown as Record<string, unknown>).voiceProfile;
  const voiceProfile =
    typeof rawVoiceProfile === 'string' ? sanitizeVoiceProfile(rawVoiceProfile) : undefined;

  const apiKey = process.env.COACHING_LLM_API_KEY;

  const alternatives = await generateAlternativeSuggestions(
    apiKey,
    sentence,
    sentenceIndex,
    score,
    voiceProfile || undefined,
  );

  if (!alternatives) {
    const response: SuggestionUnavailableResponse = { available: false, sentenceIndex };
    return NextResponse.json(response, { status: 200 });
  }

  let adapter: ReturnType<typeof createAnalysisDetectionAdapter> | null = null;
  try {
    adapter = createAnalysisDetectionAdapter();
  } catch {
    adapter = null;
  }

  const enrichedAlternatives: SuggestionAlternative[] = await Promise.all(
    alternatives.map(async (alt) => {
      if (!adapter) return alt;
      try {
        const match = findSentenceInText(body.text, body.sentence, 0);
        if (!match) return alt;
        const revisedText = body.text.slice(0, match.start) + alt.rewrite + body.text.slice(match.end);
        const result = await adapter.detect(revisedText);
        return { ...alt, previewScore: result.score };
      } catch {
        return alt;
      }
    }),
  );

  const response: SuggestionAvailableResponse = {
    available: true,
    sentenceIndex,
    rewrite: enrichedAlternatives[0].rewrite,
    explanation: enrichedAlternatives[0].explanation,
    alternatives: enrichedAlternatives,
  };
  return NextResponse.json(response, { status: 200 });
}
