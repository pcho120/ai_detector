# Issues

- Node.js/npm are not installed in the current environment, blocking dependency installation and all required verification commands.
- The unit test used JSX without an explicit React import, causing the initial Vitest failure until fixed.
- The app page component also required an explicit React import to satisfy the current runtime configuration.

## Task 2 Fix — MIME cross-contamination & unlink error swallowing

- Original `validate.ts` used a flat `ALLOWED_MIME_TYPES` set shared across both formats. This allowed `.docx` files submitted with `application/msword` (and vice versa) to pass validation. Fixed by switching to a per-extension MIME map (`ALLOWED_MIME_TYPES_BY_EXT`).

- Original `temp.ts` `deleteTempFile` catch block swallowed all errors. An `EPERM` or `ENOSPC` on unlink would silently pass, hiding real cleanup failures. Fixed to only swallow `ENOENT`.

- `vi.spyOn` cannot be used on ESM native module exports (`node:fs/promises`) — they are non-configurable. `vi.doMock` + `vi.importActual` also does not compose correctly for this (importActual bypasses the mock). The working approach is a real filesystem test: create a directory, `chmod 000` on it, attempt unlink of a file inside it — this produces a genuine `EACCES` error without any mocking.

## Task 5 — Detection Adapter (2026-03-30)

- Initial sapling.ts implementation included the provider `msg` field in the `DETECTION_FAILED` error message string. This was a security/privacy leak: provider internal error messages (e.g., database connection strings, internal service names) could surface to callers. Fixed by removing the `hint` variable entirely — only the HTTP status code is surfaced. A test caught this during the implementation run.

## Task 7 — Analysis Route & Orchestration Pipeline (2026-03-30)

- UNSUPPORTED_LANGUAGE integration test initially used a Cyrillic DOCX fixture. The `isGarbled()` heuristic in `extractDocx` rejected it as `EXTRACTION_FAILED` before the language check ran, because Cyrillic has zero ASCII alphanumeric chars. Fixed by updating `isGarbled()` to use Unicode property escapes (`\p{L}\p{N}` with `u` flag) so all Unicode letters/numbers count as valid printable content.
- ESLint reports `no-unused-vars` on `_sentences` in `NoopSuggestionService.suggest()` even though the `_` prefix is the conventional "intentionally unused" marker. This is a Warning (not error) and does not block the build. Root cause: ESLint config does not set `argsIgnorePattern: '^_'` for `no-unused-vars`. Accepted as-is since it is intentional (noop service by design).

## Task 9 — Suggestion Guardrails (2026-03-30)

- Initial `bypass` regex was `bypass\s+(ai|detection|checker|tool)` — too narrow. "bypass the checker" was not caught because of the article "the". Fixed by making the article optional: `bypass\s+(the\s+)?(ai|detection|checker|tool)`.
- Test assertions on explanation text failed because regex/case sensitivity: `'Delve' is a strong…` starts with uppercase D (inside curly quotes). Test must use `.toContain('Delve')`, not `.toContain('delve')`.

## F2 Code Quality Review (2026-03-30)

### LOW: Bare try/catch test pattern in validate.test.ts (7 tests)
**File:** `tests/unit/validate.test.ts`  
**Lines:** 56–63, 67–74, 88–95, 97–105, 121–128, 130–137, 139–147  
These tests use `try { fn(); } catch (err) { expect(err.code) }` without a preceding `expect(() => fn()).toThrow()` guard. If the function stops throwing, the test passes vacuously. The correct pattern (used in lines 34–42 of the same file) is: `expect(() => fn()).toThrow(FileProcessingError); try { fn(); } catch (err) { expect(err.code).toBe(X); }`.  
Action: Fix by adding `expect(() => fn()).toThrow(FileProcessingError)` before each try/catch block.

### LOW: Bare try/catch test pattern in doc-mocked.test.ts (7 tests)
**File:** `tests/unit/doc-mocked.test.ts`  
**Lines:** 26–35, 37–46, 48–59, 61–70, 72–84, 86–97, 99–108  
Same fragility pattern. Correct pattern for async: `await expect(fn()).rejects.toBeInstanceOf(FileProcessingError)` then separately assert `.code`.  
Action: Convert to `rejects.toMatchObject({ code: 'X' })` pattern.

### LOW: Stale comment in suggestions/types.ts
**File:** `src/lib/suggestions/types.ts` line 4  
Comment says "Task 9 will supply the real LLM-backed implementation" — Task 9 is complete and uses rule-based approach, not LLM.  
Action: Update comment to reflect current implementation.

## F3 — Manual QA Observations (2026-03-30)

- No defects found. All happy and failure paths behave correctly.
- Minor note: The E2E test at line 8 asserts `getByRole('button', { name: /submit/i })` — the actual button text is "Submit for Review", not "Submit". The regex `/submit/i` matches as a substring so the test passes, but the test assertion is slightly loose. Not a defect.
- Playwright MCP browser tool is configured for `/opt/google/chrome/chrome` which is not installed in this environment. All browser-level QA was executed via `require('@playwright/test')` CJS script with headless Chromium from the playwright cache.


## F1 — Plan Compliance Audit Blockers (2026-03-30)
- Task 1 reject: acceptance criterion ``npm run test:e2e` exits 0 with a placeholder home-page smoke test` is not satisfied in the current repo state; Playwright timed out after Next switched from port 3000 to 3001.
- Task 3 reject: acceptance criterion `Empty, image-only, corrupted, and password-protected .docx fixtures return structured extraction failures` is not fully satisfied/evidenced; the repo lacks image-only and password-protected `.docx` fixtures.
- Task 7 reject: acceptance criterion `Temp-file cleanup is verified on both success and failure paths` is not satisfied; the route never calls the temp-file lifecycle utilities.
- Task 8 reject: acceptance criterion `Successful upload displays highlighted spans with data-ai-score attributes and visible risk labels` is not satisfied; risk labels are tooltip-only, not visible text.
- Task 9 reject: acceptance criterion `Suggestion output is limited to sentence-level coaching objects linked to analyzed sentences` is not satisfied; suggestion objects have no sentence ID/linkage field, and the implementation is rule-based rather than the required LLM-backed service.
- Mandatory evidence gap: required task evidence artifacts are missing for Task 1 and Tasks 4-10.

## F1 — Task 9 Linkage Blocker Resolved (2026-03-30)

- **Root cause**: `SuggestionService.suggest()` accepted `string[]` with no positional metadata. The route discarded the sentence index when building the high-risk list (`detectionResult.sentences.filter(...).map(s => s.sentence)`).
- **Resolution**: Added `SentenceEntry { sentence, index }` input contract and `sentenceIndex: number` output field on `Suggestion`. Route now maps before filtering to preserve original indices.
- **No regressions**: All 174 tests pass. `applyGuardrails` generic parameter transparently preserves the new field.

- **Resolved**: `image-only.docx` and `password-protected.docx` fixtures created in `tests/fixtures/`.
- `image-only.docx` is a valid docx ZIP with drawing element only (no text), causes empty-extraction path.
- `password-protected.docx` is an OLE2 CFBF file (D0 CF 11 E0 magic), causes mammoth ZIP-parse failure.
- 4 new test assertions added to `tests/unit/docx.test.ts` covering both missing cases with strict `code: 'EXTRACTION_FAILED'` shape.
- All 167 tests green.

## F1 Re-audit Reject — 2026-03-31
- REJECTED: required evidence artifacts remain misaligned for Tasks 1, 3, 4, 5, 6, 7, 8, 9, and 10.
- `task-1-scaffold.txt` does not show the required baseline boot/build/test commands.
- `task-3-docx-extraction-error.txt` is stale relative to current `image-only.docx` and `password-protected.docx` coverage.
- `task-4-doc-extraction-error.txt` cites nonexistent `extractText(...)` coverage and the wrong verification shape.
- `task-5-detection-adapter-error.txt` does not evidence the required timeout/429 failure scenario.
- `task-6-highlight-spans-error.txt` documents unrelated `TEXT_TOO_SHORT` behavior instead of the empty-sentence-results case.
- `task-7-analysis-route-error.txt` omits the required oversized-content proof and no-downstream-call proof.
- `task-8-review-ui.png` does not show the required highlighted review state.
- `task-9-suggestions.txt` / `task-9-suggestions-error.txt` do not match the required route-seam and guardrail evidence scenarios.
- `task-10-ci-docs.txt` / `task-10-ci-docs-error.txt` do not match the required CI-equivalent verification and secret-bundle evidence.

## F1 Re-audit 2 Reject — 2026-03-31
- Remaining blocker: `.sisyphus/evidence/task-7-analysis-route-error.txt:53-54` is factually wrong about the non-English test setup.
- Actual test setup at `tests/integration/analyze-route.test.ts:321-323` sets `process.env.SAPLING_API_KEY = 'test-key';` before submitting the non-English docx.
- Because F1 requires strict evidence integrity, this single false statement is still blocking approval.

## F1 Final Verdict — 2026-03-31
- Previously listed evidence blockers are now fully resolved.
- No remaining Task 1-10 compliance blocker found after re-checking `.sisyphus/evidence/task-7-analysis-route-error.txt:53-56` against `tests/integration/analyze-route.test.ts:321-323`.
