/**
 * Bulk rewrite domain types.
 *
 * Defines request payload, result payload, and progress callback structures
 * for the bulk rewrite workflow.
 */

/**
 * Request payload for bulk rewrite operation.
 */
export interface BulkRewriteRequest {
  /**
   * Array of sentences to consider for rewriting.
   * Each sentence includes its AI-likeness score and position in the original text.
   */
  sentences: Array<{
    /** Original sentence text. */
    sentence: string;
    /** AI-likeness score (0-1 range, where 1 = most AI-like). */
    score: number;
    /** Zero-based index of this sentence in the analyzed sentences array. */
    sentenceIndex: number;
  }>;

  /**
   * Target AI-likeness score as a percentage (10-100).
   * The bulk rewrite will attempt to reduce the overall score to this level.
   */
  targetScore: number;

  /**
   * Optional voice profile to guide rewriting tone/style.
   */
  voiceProfile?: string;

  /**
   * Optional few-shot examples to guide rewriting style.
   */
  fewShotExamples?: string[];

  /**
   * The full text being analyzed.
   * Required for Sapling re-analysis after each rewrite round.
   */
  text: string;

  /**
   * Optional existing manual replacements to preserve.
   * Keys are sentence indices; values are replacement texts.
   * Sentences with existing manual replacements will not be rewritten.
   */
  manualReplacements?: Record<number, string>;
}

export interface BulkRewriteEngineConfig {
  llmApiKey?: string;
  llmProvider?: string;
  detectionApiKey?: string;
  detectionProvider?: string;
  /** Milliseconds before the engine should return partial results. Defaults to 50000. */
  deadlineMs?: number;
  /** Injectable clock function for testing. Defaults to Date.now. */
  now?: () => number;
}

/**
 * Result payload for bulk rewrite operation.
 */
export interface BulkRewriteResult {
  /**
   * All successfully generated rewrites, keyed by zero-based sentence index.
   * Reducer-style: Record<number, string> for compatibility with appliedReplacements state.
   * Missing keys = no rewrite generated for that sentence.
   */
  rewrites: Record<number, string>;

  /**
   * The achieved overall AI-likeness score after all rewrite rounds (0-100 percent).
   * May be higher than targetScore if target could not be met within 3 iterations.
   */
  achievedScore: number;

  /**
   * Number of rewrite iterations performed (1-3).
   */
  iterations: number;

  /**
   * Total count of sentences successfully rewritten across all iterations.
   */
  totalRewritten: number;

  /**
   * True if the achieved score <= targetScore; false if target was not reached.
   */
  targetMet: boolean;
}

/**
 * Progress callback function signature for real-time updates during bulk rewrite.
 *
 * Fired periodically (or at each phase transition) to report progress.
 *
 * @param current - Current count of processed sentences or iterations.
 * @param total - Total count of sentences or iterations to process.
 * @param phase - Current phase: 'rewriting' (LLM rewrite in progress) or 'analyzing' (Sapling re-analysis in progress).
 */
export type BulkRewriteProgress = (
  current: number,
  total: number,
  phase: 'rewriting' | 'analyzing',
) => void;
