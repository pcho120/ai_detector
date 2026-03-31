# Learnings — suggestion-preview-workflow

## Task 1 — sentenceIndex stable linkage (2026-03-31)

- `buildHighlightSpans` iterates with an explicit `idx` counter rather than destructuring, so the original array position is preserved regardless of output sort order.
- Output spans are sorted by `start` offset but `sentenceIndex` correctly refers back to the input `sentences[]` position — these are independent values.
- Duplicate sentence deduplication (via `lastMatchEnd` map) advances the search cursor per normalized key, so two identical sentences map to two distinct text offsets each with the correct input index.
- `AnalysisSuccessResponse.highlights` type updated inline in `route.ts` (not via a shared type alias) to match the `HighlightSpan` interface shape including `sentenceIndex`.
- e2e fixture mock updated to include `sentenceIndex` on highlight entries for forward compatibility; e2e tests don't type-check the mock JSON but consistency avoids silent drift.

## Task 2 — on-demand suggestion endpoint (2026-03-31)

- `POST /api/suggestions` route lives in `src/app/api/suggestions/route.ts`; it accepts `{ sentenceIndex, sentence, score }` and returns `{ available: true|false, sentenceIndex, ...rewrite fields }`.
- `generateSingleSuggestion` in `src/lib/suggestions/llm.ts` is the main public seam for the route — it calls OpenAI chat completions and applies `applyGuardrails` before returning.
- The `LlmSuggestionService` class satisfies the existing `SuggestionService` contract and works as a batch service; `generateSingleSuggestion` is the targeted single-sentence variant used by the new endpoint.
- Missing/empty `COACHING_LLM_API_KEY` causes `generateSingleSuggestion` to return `null` immediately; the route serialises this as `{ available: false, sentenceIndex }` — no error status, no broken flow.
- LLM JSON responses may be wrapped in markdown code fences; `parseRewritePayload` strips them with a regex before `JSON.parse`.
- `applyGuardrails` runs at two levels: inside `LlmSuggestionService.suggest()` (batch) and inside `generateSingleSuggestion` (single shot) — both paths enforce the safety filter.
- Bare `catch {}` blocks used throughout `llm.ts` so empty bindings don't trigger the `@typescript-eslint/no-unused-vars` linting warning.
- `RuleBasedSuggestionService` and its existing unit tests are unchanged; Task 2 adds a parallel LLM path rather than replacing the rule-based fallback.

## Task 3 — reducer-based revised-analysis state (2026-03-31)

- `revisedAnalysisReducer` and `deriveRevisedText` live in `src/lib/review/revisedAnalysisReducer.ts` — pure functions with no React dependency, making them trivially unit-testable.
- `useRevisedAnalysisState` hook lives in `src/app/useRevisedAnalysisState.ts` — thin React wrapper (`useReducer`) that also computes `derivedRevisedText` and `hasReplacements` as memoization-free derived values.
- `page.tsx` replaces the old `useState<AnalysisSuccessResponse>` pair with `useRevisedAnalysisState`; `result` is read from `revisedState.originalResult` so all existing JSX and upload behavior remains structurally identical.
- `SET_ORIGINAL_RESULT` resets the entire revised workflow when a new upload succeeds — prevents stale drawer/cache state leaking across documents.
- `REMOVE_REPLACEMENT` uses a `delete` on a shallow copy rather than destructuring, avoiding the `@typescript-eslint/no-unused-vars` warning that destructuring would trigger for the discarded key.
- `deriveRevisedText` works at sentence granularity (index-based, not offset-based), making it immune to the offset-drift problem that arises with in-place text mutation.
- Duplicate sentence text is handled correctly because the replacement map keys are sentence indices, not sentence text — two identical sentences at indices 0 and 1 have fully independent replacement slots.

### Task 4 Learnings
- Using `position: relative` on an inline `span` works well to anchor a `position: absolute` popover right below the beginning of the selected sentence wrap.
- Reducer state handling for on-demand fetch blends perfectly with `page.tsx` maintaining the overall lifecycle. Passing the destructured state `UseRevisedAnalysisStateReturn` to `ReviewPanel` correctly decouples the layout from the top-level form submission flow.

## Task 5 — revised-analysis endpoint and right-side revised panel (2026-03-31)

- `analyzeText.ts` in `src/lib/analysis/` exports both `analyzeText(text, adapter)` and `createAnalysisDetectionAdapter()` as separate functions, so the route can preserve the 503 vs 502 HTTP status distinction (missing API key vs runtime detection failure) without losing the shared pipeline.
- The original `route.ts` had the distinction baked into two try/catch blocks; extracting to a shared helper required splitting adapter creation out so the route can catch `FileProcessingError` from adapter creation separately from `analyzeText()` itself.
- `POST /api/analyze/revised` accepts `{ text: string }` JSON and reuses `analyzeText` — the full detection → highlights → suggestions pipeline runs fresh on the revised text.
- `RevisedReviewPanel` is intentionally presentation-only: no interaction handlers, no suggestion popover — it shows revised score + revised highlight spans from the server response only.
- `triggerRevisedAnalysis` was added to `useRevisedAnalysisState` as a `useCallback`-wrapped async function that dispatches `REVISED_ANALYSIS_START/SUCCESS/ERROR` reducer actions, keeping side-effects out of the reducer itself.
- `ReviewPanel.handleApply` computes the next replacement map inline (before the reducer dispatch is flushed) to derive `revisedText` synchronously, avoiding a stale-closure problem that would arise from reading `derivedRevisedText` from state after dispatch.
- The dual-pane layout in `page.tsx` conditionally uses `lg:flex-row` when `revisedResult || revisedLoading || revisedError` — single-column before first Apply, side-by-side on larger screens after.
- `max-w-7xl` replaces `max-w-3xl` to give the dual-pane layout sufficient horizontal room.
- `RevisedReviewPanel` shows a `revised-loading` spinner, a `revised-error` block, or the full rescored text — the `result` prop accepts a zero-value fallback when `revisedResult` is null while `revisedLoading` is true.

## Task 6 — precise apply + cumulative rescoring (2026-03-31)

- Task 6 found the core logic (index-keyed `appliedReplacements`, inline `nextReplacements` computation, `deriveRevisedText`) was already wired correctly by Task 5. Task 6's work was therefore confirmation + test coverage rather than new implementation.
- The `handleApply` inline `nextReplacements` pattern (`{ ...state.appliedReplacements, [sentenceIndex]: rewrite }`) is the canonical way to derive cumulative text before React state is flushed; this ensures every rescoring call receives the full accumulated replacement set.
- `deriveRevisedText` maps over `originalResult.sentences` by index — this is inherently duplicate-safe because two sentences with identical text have distinct array positions and therefore distinct replacement slots.
- New unit test describe blocks `Task 6: apply flow — cumulative text derivation` and `Task 6: apply flow — duplicate sentence safety` validate the entire accumulation chain and duplicate-index independence at the pure-function level, without requiring React rendering.
- Two new e2e tests added: `multiple applies accumulate` verifies the revised-analysis request payload contains both replacements after two sequential applies; `duplicate sentence text` verifies the payload contains only the clicked occurrence's replacement, not both duplicates.
- Stale dev server at port 3001 caused all e2e tests to show `element not found` errors — killing the stuck process and letting Playwright restart the server resolved the issue. Not a code bug.

### Task 7 (Click-to-Revert)
- Sentence highlights in the API response include "low" risk labels too, not just "high"/"medium". This means even if a rewritten sentence scores perfectly (low risk), it still has an associated highlight element in the UI, making it a viable target for a click listener to revert.
- In Reducer-managed state, doing local logic (like checking `Object.keys(nextReplacements).length > 0`) inside the UI component (`page.tsx`) to decide whether to trigger a rescore or just collapse the panel works well and avoids complicated side effects inside the pure reducer.

## Task 8 — regression coverage and documentation (2026-03-31)

- By the time Task 8 ran, all required Playwright scenarios (click-to-open, apply, revised panel render, multi-apply, revert, revised-analysis failure, no-safe-suggestion) were already implemented in `home.spec.ts` (tasks 4–7) and `task4-qa.spec.ts` (task 4).
- The only genuine gap was a **medium-label** scenario — high and low were covered but medium was not explicitly exercised with an assertion on the label text. Added `e2e/task8-regression.spec.ts` with the medium-risk test plus the full dual-pane happy-path regression test.
- The full dual-pane test intentionally mirrors the task-8 QA scenario from the plan and produces screenshot evidence at `.sisyphus/evidence/task-8-dual-pane-regression.png`.
- Unit tests (265), integration tests, and e2e tests (22) all pass with lint and typecheck clean.
- README updated with a single concise bullet under Core Features noting that rewritten suggestions require both `SAPLING_API_KEY` and `COACHING_LLM_API_KEY`, plus a deployment note listing both keys.

## F1 Compliance Fix (2026-03-31)

- F1 rejection had three categories: (1) missing `text` field in `/api/suggestions` request contract, (2) eager suggestion precomputation in `analyzeText.ts`, (3) missing plan-named evidence artifacts.
- The plan (task 2 spec) requires `/api/suggestions` to accept "the analyzed document text plus the clicked sentence's sentenceIndex, sentence text, and score" — `text` was always required by the plan but missing from the implementation.
- `analyzeText.ts` was calling `RuleBasedSuggestionService` eagerly for every analyze/revised request. The plan's Must NOT states: "Must NOT precompute full rewritten suggestions for every labeled sentence during initial file upload". Removing this while keeping `suggestions: []` in the response shape preserves backward compatibility.
- Tests that previously asserted `suggestions.length > 0` from the analyze route were incorrect w.r.t. the plan — they were replaced with assertions that the suggestions array is always empty (on-demand semantics).
- `ReviewPanel.tsx` fetch body now includes `text: result.text` to satisfy the updated contract.
- Evidence artifacts for tasks 1, 5, 7, 8 were produced by running targeted unit/integration tests (for text artifacts) and by a dedicated `e2e/evidence-screenshots.spec.ts` spec (for PNG artifacts).
- All 267 unit/integration tests and 26 e2e tests pass after changes; lint, typecheck, and build clean.
