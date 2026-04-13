# Fix ReviewPanel "Reviewed Score" Display After Bulk Rewrite

## TL;DR

> **Quick Summary**: After bulk rewrite, the ReviewPanel's "reviewed score" still shows 100% because `deriveRevisedText` joins sentences with spaces, destroying paragraph formatting. Replace all call sites with `deriveTextWithRewrites` from `bulkRewrite.ts` which preserves original text structure.
> 
> **Deliverables**:
> - Fixed score display: ReviewPanel shows correct post-rewrite score (~28%) after bulk rewrite
> - All three call sites of `deriveRevisedText` updated to use format-preserving derivation
> - Updated unit tests reflecting new behavior
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → F1-F4

---

## Context

### Original Request
User reported: "it says 'score reduced to 28%!' but it shows 100% on reviewed score. update this"

### Interview Summary
**Key Discussions**:
- The TargetScorePanel correctly shows "score reduced to 28%!" using `achievedScore` from the bulk rewrite API response
- The ReviewPanel re-derives text using `deriveRevisedText` which `.join(' ')` flattens all sentences — destroying paragraph breaks (`\n\n`)
- The flattened text sent to `/api/analyze/revised` produces a different Sapling score than the actual rewritten text (which preserved formatting)

**Research Findings**:
- `deriveRevisedText` (revisedAnalysisReducer.ts:312-322): joins with `.join(' ')` — loses formatting
- `deriveTextWithRewrites` (bulkRewrite.ts:39-74): uses indexOf to locate sentences in original text and replace in-place — preserves all whitespace
- Three call sites of `deriveRevisedText`: page.tsx:43 (revert), page.tsx:117 (bulk), ReviewPanel.tsx:139 (single apply)
- `derivedRevisedText` computed property in useRevisedAnalysisState.ts:40-43 also calls `deriveRevisedText` but is NOT consumed by any other component (confirmed via reference search)
- Existing tests in `tests/unit/revisedAnalysisReducer.test.ts` assert space-joined behavior — will need updating

### Metis Review
**Identified Gaps** (addressed):
- All THREE call sites must be fixed, not just the bulk rewrite path — same bug exists in single-apply and revert paths
- `derivedRevisedText` computed property also calls broken function — updated for consistency even though no external consumer sends it to API
- Existing tests assert `.join(' ')` output — tests will be updated to use `deriveTextWithRewrites` behavior
- `deriveRevisedText` function to be deprecated (not deleted) — safer migration path

---

## Work Objectives

### Core Objective
Replace all uses of `deriveRevisedText` (space-joined) with `deriveTextWithRewrites` (format-preserving) so that the revised analysis API receives correctly-formatted text and Sapling returns an accurate score.

### Concrete Deliverables
- Updated `src/app/page.tsx` — both call sites (lines 43, 117) use `deriveTextWithRewrites`
- Updated `src/components/ReviewPanel.tsx` — single-apply call site (line 139) uses `deriveTextWithRewrites`
- Updated `src/app/useRevisedAnalysisState.ts` — `derivedRevisedText` computed property uses `deriveTextWithRewrites`; `deriveRevisedText` re-export removed or deprecated
- Updated `tests/unit/revisedAnalysisReducer.test.ts` — tests for `deriveRevisedText` updated to test the new behavior or marked as testing the deprecated function
- `deriveRevisedText` in `revisedAnalysisReducer.ts` annotated with `@deprecated`

### Definition of Done
- [ ] `npm run typecheck` exits 0
- [ ] `npm run test` exits 0 (all existing + new tests pass)
- [ ] After bulk rewrite, ReviewPanel shows updated score matching TargetScorePanel's achievedScore

### Must Have
- All three call sites of `deriveRevisedText` that feed `triggerRevisedAnalysis` replaced with `deriveTextWithRewrites`
- `derivedRevisedText` computed property in hook updated for consistency
- Paragraph formatting (`\n\n`) preserved in derived text
- Existing tests updated (not deleted) to reflect new behavior
- `@deprecated` JSDoc on `deriveRevisedText`

### Must NOT Have (Guardrails)
- NO changes to `deriveTextWithRewrites` in `bulkRewrite.ts` — it works correctly
- NO changes to `/api/analyze/revised` endpoint — the API is fine
- NO changes to ReviewPanel's score display logic (lines 307-344) — rendering is correct
- NO changes to `BulkRewriteResult` interface shape
- NO changes to detection adapters (`sapling.ts`, `copyleaks.ts`, etc.)
- NO new npm dependencies
- NO changes to `guardrails.ts`
- NO refactoring of the reducer beyond deprecating `deriveRevisedText`
- NO changes to `CONCURRENCY` value

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: YES (Tests-after — update existing tests)
- **Framework**: bun test (via `npm run test`)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Unit tests**: Use Bash (`npm run test`) — run test suite, assert all pass
- **Type checking**: Use Bash (`npm run typecheck`) — verify zero errors
- **Frontend/UI**: Use Playwright — navigate, trigger bulk rewrite, verify score display

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — implementation):
├── Task 1: Replace all deriveRevisedText call sites with deriveTextWithRewrites [quick]
├── Task 2: Update unit tests for new text derivation behavior [quick]

Wave 2 (After Wave 1 — verification):
├── Task 3: Full integration verification (typecheck + tests + Playwright) [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → F1-F4 → user okay
Parallel Speedup: Tasks 1 and 2 run in parallel
Max Concurrent: 2 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1    | —         | 3, F1-F4 |
| 2    | —         | 3, F1-F4 |
| 3    | 1, 2      | F1-F4 |
| F1-F4| 3         | — |

### Agent Dispatch Summary

- **Wave 1**: **2** — T1 → `quick`, T2 → `quick`
- **Wave 2**: **1** — T3 → `unspecified-high`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Replace all `deriveRevisedText` call sites with `deriveTextWithRewrites`

  **What to do**:
  1. In `src/app/page.tsx`:
     - Add import: `import { deriveTextWithRewrites } from '@/lib/bulk-rewrite/bulkRewrite';`
     - Line 43 (revert handler): Replace `deriveRevisedText(result, nextReplacements)` with `deriveTextWithRewrites(result.text, result.sentences, nextReplacements)`
     - Line 117 (bulk rewrite handler): Replace `deriveRevisedText(result, mergedReplacements)` with `deriveTextWithRewrites(result.text, result.sentences, mergedReplacements)`
     - Remove `deriveRevisedText` from the import on line 9 (keep `useRevisedAnalysisState`)
  2. In `src/components/ReviewPanel.tsx`:
     - Add import: `import { deriveTextWithRewrites } from '@/lib/bulk-rewrite/bulkRewrite';`
     - Line 139 (handleApply): Replace `deriveRevisedText(revisedState.state.originalResult, nextReplacements)` with `deriveTextWithRewrites(revisedState.state.originalResult.text, revisedState.state.originalResult.sentences, nextReplacements)`
     - Remove `deriveRevisedText` import from line 4 (keep `UseRevisedAnalysisStateReturn` type import from line 3)
  3. In `src/app/useRevisedAnalysisState.ts`:
     - Add import: `import { deriveTextWithRewrites } from '@/lib/bulk-rewrite/bulkRewrite';`
     - Lines 40-43: Replace `deriveRevisedText(state.originalResult, state.appliedReplacements)` with `deriveTextWithRewrites(state.originalResult.text, state.originalResult.sentences, state.appliedReplacements)`
     - Line 7: Remove `deriveRevisedText` from the import (keep `revisedAnalysisReducer`, `initialRevisedAnalysisState`, `hasAppliedReplacements`)
     - Line 20: Remove the re-export `export { deriveRevisedText, hasAppliedReplacements }` — change to `export { hasAppliedReplacements }`
  4. In `src/lib/review/revisedAnalysisReducer.ts`:
     - Add `@deprecated Use deriveTextWithRewrites from '@/lib/bulk-rewrite/bulkRewrite' instead.` JSDoc to `deriveRevisedText` (line 312). Do NOT delete the function — existing tests still reference it.

  **Must NOT do**:
  - Do NOT modify `deriveTextWithRewrites` in `bulkRewrite.ts`
  - Do NOT modify `/api/analyze/revised` endpoint
  - Do NOT modify ReviewPanel's score display logic (lines 307-344)
  - Do NOT delete `deriveRevisedText` function — only deprecate

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward find-and-replace across 4 files with clear before/after
  - **Skills**: []
    - No special skills needed — standard file editing
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — no browser testing in this task

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `src/lib/bulk-rewrite/bulkRewrite.ts:39-74` — `deriveTextWithRewrites` function signature and behavior. Uses `(originalText, originalSentences, rewrites)`. The executor MUST match this exact signature when replacing call sites.
  - `src/app/page.tsx:34` — `const result = revisedState.originalResult;` — This is where `result` comes from. It has `.text` and `.sentences` properties needed by `deriveTextWithRewrites`.

  **API/Type References** (contracts to implement against):
  - `src/app/api/analyze/route.ts` — `AnalysisSuccessResponse` type — has `text: string` and `sentences: Array<{ sentence: string; score: number }>`. These are the fields passed to `deriveTextWithRewrites`.
  - `src/lib/bulk-rewrite/bulkRewrite.ts:41` — `originalSentences: Array<{ sentence: string; sentenceIndex?: number }>` — The `AnalysisSuccessResponse.sentences` array is compatible (has `sentence` field; `sentenceIndex` is optional and will default to array index).

  **Bug Reference**:
  - `src/lib/review/revisedAnalysisReducer.ts:321` — `.join(' ')` — THIS IS THE BUG. It flattens paragraph breaks into single spaces.

  **Current import patterns** (follow these exactly):
  - `src/app/page.tsx:9` — `import { useRevisedAnalysisState, deriveRevisedText } from '@/app/useRevisedAnalysisState';`
  - `src/components/ReviewPanel.tsx:4` — `import { deriveRevisedText } from '@/app/useRevisedAnalysisState';`
  - `src/app/useRevisedAnalysisState.ts:7` — imports from `'@/lib/review/revisedAnalysisReducer'`

  **Acceptance Criteria**:

  - [ ] `npm run typecheck` exits 0 (no type errors from changed imports/calls)
  - [ ] All 4 files modified as specified
  - [ ] `deriveRevisedText` import removed from `page.tsx` and `ReviewPanel.tsx`
  - [ ] `deriveTextWithRewrites` imported from `'@/lib/bulk-rewrite/bulkRewrite'` in all 3 consumer files
  - [ ] `@deprecated` JSDoc added to `deriveRevisedText` in `revisedAnalysisReducer.ts`

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compilation succeeds after import changes
    Tool: Bash
    Preconditions: All 4 files modified as specified
    Steps:
      1. Run `npm run typecheck`
      2. Assert exit code 0
      3. Grep output for "error" — expect zero matches
    Expected Result: Zero type errors
    Failure Indicators: Any TS error mentioning deriveRevisedText, deriveTextWithRewrites, or import issues
    Evidence: .sisyphus/evidence/task-1-typecheck.txt

  Scenario: No remaining imports of deriveRevisedText in consumer files
    Tool: Bash
    Preconditions: Files modified
    Steps:
      1. Run `Select-String -Path "src/app/page.tsx" -Pattern "deriveRevisedText"` — expect 0 matches
      2. Run `Select-String -Path "src/components/ReviewPanel.tsx" -Pattern "deriveRevisedText"` — expect 0 matches
      3. Run `Select-String -Path "src/app/useRevisedAnalysisState.ts" -Pattern "deriveRevisedText"` — should only appear in a comment or not at all (the re-export is removed)
    Expected Result: deriveRevisedText no longer imported or called in consumer files
    Failure Indicators: Any match of deriveRevisedText in import or function call (not in comment)
    Evidence: .sisyphus/evidence/task-1-no-old-imports.txt

  Scenario: deriveTextWithRewrites is now imported in all 3 consumer files
    Tool: Bash
    Preconditions: Files modified
    Steps:
      1. Run `Select-String -Path "src/app/page.tsx" -Pattern "deriveTextWithRewrites"` — expect match in import
      2. Run `Select-String -Path "src/components/ReviewPanel.tsx" -Pattern "deriveTextWithRewrites"` — expect match in import
      3. Run `Select-String -Path "src/app/useRevisedAnalysisState.ts" -Pattern "deriveTextWithRewrites"` — expect match in import
    Expected Result: All 3 files import deriveTextWithRewrites from '@/lib/bulk-rewrite/bulkRewrite'
    Failure Indicators: Missing import in any file
    Evidence: .sisyphus/evidence/task-1-new-imports.txt
  ```

  **Commit**: YES
  - Message: `fix: use format-preserving deriveTextWithRewrites for revised analysis text derivation`
  - Files: `src/app/page.tsx`, `src/components/ReviewPanel.tsx`, `src/app/useRevisedAnalysisState.ts`, `src/lib/review/revisedAnalysisReducer.ts`
  - Pre-commit: `npm run typecheck`

---

- [x] 2. Update unit tests for text derivation behavior

  **What to do**:
  1. In `tests/unit/revisedAnalysisReducer.test.ts`:
     - The existing `describe('deriveRevisedText', ...)` block (line 363+) tests the DEPRECATED `deriveRevisedText` function. These tests still pass because the function still exists — do NOT change these tests. They validate the deprecated function's behavior.
  2. Add a NEW test block in the same file (after the existing `deriveRevisedText` describe block) that tests `deriveTextWithRewrites` used in the revised analysis context:
     - Import `deriveTextWithRewrites` from `@/lib/bulk-rewrite/bulkRewrite`
     - Test: multi-paragraph text (`"First paragraph.\n\nSecond paragraph."`) with a replacement preserves `\n\n`
     - Test: single-paragraph text with replacement produces same result as before (regression guard)
     - Test: empty replacements map returns original text unchanged
     - Test: multiple replacements across paragraphs preserve all paragraph breaks

  **Must NOT do**:
  - Do NOT delete or modify existing `deriveRevisedText` tests — they still test valid (deprecated) functionality
  - Do NOT modify `deriveTextWithRewrites` in `bulkRewrite.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding a small test block to an existing test file — straightforward
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - None relevant

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References** (existing code to follow):
  - `tests/unit/revisedAnalysisReducer.test.ts:363-420` — Existing `deriveRevisedText` test patterns. Follow same `makeResult()` helper pattern, same assertion style.
  - `tests/unit/revisedAnalysisReducer.test.ts:1-15` — Existing imports. Add `deriveTextWithRewrites` import following the same style.

  **API/Type References**:
  - `src/lib/bulk-rewrite/bulkRewrite.ts:39-43` — `deriveTextWithRewrites(originalText, originalSentences, rewrites)` — exact signature for test calls.
  - `src/app/api/analyze/route.ts` — `AnalysisSuccessResponse` type — the test `makeResult()` helper already creates this shape.

  **Test data for multi-paragraph scenario**:
  - `originalText = "First paragraph sentence one. First paragraph sentence two.\n\nSecond paragraph sentence one."`
  - `sentences = [{ sentence: "First paragraph sentence one.", score: 0.8 }, { sentence: "First paragraph sentence two.", score: 0.3 }, { sentence: "Second paragraph sentence one.", score: 0.9 }]`
  - Rewrite index 0 → `"Rewritten first sentence."`
  - Expected: `"Rewritten first sentence. First paragraph sentence two.\n\nSecond paragraph sentence one."`

  **Acceptance Criteria**:

  - [ ] New test block `describe('deriveTextWithRewrites for revised analysis', ...)` added
  - [ ] At least 4 test cases: multi-paragraph preservation, single-paragraph regression, empty replacements, multiple replacements
  - [ ] `npm run test` exits 0 — all existing AND new tests pass
  - [ ] Existing `deriveRevisedText` tests unchanged

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All tests pass including new deriveTextWithRewrites tests
    Tool: Bash
    Preconditions: New test block added to revisedAnalysisReducer.test.ts
    Steps:
      1. Run `npm run test -- tests/unit/revisedAnalysisReducer.test.ts`
      2. Assert exit code 0
      3. Verify output contains "deriveTextWithRewrites for revised analysis" test block
      4. Verify all existing deriveRevisedText tests still pass
    Expected Result: All tests pass, including both old and new test blocks
    Failure Indicators: Any test failure, missing test block name in output
    Evidence: .sisyphus/evidence/task-2-unit-tests.txt

  Scenario: Multi-paragraph text preserves formatting in new tests
    Tool: Bash
    Preconditions: New test with \n\n in original text
    Steps:
      1. Run `npm run test -- tests/unit/revisedAnalysisReducer.test.ts`
      2. Look for test named something like "preserves paragraph breaks"
      3. Verify it passes
    Expected Result: Test asserts \n\n is preserved after replacement — passes
    Failure Indicators: Test failure on paragraph preservation assertion
    Evidence: .sisyphus/evidence/task-2-paragraph-test.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `test: add deriveTextWithRewrites tests for multi-paragraph text derivation`
  - Files: `tests/unit/revisedAnalysisReducer.test.ts`
  - Pre-commit: `npm run test -- tests/unit/revisedAnalysisReducer.test.ts`

---

- [ ] 3. Full integration verification (typecheck + tests + Playwright E2E)

  **What to do**:
  1. Run `npm run typecheck` — assert zero errors
  2. Run `npm run test` — assert all tests pass (should be 644+ tests)
  3. Run a Playwright test to verify the ACTUAL UI behavior:
     - Upload a document (use `e2e/fixtures/ai-generated-essay.docx` or `Test.docx` if available)
     - Wait for analysis to complete
     - Note the original score displayed in ReviewPanel
     - Set a target score (e.g., 70%) and click bulk rewrite
     - Wait for bulk rewrite to complete
     - Verify: TargetScorePanel shows "score reduced to X%!"
     - Verify: ReviewPanel's score display updates to show the reduced score (NOT the original 100%)
     - The two scores should be approximately equal (both reflecting the actual post-rewrite analysis)
  4. Also verify single-sentence rewrite updates the score:
     - Click a highlighted sentence
     - Apply a suggestion
     - Verify the ReviewPanel score updates (shows original crossed out → new score)

  **Must NOT do**:
  - Do NOT modify any source files — this is verification only
  - Do NOT skip any of the three verification steps

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multi-step verification requiring Playwright browser automation + CLI commands
  - **Skills**: [`playwright`]
    - `playwright`: Needed for browser-based E2E verification of score display
  - **Skills Evaluated but Omitted**:
    - None — playwright is the key skill

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential after Wave 1)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 1, 2

  **References** (CRITICAL):

  **Pattern References**:
  - `e2e/bulk-rewrite-score.spec.ts` — Existing Playwright E2E test pattern for bulk rewrite. Follow same navigation and wait patterns.
  - `e2e/fixtures/ai-generated-essay.docx` — Test fixture file for upload

  **Selector References** (for Playwright assertions):
  - `[data-testid="original-overall-score"]` — Original score display in ReviewPanel (line 325-326 and 338-343)
  - `[data-testid="revised-score-inline"]` — Revised score display after rewrite (line 330-335)
  - `[data-testid="score-loading-spinner"]` — Loading spinner during re-analysis (line 320)
  - `[data-testid="review-panel"]` — ReviewPanel container (line 313)

  **Acceptance Criteria**:

  - [ ] `npm run typecheck` exits 0
  - [ ] `npm run test` exits 0 with 644+ tests passing
  - [ ] Playwright: After bulk rewrite, `[data-testid="revised-score-inline"]` is visible and shows a score < 100%
  - [ ] Playwright: After bulk rewrite, `[data-testid="original-overall-score"]` has `line-through` style (crossed out)
  - [ ] Playwright: The revised score approximately matches the TargetScorePanel's "score reduced to X%!" message

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: TypeScript compilation clean after all changes
    Tool: Bash
    Preconditions: Tasks 1 and 2 complete
    Steps:
      1. Run `npm run typecheck`
      2. Assert exit code 0
    Expected Result: Zero type errors
    Failure Indicators: Any TS error
    Evidence: .sisyphus/evidence/task-3-typecheck.txt

  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: Tasks 1 and 2 complete
    Steps:
      1. Run `npm run test`
      2. Assert exit code 0
      3. Verify 644+ tests pass
    Expected Result: All tests pass, no regressions
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-3-full-tests.txt

  Scenario: Bulk rewrite updates ReviewPanel score (Playwright E2E)
    Tool: Playwright (via playwright skill)
    Preconditions: Dev server running at localhost:3000, valid SAPLING_API_KEY in .env.local
    Steps:
      1. Navigate to http://localhost:3000
      2. Upload `e2e/fixtures/ai-generated-essay.docx` via the file input
      3. Wait for analysis to complete — `[data-testid="review-panel"]` becomes visible
      4. Note the original score in `[data-testid="original-overall-score"]` — expect ~100% AI
      5. Enter "70" in the target score input field
      6. Click the bulk rewrite button
      7. Wait up to 120s for bulk rewrite to complete — loading spinner disappears
      8. Verify `[data-testid="revised-score-inline"]` is visible (score was updated)
      9. Read the text content of `[data-testid="revised-score-inline"]` — should show a score ≤ 70%
      10. Verify `[data-testid="original-overall-score"]` has class `line-through` (original is crossed out)
      11. Take screenshot
    Expected Result: ReviewPanel shows crossed-out original score and a new revised score ≤ 70%
    Failure Indicators: `revised-score-inline` not visible, score still shows 100%, loading spinner stuck
    Evidence: .sisyphus/evidence/task-3-bulk-rewrite-score-update.png

  Scenario: Single sentence rewrite also updates ReviewPanel score
    Tool: Playwright (via playwright skill)
    Preconditions: Analysis already loaded from previous scenario
    Steps:
      1. Click on a highlighted (red/orange) sentence in the ReviewPanel
      2. Wait for suggestion popover to appear
      3. Click "Apply" on the first suggestion
      4. Wait for `[data-testid="score-loading-spinner"]` to appear then disappear (re-analysis)
      5. Verify score display updated (either `revised-score-inline` visible or original score changed)
      6. Take screenshot
    Expected Result: Score updates after single-sentence apply
    Failure Indicators: Score unchanged, spinner stuck, no popover appears
    Evidence: .sisyphus/evidence/task-3-single-rewrite-score-update.png
  ```

  **Commit**: NO (verification only — no file changes)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck` + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Order | Message | Files | Pre-commit |
|-------|---------|-------|------------|
| 1 | `fix: use format-preserving deriveTextWithRewrites for revised analysis text derivation` | `src/app/page.tsx`, `src/components/ReviewPanel.tsx`, `src/app/useRevisedAnalysisState.ts`, `src/lib/review/revisedAnalysisReducer.ts` | `npm run typecheck` |
| 2 | `test: add deriveTextWithRewrites tests for multi-paragraph text derivation` | `tests/unit/revisedAnalysisReducer.test.ts` | `npm run test -- tests/unit/revisedAnalysisReducer.test.ts` |

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck    # Expected: exit 0, zero errors
npm run test         # Expected: exit 0, 644+ tests pass
```

### Final Checklist
- [ ] After bulk rewrite: ReviewPanel shows reduced score (not 100%)
- [ ] After single-sentence rewrite: ReviewPanel shows updated score
- [ ] After revert: ReviewPanel score updates correctly
- [ ] Multi-paragraph text formatting preserved in revised analysis
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
