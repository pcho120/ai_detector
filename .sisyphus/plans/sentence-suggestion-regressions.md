# Sentence Suggestion Regression Fixes

## TL;DR
> **Summary**: Restore working sentence suggestions and eliminate pointer-triggered flicker in the review UI with minimal, regression-focused changes. Keep the existing `/api/suggestions` response contract and reducer model intact.
> **Deliverables**:
> - Reliable re-fetch behavior after `available:false` suggestion results
> - Deterministic suggestion-success rendering for low/high-risk sentence clicks
> - Single anchored original-panel suggestion overlay rendered outside highlight spans
> - Stabilized revised-panel edited-sentence hover affordance with no blink
> - Clearer accessible unavailable-state copy and targeted regression coverage
> **Effort**: Short
> **Parallel**: YES - 2 waves
> **Critical Path**: 1 → 2 → 4 → 6

## Context
### Original Request
- Clicking a sentence opens the suggestion box, but it only shows `No rewrite suggestion available for this sentence` for both low-risk and high-risk sentences.
- Moving the mouse cursor onto the suggestion box causes blinking/flickering when moving the cursor to another sentence.

### Interview Summary
- Scope is limited to these two regressions only.
- Flicker was reported in both panels.
- Test strategy is **tests-after**.
- When suggestions are truly unavailable, improve the user-facing fallback message, but do **not** add retry UI.

### Metis Review (gaps addressed)
- Preserve the existing `POST /api/suggestions` API contract: `200` with `{ available: false, sentenceIndex }` remains unchanged.
- Preserve the existing reducer status model; do **not** refactor `SuggestionFetchStatus` or introduce new action types.
- Treat the original-panel popover flicker and revised-panel flicker as separate fixes.
- Default applied: because `src/components/RevisedReviewPanel.tsx` does not currently render a suggestion popup, treat the reported revised-panel flicker as the edited-sentence hover/revert affordance unless execution uncovers another active overlay path.

## Work Objectives
### Core Objective
Fix the sentence-suggestion regressions so clickable highlighted sentences can reliably show available rewrites again, and pointer movement no longer causes the original-panel overlay or revised-panel edited-sentence affordance to blink.

### Deliverables
- Minimal `ReviewPanel` cache-gating fix that allows re-fetch after cached unavailable results while preserving in-flight and success caching
- Stable original-panel suggestion overlay rendered once per panel, not inline inside each highlighted span
- Improved unavailable-state copy and accessibility semantics in the suggestion UI
- Revised-panel hover affordance stabilized without adding suggestion-generation behavior there
- Updated integration and Playwright regression coverage for both issues

### Definition of Done (verifiable conditions with commands)
- `npm run test -- tests/integration/suggestions-route.test.ts` exits 0
- `npm run test -- tests/unit` exits 0
- `npm run test:e2e -- e2e/home.spec.ts e2e/task4-qa.spec.ts` exits 0
- Clicking a highlighted sentence with a mocked `available:true` response shows `data-testid="suggestion-success"`
- Re-clicking a sentence after a cached unavailable result triggers exactly one new `/api/suggestions` request
- The original-panel suggestion overlay is rendered outside `data-testid="highlight-score"` nodes and remains visible while moving the pointer from the highlighted text into the overlay
- Hovering an edited sentence in the revised panel does not cause its revert affordance to rapidly hide/show
- Truly unavailable suggestions show clearer accessible copy via the existing suggestion-empty path without introducing retry UI

### Must Have
- Keep `/api/suggestions` request and response shapes unchanged
- Keep `SUGGESTION_FETCH_UNAVAILABLE` and the current reducer action set unchanged
- Preserve existing `data-testid` hooks already used by Playwright, including `highlight-score`, `suggestion-popover`, `suggestion-empty`, `suggestion-success`, and `revised-highlight-score`
- Preserve current success-path Apply behavior and revised-analysis trigger behavior
- Fix original-panel flicker structurally by rendering a single selected-sentence overlay outside inline highlight spans
- Fix revised-panel flicker only for the existing edited-sentence hover/revert affordance; do not add new popup behavior there
- Improve unavailable-state copy and add accessible status semantics only; no retry button, no auto-retry loop

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Must NOT change `src/app/api/suggestions/route.ts` to return new fields or non-200 error responses for current unavailable cases
- Must NOT introduce new reducer action types or refactor `SuggestionFetchStatus`
- Must NOT add a new shared popover system or third-party overlay library for this regression fix
- Must NOT modify upload flow, `/api/analyze`, or revised-analysis scoring behavior outside what is required to keep current tests passing
- Must NOT add suggestion generation to `RevisedReviewPanel.tsx`
- Must NOT add retry buttons, background polling, analytics, or broad UX redesign

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: **tests-after**
- Frameworks: **Vitest** for reducer/unit/integration, **Playwright** for UI regression coverage
- QA policy: every task includes executable happy-path and failure/edge-path scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Shared client-state fixes land first; overlay stabilization and revised-panel hover stabilization follow.

Wave 1: cache gating, success-path rendering lock, unavailable-state UX (Tasks 1-3)

Wave 2: original-panel overlay restructure, revised-panel hover stabilization, regression suite completion (Tasks 4-6)

### Dependency Matrix (full, all tasks)
- 1 blocks 2, 3, 4, 6
- 2 supports 6
- 3 supports 6
- 4 blocks 6
- 5 supports 6
- 6 is the final implementation task before final verification wave

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 3 tasks → unspecified-high
- Wave 2 → 3 tasks → visual-engineering, unspecified-high

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Allow re-fetch after cached unavailable suggestions

  **What to do**: In `src/components/ReviewPanel.tsx`, change the `handleSentenceClick` cache short-circuit so a sentence with a cached unavailable result can be fetched again on a later click, while sentences with `loading` or successful rewrite data still do not refetch. Preserve the existing dispatch flow and reducer action types. Add or update unit coverage around this click/cache behavior using the current revised-analysis state model.
  **Must NOT do**: Must NOT remove caching entirely, must NOT refetch while a request is already `loading`, and must NOT change reducer state shapes in `src/lib/review/revisedAnalysisReducer.ts`.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: small but state-sensitive behavioral fix across component and reducer-adjacent tests
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — This is state gating, not visual design work

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [2, 3, 4, 6] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/components/ReviewPanel.tsx:14-50` — current click handler short-circuits on any cached non-error entry
  - Pattern: `src/components/ReviewPanel.tsx:90-129` — current cache-entry rendering paths for loading/error/unavailable/success
  - API/Type: `src/app/useRevisedAnalysisState.ts:27-32,69-71` — sentence selection and suggestion-cache access helpers
  - API/Type: `src/lib/review/revisedAnalysisReducer.ts:21-30,172-213` — current suggestion-cache status model and unavailable storage behavior
  - Test: `tests/integration/suggestions-route.test.ts` — backend contract stays unchanged while client refetch logic is fixed

  **Acceptance Criteria** (agent-executable only):
  - [ ] A cached unavailable entry no longer blocks a later user-initiated fetch for the same sentence
  - [ ] A cached loading entry still prevents duplicate in-flight fetches
  - [ ] A cached successful rewrite entry still reuses cached content without issuing a second fetch
  - [ ] No reducer action names, cache entry fields, or `/api/suggestions` response types are changed

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Unavailable suggestion can be retried on later click
    Tool: Bash
    Steps: run `npm run test -- tests/unit` after adding coverage for repeated sentence clicks with a cached unavailable entry
    Expected: tests assert the second click re-issues exactly one fetch while preserving current loading/success cache rules
    Evidence: .sisyphus/evidence/task-1-unavailable-refetch.txt

  Scenario: In-flight request is still deduped
    Tool: Bash
    Steps: run the same unit suite with a loading-state case
    Expected: tests assert a sentence already marked loading does not trigger a duplicate request
    Evidence: .sisyphus/evidence/task-1-unavailable-refetch-error.txt
  ```

  **Commit**: YES | Message: `fix(review): retry suggestions after unavailable cache` | Files: `src/components/ReviewPanel.tsx`, `tests/unit/**`

- [x] 2. Lock the available-suggestion render path for low and high risk sentences

  **What to do**: Add regression coverage proving that when `/api/suggestions` returns `available:true`, clicking both low-risk and high-risk highlighted sentences renders `data-testid="suggestion-success"` with rewrite text and explanation instead of the unavailable state. If a small client-side normalization fix is needed in `ReviewPanel.tsx`, keep it local to the fetch success path and preserve Apply behavior.
  **Must NOT do**: Must NOT change the server API contract, must NOT special-case only high-risk sentences, and must NOT weaken guardrail filtering.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: regression locks behavior across the client fetch/render path and existing route contract
  - Skills: `[]` — No extra skill required
  - Omitted: `['/playwright']` — The UI change is small; use Playwright only for the exact regression proof

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [6] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/components/ReviewPanel.tsx:39-47,98-129` — current success vs unavailable branch selection
  - Pattern: `src/app/api/suggestions/route.ts:13-25,67-83` — response contract that must drive success rendering unchanged
  - Test: `tests/integration/suggestions-route.test.ts:46-205` — existing available/unavailable contract coverage
  - Test: `e2e/home.spec.ts` — existing Playwright flow for clicking highlights and rendering suggestions
  - Test: `e2e/task4-qa.spec.ts` — existing screenshot/evidence flow for clickable suggestion behavior

  **Acceptance Criteria** (agent-executable only):
  - [ ] Mocked `available:true` responses render `suggestion-success` for both low-risk and high-risk sentence clicks
  - [ ] `suggestion-empty` is absent while a valid rewrite/explanation response is shown
  - [ ] Apply button remains visible and clickable on the success path
  - [ ] Existing unavailable-path route tests continue to pass unchanged

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Low and high risk highlights show returned rewrite content
    Tool: Bash
    Steps: run `npm run test:e2e -- e2e/home.spec.ts e2e/task4-qa.spec.ts` after adding mocks for low/high `available:true` responses
    Expected: Playwright asserts `suggestion-success` is visible with rewrite text and explanation for both label levels
    Evidence: .sisyphus/evidence/task-2-suggestion-success.txt

  Scenario: Unavailable path still stays on empty-state branch
    Tool: Bash
    Steps: run `npm run test -- tests/integration/suggestions-route.test.ts`
    Expected: route tests still confirm `available:false` returns the current contract without breaking client expectations
    Evidence: .sisyphus/evidence/task-2-suggestion-success-error.txt
  ```

  **Commit**: YES | Message: `test(review): lock suggestion success rendering` | Files: `src/components/ReviewPanel.tsx`, `tests/integration/suggestions-route.test.ts`, `e2e/home.spec.ts`, `e2e/task4-qa.spec.ts`

- [x] 3. Improve unavailable-state copy and accessibility without adding retry UI

  **What to do**: In `src/components/ReviewPanel.tsx`, update the `suggestion-empty` branch to use clearer copy that communicates temporary unavailability without implying the sentence can never be rewritten, and add accessible status semantics suitable for passive state changes. Preserve the existing close button and empty-state layout footprint.
  **Must NOT do**: Must NOT add retry buttons, auto-refresh behavior, or extra API calls. Must NOT remove `data-testid="suggestion-empty"`.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: small UX change with accessibility implications and regression-test updates
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — This is constrained copy/a11y work, not a broader redesign

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [6] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/components/ReviewPanel.tsx:94-101` — current empty-state branch and message copy
  - Pattern: `src/components/ReviewPanel.tsx:73-88` — popover shell where accessible status semantics should fit
  - API/Type: `src/lib/review/revisedAnalysisReducer.ts:23-30,194-203` — unavailable is still represented as success + unavailable flag
  - Test: `e2e/task4-qa.spec.ts` — existing regression flow that already covers the empty state

  **Acceptance Criteria** (agent-executable only):
  - [ ] Empty-state copy is clearer than `No rewrite suggestion available for this sentence.` and still fits the current popover layout
  - [ ] The empty state exposes an accessible passive status role/announcement mechanism
  - [ ] No retry button or extra interactive controls are introduced
  - [ ] Existing empty-state selectors remain stable for tests

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Unavailable state shows clearer accessible copy
    Tool: Bash
    Steps: run `npm run test:e2e -- e2e/task4-qa.spec.ts` after updating the empty-state assertion
    Expected: Playwright finds `suggestion-empty` with the new message and no retry button
    Evidence: .sisyphus/evidence/task-3-unavailable-copy.txt

  Scenario: Empty-state selector remains stable
    Tool: Bash
    Steps: run `npm run test -- tests/unit`
    Expected: unit/component tests referencing `suggestion-empty` continue to pass without selector changes
    Evidence: .sisyphus/evidence/task-3-unavailable-copy-error.txt
  ```

  **Commit**: YES | Message: `fix(review): clarify unavailable suggestion state` | Files: `src/components/ReviewPanel.tsx`, `tests/unit/**`, `e2e/task4-qa.spec.ts`

- [x] 4. Render a single anchored suggestion overlay outside original-panel highlight spans

  **What to do**: Restructure `src/components/ReviewPanel.tsx` so the selected sentence popover is rendered once per panel, outside individual `highlight-score` spans, while remaining anchored to the selected highlight’s position. Use the selected sentence index plus highlight element refs or equivalent DOM measurements to position the overlay relative to the review text container. Preserve close behavior, Apply behavior, and current `data-testid="suggestion-popover"`.
  **Must NOT do**: Must NOT leave the popover nested inside each highlighted span, must NOT introduce a third-party overlay library, and must NOT break the current click-to-open selection flow.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: DOM structure and pointer-hit behavior must change without changing product behavior
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — The goal is structural stability, not visual redesign

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [6] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/components/ReviewPanel.tsx:66-131` — current popover renderer nested inline in the highlighted span
  - Pattern: `src/components/ReviewPanel.tsx:178-193` — current inline insertion point that causes pointer instability
  - Pattern: `src/components/ReviewPanel.tsx:221-223` — current text container that should own the single overlay anchor context
  - API/Type: `src/app/useRevisedAnalysisState.ts:27-32,57-58` — selected sentence and drawer-close control
  - Test: `e2e/home.spec.ts` — existing UI flow that must still find `suggestion-popover` after DOM restructuring

  **Acceptance Criteria** (agent-executable only):
  - [ ] `suggestion-popover` is no longer rendered as a descendant of any `highlight-score` span
  - [ ] Moving the pointer from the selected highlight into the overlay does not make the overlay blink or remount
  - [ ] Close and Apply still operate on the selected sentence index
  - [ ] Overlay positioning remains within the review panel viewport for typical desktop-width test runs

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Popover remains stable while moving from highlight into overlay
    Tool: Bash
    Steps: run `npm run test:e2e -- e2e/home.spec.ts` after adding pointer-movement assertions around the selected highlight and `suggestion-popover`
    Expected: Playwright keeps a single visible `suggestion-popover` mounted while moving from the highlight to the overlay
    Evidence: .sisyphus/evidence/task-4-overlay-stability.png

  Scenario: Popover is structurally outside highlight span
    Tool: Bash
    Steps: run the same Playwright spec with a DOM-structure assertion against `highlight-score` and `suggestion-popover`
    Expected: tests confirm the popover is not a descendant of the selected `highlight-score` node
    Evidence: .sisyphus/evidence/task-4-overlay-stability-error.txt
  ```

  **Commit**: YES | Message: `fix(review): stabilize suggestion overlay placement` | Files: `src/components/ReviewPanel.tsx`, `e2e/home.spec.ts`

- [x] 5. Stabilize the revised-panel edited-sentence hover affordance

  **What to do**: In `src/components/RevisedReviewPanel.tsx`, treat the reported revised-panel flicker as instability in the edited-sentence revert affordance and replace the current `hidden group-hover:flex` toggle with a visibility approach that does not cause abrupt show/hide blinking while the pointer moves across an edited sentence. Keep revert-on-click behavior unchanged and keep the affordance visually attached to edited sentences only.
  **Must NOT do**: Must NOT add suggestion fetching, must NOT add new panel-level state, and must NOT make unrevised sentences clickable.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: hover-hit behavior and CSS stability need adjustment in an existing panel
  - Skills: `[]` — No extra skill required
  - Omitted: `['/playwright']` — The logic is local; browser verification comes in the task QA

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [6] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/components/RevisedReviewPanel.tsx:82-103` — current edited-sentence hover/revert affordance using `group-hover`
  - Pattern: `src/components/RevisedReviewPanel.tsx:86-94` — current clickable edited-sentence wrapper and selector hooks
  - Test: `e2e/home.spec.ts` — revised-panel apply/revert flow that should remain intact

  **Acceptance Criteria** (agent-executable only):
  - [ ] Hovering an edited sentence does not cause the revert affordance to rapidly hide/show
  - [ ] Clicking an edited sentence still calls revert through the existing `onRevert` path
  - [ ] Unedited revised-panel sentences remain non-clickable
  - [ ] `data-testid="revised-highlight-score"` remains unchanged

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Edited revised sentence keeps a stable revert affordance
    Tool: Bash
    Steps: run `npm run test:e2e -- e2e/home.spec.ts` after adding a revised-panel hover assertion around an applied sentence
    Expected: Playwright observes the revert affordance remain visible and stable while hovering the edited sentence
    Evidence: .sisyphus/evidence/task-5-revised-hover.png

  Scenario: Revert behavior still works after hover stabilization
    Tool: Bash
    Steps: run the same Playwright spec through apply then revert flow
    Expected: clicking the edited sentence still reverts the replacement and refreshes revised content as before
    Evidence: .sisyphus/evidence/task-5-revised-hover-error.txt
  ```

  **Commit**: YES | Message: `fix(revised-review): stabilize revert hover affordance` | Files: `src/components/RevisedReviewPanel.tsx`, `e2e/home.spec.ts`

- [x] 6. Finish targeted regression coverage and preserve current contracts

  **What to do**: Update the smallest necessary Vitest and Playwright suites so both regressions are permanently covered: unavailable re-fetch, low/high available suggestion success, original-panel overlay stability, revised-panel hover stability, and unchanged `/api/suggestions` unavailable contract. Reuse existing test files instead of creating a new test harness unless a missing unit/component seam makes one unavoidable.
  **Must NOT do**: Must NOT add broad new end-to-end scenarios unrelated to the two regressions, and must NOT relax existing route tests to make the fix easier.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: this task consolidates focused regression proof across current test seams
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — Coverage consolidation, not UI redesign

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [] | Blocked By: [1, 2, 3, 4, 5]

  **References** (executor has NO interview context — be exhaustive):
  - Test: `tests/integration/suggestions-route.test.ts:46-205` — keep current available/unavailable server contract coverage green
  - Test: `tests/unit` — add the smallest necessary client-state coverage for refetch gating and selector stability
  - Test: `e2e/home.spec.ts` — primary review/revised-panel interaction regression suite
  - Test: `e2e/task4-qa.spec.ts` — clickable suggestion and empty-state evidence flow
  - Pattern: `src/components/ReviewPanel.tsx:14-23,66-131,178-193` — exact client seams covered by the regressions
  - Pattern: `src/components/RevisedReviewPanel.tsx:82-103` — revised-panel hover seam covered by the regressions

  **Acceptance Criteria** (agent-executable only):
  - [ ] Regression suites cover both reported issues and the improved unavailable copy
  - [ ] Existing route-contract tests remain green without response-shape changes
  - [ ] No new flaky waits (`waitForTimeout`-only synchronization) are introduced in Playwright
  - [ ] Targeted regression commands pass before the final verification wave starts

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Full targeted regression suite passes
    Tool: Bash
    Steps: run `npm run test -- tests/integration/suggestions-route.test.ts tests/unit` and `npm run test:e2e -- e2e/home.spec.ts e2e/task4-qa.spec.ts`
    Expected: all targeted regression suites pass with no selector or contract regressions
    Evidence: .sisyphus/evidence/task-6-regression-suite.txt

  Scenario: Route contract stays unchanged while UI fixes land
    Tool: Bash
    Steps: run `npm run test -- tests/integration/suggestions-route.test.ts`
    Expected: unavailable responses still return `available:false` with `sentenceIndex` and no new fields required by tests
    Evidence: .sisyphus/evidence/task-6-regression-suite-error.txt
  ```

  **Commit**: YES | Message: `test(review): cover sentence suggestion regressions` | Files: `tests/integration/suggestions-route.test.ts`, `tests/unit/**`, `e2e/home.spec.ts`, `e2e/task4-qa.spec.ts`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- `fix(review): retry suggestions after unavailable cache`
- `test(review): lock suggestion success rendering`
- `fix(review): clarify unavailable suggestion state`
- `fix(review): stabilize suggestion overlay placement`
- `fix(revised-review): stabilize revert hover affordance`
- `test(review): cover sentence suggestion regressions`

## Success Criteria
- Users can click highlighted low/high-risk sentences and reliably see rewrite content whenever the mocked or real backend returns `available:true`
- A prior unavailable result no longer permanently poisons future clicks for that sentence within the same session
- The original-panel overlay is structurally stable and no longer blinks when moving from highlighted text into the overlay
- The revised-panel edited-sentence affordance no longer blinks during hover movement
- Truly unavailable suggestions show clearer accessible copy without new retry UX
- Existing suggestion-route contract and revised-analysis apply/revert behavior remain intact
