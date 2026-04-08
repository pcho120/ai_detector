# LLM & Detection Provider Adapter Pattern

## TL;DR

> **Quick Summary**: Refactor both the LLM coaching layer and the AI detection layer to use provider-agnostic Adapter patterns, so that swapping providers (OpenAI → Claude, Sapling → Winston/Originality/GPTZero) requires only environment variable changes — zero code changes.
>
> **Deliverables**:
> - `LlmAdapter` interface + `OpenAiLlmAdapter` implementation (extracts hardcoded OpenAI fetch from `llm.ts` and `voice-profile/generate/route.ts`)
> - `ClaudeLlmAdapter` stub (throws typed `FileProcessingError`)
> - `createLlmAdapter()` factory reading `LLM_PROVIDER` env var
> - `WinstonDetectionAdapter`, `OriginalityDetectionAdapter`, `GPTZeroDetectionAdapter` stubs
> - `createAnalysisDetectionAdapter()` extended to read `DETECTION_PROVIDER` env var
> - Updated `.env.example` with new vars
> - Unit tests for all factory branches
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 (LlmAdapter interface) → Task 3 (OpenAiLlmAdapter) → Task 5 (update llm.ts call sites) → Task 6 (update voice-profile route)

---

## Context

### Original Request
User tested bulk rewrite and found the AI detection score barely drops (~1%) despite using the feature. The root cause is that `gpt-4o-mini` rewrites are still flagged by Sapling because GPT-family outputs share similar statistical patterns. User wants to be able to swap LLM providers and detection providers without code changes, and plans a future Settings UI where end-users can supply their own API keys and choose providers.

### Interview Summary
**Key Discussions**:
- Detection + LLM both need adapters (not just one side)
- No Settings UI yet — backend/code structure only
- Detection providers to stub: Winston AI, Originality.ai, GPTZero (plus existing Sapling)
- LLM providers: OpenAI (existing impl), Claude (stub only for now)
- `voice-profile/generate/route.ts` has its own private hardcoded OpenAI fetch → must be included in scope
- Sentence-level scores: if provider doesn't support, normalize to empty `sentences: []`
- No prompt tuning changes in this plan

**Research Findings**:
- `DetectionAdapter` interface already exists in `src/lib/detection/types.ts` — well-designed
- `SaplingDetectionAdapter` already implements it — good pattern to follow
- `src/lib/suggestions/llm.ts` — two private functions (`callChatCompletions`, `callChatCompletionsMulti`) hardcoded to OpenAI
- `src/app/api/voice-profile/generate/route.ts:98-140` — private `callProfileGeneration` function hardcoded to OpenAI, independently
- `COACHING_LLM_API_KEY` is read in 3 places: `llm.ts:216`, `suggestions/route.ts:78`, `bulk-rewrite/route.ts:80`, `voice-profile/generate/route.ts:179`
- `analyze/route.ts:98` and `analyze/revised/route.ts:41` string-match `err.message === 'Detection service is not configured.'` to decide 503 vs 502 — this string is load-bearing

### Metis Review
**Identified Gaps** (addressed):
- `voice-profile/generate/route.ts` was a hidden 3rd LLM call site → explicitly in scope
- String `'Detection service is not configured.'` is load-bearing in two routes → must be preserved exactly
- `LlmSuggestionService.suggest()` hardcodes `score: 0.5` → explicitly out of scope, must not be touched
- Route-level `process.env.COACHING_LLM_API_KEY` reads must remain in routes (factory handles key internally; routes keep their own guard checks for 503 responses)
- `generateSingleSuggestion` and `generateAlternativeSuggestions` public signatures must not change

---

## Work Objectives

### Core Objective
Make both the LLM and detection layers provider-agnostic by introducing adapter interfaces and factory functions, so the active provider is controlled by environment variables with zero code changes required to swap providers.

### Concrete Deliverables
- `src/lib/suggestions/llm-adapter.ts` — `LlmAdapter` interface + `createLlmAdapter()` factory
- `src/lib/suggestions/adapters/openai.ts` — `OpenAiLlmAdapter` (extracts current `callChatCompletions`/`callChatCompletionsMulti` logic)
- `src/lib/suggestions/adapters/anthropic.ts` — `ClaudeLlmAdapter` stub
- `src/lib/detection/adapters/winston.ts` — `WinstonDetectionAdapter` stub
- `src/lib/detection/adapters/originality.ts` — `OriginalityDetectionAdapter` stub
- `src/lib/detection/adapters/gptzero.ts` — `GPTZeroDetectionAdapter` stub
- Updated `src/lib/analysis/analyzeText.ts` — `createAnalysisDetectionAdapter()` reads `DETECTION_PROVIDER`
- Updated `src/lib/suggestions/llm.ts` — `generateSingleSuggestion` and `generateAlternativeSuggestions` delegate through `LlmAdapter`
- Updated `src/app/api/voice-profile/generate/route.ts` — replace `callProfileGeneration` with `createLlmAdapter()` usage
- Updated `.env.example` — add `LLM_PROVIDER`, `DETECTION_PROVIDER`
- New test file: `src/lib/suggestions/__tests__/llm-adapter.test.ts`
- New test file: `src/lib/detection/__tests__/detection-factory.test.ts`

### Definition of Done
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run test` exits 0 (all existing + new tests pass)
- [ ] Setting `LLM_PROVIDER=anthropic` and calling `createLlmAdapter()` returns a `ClaudeLlmAdapter` instance
- [ ] Setting `DETECTION_PROVIDER=winston` and calling `createAnalysisDetectionAdapter()` returns a `WinstonDetectionAdapter` instance
- [ ] Calling `.detect()` on any stub adapter throws `FileProcessingError` with code `DETECTION_FAILED`

### Must Have
- `LlmAdapter` interface is defined in its own file (`llm-adapter.ts`), not mixed into `types.ts`
- `createLlmAdapter()` is the single source of truth for reading `LLM_PROVIDER` + `COACHING_LLM_API_KEY`
- `createAnalysisDetectionAdapter()` is the single source of truth for reading `DETECTION_PROVIDER` + provider-specific key
- String `'Detection service is not configured.'` is preserved exactly in the updated factory
- `LLM_PROVIDER` defaults to `'openai'` when unset (backward-compatible)
- `DETECTION_PROVIDER` defaults to `'sapling'` when unset (backward-compatible)
- Provider env var values normalized to lowercase before switch
- Unknown provider values throw `FileProcessingError` at factory call time
- Stub adapters throw `FileProcessingError` (not `Error`) when called

### Must NOT Have (Guardrails)
- Do NOT change `generateSingleSuggestion(apiKey, sentence, sentenceIndex, score)` public signature
- Do NOT change `generateAlternativeSuggestions(apiKey, sentence, sentenceIndex, score, voiceProfile?)` public signature
- Do NOT change `analyzeText(text, detectionAdapter)` function signature
- Do NOT modify `SentenceEntry`, `Suggestion`, or `SuggestionService` interfaces in `types.ts`
- Do NOT "fix" the `0.5` hardcode in `LlmSuggestionService.suggest()` — out of scope
- Do NOT change `max_tokens`, `temperature`, or model name constants — hardcode inside `OpenAiLlmAdapter`
- Do NOT change the `applyGuardrails` double-call pattern in `bulkRewrite.ts` — pre-existing, leave it
- Do NOT add `score` to `SentenceEntry` — out of scope
- Do NOT change how routes read `process.env.COACHING_LLM_API_KEY` for their own 503 guard checks
- Do NOT rename `COACHING_LLM_API_KEY` env var — keep backward compatibility

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest, see `src/lib/bulk-rewrite/__tests__/`)
- **Automated tests**: Tests-after
- **Framework**: vitest

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Unit tests**: `npm run test` via Bash
- **Type checking**: `npm run typecheck` via Bash
- **Factory behavior**: verified by unit test assertions

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - interfaces + stubs, all independent):
├── Task 1: LlmAdapter interface + createLlmAdapter() factory  [quick]
├── Task 2: Detection stub adapters (Winston, Originality, GPTZero)  [quick]

Wave 2 (After Wave 1 - implementations + call-site updates):
├── Task 3: OpenAiLlmAdapter + ClaudeLlmAdapter stub  [unspecified-high]
├── Task 4: Update createAnalysisDetectionAdapter() to read DETECTION_PROVIDER  [quick]

Wave 3 (After Wave 2 - call-site wiring + tests):
├── Task 5: Update llm.ts to delegate through LlmAdapter  [unspecified-high]
├── Task 6: Update voice-profile/generate/route.ts to use createLlmAdapter()  [quick]
├── Task 7: Unit tests for factory functions  [unspecified-high]
├── Task 8: Update .env.example  [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan Compliance Audit  [oracle]
├── Task F2: Code Quality Review  [unspecified-high]
├── Task F3: Real Manual QA  [unspecified-high]
└── Task F4: Scope Fidelity Check  [deep]
```

### Dependency Matrix

- **1**: none → blocks 3, 5
- **2**: none → blocks 4, 7
- **3**: 1 → blocks 5, 6, 7
- **4**: 2 → blocks 7
- **5**: 1, 3 → blocks 7
- **6**: 3 → blocks 7
- **7**: 3, 4, 5, 6 → blocks F1-F4
- **8**: none → blocks F1

### Agent Dispatch Summary

- **Wave 1**: T1 → `quick`, T2 → `quick`
- **Wave 2**: T3 → `unspecified-high`, T4 → `quick`
- **Wave 3**: T5 → `unspecified-high`, T6 → `quick`, T7 → `unspecified-high`, T8 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Create `LlmAdapter` interface + `createLlmAdapter()` factory

  **What to do**:
  - Create `src/lib/suggestions/llm-adapter.ts` with the following:
    - `LlmCompletionRequest` interface: `{ systemPrompt: string; userPrompt: string; temperature: number; maxTokens: number }`
    - `LlmCompletionResponse` interface: `{ content: string }`
    - `LlmAdapter` interface with two methods:
      - `complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse | null>`
      - `completeMulti(request: LlmCompletionRequest): Promise<LlmCompletionResponse | null>` (same signature, multi-alternative variant)
    - `createLlmAdapter(apiKey?: string): LlmAdapter` factory function:
      - Reads `(process.env.LLM_PROVIDER ?? 'openai').toLowerCase()`
      - Defaults `apiKey` to `process.env.COACHING_LLM_API_KEY` when not supplied
      - `'openai'` → constructs and returns `OpenAiLlmAdapter`
      - `'anthropic'` → constructs and returns `ClaudeLlmAdapter`
      - unknown value → `throw new FileProcessingError('DETECTION_FAILED', \`Unknown LLM provider: "${provider}". Set LLM_PROVIDER to "openai" or "anthropic".\`)`
  - Do NOT implement `OpenAiLlmAdapter` or `ClaudeLlmAdapter` yet — they will be created in Task 3. Import them as forward references or leave factory body as `// TODO: implemented in Task 3` placeholder so TypeScript compiles.
  - Actually: to avoid circular import issues, the factory implementation can be a thin wrapper that just imports from `./adapters/openai` and `./adapters/anthropic`. It's fine for the factory file to import those files — just create those adapter files as empty stubs that export the class with a `constructor(apiKey: string)` and stub `complete`/`completeMulti` methods throwing `new FileProcessingError('DETECTION_FAILED', 'Not yet implemented')` so the file compiles immediately.

  **Must NOT do**:
  - Do NOT put `LlmAdapter` in `src/lib/suggestions/types.ts` — it gets its own file
  - Do NOT rename or deprecate `COACHING_LLM_API_KEY` env var
  - Do NOT implement any real HTTP fetch in this task — just the interface and factory shell

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Creating interface file and factory scaffold — no complex logic, just type definitions and a switch statement
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/detection/types.ts:42-49` — `DetectionAdapter` interface, exact same structural pattern to follow for `LlmAdapter`
  - `src/lib/detection/index.ts` — barrel export pattern to follow

  **API/Type References**:
  - `src/lib/files/errors.ts:13-21` — `FileProcessingError` constructor signature: `new FileProcessingError(code: FileErrorCode, message: string)`
  - `src/lib/files/errors.ts:1-9` — `FILE_ERROR_CODES` — use `'DETECTION_FAILED'` as the error code for unknown provider

  **Acceptance Criteria**:

  - [ ] `src/lib/suggestions/llm-adapter.ts` exists and exports `LlmAdapter`, `LlmCompletionRequest`, `LlmCompletionResponse`, `createLlmAdapter`
  - [ ] `npm run typecheck` exits 0 after this task

  **QA Scenarios**:

  ```
  Scenario: TypeScript compilation passes with new file
    Tool: Bash
    Steps:
      1. Run: npm run typecheck
    Expected Result: exit code 0, no errors mentioning llm-adapter.ts
    Evidence: .sisyphus/evidence/task-1-typecheck.txt
  ```

  **Commit**: NO (groups with Task 3)

---

- [x] 2. Create Detection stub adapters (Winston, Originality, GPTZero)

  **What to do**:
  - Create `src/lib/detection/adapters/` directory
  - Create `src/lib/detection/adapters/winston.ts`:
    ```typescript
    export class WinstonDetectionAdapter implements DetectionAdapter {
      constructor(_apiKey: string) {}
      async detect(_text: string): Promise<DetectionResult> {
        throw new FileProcessingError('DETECTION_FAILED', 'Winston AI adapter is not yet implemented.');
      }
    }
    ```
  - Create `src/lib/detection/adapters/originality.ts` — same pattern, message: `'Originality.ai adapter is not yet implemented.'`
  - Create `src/lib/detection/adapters/gptzero.ts` — same pattern, message: `'GPTZero adapter is not yet implemented.'`
  - All three must import `DetectionAdapter`, `DetectionResult` from `../types` and `FileProcessingError` from `../../files/errors`
  - All three must throw `FileProcessingError` (NOT generic `Error`) — this is critical for correct HTTP status code mapping in routes

  **Must NOT do**:
  - Do NOT implement real HTTP calls to these providers — stubs only
  - Do NOT modify `sapling.ts`
  - Do NOT modify `types.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Three boilerplate stub files following the exact same pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 4, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/detection/sapling.ts:21-81` — `SaplingDetectionAdapter` — exact structural pattern to follow for stub adapters (constructor takes `apiKey: string`, implements `DetectionAdapter`, throws `FileProcessingError`)

  **API/Type References**:
  - `src/lib/detection/types.ts` — `DetectionAdapter`, `DetectionResult` interfaces
  - `src/lib/files/errors.ts:13-21` — `FileProcessingError`

  **Acceptance Criteria**:

  - [ ] `src/lib/detection/adapters/winston.ts` exists and exports `WinstonDetectionAdapter`
  - [ ] `src/lib/detection/adapters/originality.ts` exists and exports `OriginalityDetectionAdapter`
  - [ ] `src/lib/detection/adapters/gptzero.ts` exists and exports `GPTZeroDetectionAdapter`
  - [ ] All three classes implement `DetectionAdapter` (TypeScript confirms)
  - [ ] Calling `.detect()` on any stub throws `FileProcessingError` (not `Error`)
  - [ ] `npm run typecheck` exits 0

  **QA Scenarios**:

  ```
  Scenario: Stub adapters throw FileProcessingError
    Tool: Bash
    Steps:
      1. Run: npm run typecheck
    Expected Result: exit code 0
    Evidence: .sisyphus/evidence/task-2-typecheck.txt
  ```

  **Commit**: NO (groups with Task 4)

---

- [x] 3. Implement `OpenAiLlmAdapter` + `ClaudeLlmAdapter` stub

  **What to do**:
  - Create `src/lib/suggestions/adapters/openai.ts` — `OpenAiLlmAdapter`:
    - Constructor: `constructor(private readonly apiKey: string)`
    - `complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse | null>`:
      - Extract the logic from `callChatCompletions` in `src/lib/suggestions/llm.ts` verbatim
      - Model: `'gpt-4o-mini'`, temperature from `request.temperature`, max_tokens from `request.maxTokens`
      - On network error: return `null` (same as current behavior)
      - On non-ok response: return `null`
      - On parse error: return `null`
      - Return `{ content: data.choices[0].message.content }`
    - `completeMulti(request: LlmCompletionRequest): Promise<LlmCompletionResponse | null>`:
      - Same logic but for the multi-alternative call — extract from `callChatCompletionsMulti`
      - Temperature from `request.temperature`, max_tokens from `request.maxTokens`
    - Define local `ChatChoice` and `ChatCompletionResponse` types inside this file (do NOT export from `llm.ts`)
  - Create `src/lib/suggestions/adapters/anthropic.ts` — `ClaudeLlmAdapter` stub:
    - Constructor: `constructor(private readonly apiKey: string)`
    - Both `complete` and `completeMulti`: throw `new FileProcessingError('DETECTION_FAILED', 'Anthropic Claude adapter is not yet implemented.')`
    - Note: Anthropic's API uses `content[0].text` not `choices[0].message.content` — the real implementation will need its own response parsing. This is documented as a comment in the stub file.
  - Keep `callChatCompletions` and `callChatCompletionsMulti` in `llm.ts` intact for now — they will be removed in Task 5 after call sites are updated

  **Must NOT do**:
  - Do NOT change `max_tokens` or `temperature` defaults — just pass them through from caller
  - Do NOT export `ChatChoice` / `ChatCompletionResponse` from `llm.ts` — define them locally in `openai.ts`
  - Do NOT modify any routes or `llm.ts` call sites yet — that is Task 5

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Careful extraction of existing logic — must preserve exact behavior including all error handling branches
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 5, 6, 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/lib/suggestions/llm.ts:123-165` — `callChatCompletions` — this exact logic moves to `OpenAiLlmAdapter.complete()`
  - `src/lib/suggestions/llm.ts:167-210` — `callChatCompletionsMulti` — this exact logic moves to `OpenAiLlmAdapter.completeMulti()`
  - `src/lib/detection/sapling.ts` — adapter pattern to follow (constructor, error mapping, response normalization)

  **API/Type References**:
  - `src/lib/suggestions/llm-adapter.ts` — `LlmAdapter`, `LlmCompletionRequest`, `LlmCompletionResponse` (created in Task 1)
  - `src/lib/files/errors.ts` — `FileProcessingError`

  **Acceptance Criteria**:

  - [ ] `src/lib/suggestions/adapters/openai.ts` exports `OpenAiLlmAdapter` implementing `LlmAdapter`
  - [ ] `src/lib/suggestions/adapters/anthropic.ts` exports `ClaudeLlmAdapter` implementing `LlmAdapter`
  - [ ] `ClaudeLlmAdapter.complete()` throws `FileProcessingError` (not `Error`)
  - [ ] `npm run typecheck` exits 0

  **QA Scenarios**:

  ```
  Scenario: TypeScript confirms both adapters implement LlmAdapter
    Tool: Bash
    Steps:
      1. Run: npm run typecheck
    Expected Result: exit code 0
    Evidence: .sisyphus/evidence/task-3-typecheck.txt
  ```

  **Commit**: NO (groups with Task 5)

---

- [x] 4. Update `createAnalysisDetectionAdapter()` to read `DETECTION_PROVIDER`

  **What to do**:
  - Modify `src/lib/analysis/analyzeText.ts` — update `createAnalysisDetectionAdapter()`:
    - Read `(process.env.DETECTION_PROVIDER ?? 'sapling').toLowerCase()`
    - Switch on provider:
      - `'sapling'`: existing logic (reads `SAPLING_API_KEY`, throws `FileProcessingError('DETECTION_FAILED', 'Detection service is not configured.')` when key is missing) — **exact same message string must be preserved**
      - `'winston'`: reads `WINSTON_API_KEY` from env, constructs `WinstonDetectionAdapter`; throws `FileProcessingError('DETECTION_FAILED', 'Detection service is not configured.')` when key is missing
      - `'originality'`: reads `ORIGINALITY_API_KEY`, constructs `OriginalityDetectionAdapter`; same missing-key error
      - `'gptzero'`: reads `GPTZERO_API_KEY`, constructs `GPTZeroDetectionAdapter`; same missing-key error
      - unknown: `throw new FileProcessingError('DETECTION_FAILED', \`Unknown detection provider: "${provider}". Set DETECTION_PROVIDER to "sapling", "winston", "originality", or "gptzero".\`)`
  - Import new adapters from `../detection/adapters/winston`, `../detection/adapters/originality`, `../detection/adapters/gptzero`
  - **CRITICAL**: The string `'Detection service is not configured.'` must be used for ALL missing-key cases (sapling + all stubs), because `analyze/route.ts:98` and `analyze/revised/route.ts:41` string-match this exact message to return HTTP 503 vs 502.

  **Must NOT do**:
  - Do NOT change the `analyzeText(text, detectionAdapter)` function signature
  - Do NOT change the missing-key error message from `'Detection service is not configured.'`
  - Do NOT touch `analyze/route.ts` or `analyze/revised/route.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Extending a factory function with a switch statement — straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/lib/analysis/analyzeText.ts:9-18` — current `createAnalysisDetectionAdapter()` — extend this function
  - `src/lib/detection/sapling.ts:22-29` — Sapling constructor pattern for reference

  **API/Type References**:
  - `src/lib/detection/adapters/winston.ts` — `WinstonDetectionAdapter` (Task 2)
  - `src/lib/detection/adapters/originality.ts` — `OriginalityDetectionAdapter` (Task 2)
  - `src/lib/detection/adapters/gptzero.ts` — `GPTZeroDetectionAdapter` (Task 2)
  - `src/lib/files/errors.ts` — `FileProcessingError`

  **Load-Bearing String** (MUST NOT CHANGE):
  - `analyze/route.ts:98` — `err.message === 'Detection service is not configured.'`
  - `analyze/revised/route.ts:41` — same check

  **Acceptance Criteria**:

  - [ ] `createAnalysisDetectionAdapter()` reads `DETECTION_PROVIDER` env var
  - [ ] `DETECTION_PROVIDER=sapling` (or unset) → `SaplingDetectionAdapter`
  - [ ] `DETECTION_PROVIDER=winston` → `WinstonDetectionAdapter`
  - [ ] Missing key for any provider → `FileProcessingError` with message `'Detection service is not configured.'`
  - [ ] `npm run typecheck` exits 0

  **QA Scenarios**:

  ```
  Scenario: Factory selects correct adapter based on DETECTION_PROVIDER
    Tool: Bash
    Steps:
      1. Run: npm run typecheck
      2. Run: npm run test (unit tests from Task 7 will verify factory behavior)
    Expected Result: exit code 0 for both
    Evidence: .sisyphus/evidence/task-4-typecheck.txt
  ```

  **Commit**: NO (groups with Task 7)

---

- [x] 5. Update `llm.ts` to delegate through `LlmAdapter`

  **What to do**:
  - Modify `src/lib/suggestions/llm.ts`:
    - `generateSingleSuggestion(apiKey, sentence, sentenceIndex, score)` — **signature stays identical**:
      - Replace internal `callChatCompletions(apiKey, sentence, score)` call with:
        ```typescript
        const adapter = createLlmAdapter(apiKey);
        const payload = await adapter.complete({
          systemPrompt: SYSTEM_PROMPT,
          userPrompt: buildUserPrompt(sentence, score),
          temperature: 0.4,
          maxTokens: 256,
        });
        ```
      - Then pass `payload?.content` to `parseRewritePayload`
    - `generateAlternativeSuggestions(apiKey, sentence, sentenceIndex, score, voiceProfile?)` — **signature stays identical**:
      - Replace `callChatCompletionsMulti(apiKey, sentence, score, voiceProfile)` with adapter call
      - Use `temperature: 0.7`, `maxTokens: 768`
      - Recovery loop (line 301) must also call through adapter — NOT bypass to the old function
    - `LlmSuggestionService.suggest()` (line 219-239):
      - Replace internal `callChatCompletions` call with adapter call
      - Use `createLlmAdapter(this.apiKey)`
    - Remove `callChatCompletions` and `callChatCompletionsMulti` private functions entirely (they move to `OpenAiLlmAdapter`)
    - Remove local `ChatChoice` and `ChatCompletionResponse` types (moved to `openai.ts`)
    - Keep `SYSTEM_PROMPT`, `MULTI_SYSTEM_PROMPT`, `buildUserPrompt`, `buildMultiUserPrompt`, `parseRewritePayload`, `parseMultiAlternativesPayload`, `deduplicateAlternativesByRewrite` — these remain in `llm.ts`
    - Import `createLlmAdapter` from `./llm-adapter`

  **Must NOT do**:
  - Do NOT change `generateSingleSuggestion(apiKey, sentence, sentenceIndex, score)` signature — `bulkRewrite.ts` calls this unchanged
  - Do NOT change `generateAlternativeSuggestions(apiKey, sentence, sentenceIndex, score, voiceProfile?)` signature
  - Do NOT modify `bulkRewrite.ts` — it must work unchanged
  - Do NOT modify `suggestions/route.ts` — it passes `apiKey` from `process.env` directly, keep working
  - Do NOT remove `parseRewritePayload` or `parseMultiAlternativesPayload` — they stay in `llm.ts`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Careful refactor of a complex file — must preserve exact behavior including recovery loop and error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `src/lib/suggestions/llm.ts:242-263` — `generateSingleSuggestion` — this function's body changes but signature stays identical
  - `src/lib/suggestions/llm.ts:275-317` — `generateAlternativeSuggestions` — recovery loop on line 301 must use adapter
  - `src/lib/suggestions/llm.ts:219-239` — `LlmSuggestionService.suggest()` — replace `callChatCompletions` call

  **API/Type References**:
  - `src/lib/suggestions/llm-adapter.ts` — `createLlmAdapter`, `LlmCompletionRequest`
  - `src/lib/bulk-rewrite/bulkRewrite.ts:98` — call site that must continue to work unchanged: `generateSingleSuggestion(apiKey, candidate.sentence, candidate.sentenceIndex, candidate.score)`

  **Acceptance Criteria**:

  - [ ] `callChatCompletions` function removed from `llm.ts`
  - [ ] `callChatCompletionsMulti` function removed from `llm.ts`
  - [ ] `generateSingleSuggestion` and `generateAlternativeSuggestions` signatures unchanged (confirmed by `npm run typecheck` with `bulkRewrite.ts` and route files unmodified)
  - [ ] `npm run test` exits 0 — all existing `bulkRewrite.test.ts` tests still pass
  - [ ] `npm run typecheck` exits 0

  **QA Scenarios**:

  ```
  Scenario: Existing bulk rewrite tests pass after refactor
    Tool: Bash
    Steps:
      1. Run: npm run test -- src/lib/bulk-rewrite
    Expected Result: all tests pass, no failures
    Evidence: .sisyphus/evidence/task-5-test-output.txt

  Scenario: TypeScript compilation confirms signatures unchanged
    Tool: Bash
    Steps:
      1. Run: npm run typecheck
    Expected Result: exit code 0
    Evidence: .sisyphus/evidence/task-5-typecheck.txt
  ```

  **Commit**: NO (groups with Task 7)

---

- [x] 6. Update `voice-profile/generate/route.ts` to use `createLlmAdapter()`

  **What to do**:
  - Modify `src/app/api/voice-profile/generate/route.ts`:
    - Remove `callProfileGeneration` private function (lines 98-140)
    - Remove local `ChatChoice` and `ChatCompletionResponse` type definitions (lines 29-34)
    - Import `createLlmAdapter` from `@/lib/suggestions/llm-adapter`
    - In the `POST` handler, replace the `callProfileGeneration(apiKey, systemPrompt, userContent)` call with:
      ```typescript
      const adapter = createLlmAdapter(apiKey);
      const response = await adapter.complete({
        systemPrompt,
        userPrompt: userContent,
        temperature: 0.4,
        maxTokens: 512,
      });
      const rawProfile = response?.content ?? null;
      ```
    - Keep the existing `apiKey` check (line 179-186) and all other route logic unchanged
    - Keep `COACHING_LLM_API_KEY` read from `process.env` in the route — the route owns its 503 guard

  **Must NOT do**:
  - Do NOT change request/response shapes (`VoiceProfileRequest`, `VoiceProfileResponse`)
  - Do NOT change the 503 error behavior when `apiKey` is missing
  - Do NOT change validation logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical replacement of one private function with an adapter call
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 7
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/app/api/voice-profile/generate/route.ts:98-140` — `callProfileGeneration` function to be removed
  - `src/app/api/voice-profile/generate/route.ts:179-188` — `POST` handler section that calls `callProfileGeneration`

  **API/Type References**:
  - `src/lib/suggestions/llm-adapter.ts` — `createLlmAdapter`, `LlmCompletionRequest`

  **Acceptance Criteria**:

  - [ ] `callProfileGeneration` function removed from `route.ts`
  - [ ] Route uses `createLlmAdapter()` to make the LLM call
  - [ ] `npm run typecheck` exits 0

  **QA Scenarios**:

  ```
  Scenario: TypeScript compilation passes after route update
    Tool: Bash
    Steps:
      1. Run: npm run typecheck
    Expected Result: exit code 0
    Evidence: .sisyphus/evidence/task-6-typecheck.txt
  ```

  **Commit**: NO (groups with Task 7)

---

- [x] 7. Write unit tests for factory functions

  **What to do**:
  - Create `src/lib/suggestions/__tests__/llm-adapter.test.ts`:
    - Test `createLlmAdapter()` with `LLM_PROVIDER` unset + `COACHING_LLM_API_KEY=test-key` → returns instance duck-typeable as `OpenAiLlmAdapter` (has `complete` and `completeMulti` methods)
    - Test `createLlmAdapter()` with `LLM_PROVIDER=openai` → returns `OpenAiLlmAdapter`
    - Test `createLlmAdapter()` with `LLM_PROVIDER=OPENAI` (uppercase) → returns `OpenAiLlmAdapter` (case normalization)
    - Test `createLlmAdapter()` with `LLM_PROVIDER=anthropic` → returns `ClaudeLlmAdapter`
    - Test `createLlmAdapter()` with `LLM_PROVIDER=bogus` → throws `FileProcessingError` with code `DETECTION_FAILED`
    - Test calling `ClaudeLlmAdapter.complete()` → throws `FileProcessingError` (not `Error`)
  - Create `src/lib/detection/__tests__/detection-factory.test.ts`:
    - Test `createAnalysisDetectionAdapter()` with `DETECTION_PROVIDER` unset + `SAPLING_API_KEY=test-key` → returns `SaplingDetectionAdapter`
    - Test `createAnalysisDetectionAdapter()` with `DETECTION_PROVIDER=sapling` + `SAPLING_API_KEY=test-key` → returns `SaplingDetectionAdapter`
    - Test `createAnalysisDetectionAdapter()` with `DETECTION_PROVIDER=winston` + `WINSTON_API_KEY=test-key` → returns `WinstonDetectionAdapter`
    - Test `createAnalysisDetectionAdapter()` with `DETECTION_PROVIDER=originality` + `ORIGINALITY_API_KEY=test-key` → returns `OriginalityDetectionAdapter`
    - Test `createAnalysisDetectionAdapter()` with `DETECTION_PROVIDER=gptzero` + `GPTZERO_API_KEY=test-key` → returns `GPTZeroDetectionAdapter`
    - Test `createAnalysisDetectionAdapter()` with `DETECTION_PROVIDER=bogus` → throws `FileProcessingError`
    - Test `createAnalysisDetectionAdapter()` with `DETECTION_PROVIDER=sapling` + NO `SAPLING_API_KEY` → throws `FileProcessingError` with message exactly `'Detection service is not configured.'`
    - Test calling `.detect()` on `WinstonDetectionAdapter` → throws `FileProcessingError` (not `Error`)
    - Test calling `.detect()` on `OriginalityDetectionAdapter` → throws `FileProcessingError`
    - Test calling `.detect()` on `GPTZeroDetectionAdapter` → throws `FileProcessingError`
  - Use `vitest`, `describe`, `it`, `expect`, `beforeEach`, `afterEach` — follow exact same pattern as `bulkRewrite.test.ts`
  - Use `process.env.LLM_PROVIDER = ...` / `delete process.env.LLM_PROVIDER` in beforeEach/afterEach for isolation

  **Must NOT do**:
  - Do NOT test internal HTTP calls — only factory/adapter behavior
  - Do NOT mock `createLlmAdapter` — test it directly
  - Do NOT use `vi.mock` for the adapter classes — they should be real instances

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive unit test coverage for multiple factory branches and error cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 8)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 3, 4, 5, 6

  **References**:

  **Pattern References**:
  - `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts:1-50` — vitest setup, `describe`/`it` structure, `beforeEach`/`afterEach` pattern for `process.env` isolation

  **API/Type References**:
  - `src/lib/suggestions/llm-adapter.ts` — `createLlmAdapter`
  - `src/lib/analysis/analyzeText.ts` — `createAnalysisDetectionAdapter`
  - `src/lib/detection/adapters/winston.ts` — `WinstonDetectionAdapter`
  - `src/lib/files/errors.ts` — `FileProcessingError`

  **Acceptance Criteria**:

  - [ ] All factory branch tests pass: `npm run test -- src/lib/suggestions/__tests__/llm-adapter.test.ts`
  - [ ] All detection factory tests pass: `npm run test -- src/lib/detection/__tests__/detection-factory.test.ts`
  - [ ] All existing tests still pass: `npm run test`
  - [ ] `npm run typecheck` exits 0

  **QA Scenarios**:

  ```
  Scenario: All new unit tests pass
    Tool: Bash
    Steps:
      1. Run: npm run test
    Expected Result: all tests pass including new factory tests; exit code 0
    Evidence: .sisyphus/evidence/task-7-test-output.txt

  Scenario: Existing bulkRewrite tests unaffected
    Tool: Bash
    Steps:
      1. Run: npm run test -- src/lib/bulk-rewrite
    Expected Result: same pass count as before this change
    Evidence: .sisyphus/evidence/task-7-bulkrewrite-tests.txt
  ```

  **Commit**: YES (all tasks together)
  - Message: `feat(adapters): add provider-agnostic LLM and detection adapter pattern`
  - Files: `src/lib/suggestions/llm-adapter.ts`, `src/lib/suggestions/adapters/openai.ts`, `src/lib/suggestions/adapters/anthropic.ts`, `src/lib/detection/adapters/winston.ts`, `src/lib/detection/adapters/originality.ts`, `src/lib/detection/adapters/gptzero.ts`, `src/lib/analysis/analyzeText.ts`, `src/lib/suggestions/llm.ts`, `src/app/api/voice-profile/generate/route.ts`, `src/lib/suggestions/__tests__/llm-adapter.test.ts`, `src/lib/detection/__tests__/detection-factory.test.ts`, `.env.example`
  - Pre-commit: `npm run typecheck && npm run lint && npm run test`

---

- [x] 8. Update `.env.example`

  **What to do**:
  - Modify `.env.example` to add:
    ```
    # LLM provider for coaching rewrites. Options: openai (default), anthropic
    LLM_PROVIDER=openai

    # LLM API key for the selected provider
    # For openai: your OpenAI API key
    # For anthropic: your Anthropic Claude API key
    COACHING_LLM_API_KEY=your_llm_api_key_here

    # Detection provider. Options: sapling (default), winston, originality, gptzero
    DETECTION_PROVIDER=sapling

    # Detection API keys — only the key for the selected provider is required
    SAPLING_API_KEY=your_sapling_api_key_here
    # WINSTON_API_KEY=your_winston_api_key_here
    # ORIGINALITY_API_KEY=your_originality_api_key_here
    # GPTZERO_API_KEY=your_gptzero_api_key_here
    ```
  - Replace the existing simple 5-line content with the expanded version
  - Keep `COACHING_LLM_API_KEY` name unchanged (backward compatibility)

  **Must NOT do**:
  - Do NOT rename `SAPLING_API_KEY` or `COACHING_LLM_API_KEY`
  - Do NOT add any other files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file text update
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 7)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1
  - **Blocked By**: None (can start immediately alongside Wave 3 tasks)

  **References**:

  - `.env.example` — current content to replace

  **Acceptance Criteria**:

  - [ ] `.env.example` includes `LLM_PROVIDER`, `DETECTION_PROVIDER`, comments for all new env vars
  - [ ] `COACHING_LLM_API_KEY` and `SAPLING_API_KEY` still present (backward compat)

  **QA Scenarios**:

  ```
  Scenario: .env.example contains all required vars
    Tool: Bash
    Steps:
      1. Run: grep -E "LLM_PROVIDER|DETECTION_PROVIDER|COACHING_LLM_API_KEY|SAPLING_API_KEY" .env.example
    Expected Result: all 4 var names appear in output
    Evidence: .sisyphus/evidence/task-8-envcheck.txt
  ```

  **Commit**: NO (groups with Task 7)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks) (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck` + `npm run lint` + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **After Task 7 (all tests pass)**: `feat(adapters): add provider-agnostic LLM and detection adapter pattern`
  - Files: all new/modified adapter files, updated factories, updated routes, updated tests, updated .env.example
  - Pre-commit: `npm run typecheck && npm run lint && npm run test`

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck   # Expected: exit 0, no errors
npm run lint        # Expected: exit 0, no warnings
npm run test        # Expected: all existing + new tests pass
```

### Final Checklist
- [ ] `createLlmAdapter()` with `LLM_PROVIDER` unset → `OpenAiLlmAdapter`
- [ ] `createLlmAdapter()` with `LLM_PROVIDER=openai` → `OpenAiLlmAdapter`
- [ ] `createLlmAdapter()` with `LLM_PROVIDER=anthropic` → `ClaudeLlmAdapter`
- [ ] `createLlmAdapter()` with `LLM_PROVIDER=bogus` → throws `FileProcessingError`
- [ ] `createAnalysisDetectionAdapter()` with `DETECTION_PROVIDER` unset → `SaplingDetectionAdapter`
- [ ] `createAnalysisDetectionAdapter()` with `DETECTION_PROVIDER=winston` → `WinstonDetectionAdapter`
- [ ] Calling `.detect()` on stub adapters → throws `FileProcessingError` (not `Error`)
- [ ] `generateSingleSuggestion` signature unchanged (existing tests still pass)
- [ ] `bulkRewrite.ts` unchanged — zero modifications
- [ ] String `'Detection service is not configured.'` still present in factory output
