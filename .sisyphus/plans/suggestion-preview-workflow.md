# Suggestion Click-to-Apply Revised Preview Workflow

## TL;DR
> **Summary**: Extend the current post-analysis review flow so every existing risk-labeled sentence can be clicked to reveal a full rewritten-sentence suggestion and explanation, then apply or undo that rewrite into a right-side revised preview that is automatically re-analyzed after every change.
> **Deliverables**:
> - Clickable original risk labels with sentence-linked on-demand suggestion popover/panel
> - Full rewritten sentence suggestions generated on click for all highlighted spans (high/medium/low)
> - Right-side revised preview panel with real rescored labels and overall score after each apply/undo
> - Deterministic apply/undo state model with automated integration and E2E coverage
> **Effort**: Medium
> **Parallel**: YES - 3 waves
> **Critical Path**: 1 → 2 → 3 → 5 → 6 → 7

## Context
### Original Request
- Keep file upload and first analysis behavior as-is.
- Make every risk-labeled sentence clickable, including low-risk ones.
- When a user clicks a risk-labeled sentence, show the sentence suggestion.
- Suggestion must include a full rewritten sentence and short explanation.
- User can press Apply to update a right-side revised version.
- Revised version must show its own overall score and risk labels.
- Clicking an updated sentence in the revised version reverts it.

### Interview Summary
- Detection/upload baseline is already working and should remain unchanged for the initial submission flow.
- Suggestion access is attached to clicked risk labels only; low-risk labels are not always-expanded.
- The original analysis panel remains on the left; the updated version appears on the right only after user interaction.
- Suggestions must be direct, usable full rewritten sentences rather than coaching-only hints.
- Apply and Undo each trigger real automatic re-analysis so the right-side score and labels are always based on actual updated text.

### Metis Review (gaps addressed)
- Added a mandatory structural link from highlight spans back to analyzed sentence indices so clicked labels can deterministically open the correct suggestion.
- Explicitly separated the new revised-preview UI from the existing ReviewPanel to avoid overloading the current presentation-only component.
- Constrained scope to clickable highlighted sentences only; no recursive suggestion workflow inside the revised panel.
- Guarded against offset drift by requiring the revised text to be derived from immutable original analysis data plus applied edit records, then re-analyzed after every state change.

## Work Objectives
### Core Objective
Add a post-analysis editing workflow that lets users click any existing risk-labeled sentence, inspect a full rewritten alternative, apply that rewrite into a right-side revised preview, and immediately see the revised text’s real rescored AI-like risk output.

### Deliverables
- Extended analysis response types linking each highlight span to its source sentence index
- On-demand full-sentence rewrite suggestion API/service covering every rendered highlight span
- Left-panel interaction UX for clicked risk labels, suggestion details, and Apply action
- Right-panel revised preview component showing rescored overall score, rescored labeled spans, and per-sentence undo behavior
- Automated test coverage for type changes, apply/undo state transitions, server rescoring, and dual-pane interaction flow

### Definition of Done (verifiable conditions with commands)
- `npm run lint` exits 0
- `npm run typecheck` exits 0
- `npm run test` exits 0
- `npm run test:e2e` exits 0
- `npm run build` exits 0
- Clicking any rendered original-panel highlight label opens a sentence-linked suggestion UI with rewritten sentence and explanation
- Clicking Apply creates or updates a right-side revised panel populated with the rewritten sentence in the correct location
- After each Apply and Undo, the revised panel displays a fresh overall score and fresh per-span labels from a real re-analysis request
- Clicking an applied sentence in the revised panel restores the original sentence and refreshes the revised score/labels again
- Original upload form behavior and original left-panel rendering remain unchanged before any post-analysis interaction

### Must Have
- Keep the existing upload form, submit action, and initial `/api/analyze` file-upload contract unchanged
- Suggestions available for every rendered highlight span (`low`, `medium`, `high`)
- Suggestion content includes a full rewritten sentence plus short explanation
- Original-panel suggestion UI opens only after the user clicks a risk-labeled span
- Rewrite suggestions are generated server-side through a dedicated JSON endpoint and cached client-side for the current session after first fetch
- Revised panel appears only after the first Apply action
- Apply/Undo each trigger a real rescoring flow; no local estimate-only scores
- Original analysis panel remains visible and unchanged while revised panel updates independently
- Revised panel supports sentence-level revert by clicking an applied sentence
- Existing guardrails against evasion-oriented language remain enforced for generated rewrites
- `COACHING_LLM_API_KEY` is treated as a required server-only secret for full-sentence rewrite generation

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Must NOT change the upload form structure, validation UX, or initial submission behavior in `src/app/page.tsx`
- Must NOT add recursive suggestion generation inside the revised panel
- Must NOT fabricate local rescored labels from stale sentence data
- Must NOT rely on fuzzy client-side rematching from clicked span text back to suggestions when a stable sentence index can be returned by the server
- Must NOT persist revised text, user selections, or history outside the current client session
- Must NOT introduce auth, storage, analytics, collaboration, or document export features
- Must NOT emit rewrite text that contains evasion phrases currently blocked by `src/lib/suggestions/guardrails.ts`
- Must NOT precompute full rewritten suggestions for every labeled sentence during initial file upload; suggestion generation is on-demand after label click

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: **tests-after** with targeted red/green coverage added at each implementation seam
- Frameworks: **Vitest** for unit/component/integration, **Playwright** for browser E2E, existing route-import integration style for API tests
- QA policy: every task includes executable happy-path and failure-path scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. Shared foundations are extracted into Wave 1.

Wave 1: response-shape foundations, on-demand suggestion API, reducer/state design (Tasks 1-3)

Wave 2: original-panel clickable interaction and revised-panel rendering/rescoring flow (Tasks 4-6)

Wave 3: undo behavior, regression-proofing, docs/test completion (Tasks 7-8)

### Dependency Matrix (full, all tasks)
- 1 blocks 2, 4, 5, 6, 7
- 2 blocks 4, 5, 6, 7
- 3 blocks 4, 5, 6, 7
- 4 blocks 5 and supports 8
- 5 blocks 6 and 7
- 6 blocks 7 and 8
- 7 blocks 8
- 8 is the last implementation task before final verification wave

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 3 tasks → unspecified-high
- Wave 2 → 3 tasks → visual-engineering, unspecified-high
- Wave 3 → 2 tasks → unspecified-high, writing

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Extend highlight and analysis response types with stable sentence linkage

  **What to do**: Update `src/lib/highlights/spans.ts` so `HighlightSpan` includes `sentenceIndex`, and change `buildHighlightSpans(text, sentences)` to preserve the originating analyzed-sentence index while maintaining the existing offset/label behavior. Update `src/app/api/analyze/route.ts` response typing so `AnalysisSuccessResponse.highlights` includes this field. Update all unit/integration/E2E mocks that currently build `highlights` arrays without `sentenceIndex`. Preserve existing `start`, `end`, `score`, and `label` semantics exactly.
  **Must NOT do**: Must NOT remove or rename existing highlight fields, must NOT infer linkage client-side with fuzzy text matching, and must NOT break existing `data-testid="highlight-score"` selectors.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: shared type changes affect route, tests, and UI contract
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — This is contract plumbing, not visual work

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [2, 4, 5, 6, 7] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/lib/highlights/spans.ts:6-11,77-107` — current `HighlightSpan` shape and span builder that must gain `sentenceIndex`
  - Pattern: `src/app/api/analyze/route.ts:25-31,131-145` — success response type and route serialization
  - Test: `tests/unit/highlights.test.ts:38-225` — current offset/label invariants that must remain true after adding `sentenceIndex`
  - Test: `tests/integration/analyze-route.test.ts:164-179` — integration assertions over highlight array shape
  - Test: `e2e/home.spec.ts:22-24` — current mocked highlight payloads that must be updated to the new response contract

  **Acceptance Criteria** (agent-executable only):
  - [ ] `buildHighlightSpans()` returns `sentenceIndex` on every returned span
  - [ ] `sentenceIndex` matches the originating sentence’s position in the analyzed sentence array, including duplicates
  - [ ] Existing start/end/score/label behavior remains unchanged in unit tests
  - [ ] `/api/analyze` success responses and E2E fixtures compile with the new `highlights` shape

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Highlight spans keep stable sentence linkage
    Tool: Bash
    Steps: run `npm run test -- tests/unit/highlights.test.ts tests/integration/analyze-route.test.ts`
    Expected: tests pass and assertions confirm each returned span includes a numeric `sentenceIndex`
    Evidence: .sisyphus/evidence/task-1-highlight-linkage.txt

  Scenario: Duplicate sentence text still maps to different sentence indices
    Tool: Bash
    Steps: run the duplicate-sentence highlight tests and inspect assertions for distinct indices/order
    Expected: repeated sentence text yields separate spans with distinct `sentenceIndex` values matching original sentence ordering
    Evidence: .sisyphus/evidence/task-1-highlight-linkage-error.txt
  ```

  **Commit**: YES | Message: `feat(highlights): add stable sentence linkage to spans` | Files: `src/lib/highlights/spans.ts`, `src/app/api/analyze/route.ts`, `tests/unit/highlights.test.ts`, `tests/integration/analyze-route.test.ts`, `e2e/home.spec.ts`

- [x] 2. Add on-demand full rewrite suggestion API for clicked labeled spans

  **What to do**: Keep the initial `/api/analyze` upload flow focused on file analysis, but add a dedicated `POST /api/suggestions` JSON endpoint that accepts the analyzed document text plus the clicked sentence’s `sentenceIndex`, sentence text, and score, then returns one full rewritten sentence plus short explanation for that exact sentence. Implement a new server-side LLM-backed suggestion service using `COACHING_LLM_API_KEY` for rewrite generation, while preserving `applyGuardrails` before the response is returned. If a sentence cannot be safely rewritten, return a deterministic empty-state payload for that clicked sentence instead of generating a partial hint. Keep the existing `SuggestionService` contract as the seam, but update it so rewrites are full replacement sentences rather than coaching-only hints.
  **Must NOT do**: Must NOT keep the current “rewriteHint only” semantics, must NOT expose detector-evasion phrasing, must NOT require precomputing suggestions for all sentences during initial upload, and must NOT generate suggestions for non-highlighted text fragments outside the analyzer sentence list.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: this changes core server behavior and suggestion semantics
  - Skills: `[]` — No extra skill required
  - Omitted: `['/playwright']` — Behavior should be established first with unit and integration tests

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [4, 5, 6, 7] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/app/api/analyze/route.ts:131-145` — current route should stay focused on analysis response while suggestion generation moves to a dedicated endpoint
  - Pattern: `src/lib/suggestions/types.ts:8-48` — suggestion payload and service contract
  - Pattern: `src/lib/suggestions/rule-based.ts:10-97` — current hint-based implementation that must return full rewritten sentence text instead
  - Pattern: `src/lib/suggestions/guardrails.ts` — safety filter that must remain in the output path
  - Pattern: `.env.example:1-5` — reserved `COACHING_LLM_API_KEY` placeholder for server-only rewrite generation
  - Pattern: `.sisyphus/notepads/ai-detect-essay-app/decisions.md:75-85` — current note that rule-based suggestions replaced LLM; this task intentionally supersedes that choice for the new workflow
  - Test: `tests/unit/suggestions.test.ts:15-159` — current expectations proving rewrite is a short hint; these must be updated to the new full-sentence rewrite behavior
  - Test: `tests/integration/analyze-route.test.ts:116-234` — current route-level suggestion coverage that will be narrowed back to analysis shape while new suggestion-endpoint integration tests are added

  **Acceptance Criteria** (agent-executable only):
  - [ ] `POST /api/suggestions` returns a full rewritten sentence plus explanation for a clicked highlighted sentence regardless of low/medium/high label
  - [ ] Returned `rewrite` strings are complete replacement sentences, not coaching-only hints
  - [ ] Suggestion responses remain linked to `sentenceIndex` and survive guardrail filtering
  - [ ] Missing or invalid `COACHING_LLM_API_KEY` produces a structured suggestion-unavailable response without breaking the original analysis flow

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Suggestion endpoint returns full-sentence rewrite for clicked label
    Tool: Bash
    Steps: run `npm run test -- tests/unit/suggestions.test.ts tests/integration/analyze-route.test.ts` after adding suggestion-endpoint integration coverage
    Expected: tests assert the suggestion endpoint returns a full sentence replacement linked to the requested `sentenceIndex`
    Evidence: .sisyphus/evidence/task-2-suggestion-rewrites.txt

  Scenario: Unsafe or unavailable rewrites degrade safely
    Tool: Bash
    Steps: run guardrail-focused suggestion tests and integration tests covering missing `COACHING_LLM_API_KEY` or banned-phrase outputs
    Expected: unsafe rewrites are removed or replaced with a structured no-suggestion response and no evasion language reaches the client
    Evidence: .sisyphus/evidence/task-2-suggestion-rewrites-error.txt
  ```

  **Commit**: YES | Message: `feat(suggestions): add on-demand rewrite endpoint` | Files: `src/app/api/suggestions/route.ts`, `src/lib/suggestions/**`, `.env.example`, `tests/unit/suggestions.test.ts`, `tests/integration/**`

- [x] 3. Introduce reducer-based revised-analysis state and text-derivation logic

  **What to do**: Replace the simple post-result `useState` workflow in `src/app/page.tsx` with a dedicated local reducer or co-located hook named `useRevisedAnalysisState` that tracks: original analysis result, currently selected sentence index, per-sentence suggestion fetch status/cache, suggestion drawer state, applied sentence replacements keyed by sentence index, revised analysis response, revised loading/error state, and deterministic text derivation from original text + applied replacements. Keep upload submission behavior and existing error handling intact. The reducer/hook must derive revised text from immutable original data plus applied edits rather than mutating the original analysis result.
  **Must NOT do**: Must NOT introduce a global store, must NOT mutate `result.text` in place, and must NOT intermingle upload submission state with revised-analysis transition logic in an ad hoc way.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: interaction state and rescoring orchestration must remain predictable
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — State model must be correct before UI polish

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 5, 6, 7] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/app/page.tsx:7-57` — current simple upload/result state that must stay behaviorally unchanged for initial submission
  - Pattern: `src/components/ReviewPanel.tsx:8-108` — current presentation-only panel that will consume new interaction handlers/state
  - Pattern: `src/app/api/analyze/route.ts:139-145` — authoritative response shape used for both original and revised analyses
  - Test: `tests/unit/homepage.test.tsx:5-13` — initial upload shell rendering that must continue to pass unchanged
  - Test: `e2e/home.spec.ts:3-59` — baseline upload flow that must remain green

  **Acceptance Criteria** (agent-executable only):
  - [ ] Initial upload flow still works with the same UI shell and error handling
  - [ ] State model can track selected sentence, on-demand suggestion fetch/cache state, applied rewrites, revised loading/error state, and revised result independently of original result
  - [ ] Derived revised text is reproducible from original result plus applied replacements and supports removing a replacement by sentence index
  - [ ] Unit tests cover apply/undo state transitions without requiring browser interaction

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Reducer applies and removes sentence replacements deterministically
    Tool: Bash
    Steps: run reducer/hook unit tests covering select sentence, apply rewrite, remove rewrite, and derive revised text
    Expected: resulting derived text changes only at the targeted sentence index and returns to original on undo
    Evidence: .sisyphus/evidence/task-3-editor-state.txt

  Scenario: Upload shell remains unchanged after reducer introduction
    Tool: Bash
    Steps: run `npm run test -- tests/unit/homepage.test.tsx` and baseline Playwright home-shell scenario
    Expected: upload heading, file input, and submit button still render and baseline upload submission flow still works
    Evidence: .sisyphus/evidence/task-3-editor-state-error.txt
  ```

  **Commit**: YES | Message: `feat(review): add reducer for revised analysis state` | Files: `src/app/page.tsx`, `src/components/**`, `tests/unit/**`, `e2e/home.spec.ts`

- [x] 4. Make original-panel risk labels clickable and reveal sentence suggestion actions

  **What to do**: Refactor `src/components/ReviewPanel.tsx` so each rendered highlight span remains visually the same but becomes an interactive trigger keyed by `sentenceIndex`. Clicking a highlighted sentence/label must call the new suggestion-fetch flow if the sentence has not been loaded yet, then open an inline suggestion detail area anchored to that selected sentence, showing loading, empty, or success states. In the success state, show the full rewritten sentence, short explanation, and an Apply button. For low-risk sentences, this UI appears only after click; no always-open suggestion list. Preserve existing highlighted text rendering and stable `data-testid="highlight-score"` plus add explicit attributes like `data-sentence-index` and selected-state hooks for testability.
  **Must NOT do**: Must NOT keep the old bottom-of-panel global suggestion list as the primary interaction, must NOT change the original highlighted text wording/score display, and must NOT require a second click path outside the highlighted sentence itself.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: this is a rich but bounded interaction change inside the existing review panel
  - Skills: `[]` — No extra skill required
  - Omitted: `['/playwright']` — Browser checks come after component behavior is implemented

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [5, 8] | Blocked By: [1, 2, 3]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/components/ReviewPanel.tsx:11-104` — current highlight rendering and obsolete suggestion list placement
  - Pattern: `src/lib/highlights/spans.ts:77-107` — sentence-linked highlight data now available from Task 1
  - Pattern: `src/lib/suggestions/types.ts:8-20` — suggestion payload fields available to display
  - Test: `e2e/home.spec.ts:11-59` — current visible highlight and suggestion assertions to evolve into click-driven interactions
  - Test: `tests/unit/homepage.test.tsx:5-13` — upload shell tests that must remain unaffected

  **Acceptance Criteria** (agent-executable only):
  - [ ] Clicking any highlighted span opens a sentence-specific suggestion UI and triggers on-demand suggestion fetch when needed
  - [ ] Suggestion UI shows loading, empty, or success state for the selected sentence
  - [ ] Success state shows rewritten sentence, explanation, and an Apply button for the selected sentence
  - [ ] Non-selected sentences do not show their suggestion UI by default
  - [ ] Existing highlight score label rendering remains visible and testable

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Clicking a low-risk or high-risk label opens suggestion details
    Tool: Playwright
    Steps: mock `/api/analyze` with multiple labeled spans including low and high; upload fixture; click each `[data-testid="highlight-score"]` target by sentence index
    Expected: only the clicked sentence reveals rewritten sentence, explanation, and Apply button
    Evidence: .sisyphus/evidence/task-4-clickable-suggestions.png

  Scenario: Sentence with no safe suggestion shows empty-state instead of Apply
    Tool: Playwright
    Steps: mock `/api/analyze` so one highlighted sentence has no returned suggestion; click that sentence label
    Expected: UI shows deterministic “no suggestion available” state and no Apply button
    Evidence: .sisyphus/evidence/task-4-clickable-suggestions-error.png
  ```

  **Commit**: YES | Message: `feat(review): open sentence suggestions from clicked labels` | Files: `src/components/ReviewPanel.tsx`, `src/app/page.tsx`, `tests/unit/**`, `e2e/home.spec.ts`

- [x] 5. Add revised-analysis request flow and right-side revised preview panel

  **What to do**: Extract the shared text-analysis logic from `src/app/api/analyze/route.ts` into a reusable server helper (for example `src/lib/analysis/analyzeText.ts`) and add a dedicated `POST /api/analyze/revised` JSON endpoint that accepts `{ text: string }` and returns the same `AnalysisSuccessResponse` shape for the revised panel. Create a dedicated `src/components/RevisedReviewPanel.tsx` component that renders only after the first Apply, showing revised text, revised highlight labels, and revised overall score. The original left panel remains visible and unchanged. The revised panel must render from the fresh server response, not derived local labels.
  **Must NOT do**: Must NOT fake rescoring from stale original results, must NOT force the user to re-upload the file for every revision, and must NOT overload the original `ReviewPanel` so heavily that original/revised responsibilities become indistinguishable.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: requires coordinated client/server contract extension and new panel rendering
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — Functionally correct rescoring flow is the priority

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [6, 7, 8] | Blocked By: [2, 3, 4]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/app/api/analyze/route.ts:48-147` — current file-upload analysis pipeline to extract into a shared pure text-analysis helper
  - Pattern: `src/app/page.tsx:59-106` — current single-panel result rendering that must expand to a dual-pane layout after Apply
  - Pattern: `src/components/ReviewPanel.tsx:76-106` — current left-panel score/header structure to mirror appropriately in the revised panel without duplicating interaction scope
  - Test: `tests/integration/analyze-route.test.ts:99-236` — route assertions proving shape and scoring behavior to preserve for revised responses
  - Test: `e2e/home.spec.ts:11-59` — current result-panel visibility checks to expand into dual-pane assertions

  **Acceptance Criteria** (agent-executable only):
  - [ ] Applying a suggestion triggers a real server request that returns rescored revised analysis data
  - [ ] Revised panel appears on the right only after the first Apply
  - [ ] Revised panel shows revised overall score and revised highlighted spans from the rescored response
  - [ ] Original panel remains visible and unchanged after revised panel appears

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Apply creates rescored revised panel
    Tool: Playwright
    Steps: mock initial `/api/analyze` success; click a highlighted sentence; click Apply; mock revised-analysis request with updated score/highlights
    Expected: right-side revised panel becomes visible with revised text, revised score, and revised labels while the original panel remains visible
    Evidence: .sisyphus/evidence/task-5-revised-panel.png

  Scenario: Revised-analysis request failure is handled cleanly
    Tool: Playwright
    Steps: mock initial `/api/analyze` success; click Apply; mock revised-analysis request failure (503 or 502)
    Expected: revised-panel error state appears without corrupting the original left-panel result
    Evidence: .sisyphus/evidence/task-5-revised-panel-error.png
  ```

  **Commit**: YES | Message: `feat(review): add server-rescored revised preview panel` | Files: `src/app/**`, `src/components/**`, `tests/integration/**`, `e2e/home.spec.ts`

- [x] 6. Wire Apply action into precise sentence replacement and automatic rescoring

  **What to do**: Connect the selected suggestion’s full rewritten sentence to the reducer state and revised-analysis request flow. Applying a suggestion must replace only the targeted original sentence identified by `sentenceIndex`, rebuild the revised text deterministically, send that revised text through the rescoring flow, and update the revised panel response. Support multiple concurrently applied rewrites by sentence index while preserving deterministic original-order rendering.
  **Must NOT do**: Must NOT mutate text by naive global string replacement, must NOT allow one sentence apply to replace multiple matching substrings, and must NOT lose previously applied edits when a second sentence is applied.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: precise sentence replacement plus cumulative rescoring is logic-heavy and error-prone
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — Correct edit application matters more than presentation here

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [7, 8] | Blocked By: [1, 2, 3, 5]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/lib/highlights/spans.ts:77-107` — original sentence-to-span mapping constraints that the apply logic must respect
  - Pattern: `src/app/api/analyze/route.ts:139-145` — canonical response shape the revised panel expects after each apply
  - Pattern: `src/lib/suggestions/types.ts:8-20` — source `sentenceIndex` used to target replacements
  - Test: `tests/unit/highlights.test.ts:94-146` — duplicate sentence scenarios that prove naive text replacement is unsafe
  - Test: `tests/integration/analyze-route.test.ts:219-234` — existing sentenceIndex linkage expectations

  **Acceptance Criteria** (agent-executable only):
  - [ ] Applying a suggestion replaces only the targeted sentence instance linked by `sentenceIndex`
  - [ ] Multiple applied rewrites can coexist without overwriting each other
  - [ ] Revised text sent for rescoring matches the expected cumulative replacement set
  - [ ] Duplicate sentence text cases do not apply the rewrite to the wrong occurrence

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Multiple sentence applies accumulate correctly
    Tool: Bash
    Steps: run reducer/text-derivation unit tests with two applied sentence indices and inspect the resulting revised text
    Expected: both targeted sentences are replaced exactly once and in the correct positions
    Evidence: .sisyphus/evidence/task-6-apply-flow.txt

  Scenario: Duplicate sentence text only updates the clicked occurrence
    Tool: Bash
    Steps: run unit tests with repeated sentence content sharing text but distinct sentence indices
    Expected: applying one index updates only that occurrence; the other duplicate remains unchanged
    Evidence: .sisyphus/evidence/task-6-apply-flow-error.txt
  ```

  **Commit**: YES | Message: `feat(review): apply rewrites by sentence index` | Files: `src/app/**`, `src/components/**`, `tests/unit/**`, `tests/integration/**`

- [x] 7. Support click-to-revert from the revised panel with automatic rescoring

  **What to do**: In the right-side revised panel, make any currently applied rewritten sentence clickable for undo. Clicking it removes that sentence’s applied replacement from reducer state, re-derives the revised text from the remaining applied edits, re-runs revised analysis automatically, and refreshes the revised panel score/highlights. If no applied replacements remain after undo, collapse the revised panel back to its empty/not-yet-open state or a clearly defined no-applied-edits state chosen consistently across the UI.
  **Must NOT do**: Must NOT mutate the original left-panel result, must NOT require a separate global reset button as the only undo path, and must NOT leave stale revised scores visible after an undo.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: combines right-panel interaction UX with reducer/server wiring
  - Skills: `[]` — No extra skill required
  - Omitted: `['/playwright']` — Implement behavior before end-to-end validation

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [8] | Blocked By: [1, 2, 3, 5, 6]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `src/app/page.tsx:102-105` — current single result panel render location that will now coordinate original + revised states
  - Pattern: `src/components/ReviewPanel.tsx:76-106` — left-panel presentation that must remain unchanged while revised panel gains click-to-revert behavior
  - Pattern: `src/lib/suggestions/types.ts:15-20` — sentence index contract required for undo targeting
  - Test: `e2e/home.spec.ts:11-59` — existing upload/result flow that must stay green while adding revised interaction

  **Acceptance Criteria** (agent-executable only):
  - [ ] Clicking a rewritten sentence in the revised panel reverts only that sentence
  - [ ] Undo triggers a fresh revised-analysis request and refreshed score/highlights
  - [ ] If no applied edits remain, the revised panel returns to the agreed empty/hidden state without affecting the original panel
  - [ ] Undo behavior works after multiple prior applies

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Clicking rewritten sentence reverts it and rescored panel updates
    Tool: Playwright
    Steps: apply a suggestion to create revised panel; click the rewritten sentence in the revised panel; mock undo reanalysis response
    Expected: rewritten sentence reverts, revised score/labels refresh, original panel remains unchanged
    Evidence: .sisyphus/evidence/task-7-undo-flow.png

  Scenario: Undoing the last applied edit clears revised preview state safely
    Tool: Playwright
    Steps: apply one suggestion; click the rewritten sentence to undo the only change
    Expected: revised panel collapses or shows defined empty state with no stale revised score visible
    Evidence: .sisyphus/evidence/task-7-undo-flow-error.png
  ```

  **Commit**: YES | Message: `feat(review): add click-to-revert revised sentences` | Files: `src/app/**`, `src/components/**`, `tests/unit/**`, `e2e/home.spec.ts`

- [x] 8. Complete regression coverage, selectors, and documentation for the dual-pane workflow

  **What to do**: Finalize automated coverage for the new dual-pane review workflow. Add or update unit/component tests, route integration tests, and Playwright scenarios for: clicking low/medium/high labels, on-demand suggestion loading, no-safe-suggestion empty states, apply creating revised panel, cumulative apply behavior, revert behavior, and revised-analysis failures. Update README only by adding one concise note in the existing Core Features / Getting Started sections that rewritten suggestions now require both `SAPLING_API_KEY` and `COACHING_LLM_API_KEY`. Ensure new `data-testid` hooks are stable and documented implicitly by test usage.
  **Must NOT do**: Must NOT add broad product docs unrelated to this workflow, must NOT remove existing baseline upload/error tests, and must NOT leave new selectors undocumented in test code.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: final hardening spans unit, integration, and E2E layers
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — This is verification-heavy closure work

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [] | Blocked By: [4, 5, 6, 7]

  **References** (executor has NO interview context — be exhaustive):
  - Test: `tests/unit/highlights.test.ts:13-292` — span behavior baseline
  - Test: `tests/unit/suggestions.test.ts:5-237` — suggestion and guardrail baseline
  - Test: `tests/integration/analyze-route.test.ts:99-520` — route analysis and cleanup baseline
  - Test: `e2e/home.spec.ts:1-170` — current browser coverage pattern with mocked `/api/analyze`
  - Pattern: `src/components/ReviewPanel.tsx:49-59` — existing `data-testid` / `data-ai-score` usage that must remain stable while extended

  **Acceptance Criteria** (agent-executable only):
  - [ ] Playwright covers click-to-open, apply, revised panel render, multi-apply, revert, and failure cases
  - [ ] Unit tests cover sentence-index targeting and revised-text derivation edge cases
  - [ ] Integration tests cover the revised-analysis server contract and on-demand suggestion endpoint behavior
  - [ ] Existing baseline upload/error scenarios continue to pass unchanged

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Full dual-pane happy path passes end to end
    Tool: Playwright
    Steps: run the new dual-pane E2E suite covering upload -> click label -> view suggestion -> apply -> revised panel -> undo
    Expected: all assertions pass and screenshots prove both panels behave correctly
    Evidence: .sisyphus/evidence/task-8-dual-pane-regression.png

  Scenario: New interaction flow does not break legacy error/upload scenarios
    Tool: Bash
    Steps: run `npm run test:e2e` and targeted unit/integration suites after all changes
    Expected: existing upload shell, unsupported format, extraction failure, and language-error flows remain green
    Evidence: .sisyphus/evidence/task-8-dual-pane-regression-error.txt
  ```

  **Commit**: YES | Message: `test(review): cover dual-pane suggestion workflow` | Files: `tests/**`, `e2e/**`, `README.md` (only if existing review behavior docs are updated)

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
  - Review `.sisyphus/plans/suggestion-preview-workflow.md` against completed code and tests.
  - Verify every task acceptance criterion with repo evidence and command output.
  - Confirm clickable label flow, full rewritten suggestions, revised rescoring, and click-to-revert are all implemented exactly as planned.
- [x] F2. Code Quality Review — unspecified-high
  - Inspect reducer/state complexity, component boundaries, and API contract changes for maintainability.
  - Confirm original/revised panel responsibilities are not tangled and no stale local-score shortcuts exist.
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
  - Execute real browser validation of: upload, click low-risk label, click high-risk label, Apply, revised panel render, revised score refresh, multi-apply, and undo.
  - Capture screenshots for both original-only and dual-pane states plus failure handling on revised-analysis error.
- [x] F4. Scope Fidelity Check — deep
  - Confirm no upload-form redesign, no recursive revised-panel suggestion loop, no persistence/export/auth features, and no evasion-oriented wording slipped in.

## Commit Strategy
- Commit 1: add stable `sentenceIndex` linkage to highlight spans and update response/test contracts
- Commit 2: add on-demand suggestion endpoint with full rewritten sentences and guardrails
- Commit 3: introduce reducer/hook state for original/revised workflow without changing upload shell behavior
- Commit 4: make left-panel highlighted sentences clickable and show sentence-scoped suggestion UI
- Commit 5: add server-backed revised analysis path plus dedicated right-side revised panel
- Commit 6: wire precise sentence apply logic with cumulative replacements and automatic rescoring
- Commit 7: implement revised-panel click-to-revert with automatic rescoring
- Commit 8: finalize dual-pane regression coverage and supporting selectors/docs

## Success Criteria
- Users can still upload and analyze `.doc`/`.docx` files exactly as before
- Every rendered risk-labeled sentence can be clicked to fetch and inspect a full rewritten suggestion and explanation
- Apply inserts only the targeted sentence rewrite into a right-side revised preview
- Revised preview always displays real rescored labels and overall score after every Apply and Undo
- Clicking a revised sentence reverts it cleanly without altering the original left-panel analysis
- Automated tests prove low/medium/high label interactions, duplicate-sentence targeting, revised-analysis failure handling, and undo behavior
