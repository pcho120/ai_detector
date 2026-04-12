# Learnings — bulk-rewrite-engine-v2

## [2026-04-12] Session Start

### Codebase Conventions
- Test framework: Vitest
- Test helpers in bulkRewrite.test.ts: `makeSentence`, `makeAnalysisResult`, `makeSuggestion`, `makeRequest`
- Mocking pattern: `vi.mock()` at top of test file, `vi.mocked().mockResolvedValueOnce()` per call
- All tests must pass: 618 baseline tests (verify count before/after)
- Commit per task (pre-commit: run relevant test suite)

### Key File Locations
- Engine: `src/lib/bulk-rewrite/bulkRewrite.ts` (151 lines)
- Types: `src/lib/bulk-rewrite/types.ts` (101 lines)
- LLM: `src/lib/suggestions/llm.ts` (399 lines)
- Route: `src/app/api/bulk-rewrite/route.ts` (153 lines)
- UI: `src/components/TargetScorePanel.tsx` (114 lines)
- Tests: `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts` (541 lines)

### Constants to Change
- `MAX_ROUNDS`: 3 → 10
- NEW: `DEFAULT_DEADLINE_MS = 50_000`
- NEW: `PLATEAU_THRESHOLD = 0.02`
- NEW: `PLATEAU_ROUNDS = 2`
- `_score` → `score` in `generateSingleSuggestionWithProvider` (llm.ts)

### Plateau Detection Notes
- Plateau logic should compare consecutive re-analysis scores after each completed round and reset the counter on any meaningful improvement.
- Tests are most reliable when `analyzeText` mocks use explicit `.mockResolvedValueOnce()` chains for each re-analysis step; default resolved values can mask the intended round count.

## [2026-04-12] Task 1 learnings

- The time-budget tests are most stable when `now()` mocks hold the same timestamp across all checks inside a single round, because the engine now calls the clock at deadline setup, loop guards, in-loop prechecks, per-candidate skips, and pre-analysis exits.
- Returning partial bulk rewrite results does not require changing `BulkRewriteResult`; breaking before re-analysis preserves the latest best score/rewrites while keeping the API contract intact.
