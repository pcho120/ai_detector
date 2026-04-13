# Decisions — few-shot-quality-fix

## [2026-04-11] Plan scope decisions

- CITATION_PATTERN: Leave as-is for this fix. Changing citation behavior is separate scope.
- MAX_FEWSHOT_CONTEXT_LENGTH: Increase 2000 → 3000 to accommodate richer prompt header
- References filter: Must NOT reject "References to..." or "References in..." — only reject when followed by author-name-like pattern
- Word-count minimum: ≥5 words (whitespace-split) as new filter — separate from character MIN_SENTENCE_LENGTH
- Heading detection: ≤8 words AND every significant word (>3 chars) is Title Case AND no comma
- Definition format: /^[A-Z][A-Za-z\s]{2,30}:\s/ pattern
- Pass2 skip: When fewShotExamples && fewShotExamples.length > 0, skip in BOTH twoPassRewrite AND generateAlternativeSuggestions
- Safe truncation: Build context block incrementally (sentence by sentence) instead of slice(0, 2000) to avoid mid-sentence cuts
