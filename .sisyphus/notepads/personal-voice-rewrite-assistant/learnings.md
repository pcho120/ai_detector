## Task 1 – voiceProfile helpers (2026-04-01)

- Project test runner: `npm run test -- <path>` (vitest)
- Existing helper style: pure functions, no classes, no hidden state — matched in voiceProfile.ts
- `guardrails.ts` exports `containsBannedPhrase` / `applyGuardrails`; voiceProfile.ts intentionally does NOT depend on guardrails (different concern)
- `WRAPPER_PATTERNS` are prefix-only (anchored with `^` after trimming); only the first matching wrapper is stripped per call
- Hangul heuristic covers syllables U+AC00–U+D7A3, Jamo U+1100–U+11FF, Compat Jamo U+3130–U+318F — presence of any triggers 'ko'
- MAX_PROFILE_LENGTH = 2000 enforced after wrapper stripping, not before
- All 5 preset keys (academic, conversational, formal, narrative, technical) have deterministic descriptors with exact string stability
- `buildProfileGenerationPrompt` and `buildRewriteContextBlock` both guard against evasion language; Korean variants use 감지 회피 framing explicitly excluded
- 80 tests pass total (50 pre-existing + 30 new voiceProfile tests)

## Task 2 – voice-profile/generate route (2026-04-01)

- Route lives at `src/app/api/voice-profile/generate/route.ts` with `runtime = 'nodejs'`
- Validation: `isValidRequest` type-guards ALL fields before the input-source check; order matters (shape first, then logical constraint)
- Language resolution order: languageHint > detectProfileLanguage(writingSample) > 'en' fallback
- Writing sample is clamped to MAX_PROFILE_LENGTH BEFORE sending to LLM (not after); profile response is sanitized AFTER receiving from LLM
- Missing API key returns 503 (not 400) — correct framing: valid request, service unavailable
- LLM network errors / bad status / empty content all surface as 503 SERVICE_UNAVAILABLE without crashing
- `sanitizeVoiceProfile` returns empty string if LLM returns a pure wrapper phrase — route treats that as 503 too
- 25 integration tests cover: 3 success shapes, languageHint override, Korean detection, wrapper stripping, length clamping, response contract, 8 validation cases, 3 degradation cases, 5 preset-key acceptance cases

## Task 3 – multi-alternative suggestions + voiceProfile (2026-04-02)

- `generateAlternativeSuggestions` in llm.ts uses a separate `MULTI_SYSTEM_PROMPT` that requests `{ alternatives: [...] }` JSON shape
- Parser falls back to single-object `{ rewrite, explanation }` if LLM ignores the array instruction — defensive for partial compliance
- `applyGuardrails` is applied per-alternative; `safe.slice(0, 3)` caps output at 3; if all are unsafe, returns null => route returns unavailable
- Route top-level `rewrite`/`explanation` fields are deterministic index-0 aliases to `alternatives[0]` — backward compat is a strict index, not a copy
- Unavailable contract strictly does NOT include `alternatives` field — test asserts `body.alternatives === undefined`
- voiceProfile is optional, sanitized via `sanitizeVoiceProfile` in route before passing to llm; empty string after sanitation is passed as `undefined`
- `buildMultiUserPrompt` prepends `buildRewriteContextBlock(sanitized, lang)` block ahead of the sentence prompt when voiceProfile is non-empty
- Integration mock must use `{ alternatives: [...] }` format (not bare object) since route now calls `generateAlternativeSuggestions` not `generateSingleSuggestion`
- Banned phrase patterns in guardrails.ts: `bypass` only matches `bypass (the )?(ai|detection|checker|tool)` — "bypass the detector" is NOT caught; use "bypass the AI checker" in tests
- 119 tests pass: 27 integration (suggestions-route) + 92 unit (suggestions)

## Task 4 – extend revised-analysis cache entries for alternatives (2026-04-02)

- `SuggestionCacheEntry` now has `alternatives?: SuggestionAlternative[]` plus `rewrite?`/`explanation?` as explicit alias fields
- `SUGGESTION_FETCH_SUCCESS` payload changed from `{ sentenceIndex, rewrite, explanation }` to `{ sentenceIndex, alternatives }` — consumers must pass the full array
- Reducer success branch: stores `alternatives`, then derives `rewrite = alternatives[0].rewrite` and `explanation = alternatives[0].explanation` — aliases are set at write-time, not read-time
- `SuggestionAlternative` type imported from `@/lib/suggestions/llm` — no duplication
- `SUGGESTION_FETCH_UNAVAILABLE` branch unchanged: only sets `{ status: 'success', unavailable: true }` — no `alternatives`/`rewrite`/`explanation`
- `ReviewPanel.tsx` dispatch updated minimally: `data.alternatives ?? [{ rewrite: data.rewrite, explanation: data.explanation }]` as fallback (defensive for old API shape)
- TypeScript passes clean (`npx tsc --noEmit` zero errors); 47 tests pass in target file
- The "Do NOT modify UI components" constraint required minimal exception: the dispatch call payload type must match the action union — one-line change to the payload construction only

## Task 5 – page-level voice-profile state (2026-04-02)

- Voice-profile state lives in `HomePage` as six independent `useState` calls: `voiceProfile`, `vpSelectedPresets`, `vpWritingSampleDraft`, `vpLoading`, `vpError`, `vpCopied`
- State intentionally separated from `useRevisedAnalysisState` hook — no coupling; upload `resetRevised()` never touches vp state
- `ReviewPanel` gains optional `voiceProfile?: string` prop; page passes `voiceProfile || undefined` (empty string → undefined, no empty-string prop)
- Hidden `<span data-testid="voice-profile-state" data-value={voiceProfile}>` placed in page JSX for test observability (aria-hidden, display:none)
- jsdom limitation: `new FormData(formElement)` does NOT pick up file inputs set via `fireEvent.change` or `Object.defineProperty(input, 'files', …)` — workaround: mock global `FormData` per-submit to return the desired file
- Pattern for FormData mock: `vi.stubGlobal('FormData', vi.fn().mockImplementation(...))` targeting the specific form element, then restore with `vi.unstubAllGlobals()` + re-stub fetch after
- `vi.mock('@/components/ReviewPanel', ...)` works correctly for prop capture tests; mock ReviewPanel writes `data-voice-profile` attribute for assertions
- 4 tests pass total (1 pre-existing + 3 new)
- The testing strategy required adding a simple clipboard permissions context stub to successfully mock and execute navigator.clipboard in playwright.
- The use of `Object.entries(PRESET_DESCRIPTORS) as [VoicePresetKey, string][]` cleanly provides typescript mapping to UI elements for object constant structures.
- The specific copy wording constraint must override the reusable `buildRewriteContextBlock` context if the task dictates an exact formulation. It's best to implement specific copy logic where needed instead of reusing unrelated LLM context-prompt functions.

## Task 7 – render alternatives in popover (2026-04-02)

- To preserve E2E selectors like `apply-suggestion-btn` while rendering multiple alternatives, I updated `ReviewPanel` to map over `cacheEntry.alternatives` and append indices to data-testids (e.g., `apply-suggestion-btn-0`).
- Updating data-testids in mapping operations requires cascading updates in E2E tests (`e2e/home.spec.ts`) to target the indexed suffix (`-0`, `-1`).
- Playwright's `postDataJSON()` allows easy inspection of the JSON body sent in requests, which is great for validating that optional fields like `voiceProfile` are correctly attached to outbound `/api/suggestions` requests when a voice profile is active.
- Defensive coding in `ReviewPanel.tsx` checks if `data.alternatives` exists in the fetch response and is an array before dispatching; otherwise it falls back to `{ rewrite, explanation }`. This aligns with the unified action payload we established in Task 4.

## Task 8 – lock unit and integration coverage (2026-04-02)

- Prior to task 8, all 5 target files already had strong baseline coverage (195 tests passing); task added 9 new targeted tests across 4 files.
- `generateAlternativeSuggestions` in llm.ts internally calls `buildMultiUserPrompt` which itself calls `sanitizeVoiceProfile` — double sanitization: once in route, once in prompt builder. Tests verify prompt body contains stripped content.
- To test prompt body content in unit tests, inspect `fetchMock.mock.calls[0][1].body` as JSON — messages[1].content is the user prompt.
- Legacy `{ rewrite, explanation }` payload shape normalized to `alternatives: [{ rewrite, explanation }]` at write-time in reducer. Tests confirm `viaLegacy` and `viaAlternatives` produce identical cache shapes.
- `SUGGESTION_FETCH_UNAVAILABLE` produces `{ status: 'success', unavailable: true }` with NO `alternatives`/`rewrite`/`explanation` — verified via `toBeUndefined()` assertions.
- Empty string `voiceProfile` in route is sanitized to `''`, then `'' || undefined` converts to `undefined`, so `buildMultiUserPrompt` receives no profile arg and emits no `Author voice profile:` block.
- 204 tests pass across 5 files after task 8: 95 unit (suggestions) + 50 unit (reducer) + 4 unit (homepage) + 28 integration (suggestions-route) + 27 integration (voice-profile-route).
- homepage.test.tsx required no new tests — existing 4 tests already cover voiceProfile prop propagation and state persistence.

## Task 9 – Playwright regression coverage (2026-04-02)

- `home.spec.ts` required no modifications — all existing tests already used `apply-suggestion-btn-0` (indexed) from Task 7 updates, and legacy `{ rewrite, explanation }` shapes still work via ReviewPanel fallback dispatch.
- `voice-rewrite.spec.ts` was fully rewritten: 4 pre-existing tests retained plus 4 new tests added (profile-aware 3-alt, no-profile fallback, apply-index-1, pasted-profile reuse).
- Shared `MOCK_FILE` constant and `uploadAndAnalyze` helper extracted at module level to eliminate repetition across 8 tests.
- `BASE_ANALYZE_RESPONSE` shared constant covers the common high-risk highlight scenario used by 6 of 8 tests; individual tests that need different analyze responses override `/api/analyze` inside the test body.
- For the pasted-profile-reuse test, both "Session A" and "Session B" run in the same Playwright page object (routes are registered before each `goto()`); `page.goto('/')` resets React state but preserves route mocks, so Session B routes are set up before the second navigation.
- `capturedRequestBody.voiceProfile == null || capturedRequestBody.voiceProfile === ''` assertion correctly handles both the case where the field is absent from the JSON body (undefined after parse) and the case where it is explicitly sent as empty string.
- `beforeEach` sets a default `/api/analyze` route; tests needing different analyze shapes register their own route which Playwright applies first (more-specific later registrations take priority), but in this file every test that overrides analyze registers it explicitly — no ambiguity.
- 23 tests pass total: 15 home.spec.ts + 8 voice-rewrite.spec.ts.

## F1 Remediation – contract compliance deltas (2026-04-02)

- F1 rejected on compliance deltas, not test failures — all 123 tests were already passing before remediation
- Korean copy-button output uses full-sentence form `당신의 목소리는 'content' 입니다.` (not just a colon-prefix); a dedicated `KOREAN_FULL_SENTENCE_WRAPPER` regex was required in `sanitizeVoiceProfile` to extract the body between single quotes
- 2-alt minimum: changing `safe.length === 0` → `safe.length < 2` in `generateAlternativeSuggestions` was the single-line enforcement needed
- Single-object LLM fallback (legacy format) now returns `null` because 1 alt < minimum; the test that previously asserted `result.length === 1` was updated to `expect(result).toBeNull()`
- E2E pasted-profile-reuse test used the wrong flow (pasting into writing sample then regenerating); correct plan flow is pasting directly into `voice-profile-textarea`
- `voice-profile-textarea` conditional render `{voiceProfile !== '' && ...}` prevented fresh-session paste reuse — removed so textarea is always visible


## F1 Compliance Audit Rerun – oracle (2026-04-02)

- Audit scope limited to the 3 prior compliance deltas from F1: Korean full-wrapper normalization, 2–3 alternatives success contract, and fresh-session paste reuse path.
- `sanitizeVoiceProfile` now handles the full Korean copied sentence form `당신의 목소리는 'content' 입니다.` via `KOREAN_FULL_SENTENCE_WRAPPER`, and unit tests cover both normal and extra-whitespace variants.
- `generateAlternativeSuggestions` now enforces success only when at least 2 safe alternatives survive guardrails (`safe.length < 2` => unavailable), with route/integration tests covering both 2–3 success and 1-alt failure.
- Fresh-session reuse now pastes directly into always-rendered `voice-profile-textarea`; Playwright verifies Session B fills that textarea with copied wrapper text and `/api/suggestions` receives `voiceProfile` from the pasted value.
- Required audit verification command passed on rerun: 157/157 Vitest tests and 8/8 Playwright tests.

## F2 Code Quality Review – APPROVE (2026-04-02)

### Verdict: APPROVE

### Verification Results (all pass)
- Lint: 0 errors, 3 warnings (all pre-existing: eslint config, postcss config, unused `_handle` in analyze route — none in new code)
- Typecheck: exits 0, zero errors
- Unit + Integration tests: 207/207 pass (97 unit suggestions, 50 unit reducer, 4 unit homepage, 29 integration suggestions-route, 27 integration voice-profile-route)
- E2E tests: 23/23 pass (15 home.spec.ts, 8 voice-rewrite.spec.ts)

### Anti-Pattern Scan
- Zero `TODO`, `FIXME`, `HACK`, `@ts-ignore`, `as any`, `console.log` in `src/`, `tests/`, or `e2e/`

### Contract Integrity
- Unavailable contract (`route.ts` lines 86–89): `{ available: false, sentenceIndex }` — no `rewrite`, `explanation`, or `alternatives` fields; verified via `toBeUndefined()` in `suggestions-route.test.ts`. STRICT ✅
- Alias contract (`route.ts` lines 91–97): `rewrite = alternatives[0].rewrite`, `explanation = alternatives[0].explanation` — deterministic index-0 mapping; integration test explicitly asserts `body.rewrite === body.alternatives[0].rewrite`. CORRECT ✅
- 2-alt minimum (`llm.ts` line 284): `safe.length < 2 => return null` — triggers unavailable; integration test covers 1-safe-alt => unavailable. ENFORCED ✅
- `voiceProfile` optional (`route.ts` lines 72–84): sanitized via `sanitizeVoiceProfile`, empty string → `undefined`; verified no `Author voice profile:` in LLM prompt on empty string. CORRECT ✅

### Sanitizer/Prompt Safety
- `sanitizeVoiceProfile`: handles both English/Korean wrapper prefixes AND full Korean sentence form `당신의 목소리는 '...' 입니다.` via `KOREAN_FULL_SENTENCE_WRAPPER` regex; caps at 2000 chars after stripping. ✅
- `buildProfileGenerationPrompt`: explicit "Do NOT mention AI detection, evasion, or scores" in both EN and KO prompts. ✅
- `buildMultiUserPrompt`: double-sanitizes voiceProfile (once in route, once in prompt builder via `sanitizeVoiceProfile`). ✅
- `applyGuardrails`: applied per-alternative. Banned patterns cover: `avoid detection`, `bypass (ai|detection|checker|tool)`, `undetectable`, `fool the AI`, `lower your score`, `cheat`, `evade`, `defeat`, `trick`. ✅

### Reducer Semantics
- `SUGGESTION_FETCH_SUCCESS` payload: discriminated union — accepts new `alternatives` array OR legacy `{ rewrite, explanation }`; reducer normalizes to `alternatives` at write-time. ✅
- `SUGGESTION_FETCH_UNAVAILABLE`: sets `{ status: 'success', unavailable: true }` only — no `alternatives`/`rewrite`/`explanation`. ✅
- `APPLY_REPLACEMENT`, `REMOVE_REPLACEMENT`, `deriveRevisedText`: unchanged from pre-plan code. ✅
- `ReviewPanel.tsx` defensive fallback: if `data.alternatives` absent, falls back to legacy dispatch `{ rewrite, explanation }`. ✅

### Test Quality
- Unit tests: 97 tests covering sanitizer (16 cases), language detection (5), preset descriptors (4), prompt builders (12+), LLM service (20+), alternatives generation (12+) — all assert specific values, not just "truthy". HIGH ✅
- Integration tests: 29 suggestions-route tests include exact unavailable contract verification with `toBeUndefined()`, explicit alias equality, prompt content inspection via `fetchMock.mock.calls[0][1].body`. HIGH ✅
- Reducer tests: 50 tests include `legacy payload produces identical shape to single-item alternatives payload` cross-check. HIGH ✅
- E2E: 23 tests — voiceProfile forwarded in request body, apply index 1 (not 0) verified via `revisedPayload` capture, paste-reuse flow verified across session boundary. HIGH ✅

### Minor Observations (non-blocking)
- `VoiceProfilePanel.tsx`: `vpSelectedPresets: string[]` type is slightly loose vs. the `VoicePresetKey` union, but only valid keys can be selected in practice (preset chips rendered from `PRESET_DESCRIPTORS` entries) and route validates incoming keys independently.
- `ReviewPanel.tsx`: `void (action as never)` default case in reducer is correct TypeScript exhaustion pattern.
- `voice-profile-state` hidden span (`page.tsx`): test seam only, `aria-hidden="true"` and `display:none` — no accessibility issue.

## F3 Real Manual QA – APPROVE (2026-04-02)

### Verdict: APPROVE

### E2E Suite (automated)
- `npm run test:e2e -- e2e/home.spec.ts e2e/voice-rewrite.spec.ts`: **23/23 PASS** (15 home.spec.ts + 8 voice-rewrite.spec.ts)

### Manual Browser QA (9 interactive scenarios via Playwright chromium)
All 9 manual QA scenarios executed via automated browser interaction against the running dev server (port 3001); confirmed with console.log evidence per scenario:

| # | Scenario | Selector Evidence | Observed Outcome |
|---|----------|-------------------|-----------------|
| QA-1 | Upload → voice-profile-panel visible | `voice-profile-panel` | Not visible before upload; visible after `submit-button` click ✅ |
| QA-2 | Generate from presets only | `voice-preset-academic`, `generate-voice-profile-btn`, `voice-profile-textarea` | Textarea shows 'Preset-only generated profile.' ✅ |
| QA-3 | Generate from sample text | `voice-sample-input`, `generate-voice-profile-btn`, `voice-profile-textarea` | Textarea shows 'Sample-based generated profile.' ✅ |
| QA-4 | Edit profile text | `voice-profile-textarea.fill(...)` | Textarea accepts free edits ✅ |
| QA-5 | Copy profile text | `copy-voice-profile-btn`, `voice-profile-status` | Status shows 'Copied!'; clipboard = 'Your voice profile is: Copyable profile text.' ✅ |
| QA-6 | Fresh-session paste into `voice-profile-textarea` | `voice-profile-textarea` always visible | textarea.fill(copied) → suggestion request body contains `voiceProfile = 'Your voice profile is: Session A profile.'` ✅ |
| QA-7 | Click highlight → 3 alternatives | `highlight-score`, `suggestion-alternative-{0,1,2}`, `apply-suggestion-btn-{0,1,2}` | All 3 alternatives + apply buttons visible in popover ✅ |
| QA-8 | Apply index 1 → revised-analysis correct | `apply-suggestion-btn-1`, `revised-panel-section`, `revised-overall-score` | alt[1].rewrite sent to `/api/analyze/revised`; NOT alt[0]; score=30.0% AI; Low Risk highlight ✅ |
| QA-9 | No-profile fallback | `highlight-score`, `suggestion-alternative-{0,1}` | voiceProfile=undefined in request body; alternatives rendered ✅ |

### Console Error Check
- Zero runtime errors captured during full flow: upload → generate profile → edit → click highlight → apply index 1 → revised panel visible
- `page.on('console', ...)` + `page.on('pageerror', ...)` monitoring: `consoleErrors = []` ✅

### Key Conformance Points Verified
- `voice-profile-textarea` is always rendered (not conditionally hidden) — fresh-session paste works ✅
- Clipboard wrapper format: `'Your voice profile is: {profile}'` for English ✅
- `sanitizeVoiceProfile` strips wrapper before sending to LLM (verified by `sessionBRequestBody.voiceProfile === copied` — raw wrapper value passed, sanitized inside API) ✅
- Non-zero alternative index (`apply-suggestion-btn-1`) correctly propagates alt[1].rewrite (not alt[0]) to revised analysis ✅
- 2-minimum alt enforcement: route returns `available: false` when < 2 safe alternatives (covered by existing e2e suite) ✅

## F4 Scope Fidelity Audit (2026-04-02)

- Verdict: APPROVE — all 12 must-have and all 6 must-not-have requirements fully satisfied.
- Authenticity framing: system prompts and UI copy use "improve essay authenticity" language; no evasion/bypass/score framing anywhere in src/; `guardrails.ts` BANNED_PATTERNS actively filters output with 10 regex patterns.
- Three setup modes: `isValidRequest` + `hasAtLeastOneInputSource` accept presets-only, sample-only, or mixed; `VoiceProfilePanel` UI exposes all three paths.
- Editable profile: `voice-profile-textarea` is always rendered (not conditional on generation), directly editable; used for paste-in reuse in fresh sessions.
- Copy-only reuse: zero localStorage/sessionStorage/cookie/IndexedDB in src/; homepage test asserts no storage calls; no server-side profile storage.
- Unavailable contract: `{ available: false, sentenceIndex }` only — `SuggestionUnavailableResponse` type has no alternatives field; verified in integration tests.
- Backward compat aliases: `rewrite`/`explanation` at route top level = `alternatives[0]`; reducer handles legacy `{ rewrite, explanation }` payload via union type.
- apply/revert/rescore unchanged: `applySentenceReplacement` → `APPLY_REPLACEMENT` → `revisedAnalysisReducer` path untouched; `api/analyze/revised/route.ts` has zero voice-profile references.
- No third-party state/form/overlay libs: grep of package.json and src/ returns zero matches for zustand/redux/jotai/formik/react-hook-form/radix-ui/framer-motion.
- No i18n/detection packages: Hangul heuristic implemented via inline Unicode regex in voiceProfile.ts per plan constraint.
- Voice-profile state survives upload: vp* state lives in separate useState calls in page.tsx; resetRevised() dispatches only to revisedAnalysisReducer, leaving vp state intact.
- Scope creep observation: 4 extra e2e specs (task4-qa, evidence-screenshots, f3-qa-screenshots, task8-regression) from prior plan sessions exist in e2e/; these are test artifacts only with zero app behavior impact — not a scope violation.
- "Copy for AI Tools" button label is neutral (no detection/evasion framing); helper text says "copy it to use in other AI tools" — within authenticity-assistance frame.

## F2 Code Quality Review (Re-run after F1 Remediation) – APPROVE (2026-04-02)

### Verdict: APPROVE

### Verification Results (all pass)
- Lint: 0 errors, 3 warnings (all pre-existing: eslint.config.mjs anonymous default, postcss.config.mjs anonymous default, `_handle` unused in analyze route — **none in new code**)
- Typecheck: exits 0, zero errors
- Unit + Integration tests: **207/207 pass** (97 unit suggestions, 50 unit reducer, 4 unit homepage, 29 integration suggestions-route, 27 integration voice-profile-route)
- E2E tests: **23/23 pass** (15 home.spec.ts, 8 voice-rewrite.spec.ts)

### Contract Integrity Verified (fresh inspection)
- `/api/suggestions` unavailable contract (`route.ts` lines 86–89): `{ available: false, sentenceIndex }` — `SuggestionUnavailableResponse` type has no `alternatives`, `rewrite`, or `explanation` fields. Three integration tests assert `toBeUndefined()` on all three fields under: missing key, LLM failure, and all-banned-alternatives paths. STRICT ✅
- Success alias contract (`route.ts` lines 91–97): `rewrite = alternatives[0].rewrite`, `explanation = alternatives[0].explanation` — deterministic index-0 mapping enforced via `SuggestionAvailableResponse` type; integration test `top-level rewrite and explanation are aliases to alternatives[0]` asserts both field equality AND literal value match. CORRECT ✅
- 2-alt minimum (`llm.ts` line 284): `safe.length < 2 => return null` triggers unavailable. Single-safe-alt integration test covers this path. ENFORCED ✅
- `voiceProfile` optional: `route.ts` lines 72–84 sanitize via `sanitizeVoiceProfile`; empty string → `''` → falsy `||` converts to `undefined`; integration test `empty string voiceProfile behaves identically to absent voiceProfile` asserts no `Author voice profile:` block in LLM user prompt. CORRECT ✅

### Sanitizer/Prompt Safety (fresh inspection)
- `sanitizeVoiceProfile` (`voiceProfile.ts`): handles English WRAPPER_PATTERNS (9 regexes, prefix-anchored), AND full Korean sentence form `당신의 목소리는 '...' 입니다.` via `KOREAN_FULL_SENTENCE_WRAPPER` (`/^당신의\s*목소리는\s*'(.*)'\s*입니다\.\s*$/s`); caps at 2000 chars after stripping. ✅
- `buildProfileGenerationPrompt` (`voiceProfile.ts`): both EN and KO prompts contain explicit "Do NOT mention AI detection, evasion, or scores" / "감지 회피나 AI 점수에 대한 언급은 절대 하지 마세요". ✅
- `buildMultiUserPrompt` (`llm.ts` line 54): calls `sanitizeVoiceProfile` again — double sanitization; empty result → no `Author voice profile:` block. ✅
- `applyGuardrails` (`guardrails.ts`): 10 BANNED_PATTERNS cover `avoid detection`, `bypass (the )?(ai|detection|checker|tool)`, `undetect(able|ed)`, `fool the AI`, `make it look/seem human`, `lower score`, `cheat detector`, `evade detection`, `defeat detector`, `trick detector`. Applied per-alternative in `generateAlternativeSuggestions`. ✅

### Reducer Semantics (fresh inspection)
- `SUGGESTION_FETCH_SUCCESS` accepts discriminated union: new `alternatives: SuggestionAlternative[]` shape OR legacy `{ rewrite, explanation }` shape (lines 196–199); reducer normalizes to `alternatives` at write-time and sets `rewrite`/`explanation` as index-0 aliases. ✅
- `SUGGESTION_FETCH_UNAVAILABLE`: sets `{ status: 'success', unavailable: true }` only — no `alternatives`/`rewrite`/`explanation` (line 221). ✅
- `APPLY_REPLACEMENT`, `REMOVE_REPLACEMENT`, `deriveRevisedText`, `hasAppliedReplacements`: unchanged from pre-plan code, no voice-profile coupling. ✅
- `ReviewPanel.tsx` defensive dispatch fallback (lines 93–103): if `data.alternatives` absent from response, falls back to legacy `{ rewrite, explanation }` dispatch — backward compat preserved. ✅

### Test Adequacy (fresh inspection)
- Unit (97 tests in suggestions.test.ts): sanitizer 16 cases (wrapper strip, Korean full-sentence, max-length), language detection 5, preset descriptors 4, prompt builders 12+, LLM service 20+, alternatives generation 12+ — all assert specific string values. HIGH ✅
- Integration suggestions-route (29 tests): exact `toBeUndefined()` on unavailable contract fields; `body.rewrite === body.alternatives[0].rewrite` alias equality; `userContent` prompt body inspection; 1-safe-alt => unavailable; all-banned => unavailable. HIGH ✅
- Integration voice-profile-route (27 tests): presets-only, sample-only, mixed success; languageHint override; Korean detection; writing sample clamping; wrapper stripping; 8 validation edge cases; 3 503 degradation cases. HIGH ✅
- Reducer (50 tests): covers new-shape + legacy-shape producing identical cache entries; all 3 alternatives preserved; all prior APPLY/REMOVE/deriveRevisedText scenarios green. HIGH ✅
- E2E (23 tests): voiceProfile forwarded in request body; apply index 1 (not 0) verified via captured revised API payload; paste-reuse flow across session boundary; no-profile fallback; preset-max-2 enforcement. HIGH ✅

### Anti-Pattern Scan (re-confirmed)
- Zero `TODO`, `FIXME`, `HACK`, `@ts-ignore`, `as any`, `console.log` in `src/`, `tests/`, or `e2e/`. ✅

### Minor Observations (non-blocking, same as previous F2 pass)
- `VoiceProfilePanel.tsx`: `vpSelectedPresets: string[]` slightly loose vs. `VoicePresetKey` union — non-issue in practice as only valid keys are rendered as chips.
- `ReviewPanel.tsx` default case: `void (action as never)` is correct TypeScript exhaustion pattern.
- `voice-profile-state` hidden span: test seam, aria-hidden, display:none — no accessibility concern.
