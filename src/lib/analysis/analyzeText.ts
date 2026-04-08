import { SaplingDetectionAdapter } from '@/lib/detection/sapling';
import { WinstonDetectionAdapter } from '@/lib/detection/adapters/winston';
import { OriginalityDetectionAdapter } from '@/lib/detection/adapters/originality';
import { GPTZeroDetectionAdapter } from '@/lib/detection/adapters/gptzero';
import { buildHighlightSpans } from '@/lib/highlights/spans';
import { FileProcessingError } from '@/lib/files/errors';
import { RuleBasedSuggestionService } from '@/lib/suggestions/rule-based';
import { STUB_DETECTION_PROVIDERS, DETECTION_PROVIDER_LABELS } from '@/lib/settings/types';
import type { AnalysisSuccessResponse } from '@/app/api/analyze/route';
import type { DetectionAdapter } from '@/lib/detection/types';
import type { SentenceEntry } from '@/lib/suggestions/types';

export function createAnalysisDetectionAdapter(config?: {
  provider?: string;
  apiKey?: string;
}): DetectionAdapter {
  const provider = (config?.provider ?? process.env.DETECTION_PROVIDER ?? 'sapling').toLowerCase();

  // Check if stub provider was explicitly requested via config
  if (config?.provider) {
    const stubProviders = STUB_DETECTION_PROVIDERS.map(p => p.toLowerCase());
    if (stubProviders.includes(provider)) {
      const providerLabel = Object.entries(DETECTION_PROVIDER_LABELS).find(
        ([key]) => key.toLowerCase() === provider,
      )?.[1] || provider.charAt(0).toUpperCase() + provider.slice(1);
      throw new FileProcessingError(
        'DETECTION_FAILED',
        `${providerLabel} is not yet implemented`,
      );
    }
  }

  switch (provider) {
    case 'sapling': {
      const apiKey = config?.apiKey ?? process.env.SAPLING_API_KEY;
      if (!apiKey) {
        throw new FileProcessingError(
          'DETECTION_FAILED',
          'Detection service is not configured.',
        );
      }
      return new SaplingDetectionAdapter(apiKey);
    }

    case 'winston': {
      const apiKey = config?.apiKey ?? process.env.WINSTON_API_KEY;
      if (!apiKey) {
        throw new FileProcessingError(
          'DETECTION_FAILED',
          'Detection service is not configured.',
        );
      }
      return new WinstonDetectionAdapter(apiKey);
    }

    case 'originality': {
      const apiKey = config?.apiKey ?? process.env.ORIGINALITY_API_KEY;
      if (!apiKey) {
        throw new FileProcessingError(
          'DETECTION_FAILED',
          'Detection service is not configured.',
        );
      }
      return new OriginalityDetectionAdapter(apiKey);
    }

    case 'gptzero': {
      const apiKey = config?.apiKey ?? process.env.GPTZERO_API_KEY;
      if (!apiKey) {
        throw new FileProcessingError(
          'DETECTION_FAILED',
          'Detection service is not configured.',
        );
      }
      return new GPTZeroDetectionAdapter(apiKey);
    }

    default:
      throw new FileProcessingError(
        'DETECTION_FAILED',
        `Unknown detection provider: "${provider}". Set DETECTION_PROVIDER to "sapling", "winston", "originality", or "gptzero".`,
      );
  }
}

export async function analyzeText(
  text: string,
  detectionAdapter: DetectionAdapter,
): Promise<AnalysisSuccessResponse> {
  const detectionResult = await detectionAdapter.detect(text);
  const sentenceEntries: SentenceEntry[] = detectionResult.sentences.map((sentence, index) => ({
    sentence: sentence.sentence,
    index,
  }));
  const suggestions = await new RuleBasedSuggestionService().suggest(sentenceEntries);

  const highlights = buildHighlightSpans(text, detectionResult.sentences);

  return {
    score: detectionResult.score,
    text,
    sentences: detectionResult.sentences,
    highlights,
    suggestions,
  };
}
