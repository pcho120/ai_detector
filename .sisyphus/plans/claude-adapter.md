# Claude (Anthropic) LLM Adapter Implementation

## TL;DR

> **Quick Summary**: Replace the `ClaudeLlmAdapter` stub in `src/lib/suggestions/adapters/anthropic.ts` with a real Anthropic Messages API implementation using `@anthropic-ai/sdk`, and update the corresponding test block to cover real behavior via mocked SDK.
>
> **Deliverables**:
> - `src/lib/suggestions/adapters/anthropic.ts` — real implementation (no more stub throws)
> - `src/lib/suggestions/__tests__/llm-adapter.test.ts` — stub test block replaced with real behavior tests
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — 2 sequential tasks (impl → tests)
> **Critical Path**: Task 1 → Task 2 → Final Verification

---

## Context

### Original Request
"Claude API 사용가능하게 변경" — implement the `ClaudeLlmAdapter` that is currently a stub throwing `FileProcessingError('NOT_IMPLEMENTED')`.

### Interview Summary
**Key Discussions**:
- Error contract: null return (match OpenAI pattern), NOT throw FileProcessingError for API errors
- Temperature range: clamp to `Math.min(request.temperature, 1.0)` before passing to Claude
- `completeMulti()`: delegate to `this.complete(request)` — DRY, not copy-paste
- Model: `claude-3-5-haiku-20241022` (same tier as `gpt-4o-mini`)

**Research Findings**:
- `@anthropic-ai/sdk` v0.86.1 already installed
- Anthropic response shape: `response.content[0]` → `{ type: 'text', text: string }` (must guard `type === 'text'`)
- `content[]` may be empty — need guard for `content[0]` being undefined
- `max_tokens` is REQUIRED by Claude (unlike OpenAI where it's optional)
- `system` prompt is top-level param in Claude, NOT inside `messages[]`

### Metis Review
**Identified Gaps** (addressed):
- Error contract inconsistency between JSDoc and OpenAI impl → resolved: follow OpenAI null-return pattern
- Temperature 0–2 vs Claude's 0–1 → resolved: clamp with `Math.min`
- `FileProcessingError` requires 2 args → will include message string
- `content[]` empty guard → added as implementation requirement
- Non-text ContentBlock guard → added as implementation requirement
- Test file has factory tests (lines 31–104) that must be preserved → replace only stub block (lines 106–164)
- Module-level `vi.mock('@anthropic-ai/sdk')` strategy → use `vi.mock` with `vi.mocked` for assertions

---

## Work Objectives

### Core Objective
Replace the non-functional stub with a real Anthropic API client that matches the OpenAI adapter's null-return error contract and passes all typecheck + lint + test checks.

### Concrete Deliverables
- `src/lib/suggestions/adapters/anthropic.ts` — uses `@anthropic-ai/sdk`, calls `client.messages.create()`, returns `{ content }` or `null`
- `src/lib/suggestions/__tests__/llm-adapter.test.ts` — lines 106–164 replaced with real behavior tests (happy path, null content, API error, empty content array)

### Definition of Done
- [ ] `npm run typecheck` → exit 0
- [ ] `npm run lint` → exit 0
- [ ] `npm run test` → all tests pass (including preserved factory tests)
- [ ] No test description contains "stub throws" in the file
- [ ] `ClaudeLlmAdapter.complete()` calls `client.messages.create()` (verified by test mock assertions)

### Must Have
- Real `@anthropic-ai/sdk` call in `complete()`
- `completeMulti()` delegates to `complete()`
- `Math.min(temperature, 1.0)` clamping
- Guard: `response.content[0]?.type === 'text'` before accessing `.text`
- Guard: empty `content[]` returns `null`
- All failures (network, 4xx, 5xx, SDK throws) return `null`
- Factory tests (lines 31–104) preserved unchanged

### Must NOT Have (Guardrails)
- Do NOT modify `llm-adapter.ts`, `openai.ts`, or `errors.ts`
- Do NOT delete the factory test block (lines 31–104 of `llm-adapter.test.ts`)
- Do NOT add streaming support
- Do NOT add retry logic / exponential backoff
- Do NOT extract shared utilities from openai/anthropic adapters
- Do NOT throw `FileProcessingError` for API errors — return `null` instead
- Do NOT place `systemPrompt` inside `messages[]` — it must be the top-level `system` field
- Do NOT use `temperature > 1.0` value; clamp before API call

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: Tests-after (impl first, then update test file)
- **Framework**: vitest
- **Mocking**: `vi.mock('@anthropic-ai/sdk')` — module-level mock so `new Anthropic()` returns a controllable mock

### QA Policy
Agent-executed verification only. No human intervention.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Sequential - impl first):
└── Task 1: Implement ClaudeLlmAdapter real logic [quick]

Wave 2 (After Task 1 - update tests):
└── Task 2: Replace stub test block with real behavior tests [quick]

Wave FINAL (After ALL tasks):
├── F1: Plan Compliance Audit (oracle)
├── F2: Code Quality Review (unspecified-high)
├── F3: Real Manual QA (unspecified-high)
└── F4: Scope Fidelity Check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix
- **Task 1**: No dependencies — can start immediately
- **Task 2**: Depends on Task 1 (needs to know exact mock surface of implemented class)

### Agent Dispatch Summary
- **Wave 1**: Task 1 → `quick`
- **Wave 2**: Task 2 → `quick`
- **FINAL**: F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Implement `ClaudeLlmAdapter` with real Anthropic SDK calls

  **What to do**:
  - Remove the `FileProcessingError` import (no longer needed — errors return `null`)
  - Add `import Anthropic from '@anthropic-ai/sdk';`
  - In the constructor, instantiate a private `client: Anthropic` using `new Anthropic({ apiKey: this.apiKey })`
  - Implement `complete(request)`:
    - Wrap entire body in `try/catch` — catch returns `null`
    - Clamp temperature: `const temperature = Math.min(request.temperature, 1.0)`
    - Call `await this.client.messages.create({ model: 'claude-3-5-haiku-20241022', max_tokens: request.maxTokens, temperature, system: request.systemPrompt, messages: [{ role: 'user', content: request.userPrompt }] })`
    - Guard: if `response.content.length === 0` → return `null`
    - Guard: `const block = response.content[0]` → if `block.type !== 'text'` → return `null`
    - Return `{ content: block.text }`
  - Implement `completeMulti(request)`:
    - Single line: `return this.complete(request);`
  - Remove the `void request;` lint suppression lines

  **Must NOT do**:
  - Do NOT throw `FileProcessingError` for any error — return `null`
  - Do NOT place `systemPrompt` in the `messages[]` array
  - Do NOT skip the temperature clamp
  - Do NOT add streaming, retry logic, or shared utilities
  - Do NOT modify `llm-adapter.ts`, `openai.ts`, or `errors.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file, clear spec, no architectural decisions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential start)
  - **Blocks**: Task 2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/lib/suggestions/adapters/openai.ts:25–63` — error contract pattern (return null for all failures, never throw)
  - `src/lib/suggestions/adapters/openai.ts:18–23` — constructor pattern (store apiKey as private readonly)

  **API/Type References**:
  - `src/lib/suggestions/llm-adapter.ts:13–27` — `LlmCompletionRequest` and `LlmCompletionResponse` interfaces
  - `src/lib/suggestions/adapters/anthropic.ts` — current stub (replace entirely)

  **External References**:
  - `@anthropic-ai/sdk` — `client.messages.create()` params: `model`, `max_tokens` (required), `temperature` (0–1), `system` (top-level string), `messages: [{role: 'user', content: string}]`
  - Response shape: `response.content: ContentBlock[]` where `ContentBlock = { type: 'text', text: string } | { type: 'tool_use', ... }`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Verify implementation structure (static analysis)
    Tool: Bash
    Steps:
      1. cat src/lib/suggestions/adapters/anthropic.ts
      2. Assert: contains "import Anthropic from '@anthropic-ai/sdk'"
      3. Assert: contains "new Anthropic({ apiKey"
      4. Assert: contains "messages.create("
      5. Assert: contains "Math.min(request.temperature, 1.0)"
      6. Assert: contains "system: request.systemPrompt"
      7. Assert: does NOT contain "FileProcessingError"
      8. Assert: contains "return this.complete(request)"
    Expected Result: All assertions pass
    Evidence: .sisyphus/evidence/task-1-structure-check.txt

  Scenario: TypeScript compilation
    Tool: Bash
    Steps:
      1. npm run typecheck
    Expected Result: exit 0, no errors mentioning anthropic.ts
    Evidence: .sisyphus/evidence/task-1-typecheck.txt
  ```

  **Commit**: NO (commit after Task 2 together)

- [x] 2. Replace stub test block with real behavior tests

  **What to do**:
  - In `src/lib/suggestions/__tests__/llm-adapter.test.ts`, ONLY replace lines 106–164 (the `ClaudeLlmAdapter – stub throws FileProcessingError` describe block)
  - Keep lines 1–104 (imports + factory tests) completely unchanged
  - Add `vi.mock('@anthropic-ai/sdk')` at the top of the file (after existing imports)
  - Add a `vi.mocked` setup for the Anthropic constructor to return a mock client with a `messages.create` mock
  - New test suite: `describe('ClaudeLlmAdapter – real behavior', ...)`
  - Tests to include:
    1. `complete()` returns `{ content }` when SDK returns a text block
    2. `complete()` returns `null` when `content[]` is empty
    3. `complete()` returns `null` when `content[0].type !== 'text'`
    4. `complete()` returns `null` when SDK throws (network/API error)
    5. `completeMulti()` delegates to `complete()` — verify `messages.create` called once
    6. `complete()` clamps temperature > 1.0 to 1.0 — verify mock called with `temperature: 1.0` when request has `temperature: 1.5`
  - Remove the `import { FileProcessingError }` if it's no longer used after stub tests are gone (check if factory tests still use it — they do, so keep the import)

  **Must NOT do**:
  - Do NOT touch lines 1–104 (factory tests)
  - Do NOT add tests that test throwing FileProcessingError (stub behavior)
  - Do NOT use real network calls — all SDK calls must be mocked

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file edit, clear test cases, vitest mock patterns are well-established
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 1)
  - **Blocks**: Final Verification Wave
  - **Blocked By**: Task 1

  **References**:

  **Pattern References** (existing code to follow):
  - `src/lib/suggestions/__tests__/llm-adapter.test.ts:1–104` — existing factory tests (preserve unchanged, use as style guide)
  - `src/lib/detection/__tests__/copyleaks.test.ts` — example of vi.mock + mock instance pattern in this codebase

  **API/Type References**:
  - `src/lib/suggestions/adapters/anthropic.ts` — the implemented class (after Task 1)
  - `@anthropic-ai/sdk` types: `MessagesPage`, `Message`, `TextBlock`, `ContentBlock`

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: All tests pass including preserved factory tests
    Tool: Bash
    Steps:
      1. npm run test -- src/lib/suggestions/__tests__/llm-adapter.test.ts
    Expected Result: exit 0, no test failures, factory tests present in output
    Evidence: .sisyphus/evidence/task-2-test-run.txt

  Scenario: Stub test descriptions no longer exist
    Tool: Bash
    Steps:
      1. grep "stub throws" src/lib/suggestions/__tests__/llm-adapter.test.ts
    Expected Result: no output (grep finds nothing)
    Evidence: .sisyphus/evidence/task-2-no-stub.txt

  Scenario: New tests cover all required cases
    Tool: Bash
    Steps:
      1. grep -n "ClaudeLlmAdapter" src/lib/suggestions/__tests__/llm-adapter.test.ts
    Expected Result: Lines showing: happy path, null content, non-text block, SDK throws, completeMulti delegates, temperature clamp
    Evidence: .sisyphus/evidence/task-2-coverage-check.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `feat(suggestions): implement Claude LLM adapter with Anthropic SDK`
  - Files: `src/lib/suggestions/adapters/anthropic.ts`, `src/lib/suggestions/__tests__/llm-adapter.test.ts`
  - Pre-commit: `npm run typecheck && npm run lint && npm run test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Verify factory tests (lines 31–104 of llm-adapter.test.ts) are unchanged. Verify no test descriptions contain "stub throws".
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck` + `npm run lint` + `npm run test`. Review `anthropic.ts` for: `as any`/`@ts-ignore`, empty catches without comment, console.log, AI slop patterns (excessive comments, over-abstraction).
  Output: `Typecheck [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Read `anthropic.ts`. Verify: (1) `new Anthropic({ apiKey })` construction, (2) `client.messages.create()` call with correct params, (3) `Math.min(temperature, 1.0)` present, (4) `system` is top-level (not in messages array), (5) `content[0]?.type === 'text'` guard, (6) all catch blocks return `null`. Read test file — verify factory block unchanged and new tests cover happy path + null + error.
  Output: `Guards [N/N] | API params [PASS/FAIL] | Tests coverage [PASS/FAIL] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  Verify ONLY `anthropic.ts` and the stub test block in `llm-adapter.test.ts` were changed. No other files touched. No scope creep: no shared utilities, no openai.ts changes, no llm-adapter.ts interface changes.
  Output: `Files changed [N — expected 2] | Contamination [CLEAN/issues] | VERDICT`

---

## Commit Strategy

- **After Task 2**: `feat(suggestions): implement Claude LLM adapter with Anthropic SDK`
  - Files: `src/lib/suggestions/adapters/anthropic.ts`, `src/lib/suggestions/__tests__/llm-adapter.test.ts`
  - Pre-commit: `npm run typecheck && npm run lint && npm run test`

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck   # Expected: exit 0
npm run lint        # Expected: exit 0
npm run test        # Expected: all tests pass
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All tests pass
