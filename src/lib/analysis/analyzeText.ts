import { SaplingDetectionAdapter } from '@/lib/detection/sapling';
import { buildHighlightSpans } from '@/lib/highlights/spans';
import { FileProcessingError } from '@/lib/files/errors';
import type { AnalysisSuccessResponse } from '@/app/api/analyze/route';
import type { DetectionAdapter } from '@/lib/detection/types';

export function createAnalysisDetectionAdapter(): DetectionAdapter {
  const apiKey = process.env.SAPLING_API_KEY;
  if (!apiKey) {
    throw new FileProcessingError(
      'DETECTION_FAILED',
      'Detection service is not configured.',
    );
  }
  return new SaplingDetectionAdapter(apiKey);
}

export async function analyzeText(
  text: string,
  detectionAdapter: DetectionAdapter,
): Promise<AnalysisSuccessResponse> {
  const detectionResult = await detectionAdapter.detect(text);

  const highlights = buildHighlightSpans(text, detectionResult.sentences);

  return {
    score: detectionResult.score,
    text,
    sentences: detectionResult.sentences,
    highlights,
    suggestions: [],
  };
}
