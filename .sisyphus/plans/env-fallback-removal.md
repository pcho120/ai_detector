# Remove process.env Fallbacks — Settings-Only API Key Resolution

## TL;DR

> **Quick Summary**: Remove all `process.env.*` fallbacks from production code so API keys and provider settings are sourced exclusively from user-entered Settings (delivered via request headers). The `.env.local` file becomes developer reference only.
> 
> **Deliverables**:
> - 7 production source files purged of `process.env` references
> - 10 test files updated to reflect header-only resolution
> - Documentation updated (README, .env.example, inline comments/JSDoc)
> - Zero `process.env` references remaining in production `src/` code
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (tests) → Task 2 (requestSettings) → Tasks 3-5 (parallel consumers) → Task 6 (docs) → Task 7 (verification)

---

## Context

### Original Request
User explicitly stated:
- *"그 .env.local은 너만 보라고 만들어둔거야. 실제로 코드에서는 사용 안되게 해줘."*
- *"api key들은 유저가 직접 웹앱 settings에서 입력한 key들만 사용하게 할거야"*

### Interview Summary
**Key Discussions**:
- `.env.local` is for developer/personal reference ONLY — not for the running application
- API keys must flow exclusively: User → Settings UI → localStorage → request headers → server
- `process.env.*` fallbacks in production code must be completely removed
- Default provider names (`openai`, `sapling`) should be retained as hardcoded defaults
- If user hasn't entered API keys, API calls should fail gracefully (existing error handling)

**Research Findings**:
- Settings UI, localStorage persistence, and header delivery (`useSettings` + `buildRequestHeaders`) already fully implemented and working
- `getRequestSettings()` is the central resolver — all API routes use it. But 4 additional files have their own independent `process.env` fallbacks that bypass it
- All code paths already handle missing keys gracefully (503 responses, empty arrays, FileProcessingError)
- 10 test files reference `process.env` and need updating

### Metis Review
**Identified Gaps** (addressed):
- **Missing 4 files**: Original analysis found only 3 files. Metis identified 4 more: `analyzeText.ts`, `bulkRewrite.ts`, `bulk-rewrite/route.ts`, `copyleaks.ts`
- **Double-resolution pattern**: `analyzeText.ts` independently resolves env vars even when `requestSettings.ts` already provides them via config
- **Error message references**: Error messages like `"Set DETECTION_PROVIDER to..."` reference env vars — need updating to reference Settings UI
- **JSDoc/comment staleness**: Multiple JSDoc blocks document env fallback behavior that will no longer exist
- **`COPYLEAKS_SANDBOX` flag**: Feature flag in `copyleaks.ts` — not an API key but still a `process.env` reference. Defaulting to `false` (safe default)

---

## Work Objectives

### Core Objective
Remove every `process.env.*` reference from production source code in `src/`, ensuring API keys and provider settings are resolved exclusively from request headers (sourced from user's Settings UI input).

### Concrete Deliverables
- **7 production files modified**: `requestSettings.ts`, `llm-adapter.ts`, `llm.ts`, `analyzeText.ts`, `bulkRewrite.ts`, `bulk-rewrite/route.ts`, `copyleaks.ts`
- **10 test files updated**: Remove env-fallback test cases, update assertions for header-only behavior
- **3 documentation updates**: README.md, .env.example, useSettings.ts comment
- **JSDoc/comments updated**: In all modified production files

### Definition of Done
- [x] `Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Where-Object { $_.FullName -notmatch '__tests__' -and $_.FullName -notmatch '\.test\.' } | Select-String 'process\.env'` → zero matches
- [x] `npm run test` → all tests pass
- [x] `npm run typecheck` → zero errors
- [x] `npm run lint` → zero errors

### Must Have
- All 7 production files cleared of `process.env` references
- Provider defaults retained: `'openai'` for LLM, `'sapling'` for detection
- Graceful failure when keys are missing (existing pattern: 503/empty array/FileProcessingError)
- All tests updated and passing
- Error messages reference Settings UI instead of environment variables
- JSDoc comments updated to remove env fallback documentation

### Must NOT Have (Guardrails)
- **NO new features**: No Settings validation UI, no key encryption, no "test connection" button
- **NO interface changes**: `RequestSettings` interface shape stays the same
- **NO API response format changes**: Same HTTP status codes and response bodies
- **NO script changes**: Files in `scripts/` directory are untouched
- **NO new dependencies**: No npm additions
- **NO `buildRequestHeaders()` changes**: Client-side header builder already works correctly
- **NO functional behavior changes**: Only the source of values changes (headers only vs headers+env)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: TDD (update tests first, then production code)
- **Framework**: Vitest
- **Approach**: RED (update tests to expect no env fallback) → GREEN (remove env fallbacks) → REFACTOR

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Test execution**: Bash — `npm run test`, `npm run typecheck`, `npm run lint`
- **Grep verification**: Bash — grep for zero remaining `process.env` in production code
- **Specific test runs**: Bash — `npx vitest run {specific-test-file}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — sequential TDD setup):
├── Task 1: Update requestSettings.test.ts (TDD red) [quick]
├── Task 2: Modify requestSettings.ts + verify tests pass (TDD green) [quick]

Wave 2 (Consumer files — MAX PARALLEL after Wave 1):
├── Task 3: analyzeText.ts + detection tests (depends: 2) [unspecified-high]
├── Task 4: llm-adapter.ts + llm.ts + suggestion tests (depends: 2) [quick]
├── Task 5: bulkRewrite.ts + bulk-rewrite/route.ts + copyleaks.ts + their tests (depends: 2) [unspecified-high]

Wave 3 (Documentation + Verification — after Wave 2):
├── Task 6: Documentation & comments update (depends: 3,4,5) [quick]
├── Task 7: Final verification sweep (depends: 6) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Tasks 3/4/5 (parallel) → Task 6 → Task 7 → F1-F4 → user okay
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2 | 1 |
| 2 | 1 | 3, 4, 5 | 1 |
| 3 | 2 | 6 | 2 |
| 4 | 2 | 6 | 2 |
| 5 | 2 | 6 | 2 |
| 6 | 3, 4, 5 | 7 | 3 |
| 7 | 6 | F1-F4 | 3 |
| F1-F4 | 7 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **2 tasks** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **3 tasks** — T3 → `unspecified-high`, T4 → `quick`, T5 → `unspecified-high`
- **Wave 3**: **2 tasks** — T6 → `quick`, T7 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Update requestSettings.test.ts — TDD Red Phase

  **What to do**:
  - Rewrite `src/lib/api/__tests__/requestSettings.test.ts` to remove ALL test cases that assert env var fallback behavior
  - Remove the `beforeEach`/`afterEach` env manipulation (the `process.env = { ...originalEnv }` pattern)
  - Update these specific tests:
    - `'should fall back to env var when header is empty'` (LLM Provider) → Change assertion: expect `'openai'` (hardcoded default), NOT `'anthropic'` from env
    - `'should fall back to env var when header is empty string'` (LLM API Key) → Change assertion: expect `undefined`, NOT env-key
    - `'should fall back to env var when header is empty'` (Detection Provider) → Change assertion: expect `'sapling'` (hardcoded default), NOT `'originality'` from env
    - `'should fall back to SAPLING_API_KEY for sapling provider'` → REMOVE entirely (env fallback test)
    - `'should fall back to GPTZERO_API_KEY when provider is gptzero'` → REMOVE entirely
    - `'should fall back to ORIGINALITY_API_KEY when provider is originality'` → REMOVE entirely
    - `'should fall back to WINSTON_API_KEY when provider is winston'` → REMOVE entirely
    - `'should treat empty string header as absent and fall back to env var'` → Change assertion: expect `undefined`, NOT env-key
    - `'should use case-insensitive provider lookup'` → REMOVE (tested env-based lookup)
    - `'should mix header and env var fallbacks'` (Integration) → Rewrite: when headers are missing, expect defaults/undefined, NOT env values
  - Add NEW test: `'should return undefined for all API keys when no headers provided'` — verify that without headers, llmApiKey/detectionApiKey/copyleaksEmail/copyleaksApiKey are all undefined
  - Keep tests that verify: header values are read correctly, whitespace trimming, provider defaults when no header

  **Must NOT do**:
  - Do NOT modify the production `requestSettings.ts` file yet (that's Task 2)
  - Do NOT remove tests for header-based resolution (those stay)
  - Do NOT remove the Security test section

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical test rewrite — removing/updating assertions in a single file
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None needed — straightforward test file editing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential with Task 2)
  - **Blocks**: [Task 2]
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/api/__tests__/requestSettings.test.ts:1-278` — The ENTIRE current test file. Every test case needs evaluation for env dependency

  **API/Type References**:
  - `src/lib/api/requestSettings.ts:7-14` — `RequestSettings` interface definition — the shape tests validate against

  **WHY Each Reference Matters**:
  - The test file is the ONLY reference needed — executor must read each test and decide: keep (header test), modify (change assertion from env to default/undefined), or delete (pure env fallback test)

  **Acceptance Criteria**:

  **TDD Red Phase**:
  - [ ] Test file modified: `src/lib/api/__tests__/requestSettings.test.ts`
  - [ ] `npx vitest run src/lib/api/__tests__/requestSettings.test.ts` → FAIL (because production code still has env fallbacks, tests now expect no-env behavior)
  - [ ] Zero references to `process.env` remain in the test file
  - [ ] All header-based resolution tests preserved (provider from header, API key from header, trimming)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tests fail because production code still uses env fallbacks (TDD Red)
    Tool: Bash
    Preconditions: requestSettings.ts still has process.env references
    Steps:
      1. Run: npx vitest run src/lib/api/__tests__/requestSettings.test.ts
      2. Capture output to evidence file
      3. Assert: exit code is non-zero (tests fail)
      4. Assert: output contains "FAIL" for at least one test
    Expected Result: Tests fail — confirms we wrote the right expectations
    Failure Indicators: All tests pass (would mean we didn't actually change assertions)
    Evidence: .sisyphus/evidence/task-1-tdd-red.txt

  Scenario: No process.env references in test file
    Tool: Bash
    Preconditions: Test file has been modified
    Steps:
      1. Run: Select-String -Path "src/lib/api/__tests__/requestSettings.test.ts" -Pattern "process\.env"
      2. Assert: zero matches
    Expected Result: Zero matches — test file is completely free of process.env
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-1-no-env-in-tests.txt
  ```

  **Commit**: YES (Commit 1)
  - Message: `test(settings): update tests to expect header-only resolution`
  - Files: `src/lib/api/__tests__/requestSettings.test.ts`
  - Pre-commit: `npx vitest run src/lib/api/__tests__/requestSettings.test.ts` (expected: FAIL — TDD red)

---

- [ ] 2. Remove process.env Fallbacks from requestSettings.ts — TDD Green Phase

  **What to do**:
  - Modify `src/lib/api/requestSettings.ts` to remove ALL `process.env.*` references:
    - Line 34: `process.env.LLM_PROVIDER || 'openai'` → `'openai'` (keep default only)
    - Line 37: `process.env.COACHING_LLM_API_KEY` → remove, use `headerLlmApiKey || undefined`
    - Line 40: `process.env.DETECTION_PROVIDER || 'sapling'` → `'sapling'` (keep default only)
    - Lines 44-61: Remove entire `switch` block for provider-specific env vars. Replace with: `const detectionApiKey: string | undefined = headerDetectionApiKey || undefined;`
    - Line 64: `process.env.COPYLEAKS_EMAIL` → remove, use `headerCopyleaksEmail || undefined`
    - Line 67: `process.env.COPYLEAKS_API_KEY` → remove, use `headerCopyleaksApiKey || undefined`
  - Update JSDoc comments:
    - Line 3-6: Change "Settings extracted from request headers with fallback to environment variables" → "Settings extracted from request headers. No environment variable fallback."
    - Line 17-20: Change "Extract request settings from headers, with fallback to environment variables" → "Extract request settings from request headers."
    - Line 18: Remove "Treats empty string headers as absent (falls back to env var or default)."
  - Update inline comments:
    - Line 33: `// Resolve LLM provider: header → env var → default` → `// Resolve LLM provider: header → default`
    - Line 36: `// Resolve LLM API key: non-empty header → env var → undefined` → `// Resolve LLM API key: header → undefined`
    - Line 39: `// Resolve detection provider: header → env var → default` → `// Resolve detection provider: header → default`
    - Line 42: `// Resolve detection API key: non-empty header → provider-specific env var → undefined` → `// Resolve detection API key: header → undefined`
    - Line 63: Similar comment update for copyleaks

  **Must NOT do**:
  - Do NOT change the `RequestSettings` interface shape
  - Do NOT change the function signature
  - Do NOT add new parameters or features
  - Do NOT modify any other file

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical removal of env references in a single 77-line file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential after Task 1)
  - **Blocks**: [Task 3, Task 4, Task 5]
  - **Blocked By**: [Task 1]

  **References**:

  **Pattern References**:
  - `src/lib/api/requestSettings.ts:1-77` — The ENTIRE current file. Every line with `process.env` must be modified

  **Test References**:
  - `src/lib/api/__tests__/requestSettings.test.ts` — Updated by Task 1. After this task, these tests should PASS (TDD green)

  **WHY Each Reference Matters**:
  - `requestSettings.ts` is the CENTRAL resolver — all API routes depend on it. Getting this right is the foundation for everything else
  - The updated test file defines the expected behavior

  **Acceptance Criteria**:

  **TDD Green Phase**:
  - [ ] `npx vitest run src/lib/api/__tests__/requestSettings.test.ts` → PASS (all tests green)
  - [ ] Zero `process.env` references in `src/lib/api/requestSettings.ts`
  - [ ] `getRequestSettings()` with empty request returns: `{ llmProvider: 'openai', llmApiKey: undefined, detectionProvider: 'sapling', detectionApiKey: undefined, copyleaksEmail: undefined, copyleaksApiKey: undefined }`
  - [ ] `npm run typecheck` → zero errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tests pass after removing env fallbacks (TDD Green)
    Tool: Bash
    Preconditions: requestSettings.ts modified, requestSettings.test.ts from Task 1
    Steps:
      1. Run: npx vitest run src/lib/api/__tests__/requestSettings.test.ts
      2. Capture full output
      3. Assert: exit code is 0
      4. Assert: output shows all tests passing
    Expected Result: All tests pass — env removal matches test expectations
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-2-tdd-green.txt

  Scenario: Zero process.env in requestSettings.ts
    Tool: Bash
    Preconditions: File has been modified
    Steps:
      1. Run: Select-String -Path "src/lib/api/requestSettings.ts" -Pattern "process\.env"
      2. Assert: zero matches
    Expected Result: Zero matches — file is completely clean
    Failure Indicators: Any match
    Evidence: .sisyphus/evidence/task-2-no-env.txt

  Scenario: TypeScript compiles cleanly
    Tool: Bash
    Preconditions: requestSettings.ts modified
    Steps:
      1. Run: npm run typecheck
      2. Assert: exit code 0
    Expected Result: Zero type errors
    Failure Indicators: Any type error
    Evidence: .sisyphus/evidence/task-2-typecheck.txt
  ```

  **Commit**: YES (Commit 2)
  - Message: `refactor(settings): remove process.env fallbacks from getRequestSettings`
  - Files: `src/lib/api/requestSettings.ts`
  - Pre-commit: `npx vitest run src/lib/api/__tests__/requestSettings.test.ts` (expected: PASS)

- [x] 3. Remove process.env from analyzeText.ts + copyleaks.ts + Detection Tests

  **What to do**:
  
  **analyzeText.ts** (`src/lib/analysis/analyzeText.ts`):
  - Line 21: `config?.provider ?? process.env.DETECTION_PROVIDER ?? 'sapling'` → `config?.provider ?? 'sapling'`
  - Line 38: `config?.copyleaksEmail || process.env.COPYLEAKS_EMAIL` → `config?.copyleaksEmail`
  - Line 39: `config?.copyleaksApiKey || process.env.COPYLEAKS_API_KEY` → `config?.copyleaksApiKey`
  - Line 44: `config?.apiKey ?? process.env.SAPLING_API_KEY` → `config?.apiKey`
  - Line 71: `config?.apiKey ?? process.env.WINSTON_API_KEY` → `config?.apiKey`
  - Line 82: `config?.apiKey ?? process.env.ORIGINALITY_API_KEY` → `config?.apiKey`
  - Line 93: `config?.apiKey ?? process.env.GPTZERO_API_KEY` → `config?.apiKey`
  - Line 106: Error message `"Set DETECTION_PROVIDER to..."` → `"Unknown detection provider: \"${provider}\". Select a valid detection provider in Settings (sapling, winston, originality, or gptzero)."`
  - Update comment on line 37: Remove "header/config → env var → undefined" → "config → undefined"

  **copyleaks.ts** (`src/lib/detection/copyleaks.ts`):
  - Line 90: `sandbox ?? process.env.COPYLEAKS_SANDBOX === 'true'` → `sandbox ?? false`
  - Update comment on line 89: Remove "fall back to env var" → "default to false"

  **Test files to update**:
  - `src/lib/detection/__tests__/detection-factory.test.ts` — Remove env var mocking/assertions for detection provider resolution
  - `src/lib/detection/__tests__/copyleaks.test.ts` — Remove env var mocking for COPYLEAKS_SANDBOX
  - `tests/integration/analyze-route.test.ts` — Remove any env var setup, use header-based settings only
  - `tests/integration/analyze-revised-route.test.ts` — Same treatment

  **Must NOT do**:
  - Do NOT change `createAnalysisDetectionAdapter`'s function signature or parameter types
  - Do NOT change error handling patterns (FileProcessingError throws stay)
  - Do NOT modify `analyzeText()` function (it doesn't use process.env)
  - Do NOT change `CopyleaksDetectionAdapter` constructor signature

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple files across detection layer + 4 test files, requires understanding cross-file relationships
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: [Task 6]
  - **Blocked By**: [Task 2]

  **References**:

  **Pattern References**:
  - `src/lib/analysis/analyzeText.ts:1-131` — Full file, focus on lines with `process.env`
  - `src/lib/detection/copyleaks.ts:80-91` — Constructor with sandbox env fallback

  **Test References**:
  - `src/lib/detection/__tests__/detection-factory.test.ts` — Tests for `createAnalysisDetectionAdapter()`
  - `src/lib/detection/__tests__/copyleaks.test.ts` — Tests for Copyleaks adapter
  - `tests/integration/analyze-route.test.ts` — Integration tests for /api/analyze
  - `tests/integration/analyze-revised-route.test.ts` — Integration tests for /api/analyze/revised

  **API/Type References**:
  - `src/lib/api/requestSettings.ts` — After Task 2, this is env-free. `analyzeText.ts` receives config from API routes which use `getRequestSettings()`

  **WHY Each Reference Matters**:
  - `analyzeText.ts` has the MOST `process.env` references (7). It's the highest-risk file because it independently resolves env vars even when callers already provide config from `getRequestSettings()`
  - `copyleaks.ts` is simple (1 reference) but the `COPYLEAKS_SANDBOX` flag is a feature flag, not an API key — needs different treatment (default to `false`)
  - Test files must stop mocking env vars for detection and instead provide config directly

  **Acceptance Criteria**:
  - [ ] Zero `process.env` in `src/lib/analysis/analyzeText.ts`
  - [ ] Zero `process.env` in `src/lib/detection/copyleaks.ts`
  - [ ] `createAnalysisDetectionAdapter()` with no config → throws FileProcessingError "Detection service is not configured."
  - [ ] `createAnalysisDetectionAdapter({ provider: 'sapling', apiKey: 'test-key' })` → returns SaplingDetectionAdapter
  - [ ] `npm run test` → all detection-related tests pass

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: analyzeText.ts has zero process.env references
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Run: Select-String -Path "src/lib/analysis/analyzeText.ts" -Pattern "process\.env"
      2. Assert: zero matches
    Expected Result: Zero matches
    Failure Indicators: Any match
    Evidence: .sisyphus/evidence/task-3-analyzetext-no-env.txt

  Scenario: copyleaks.ts has zero process.env references
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Run: Select-String -Path "src/lib/detection/copyleaks.ts" -Pattern "process\.env"
      2. Assert: zero matches
    Expected Result: Zero matches
    Failure Indicators: Any match
    Evidence: .sisyphus/evidence/task-3-copyleaks-no-env.txt

  Scenario: Detection tests pass
    Tool: Bash
    Preconditions: All detection files modified
    Steps:
      1. Run: npx vitest run src/lib/detection/__tests__/ tests/integration/analyze-route.test.ts tests/integration/analyze-revised-route.test.ts
      2. Assert: exit code 0, all tests pass
    Expected Result: All tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-3-detection-tests.txt

  Scenario: createAnalysisDetectionAdapter with no config throws
    Tool: Bash
    Preconditions: analyzeText.ts modified
    Steps:
      1. Run: npx vitest run src/lib/detection/__tests__/detection-factory.test.ts
      2. Verify test exists for no-config case → expect FileProcessingError
    Expected Result: Test passes, asserting error is thrown when no API key provided
    Failure Indicators: Test missing or failing
    Evidence: .sisyphus/evidence/task-3-no-config-throws.txt
  ```

  **Commit**: YES (Commit 3)
  - Message: `refactor(detection): remove process.env fallbacks from analysis and detection`
  - Files: `src/lib/analysis/analyzeText.ts`, `src/lib/detection/copyleaks.ts`, `src/lib/detection/__tests__/detection-factory.test.ts`, `src/lib/detection/__tests__/copyleaks.test.ts`, `tests/integration/analyze-route.test.ts`, `tests/integration/analyze-revised-route.test.ts`
  - Pre-commit: `npm run test`

---

- [x] 4. Remove process.env from llm-adapter.ts + llm.ts + Suggestion Tests

  **What to do**:
  
  **llm-adapter.ts** (`src/lib/suggestions/llm-adapter.ts`):
  - Line 67: `provider ?? process.env.LLM_PROVIDER ?? 'openai'` → `provider ?? 'openai'`
  - Line 68: `apiKey ?? process.env.COACHING_LLM_API_KEY` → `apiKey` (undefined if not passed)
  - Lines 60-62: Update JSDoc: Remove "Defaults to `process.env.COACHING_LLM_API_KEY` if not provided" → "API key must be provided by the caller."
  - Line 62: Update JSDoc: Remove "uses `process.env.LLM_PROVIDER`" → "defaults to 'openai'"

  **llm.ts** (`src/lib/suggestions/llm.ts`):
  - Line 237: `apiKey ?? process.env.COACHING_LLM_API_KEY` → `apiKey` (undefined if not passed)

  **Test files to update**:
  - `src/lib/suggestions/__tests__/llm-adapter.test.ts` — Remove env var mocking, test that `createLlmAdapter()` with no args uses 'openai' and undefined key
  - `tests/unit/suggestions.test.ts` — Remove env var setup for COACHING_LLM_API_KEY
  - `tests/integration/suggestions-route.test.ts` — Remove env var setup, use headers only
  - `tests/integration/voice-profile-route.test.ts` — Remove env var setup, use headers only

  **Must NOT do**:
  - Do NOT change `createLlmAdapter()` function signature
  - Do NOT change `LlmSuggestionService` constructor signature
  - Do NOT modify `OpenAiLlmAdapter` or `ClaudeLlmAdapter` implementations
  - Do NOT change `twoPassRewrite()` or `generateSingleSuggestion*()` functions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Two simple production files (2 lines each) + test updates
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5)
  - **Blocks**: [Task 6]
  - **Blocked By**: [Task 2]

  **References**:

  **Pattern References**:
  - `src/lib/suggestions/llm-adapter.ts:57-81` — Factory function with env fallbacks
  - `src/lib/suggestions/llm.ts:233-238` — LlmSuggestionService constructor

  **Test References**:
  - `src/lib/suggestions/__tests__/llm-adapter.test.ts` — Adapter factory tests
  - `tests/unit/suggestions.test.ts` — Unit tests for suggestion generation
  - `tests/integration/suggestions-route.test.ts` — /api/suggestions integration tests
  - `tests/integration/voice-profile-route.test.ts` — /api/voice-profile integration tests

  **WHY Each Reference Matters**:
  - `llm-adapter.ts` is the LLM adapter factory — callers (API routes) already pass keys from `getRequestSettings()`, so the env fallback is redundant
  - `llm.ts` constructor fallback is a secondary safety net — removing it ensures the caller MUST provide the key

  **Acceptance Criteria**:
  - [ ] Zero `process.env` in `src/lib/suggestions/llm-adapter.ts`
  - [ ] Zero `process.env` in `src/lib/suggestions/llm.ts`
  - [ ] `createLlmAdapter()` with no args → returns OpenAiLlmAdapter with undefined apiKey
  - [ ] `new LlmSuggestionService()` with no args → `this.apiKey` is undefined
  - [ ] All suggestion-related tests pass

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: llm-adapter.ts and llm.ts have zero process.env references
    Tool: Bash
    Preconditions: Both files modified
    Steps:
      1. Run: Select-String -Path "src/lib/suggestions/llm-adapter.ts","src/lib/suggestions/llm.ts" -Pattern "process\.env"
      2. Assert: zero matches
    Expected Result: Zero matches across both files
    Failure Indicators: Any match
    Evidence: .sisyphus/evidence/task-4-llm-no-env.txt

  Scenario: Suggestion tests pass
    Tool: Bash
    Preconditions: All LLM files modified
    Steps:
      1. Run: npx vitest run src/lib/suggestions/__tests__/ tests/unit/suggestions.test.ts tests/integration/suggestions-route.test.ts tests/integration/voice-profile-route.test.ts
      2. Assert: exit code 0
    Expected Result: All tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-4-suggestion-tests.txt
  ```

  **Commit**: YES (Commit 4)
  - Message: `refactor(llm): remove process.env fallbacks from LLM adapter and service`
  - Files: `src/lib/suggestions/llm-adapter.ts`, `src/lib/suggestions/llm.ts`, `src/lib/suggestions/__tests__/llm-adapter.test.ts`, `tests/unit/suggestions.test.ts`, `tests/integration/suggestions-route.test.ts`, `tests/integration/voice-profile-route.test.ts`
  - Pre-commit: `npm run test`

---

- [x] 5. Remove process.env from bulk-rewrite Route + Service

  **What to do**:
  
  **bulk-rewrite/route.ts** (`src/app/api/bulk-rewrite/route.ts`):
  - Line 85: `settings.llmApiKey ?? process.env.COACHING_LLM_API_KEY` → `settings.llmApiKey`
  - This is the ONLY remaining env fallback outside the core modules

  **bulkRewrite.ts** (`src/lib/bulk-rewrite/bulkRewrite.ts`):
  - Line 86: `config?.llmApiKey ?? process.env.COACHING_LLM_API_KEY` → `config?.llmApiKey`

  **Test files to update**:
  - `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts` — Remove env var mocking for COACHING_LLM_API_KEY

  **Must NOT do**:
  - Do NOT change `executeBulkRewrite()` function signature
  - Do NOT change the route's HTTP response format or status codes
  - Do NOT change request validation logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Route file + service file + test file — needs understanding of how they interact
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4)
  - **Blocks**: [Task 6]
  - **Blocked By**: [Task 2]

  **References**:

  **Pattern References**:
  - `src/app/api/bulk-rewrite/route.ts:83-94` — Lines 85 is the env fallback, wrapped in API key check
  - `src/lib/bulk-rewrite/bulkRewrite.ts:86-87` — Line 86 is the env fallback in service

  **Test References**:
  - `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts` — Bulk rewrite service tests

  **API/Type References**:
  - `src/lib/api/requestSettings.ts` — `getRequestSettings()` is called on line 83 of route.ts; after Task 2, it returns header-only values

  **WHY Each Reference Matters**:
  - `route.ts` line 85 has a REDUNDANT env fallback — `getRequestSettings()` already tries to get the key from headers. This line re-adds env as a secondary fallback, completely undermining Task 2's work
  - `bulkRewrite.ts` line 86 has the same pattern — redundant env fallback after config already provides the value

  **Acceptance Criteria**:
  - [ ] Zero `process.env` in `src/app/api/bulk-rewrite/route.ts`
  - [ ] Zero `process.env` in `src/lib/bulk-rewrite/bulkRewrite.ts`
  - [ ] Bulk rewrite returns 503 when no LLM API key in headers
  - [ ] All bulk-rewrite tests pass

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: bulk-rewrite files have zero process.env references
    Tool: Bash
    Preconditions: Both files modified
    Steps:
      1. Run: Select-String -Path "src/app/api/bulk-rewrite/route.ts","src/lib/bulk-rewrite/bulkRewrite.ts" -Pattern "process\.env"
      2. Assert: zero matches
    Expected Result: Zero matches
    Failure Indicators: Any match
    Evidence: .sisyphus/evidence/task-5-bulk-no-env.txt

  Scenario: Bulk rewrite tests pass
    Tool: Bash
    Preconditions: Files modified
    Steps:
      1. Run: npx vitest run src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts
      2. Assert: exit code 0
    Expected Result: All tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-5-bulk-tests.txt
  ```

  **Commit**: YES (Commit 5)
  - Message: `refactor(api): remove process.env fallbacks from bulk-rewrite`
  - Files: `src/app/api/bulk-rewrite/route.ts`, `src/lib/bulk-rewrite/bulkRewrite.ts`, `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts`
  - Pre-commit: `npm run test`

- [x] 6. Documentation & Comments Update

  **What to do**:
  
  **useSettings.ts** (`src/hooks/useSettings.ts`):
  - Line 57: Change comment `"Empty strings are omitted from headers (to trigger server-side env var fallback)."` → `"Empty strings are omitted from headers. Server returns defaults or undefined when headers are absent."`

  **README.md** (root):
  - Update the "Deployment" section (around lines 56-63):
    - Remove: "Set the following environment variables in your deployment dashboard: SAPLING_API_KEY, COACHING_LLM_API_KEY"
    - Replace with: "API keys are configured through the in-app Settings modal. No server-side environment variables are required for API key configuration."
    - Keep the runtime note about Node.js

  **.env.example** (root):
  - Add a header comment at line 1: `# DEVELOPER REFERENCE ONLY — These values are NOT used by the running application.`
  - Add: `# API keys must be entered by the user through the in-app Settings modal.`
  - Add: `# This file documents the available configuration keys for development reference.`
  - Keep existing variable listings as documentation reference

  **Error messages** (already handled in Tasks 3-4, but verify):
  - `analyzeText.ts` line 106: Should reference Settings, not env vars (done in Task 3)
  - `llm-adapter.ts` line 78: `"Set LLM_PROVIDER to..."` → `"Unknown LLM provider: \"${resolvedProvider}\". Select \"openai\" or \"anthropic\" in Settings."` (verify Task 4 handled this)

  **Must NOT do**:
  - Do NOT add new documentation files
  - Do NOT change useSettings.ts logic (only the comment)
  - Do NOT change buildRequestHeaders() behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Comment and documentation updates only — no logic changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Wave 2 completes)
  - **Blocks**: [Task 7]
  - **Blocked By**: [Task 3, Task 4, Task 5]

  **References**:

  **Pattern References**:
  - `src/hooks/useSettings.ts:53-58` — Comment block to update
  - `README.md:56-63` — Deployment section to rewrite
  - `.env.example:1-25` — Add reference-only header

  **WHY Each Reference Matters**:
  - `useSettings.ts` comment explicitly says "to trigger server-side env var fallback" — now misleading
  - README tells users to set env vars — now incorrect for API keys
  - `.env.example` implies these are runtime-used variables — needs clarification

  **Acceptance Criteria**:
  - [ ] `useSettings.ts` comment no longer mentions env var fallback
  - [ ] README.md deployment section references Settings modal, not env vars
  - [ ] `.env.example` has developer-reference-only header
  - [ ] `npm run lint` → zero errors (catches any formatting issues)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: useSettings.ts comment updated
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Run: Select-String -Path "src/hooks/useSettings.ts" -Pattern "env var fallback"
      2. Assert: zero matches
    Expected Result: Old comment removed
    Failure Indicators: Old comment still present
    Evidence: .sisyphus/evidence/task-6-usesettings-comment.txt

  Scenario: README references Settings modal
    Tool: Bash
    Preconditions: README modified
    Steps:
      1. Run: Select-String -Path "README.md" -Pattern "Settings modal"
      2. Assert: at least one match
      3. Run: Select-String -Path "README.md" -Pattern "Set the following environment variables"
      4. Assert: zero matches
    Expected Result: Settings modal referenced, old env var instructions removed
    Failure Indicators: Old instructions present or new reference missing
    Evidence: .sisyphus/evidence/task-6-readme.txt

  Scenario: .env.example has reference-only header
    Tool: Bash
    Preconditions: File modified
    Steps:
      1. Run: Select-String -Path ".env.example" -Pattern "DEVELOPER REFERENCE ONLY"
      2. Assert: at least one match
    Expected Result: Header present
    Failure Indicators: Header missing
    Evidence: .sisyphus/evidence/task-6-env-example.txt

  Scenario: Lint passes
    Tool: Bash
    Steps:
      1. Run: npm run lint
      2. Assert: exit code 0
    Expected Result: Zero lint errors
    Failure Indicators: Any lint error
    Evidence: .sisyphus/evidence/task-6-lint.txt
  ```

  **Commit**: YES (Commit 6)
  - Message: `docs: update documentation for settings-only API key resolution`
  - Files: `README.md`, `.env.example`, `src/hooks/useSettings.ts`
  - Pre-commit: `npm run lint`

---

- [x] 7. Final Verification Sweep — Zero process.env in Production Code

  **What to do**:
  - Run comprehensive grep to verify ZERO `process.env` references remain in production `src/` code (excluding test files)
  - Run the full test suite: `npm run test`
  - Run TypeScript compiler: `npm run typecheck`
  - Run linter: `npm run lint`
  - Verify that ALL 7 production files are clean:
    1. `src/lib/api/requestSettings.ts`
    2. `src/lib/analysis/analyzeText.ts`
    3. `src/lib/detection/copyleaks.ts`
    4. `src/lib/suggestions/llm-adapter.ts`
    5. `src/lib/suggestions/llm.ts`
    6. `src/app/api/bulk-rewrite/route.ts`
    7. `src/lib/bulk-rewrite/bulkRewrite.ts`
  - If ANY `process.env` reference is found in production code: identify the file and line, fix it, re-run verification

  **Must NOT do**:
  - Do NOT touch test files (they legitimately use process.env for mocking)
  - Do NOT touch `scripts/` directory files
  - Do NOT touch `next.config.*` or build configuration files (they may legitimately use NODE_ENV etc.)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification only — run commands, check output, no code changes expected
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 6)
  - **Blocks**: [F1, F2, F3, F4]
  - **Blocked By**: [Task 6]

  **References**:

  **Pattern References**:
  - All 7 production files listed above — verify each is clean

  **WHY Each Reference Matters**:
  - This is the final safety net. Even if individual tasks claim zero env references, this task independently verifies the ENTIRE src/ directory

  **Acceptance Criteria**:
  - [ ] PowerShell grep: `Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Where-Object { $_.FullName -notmatch '__tests__' -and $_.FullName -notmatch '\.test\.' } | Select-String 'process\.env'` → zero matches
  - [ ] `npm run test` → all tests pass (exact count captured)
  - [ ] `npm run typecheck` → zero errors
  - [ ] `npm run lint` → zero errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Zero process.env in production source code
    Tool: Bash
    Preconditions: All Tasks 1-6 completed
    Steps:
      1. Run: Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Where-Object { $_.FullName -notmatch '__tests__' -and $_.FullName -notmatch '\.test\.' } | Select-String 'process\.env'
      2. Capture output
      3. Assert: zero matches (empty output)
    Expected Result: No process.env in any production .ts/.tsx file
    Failure Indicators: Any match → must fix before proceeding
    Evidence: .sisyphus/evidence/task-7-zero-env-grep.txt

  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. Run: npm run test
      2. Capture output with test counts
      3. Assert: exit code 0, all tests pass
    Expected Result: All tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-7-full-tests.txt

  Scenario: TypeScript and lint clean
    Tool: Bash
    Steps:
      1. Run: npm run typecheck
      2. Assert: exit code 0
      3. Run: npm run lint
      4. Assert: exit code 0
    Expected Result: Zero type errors, zero lint errors
    Failure Indicators: Any error
    Evidence: .sisyphus/evidence/task-7-typecheck-lint.txt
  ```

  **Commit**: NO (verification only — no code changes)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck` + `npm run lint` + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message | Files | Pre-commit Check |
|--------|---------|-------|-----------------|
| 1 | `test(settings): update tests to expect header-only resolution` | `src/lib/api/__tests__/requestSettings.test.ts` | `npx vitest run src/lib/api/__tests__/requestSettings.test.ts` (expected: FAIL) |
| 2 | `refactor(settings): remove process.env fallbacks from getRequestSettings` | `src/lib/api/requestSettings.ts` | `npx vitest run src/lib/api/__tests__/requestSettings.test.ts` (expected: PASS) |
| 3 | `refactor(detection): remove process.env fallbacks from analysis and detection` | `src/lib/analysis/analyzeText.ts`, `src/lib/detection/copyleaks.ts`, `src/lib/detection/__tests__/detection-factory.test.ts`, `src/lib/detection/__tests__/copyleaks.test.ts`, `tests/integration/analyze-route.test.ts`, `tests/integration/analyze-revised-route.test.ts` | `npm run test` |
| 4 | `refactor(llm): remove process.env fallbacks from LLM adapter and service` | `src/lib/suggestions/llm-adapter.ts`, `src/lib/suggestions/llm.ts`, `src/lib/suggestions/__tests__/llm-adapter.test.ts`, `tests/unit/suggestions.test.ts`, `tests/integration/suggestions-route.test.ts`, `tests/integration/voice-profile-route.test.ts` | `npm run test` |
| 5 | `refactor(api): remove process.env fallbacks from bulk-rewrite` | `src/app/api/bulk-rewrite/route.ts`, `src/lib/bulk-rewrite/bulkRewrite.ts`, `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts` | `npm run test` |
| 6 | `docs: update documentation for settings-only API key resolution` | `README.md`, `.env.example`, `src/hooks/useSettings.ts` | `npm run lint` |

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck   # Expected: zero errors
npm run lint        # Expected: zero errors  
npm run test        # Expected: all tests pass
# Grep for zero process.env in production code (PowerShell):
Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Where-Object { $_.FullName -notmatch '__tests__' -and $_.FullName -notmatch '\.test\.' } | Select-String 'process\.env'
# Expected: zero matches
```

### Final Checklist
- [x] All 7 production files cleared of `process.env`
- [x] All 10 test files updated
- [x] README.md deployment section updated
- [x] .env.example has developer-reference-only header
- [x] useSettings.ts comment updated
- [x] All JSDoc blocks updated
- [x] Error messages reference Settings UI
- [x] All tests pass
- [x] TypeScript compiles cleanly
- [x] Lint passes
