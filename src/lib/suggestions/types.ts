/**
 * Provider-agnostic suggestion service contract.
 *
 * Task 9 will supply the real LLM-backed implementation.
 * Task 7 wires a noop (default) implementation that returns [].
 */

export interface Suggestion {
  /** The original sentence text that the suggestion refers to. */
  sentence: string;
  /** Rewrite proposal for the sentence. */
  rewrite: string;
  /** Short human-readable explanation of the rewrite. */
  explanation: string;
  /**
   * Zero-based index of this sentence within the analyzed sentences array
   * returned by the detection result.  Provides a stable linkage between
   * a suggestion and its source entry in `AnalysisSuccessResponse.sentences`.
   */
  sentenceIndex: number;
}

/**
 * A sentence entry passed to the suggestion service, bundled with its
 * position in the detection result's sentence list so implementations can
 * propagate the stable linkage field.
 */
export interface SentenceEntry {
  /** Original sentence text. */
  sentence: string;
  /** Zero-based index in the analyzed sentences array. */
  index: number;
}

/**
 * Service that generates rewrite suggestions for AI-flagged sentences.
 *
 * Implementations must be server-side only and must never throw — they
 * should gracefully degrade by returning an empty array on failure.
 */
export interface SuggestionService {
  /**
   * Generate suggestions for the provided sentence entries.
   *
   * @param sentences - sentence entries (text + index) to rewrite
   * @returns array of suggestions (may be a subset of input sentences)
   */
  suggest(sentences: SentenceEntry[]): Promise<Suggestion[]>;
}
