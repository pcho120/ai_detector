# F2 Code Quality Review

**Date:** 2026-03-30  
**Reviewer:** Sisyphus (F2 Code Quality Review Task)  
**Verdict:** ✅ APPROVE

---

## Scope Coverage

| Area | Files Reviewed | Test Coverage Checked |
|------|---------------|----------------------|
| Upload/Validation | `src/lib/files/validate.ts` | `tests/unit/validate.test.ts` |
| Temp Lifecycle | `src/lib/files/temp.ts` | `tests/unit/temp.test.ts` |
| .docx Extraction | `src/lib/files/docx.ts` | `tests/unit/docx.test.ts` |
| .doc Extraction | `src/lib/files/doc.ts` | `tests/unit/doc.test.ts`, `tests/unit/doc-mocked.test.ts` |
| Error Types | `src/lib/files/errors.ts` | (used across all unit tests) |
| Detection Adapter | `src/lib/detection/sapling.ts`, `types.ts` | `tests/unit/detection.test.ts` |
| Highlight Spans | `src/lib/highlights/spans.ts` | `tests/unit/highlights.test.ts` |
| Suggestions | `src/lib/suggestions/rule-based.ts`, `guardrails.ts`, `types.ts`, `noop.ts` | `tests/unit/suggestions.test.ts` |
| Route/Orchestration | `src/app/api/analyze/route.ts` | `tests/integration/analyze-route.test.ts` |
| UI | `src/app/page.tsx`, `src/components/ReviewPanel.tsx` | `tests/unit/homepage.test.tsx`, `e2e/home.spec.ts` |
| Config | `tsconfig.json`, `vitest.config.ts`, `package.json`, `.env.example` | — |

---

## Anti-Pattern Scan Results

| Pattern | Result |
|---------|--------|
| `as any` in `src/` | ✅ None found |
| `@ts-ignore` / `@ts-nocheck` | ✅ None found |
| `console.log` / `console.warn` in `src/` | ✅ None found |
| Empty catch blocks `catch {}` | ✅ None found |
| `dangerouslySetInnerHTML` | ✅ None found |
| `SAPLING_API_KEY` in `.next/static/` | ✅ 0 matches (secret not in client bundle) |
| `process.env.SAPLING_API_KEY` outside server route | ✅ Only in `route.ts` (server-only) |

---

## LSP Diagnostics

| File | Errors | Warnings | Hints |
|------|--------|----------|-------|
| `src/app/api/analyze/route.ts` | 0 | 0 | 0 |
| `src/lib/files/validate.ts` | 0 | 0 | 0 |
| `src/lib/files/temp.ts` | 0 | 0 | 0 |
| `src/lib/files/docx.ts` | 0 | 0 | 0 |
| `src/lib/files/doc.ts` | 0 | 0 | 0 |
| `src/lib/detection/sapling.ts` | 0 | 0 | 0 |
| `src/lib/highlights/spans.ts` | 0 | 0 | 0 |
| `src/lib/suggestions/rule-based.ts` | 0 | 0 | 0 |
| `src/lib/suggestions/guardrails.ts` | 0 | 0 | 0 |
| `src/components/ReviewPanel.tsx` | 0 | 0 | 0 |
| `src/app/page.tsx` | 0 | 0 | **1 hint** (see below) |
| `tests/integration/analyze-route.test.ts` | 0 | 0 | 0 |
| `tests/unit/detection.test.ts` | 0 | 0 | 0 |

**page.tsx hint:** `React.FormEvent` is marked `@deprecated` in React 19 types (TS hint 6385, line 12). Does not block compilation or runtime. Cosmetic only — React 19 prefers inferring from the event handler pattern directly.

---

## Security & Privacy Findings

### ✅ PASS — SAPLING_API_KEY Not in Client Bundle
Verified via `grep -rn "SAPLING_API_KEY" .next/static/ | wc -l` → **0 matches**.  
Key is accessed only in `src/app/api/analyze/route.ts` which declares `export const runtime = 'nodejs'`.

### ✅ PASS — Provider Error Messages Not Leaked
`sapling.ts` surfaces only `HTTP ${response.status}` in `DETECTION_FAILED` messages. No provider `msg` field is included. Tested explicitly in `detection.test.ts` line 231 with a simulated postgres connection string.

### ✅ PASS — File Paths Not Leaked in Error Responses
`toErrorResponse()` in `errors.ts` returns `{error, message}` only. No path, stack, or OS information included. Tested in `analyze-route.test.ts` line 414.

### ✅ PASS — No dangerouslySetInnerHTML
`ReviewPanel.tsx` uses JSX array accumulation with `text.slice()` for highlight rendering. No HTML injection vector.

### ✅ PASS — Text Returned in API Response is Intentional
`AnalysisSuccessResponse` includes `text` to enable correct highlight offset rendering. Documented in `decisions.md` (Task 8 section). No server-side persistence detected. No `console.log` of `text` in source.

### ✅ PASS — No Temp Files in Happy Path
Route invokes `extractDocx(buffer)` and `extractDoc(buf)` directly — no temp file created in the normal flow. `withTempFile` is available but not needed.

### ✅ PASS — Temp File Cleanup on Exception Path
`withTempFile` uses `try/finally` guaranteeing cleanup even on callback throw. Tested in `temp.test.ts` line 97.

### ✅ PASS — cleanup rethrows non-ENOENT errors
`deleteTempFile` only swallows `ENOENT` (file already gone). All other FS errors (e.g., `EACCES`, `EPERM`) are rethrown. Tested via `chmod 000` real-FS test in `temp.test.ts` line 58.

---

## Correctness Findings

### ✅ PASS — File Validation Order is Correct
Magic-byte check occurs AFTER extension and MIME checks, then extension/magic agreement enforced. Prevents spoofed-extension bypass. Security invariant maintained.

### ✅ PASS — isGarbled Unicode Correctness
`docx.ts` uses `\p{L}\p{N}` with `u` flag — captures all Unicode letters/numbers, preventing false-positive EXTRACTION_FAILED on Cyrillic/non-Latin text. The `[a-zA-Z0-9]` prefix in the char class is redundant (a subset of `\p{L}\p{N}`) but harmless.

### ✅ PASS — isEnglish Threshold
`route.ts` uses basic-Latin / extended-Latin ratio ≥ 0.6. French text (with accented chars) passes correctly. Purely accented text without any basic-Latin letters fails — returns UNSUPPORTED_LANGUAGE. Acceptable edge case (such text is unlikely for essays).

### ✅ PASS — Overlapping Span Handling
`ReviewPanel.tsx` uses `Math.max(highlight.start, currentIndex)` for both `start` and `end`. Tested manually: overlapping spans render without duplicated or missing characters. Key values (`text-${i}` and `hl-${i}`) are unique due to different prefixes.

### ✅ PASS — Detection Score Convention Consistency
Score convention `0 = human, 1 = AI-like` is consistent across `types.ts`, `sapling.ts`, `spans.ts`, and tested against both directions (`sapling-human-like.json` and `sapling-ai-like.json` fixtures).

### ✅ PASS — Garbled Check Order Difference (doc vs docx)
`docx.ts` normalizes whitespace before garbled check; `doc.ts` checks garbled on rawBody before normalization. The difference is benign — the control-char heuristic is not affected by whitespace normalization since the normalized chars (\\r\\n, \\t, spaces) are not in the `[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]` range.

### ✅ PASS — HTTP Status Code Semantics
`503` for missing API key (config error), `502` for Sapling runtime failure, `422` for all user-input errors. Correct RESTful semantics.

### ✅ PASS — Suggestion Guardrails Only on Output
`applyGuardrails` is a post-processing filter on static hardcoded strings that cannot contain evasion language. All 12 coaching rules' `rewriteHint` and `explanation` strings were validated as passing guardrail patterns cleanly.

---

## Maintainability Findings

### ⚠️ LOW — Stale Comment in `suggestions/types.ts`
**File:** `src/lib/suggestions/types.ts` line 4  
**Text:** `"Task 9 will supply the real LLM-backed implementation."`  
Task 9 is complete and uses `RuleBasedSuggestionService` (no LLM). The comment is now misleading.  
**Severity:** LOW — cosmetic. Does not affect correctness.

### ⚠️ LOW — Redundant Char Class in `docx.ts` `isGarbled`
**File:** `src/lib/files/docx.ts` line 27  
**Code:** `/[a-zA-Z0-9\p{L}\p{N}]/gu`  
`[a-zA-Z0-9]` is a subset of `\p{L}\p{N}`. Redundant but harmless.  
**Severity:** LOW — style/cleanup.

### ℹ️ NOTE — Guardrail Gap for Novel Evasion Language
**File:** `src/lib/suggestions/guardrails.ts`  
Patterns like `"escape detection"`, `"game the detector"`, `"outsmart the AI"`, `"make your text look natural"` are not covered. This is a non-blocking issue because:
1. Current suggestions are static hardcoded strings that cannot trigger these.
2. Guardrails only become critical if/when the service switches to LLM-generated output.  
**Severity:** LOW for current implementation. Would be MEDIUM if LLM suggestions were added.

---

## Test Quality Findings

### ⚠️ LOW — Bare try/catch Pattern in validate.test.ts (7 tests)
**File:** `tests/unit/validate.test.ts`  
**Lines:** 56–63, 67–74, 88–95, 97–105, 121–128, 130–137, 139–147  
**Pattern:** Tests use `try { fn(); } catch (err) { expect(err.code).toBe(X); }` without a prior `expect(() => fn()).toThrow()` guard.  
If the function does NOT throw, the catch block never runs, and the test passes vacuously (false-pass).  
**Current reality:** All 7 cases DO throw in practice, so the assertions run and the tests catch real regressions. However, if a regression removes the `throw`, the test would pass silently instead of failing.  
**Comparison:** `validate.test.ts` lines 34–42 show the correct pattern (toThrow guard + try/catch for code check).  
**Severity:** LOW — test fragility, not correctness. Not blocking.

### ⚠️ LOW — Bare try/catch Pattern in doc-mocked.test.ts (7 tests)
**File:** `tests/unit/doc-mocked.test.ts`  
**Lines:** 26–35, 37–46, 48–59, 61–70, 72–84, 86–97, 99–108  
Same fragility pattern as above.  
**Severity:** LOW — same reasoning.

### ✅ PASS — Integration Test Coverage
`analyze-route.test.ts` covers all critical paths:
- 200 success (docx + doc)
- 400 missing file
- 422 unsupported format, spoofed extension, TEXT_TOO_SHORT, EXTRACTION_FAILED, UNSUPPORTED_LANGUAGE
- 502 Sapling failure
- 503 missing API key
- No secret leakage in error response
- Suggestions populated and clean of evasion language

### ✅ PASS — E2E Coverage
`e2e/home.spec.ts` covers: happy path (docx), happy path (doc), extraction failure, unsupported format, language error. Uses `page.route` mocking for determinism.

---

## Privacy Policy Compliance

| Policy Requirement | Status |
|-------------------|--------|
| No persistence of essay text beyond request | ✅ No DB writes, no disk persistence, temp files cleaned up |
| English-only enforcement | ✅ `isEnglish()` gate in route |
| 5MB file limit | ✅ Enforced in `validate.ts` (MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024) |
| 100k char max | ✅ Enforced in `docx.ts` and `doc.ts` |
| 300 char min | ✅ Enforced in both extraction modules |
| Risk-review framing (not definitive claim) | ✅ PRIVACY.md + README both include disclaimer |

---

## Summary of All Findings

| # | Severity | Category | Finding |
|---|----------|----------|---------|
| 1 | ✅ NONE | Security | No `as any`, `@ts-ignore`, `console.log`, or `dangerouslySetInnerHTML` |
| 2 | ✅ NONE | Security | SAPLING_API_KEY not in client bundle |
| 3 | ✅ NONE | Security | Provider errors not leaked in responses |
| 4 | ✅ NONE | Security | File paths not leaked in responses |
| 5 | ✅ NONE | Security | Temp files always cleaned up (try/finally) |
| 6 | ✅ NONE | Correctness | Detection score convention consistent |
| 7 | ✅ NONE | Correctness | Overlapping span handling in ReviewPanel correct |
| 8 | ✅ NONE | Correctness | isGarbled Unicode handling correct after Task 7 fix |
| 9 | ✅ NONE | Correctness | HTTP status semantics correct (503/502/422) |
| 10 | ⚠️ LOW | Maintainability | Stale comment in `suggestions/types.ts` (LLM reference) |
| 11 | ⚠️ LOW | Maintainability | Redundant `[a-zA-Z0-9]` in isGarbled regex |
| 12 | ⚠️ LOW | Maintainability | Guardrail coverage gap for novel evasion phrasing |
| 13 | ⚠️ LOW | Test Quality | 7 tests in `validate.test.ts` use bare try/catch (false-pass risk) |
| 14 | ⚠️ LOW | Test Quality | 7 tests in `doc-mocked.test.ts` use bare try/catch (false-pass risk) |
| 15 | ℹ️ INFO | LSP | `React.FormEvent` deprecated hint in `page.tsx` (React 19 cosmetic) |

**No blocking (HIGH or CRITICAL) findings.**

---

## Verdict

**✅ APPROVE**

The implementation is correct, secure, and maintainable for its stated scope. All security and privacy invariants are upheld. Type safety is strict with zero LSP errors. The 14 LOW-severity findings are all cosmetic or test quality issues that do not affect production behavior. The happy path and all error paths are covered by unit, integration, and E2E tests.

**Actionable follow-up (non-blocking):**
- Fix `validate.test.ts` and `doc-mocked.test.ts` bare try/catch tests to use `expect(() => fn()).toThrow()` + `rejects.toMatchObject()` patterns (consistent with the correct tests already in the same file).
- Update the stale comment in `suggestions/types.ts` line 4.
- Consider broadening guardrail patterns if/when LLM-backed suggestions are introduced.
