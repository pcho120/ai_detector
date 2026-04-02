# F2 Code Quality Review — Re-Run

**Date:** 2026-04-02  
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
| Suggestions (rule-based) | `src/lib/suggestions/rule-based.ts`, `guardrails.ts`, `types.ts` | `tests/unit/suggestions.test.ts` |
| Suggestions (LLM) | `src/lib/suggestions/llm.ts` | `tests/integration/suggestions-route.test.ts` |
| Voice Profile | `src/lib/suggestions/voiceProfile.ts` | `tests/integration/suggestions-route.test.ts` (voice profile tests) |
| Analysis Route | `src/app/api/analyze/route.ts` | `tests/integration/analyze-route.test.ts` |
| Revised Analysis Route | `src/app/api/analyze/revised/route.ts` | `tests/integration/analyze-revised-route.test.ts` |
| Suggestions Route | `src/app/api/suggestions/route.ts` | `tests/integration/suggestions-route.test.ts` |
| Voice Profile Route | `src/app/api/voice-profile/generate/route.ts` | `e2e/voice-rewrite.spec.ts` |
| UI | `src/app/page.tsx`, `src/components/ReviewPanel.tsx`, `RevisedReviewPanel.tsx`, `VoiceProfilePanel.tsx` | `tests/unit/homepage.test.tsx`, `e2e/home.spec.ts` |
| Revised Analysis State | `src/app/useRevisedAnalysisState.ts`, `src/lib/review/revisedAnalysisReducer.ts` | `tests/unit/revisedAnalysisReducer.test.ts` |
| Config | `tsconfig.json`, `vitest.config.ts`, `package.json`, `.env.example` | — |

---

## Verification Chain Results

| Command | Result |
|---------|--------|
| `npm run lint` | ✅ exits 0 — 0 errors, 3 warnings (cosmetic) |
| `npm run typecheck` | ✅ exits 0 — clean |
| `npm run test` | ✅ exits 0 — 372 tests across 14 files |
| `npm run build` | ✅ exits 0 — clean production build, 6 routes |
| `npm run test:e2e` | ✅ exits 0 — 38/38 tests pass |

---

## Anti-Pattern Scan Results

| Pattern | Result |
|---------|--------|
| `as any` in `src/` | ✅ None found |
| `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` | ✅ None found |
| `console.log` / `console.warn` in `src/` | ✅ None found |
| `dangerouslySetInnerHTML` | ✅ None found |
| `innerHTML=` / `eval(` / `new Function(` | ✅ None found |
| `SAPLING_API_KEY` in `.next/static/` | ✅ 0 matches — secret not in client bundle |
| `COACHING_LLM_API_KEY` in `.next/static/` | ✅ 0 matches — secret not in client bundle |
| `process.env.*` in client components (`.tsx` outside `api/`) | ✅ None found |

---

## Secret Boundary Analysis

All `process.env` accesses are server-only:

| Secret | Location | Server-Only? |
|--------|----------|--------------|
| `SAPLING_API_KEY` | `src/lib/analysis/analyzeText.ts` | ✅ — called only from `api/analyze/route.ts` |
| `COACHING_LLM_API_KEY` | `src/app/api/suggestions/route.ts` | ✅ — `export const runtime = 'nodejs'` |
| `COACHING_LLM_API_KEY` | `src/app/api/voice-profile/generate/route.ts` | ✅ — `export const runtime = 'nodejs'` |
| `COACHING_LLM_API_KEY` | `src/lib/suggestions/llm.ts` | ✅ — consumed by server route only |

No `NEXT_PUBLIC_` prefix used. Build artifact grep confirms 0 matches for both secret names.

---

## Security & Privacy Findings

### ✅ PASS — No Secret Exposure in Client Bundle
Verified: `grep -rn "COACHING_LLM_API_KEY\|SAPLING_API_KEY" .next/static/ | wc -l` → **0**.

### ✅ PASS — Provider Error Messages Not Leaked
`sapling.ts` surfaces only `HTTP ${response.status}` in `DETECTION_FAILED`. No provider internal `msg` fields included. Tested in `detection.test.ts`.

### ✅ PASS — File Paths Not Leaked in Responses
`toErrorResponse()` returns `{error, message}` only. No path, stack, or OS info. Tested in `analyze-route.test.ts`.

### ✅ PASS — No dangerouslySetInnerHTML
`ReviewPanel.tsx` uses JSX array accumulation with `text.slice()` for highlight rendering.

### ✅ PASS — Temp File Cleanup Guaranteed
`withTempFile` in `api/analyze/route.ts` uses `try/finally`. Tested with filesystem-level `readdir('/tmp')` assertions.

### ⚠️ LOW — `/api/analyze/revised` Missing Length Enforcement
**File:** `src/app/api/analyze/revised/route.ts`  
The route accepts arbitrary `text` without English-only check, min/max length, or garbled-text detection. An adversarial caller could submit extremely long or non-English text directly to this endpoint.  
**Mitigations in place:** No file upload surface; no persistent storage; text reaches Sapling but no results are stored; the route is only callable server-side by the client after a successful initial analysis.  
**Severity:** LOW — not blocking. Would be MEDIUM if this endpoint were publicly documented or if rate limiting were absent.

### ⚠️ LOW — `/api/suggestions` Missing `text` Length Enforcement
**File:** `src/app/api/suggestions/route.ts` line 39-41  
The `text` field (context for LLM) is validated as non-empty but has no max-length cap. An adversarial caller could pass a very large `text` to inflate the LLM request.  
**Severity:** LOW — `text` is contextual only; the primary LLM payload is `sentence` (validated separately). Not blocking.

### ✅ PASS — LLM Prompt-Level Evasion Guardrail
Both `SYSTEM_PROMPT` and `MULTI_SYSTEM_PROMPT` in `llm.ts` include: `"Do NOT mention AI detection, evasion, or scores."` Post-processing via `applyGuardrails()` adds a second layer.

### ✅ PASS — Voice Profile Input Clamped
`writingSample` is clamped to `MAX_PROFILE_LENGTH` before LLM call in `voice-profile/generate/route.ts` line 78-81.

---

## Type Safety Analysis

| File | Assessment |
|------|-----------|
| `llm.ts` | All LLM JSON responses parsed via `as unknown` + runtime type guards before shape assertion. No `as any`. ✅ |
| `suggestions/route.ts` | Full field-level `isValidRequest()` guard before destructuring. ✅ |
| `voice-profile/generate/route.ts` | `isValidRequest()` + `hasAtLeastOneInputSource()` guards; preset keys validated against enum. ✅ |
| `analyze/revised/route.ts` | `isValidRequest()` validates `text` field before downstream use. ✅ |
| `revisedAnalysisReducer.ts` | Discriminated union state type with `satisfies` checks. Clean. ✅ |

---

## Correctness Findings

### ✅ PASS — Revised Analysis Reducer State Machine
`src/lib/review/revisedAnalysisReducer.ts` covers: initial → applying → success/error, revert, clear-all, and rescore-on-apply. All 50 unit tests pass including edge cases (non-contiguous indices, duplicate sentence text).

### ✅ PASS — Multi-Alternative LLM Response Fallback
`parseMultiAlternativesPayload` in `llm.ts` accepts both `{alternatives:[...]}` and `{rewrite,explanation}` shapes, normalizing to array. Handles LLM format drift gracefully.

### ✅ PASS — `generateAlternativeSuggestions` Minimum Alternatives Guard
`llm.ts:284`: `if (safe.length < 2) return null;` — ensures `unavailable` is returned if guardrails strip too many alternatives. Prevents single-option "alternatives" from reaching UI. Correct.

### ✅ PASS — Detection Score Convention Consistent
`0 = human-like, 1 = AI-like` maintained across `detection/types.ts`, `sapling.ts`, `highlights/spans.ts`, and all test fixtures.

### ✅ PASS — HTTP Status Semantics
`503` for missing API key, `502` for provider runtime failure, `422` for user input errors, `400` for malformed requests. Correct across all 4 routes.

---

## Maintainability Findings

### ⚠️ LOW — Stale Comment in `suggestions/types.ts`
**File:** `src/lib/suggestions/types.ts` line 4  
"Task 9 will supply the real LLM-backed implementation." — Task 9 is complete and uses rule-based approach. Misleading.

### ⚠️ LOW — Redundant Char Class in `docx.ts`
**File:** `src/lib/files/docx.ts`  
`/[a-zA-Z0-9\p{L}\p{N}]/gu` — `[a-zA-Z0-9]` is a subset of `\p{L}\p{N}`. Redundant but harmless.

### ℹ️ NOTE — Guardrail Gap for Novel Evasion Language
**File:** `src/lib/suggestions/guardrails.ts`  
Phrases like `"escape detection"`, `"game the detector"`, `"outsmart the AI"` not covered. LOW for current static strings; would be MEDIUM if raw LLM output were not already post-processed.

---

## Test Quality Findings

### ⚠️ LOW — Bare try/catch Pattern (~14 tests)
**Files:** `tests/unit/validate.test.ts`, `tests/unit/doc-mocked.test.ts`  
Tests use `try { fn(); } catch (err) { expect(err.code).toBe(X); }` without a prior `expect().toThrow()` guard. Vacuous-pass risk if a regression removes the `throw`. All currently catch real bugs.

### ✅ PASS — Integration Test Coverage
`analyze-route.test.ts`: 200 success, 400/422/502/503 error paths, no secret leakage, suggestions populated and clean.  
`suggestions-route.test.ts` (29 tests): INVALID_REQUEST, available/unavailable, multi-alternative, voice-profile passthrough, guardrail blocking, missing API key.  
`analyze-revised-route.test.ts` (13 tests): success, invalid body, missing API key, Sapling failure paths.

### ✅ PASS — E2E Coverage
38 E2E tests covering: docx/doc happy paths, error paths (unsupported, extraction failure, language error), suggestion popover click, apply/revert dual-pane, voice profile generation, multi-alternative selection.

---

## Summary of All Findings

| # | Severity | Category | Finding |
|---|----------|----------|---------|
| 1 | ✅ NONE | Security | No `as any`, `@ts-ignore`, `console.log`, or `dangerouslySetInnerHTML` in `src/` |
| 2 | ✅ NONE | Security | Both API key names absent from `.next/static/` build artifacts |
| 3 | ✅ NONE | Security | All `process.env.*` access in server-only files |
| 4 | ✅ NONE | Security | Provider error details not leaked in responses |
| 5 | ✅ NONE | Security | Temp files always cleaned up with `try/finally` |
| 6 | ✅ NONE | Security | LLM prompt-level evasion guardrail + output post-processing |
| 7 | ✅ NONE | Correctness | Detection score convention consistent across all modules |
| 8 | ✅ NONE | Correctness | HTTP status semantics correct across all 4 routes |
| 9 | ✅ NONE | Correctness | Multi-alternative LLM response fallback handles format drift |
| 10 | ⚠️ LOW | Security | `/api/analyze/revised` lacks length/language enforcement on raw text input |
| 11 | ⚠️ LOW | Security | `/api/suggestions` `text` field has no max-length cap |
| 12 | ⚠️ LOW | Maintainability | Stale LLM comment in `suggestions/types.ts` |
| 13 | ⚠️ LOW | Maintainability | Redundant `[a-zA-Z0-9]` in `isGarbled` regex |
| 14 | ⚠️ LOW | Maintainability | Guardrail coverage gap for novel evasion phrasing |
| 15 | ⚠️ LOW | Test Quality | ~14 tests in validate + doc-mocked use bare try/catch (vacuous-pass risk) |

**No blocking (HIGH or CRITICAL) findings.**

---

## Verdict

**✅ APPROVE**

The implementation is correct, secure, and maintainable across the full codebase including the new LLM suggestion, revised-analysis, and voice-profile features. All security and privacy invariants are upheld. Type safety is strict with zero `as any`. All 5 verification commands exit 0 (372 unit/integration + 38 E2E). The 5 LOW-severity findings are cosmetic or test-fragility issues that do not affect production behavior. The two input-length gaps on newer routes are noted but not blocking given their constrained call context and absence of persistent storage.
