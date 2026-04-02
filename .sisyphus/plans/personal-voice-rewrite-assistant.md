# Personal Voice Rewrite Assistant

## TL;DR
> **Summary**: Add a sentence-by-sentence rewrite assistant that generates 2-3 rewrite alternatives aligned to a reusable user voice profile, without framing the feature as detector evasion. Users can define voice via presets, writing samples, or both; the app generates an editable copyable profile text that can be pasted back into future sessions.
> **Deliverables**:
> - Voice-profile generation flow with presets, optional writing sample, editable profile text, and copy-only reuse
> - Backward-compatible `/api/suggestions` enhancement that returns 2-3 alternatives while preserving existing unavailable contract
> - Review-panel popover that renders multiple alternatives with per-option Apply actions
> - Tests-after coverage across unit, integration, and Playwright flows
> **Effort**: Medium
> **Parallel**: YES - 2 waves
> **Critical Path**: 1 → 2 → 3 → 4 → 6 → 7 → 9

## Context
### Original Request
- Build a program that suggests sentence rewrites in the user's own voice.
- Users must be able to define voice by sample text, preset options, or both.
- Each sentence should show 2-3 alternatives.
- No account system yet; profile reuse must work by copying/pasting a detailed reusable voice-profile text.
- Language should follow the user's input language, with English as the main expected language.

### Interview Summary
- Product framing is authenticity/voice-preserving revision help, not detector evasion.
- Scope is sentence-by-sentence only; no whole-document rewrite pass.
- Voice-profile generation must be automatic from inputs but editable before use.
- Reuse is copy-text only; no account persistence and no browser persistence across sessions.
- Test strategy is **tests-after**.

### Metis Review (gaps addressed)
- Default applied: keep the active voice profile in page-level React state for the current tab, and do **not** clear it when a new document is uploaded in the same tab.
- Default applied: when no voice profile is configured, sentence clicks still return 2-3 generic alternatives rather than blocking suggestions.
- Guardrail added: create a dedicated profile-generation route instead of overloading `/api/suggestions` with two unrelated behaviors.
- Guardrail added: preserve the strict unavailable contract (`{ available:false, sentenceIndex }`) and keep top-level `rewrite`/`explanation` as aliases to the first alternative for backward compatibility.
- Guardrail added: sanitize pasted/generated profile text before prompt injection and cap it at 2000 characters.

## Work Objectives
### Core Objective
Enable users to generate and reuse a detailed voice profile, then receive 2-3 sentence-level rewrite alternatives that reflect that profile while preserving the current review/apply/rescore workflow.

### Deliverables
- New voice-profile domain model and prompt-building helpers
- New `POST /api/voice-profile/generate` route for profile generation
- Enhanced `POST /api/suggestions` route accepting optional `voiceProfile`
- Multi-alternative suggestion support in LLM parsing, reducer cache, and UI rendering
- New voice-profile setup UI with preset chips, writing-sample textarea, editable generated profile, and copy affordance
- Regression-safe unit/integration/e2e coverage for profile generation, copy/paste reuse, no-profile fallback, and multi-alternative apply flow

### Definition of Done (verifiable conditions with commands)
- `npm run test -- tests/unit/suggestions.test.ts tests/unit/revisedAnalysisReducer.test.ts tests/unit/homepage.test.tsx tests/integration/suggestions-route.test.ts tests/integration/voice-profile-route.test.ts` exits 0
- `npm run test:e2e -- e2e/home.spec.ts e2e/voice-rewrite.spec.ts` exits 0
- `npm run typecheck` exits 0
- `npm run lint` exits 0
- After a successful upload, the page shows a voice-profile setup area with preset selection, sample input, editable profile text, and copy action
- Clicking a highlighted sentence returns 2-3 alternatives whether or not a voice profile is configured
- Applying any one alternative still triggers revised-analysis rescoring exactly as the current single-apply flow does
- Copying the generated profile yields reusable text that can be pasted back into the profile textarea in a fresh session
- `/api/suggestions` unavailable responses remain exactly `{ available:false, sentenceIndex }`

### Must Have
- Keep the feature framed as authenticity/voice alignment, never detector avoidance
- Support three setup modes in one UI: presets-only, sample-only, or presets + sample
- Generate a detailed reusable profile text and allow direct user editing before sentence suggestions use it
- Use English UI copy by default, but generate/copy the profile text in the dominant input language (simple English/Korean heuristic is sufficient)
- Preserve current apply/revert/rescore behavior and existing highlight interactions
- Preserve current strict unavailable contract on `/api/suggestions`
- Preserve existing `data-testid` hooks and add new ones rather than renaming old ones

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Must NOT claim to evade, bypass, lower, or optimize against AI detectors
- Must NOT add account storage, localStorage/sessionStorage persistence, or server-side profile persistence in this release
- Must NOT add whole-document or paragraph rewrite mode
- Must NOT break existing `/api/suggestions` consumers that expect top-level `rewrite`/`explanation` on success
- Must NOT introduce third-party state management, form libraries, or overlay libraries for this feature
- Must NOT change `revisedState.applySentenceReplacement`, revised-analysis route behavior, or unavailable response semantics beyond what is specified here

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: **tests-after**
- Frameworks: **Vitest** (unit + integration), **Playwright** (UI flows)
- QA policy: every task includes executable happy-path and failure/edge-path scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Build the voice-profile domain and API contracts first, then wire UI + regression coverage on top.

Wave 1: shared domain, profile-generation API, suggestions API/LLM contract, reducer/cache model, page-level state shell (Tasks 1-5)

Wave 2: voice-profile UI, review-panel multi-alternative rendering, automated coverage, end-to-end regression proof (Tasks 6-9)

### Dependency Matrix (full, all tasks)
- 1 blocks 2, 3, 4, 5, 6, 7, 8, 9
- 2 blocks 6, 8, 9
- 3 blocks 4, 7, 8, 9
- 4 blocks 7, 8, 9
- 5 blocks 6, 7, 9
- 6 supports 9
- 7 supports 9
- 8 supports 9
- 9 is the final implementation task before the verification wave

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 5 tasks → unspecified-high
- Wave 2 → 4 tasks → visual-engineering, unspecified-high

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Introduce voice-profile domain helpers and sanitization rules

  **What to do**: Create a dedicated helper module under `src/lib/suggestions/` (recommended: `voiceProfile.ts`) that defines the supported preset keys, converts selected presets into normalized descriptor text, strips optional wrapper text such as `Your voice profile is:` / `당신의 목소리는`, enforces a 2000-character cap, and chooses English vs Korean wrapper/profile output using a simple Hangul-presence heuristic. Also expose prompt-builder helpers for profile generation and sentence-rewrite context so downstream routes do not duplicate string-building logic.
  **Must NOT do**: Must NOT add persistence logic, must NOT add any detector-evasion phrasing, and must NOT introduce external i18n or language-detection packages.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: new shared domain logic with safety and contract implications
  - Skills: `[]` — No extra skill required
  - Omitted: `['visual-engineering']` — This is prompt/domain logic, not UI work

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [2, 3, 4, 5, 6, 7, 8, 9] | Blocked By: []

  **References**:
  - Pattern: `src/lib/suggestions/llm.ts:11-29` — current prompt constants and risk-aware user prompt builder
  - Pattern: `src/lib/suggestions/llm.ts:31-49` — current JSON parsing expectations that must stay centralized
  - Test: `tests/unit/suggestions.test.ts:200-238` — existing guardrail expectations to preserve and extend
  - Test: `tests/unit/suggestions.test.ts:240-530` — current LLM helper testing style to mirror for new helper functions

  **Acceptance Criteria**:
  - [ ] A shared sanitizer accepts both wrapped and plain profile text and returns normalized prompt-safe content capped at 2000 chars
  - [ ] Preset selections are converted into deterministic descriptor text, not raw UI labels dumped into prompts
  - [ ] Helper output can generate English and Korean reusable wrapper strings using a simple documented heuristic
  - [ ] No helper text contains banned detector-evasion phrasing

  **QA Scenarios**:
  ```
  Scenario: Wrapped and pasted profile text normalize safely
    Tool: Bash
    Steps: run `npm run test -- tests/unit/suggestions.test.ts` after adding helper coverage for English and Korean wrapped profile strings plus max-length trimming
    Expected: new unit cases prove wrapper stripping, language-aware wrapper generation, and 2000-char clamping
    Evidence: .sisyphus/evidence/task-1-voice-profile-helpers.txt

  Scenario: Unsafe profile language is rejected from prompt helper output
    Tool: Bash
    Steps: run the same unit suite with cases containing phrases like "avoid detection" inside profile input
    Expected: tests prove the helper path either strips or blocks unsafe phrasing before prompt assembly
    Evidence: .sisyphus/evidence/task-1-voice-profile-helpers-error.txt
  ```

  **Commit**: YES | Message: `feat(suggestions): add voice profile helpers` | Files: `src/lib/suggestions/voiceProfile.ts`, `tests/unit/suggestions.test.ts`

- [x] 2. Add a dedicated voice-profile generation route

  **What to do**: Create `src/app/api/voice-profile/generate/route.ts` with `runtime = 'nodejs'`. Accept a JSON body with `{ presets: VoicePreset[], writingSample?: string, languageHint?: 'en' | 'ko' }`, require at least one non-empty input source, sanitize and cap inputs, call the LLM using `COACHING_LLM_API_KEY`, and return `{ profile: string, language: 'en' | 'ko' }`. Keep the route narrowly focused on producing reusable profile text, not sentence rewrites.
  **Must NOT do**: Must NOT reuse `/api/suggestions` for profile generation, must NOT persist profiles, and must NOT require a new environment variable.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: route contract and safety validation must be exact
  - Skills: `[]`
  - Omitted: `['visual-engineering']` — No frontend work in this task

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [6, 8, 9] | Blocked By: [1]

  **References**:
  - Pattern: `src/app/api/suggestions/route.ts:4-25` — current route typing/style to mirror
  - Pattern: `src/app/api/suggestions/route.ts:27-84` — request validation and 200/400 response style
  - Pattern: `src/lib/suggestions/llm.ts:51-93` — current LLM call pattern and failure handling style
  - Test: `tests/integration/suggestions-route.test.ts:207-357` — request-validation and strict-contract testing style to follow

  **Acceptance Criteria**:
  - [ ] Valid presets-only, sample-only, and mixed requests each return a non-empty profile string and language code
  - [ ] Missing API key or invalid body degrade to explicit route responses without crashing callers
  - [ ] Route enforces max input lengths and rejects empty requests
  - [ ] Returned profile text is reusable copy text, not hidden metadata

  **QA Scenarios**:
  ```
  Scenario: Valid profile-generation request returns copyable profile text
    Tool: Bash
    Steps: run `npm run test -- tests/integration/voice-profile-route.test.ts`
    Expected: integration tests cover presets-only, sample-only, and mixed requests and assert `{ profile, language }` response shape
    Evidence: .sisyphus/evidence/task-2-voice-profile-route.txt

  Scenario: Empty or malformed request is rejected cleanly
    Tool: Bash
    Steps: run the same integration suite with invalid payload cases and missing key cases
    Expected: tests prove stable 400/unavailable handling without leaking stack traces or partial profile output
    Evidence: .sisyphus/evidence/task-2-voice-profile-route-error.txt
  ```

  **Commit**: YES | Message: `feat(api): add voice profile generation route` | Files: `src/app/api/voice-profile/generate/route.ts`, `tests/integration/voice-profile-route.test.ts`

- [x] 3. Extend suggestion generation to return 2-3 alternatives with optional voice profile

  **What to do**: Extend `src/lib/suggestions/llm.ts` and `src/app/api/suggestions/route.ts` so success responses include `alternatives: Array<{ rewrite: string; explanation: string }>` of length 2 or 3, while preserving top-level `rewrite` and `explanation` as aliases to `alternatives[0]`. Accept optional `voiceProfile` in the request body, sanitize it through the shared helper, inject it into the rewrite prompt when present, and fall back to generic multi-alternative rewrites when absent. Keep unavailable responses unchanged. Increase token budget for multi-alternative JSON and update parsing to support both legacy single-object and new alternatives-array payloads.
  **Must NOT do**: Must NOT change unavailable success semantics, must NOT remove top-level `rewrite`/`explanation`, and must NOT make voice profile mandatory.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: route contract, LLM prompt design, and safety filters change together
  - Skills: `[]`
  - Omitted: `['visual-engineering']` — This is API/model work

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [4, 7, 8, 9] | Blocked By: [1]

  **References**:
  - Pattern: `src/app/api/suggestions/route.ts:6-25` — current request/response types to extend backward-compatibly
  - Pattern: `src/app/api/suggestions/route.ts:67-83` — current `generateSingleSuggestion` bridge that must accept optional profile input
  - Pattern: `src/lib/suggestions/llm.ts:16-29` — current single-rewrite JSON contract and prompt framing
  - Pattern: `src/lib/suggestions/llm.ts:31-49` — JSON parsing seam to extend for multi-alternative payloads
  - Pattern: `src/lib/suggestions/llm.ts:125-146` — current single-suggestion export and guardrail application path
  - Test: `tests/integration/suggestions-route.test.ts:46-205` — current success-path assertions that must remain green after contract extension
  - Test: `tests/integration/suggestions-route.test.ts:312-357` — strict unavailable contract that must remain unchanged

  **Acceptance Criteria**:
  - [ ] Success responses always return 2 or 3 alternatives and still expose top-level `rewrite`/`explanation` matching the first alternative
  - [ ] Request validation accepts missing `voiceProfile` and sanitized non-empty `voiceProfile`
  - [ ] If all alternatives fail guardrails, the route returns the existing unavailable response shape
  - [ ] Existing integration tests for unavailable responses still pass without requiring new fields

  **QA Scenarios**:
  ```
  Scenario: Suggestions route returns three safe alternatives with profile context
    Tool: Bash
    Steps: run `npm run test -- tests/integration/suggestions-route.test.ts tests/unit/suggestions.test.ts`
    Expected: tests assert `alternatives.length` is 2 or 3, top-level `rewrite/explanation` mirror index 0, and profile text is forwarded into prompt construction
    Evidence: .sisyphus/evidence/task-3-multi-suggestions.txt

  Scenario: Guardrails drop unsafe alternatives and preserve unavailable contract when none remain
    Tool: Bash
    Steps: run the same suites with mocked LLM output containing banned language in one or all alternatives
    Expected: tests prove partial filtering keeps safe alternatives and total filtering yields exactly `{ available:false, sentenceIndex }`
    Evidence: .sisyphus/evidence/task-3-multi-suggestions-error.txt
  ```

  **Commit**: YES | Message: `feat(suggestions): support voice-aware alternatives` | Files: `src/app/api/suggestions/route.ts`, `src/lib/suggestions/llm.ts`, `tests/integration/suggestions-route.test.ts`, `tests/unit/suggestions.test.ts`

- [x] 4. Extend revised-analysis cache entries for alternative arrays without changing apply flow

  **What to do**: Update `src/lib/review/revisedAnalysisReducer.ts` so `SuggestionCacheEntry` can store `alternatives` while retaining backward-compatible `rewrite`/`explanation` aliases for the first option. Keep the existing reducer action vocabulary; extend `SUGGESTION_FETCH_SUCCESS` payload to include `alternatives` and derive aliases from `alternatives[0]`. Do not change `APPLY_REPLACEMENT`, `REMOVE_REPLACEMENT`, or `deriveRevisedText` behavior.
  **Must NOT do**: Must NOT add persistence outside this reducer, must NOT remove `rewrite`/`explanation` aliases, and must NOT change the selection/apply/revert workflow semantics.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: state-shape extension must preserve all existing reducer behavior
  - Skills: `[]`
  - Omitted: `['visual-engineering']`

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [7, 8, 9] | Blocked By: [3]

  **References**:
  - API/Type: `src/lib/review/revisedAnalysisReducer.ts:23-30` — current cache-entry shape to extend
  - API/Type: `src/lib/review/revisedAnalysisReducer.ts:94-139` — existing reducer action union to preserve
  - Pattern: `src/lib/review/revisedAnalysisReducer.ts:172-203` — current fetch-success and unavailable storage logic
  - Pattern: `src/lib/review/revisedAnalysisReducer.ts:216-301` — apply/remove and revised-text derivation that must remain unchanged
  - Test: `tests/unit/revisedAnalysisReducer.test.ts` — existing reducer-dispatch testing seam to extend

  **Acceptance Criteria**:
  - [ ] Reducer can store `alternatives` plus legacy aliases in one cache entry
  - [ ] Apply/revert behavior is unchanged because replacement still resolves to one chosen rewrite string
  - [ ] Existing unavailable/error/loading states still work with no profile configured
  - [ ] Updated reducer tests cover both legacy alias access and new alternatives-array access

  **QA Scenarios**:
  ```
  Scenario: Fetch success stores alternatives and first-option aliases together
    Tool: Bash
    Steps: run `npm run test -- tests/unit/revisedAnalysisReducer.test.ts`
    Expected: new reducer tests prove `alternatives`, `rewrite`, and `explanation` are all available after success dispatch
    Evidence: .sisyphus/evidence/task-4-reducer-alternatives.txt

  Scenario: Existing apply/remove logic stays unchanged
    Tool: Bash
    Steps: run the same reducer suite including existing apply/remove/deriveRevisedText cases
    Expected: all prior behavior remains green while alternative-array storage is added
    Evidence: .sisyphus/evidence/task-4-reducer-alternatives-error.txt
  ```

  **Commit**: YES | Message: `feat(review): cache suggestion alternatives` | Files: `src/lib/review/revisedAnalysisReducer.ts`, `tests/unit/revisedAnalysisReducer.test.ts`

- [x] 5. Add page-level voice profile state that survives document uploads within the same tab

  **What to do**: Extend `src/app/page.tsx` with page-level React state for selected presets, writing-sample draft, generated/editable `voiceProfile`, generation loading/error state, and copy feedback. Keep this state outside `useRevisedAnalysisState`. Do not clear the voice-profile state when `resetRevised()` runs during a new upload; only clear it when the user explicitly edits/removes it. Thread the current `voiceProfile` down to `ReviewPanel` as an optional prop.
  **Must NOT do**: Must NOT move voice profile into the reducer, must NOT store it in browser storage, and must NOT reset it on each file upload.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: state ownership and prop threading need to be correct before UI rendering work
  - Skills: `[]`
  - Omitted: `['visual-engineering']` — State shell first, styling later

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [6, 7, 9] | Blocked By: [1]

  **References**:
  - Pattern: `src/app/page.tsx:8-14` — current page-level local state and revised-analysis hook ownership
  - Pattern: `src/app/page.tsx:28-73` — submit/reset flow that currently clears revised-analysis state only
  - Pattern: `src/app/page.tsx:118-134` — result-only render section where voice-profile state should be wired
  - Pattern: `src/components/ReviewPanel.tsx:14-19` — current prop surface that will need an optional `voiceProfile` addition

  **Acceptance Criteria**:
  - [ ] Voice-profile state lives in `page.tsx` and is passed into `ReviewPanel`
  - [ ] Uploading a second document in the same tab leaves the current profile text intact
  - [ ] Profile state can be cleared or replaced only via explicit voice-profile UI actions
  - [ ] No browser persistence API is introduced

  **QA Scenarios**:
  ```
  Scenario: Voice profile survives a new upload in the same tab
    Tool: Bash
    Steps: run `npm run test -- tests/unit/homepage.test.tsx` after adding a page-level state interaction case
    Expected: component tests prove `resetRevised()` clears analysis state but not the voice-profile draft
    Evidence: .sisyphus/evidence/task-5-page-state.txt

  Scenario: No persistence layer is introduced accidentally
    Tool: Bash
    Steps: run the same unit suite with spies/assertions around `localStorage`/`sessionStorage`
    Expected: tests confirm no browser storage calls are made by the voice-profile state shell
    Evidence: .sisyphus/evidence/task-5-page-state-error.txt
  ```

  **Commit**: YES | Message: `feat(app): add in-tab voice profile state` | Files: `src/app/page.tsx`, `tests/unit/homepage.test.tsx`

- [x] 6. Build the voice-profile setup panel with presets, sample input, editable output, and copy-only reuse

  **What to do**: Add a dedicated component (recommended: `src/components/VoiceProfilePanel.tsx`) rendered above `ReviewPanel` once `result` exists. Provide preset chips with a max of two selected presets, a writing-sample textarea, a `Generate profile` button, an editable `voice-profile` textarea populated by route output, and a `Copy profile` button. Use English UI labels by default. The copied text must include the full reusable wrapper sentence in the detected language (e.g. `Your voice profile is: ...` or `당신의 목소리는 '...' 입니다.`). Add explicit data-testids: `voice-profile-panel`, `voice-preset-{slug}`, `voice-sample-input`, `generate-voice-profile-btn`, `voice-profile-textarea`, `copy-voice-profile-btn`, and `voice-profile-status`.
  **Must NOT do**: Must NOT hide the profile text behind a modal, must NOT add local persistence, and must NOT auto-generate on mount or on upload completion.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: new UI section with form interactions and accessibility states
  - Skills: `[]`
  - Omitted: `['unspecified-high']` — Main risk is UI/interaction integrity

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [9] | Blocked By: [1, 2, 5]

  **References**:
  - Pattern: `src/app/page.tsx:118-134` — exact insertion point for result-stage UI
  - Pattern: `src/app/page.tsx:75-107` — current card styling and form conventions to mirror
  - Test: `e2e/home.spec.ts:11-90` — current upload-then-review e2e shape to extend without breaking

  **Acceptance Criteria**:
  - [ ] After a successful upload, the page renders the full profile-setup panel before the review panel
  - [ ] Users can generate from presets-only, sample-only, or mixed input, then edit the generated profile text directly
  - [ ] Copy action copies the full reusable profile text and shows deterministic feedback in `voice-profile-status`
  - [ ] Preset selection, sample input, and editable profile text each have stable test selectors

  **QA Scenarios**:
  ```
  Scenario: Generate and copy a reusable profile from mixed inputs
    Tool: Bash
    Steps: run `npm run test:e2e -- e2e/voice-rewrite.spec.ts`
    Expected: Playwright uploads a document, selects presets, enters a sample, generates a profile, edits it, copies it, and reads a non-empty clipboard value
    Evidence: .sisyphus/evidence/task-6-voice-panel.png

  Scenario: Empty profile inputs do not trigger generation
    Tool: Bash
    Steps: run the same e2e spec with a validation case that clicks Generate with no presets and no sample
    Expected: UI shows a stable validation message/status and no profile text is produced
    Evidence: .sisyphus/evidence/task-6-voice-panel-error.txt
  ```

  **Commit**: YES | Message: `feat(ui): add voice profile setup panel` | Files: `src/components/VoiceProfilePanel.tsx`, `src/app/page.tsx`, `e2e/voice-rewrite.spec.ts`

- [x] 7. Render 2-3 alternatives in the suggestion popover and apply one without changing rescore semantics

  **What to do**: Update `src/components/ReviewPanel.tsx` so `handleSentenceClick` includes the optional `voiceProfile` prop in the `/api/suggestions` request body, reads `alternatives` from the response/cache entry, and renders them as a numbered list inside the existing popover. Each alternative must display rewrite + explanation + its own Apply button (`apply-suggestion-btn-0`, `apply-suggestion-btn-1`, etc.). Clicking Apply must still call the existing `handleApply`/`applySentenceReplacement` path with the selected rewrite string and keep revised-analysis rescoring behavior unchanged.
  **Must NOT do**: Must NOT remove `suggestion-success`, `suggestion-empty`, or `suggestion-popover`; must NOT require a voice profile before fetching; must NOT break unavailable retry behavior.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: popover UI and fetch/render flow both change, but the risk is interaction stability
  - Skills: `[]`
  - Omitted: `['unspecified-high']` — Existing fetch/apply patterns already exist

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [9] | Blocked By: [3, 4, 5]

  **References**:
  - Pattern: `src/components/ReviewPanel.tsx:54-94` — current click → fetch → dispatch flow to extend with `voiceProfile`
  - Pattern: `src/components/ReviewPanel.tsx:109-177` — current popover success/empty/error rendering that must become multi-alternative
  - Pattern: `src/components/ReviewPanel.tsx:96-107` — current apply path that must remain unchanged except for selected rewrite input
  - API/Type: `src/lib/review/revisedAnalysisReducer.ts:23-30,172-192` — cache entry and success storage shape that the UI will read
  - Test: `e2e/home.spec.ts:58-89` — existing suggestion popover assertions to keep backward-compatible
  - Test: `e2e/home.spec.ts:845-897` — unavailable retry behavior that must remain green

  **Acceptance Criteria**:
  - [ ] Success popover shows 2 or 3 alternatives with stable numbered selectors and one Apply button per option
  - [ ] Clicking any Apply button still triggers revised-analysis rescoring exactly once for that choice
  - [ ] When no `voiceProfile` is configured, the popover still shows generic alternatives rather than blocking
  - [ ] Unavailable, loading, error, and retry behaviors remain intact

  **QA Scenarios**:
  ```
  Scenario: Popover shows three alternatives and each can be applied
    Tool: Bash
    Steps: run `npm run test:e2e -- e2e/home.spec.ts e2e/voice-rewrite.spec.ts`
    Expected: Playwright sees `suggestion-alternative-0/1/2`, can click `apply-suggestion-btn-1`, and the revised panel reflects only that chosen rewrite
    Evidence: .sisyphus/evidence/task-7-review-panel-alternatives.png

  Scenario: No-profile fallback still produces alternatives and unavailable retry still works
    Tool: Bash
    Steps: run the same e2e specs with one case omitting `voiceProfile` and another returning `available:false` twice on repeated clicks
    Expected: generic alternatives render without profile context, and unavailable refetch count still increments on second click
    Evidence: .sisyphus/evidence/task-7-review-panel-alternatives-error.txt
  ```

  **Commit**: YES | Message: `feat(review): render multiple voice-aware alternatives` | Files: `src/components/ReviewPanel.tsx`, `e2e/home.spec.ts`, `e2e/voice-rewrite.spec.ts`

- [x] 8. Lock unit and integration coverage for new profile and alternatives contracts

  **What to do**: Extend the smallest existing Vitest suites and add only the missing dedicated integration file for the new profile route. Cover helper sanitization, prompt generation, multi-alternative parsing, route validation, top-level alias compatibility, strict unavailable contract, and reducer cache behavior. Reuse current test files/patterns instead of building a new harness.
  **Must NOT do**: Must NOT weaken existing unavailable-contract assertions, and must NOT introduce route mocks that depend on hidden implementation details instead of public request/response contracts.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: this task consolidates contract-level regression proof across existing seams
  - Skills: `[]`
  - Omitted: `['visual-engineering']`

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [9] | Blocked By: [2, 3, 4]

  **References**:
  - Test: `tests/unit/suggestions.test.ts:163-530` — guardrails, LLM, and generator tests to extend
  - Test: `tests/unit/revisedAnalysisReducer.test.ts` — reducer dispatch seam for alternative storage
  - Test: `tests/integration/suggestions-route.test.ts:46-357` — existing success/validation/unavailable contract coverage to extend
  - Pattern: `src/app/api/suggestions/route.ts:6-84` — public route contract being locked down
  - Pattern: `src/lib/suggestions/llm.ts:31-146` — parser + guardrail + generator seams being locked down

  **Acceptance Criteria**:
  - [ ] Unit tests cover helper sanitization, language wrapper generation, and multi-alternative parsing
  - [ ] Integration tests cover the new profile route and the optional `voiceProfile` field on `/api/suggestions`
  - [ ] Existing unavailable contract assertions stay verbatim green
  - [ ] Updated reducer tests prove cache entries remain backward-compatible

  **QA Scenarios**:
  ```
  Scenario: Full targeted unit/integration suite passes
    Tool: Bash
    Steps: run `npm run test -- tests/unit/suggestions.test.ts tests/unit/revisedAnalysisReducer.test.ts tests/unit/homepage.test.tsx tests/integration/suggestions-route.test.ts tests/integration/voice-profile-route.test.ts`
    Expected: all targeted suites pass with new profile and alternatives coverage plus unchanged unavailable assertions
    Evidence: .sisyphus/evidence/task-8-targeted-vitest.txt

  Scenario: Backward-compatible success aliases stay present alongside alternatives
    Tool: Bash
    Steps: run the same suite with assertions that `body.rewrite === body.alternatives[0].rewrite` and `body.explanation === body.alternatives[0].explanation`
    Expected: tests prove legacy consumers still have top-level fields while new UI can use the alternatives array
    Evidence: .sisyphus/evidence/task-8-targeted-vitest-error.txt
  ```

  **Commit**: YES | Message: `test(suggestions): cover voice profile contracts` | Files: `tests/unit/suggestions.test.ts`, `tests/unit/revisedAnalysisReducer.test.ts`, `tests/unit/homepage.test.tsx`, `tests/integration/suggestions-route.test.ts`, `tests/integration/voice-profile-route.test.ts`

- [x] 9. Add Playwright regression coverage for generated profile, pasted profile reuse, and multi-alternative apply flow

  **What to do**: Add `e2e/voice-rewrite.spec.ts` and make only the smallest updates to `e2e/home.spec.ts` needed to preserve old flows under the new response shape. Cover these end-to-end behaviors: generate a profile from mixed inputs, edit and copy it, paste a previously copied profile into a fresh page session, fetch three sentence alternatives with the profile applied, fetch generic alternatives without a profile, apply the second alternative, and confirm revised-analysis rescoring still reflects only the chosen rewrite.
  **Must NOT do**: Must NOT replace existing `home.spec.ts` coverage with the new spec, must NOT add arbitrary sleeps, and must NOT require manual clipboard or browser interaction outside Playwright APIs.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: cross-route/UI regression proof spanning upload, profile generation, suggestion popover, copy/paste, and rescore
  - Skills: `[]`
  - Omitted: `['visual-engineering']` — Verification task, not design work

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [] | Blocked By: [2, 3, 5, 6, 7, 8]

  **References**:
  - Test: `e2e/home.spec.ts:11-147` — current upload + suggestion-popover coverage that must remain intact
  - Test: `e2e/home.spec.ts:309-388` — apply/rescore expectations to preserve
  - Test: `e2e/home.spec.ts:845-897` — unavailable retry regression already in place
  - Pattern: `src/app/page.tsx:118-134` — result-stage shell where the new panel appears before review interactions
  - Pattern: `src/components/ReviewPanel.tsx:109-177` — popover selectors and apply semantics under test

  **Acceptance Criteria**:
  - [ ] Playwright covers mixed-input profile generation, edit, copy, and paste-back reuse
  - [ ] Playwright covers profile-aware alternatives and no-profile fallback alternatives
  - [ ] Applying alternative index 1 updates revised-analysis with that exact rewrite and not index 0
  - [ ] Existing `home.spec.ts` still passes with the new route response shape

  **QA Scenarios**:
  ```
  Scenario: Full browser regression flow passes
    Tool: Bash
    Steps: run `npm run test:e2e -- e2e/home.spec.ts e2e/voice-rewrite.spec.ts`
    Expected: Playwright verifies generate/edit/copy/paste profile flow, 2-3 alternatives, no-profile fallback, and exact-choice apply/rescore behavior
    Evidence: .sisyphus/evidence/task-9-voice-rewrite-suite.txt

  Scenario: Existing home-spec regressions remain green under new success payload
    Tool: Bash
    Steps: run `npm run test:e2e -- e2e/home.spec.ts`
    Expected: old flows still pass after adapting mocks/assertions for `alternatives` plus top-level aliases
    Evidence: .sisyphus/evidence/task-9-voice-rewrite-suite-error.txt
  ```

  **Commit**: YES | Message: `test(e2e): cover voice rewrite assistant flow` | Files: `e2e/home.spec.ts`, `e2e/voice-rewrite.spec.ts`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [x] F1. Plan Compliance Audit — oracle
- [x] F2. Code Quality Review — unspecified-high
- [x] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [x] F4. Scope Fidelity Check — deep

## Commit Strategy
- `feat(suggestions): add voice profile helpers`
- `feat(api): add voice profile generation route`
- `feat(suggestions): support voice-aware alternatives`
- `feat(review): cache suggestion alternatives`
- `feat(app): add in-tab voice profile state`
- `feat(ui): add voice profile setup panel`
- `feat(review): render multiple voice-aware alternatives`
- `test(suggestions): cover voice profile contracts`
- `test(e2e): cover voice rewrite assistant flow`

## Success Criteria
- Users can define voice with presets, a writing sample, or both, then edit the generated reusable profile text before use
- Users can copy the reusable profile text and paste it back in a future session without any account system
- Clicking any highlighted sentence returns 2-3 alternatives whether or not a profile is configured
- The selected alternative applies through the existing revised-analysis workflow with no regressions in rescore/revert behavior
- `/api/suggestions` strict unavailable contract stays unchanged while success responses gain backward-compatible `alternatives`
- All new flows are covered by automated Vitest and Playwright verification only
