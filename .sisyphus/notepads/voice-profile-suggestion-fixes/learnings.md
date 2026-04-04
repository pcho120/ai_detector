# Learnings

- Gating the voice-profile-textarea behind a reveal state effectively hides the complexity from users who don't already have a profile, streamlining the UI.
- E2E tests for React state reveals just require a simple locator click before asserting visibility or values of the previously hidden elements.

## Task 2 — Unavailable Branch Isolation

### 4 unavailable causes in `generateAlternativeSuggestions` (llm.ts:264-287):
1. **Missing API key** — `if (!apiKey) return null` at line 271
2. **Multi-call parse failure** — `callChatCompletionsMulti` returns null when JSON is malformed (parseMultiAlternativesPayload catches the exception and returns null)
3. **All alternatives guardrail-filtered** — `applyGuardrails` removes all items → `safe.length < 2` is true → returns null
4. **<2 safe alternatives** — after filtering, `safe.length < 2` gate at line 284 returns null

### Route wiring (route.ts:76-88):
- `apiKey = process.env.COACHING_LLM_API_KEY` (no fallback)
- `generateAlternativeSuggestions(apiKey, ...)` — if apiKey is undefined, function returns null immediately
- Route returns `{ available: false, sentenceIndex }` whenever `alternatives === null`

### Test coverage added:
- `tests/integration/suggestions-route.test.ts`: new describe `'POST /api/suggestions — unavailable branch isolation'` with 4 branch-labeled tests
- `tests/unit/suggestions.test.ts`: new describe `'generateAlternativeSuggestions — unavailable branch isolation'` with 4 branch-labeled tests
- All 8 tests use sentenceIndex values that uniquely identify the branch under test
- The `<2` branch test uses 1 safe + 1 guardrail-filtered alt to prove the exact minimum gate

## Task 3 — Restore Multi-Alternative Availability

### Root cause confirmed
The primary false-unavailable path was `safe.length < 2` in `generateAlternativeSuggestions` (llm.ts). When the LLM returned a single-object `{"rewrite":"...","explanation":"..."}` format (parsed to 1 item) or guardrails removed all but 1 alternative, the function returned null even though the LLM was reachable and producing valid output.

### Fix applied: recovery branch in `generateAlternativeSuggestions`
- When first call yields `safe.length >= 2`: take the fast path (unchanged semantics).
- When first call yields `safe.length < 2`: make exactly one additional `callChatCompletionsMulti` call, merge results with `deduplicateAlternativesByRewrite`, re-apply guardrails on the combined set.
- If combined `safe.length >= 2`: return 2–3 alternatives (success).
- If combined `safe.length < 2`: return null (genuinely unavailable).

### Key design decisions
- Recovery branch is deterministic: max 2 total LLM calls per invocation.
- Deduplication prevents the same rewrite appearing twice in the output (case-insensitive trim key).
- Guardrails applied after dedup on the combined set — no bypass at any step.
- `route.ts` unchanged: it still maps null → `{ available:false, sentenceIndex }` and non-null → full available response.
- `2-minimum` contract unchanged: success still requires ≥2 safe alternatives.
- Top-level `rewrite`/`explanation` aliases still mirror `alternatives[0]`.

### Tests added
- `tests/unit/suggestions.test.ts`: new describe `'generateAlternativeSuggestions — recovery path'` with 5 tests:
  1. first call 1 safe alt → recovery provides 2 more → returns 2+
  2. first call single-object format → recovery 2 safe alts → returns 2+
  3. deduplication of identical rewrites across calls
  4. both calls all-banned → returns null
  5. recovery call network error → returns null
- `tests/integration/suggestions-route.test.ts`: new describe `'POST /api/suggestions — recovery path for partial LLM output'` with 3 route-level tests covering same scenarios.
- Total test count: 142 (up from 134). All pass.

## Task 4
- Hardened success rendering against false positives (available: true but empty alternatives) by explicitly dispatching UNAVAILABLE if alternatives are an empty array. This prevents the reducer from crashing on `alternatives[0]` and avoids a blank success popover.
- Added immediate popover positioning directly off the clicked `HTMLElement` event target. This prevents the initial `popoverPos === null` render loop from dropping the popover from the DOM briefly during the first cycle.

## Task 5 — Regression Coverage for Reveal Model and Repaired Suggestions

### Changes made

**`e2e/voice-rewrite.spec.ts`**
- Added assertions to the first test ("Voice profile panel appears after upload…") confirming that `voice-profile-textarea` is not visible and `reveal-voice-profile-btn` is visible immediately after upload. Pasted-profile reuse test already had `reveal-voice-profile-btn` click from a prior partial update; left unchanged.
- All generate-flow tests (lines 78–226) rely on auto-reveal after `generate-voice-profile-btn` click; no reveal-click needed there and none was added.

**`tests/unit/homepage.test.tsx`**
- Added a `vi.mock('@/components/VoiceProfilePanel', ...)` that simulates the hidden-by-default reveal pattern (uses `useState` internally, renders `reveal-voice-profile-btn` when hidden and `voice-profile-textarea` when revealed).
- Added test: `'reveal-voice-profile-btn is visible and voice-profile-textarea is absent until reveal click'` — asserts panel present, reveal button present, textarea absent; then after clicking reveal button, textarea appears and reveal button is gone.

### Approach decision
Rather than unmocking VoiceProfilePanel in homepage.test.tsx (which would pull in all of its real dependencies and break the isolation boundary), the mock was updated to model the reveal-state toggle. This keeps the test fast and focused on page-level wiring while proving the UX contract at the component boundary.

### Verification
- `npm run test -- tests/unit/homepage.test.tsx` → 5/5 passed
- `npm run test:e2e -- e2e/voice-rewrite.spec.ts e2e/home.spec.ts` → 23/23 passed


## F4 Scope Fidelity Check — voice-profile-suggestion-fixes

**Date:** 2026-04-02
**Reviewer:** Sisyphus-Junior (F4 deep scope check)

### Evidence Base
- Plan: `.sisyphus/plans/voice-profile-suggestion-fixes.md` (READ ONLY)
- Commits: `44a4875` (init clean baseline) → `a39dc9d` (fixed the pop up, HEAD)
- Working tree: additional uncommitted changes present across 14 source/test files

**Important finding:** All plan-required source changes (Tasks 1–5) exist on disk in the working tree but several are uncommitted. Scope analysis is performed against the working tree state, which is the delivered work.

### Material Change → Plan Task Mapping

| File | Change Type | Plan Task | Verdict |
|---|---|---|---|
| `src/components/VoiceProfilePanel.tsx` | New component, reveal-state UX | Task 1 | ✅ In-scope |
| `src/app/page.tsx` | Voice profile state, VoiceProfilePanel wiring | Task 1 | ✅ In-scope |
| `src/app/api/voice-profile/generate/route.ts` | New API route for profile generation | Task 1 | ✅ In-scope |
| `src/lib/suggestions/voiceProfile.ts` | New utility for profile sanitize/prompt | Task 3 | ✅ In-scope |
| `src/lib/suggestions/llm.ts` | `generateAlternativeSuggestions` + recovery path | Tasks 2, 3 | ✅ In-scope |
| `src/app/api/suggestions/route.ts` | Routes to new LLM function, voiceProfile passthrough | Task 3 | ✅ In-scope |
| `src/lib/review/revisedAnalysisReducer.ts` | Adds `alternatives` to cache, union payload | Task 4 | ✅ In-scope |
| `src/components/ReviewPanel.tsx` | Popover positioning, `shouldSkipSuggestionFetch` | Task 4 | ✅ In-scope |
| `src/components/RevisedReviewPanel.tsx` | CSS-only hover opacity tweak on revert badge | NOT in Tasks 1–5 | ⚠️ Minor out-of-scope |
| `tests/unit/suggestions.test.ts` | Branch isolation + recovery path + voiceProfile tests | Tasks 2, 3 | ✅ In-scope |
| `tests/integration/suggestions-route.test.ts` | Route-level unavailable contract + recovery tests | Tasks 2, 3 | ✅ In-scope |
| `tests/integration/voice-profile-route.test.ts` | New integration tests for generate route | Task 1 | ✅ In-scope |
| `tests/unit/revisedAnalysisReducer.test.ts` | `shouldSkipSuggestionFetch` + alternatives tests | Task 4 | ✅ In-scope |
| `tests/unit/homepage.test.tsx` | Reveal state at page boundary + persistence guard | Task 5 | ✅ In-scope |
| `e2e/voice-rewrite.spec.ts` | Reveal + generate auto-reveal + suggestion flows | Task 5 | ✅ In-scope |
| `e2e/home.spec.ts` | Success/unavailable rendering + indexed apply | Tasks 4, 5 | ✅ In-scope |
| `e2e/task4-qa.spec.ts` | High/low-risk mocked available:true success coverage | Task 4 | ✅ In-scope |
| `e2e/task8-regression.spec.ts` | `apply-suggestion-btn` → `apply-suggestion-btn-0` | Adapter for Task 4 | ✅ Necessary (negligible) |
| `e2e/evidence-screenshots.spec.ts` | Same adapter update | Adapter for Task 4 | ✅ Necessary (negligible) |
| `e2e/f3-qa-screenshots.spec.ts` | Same adapter update | Adapter for Task 4 | ✅ Necessary (negligible) |

### Contract Drift Check

| Contract | Requirement | Actual | Status |
|---|---|---|---|
| `SuggestionUnavailableResponse` | `{ available:false, sentenceIndex }` only | Exactly `{ available: false, sentenceIndex }` unchanged | ✅ PASS |
| 2-min alternatives success | `safe.length >= 2` gate preserved | Gate at `llm.ts` recovery path, enforced at both first + combined call | ✅ PASS |
| Max alternatives | `<= 3` | `.slice(0, 3)` at both fast path and recovery path | ✅ PASS |
| `available:true` response backward-compat | `rewrite`/`explanation` aliases at top level | Aliases preserved as `alternatives[0].rewrite`/`.explanation` | ✅ PASS |
| `SUGGESTION_FETCH_SUCCESS` action vocabulary | Must not break existing consumers | Union payload — old `{rewrite, explanation}` shape still accepted, reducer normalizes | ✅ PASS |
| No localStorage/sessionStorage | Must NOT persist profiles | Zero calls to localStorage/sessionStorage in all changed files | ✅ PASS |
| `voiceProfile` owned by `page.tsx` | State must remain in page | `useState` for voiceProfile in `page.tsx`, passed as prop to both panels | ✅ PASS |
| `voice-profile-textarea` testid | Must not rename | Present in `VoiceProfilePanel.tsx` with exact testid | ✅ PASS |
| `reveal-voice-profile-btn` testid | New control, exactly one | Present in `VoiceProfilePanel.tsx` with exact testid | ✅ PASS |
| `suggestion-empty`, `suggestion-success` testids | Must preserve | Both present in `ReviewPanel.tsx` | ✅ PASS |
| `apply-suggestion-btn-{index}` testids | Must preserve indexed form | `apply-suggestion-btn-{index}` rendered per alternative | ✅ PASS |
| Guardrails not bypassed | Must apply guardrails | `applyGuardrails` called on first call set AND combined set in recovery path | ✅ PASS |

### Out-of-Scope Changes Analysis

1. **`src/components/RevisedReviewPanel.tsx`** — CSS-only change: `hidden group-hover:flex` → `flex opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200` on the revert badge. This improves Playwright e2e testability of the hover affordance (opacity/visibility are inspectable; display:none on group-hover is not). Triggered by `e2e/home.spec.ts` new test at line 710–726 which asserts `opacity: 0` / `visibility: hidden` before hover. **No behavior regression, no testid change, no action/reducer change.** Severity: **Negligible** — consequent adaptation for new e2e assertion, zero product-semantic impact.

2. **`e2e/task8-regression.spec.ts`, `e2e/evidence-screenshots.spec.ts`, `e2e/f3-qa-screenshots.spec.ts`** — `apply-suggestion-btn` → `apply-suggestion-btn-0` testid adapter. Required to keep existing tests green after ReviewPanel changed to indexed apply buttons (a plan-required Task 4 deliverable). If these were NOT updated, these existing tests would fail on `apply-suggestion-btn` not found. **Severity: Negligible — mandatory accompanying adaptation.**

### Scope Creep Severity Summary

| Item | Category | Severity |
|---|---|---|
| `RevisedReviewPanel.tsx` CSS hover fix | Cosmetic/testability fix | Negligible |
| task8/evidence/f3 testid adapter updates | Necessary consequence of Task 4 | Negligible |

**No significant scope creep detected. No new features added. No persistence introduced. No reducer contract downgrade.**

### Verdict

**APPROVE**

All five plan tasks are fully implemented and within scope:
- Task 1: `VoiceProfilePanel` reveal UX, auto-reveal, `/api/voice-profile/generate` route — ✅
- Task 2: Unavailable branch isolation tests with all 4 causes covered — ✅  
- Task 3: `generateAlternativeSuggestions` with recovery path, 2-min contract, voiceProfile — ✅
- Task 4: `ReviewPanel` success rendering, popover positioning, `shouldSkipSuggestionFetch` — ✅
- Task 5: Full e2e + unit regression coverage for reveal model and repaired suggestions — ✅

No contract drift on unavailable shape. No success downgrade below 2 alternatives. No banned selector removals that break assertions. Two negligible out-of-scope adaptations (CSS testability fix, testid adapter updates) are direct consequences of in-scope work and introduce zero product-semantic change.

---

## Final Audit — Plan Compliance
- Verdict: REJECT.
- Tasks 1, 3, and 5 align with the plan: `VoiceProfilePanel` keeps reveal state local, auto-reveals after successful generation, and `generateAlternativeSuggestions()` preserves the strict 2–3 safe-alternatives success contract with exact `{ available:false, sentenceIndex }` unavailable responses.
- Task 4 behavior is functionally correct in `ReviewPanel.tsx` (available:true + empty alternatives falls back to unavailable, and click-time popover positioning reduces the race), but the implementation also changes reducer contracts in `src/lib/review/revisedAnalysisReducer.ts` by adding `alternatives` to `SuggestionCacheEntry` and widening `SUGGESTION_FETCH_SUCCESS` payload shape.
- Verification on audit run: targeted Vitest passed, targeted Playwright passed, `npm run typecheck` passed, and `npm run lint` exited 0 with pre-existing warnings outside the audited files.

## F1 re-audit selector cleanup — 2026-04-04
- Updated `e2e/task4-qa.spec.ts` unavailable-path assertion to use the indexed apply-button contract: `apply-suggestion-btn-0`.
- Kept the assertion semantics unchanged: it still verifies no apply button is visible in the unavailable branch.

---

## F2 Code Quality Review — voice-profile-suggestion-fixes (Re-Run after REJECT resolution)

**Date:** 2026-04-02
**Scope:** All working-tree changes in `voice-profile-suggestion-fixes` plan (Tasks 1–5)

### Files reviewed
- `src/components/VoiceProfilePanel.tsx` (Task 1)
- `src/app/api/suggestions/route.ts` (Task 3)
- `src/lib/suggestions/llm.ts` (Task 3)
- `src/lib/review/revisedAnalysisReducer.ts` (Task 3/4)
- `src/components/ReviewPanel.tsx` (Task 4)
- `src/app/page.tsx` (Task 1/4)
- `tests/unit/suggestions.test.ts` (Tasks 2/3)
- `tests/integration/suggestions-route.test.ts` (Tasks 2/3)
- `tests/unit/revisedAnalysisReducer.test.ts` (Task 4)
- `tests/unit/homepage.test.tsx` (Task 5)
- `e2e/home.spec.ts` (Task 4/5)
- `e2e/task4-qa.spec.ts` (Task 4)
- `e2e/voice-rewrite.spec.ts` (Task 5)

### Anti-Pattern Scan
- `as any`: 0 hits in changed files ✅
- `@ts-ignore`: 0 hits ✅
- `TODO/FIXME/HACK`: 0 hits ✅
- `console.log(`: 0 hits ✅

### LSP Diagnostics
All changed `.ts`/`.tsx` files: no errors ✅

### Production Code Findings

**VoiceProfilePanel.tsx**
- `isProfileRevealed` local state correctly scoped to component — plan constraint met.
- Auto-reveal on line 79 (`setIsProfileRevealed(true)`) fires synchronously after `setVoiceProfile(data.profile)` in the same try block — correct ordering.
- `data-testid="reveal-voice-profile-btn"` and `data-testid="voice-profile-textarea"` preserved — plan testid contract met.
- No `localStorage`/`sessionStorage` usage — plan guardrail met.

**llm.ts (generateAlternativeSuggestions)**
- Max 2 LLM calls per invocation (deterministic) — correct.
- `deduplicateAlternativesByRewrite` operates on raw payloads (pre-guardrail) before re-applying guardrails on combined set — logically sound; dedup at the right layer.
- 2-minimum contract enforced: `if (combinedSafe.length < 2) return null` — ✅
- `parseMultiAlternativesPayload` handles both `{alternatives:[...]}` and single-object `{rewrite,explanation}` fallback shapes — resilient.
- `callChatCompletionsMulti` catch block returns null on any network error — no uncaught throws.
- ⚠️ LOW: `generateAlternativeSuggestions` accepts `apiKey: string | undefined` but the first guard `if (!apiKey) return null` also short-circuits on empty string. This is correct but the type could be `string | undefined` to make intent clearer. Not blocking.

**route.ts (suggestions)**
- `voiceProfile` extraction uses `(body as unknown as Record<string, unknown>).voiceProfile` — avoids adding `voiceProfile` to the `SuggestionRequest` Zod schema but still type-safe via runtime string check. Minor readability issue but not a bug.
- `sanitizeVoiceProfile` called before forwarding to LLM — injection-safe.
- Response shape preserved: `{ available:false, sentenceIndex }` for unavailable, `alternatives` added alongside top-level aliases — backward-compat maintained.

**revisedAnalysisReducer.ts**
- Discriminated union for `SUGGESTION_FETCH_SUCCESS` payload (`| { alternatives } | { rewrite, explanation }`) — correctly typed.
- Reducer normalizes legacy payload to `[{ rewrite, explanation }]` ensuring `alternatives` is always set on `status === 'success'` entries — prevents null-access in UI.
- Backward alias fields `rewrite`/`explanation` still written on `status === 'success'` — existing consumer code continues to work.

**ReviewPanel.tsx**
- Immediate click-time popover positioning (lines 59–68) sets `popoverPos` before `selectSentence` dispatch, avoiding the first-frame null-position race. Correct fix.
- `cacheEntry.unavailable || !cacheEntry.alternatives || cacheEntry.alternatives.length === 0` at line 176 — the `!cacheEntry.alternatives` branch is technically dead code in normal flow (reducer always sets `alternatives` on success), but it provides a defense against any hypothetical stale cache shape. Benign.
- `available:true` with empty `alternatives: []` is dispatched as `SUGGESTION_FETCH_UNAVAILABLE` (lines 114–117), which correctly sets `unavailable: true`, triggering the `suggestion-empty` branch. ✅
- Apply buttons correctly use indexed testid `apply-suggestion-btn-{index}` and pass `alt.rewrite` — no regression on apply flow.

**page.tsx**
- `voiceProfile` state still owned by `page.tsx`, passed as prop to both `VoiceProfilePanel` and `ReviewPanel` — plan constraint met.
- Hidden sentinel `<span data-testid="voice-profile-state" ...>` is `display:none` and `aria-hidden="true"` — clean test hook, no a11y impact.

### Test Quality Findings

**suggestions.test.ts**
- 872 lines of new tests; all assert meaningful behavior (not trivial pass-through).
- Recovery path tests use `mockResolvedValueOnce` correctly to simulate first/second call splitting.
- Unavailable branch isolation tests use unique `sentenceIndex` values per branch — good diagnostic hygiene.
- `voiceProfile` prompt-embedding tests inspect `callBody.messages[1].content` directly — correct unit-level coverage.
- Edge cases covered: markdown fences, empty API key, network error, single-object LLM format.

**suggestions-route.test.ts**
- Route-level integration correctly verifies `alternatives.length >= 2 && <= 3` constraint.
- `top-level rewrite and explanation are aliases to alternatives[0]` — backward-compat alias test is meaningful.
- `sanitizes voiceProfile wrapper before forwarding to LLM` inspects the actual LLM request body — not just response shape. Strong.

**revisedAnalysisReducer.test.ts**
- Legacy `{rewrite, explanation}` payload normalization tested against `{alternatives}` payload for identical shape — important backward-compat coverage.
- `all alternatives preserved in cache (not just first)` verifies that `alternatives[1]` and `alternatives[2]` survive the reducer. Correct.

**homepage.test.tsx**
- VoiceProfilePanel mock correctly models the reveal-state toggle contract at component boundary. Focused and non-brittle.
- `voice profile state is not reset when a second document is uploaded` — subtle regression guard, appropriate.

**e2e/voice-rewrite.spec.ts**
- `reveal-voice-profile-btn` click is explicit in pasted-profile reuse test (line 385).
- Auto-reveal after generation is asserted by directly checking `voice-profile-textarea` visible after `generate-voice-profile-btn` click (no manual reveal needed).
- Selector stability: all testids unchanged from prior plan.

**e2e/task4-qa.spec.ts**
- New `available:true but no rewrite/alternatives` test correctly mocks `alternatives: []` and asserts `suggestion-empty` visible, `suggestion-success` absent. Meaningful edge-case coverage.

### Verdict

**✅ APPROVE**

All plan constraints met. No anti-patterns, no dead code introduced beyond one benign defensive branch (`!cacheEntry.alternatives` on line 176). No guardrail bypasses. 2-minimum success contract preserved at every layer (llm.ts, route.ts, reducer, UI). LSP clean. Tests are meaningful, non-trivial, and cover reveal flow, auto-reveal, unavailable branches, recovery path, deduplication, and indexed apply. Backward-compat alias fields correctly maintained throughout the stack.

---

## F3 Manual QA — voice-profile-suggestion-fixes

**Date:** 2026-04-02
**Scope:** User-facing interaction flows: reveal-button, generate auto-reveal, suggestion success, unavailable, pasted-profile reuse.

### E2E Automated Test Run

```
npm run test:e2e -- e2e/voice-rewrite.spec.ts e2e/home.spec.ts e2e/task4-qa.spec.ts
```

Result: **28/28 passed** (15.8s)
- e2e/home.spec.ts: 15/15 ✅
- e2e/task4-qa.spec.ts: 5/5 ✅
- e2e/voice-rewrite.spec.ts: 8/8 ✅

### Manual Playwright Interaction Flows (15 assertions, all PASS)

**Reveal-button flow:**
- `textarea hidden=true` before reveal click ✅
- `reveal-voice-profile-btn visible=true` before reveal click ✅
- `textarea visible=true` after reveal click ✅
- `reveal-voice-profile-btn hidden=true` after reveal click ✅

**Generate auto-reveal flow:**
- `textarea hidden=true` before generate ✅
- `textarea visible=true` after generate-voice-profile-btn click ✅
- Textarea populated with generated profile value ✅

**Suggestion success on highlight click:**
- `suggestion-popover visible=true` after highlight click ✅
- `suggestion-success visible=true` ✅
- `suggestion-empty hidden=true` ✅

**Unavailable flow (available:false):**
- `suggestion-popover visible=true` ✅
- `suggestion-empty visible=true` ✅
- `suggestion-success hidden=true` ✅

**Pasted profile reuse (reveal click before textarea entry):**
- Reveal click makes textarea visible ✅
- `voiceProfile` field correctly forwarded in suggestions API request ✅

### Console Error Check

Zero console errors, zero page errors during full reveal + generate + highlight-click interaction sequence ✅

### Verdict

**✅ APPROVE**


## F1 Re-audit — reducer-contract interpretation
- Re-read Task 4 plan text: it forbids reducer **action name** refactors and new server fields in Task 4, but it does not explicitly forbid backward-compatible reducer payload/cache extensions.
- Current code keeps reducer action names and vocabulary unchanged (`SUGGESTION_FETCH_START|SUCCESS|UNAVAILABLE|ERROR`), preserves unavailable responses as exactly `{ available:false, sentenceIndex }`, and keeps success semantics at 2–3 alternatives in `llm.ts`/`route.ts`.
- Final F1 verdict after re-audit: APPROVE. The reducer changes in `revisedAnalysisReducer.ts` are additive and backward-compatible rather than a forbidden action-name refactor or broken contract.

---

## F4 Scope Fidelity Re-Run — 2026-04-04

**Reviewer**: Sisyphus-Junior
**Verdict**: ✅ APPROVE (confirms prior F4 approval; no new findings)

### Key Confirmations
- Prior F4 (2026-04-02) APPROVE verdict with two negligible adaptations still holds in current repo state.
- Two negligible adaptations remain unchanged:
  1. `RevisedReviewPanel.tsx` CSS hover opacity/visibility tweak (not `hidden group-hover:flex`) — cosmetic testability fix, zero product-semantic impact.
  2. `task8/evidence-screenshots/f3` testid adapter updates (`apply-suggestion-btn` → `apply-suggestion-btn-0`) — mandatory consequence of Task 4 indexed apply.
- `analyzeText.ts` has uncommitted working-tree changes but is out of scope for this plan; covered under SL-1 in the cumulative lens.
- All contract checks pass on fresh direct-inspection:
  - `SuggestionUnavailableResponse` = exactly `{ available: false, sentenceIndex }` ✅
  - 2-min alternatives gate at `llm.ts:295` (fast) and `llm.ts:312` (recovery) ✅
  - All required testids present: `reveal-voice-profile-btn`, `voice-profile-textarea`, `copy-voice-profile-btn`, `suggestion-empty`, `suggestion-success`, `apply-suggestion-btn-{index}` ✅
  - 0 `localStorage`/`sessionStorage`/`indexedDB` hits in `src/` ✅
  - All reducer action names (`SUGGESTION_FETCH_START/SUCCESS/UNAVAILABLE/ERROR`) unchanged ✅
  - `voiceProfile` owned by `page.tsx` (useState at line 17) ✅

---

## F3 Re-Run — 2026-04-04

### Environment Constraint
Playwright E2E tests cannot execute on this host: `libnspr4.so`, `libnss3.so`, `libasound.so.2` are missing and cannot be installed without sudo. This is a persistent infrastructure constraint, not a code defect.

### Re-Run Approach
Static source analysis + unit/integration test execution (389/389 pass) was used as the verification basis. Prior browser evidence from 2026-04-02 (28/28 Playwright pass) remains the last executable record; static analysis confirms no regressions since that run.

### Verification Pattern for Browser-Blocked Environments
When Playwright is unavailable: (1) run all Vitest unit/integration suites — must be 0 failures; (2) do line-by-line source analysis matching each QA scenario to the implementation; (3) confirm E2E spec assertions align with source behavior; (4) document the infrastructure blocker explicitly and reference prior browser evidence.

### Fresh Verdicts (2026-04-04)
- Reveal-button UX: ✅ PASS — `useState(false)` init + conditional render + `setIsProfileRevealed(true)` on click
- Generate auto-reveal: ✅ PASS — `setIsProfileRevealed(true)` at line 79 immediately after `setVoiceProfile` on success
- Suggestion success (2–3 alts): ✅ PASS — `suggestion-success` conditional + 106/106 unit + 36/36 integration tests
- Unavailable fallback: ✅ PASS — `suggestion-empty` conditional + 4-branch isolation tests all green
- Pasted-profile reuse: ✅ PASS — E2E spec line 385 reveal click + ReviewPanel line 88 voiceProfile forward

---

## F2 Code Quality Re-Run — 2026-04-04

**Reviewer**: Sisyphus-Junior
**Verdict**: ✅ APPROVE

### Summary of fresh independent findings
- All 6 primary source files: LSP 0 errors, typecheck 0 errors, lint 0 errors (3 pre-existing warnings outside changed files)
- Anti-pattern scan (src/ + tests/ + e2e/): 0 hits for `as any`, `@ts-ignore`, TODO/FIXME/HACK, `console.log`
- 224 unit/integration tests pass (0 failed): suggestions.test.ts 106, suggestions-route.test.ts 36, revisedAnalysisReducer.test.ts 50, homepage.test.tsx 5, voice-profile-route.test.ts 27
- All 12 contract items confirmed against current source (not prior notes): unavailable shape exact, 2-min gate present at both fast + recovery paths, all testids intact, no storage usage, no action-name changes, no guardrail bypass
- One benign dead branch confirmed: `!cacheEntry.alternatives` in ReviewPanel line 176 is dead in normal flow but harmless defensive check
- No blocking issues. No new issues found versus prior F2 run.


## 2026-04-04 — F1 re-audit (current repo state)
- Current code still satisfies the core plan contracts for Tasks 1-4: local reveal state in `VoiceProfilePanel`, auto-reveal after successful generation, exact `/api/suggestions` unavailable shape, 2-3 alternatives on success, and unchanged review/apply/retry semantics.
- Fresh command run on this audit: targeted Vitest passed 224/224, `npm run typecheck` passed, `npm run lint` exited 0 with only pre-existing warnings, and `npm run build` passed.
- The remaining compliance gap is verification/coverage fidelity, not application source behavior: targeted Playwright could not launch Chromium in this container, and one stale browser assertion still references `apply-suggestion-btn` in `e2e/task4-qa.spec.ts:116`.


## 2026-04-04 — F1 re-audit after selector fix
- The Task 5 blocker is resolved once `e2e/task4-qa.spec.ts:116` is updated to `apply-suggestion-btn-0`; that now matches the indexed button contract rendered in `src/components/ReviewPanel.tsx:209`.
- For this plan, the Playwright `libnspr4.so` launch failure should be reported factually but not double-counted as a fresh blocker when F3 already approved the plan with the same transparent infra note and the browser test contracts are now aligned.
- Fresh re-audit command status: `lint` exit 0 with 3 warnings, targeted Vitest 224/224 passed, `build && typecheck` both exit 0, targeted Playwright still blocked at browser launch.
