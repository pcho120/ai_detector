## 2026-04-07T17:38:52.202Z Task: initialization
Plan initialized for target-score-rewrite.

Key inherited decisions:
- Target score input range is 10-100 percent.
- Bulk rewrite prioritizes high-score sentences first and preserves manual replacements.
- Bulk rewrite uses generateSingleSuggestion, not generateAlternativeSuggestions.
- Re-analysis should happen once per round, not per sentence.
- Concurrency target is 5 parallel LLM calls.

## 2026-04-07 Task 2: bulk rewrite core
- Added `executeBulkRewrite` with score-desc candidate prioritization and a hard floor of `score >= 0.4` per round.
- Preserved reducer compatibility by returning rewrites as `Record<number, string>` keyed by `sentenceIndex`.
- Re-analysis is executed once after each rewrite round using `analyzeText`, not per sentence.
- Implemented internal promise-worker limiter (max 5 concurrent tasks) with no external dependency.

## 2026-04-07 Task 4: /api/bulk-rewrite route
- Route follows exact same pattern as /api/suggestions: `export const runtime = 'nodejs'`, JSON body parse with try/catch, typed guard function, then business logic.
- `COACHING_LLM_API_KEY` absence returns 503 with `{ error: 'SERVICE_UNAVAILABLE', message }` before calling executeBulkRewrite (executeBulkRewrite also reads the key internally, but early 503 keeps the contract clear).
- `manualReplacements` keys arrive as strings from JSON; must convert `Number(k)` when constructing the typed `Record<number, string>`.
- `voiceProfile` is passed through `sanitizeVoiceProfile` from suggestions lib, consistent with /api/suggestions pattern.
- `targetScore` validated as `10 <= x <= 100` in the route; executeBulkRewrite normalizes to 0-1 internally.
- LSP diagnostics: 0 errors. `npm run typecheck`: PASSED.

## 2026-04-07 Task 6: unit & integration tests
- vitest.config.ts `include` extended with `src/**/__tests__/**/*.test.ts{x}` so tests in `src/` directories are picked up without moving files.
- All 6 pre-existing failures are Windows `/tmp` path issues in unrelated test files (`tests/unit/temp.test.ts`, `tests/integration/analyze-route.test.ts`); they existed before this task.
- New test files: `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts` (20 tests, all green) and `src/components/__tests__/TargetScorePanel.test.tsx` (34 tests, all green).
- `executeBulkRewrite` mocks: `@/lib/analysis/analyzeText`, `@/lib/suggestions/llm`, `@/lib/suggestions/guardrails`. The function reads `process.env.COACHING_LLM_API_KEY` directly (not injected), so env var must be set in beforeEach for round-trip tests.
- Short-circuit path: if initial `analyzeText` score ≤ normalized target, returns immediately with `iterations=0`, `rewrites={}`.
- Guardrail mock defaults to pass-through (`(s) => s`); override with `mockReturnValueOnce([])` to simulate rejection.
- Progress callback tested by asserting both 'rewriting' and 'analyzing' phase calls are emitted in a single-round test.
