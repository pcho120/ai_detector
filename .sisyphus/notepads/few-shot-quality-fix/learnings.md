# Learnings — few-shot-quality-fix

## Inherited from user-paper-few-shot plan

- Few-shot examples injected into LLM prompt as numbered list (no fine-tuning, no vector store)
- Sentence selection: heuristics-only diversity algorithm (no NLP deps)
- buildFewShotContextBlock returns '' for empty array (falls back to voiceProfile)
- twoPassRewrite pass2 also uses voiceProfile context - but when few-shot is active, Pass2 washes out style signal
- fewShotExamples threaded through page state → suggestion fetches → bulk rewrite requests
- Tab switching is mutual-exclusivity mechanism (switching clears other tab's data)
- Test infrastructure: vitest for unit tests, bun test alias, npm run test:e2e for Playwright

## Code Structure Facts (read 2026-04-11)

- filterCandidates() in extractSentences.ts: lines 137-173
- Existing patterns at lines 10-17: ABBREVIATION, MULTI_INITIAL, LIST_ITEM, URL, CITATION, REFERENCE_ENTRY, FIGURE_CAPTION, AUTHOR_YEAR_LEAD
- Helper functions isAllCapsSentence (lines 59-66) and isMostlyNumbersOrSymbols (lines 68-79) are good pattern references for new filter helpers
- MIN_SENTENCE_LENGTH = 20, MAX_SENTENCE_LENGTH = 300 (character-based, NOT word-based)
- The word-count minimum (≥5 words) is a NEW filter being added — do NOT change MIN_SENTENCE_LENGTH
- Task 1 implementation kept filterCandidates scoped: add post-symbol checks for word-count minimum, references-section author lines, short heading detection, and colon-based definition/title lines without touching sentence splitting or diversity selection
- Short heading detection needed one extra fragment heuristic beyond strict Title Case so sentence-case headings like "Staffing models supporting today's workforce mix." are rejected while valid prose like "Rural hospitals face ongoing staffing shortages." still passes
- buildFewShotContextBlock now uses a richer instruction header with explicit style dimensions (sentence structure, vocabulary, tone, transitions) and preserves whole numbered example sentences by stopping before the next sentence would exceed the few-shot length budget.
- The richer header required raising MAX_FEWSHOT_CONTEXT_LENGTH to 3000 while leaving MAX_PROFILE_LENGTH unchanged.
- In llm.ts, few-shot mode now returns Pass1 output directly for single rewrites and skips alternative-suggestion Pass2 refinement entirely, preserving author-style signal while keeping non-few-shot call counts unchanged.
