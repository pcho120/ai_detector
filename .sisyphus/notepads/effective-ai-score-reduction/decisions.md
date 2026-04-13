# Decisions — effective-ai-score-reduction

## [2026-04-12] Architecture Decisions

- **Single-pass for bulk, two-pass for single-suggestion**: T3 eliminates Pass 2 ONLY for bulk rewrite path. Single-suggestion UI path keeps two-pass for better refinement.
- **`BULK_SYSTEM_PROMPT` separate from `SYSTEM_PROMPT`**: T2 creates a new constant rather than modifying the existing one, preserving single-suggestion behavior.
- **In-place text replacement**: T1 fixes `deriveTextWithRewrites` to locate each sentence within original text by string position and replace in-place, NOT `.join(' ')`.
- **Text matching for index stability**: T1 fixes index drift by matching re-analysis sentence texts against original sentences, not blind re-indexing from 0.
- **Paragraph groups of 2-5**: T4 groups consecutive high-score sentences. Isolated sentences (no adjacent high-score neighbors) fall back to sentence-level.
- **No new npm dependencies**: All implementation uses existing APIs.
- **Cap 3 iterative diagnostic rounds in T7**: After 3 rounds, document findings and present to user rather than looping indefinitely.
