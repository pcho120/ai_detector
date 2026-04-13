# Learnings — env-fallback-removal

## [2026-04-11] Plan Start

### Architecture
- `getRequestSettings()` in `src/lib/api/requestSettings.ts` is the CENTRAL resolver — all 6 API routes use it
- Settings flow: User → Settings UI → localStorage → buildRequestHeaders() → x-* request headers → getRequestSettings()
- All code paths already handle missing keys gracefully: 503 response / empty array / FileProcessingError

### Files with process.env (ALL must be cleaned)
1. `src/lib/api/requestSettings.ts` — 9 env references (central resolver)
2. `src/lib/analysis/analyzeText.ts` — 7 env references (independent resolver — double-resolution pattern)
3. `src/lib/detection/copyleaks.ts` — 1 env reference (COPYLEAKS_SANDBOX feature flag → default false)
4. `src/lib/suggestions/llm-adapter.ts` — 2 env references (LLM_PROVIDER, COACHING_LLM_API_KEY)
5. `src/lib/suggestions/llm.ts` — 1 env reference (LlmSuggestionService constructor)
6. `src/app/api/bulk-rewrite/route.ts` — 1 env reference (REDUNDANT — after getRequestSettings)
7. `src/lib/bulk-rewrite/bulkRewrite.ts` — 1 env reference (COACHING_LLM_API_KEY)

### Test Files with process.env (must update)
1. `src/lib/api/__tests__/requestSettings.test.ts` — heavy rewrite (env fallback tests → removed)
2. `src/lib/suggestions/__tests__/llm-adapter.test.ts`
3. `src/lib/detection/__tests__/detection-factory.test.ts`
4. `src/lib/detection/__tests__/copyleaks.test.ts`
5. `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts`
6. `tests/unit/suggestions.test.ts`
7. `tests/integration/suggestions-route.test.ts`
8. `tests/integration/analyze-route.test.ts`
9. `tests/integration/analyze-revised-route.test.ts`
10. `tests/integration/voice-profile-route.test.ts`

### Provider Defaults (keep)
- LLM: `'openai'` (hardcoded default)
- Detection: `'sapling'` (hardcoded default)
- API Keys: `undefined` if not in headers (NO default)

### Conventions
- Error messages: reference "Settings" UI, not "Set X environment variable"
- COPYLEAKS_SANDBOX defaults to `false` (not a user-configurable key)
# Task 6 notes
- Updated docs/comments to describe settings-only API key resolution; no logic changes in `useSettings.ts`.
- Lint passed and evidence files were written under `.sisyphus/evidence/task-6-*.txt`.
# Task 7 verification
- Production grep over src/ (non-test .ts/.tsx): zero matches for process.env.
- Verified target files individually: requestSettings.ts, analyzeText.ts, copyleaks.ts, llm-adapter.ts, llm.ts, route.ts, bulkRewrite.ts ? all clean.
- npm run test: 26 test files, 618 tests passed.
- npm run typecheck: passed.
- npm run lint: passed.
