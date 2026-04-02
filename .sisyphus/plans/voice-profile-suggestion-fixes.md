# Voice Profile Reveal + Suggestion Availability Fixes

## TL;DR
> **Summary**: Fix two live regressions in the expanded review flow: hide the reusable voice-profile textarea until the user explicitly reveals it, and restore sentence-level suggestion availability without weakening the existing 2–3 alternatives-on-success contract.
> **Deliverables**:
> - Click-to-reveal `Your Voice Profile` textarea behind an `I already have a profile!` button
> - Auto-reveal of the profile textarea after successful profile generation
> - Restored `/api/suggestions` availability path that returns 2–3 safe alternatives when the LLM is reachable and parseable
> - Deterministic unavailable-path diagnostics and clearer regression coverage for the exact empty-state failure mode
> - Updated unit/integration/e2e coverage for reveal flow, unavailable handling, and successful suggestion rendering
> **Effort**: Short
> **Parallel**: YES - 2 waves
> **Critical Path**: 1 → 2 → 4 → 5

## Context
### Original Request
- "'Your Voice Profile'은 'I already have a profile!'버튼을 누르면 프로파일 입력하는 칸 나오게 해줘."
- "아직 sentence suggestion이 하나도 안나와"
- Follow-up symptom confirmation: clicking a highlighted sentence currently reaches the empty/unavailable state rather than showing alternatives.

### Interview Summary
- Scope is limited to these two regressions only.
- Keep the existing expanded workflow intact: voice profile, apply/revert, revised-analysis rescore, and 2–3 alternatives on success.
- Do **not** relax success semantics to a single alternative.
- Keep `/api/suggestions` unavailable responses exactly `{ available:false, sentenceIndex }`.

### Metis Review (gaps addressed)
- Do not change the product contract from “2–3 alternatives on success”; fix availability without silently downgrading success to one alternative.
- Keep reveal-state changes local to `VoiceProfilePanel` so `page.tsx`, `ReviewPanel`, and reducer contracts remain stable.
- Treat the current suggestion failure as a bounded server/remediation problem: request path already exists, so the plan must force exact branch confirmation and then repair the specific unavailable source.
- Preserve existing `data-testid` hooks for the textarea/copy/apply flows; only add a new reveal button testid.

## Work Objectives
### Core Objective
Restore the intended voice-profile reuse UX and make sentence suggestions reliably appear again by fixing the profile-textarea visibility behavior and the server-side suggestion-availability path, while preserving current review/apply/rescore behavior and the strict 2–3 alternatives success contract.

### Deliverables
- `VoiceProfilePanel` reveal-state UX with `I already have a profile!` button
- Auto-reveal behavior after successful `/api/voice-profile/generate`
- Repaired `/api/suggestions` generation path that preserves `available:false` semantics but no longer falls into false unavailable states under valid runtime conditions
- Regression-safe integration + e2e proof for successful alternatives and unavailable fallback
- Updated browser flows for pasted-profile reuse under the hidden-by-default textarea model

### Definition of Done (verifiable conditions with commands)
- `npm run test -- tests/unit/suggestions.test.ts tests/unit/revisedAnalysisReducer.test.ts tests/unit/homepage.test.tsx tests/integration/suggestions-route.test.ts tests/integration/voice-profile-route.test.ts` exits 0
- `npm run test:e2e -- e2e/home.spec.ts e2e/voice-rewrite.spec.ts e2e/task4-qa.spec.ts` exits 0
- `npm run typecheck` exits 0
- `npm run lint` exits 0
- After a successful upload, `voice-profile-textarea` is not visible until the user clicks `I already have a profile!`, unless profile generation has just succeeded
- After a successful voice-profile generation, the textarea becomes visible automatically and contains the generated profile
- Clicking a highlighted sentence with a healthy suggestion backend renders `data-testid="suggestion-success"` with 2 or 3 alternatives
- When suggestions are truly unavailable, `/api/suggestions` still returns exactly `{ available:false, sentenceIndex }` and the UI shows the existing empty-state branch

### Must Have
- Keep `voiceProfile` state owned by `src/app/page.tsx` and passed into `ReviewPanel` unchanged
- Keep `data-testid="voice-profile-textarea"`, `copy-voice-profile-btn`, `suggestion-popover`, `suggestion-empty`, `suggestion-success`, and `apply-suggestion-btn-{index}` intact
- Add exactly one new reveal control for the textarea: `data-testid="reveal-voice-profile-btn"`
- Auto-reveal the textarea after successful profile generation so generated profiles remain immediately editable/copyable
- Preserve the current `/api/suggestions` unavailable contract and current reducer action vocabulary
- Preserve the current 2–3 alternatives-on-success contract from the voice-profile plan
- Confirm and fix the specific unavailable branch in `/api/suggestions` / `llm.ts` rather than masking it with broad UI-only changes

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Must NOT relax success responses to a single alternative
- Must NOT change `/api/suggestions` unavailable responses to include extra fields or non-200 statuses for current unavailable cases
- Must NOT remove or rename existing textarea/copy/apply/selectors already used by tests
- Must NOT add persistence (`localStorage`, `sessionStorage`, server storage) for voice profiles
- Must NOT alter `revisedState.applySentenceReplacement`, revised-analysis route behavior, or highlight-click semantics beyond what is required for these two fixes
- Must NOT add new overlay/state/form libraries

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: **tests-after**
- Frameworks: **Vitest** (unit + integration), **Playwright** (UI flows)
- QA policy: every task includes executable happy-path and failure/edge-path scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Fix the UX reveal behavior and lock down the exact unavailable branch first, then repair the suggestion backend and revalidate browser flows.

Wave 1: reveal-state UX, unavailable-branch proof, route/LLM remediation design lock (Tasks 1-3)

Wave 2: successful suggestion restoration, browser regression updates, final verification prep (Tasks 4-5)

### Dependency Matrix (full, all tasks)
- 1 supports 5
- 2 blocks 3 and 4
- 3 blocks 4
- 4 blocks 5
- 5 is the final implementation task before final verification wave

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 3 tasks → visual-engineering, unspecified-high
- Wave 2 → 2 tasks → unspecified-high, visual-engineering

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Gate the voice-profile textarea behind an explicit reveal action

  **What to do**: In `src/components/VoiceProfilePanel.tsx`, add a local reveal-state boolean that is `false` on first render of the panel. Replace the unconditional result block at `src/components/VoiceProfilePanel.tsx:165-196` with conditional rendering: when hidden, show a new button labeled exactly `I already have a profile!` with `data-testid="reveal-voice-profile-btn"`; when revealed, render the current `Your Voice Profile` label, `voice-profile-textarea`, copy button, and helper text unchanged. Keep `voiceProfile` itself controlled by the existing props. Auto-set reveal state to `true` immediately after `handleGenerate` succeeds at `src/components/VoiceProfilePanel.tsx:75-76` so generated profiles remain visible/editable without an extra click.
  **Must NOT do**: Must NOT move `voiceProfile` state out of `src/app/page.tsx`, must NOT rename `voice-profile-textarea` or `copy-voice-profile-btn`, and must NOT hide the textarea again after it has been revealed in the current session.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: localized interaction/visibility change in a user-facing component
  - Skills: `[]`
  - Omitted: `['writing']` — copy is fixed; this is primarily UI/state behavior

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [] | Blocked By: []

  **References**:
  - Pattern: `src/components/VoiceProfilePanel.tsx:48-82` — current profile-generation success path that must auto-reveal the textarea after `setVoiceProfile(data.profile)`
  - Pattern: `src/components/VoiceProfilePanel.tsx:165-196` — current unconditional textarea/copy block to wrap in reveal logic
  - API/Type: `src/app/page.tsx:15-20,127-147` — existing parent-owned voice-profile state and prop wiring that must stay unchanged
  - Test: `e2e/voice-rewrite.spec.ts:75-115` — generation/edit/copy flow that must still pass after auto-reveal
  - Test: `e2e/voice-rewrite.spec.ts:334-395` — pasted-profile reuse flow that must now click reveal before filling the textarea

  **Acceptance Criteria**:
  - [ ] After upload, `voice-profile-panel` is visible but `voice-profile-textarea` is absent or hidden until `reveal-voice-profile-btn` is clicked
  - [ ] Clicking `reveal-voice-profile-btn` reveals the current textarea and copy controls without changing existing textarea/copy testids
  - [ ] Successful profile generation reveals the textarea automatically and populates it with the returned profile
  - [ ] Existing copy behavior for English/Korean wrapped text remains unchanged once the textarea is visible

  **QA Scenarios**:
  ```
  Scenario: Hidden-by-default textarea reveals on explicit click
    Tool: Playwright
    Steps: run `npm run test:e2e -- e2e/voice-rewrite.spec.ts`; upload mock file; assert `voice-profile-panel` is visible; assert `reveal-voice-profile-btn` is visible; click it; assert `voice-profile-textarea` becomes visible
    Expected: textarea is not initially exposed, then becomes visible after the reveal button click
    Evidence: .sisyphus/evidence/task-1-voice-profile-reveal.png

  Scenario: Generated profile auto-reveals editable textarea
    Tool: Playwright
    Steps: run the same spec with mocked `/api/voice-profile/generate`; select a preset; click `generate-voice-profile-btn`
    Expected: `voice-profile-textarea` becomes visible automatically and contains the generated profile value
    Evidence: .sisyphus/evidence/task-1-voice-profile-reveal-generate.png
  ```

  **Commit**: YES | Message: `fix(voice-profile): gate profile textarea behind reveal` | Files: `src/components/VoiceProfilePanel.tsx`, `e2e/voice-rewrite.spec.ts`

- [x] 2. Prove which unavailable branch is causing live suggestion failures

  **What to do**: Add targeted regression coverage that distinguishes all current `available:false` causes in the existing server path: missing `COACHING_LLM_API_KEY`, multi-call parse failure, guardrail-filtered alternatives, and `<2` safe alternatives after filtering. Keep the route contract untouched. Extend `tests/integration/suggestions-route.test.ts` and `tests/unit/suggestions.test.ts` so each branch is explicit and so the implementation task can verify the exact failing cause against the current runtime symptom.
  **Must NOT do**: Must NOT change route responses yet, must NOT add a fallback that changes behavior in this task, and must NOT leave `available:false` as a monolithic untested outcome.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: this is server-contract and failure-branch isolation work
  - Skills: `[]`
  - Omitted: `['visual-engineering']`

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [3, 4] | Blocked By: []

  **References**:
  - Pattern: `src/app/api/suggestions/route.ts:71-89` — current sanitization, key lookup, generation call, and unavailable response path
  - Pattern: `src/lib/suggestions/llm.ts:264-287` — current multi-alternative generation path that returns `null` on no key, parse failure, or `<2` safe alternatives
  - Pattern: `src/lib/suggestions/guardrails.ts` — guardrail filter that can reduce alternatives below the required minimum
  - Test: `tests/integration/suggestions-route.test.ts` — existing route contract suite to extend per unavailable branch
  - Test: `tests/unit/suggestions.test.ts` — current LLM parsing/guardrail tests to extend with explicit branch coverage

  **Acceptance Criteria**:
  - [ ] Tests explicitly identify each current route path that produces `{ available:false, sentenceIndex }`
  - [ ] There is a separate assertion for the `<2` safe alternatives path, not just a generic unavailable assertion
  - [ ] There is a separate assertion for missing API key behavior
  - [ ] No request/response contract changes are introduced in this diagnostic task

  **QA Scenarios**:
  ```
  Scenario: Integration suite distinguishes all unavailable causes
    Tool: Bash
    Steps: run `npm run test -- tests/integration/suggestions-route.test.ts tests/unit/suggestions.test.ts`
    Expected: tests prove missing key, parse failure, guardrail filtering, and <2-safe-alternatives each independently resolve to the unchanged unavailable contract
    Evidence: .sisyphus/evidence/task-2-suggestion-unavailable-branches.txt

  Scenario: Existing unavailable contract remains exact
    Tool: Bash
    Steps: run the same suites and inspect assertions for unavailable responses
    Expected: all unavailable cases still assert exactly `{ available:false, sentenceIndex }` with no extra fields
    Evidence: .sisyphus/evidence/task-2-suggestion-unavailable-branches-error.txt
  ```

  **Commit**: YES | Message: `test(suggestions): lock unavailable branches` | Files: `tests/integration/suggestions-route.test.ts`, `tests/unit/suggestions.test.ts`

- [x] 3. Restore healthy multi-alternative generation without changing success semantics

  **What to do**: Repair the current `/api/suggestions` server path so valid runtime requests no longer fall into false unavailable states. Keep success defined as 2 or 3 safe alternatives. Implementation must stay inside `src/app/api/suggestions/route.ts` and `src/lib/suggestions/llm.ts`. Required approach: preserve `generateAlternativeSuggestions()` as the canonical success path, but make the route resilient to multi-call formatting failures by adding a deterministic recovery branch that still returns **2 or 3** alternatives when the upstream LLM output is salvageable under current rules. Do **not** downgrade success to one alternative. If the exact failing branch identified in Task 2 is the `<2` safe alternatives path, the fix must improve prompt/parse robustness or controlled route-side recovery to reach 2+ safe outputs, not relax the minimum. If the failing branch is missing key/runtime env, the fix is deployment/runtime configuration plus a regression assertion in route tests, not contract change.
  **Must NOT do**: Must NOT change success to allow a single alternative, must NOT add fields to unavailable responses, and must NOT bypass guardrails.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: route contract, LLM parsing, and runtime availability behavior must remain exact
  - Skills: `[]`
  - Omitted: `['visual-engineering']`

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [4] | Blocked By: [2]

  **References**:
  - Pattern: `src/app/api/suggestions/route.ts:76-98` — current generation call and response formatting
  - Pattern: `src/lib/suggestions/llm.ts:84-120` — multi-payload parsing and current single-object fallback wrapping
  - Pattern: `src/lib/suggestions/llm.ts:166-209` — current multi-call request shape and parse return path
  - Pattern: `src/lib/suggestions/llm.ts:264-287` — current 2–3 alternatives success enforcement
  - Test: `tests/integration/suggestions-route.test.ts` — route-level contract tests that must stay green
  - Test: `tests/unit/suggestions.test.ts` — parsing and guardrail behavior that must prove the repaired path

  **Acceptance Criteria**:
  - [ ] A valid healthy suggestion request returns `available:true` with 2 or 3 alternatives and top-level `rewrite`/`explanation` aliases unchanged
  - [ ] The exact live-failure branch identified in Task 2 is repaired without changing the unavailable response shape
  - [ ] Guardrail-filtered or genuinely unrecoverable cases still return `{ available:false, sentenceIndex }`
  - [ ] Missing runtime key behavior is either fixed by configuration verification or remains explicitly tested as unavailable, but is no longer mistaken for a healthy runtime success path

  **QA Scenarios**:
  ```
  Scenario: Healthy route request returns 2-3 alternatives again
    Tool: Bash
    Steps: run `npm run test -- tests/integration/suggestions-route.test.ts tests/unit/suggestions.test.ts`
    Expected: success-path assertions prove `available:true`, `alternatives.length` is 2 or 3, and top-level aliases mirror `alternatives[0]`
    Evidence: .sisyphus/evidence/task-3-suggestion-availability.txt

  Scenario: True unrecoverable generation still returns strict unavailable contract
    Tool: Bash
    Steps: run the same suites with mocked parse-failure / all-filtered outputs
    Expected: unrecoverable cases still return exactly `{ available:false, sentenceIndex }`
    Evidence: .sisyphus/evidence/task-3-suggestion-availability-error.txt
  ```

  **Commit**: YES | Message: `fix(suggestions): restore alternative availability` | Files: `src/app/api/suggestions/route.ts`, `src/lib/suggestions/llm.ts`, `tests/integration/suggestions-route.test.ts`, `tests/unit/suggestions.test.ts`

- [x] 4. Lock the review-panel success rendering path against false empty states

  **What to do**: In `src/components/ReviewPanel.tsx`, keep the current fetch and reducer model, but harden the client success/unavailable handling against the repaired route path. Preserve the current click handler, `suggestion-popover`, and apply flow. If needed, add an immediate popover-position fallback from the clicked element so the loading/success state can render even before the query-selector positioning effect at `src/components/ReviewPanel.tsx:26-53` resolves. Keep `shouldSkipSuggestionFetch()` semantics unchanged. Update browser coverage so low-risk and high-risk clicks with mocked `available:true` responses always render `suggestion-success` and never the empty state.
  **Must NOT do**: Must NOT refactor reducer action names, must NOT add new server fields, and must NOT change apply/revert/revised-analysis behavior.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: user-visible success rendering and popover robustness in the review panel
  - Skills: `[]`
  - Omitted: `['writing']`

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [5] | Blocked By: [3]

  **References**:
  - Pattern: `src/components/ReviewPanel.tsx:55-110` — click handler and current fetch/dispatch path
  - Pattern: `src/components/ReviewPanel.tsx:125-205` — popover render branches for loading/error/unavailable/success
  - Pattern: `src/components/ReviewPanel.tsx:26-53` — current query-selector-based popover positioning effect
  - API/Type: `src/lib/review/revisedAnalysisReducer.ts:183-223` — current suggestion cache shape and success/unavailable storage
  - Test: `e2e/home.spec.ts` — existing clickable highlight flow
  - Test: `e2e/task4-qa.spec.ts` — existing suggestion success/empty-state regression suite

  **Acceptance Criteria**:
  - [ ] Mocked `available:true` responses for highlighted sentences render `suggestion-success` with visible alternatives and apply buttons
  - [ ] `suggestion-empty` is absent while valid alternatives are present
  - [ ] `shouldSkipSuggestionFetch()` and current retry-after-unavailable semantics stay unchanged
  - [ ] The popover can render reliably for the selected sentence without depending on a fragile DOM timing race

  **QA Scenarios**:
  ```
  Scenario: Successful highlight click shows alternatives instead of empty state
    Tool: Playwright
    Steps: run `npm run test:e2e -- e2e/home.spec.ts e2e/task4-qa.spec.ts`; mock `available:true` responses for clicked highlights; click low/high-risk labels
    Expected: `suggestion-popover` and `suggestion-success` are visible, `suggestion-empty` is absent, and apply buttons are clickable
    Evidence: .sisyphus/evidence/task-4-review-panel-success.png

  Scenario: Unavailable retry semantics remain intact
    Tool: Playwright
    Steps: run the same suites with one unavailable response followed by a successful retry on the next click
    Expected: the second click re-fetches once and then shows `suggestion-success`
    Evidence: .sisyphus/evidence/task-4-review-panel-success-retry.png
  ```

  **Commit**: YES | Message: `fix(review): restore suggestion success rendering` | Files: `src/components/ReviewPanel.tsx`, `e2e/home.spec.ts`, `e2e/task4-qa.spec.ts`

- [x] 5. Update voice-profile and end-to-end regression coverage for the new reveal model and repaired suggestions

  **What to do**: Update `e2e/voice-rewrite.spec.ts`, `tests/unit/homepage.test.tsx`, and any affected browser assertions so they match the hidden-by-default textarea model and the restored suggestion-success path. All tests that need direct textarea input before generation must click `reveal-voice-profile-btn` first; tests that generate a profile should continue to assert the textarea is visible automatically after success. Preserve coverage for copied-profile reuse, no-profile fallback, 2–3 alternatives rendering, and applying index 1.
  **Must NOT do**: Must NOT remove existing coverage for copied-profile reuse, no-profile fallback, or indexed apply; must NOT change the meaning of those scenarios.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: cross-cutting regression updates across UI and browser tests
  - Skills: `[]`
  - Omitted: `['writing']`

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [] | Blocked By: [1, 4]

  **References**:
  - Test: `e2e/voice-rewrite.spec.ts:35-115` — panel visibility, generation, edit, and copy flow to update for reveal behavior
  - Test: `e2e/voice-rewrite.spec.ts:117-226` — profile-aware suggestion request and 3-alternative rendering
  - Test: `e2e/voice-rewrite.spec.ts:334-395` — pasted-profile reuse flow that must now reveal the textarea explicitly in session B
  - Pattern: `src/components/VoiceProfilePanel.tsx:165-196` — DOM block whose reveal timing changes
  - Pattern: `src/components/ReviewPanel.tsx:167-201` — alternative rendering/apply buttons that must stay stable
  - Test: `tests/unit/homepage.test.tsx` — component-level page expectations to update for the reveal button and panel flow

  **Acceptance Criteria**:
  - [ ] Browser tests explicitly cover the new `reveal-voice-profile-btn` path before pasted-profile manual entry
  - [ ] Generated-profile tests still assert automatic textarea visibility after successful generation
  - [ ] Successful suggestion e2e coverage proves 2–3 alternatives render with or without `voiceProfile`
  - [ ] Indexed apply, copied-profile reuse, and no-profile fallback scenarios remain covered and green

  **QA Scenarios**:
  ```
  Scenario: Voice-profile reveal and reuse flows pass end-to-end
    Tool: Playwright
    Steps: run `npm run test:e2e -- e2e/voice-rewrite.spec.ts`; cover manual reveal, generation auto-reveal, copy, fresh-session paste, and suggestion request submission
    Expected: all reveal/reuse flows pass with stable selectors and correct request payloads
    Evidence: .sisyphus/evidence/task-5-voice-rewrite-regression.png

  Scenario: Core review flow still renders alternatives without a profile
    Tool: Playwright
    Steps: run `npm run test:e2e -- e2e/home.spec.ts e2e/voice-rewrite.spec.ts`
    Expected: no-profile fallback still shows 2–3 alternatives and existing apply/revised-analysis behavior stays intact
    Evidence: .sisyphus/evidence/task-5-voice-rewrite-regression-fallback.png
  ```

  **Commit**: YES | Message: `test(e2e): cover voice profile reveal regressions` | Files: `e2e/voice-rewrite.spec.ts`, `tests/unit/homepage.test.tsx`, `e2e/home.spec.ts`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Keep commits task-scoped and ordered exactly as listed above.
- Do not bundle reveal-state UX changes with route/LLM remediation in the same commit.
- Final verification runs after all five tasks are complete and before any completion claim.

## Success Criteria
- The profile textarea is hidden until explicitly revealed or automatically shown after generation.
- Highlight clicks produce visible alternatives again under valid runtime conditions.
- The app preserves 2–3 alternatives-on-success and exact unavailable semantics.
- Existing apply/revert/revised-analysis behavior remains unchanged.
- All targeted unit/integration/e2e suites pass and final-wave reviewers approve.
