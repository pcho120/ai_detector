# LlmAdapter Wave 1 Implementation

## Architecture Patterns
- Followed DetectionAdapter pattern from `src/lib/detection/types.ts:42-49`
- Provider-agnostic interface with factory function for runtime selection
- Factory normalizes provider to lowercase for consistent matching
- Default provider: `openai`
- Default apiKey: `process.env.COACHING_LLM_API_KEY`

## Key Decisions
- Used dynamic `require()` in factory to avoid circular dependencies
- Adapter shells throw `FileProcessingError('DETECTION_FAILED')` with descriptive messages
- LlmCompletionRequest includes optional `voiceProfile` for future context-aware rewrites
- Kept API key parameter optional to enable dependency injection for testing

## Files Created
1. `src/lib/suggestions/llm-adapter.ts` - Core interface and factory
2. `src/lib/suggestions/adapters/openai.ts` - OpenAI adapter shell
3. `src/lib/suggestions/adapters/anthropic.ts` - Claude adapter shell

## Compatibility Notes
- Existing `llm.ts` calls OpenAI directly (hardcoded)
- This foundation enables future refactoring to use adapters
- Error handling uses `FileProcessingError('DETECTION_FAILED')` for consistency

## Detection Adapters Wave 1 (Task 2)

### Implementation Pattern
- Created three stub adapters following exact Sapling pattern:
  - `WinstonDetectionAdapter` 
  - `OriginalityDetectionAdapter`
  - `GPTZeroDetectionAdapter`
- Location: `src/lib/detection/adapters/{winston,originality,gptzero}.ts`
- Each implements `DetectionAdapter` interface from `../types`

### Adapter Contract Details
- Constructor accepts `_apiKey: string` parameter (underscore prefix = unused in stub)
- `detect(_text: string): Promise<DetectionResult>` throws `FileProcessingError('DETECTION_FAILED', '<Provider> adapter is not yet implemented.')`
- Imports: `DetectionAdapter`, `DetectionResult` from `../types`; `FileProcessingError` from `../../files/errors`
- Error messages per spec:
  - Winston: "Winston AI adapter is not yet implemented."
  - Originality: "Originality.ai adapter is not yet implemented."
  - GPTZero: "GPTZero adapter is not yet implemented."

### Verification
- All three files pass `npm run typecheck` with no errors or warnings
- LSP diagnostics clean on all three files
- Directory structure: `src/lib/detection/adapters/` created successfully
- Pattern mirrors `src/lib/detection/sapling.ts` structure exactly

### Extension Pattern
- These stubs establish the pattern for future provider implementations
- All providers will follow same `DetectionAdapter` interface
- Future factory function can switch providers via settings/env vars
- Typed error handling (`FileProcessingError`) enables consistent route/status responses

## Task 3: OpenAiLlmAdapter + ClaudeLlmAdapter Stub

### Implementation Details
- `OpenAiLlmAdapter.complete()` and `completeMulti()` both hit `https://api.openai.com/v1/chat/completions` with `model: 'gpt-4o-mini'`
- Temperature and maxTokens are request-driven (no hardcoded defaults in adapter — callers own those)
- Local `ChatChoice` and `ChatCompletionResponse` types defined inside `openai.ts` — not exported
- Removed unused `FileProcessingError` import from `openai.ts` (adapter returns `null` on all failure paths rather than throwing)

### Error Handling Semantics (preserved from llm.ts)
- Network/fetch throw → `null`
- Non-OK HTTP response → `null`
- JSON parse failure → `null`
- Missing `choices[0].message.content` → `null`
- Success → `{ content }` (raw string, no parsing)

### ClaudeLlmAdapter Stub
- Both methods throw `FileProcessingError('DETECTION_FAILED', 'Anthropic Claude adapter is not yet implemented.')`
- Underscore-prefixed `_request` param to suppress unused parameter lint warnings
- Comment at top of file notes that Anthropic response shape uses `content[0].text` vs OpenAI's `choices[0].message.content`

### Gotcha
- `completeMulti` is structurally identical to `complete` in the OpenAI adapter — the prompt-building differentiation happens at the call site, not inside the adapter. The adapter is intentionally prompt-agnostic.

## Task 4: Detection Provider Factory (DETECTION_PROVIDER env var)

### Implementation Pattern
- `createAnalysisDetectionAdapter()` now supports all four detection providers via switch statement
- Provider selection: `(process.env.DETECTION_PROVIDER ?? 'sapling').toLowerCase()`
- Each case block reads provider-specific API key: `SAPLING_API_KEY`, `WINSTON_API_KEY`, `ORIGINALITY_API_KEY`, `GPTZERO_API_KEY`
- Missing key in any supported provider → `FileProcessingError('DETECTION_FAILED', 'Detection service is not configured.')`
- Unknown provider → `FileProcessingError('DETECTION_FAILED', 'Unknown detection provider: "${provider}". Set DETECTION_PROVIDER to "sapling", "winston", "originality", or "gptzero".')`

### Key Gotcha
- The exact error message `'Detection service is not configured.'` is load-bearing
- Two routes (analyze/route.ts and analyze/revised/route.ts) string-match this message to decide 503 vs 502 status codes
- Do NOT change this message without auditing the route handlers
- Preserves backward compatibility: defaults to sapling provider if env var unset

### Imports Added
- `WinstonDetectionAdapter` from `'@/lib/detection/adapters/winston'`
- `OriginalityDetectionAdapter` from `'@/lib/detection/adapters/originality'`
- `GPTZeroDetectionAdapter` from `'@/lib/detection/adapters/gptzero'`
- SaplingDetectionAdapter import already existed

### Verification
- `npm run typecheck` passes with no errors
- `lsp_diagnostics` clean on modified file
- `analyzeText()` signature unchanged
- All four providers properly instantiated with their respective API keys

## Task 5: llm.ts Delegating Through LlmAdapter

### What Changed
- Removed `ChatChoice`, `ChatCompletionResponse`, `callChatCompletions`, `callChatCompletionsMulti` from `llm.ts`
- Added `import { createLlmAdapter } from './llm-adapter'`
- All three call sites now create `const adapter = createLlmAdapter(apiKey)` and call `adapter.complete(...)` or `adapter.completeMulti(...)`

### Migration Pattern
- `callChatCompletions(apiKey, sentence, score)` → `adapter.complete({ systemPrompt: SYSTEM_PROMPT, userPrompt: buildUserPrompt(sentence, score), temperature: 0.4, maxTokens: 256 })`
- `callChatCompletionsMulti(apiKey, sentence, score, voiceProfile)` → `adapter.completeMulti({ systemPrompt: MULTI_SYSTEM_PROMPT, userPrompt: buildMultiUserPrompt(sentence, score, voiceProfile), temperature: 0.7, maxTokens: 768 })`
- Return type from adapter is `LlmCompletionResponse | null` (`.content: string`), so parsing step comes after null check

### Recovery Path
- `generateAlternativeSuggestions` recovery retry reuses the same `adapter` instance (already created at function top) — no second `createLlmAdapter` call needed

### LlmSuggestionService.suggest()
- Now calls `createLlmAdapter(this.apiKey)` once before the loop, reuses for all entries

### Verification
- `lsp_diagnostics` clean on `llm.ts`
- `npm run typecheck` passes with no errors

## Task 8: Updated .env.example Documentation

### Changes Made
- Expanded `.env.example` to document provider selection strategy
- Added `LLM_PROVIDER` with options (openai, anthropic)
- Added `DETECTION_PROVIDER` with options (sapling, winston, originality, gptzero)
- Changed `COACHING_LLM_API_KEY` placeholder from `your_openai_api_key_here` to `your_llm_api_key_here` (provider-agnostic)
- Added all four detection API key placeholders (three commented out, only SAPLING_API_KEY active by default)
- Preserved backward compatibility: existing env var names unchanged

### Design Rationale
- Comments clarify that only the selected provider's API key is required
- Default values (openai, sapling) match current implementation
- Future settings-based switching can reference this schema
- Maintains existing `.env.local` files for users already deployed

### Verification
- All required variables present: LLM_PROVIDER, DETECTION_PROVIDER, COACHING_LLM_API_KEY, SAPLING_API_KEY
- No env var names changed from existing codebase
- File ready for documentation updates or future UI settings

## Task 6: Voice Profile Generate Route Refactoring

### What Changed
- Removed local `ChatChoice` and `ChatCompletionResponse` type definitions
- Removed private `callProfileGeneration` function (43 lines of OpenAI fetch logic)
- Added import: `import { createLlmAdapter } from '@/lib/suggestions/llm-adapter'`

### Migration Pattern
- POST handler now creates `const adapter = createLlmAdapter(apiKey)` after apiKey presence check
- Calls `adapter.complete({ systemPrompt, userPrompt: userContent, temperature: 0.4, maxTokens: 512 })`
- Extracts: `const rawProfile = response?.content ?? null`

### Key Preservation
- Request/response types `VoiceProfileRequest` and `VoiceProfileResponse` unchanged
- Validation logic for presets, writingSample, languageHint untouched
- All three 503 response paths preserved (missing key, generation failure, sanitization failure)
- `COACHING_LLM_API_KEY` env read remains in route (route owns apiKey presence check)
- Language resolution and prompt building unmodified

### Verification
- `npm run typecheck` passes with no errors
- LSP diagnostics clean on modified route
- File now delegates to provider-agnostic adapter following DetectionAdapter pattern


## Task 7: Unit Tests for Factory Functions

### Gotcha: Dynamic require() in Vitest ESM environment

**Problem**: `llm-adapter.ts` originally used `require('./adapters/openai')` and `require('./adapters/anthropic')` inside the `switch` cases. In Vitest's ESM (Node.js) environment, these dynamic `require()` calls with relative paths fail with `Cannot find module './adapters/openai'`. This caused 80 test failures across all test suites that hit the LLM factory.

**Fix**: Replaced dynamic `require()` with static ES imports at the top of the file:
```typescript
import { OpenAiLlmAdapter } from './adapters/openai';
import { ClaudeLlmAdapter } from './adapters/anthropic';
```
The `switch` cases now instantiate directly. Behavior is identical at runtime; tree-shaking is not a concern server-side.

**Rule**: Never use `require()` in ESM modules. Always use static `import` at the top of the file. Dynamic imports (`import()`) are acceptable if laziness is truly needed.

### Test Strategy

- `beforeEach`/`afterEach` guards save and restore all env vars — never delete all and leave missing
- `saveEnv`/`restoreEnv` helpers for clean isolation across all test cases
- Used `instanceof` checks to verify factory returns correct adapter class without mocking the class
- Error tests check both `instanceof FileProcessingError` AND `.code === 'DETECTION_FAILED'`
- Missing-key message `'Detection service is not configured.'` tested with exact string match (it's load-bearing per route handlers)
- Stub adapter `detect()` tests verify `FileProcessingError` is thrown, not a generic `Error`

### Files Created
- `src/lib/suggestions/__tests__/llm-adapter.test.ts` — 12 tests covering createLlmAdapter() and ClaudeLlmAdapter stub
- `src/lib/detection/__tests__/detection-factory.test.ts` — 18 tests covering createAnalysisDetectionAdapter() and detection stubs

### Production Fix Applied
- `src/lib/suggestions/llm-adapter.ts` — Replaced dynamic `require()` with static imports (justified by test execution proving real bug)

## Lint Warning Cleanup

**Problem**: Four adapter stubs introduced by the llm-adapter plan had unused parameter warnings.

**Solution**: Store parameters in private readonly fields and explicitly reference them with `void` statements. This pattern:
- Preserves stub semantics (same thrown messages, same signatures)
- Silences ESLint `no-unused-vars` warnings
- Keeps implementation deferrable (fields ready for real logic)

**Files Fixed**:
- winston.ts, originality.ts, gptzero.ts: Added private `apiKey` field
- anthropic.ts: Already had `apiKey` field; added parameter references
- All four: Added `void param` statements in methods

**Result**: All 8 plan-created warnings removed. Pre-existing warnings (eslint.config.mjs, postcss.config.mjs, route.ts) unmodified.

## Evidence Generation (2026-04-08)

All 10 required evidence files successfully generated from real command outputs:

- **task-1,2,3,4-typecheck.txt**: `npm run typecheck` (tsc --noEmit, clean)
- **task-5-test-output.txt**: `npm run test -- src/lib/bulk-rewrite` (20 tests passed)
- **task-5-typecheck.txt**: `npm run typecheck` (clean)
- **task-6-typecheck.txt**: `npm run typecheck` (clean)
- **task-7-test-output.txt**: `npm run test` full suite (477 passed, 1 failed pre-existing)
- **task-7-bulkrewrite-tests.txt**: `npm run test -- src/lib/bulk-rewrite` (20 tests passed)
- **task-8-envcheck.txt**: `cat .env.example | grep` verification of all 4 env vars

Note: Pre-existing test failure in analyze-route.test.ts (temp-file cleanup doc test) unrelated to llm-adapter work.

## Lint Warnings Fix (Final Wave)

Fixed three `import/no-anonymous-default-export` and `no-unused-vars` warnings:
1. **eslint.config.mjs**: Assigned array to `eslintConfig` variable before default export
2. **postcss.config.mjs**: Assigned object to `postcssConfig` variable before default export  
3. **src/app/api/analyze/route.ts**: Removed unused `_handle` parameter, kept callback signature functional

All changes preserve runtime behavior. `npm run lint` now reports 0 warnings, 0 errors.

## Temp-File Cleanup Test Stabilization (Final Wave blocker fix)

### Problem
The cleanup tests in `tests/integration/analyze-route.test.ts` used before/after snapshots of the whole OS tmpdir, filtering for `ai-detector-*` files. This was flaky because other processes (or parallel tests) could create `ai-detector-*` files between the before/after snapshots.

### Root Cause
- `withTempFile` calls `writeTempFile` as a local reference (not via module export), so spying on `writeTempFile` export wouldn't intercept it.
- The route calls `withTempFile` directly — that IS an exported function on the module, so `vi.spyOn(tempModule, 'withTempFile')` works.

### Fix
Replaced directory snapshot strategy with a `captureAndAssertCleanup` helper that:
1. Spies on `tempModule.withTempFile`, wrapping the real implementation to capture the TempFileHandle
2. After the request completes, calls `tempModule.tempFileExists(capturedHandle)` to assert the specific file is gone
3. Restores the spy in a finally block

### Verification
Ran `npm run test -- tests/integration/analyze-route.test.ts` 4 consecutive times: 24/24 tests passed each time.

### Follow-up: captureAndAssertCleanup guard assertion
Replaced the `if (capturedHandle !== undefined)` guard with an unconditional `expect(capturedHandle).toBeDefined()` so the test fails loudly if `withTempFile` is never called, preventing vacuous passes if the route stops creating temp files.
