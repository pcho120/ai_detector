# Issues — suggestion-preview-workflow

## Task 1 — sentenceIndex stable linkage (2026-03-31)

- No blockers encountered. Existing `buildHighlightSpans` loop was trivially extended with an index counter.
- `AnalysisSuccessResponse.highlights` was typed as an inline `Array<{...}>` literal in `route.ts` rather than importing `HighlightSpan` — kept as-is to avoid unnecessary import churn; both representations are kept in sync.

## Task 2 — on-demand suggestion endpoint (2026-03-31)

- Initial `catch (_)` bindings in `llm.ts` triggered the `@typescript-eslint/no-unused-vars` lint warning; fixed with bare `catch {}` blocks (valid in TypeScript 4+ / ES2019+).
- The `isValidRequest` type-guard needed explicit `as number` cast on the `sentenceIndex >= 0` comparison because TypeScript cannot narrow from `in` checks on `unknown` to numeric comparisons without an explicit cast.
- No blockers. `RuleBasedSuggestionService` and existing analyze route remain entirely unchanged.

## Task 3 — reducer-based revised-analysis state (2026-03-31)

- `_removed` destructuring in `REMOVE_REPLACEMENT` triggered `@typescript-eslint/no-unused-vars`; fixed by using a shallow copy + `delete` instead.
- `const _exhaustive: never = action` exhaustiveness guard also triggered the same warning; replaced with `void (action as never)` which satisfies TypeScript's narrowing without introducing an unused binding.
- No blockers. All 243 existing tests continue to pass. Upload shell behavior and existing error handling verified unchanged via `tests/unit/homepage.test.tsx`.

### Task 4 Issues
- The legacy Playwright tests heavily relied on the static "Review Suggestions" block at the bottom of the old `ReviewPanel`. Since this block was rendered irrelevant and replaced with the contextual click-to-open workflow, several tests had to be patched to simulate user clicks to inspect suggestion visibility.

## Task 5 — revised-analysis endpoint and right-side revised panel (2026-03-31)

- Splitting `analyzeText` helper to accept a pre-created `DetectionAdapter` (rather than creating it internally) was necessary to preserve the 503 vs 502 HTTP status distinction in the route. The original route used two try/catch blocks; merging into one call requires externalising adapter creation.
- The `isUnconfigured` check uses an exact message string match (`'Detection service is not configured.'`) — this is fragile but matches the pattern already used in the original route and keeps the shared helper free of HTTP-status logic.
- `handleApply` in `ReviewPanel` cannot rely on `state.appliedReplacements` after `applySentenceReplacement` dispatch because React state updates are not synchronous. Computing `nextReplacements` inline before dispatch avoids the stale-closure issue and correctly derives `revisedText` for the immediate trigger.
- No blockers. All 256 tests and 16 E2E tests pass. Build succeeds with zero errors.

## Task 6 — precise apply + cumulative rescoring (2026-03-31)

- Core apply logic was already correct from Task 5; Task 6 added targeted test coverage rather than new implementation.
- `let revisedCallBodies = []` triggered `prefer-const` lint error in the new e2e multi-apply test — fixed by changing to `const` (arrays are mutable even when bound to a `const`).
- Stale dev server at port 3001 (running stale `.next` build missing `./331.js`) caused all 17 e2e tests to fail with `element not found`. Solution: `kill -9 $(fuser 3001/tcp)` and re-run. No code change needed.
- No implementation blockers. All 265 unit/integration tests and 18 e2e tests pass. Build, lint, and typecheck clean.

- For the "click-to-revert" feature, when hovering over the "low risk" replaced text, it would be ideal to show a visual affordance (e.g. an "x" or a tooltip) indicating that it can be clicked to revert. This was added as a small tailwind `group-hover` absolute positioned "x" button to make it discoverable for users.

## Task 8 — regression coverage and documentation (2026-03-31)

- No blockers. All previously implemented scenarios already provided broad coverage; Task 8 only needed to add the medium-label e2e scenario and the full-path regression screenshot test.
- 22 e2e tests, 265 unit/integration tests, lint, and typecheck all pass clean.

## F1 Compliance Fix (2026-03-31)

- F1 rejected for three plan-contract gaps: missing `text` in suggestions request body, eager suggestion precomputation in `analyzeText.ts`, and missing named evidence artifacts.
- Tests for `analyze-route.test.ts` had three tests asserting `suggestions.length > 0` — these directly contradicted the plan's on-demand requirement. Required replacement with empty-array assertions.
- The `suggestions-route.test.ts` needed all 18 request bodies updated to include `text`; also added two new validation tests for the `text` field specifically.
- Evidence screenshot spec (`e2e/evidence-screenshots.spec.ts`) added to generate the 4 PNG artifacts required by the plan. This spec runs as part of `npm run test:e2e` (26 total tests now).
- No blockers encountered; all changes were straightforward contract corrections.
