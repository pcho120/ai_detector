import { FileProcessingError } from '../../files/errors';
import type { DetectionAdapter, DetectionResult } from '../types';

export class OriginalityDetectionAdapter implements DetectionAdapter {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // Stub: API key validation deferred to implementation
  }

  async detect(text: string): Promise<DetectionResult> {
    // Reference parameters to prevent lint warnings in stub
    void this.apiKey;
    void text;
    throw new FileProcessingError(
      'DETECTION_FAILED',
      'Originality.ai adapter is not yet implemented.',
    );
  }
}
