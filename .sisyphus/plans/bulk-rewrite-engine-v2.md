# Bulk Rewrite Engine V2 — Time-Budget Loop with Score-Aware Strategies

## TL;DR

> **Quick Summary**: Replace the fixed 3-round bulk rewrite loop with a time-budget engine that keeps rewriting until the target score is met or the 60s Vercel timeout approaches. Add score-aware LLM prompts, plateau detection, retry of already-rewritten sentences, and regression protection.
> 
> **Deliverables**:
> - Time-budget engine replacing MAX_ROUNDS=3 loop (capped at 10 rounds, 50s deadline)
> - Score-aware LLM prompts that tell the model the sentence's detection score
> - Plateau detection (stop if <2% improvement over 2 consecutive rounds)
> - Retry already-rewritten sentences with regression protection (keep better version)
> - Graceful partial result return when deadline is hit
> - Enhanced UI messaging for partial/timeout results
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (types + time-budget TDD) → Task 2 (plateau) → Tasks 3-4 (parallel: prompts + retry) → Task 5 (route) → Task 6 (UI) → Task 7 (verification)

---

## Context

### Original Request
User reported that bulk rewrite fails to reach the target AI detection score — it stops after only 3 rounds. User wants it to keep going until the target is met, with improved rewriting strategies.

### Interview Summary
**Key Discussions**:
- Current `MAX_ROUNDS=3` is insufficient for many documents
- User wants unlimited rounds (time-based) within Vercel's 60s timeout
- Rewriting prompts should be score-aware (tell LLM the detection score)
- Already-rewritten sentences should be retried if score is still high
- Sentence selection strategy should be improved
- TDD approach with Vitest

**Research Findings**:
- `bulkRewrite.ts`: Simple loop with `while (iterations < MAX_ROUNDS && achievedScore > targetScore)`
- `_score` parameter in `generateSingleSuggestionWithProvider` is UNUSED — LLM never sees detection score
- Each rewrite = 2 LLM calls (two-pass) with CONCURRENCY=5
- Detection re-analysis takes 1 call per round
- Estimated: ~6-8 rounds feasible in 50s depending on sentence count
- API response format (`BulkRewriteResult`) already handles `targetMet: false` gracefully

### Metis Review
**Identified Gaps** (addressed):
- **Timeout handling**: No graceful timeout — engine must return partial results before deadline, not crash
- **Score regression**: Retrying a sentence might produce worse rewrite — need before/after comparison
- **Plateau detection**: Score may plateau after 2-3 rounds — wasting time on marginal improvements
- **Test determinism**: Time-based logic needs injectable clock (`now()` parameter) for reliable tests
- **Whole-text rewriting**: Deferred to follow-up task — fundamentally different prompt structure, token cost too high for time-constrained approach
- **API cost ceiling**: Should document max expected calls (~10 rounds × N sentences × 2 LLM + 10 detection)

---

## Work Objectives

### Core Objective
Make `executeBulkRewrite()` reliably achieve the user's target score within Vercel's 60-second timeout by replacing the fixed 3-round limit with a time-budget loop, improving LLM prompts with detection score awareness, and adding retry/plateau detection logic.

### Concrete Deliverables
- Modified `src/lib/bulk-rewrite/bulkRewrite.ts` with time-budget engine
- Modified `src/lib/bulk-rewrite/types.ts` with new config types
- Modified `src/lib/suggestions/llm.ts` with score-aware prompt
- Modified `src/app/api/bulk-rewrite/route.ts` with deadline passing
- Modified `src/components/TargetScorePanel.tsx` with improved messaging
- Updated test files for all modifications

### Definition of Done
- [ ] `npm run test` → all tests pass (618+ existing + new tests)
- [ ] `npm run typecheck` → zero errors
- [ ] `npm run lint` → zero errors
- [ ] Engine stops before 50s deadline and returns partial results (not errors)
- [ ] Engine detects score plateau and stops early
- [ ] Retried sentences keep better version (regression protection)
- [ ] LLM prompt includes detection score context

### Must Have
- Time-budget loop replacing fixed MAX_ROUNDS=3 (capped at 10 rounds, 50s deadline)
- Injectable clock for testability (`now?: () => number`)
- Graceful partial result return on deadline (not error/crash)
- Score-aware LLM prompt (thread detection score into user prompt)
- Plateau detection (stop if <2% improvement over 2 consecutive rounds)
- Retry already-rewritten sentences with regression protection
- All existing 618 tests pass without modification
- TDD for all new behavior

### Must NOT Have (Guardrails)
- **NO SSE/streaming changes** — API stays synchronous JSON request/response
- **NO new npm dependencies**
- **NO changes to `BulkRewriteResult` interface shape** — response contract unchanged
- **NO changes to detection adapters or scoring**
- **NO changes to `TargetScorePanelProps` interface** — UI changes are cosmetic only
- **NO passage-level or whole-text rewriting** — deferred to follow-up task
- **NO changes to Settings UI**
- **NO changes to `buildRequestHeaders()` or `getRequestSettings()`**
- **NO changes to guardrails logic** (`applyGuardrails` stays unchanged)
- **NO changes to `CONCURRENCY` value** (stays at 5)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: TDD (write tests first, then implementation)
- **Framework**: Vitest
- **Time mocking**: `vi.useFakeTimers()` or injectable `now()` function parameter

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Test execution**: Bash — `npx vitest run {specific-test-file}`, `npm run test`
- **TypeScript check**: Bash — `npm run typecheck`
- **Lint check**: Bash — `npm run lint`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — sequential TDD):
├── Task 1: Types + Time-budget engine core (TDD) [deep]
├── Task 2: Plateau detection (TDD) [quick]

Wave 2 (Strategy improvements — PARALLEL after Wave 1):
├── Task 3: Score-aware LLM prompts (depends: 1) [unspecified-high]
├── Task 4: Retry already-rewritten + regression protection (depends: 2) [deep]

Wave 3 (Integration — after Wave 2):
├── Task 5: Route deadline passing + integration (depends: 1,3,4) [quick]
├── Task 6: UI messaging enhancement (depends: 5) [quick]
├── Task 7: Final verification sweep (depends: 6) [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 4 → Task 5 → Task 6 → Task 7 → F1-F4 → user okay
Parallel Speedup: ~30% faster than sequential
Max Concurrent: 2 (Wave 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2, 3, 5 | 1 |
| 2 | 1 | 4 | 1 |
| 3 | 1 | 5 | 2 |
| 4 | 2 | 5 | 2 |
| 5 | 1, 3, 4 | 6 | 3 |
| 6 | 5 | 7 | 3 |
| 7 | 6 | F1-F4 | 3 |
| F1-F4 | 7 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **2 tasks** — T1 → `deep`, T2 → `quick`
- **Wave 2**: **2 tasks** — T3 → `unspecified-high`, T4 → `deep`
- **Wave 3**: **3 tasks** — T5 → `quick`, T6 → `quick`, T7 → `quick`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Types + Time-Budget Engine Core (TDD)

  **What to do**:

  **TDD Red Phase — Write tests first:**
  - Add new tests in `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts`:
    - `'should use time budget instead of fixed MAX_ROUNDS'`: Mock `now()` to advance by 10s per round. Set deadline=25s. Verify engine runs 2 rounds then stops (not 3).
    - `'should return partial results when deadline is reached'`: Mock `now()` advancing quickly. Verify `targetMet: false`, `achievedScore` reflects best so far, `rewrites` contains work done.
    - `'should accept injectable now() function'`: Pass custom `now` to config, verify it's called.
    - `'should cap at MAX_ROUNDS=10 even with remaining time budget'`: Mock `now()` that never advances. Verify engine stops at 10 rounds.
    - `'should check deadline before starting each round'`: Mock `now()` to be past deadline before round 2. Verify only 1 round executes.
    - `'should check deadline before each LLM call within a round'`: Mock `now()` past deadline mid-round. Verify partial round results are kept.
  - Use existing test helpers: `makeSentence`, `makeAnalysisResult`, `makeSuggestion`, `makeRequest`
  - Use `vi.useFakeTimers()` or inject `now` parameter

  **Types changes (`types.ts`):**
  - Add to `executeBulkRewrite` config: `deadlineMs?: number` (default 50000), `now?: () => number` (default `Date.now`)
  - Keep `BulkRewriteResult` interface UNCHANGED

  **Engine changes (`bulkRewrite.ts`):**
  - Remove `const MAX_ROUNDS = 3` → Add `const MAX_ROUNDS = 10` (hard safety cap)
  - Add `const DEFAULT_DEADLINE_MS = 50_000`
  - Modify `executeBulkRewrite` signature: accept `deadlineMs` and `now` in config
  - Compute `deadline = startTime + deadlineMs`
  - Replace `while (iterations < MAX_ROUNDS && achievedScore > targetScore)` with:
    ```
    while (iterations < MAX_ROUNDS && achievedScore > targetScore && now() < deadline)
    ```
  - Before each `runWithConcurrency` call, check `now() < deadline`
  - Inside `runWithConcurrency` task callback, check deadline before each LLM call — if past deadline, skip remaining candidates
  - After loop, return best results so far (not error)
  - Add code comment documenting max API call ceiling

  **Must NOT do**:
  - Do NOT change `BulkRewriteResult` interface shape
  - Do NOT change `CONCURRENCY` value
  - Do NOT change `ELIGIBLE_SCORE_FLOOR`
  - Do NOT touch `route.ts` yet (Task 5)
  - Do NOT touch LLM prompts (Task 3)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core engine rewrite with complex time-based logic, concurrency interaction, and multiple test scenarios
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (first task)
  - **Blocks**: [Task 2, Task 3, Task 5]
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/bulk-rewrite/bulkRewrite.ts:1-151` — ENTIRE current engine. Focus on the while loop (line 91), `runWithConcurrency` (line 105), and result construction (lines 144-150)
  - `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts` — ENTIRE current test file. Follow existing mock patterns (`vi.mock`, `makeSentence`, `makeAnalysisResult`, `makeSuggestion`, `makeRequest` helpers)

  **API/Type References**:
  - `src/lib/bulk-rewrite/types.ts:1-101` — Current types. `BulkRewriteResult` must NOT change shape. Add config types.

  **WHY Each Reference Matters**:
  - `bulkRewrite.ts` is the core engine — every line of the while loop needs modification
  - Test file patterns are critical — new tests MUST follow the exact same mock/helper pattern
  - `types.ts` defines the contract — `BulkRewriteResult` shape is frozen

  **Acceptance Criteria**:

  **TDD Red → Green:**
  - [ ] New tests added to `bulkRewrite.test.ts` (6+ new test cases)
  - [ ] `npx vitest run src/lib/bulk-rewrite/` → all tests PASS (old + new)
  - [ ] Engine uses time-budget loop instead of fixed MAX_ROUNDS=3
  - [ ] `MAX_ROUNDS` is now 10 (safety cap)
  - [ ] `deadlineMs` defaults to 50000
  - [ ] `now()` is injectable for testing
  - [ ] Partial results returned on deadline (not error)
  - [ ] `npm run typecheck` → zero errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Time-budget engine replaces fixed rounds
    Tool: Bash
    Preconditions: Engine modified with time-budget loop
    Steps:
      1. Run: npx vitest run src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts
      2. Assert: exit code 0
      3. Assert: output contains "time budget" or "deadline" test names passing
    Expected Result: All tests pass including new time-budget tests
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-1-time-budget-tests.txt

  Scenario: TypeScript compiles cleanly
    Tool: Bash
    Steps:
      1. Run: npm run typecheck
      2. Assert: exit code 0
    Expected Result: Zero type errors
    Failure Indicators: Any type error
    Evidence: .sisyphus/evidence/task-1-typecheck.txt
  ```

  **Commit**: YES (Commit 1)
  - Message: `refactor(bulk-rewrite): replace fixed rounds with time-budget engine`
  - Files: `src/lib/bulk-rewrite/bulkRewrite.ts`, `src/lib/bulk-rewrite/types.ts`, `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts`
  - Pre-commit: `npx vitest run src/lib/bulk-rewrite/`

---

- [x] 2. Plateau Detection (TDD)

  **What to do**:

  **TDD Red Phase — Write tests first:**
  - Add tests in `bulkRewrite.test.ts`:
    - `'should stop when score improvement plateaus (<2% over 2 consecutive rounds)'`: Mock `analyzeText` returning scores 0.80 → 0.78 → 0.77. Target is 0.30. Verify engine stops after round 3 (2 consecutive rounds of <2% improvement).
    - `'should continue when improvement is above threshold'`: Mock scores 0.80 → 0.60 → 0.45. Verify engine continues all rounds.
    - `'should reset plateau counter when a round has significant improvement'`: Mock scores 0.80 → 0.78 → 0.60 → 0.59. Verify engine stops after round 4 (not round 3).

  **Engine changes (`bulkRewrite.ts`):**
  - Add `const PLATEAU_THRESHOLD = 0.02` (2 percentage points as 0-1 fraction)
  - Add `const PLATEAU_ROUNDS = 2` (consecutive rounds needed to trigger)
  - Track `previousScore` and `plateauCount` across rounds
  - After each round's re-analysis: if `(previousScore - achievedScore) < PLATEAU_THRESHOLD`, increment `plateauCount`; else reset to 0
  - If `plateauCount >= PLATEAU_ROUNDS`, break loop
  - Update `previousScore = achievedScore` after each check

  **Must NOT do**:
  - Do NOT change anything from Task 1 that isn't plateau-related
  - Do NOT modify types or route

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small addition to the engine loop — a few lines of plateau tracking logic + 3 test cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (sequential after Task 1)
  - **Blocks**: [Task 4]
  - **Blocked By**: [Task 1]

  **References**:

  **Pattern References**:
  - `src/lib/bulk-rewrite/bulkRewrite.ts` — The while loop from Task 1 — add plateau check after `achievedScore = reAnalysis.score` (around line 136)
  - `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts` — Follow same mock patterns. Key: mock `analyzeText` to return decreasing scores across calls using `.mockResolvedValueOnce()` chains

  **WHY Each Reference Matters**:
  - Engine loop is where plateau detection goes — right after re-analysis score update
  - Test patterns show how to mock sequential `analyzeText` returns

  **Acceptance Criteria**:
  - [ ] `PLATEAU_THRESHOLD` and `PLATEAU_ROUNDS` constants defined
  - [ ] Engine stops when 2 consecutive rounds improve by less than 2%
  - [ ] 3 new test cases pass
  - [ ] `npx vitest run src/lib/bulk-rewrite/` → all tests PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Plateau detection stops engine
    Tool: Bash
    Steps:
      1. Run: npx vitest run src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts
      2. Assert: exit code 0
      3. Assert: output contains "plateau" test names passing
    Expected Result: All plateau tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-2-plateau-tests.txt
  ```

  **Commit**: YES (Commit 2)
  - Message: `feat(bulk-rewrite): add plateau detection to stop wasting rounds`
  - Files: `src/lib/bulk-rewrite/bulkRewrite.ts`, `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts`
  - Pre-commit: `npx vitest run src/lib/bulk-rewrite/`

---

- [x] 3. Score-Aware LLM Prompts (TDD)

  **What to do**:

  **TDD Red Phase — Write tests first:**
  - Add/modify tests in `src/lib/suggestions/__tests__/llm-adapter.test.ts` or `src/lib/suggestions/__tests__/llm.test.ts` (whichever exists, or create `llm.test.ts`):
    - `'should include detection score in user prompt when score is provided'`: Call `generateSingleSuggestionWithProvider` with score=0.85. Verify the LLM adapter's `complete()` is called with a user prompt containing "85%" or "0.85" or similar score reference.
    - `'should not include score context when score is 0 or undefined'`: Verify prompt doesn't have score text when score=0.
    - `'should use score in buildUserPrompt for bulk rewrite'`: Verify the prompt template includes score context.

  **LLM changes (`llm.ts`):**
  - Rename `_score` parameter to `score` in `generateSingleSuggestionWithProvider` (line 273)
  - Modify `buildUserPrompt` to accept optional `score?: number` parameter
  - When `score` is provided and > 0, prepend to the base prompt:
    ```
    This sentence was flagged as {Math.round(score * 100)}% likely AI-generated. Focus on making it sound distinctly human — vary rhythm, use specific details, and avoid formulaic patterns.
    ```
  - Thread `score` from `generateSingleSuggestionWithProvider` → `twoPassRewrite` → `buildUserPrompt` (only for pass 1 — pass 2 rewrites the pass-1 output, no score needed)
  - Also update `buildMultiUserPrompt` with same score parameter for consistency with `generateAlternativeSuggestions`

  **Must NOT do**:
  - Do NOT change system prompts (SYSTEM_PROMPT, STYLE_SYSTEM_PROMPT etc.)
  - Do NOT change `twoPassRewrite` temperature values
  - Do NOT change `LlmSuggestionService.suggest()` — it doesn't use score
  - Do NOT change guardrails — score context in prompts should NOT trigger banned patterns (verify!)
  - Do NOT include phrases like "reduce AI score" or "avoid detection" in the prompt — guardrails will filter them

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: LLM prompt engineering requires understanding guardrails interaction, multi-function threading
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: [Task 5]
  - **Blocked By**: [Task 1]

  **References**:

  **Pattern References**:
  - `src/lib/suggestions/llm.ts:86-104` — `buildUserPrompt` function — add score parameter here
  - `src/lib/suggestions/llm.ts:197-231` — `twoPassRewrite` function — thread score to pass 1 only
  - `src/lib/suggestions/llm.ts:269-294` — `generateSingleSuggestionWithProvider` — rename `_score` to `score`, thread to `twoPassRewrite`
  - `src/lib/suggestions/guardrails.ts:15-26` — BANNED_PATTERNS — verify new prompt text doesn't match these

  **Test References**:
  - `src/lib/suggestions/__tests__/llm-adapter.test.ts` — Existing adapter tests, follow mock patterns
  - `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts` — Verify `generateSingleSuggestionWithProvider` is called with score (not underscore-ignored)

  **WHY Each Reference Matters**:
  - `buildUserPrompt` is where the score context gets injected — core change
  - `twoPassRewrite` calls `buildUserPrompt` twice — score only for pass 1
  - `generateSingleSuggestionWithProvider` receives `_score` but ignores it — rename and use
  - Guardrails patterns must NOT match the new prompt text (e.g., "avoid detection" is banned)

  **Acceptance Criteria**:
  - [ ] `_score` renamed to `score` in `generateSingleSuggestionWithProvider`
  - [ ] `buildUserPrompt` includes score context when score > 0
  - [ ] Score-aware prompt does NOT trigger guardrail banned patterns
  - [ ] New tests pass
  - [ ] `npx vitest run src/lib/suggestions/` → all tests PASS
  - [ ] `npm run typecheck` → zero errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Score-aware prompt tests pass
    Tool: Bash
    Steps:
      1. Run: npx vitest run src/lib/suggestions/
      2. Assert: exit code 0
    Expected Result: All suggestion tests pass including score-aware ones
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-3-score-prompt-tests.txt

  Scenario: Score prompt doesn't trigger guardrails
    Tool: Bash
    Steps:
      1. Run: npx vitest run src/lib/suggestions/__tests__/
      2. Verify no tests show guardrail-filtered results for score-aware rewrites
    Expected Result: Guardrails don't filter score-context rewrites
    Evidence: .sisyphus/evidence/task-3-guardrails-safe.txt
  ```

  **Commit**: YES (Commit 3)
  - Message: `feat(llm): add score-aware prompts for better rewriting`
  - Files: `src/lib/suggestions/llm.ts`, suggestion test file(s)
  - Pre-commit: `npx vitest run src/lib/suggestions/`

---

- [x] 4. Retry Already-Rewritten Sentences with Regression Protection (TDD)

  **What to do**:

  **TDD Red Phase — Write tests first:**
  - Add tests in `bulkRewrite.test.ts`:
    - `'should retry already-rewritten sentences if score is still above threshold'`: Mock round 1 rewrites sentence 0 (score 0.9→0.5). Mock round 2 re-analysis shows sentence 0 still at 0.4. Verify `generateSingleSuggestionWithProvider` is called for sentence 0 again in round 2.
    - `'should keep old rewrite when retry produces higher score'`: Mock round 1 rewrites sentence 0 to "rewrite-v1". Round 2 re-analysis: sentence 0 score=0.4. Round 2 rewrites to "rewrite-v2". Round 3 re-analysis: sentence 0 score=0.6 (WORSE). Verify final `rewrites[0]` is "rewrite-v1" (not v2).
    - `'should use new rewrite when retry produces lower score'`: Same setup but round 3 score=0.2 (better). Verify final `rewrites[0]` is "rewrite-v2".
    - `'should still preserve manual replacements (never retry those)'`: Verify sentences in `manualReplacements` are never retried regardless of score.

  **Engine changes (`bulkRewrite.ts`):**
  - Remove the filter that excludes already-rewritten sentences from candidates:
    - Currently candidates filter checks `preserveReplacements[entry.sentenceIndex] === undefined` — this stays (manual replacements preserved)
    - But there's no explicit filter for `rewrites` — actually looking at the code, `workingSentences` comes from re-analysis, so already-rewritten sentences naturally appear with their new scores. The current code already allows retries! The issue is that `preserveReplacements` check is the only exclusion. **Verify this.**
    - If retries already work: the main addition is regression protection
  - Add regression protection:
    - Track `bestRewrites: Record<number, { text: string; score: number }>` — best rewrite per sentence with its score
    - After each round's re-analysis, for each sentence with a rewrite:
      - If `bestRewrites[idx]` exists and new score > best score → revert to best rewrite
      - If new score <= best score → update best
    - Final `rewrites` dict constructed from `bestRewrites`

  **Must NOT do**:
  - Do NOT change manual replacement preservation logic
  - Do NOT change `ELIGIBLE_SCORE_FLOOR`
  - Do NOT change concurrency

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex state tracking across rounds — bestRewrites map, score comparison, regression rollback
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: [Task 5]
  - **Blocked By**: [Task 2]

  **References**:

  **Pattern References**:
  - `src/lib/bulk-rewrite/bulkRewrite.ts:91-142` — Main while loop. Focus on:
    - Line 92-98: Candidate filtering — verify retries are already allowed
    - Line 119: `rewrites[candidate.sentenceIndex] = safeSuggestion.rewrite` — needs regression check
    - Lines 137-141: `workingSentences` reconstruction from re-analysis — these have new scores
  - `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts` — Mock sequential `analyzeText` returns and `generateSingleSuggestionWithProvider` returns

  **WHY Each Reference Matters**:
  - The candidate filtering logic determines whether retries happen — need to verify current behavior
  - The rewrite assignment line is where regression protection gates the update
  - Test patterns show how to mock per-call returns for multi-round scenarios

  **Acceptance Criteria**:
  - [ ] Already-rewritten sentences are retried when their score is still above ELIGIBLE_SCORE_FLOOR
  - [ ] Regression protection: old rewrite kept when new one produces worse detection score
  - [ ] Manual replacements still never retried
  - [ ] 4 new test cases pass
  - [ ] `npx vitest run src/lib/bulk-rewrite/` → all tests PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Retry and regression protection tests pass
    Tool: Bash
    Steps:
      1. Run: npx vitest run src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts
      2. Assert: exit code 0
      3. Assert: output contains "retry" and "regression" test names passing
    Expected Result: All retry/regression tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-4-retry-regression-tests.txt
  ```

  **Commit**: YES (Commit 4)
  - Message: `feat(bulk-rewrite): retry already-rewritten sentences with regression protection`
  - Files: `src/lib/bulk-rewrite/bulkRewrite.ts`, `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts`
  - Pre-commit: `npx vitest run src/lib/bulk-rewrite/`

---

- [x] 5. Route Deadline Passing + Integration (TDD)

  **What to do**:

  **TDD — Update integration tests:**
  - Verify/update tests that call `executeBulkRewrite` to confirm `deadlineMs` is passed from route
  - Add test: route passes deadline config derived from `maxDuration`

  **Route changes (`route.ts`):**
  - Add `const ROUTE_DEADLINE_MS = 50_000` (50s, leaving 10s buffer for Vercel's 60s limit)
  - Pass `deadlineMs: ROUTE_DEADLINE_MS` in the config object to `executeBulkRewrite`:
    ```typescript
    const result = await executeBulkRewrite(rewriteRequest, undefined, {
      llmApiKey: settings.llmApiKey,
      llmProvider: settings.llmProvider,
      detectionApiKey: settings.detectionApiKey,
      detectionProvider: settings.detectionProvider,
      deadlineMs: ROUTE_DEADLINE_MS,
    });
    ```
  - The result handling stays the same — `executeBulkRewrite` already returns `targetMet: false` when deadline is hit (from Task 1)

  **Must NOT do**:
  - Do NOT change request validation logic
  - Do NOT change response format
  - Do NOT add streaming/SSE
  - Do NOT change `maxDuration = 60`
  - Do NOT change error handling patterns

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Tiny change — add one constant and one config property
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Wave 2)
  - **Blocks**: [Task 6]
  - **Blocked By**: [Task 1, Task 3, Task 4]

  **References**:

  **Pattern References**:
  - `src/app/api/bulk-rewrite/route.ts:131-137` — The `executeBulkRewrite` call — add `deadlineMs` to config
  - `src/lib/bulk-rewrite/bulkRewrite.ts:47-56` — `executeBulkRewrite` config type — verify `deadlineMs` is accepted

  **WHY Each Reference Matters**:
  - Route is the only production caller of `executeBulkRewrite` — this is where deadline gets injected
  - Engine config type must match what route passes

  **Acceptance Criteria**:
  - [ ] `ROUTE_DEADLINE_MS = 50_000` defined in route
  - [ ] `deadlineMs` passed to `executeBulkRewrite`
  - [ ] `npm run test` → all tests pass
  - [ ] `npm run typecheck` → zero errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass with deadline integration
    Tool: Bash
    Steps:
      1. Run: npm run test
      2. Assert: exit code 0
    Expected Result: All tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-5-integration-tests.txt

  Scenario: TypeScript compiles
    Tool: Bash
    Steps:
      1. Run: npm run typecheck
      2. Assert: exit code 0
    Expected Result: Zero type errors
    Evidence: .sisyphus/evidence/task-5-typecheck.txt
  ```

  **Commit**: YES (Commit 5)
  - Message: `feat(api): pass deadline to bulk rewrite engine`
  - Files: `src/app/api/bulk-rewrite/route.ts`
  - Pre-commit: `npm run test`

---

- [x] 6. UI Result Messaging Enhancement

  **What to do**:

  **Component changes (`TargetScorePanel.tsx`):**
  - Improve the amber (target not met) result message to be more informative:
    - Current: `Best achieved: X% (target: Y%). Try editing individual sentences.`
    - New: `Best achieved: X% after N rounds (target: Y%). The score may have plateaued — try editing individual high-risk sentences manually.`
  - To support this, the `result` prop already has `achievedScore` and `targetScore`. Need to also pass `iterations` from `BulkRewriteResult`:
    - **BUT** `TargetScorePanelProps.result` shape is: `{ achievedScore: number; targetMet: boolean; targetScore: number }` — we said we won't change the interface.
    - **Resolution**: Add `iterations?: number` as optional to the result type in the component props (backward compatible since it's optional). The page.tsx already receives `iterations` from the API response — just thread it through.
  - Update `page.tsx` to pass `iterations` in the result object to `TargetScorePanel`

  **Must NOT do**:
  - Do NOT change `BulkRewriteResult` in `types.ts` (API contract)
  - Do NOT change TargetScorePanel's required props
  - Do NOT add new state management

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: UI text change + one optional prop addition
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 5)
  - **Blocks**: [Task 7]
  - **Blocked By**: [Task 5]

  **References**:

  **Pattern References**:
  - `src/components/TargetScorePanel.tsx:97-109` — Result display section — update amber message text
  - `src/components/TargetScorePanel.tsx:3-11` — Props interface — add optional `iterations` to result type
  - `src/app/page.tsx` — Where `TargetScorePanel` is rendered — find where result is passed and add `iterations`

  **WHY Each Reference Matters**:
  - TargetScorePanel is the only component showing bulk rewrite results
  - page.tsx is the parent that passes the result — needs to thread `iterations`

  **Acceptance Criteria**:
  - [ ] Amber message includes round count
  - [ ] `iterations` is optional in props (backward compatible)
  - [ ] `npm run lint` → zero errors
  - [ ] `npm run typecheck` → zero errors

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: UI compiles and lints clean
    Tool: Bash
    Steps:
      1. Run: npm run typecheck
      2. Assert: exit code 0
      3. Run: npm run lint
      4. Assert: exit code 0
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-6-ui-check.txt
  ```

  **Commit**: YES (Commit 6)
  - Message: `fix(ui): improve bulk rewrite result messaging with round count`
  - Files: `src/components/TargetScorePanel.tsx`, `src/app/page.tsx`
  - Pre-commit: `npm run lint`

---

- [x] 7. Final Verification Sweep

  **What to do**:
  - Run the full test suite: `npm run test`
  - Run TypeScript compiler: `npm run typecheck`
  - Run linter: `npm run lint`
  - Verify all new constants exist: `MAX_ROUNDS=10`, `DEFAULT_DEADLINE_MS=50000`, `PLATEAU_THRESHOLD=0.02`, `PLATEAU_ROUNDS=2`
  - Verify `_score` is renamed to `score` in `generateSingleSuggestionWithProvider`
  - Verify `BulkRewriteResult` interface is unchanged from before this plan

  **Must NOT do**:
  - Do NOT make code changes (verification only)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Verification only — run commands, check output
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 6)
  - **Blocks**: [F1, F2, F3, F4]
  - **Blocked By**: [Task 6]

  **References**:
  - All modified files from Tasks 1-6

  **Acceptance Criteria**:
  - [ ] `npm run test` → all tests pass (exact count captured)
  - [ ] `npm run typecheck` → zero errors
  - [ ] `npm run lint` → zero errors
  - [ ] `MAX_ROUNDS` is 10 in bulkRewrite.ts
  - [ ] `DEFAULT_DEADLINE_MS` is 50000 in bulkRewrite.ts
  - [ ] `PLATEAU_THRESHOLD` is 0.02 in bulkRewrite.ts
  - [ ] `_score` renamed to `score` in llm.ts

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps:
      1. Run: npm run test
      2. Capture output
      3. Assert: exit code 0
    Expected Result: All tests pass
    Evidence: .sisyphus/evidence/task-7-full-tests.txt

  Scenario: TypeScript and lint clean
    Tool: Bash
    Steps:
      1. Run: npm run typecheck
      2. Assert: exit code 0
      3. Run: npm run lint
      4. Assert: exit code 0
    Expected Result: Zero errors
    Evidence: .sisyphus/evidence/task-7-typecheck-lint.txt

  Scenario: Key constants verified
    Tool: Bash
    Steps:
      1. Run: Select-String -Path "src/lib/bulk-rewrite/bulkRewrite.ts" -Pattern "MAX_ROUNDS|DEFAULT_DEADLINE_MS|PLATEAU_THRESHOLD|PLATEAU_ROUNDS"
      2. Assert: MAX_ROUNDS = 10, DEFAULT_DEADLINE_MS = 50_000 or 50000, PLATEAU_THRESHOLD = 0.02, PLATEAU_ROUNDS = 2
      3. Run: Select-String -Path "src/lib/suggestions/llm.ts" -Pattern "_score"
      4. Assert: zero matches (renamed to score)
    Expected Result: All constants correct, _score renamed
    Evidence: .sisyphus/evidence/task-7-constants.txt
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [8/8] | Must NOT Have [10/10] | Tasks [7/7] | Evidence [9/9] | VERDICT: APPROVE`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck` + `npm run lint` + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT: APPROVE`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [9/9 pass] | Integration [4/4] | Edge Cases [3 tested] | VERDICT: APPROVE`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [7/7 compliant] | Contamination [CLEAN] | Unaccounted [CLEAN] | VERDICT: APPROVE`

---

## Commit Strategy

| Commit | Message | Key Files | Pre-commit Check |
|--------|---------|-----------|-----------------|
| 1 | `refactor(bulk-rewrite): replace fixed rounds with time-budget engine` | `bulkRewrite.ts`, `types.ts`, `bulkRewrite.test.ts` | `npx vitest run src/lib/bulk-rewrite/` |
| 2 | `feat(bulk-rewrite): add plateau detection to stop wasting rounds` | `bulkRewrite.ts`, `bulkRewrite.test.ts` | `npx vitest run src/lib/bulk-rewrite/` |
| 3 | `feat(llm): add score-aware prompts for better AI detection evasion` | `llm.ts`, `llm-adapter.test.ts` or related | `npx vitest run src/lib/suggestions/` |
| 4 | `feat(bulk-rewrite): retry already-rewritten sentences with regression protection` | `bulkRewrite.ts`, `bulkRewrite.test.ts` | `npx vitest run src/lib/bulk-rewrite/` |
| 5 | `feat(api): pass deadline to bulk rewrite engine` | `route.ts`, integration tests | `npm run test` |
| 6 | `fix(ui): improve bulk rewrite result messaging` | `TargetScorePanel.tsx` | `npm run lint` |

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck   # Expected: zero errors
npm run lint        # Expected: zero errors
npm run test        # Expected: all tests pass (618+ existing + new)
```

### Final Checklist
- [ ] Time-budget loop replaces MAX_ROUNDS=3
- [ ] Injectable clock for test determinism
- [ ] Partial results returned on deadline (not error)
- [ ] Score-aware prompt includes detection score
- [ ] Plateau detection stops after 2 rounds of <2% improvement
- [ ] Retry already-rewritten sentences enabled
- [ ] Regression protection keeps better version
- [ ] All existing 618 tests pass
- [ ] All new tests pass
- [ ] TypeScript compiles cleanly
- [ ] Lint passes
