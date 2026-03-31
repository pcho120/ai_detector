/**
 * Provider-agnostic detection adapter contract and normalized result types.
 *
 * Score convention (explicitly matching Sapling native scores):
 *   0 = human-like (low AI risk)
 *   1 = AI-like (high AI risk)
 *
 * This convention matches Sapling's native output directly — no inversion needed.
 */

export interface DetectionSentenceResult {
  /** Original sentence text as returned by the provider. */
  sentence: string;
  /**
   * Normalized AI-likeness risk score.
   * Range: [0, 1]  —  0 = human-like, 1 = AI-like.
   *
   * For the Sapling adapter this equals the provider's `sentence_scores[i].score`
   * directly (no transformation).
   */
  score: number;
}

export interface DetectionResult {
  /**
   * Overall AI-likeness risk score for the full text.
   * Range: [0, 1]  —  0 = human-like, 1 = AI-like.
   */
  score: number;
  /** Per-sentence breakdown. May be empty if the provider omits sentence scores. */
  sentences: DetectionSentenceResult[];
}

/**
 * Provider-agnostic detection adapter.
 *
 * Implementations must:
 *   - Live server-side only (never imported from client components).
 *   - Map all upstream failures to `FileProcessingError` with code `DETECTION_FAILED`.
 *   - Return scores in the [0,1] range where higher = more AI-like.
 */
export interface DetectionAdapter {
  /**
   * Analyze `text` and return a normalized detection result.
   *
   * @throws {FileProcessingError} with code `DETECTION_FAILED` on any provider error,
   *   timeout, 4xx, or 5xx response.
   */
  detect(text: string): Promise<DetectionResult>;
}
