# Upgrade Claude Model: claude-3-5-haiku-20241022 → claude-haiku-4-5-20251001

## TL;DR

> **Quick Summary**: Replace the deprecated `claude-3-5-haiku-20241022` model ID with the latest `claude-haiku-4-5-20251001` (alias: `claude-haiku-4-5`) in the Anthropic adapter file. Update both the code string and the JSDoc comment atomically.
>
> **Deliverables**:
> - `src/lib/suggestions/adapters/anthropic.ts` — 2 string changes (line 7 JSDoc + line 23 model literal)
>
> **Estimated Effort**: Quick (< 5 minutes)
> **Parallel Execution**: NO — single sequential task
> **Critical Path**: Task 1 → F1-F2 (verification)

---

## Context

### Original Request
User received this deprecation warning in terminal while running profile generate:
```
The model 'claude-3-5-haiku-20241022' is deprecated and will reach end-of-life on February 19th, 2026
Please migrate to a newer model. Visit https://docs.anthropic.com/en/docs/resources/model-deprecations for more information.
```

### Interview Summary
**Key Discussions**:
- Model is hardcoded in `src/lib/suggestions/adapters/anthropic.ts`
- User selected `claude-haiku-4-5` (the Haiku family successor)
- Only one file needs to change; no test files need updating (tests mock the SDK entirely)

**Research Findings**:
- Official Anthropic docs (verified Apr 2026) confirm:
  - **API ID**: `claude-haiku-4-5-20251001`
  - **API alias**: `claude-haiku-4-5` ← use this (stable alias, same as pinned snapshot)
  - Haiku 4.5 is the fastest current model, $1/$5 per MTok input/output
  - Context window: 200k tokens (up from prior limits)
  - Max output: 64k tokens
- No other files reference `claude-3-5-haiku-20241022` (confirmed via codebase search)
- Tests in `src/lib/suggestions/__tests__/llm-adapter.test.ts` mock the SDK and make zero assertions on the model string — **no test changes required**

### Metis Review
**Identified Gaps** (addressed):
- Model ID ambiguity → Resolved: fetched from official docs, exact string is `claude-haiku-4-5-20251001`; alias `claude-haiku-4-5` is also valid
- SDK version compatibility → Resolved: `@anthropic-ai/sdk ^0.86.1` passes model strings through to the API without client-side validation; no SDK upgrade needed
- Silent failure risk → Addressed in guardrails: wrong model ID is swallowed by `catch {}`, so correctness of the string is critical

---

## Work Objectives

### Core Objective
Update the Claude model string in `anthropic.ts` from the deprecated `claude-3-5-haiku-20241022` to `claude-haiku-4-5-20251001`, eliminating the deprecation warning at runtime.

### Concrete Deliverables
- `src/lib/suggestions/adapters/anthropic.ts` updated with new model ID

### Definition of Done
- [ ] `grep "claude-3-5-haiku-20241022" src/lib/suggestions/adapters/anthropic.ts` → no output
- [ ] `grep -c "claude-haiku-4-5" src/lib/suggestions/adapters/anthropic.ts` → outputs `2`
- [ ] `npm run typecheck` exits 0
- [ ] `npm run test` exits 0

### Must Have
- Both occurrences of the old model string in `anthropic.ts` replaced (JSDoc comment + code literal)
- The new model string must be exactly `claude-haiku-4-5-20251001`

### Must NOT Have (Guardrails)
- MUST NOT modify any test files
- MUST NOT change `package.json` or any SDK version
- MUST NOT refactor `ClaudeLlmAdapter` class structure
- MUST NOT modify temperature-clamping logic or null-return error handling
- MUST NOT touch `src/lib/suggestions/adapters/openai.ts` or any other adapter
- MUST NOT add env var extraction for the model name (not requested)
- MUST NOT expand or rewrite JSDoc beyond updating the model name string

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: Tests-after (run existing tests, no new tests needed for this change)
- **Framework**: vitest
- **Note**: Tests mock the SDK entirely; zero assertions on model string — no new tests required

### QA Policy
One task. Verification via grep + npm commands.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (single task):
└── Task 1: Update model string in anthropic.ts [quick]

Wave FINAL (after Task 1):
├── F1: Plan compliance audit (oracle)
└── F2: Code quality review (unspecified-high)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → F1/F2 → user okay
```

### Dependency Matrix
- **Task 1**: no dependencies — can start immediately
- **F1, F2**: depend on Task 1

### Agent Dispatch Summary
- **Wave 1**: 1 task — T1 → `quick`
- **FINAL**: 2 tasks — F1 → `oracle`, F2 → `unspecified-high`

---

## TODOs

- [x] 1. Update Claude model ID in anthropic.ts (JSDoc comment + code literal)

  **What to do**:
  - Open `src/lib/suggestions/adapters/anthropic.ts`
  - On **line 7** (JSDoc comment): change `claude-3-5-haiku-20241022` → `claude-haiku-4-5-20251001`
  - On **line 23** (model string literal): change `'claude-3-5-haiku-20241022'` → `'claude-haiku-4-5-20251001'`
  - These are the ONLY two changes in the file. Do not touch anything else.

  **Must NOT do**:
  - MUST NOT modify any test files
  - MUST NOT change any other file in the repo
  - MUST NOT refactor, restructure, or improve any logic
  - MUST NOT extract the model ID to a constant or env var
  - MUST NOT update `package.json` or the SDK version

  **Recommended Agent Profile**:
  > Single-file, two-line string change — lightweight agent is ideal.
  - **Category**: `quick`
    - Reason: Trivial two-string change in a single file, no logic involved
  - **Skills**: `[]`
    - No specialized skills required for a string substitution

  **Parallelization**:
  - **Can Run In Parallel**: NO (only task)
  - **Parallel Group**: Wave 1 (sole task)
  - **Blocks**: F1, F2
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References** (existing code to follow):
  - `src/lib/suggestions/adapters/anthropic.ts:1-53` — the complete file; change ONLY lines 7 and 23

  **External References**:
  - Official Anthropic model ID (verified): `claude-haiku-4-5-20251001`
  - Alias also valid: `claude-haiku-4-5`
  - Source: https://docs.anthropic.com/en/docs/about-claude/models/overview

  **WHY Each Reference Matters**:
  - The file is short (53 lines). Read the whole thing to confirm line numbers before editing.
  - The model ID must be exactly `claude-haiku-4-5-20251001` — a wrong string is silently swallowed by the `catch {}` block and would break all LLM features with no visible error.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Old model string is gone
    Tool: Bash
    Preconditions: Task 1 editing complete
    Steps:
      1. Run: grep "claude-3-5-haiku-20241022" src/lib/suggestions/adapters/anthropic.ts
      2. Assert: command produces no output (exit 0 with empty stdout)
    Expected Result: Zero matches — old string fully replaced
    Failure Indicators: Any line printed = old string still present
    Evidence: .sisyphus/evidence/task-1-old-string-gone.txt

  Scenario: New model string appears exactly twice
    Tool: Bash
    Preconditions: Task 1 editing complete
    Steps:
      1. Run: grep -c "claude-haiku-4-5" src/lib/suggestions/adapters/anthropic.ts
      2. Assert: output is exactly "2"
    Expected Result: 2 matches (line 7 JSDoc + line 23 code literal)
    Failure Indicators: Any number other than 2
    Evidence: .sisyphus/evidence/task-1-new-string-count.txt

  Scenario: TypeScript compilation passes
    Tool: Bash
    Preconditions: Task 1 editing complete
    Steps:
      1. Run: npm run typecheck
      2. Assert: exit code 0, no TypeScript errors printed
    Expected Result: Clean typecheck
    Failure Indicators: Any tsc error message
    Evidence: .sisyphus/evidence/task-1-typecheck.txt

  Scenario: Unit tests still pass
    Tool: Bash
    Preconditions: Task 1 editing complete
    Steps:
      1. Run: npm run test
      2. Assert: exit code 0, all test suites pass including ClaudeLlmAdapter suite
    Expected Result: All tests green
    Failure Indicators: Any failing test
    Evidence: .sisyphus/evidence/task-1-tests.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-old-string-gone.txt
  - [ ] task-1-new-string-count.txt
  - [ ] task-1-typecheck.txt
  - [ ] task-1-tests.txt

  **Commit**: YES
  - Message: `fix(llm): upgrade claude model to haiku-4-5-20251001`
  - Files: `src/lib/suggestions/adapters/anthropic.ts`
  - Pre-commit: `npm run typecheck && npm run test`

---

## Final Verification Wave (MANDATORY — after Task 1)

> 2 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. Verify Task 1 deliverable:
  - `grep "claude-3-5-haiku-20241022" src/lib/suggestions/adapters/anthropic.ts` → empty output (MUST HAVE)
  - `grep -c "claude-haiku-4-5" src/lib/suggestions/adapters/anthropic.ts` → 2 (MUST HAVE)
  - No test files modified (MUST NOT HAVE)
  - No `package.json` changes (MUST NOT HAVE)
  - Evidence files exist in `.sisyphus/evidence/`
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck && npm run test`. Confirm only `anthropic.ts` was changed. Verify no linting issues introduced.
  Output: `Typecheck [PASS/FAIL] | Tests [N pass/N fail] | Files changed [N] | VERDICT`

---

## Commit Strategy

- **Task 1**: `fix(llm): upgrade claude model to haiku-4-5-20251001` — `src/lib/suggestions/adapters/anthropic.ts`, pre-commit: `npm run typecheck && npm run test`

---

## Success Criteria

### Verification Commands
```bash
grep "claude-3-5-haiku-20241022" src/lib/suggestions/adapters/anthropic.ts
# Expected: no output

grep -c "claude-haiku-4-5" src/lib/suggestions/adapters/anthropic.ts
# Expected: 2

npm run typecheck
# Expected: exit 0

npm run test
# Expected: exit 0, all passing
```

### Final Checklist
- [ ] Old deprecated model string `claude-3-5-haiku-20241022` absent from codebase
- [ ] New model string `claude-haiku-4-5-20251001` present in JSDoc AND code literal
- [ ] All tests pass
- [ ] TypeScript clean
- [ ] No unintended files modified
