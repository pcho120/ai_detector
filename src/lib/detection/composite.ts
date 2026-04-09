import { FileProcessingError } from '../files/errors';
import type { DetectionAdapter, DetectionResult } from './types';

/**
 * CompositeDetectionAdapter orchestrates one or two detection providers.
 *
 * Behavior matrix:
 *   - both sapling + copyleaks: run in parallel; use Copyleaks score, Sapling sentences
 *   - sapling only:             delegate unchanged
 *   - copyleaks only:           delegate unchanged
 *   - neither:                  throw FileProcessingError('DETECTION_FAILED', no-provider message)
 */
export class CompositeDetectionAdapter implements DetectionAdapter {
  private readonly sapling: DetectionAdapter | undefined;
  private readonly copyleaks: DetectionAdapter | undefined;

  constructor(options: {
    sapling?: DetectionAdapter | undefined;
    copyleaks?: DetectionAdapter | undefined;
  }) {
    this.sapling = options.sapling;
    this.copyleaks = options.copyleaks;
  }

  async detect(text: string): Promise<DetectionResult> {
    const hasSapling = this.sapling !== undefined;
    const hasCopyleaks = this.copyleaks !== undefined;

    if (hasSapling && hasCopyleaks) {
      // Run both in parallel; use Copyleaks overall score, Sapling per-sentence breakdown.
      const [saplingResult, copyleaksResult] = await Promise.all([
        this.sapling!.detect(text),
        this.copyleaks!.detect(text),
      ]);

      return {
        score: copyleaksResult.score,
        sentences: saplingResult.sentences,
      };
    }

    if (hasSapling) {
      return this.sapling!.detect(text);
    }

    if (hasCopyleaks) {
      return this.copyleaks!.detect(text);
    }

    throw new FileProcessingError(
      'DETECTION_FAILED',
      'No detection provider configured.',
    );
  }
}
