import { FileProcessingError } from '../files/errors';
import type { DetectionAdapter, DetectionResult } from './types';

const SAPLING_API_URL = 'https://api.sapling.ai/api/v1/aidetect';
const REQUEST_TIMEOUT_MS = 30_000;

interface SaplingSentenceScore {
  score: number;
  sentence: string;
}

interface SaplingSuccessResponse {
  score: number;
  sentence_scores: SaplingSentenceScore[];
  text: string;
  tokens: string[];
  token_probs: number[];
}


export class SaplingDetectionAdapter implements DetectionAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('SaplingDetectionAdapter requires a non-empty API key');
    }
    this.apiKey = apiKey;
  }

  async detect(text: string): Promise<DetectionResult> {
    let response: Response;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        response = await fetch(SAPLING_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: this.apiKey,
            text,
            sent_scores: true,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      throw new FileProcessingError(
        'DETECTION_FAILED',
        isAbort
          ? 'AI detection request timed out. Please try again.'
          : 'AI detection request failed due to a network error.',
      );
    }

    if (!response.ok) {
      throw new FileProcessingError(
        'DETECTION_FAILED',
        `AI detection service returned an error (HTTP ${response.status}).`,
      );
    }

    let data: SaplingSuccessResponse;
    try {
      data = (await response.json()) as SaplingSuccessResponse;
    } catch {
      throw new FileProcessingError(
        'DETECTION_FAILED',
        'AI detection service returned an unreadable response.',
      );
    }

    return normalizeSaplingResponse(data);
  }
}

export function normalizeSaplingResponse(data: SaplingSuccessResponse): DetectionResult {
  return {
    score: data.score,
    sentences: (data.sentence_scores ?? []).map((s) => ({
      sentence: s.sentence,
      score: s.score,
    })),
  };
}
