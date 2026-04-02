## Task 1 – voiceProfile helpers (2026-04-01)

- Chose module-level `const` exports (no class) to match existing llm.ts / guardrails.ts style and keep API surface minimal
- `WRAPPER_PATTERNS` array kept private (not exported) — downstream tasks should call `sanitizeVoiceProfile()`, not apply raw patterns themselves; this keeps the stripping logic encapsulated
- Only one wrapper prefix stripped per call (break after first match) to avoid double-stripping edge cases; simplest deterministic contract
- Hangul heuristic uses regex with Unicode escapes rather than external i18n package — per MUST NOT DO constraint; acceptable accuracy for EN/KO profiles
- `getPresetDescriptor` throws `TypeError` on unknown key (fail-fast) rather than returning undefined, so downstream tasks get immediate type feedback during dev
- `buildProfileGenerationPrompt` explicit safety instruction ("Do NOT mention AI detection, evasion, or scores") mirrors same guardrail intent as SYSTEM_PROMPT in llm.ts
- Korean prompt fragment authored in-file (no i18n library) — sufficient for a fixed set of coach instructions; no dynamic translation needed
- Kept `MAX_PROFILE_LENGTH` as exported const so downstream callers can reference the limit for UI validation without duplicating the magic number

## Task 2 – voice-profile/generate route (2026-04-01)

- Returned 503 (not 200 with degraded payload) for missing API key: voice-profile has no "unavailable" concept like suggestions; a 503 gives downstream callers a clear retry signal
- Language resolution: hint beats heuristic beats default — makes tests deterministic when preset-only requests are sent
- Kept `callProfileGeneration` as a module-private function (not exported) — same pattern as `callChatCompletions` in llm.ts; internals stay hidden
- Reused `sanitizeVoiceProfile` from voiceProfile.ts to strip LLM wrapper prefixes; avoids duplicating stripping logic in route
- Writing sample is clamped before LLM call (not after): prevents sending oversized prompts; profile length is clamped by sanitizeVoiceProfile after
- `resolveLanguage` is a separate pure helper — testable in isolation, keeps POST handler slim
- No guardrails applied to profile text (unlike rewrite suggestions): profile describes voice traits, not a rewrite; no rewrite = no guardrail concern

## Task 3 – multi-alternative suggestions + voiceProfile (2026-04-02)

- Separate `MULTI_SYSTEM_PROMPT` (not reusing single-rewrite prompt): different JSON shape requires different instruction; mixing would confuse the LLM
- `callChatCompletionsMulti` is a new private function alongside `callChatCompletions` — keeps single-suggestion path intact for `LlmSuggestionService.suggest()`
- Route replaced `generateSingleSuggestion` call with `generateAlternativeSuggestions` entirely — single path is kept in llm.ts for potential future use but not exposed via route
- voiceProfile sanitization happens in route (not in llm function) — consistent with task-1/2 patterns where the route/caller is responsible for input preparation
- Empty voiceProfile string (after sanitization) passed as `undefined` to LLM function — avoids triggering voice context block for empty/whitespace-only profiles
- `SuggestionAlternative` type exported from llm.ts and re-used in route's `SuggestionAvailableResponse` — avoids type duplication
- Unavailable response shape left completely unchanged: no `alternatives` field when unavailable, per strict contract requirement

## Task 4 – extend revised-analysis cache entries for alternatives (2026-04-02)

- Aliases `rewrite`/`explanation` stored at write-time (in reducer) rather than computed at read-time — avoids optional-chaining on every consumer, keeps read paths identical to legacy code
- `SuggestionAlternative` imported from llm.ts instead of redefined — single source of truth for the shape, avoids type drift
- `SUGGESTION_FETCH_SUCCESS` payload narrowed to `{ sentenceIndex, alternatives }` only — forces callers to always provide the full array; alias fields are reducer responsibility not caller responsibility
- Fallback in ReviewPanel dispatch (`?? [{ rewrite, explanation }]`) retained for defensive compatibility if future API versions omit `alternatives` — should be removed when all consumers are confirmed up-to-date

## Task 4 retry – scope enforcement (2026-04-02)

- `SUGGESTION_FETCH_SUCCESS` payload typed as union of both shapes (new `alternatives` array AND legacy `{ rewrite, explanation }`) — allows reducer to be extended without forcing any consumer change outside scope
- Reducer normalizes legacy payload into `alternatives` at write-time via `'alternatives' in action.payload` discriminant — single reducer branch handles both paths cleanly
- `ReviewPanel.tsx` reverted to identical pre-Task4 state (git diff shows zero changes) — legacy dispatch shape `{ sentenceIndex, rewrite, explanation }` continues to compile and work via the union payload
- Scope discipline: action union design must always consider existing consumers before narrowing payload types, to avoid forced out-of-scope changes

## Task 5 – page-level voice-profile state (2026-04-02)

- Six separate `useState` calls (not a single object) to match the existing `isSubmitting`/`error` pattern in page.tsx — minimal, explicit, no abstraction
- State prefixed `vp*` to namespace from existing upload state — readable, clearly scoped for Task 6 integration
- `voiceProfile || undefined` passed to ReviewPanel: converts empty string to undefined so ReviewPanel prop is either a non-empty string or absent — clean signal for Task 6 conditional rendering
- Hidden `data-testid="voice-profile-state"` span chosen over a test wrapper or exported setter: simplest testable seam with zero behavior impact; aria-hidden ensures screen readers ignore it
- `FormData` global mock required due to jsdom limitation: the mock is scoped to the submit helper, restored immediately after `waitFor`, then fetch is re-stubbed — tight scope prevents pollution between assertions
- `ReviewPanel.tsx` comment "`// optional for fallback if needed`" removed when adding `voiceProfile` prop; comment was unnecessary
- Added VoiceProfilePanel to separate the voice-profile UI state inputs from the rest of the page, ensuring readability and strict test boundaries.
- Decided to execute the clip-boarding copy logic on the client side at the click event by re-detecting language, to avoid needing to sync API response languages if the user manually typed text afterwards.

## Task 7 – render alternatives in popover (2026-04-02)

- Updated ReviewPanel `renderPopover` to iterate over `cacheEntry.alternatives` using map, rendering 2-3 alternatives instead of a single rewrite block.
- Maintained exact same `applySentenceReplacement` rescore semantics by passing `alt.rewrite` directly into the existing `handleApply` function.
- Numbered data-testids (`suggestion-alternative-X`, `apply-suggestion-btn-X`) enable precise targeting in E2E tests without breaking the presence of `suggestion-success`, `suggestion-empty`, and `suggestion-popover`.
- Safely fell back to dispatching `{ rewrite, explanation }` in `ReviewPanel.tsx` if `data.alternatives` is unexpectedly missing from the API response.
- Updated `e2e/home.spec.ts` assertions to target `apply-suggestion-btn-0` explicitly and verify the new `suggestion-alternative-*` list items render successfully.
- Added a specific test in `e2e/voice-rewrite.spec.ts` to ensure that `voiceProfile` is submitted in the request body to `/api/suggestions`.

## F1 Remediation – contract compliance deltas (2026-04-02)

- `KOREAN_FULL_SENTENCE_WRAPPER` regex checked first (before prefix `WRAPPER_PATTERNS`) in `sanitizeVoiceProfile` — order matters because the full-sentence form also starts with `당신의 목소리는` which would partially match a prefix pattern
- Chose `safe.length < 2` (strict minimum 2) rather than `safe.length < 1` to enforce the 2–3 alternatives contract from the plan
- `copy-voice-profile-btn` gained `disabled={!voiceProfile}` when textarea became always-visible — prevents copying empty string to clipboard
- New 1-alt → unavailable integration test uses a single clean (non-banned) alternative to prove it's the count, not the content, that triggers unavailable
