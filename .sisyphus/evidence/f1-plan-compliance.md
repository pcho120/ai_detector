# F1 Plan Compliance Audit — voice-profile-suggestion-fixes

**Date:** 2026-04-04  
**Plan:** `.sisyphus/plans/voice-profile-suggestion-fixes.md`  
**Scope:** Tasks 1–5 only, plus final-wave dependency status  
**Verdict:** **APPROVE**

## Live verification run

- `npm run lint` → **exit 0** with 3 warnings in `eslint.config.mjs:9`, `postcss.config.mjs:1`, and `src/app/api/analyze/route.ts:67`.
- `npm run test -- tests/unit/suggestions.test.ts tests/unit/revisedAnalysisReducer.test.ts tests/unit/homepage.test.tsx tests/integration/suggestions-route.test.ts tests/integration/voice-profile-route.test.ts` → **exit 0**; **224/224 passed**.
- `npm run build && npm run typecheck` → **exit 0** for both commands.
- `npm run test:e2e -- e2e/home.spec.ts e2e/voice-rewrite.spec.ts e2e/task4-qa.spec.ts` → **failed before browser assertions ran** because Chromium could not launch: `libnspr4.so: cannot open shared object file: No such file or directory`.

## Final-wave dependency status

- **F2:** APPROVE — `.sisyphus/evidence/f2-code-quality.md:222-234`
- **F3:** APPROVE with transparent environment-blocker note — `.sisyphus/evidence/f3-manual-qa-summary.md:9-19`, `.sisyphus/evidence/f3-manual-qa-summary.md:169-177`
- **F4:** APPROVE — `.sisyphus/evidence/f4-scope-fidelity.md:159-174`

## Task-by-task assessment

### Task 1 — APPROVE
Plan acceptance requires hidden-by-default profile entry, explicit reveal, and auto-reveal after successful generation (`.sisyphus/plans/voice-profile-suggestion-fixes.md:120-124`). The current implementation satisfies that:

- Local reveal state is kept in `src/components/VoiceProfilePanel.tsx:37` and drives the mutually exclusive reveal-button / textarea branches at `src/components/VoiceProfilePanel.tsx:168-210`.
- Auto-reveal after successful generation happens at `src/components/VoiceProfilePanel.tsx:77-79` immediately after `setVoiceProfile(data.profile)`.
- Parent-owned `voiceProfile` state remains unchanged in `src/app/page.tsx:17` and is still passed into `VoiceProfilePanel` and `ReviewPanel` at `src/app/page.tsx:130-147`.
- Required selectors remain intact: `reveal-voice-profile-btn` (`src/components/VoiceProfilePanel.tsx:172`), `voice-profile-textarea` (`src/components/VoiceProfilePanel.tsx:188`), and `copy-voice-profile-btn` (`src/components/VoiceProfilePanel.tsx:196`).
- Supporting reveal coverage remains present in `tests/unit/homepage.test.tsx:147-162` and `e2e/voice-rewrite.spec.ts:44-45`.

### Task 2 — APPROVE
Plan acceptance requires explicit isolation of each current unavailable branch without changing the route contract (`.sisyphus/plans/voice-profile-suggestion-fixes.md:162-166`). The current repo satisfies that:

- Route-level branch isolation exists in `tests/integration/suggestions-route.test.ts:565-699` for missing key, parse failure, all-filtered output, and `<2` safe alternatives.
- Unit-level branch isolation exists in `tests/unit/suggestions.test.ts:915-1013` for the same four causes.
- Exact unavailable-shape assertions remain explicit in `tests/integration/suggestions-route.test.ts:577-584`, `607-614`, `649-656`, and `690-697`.
- The targeted Vitest command passed with all relevant tests green.

### Task 3 — APPROVE
Plan acceptance requires preserving the 2–3 alternatives-on-success contract and exact unavailable response shape (`.sisyphus/plans/voice-profile-suggestion-fixes.md:205-209`). The current implementation satisfies that:

- `generateAlternativeSuggestions()` keeps the fast-path minimum at `src/lib/suggestions/llm.ts:295-297`, caps to 3 at `src/lib/suggestions/llm.ts:296`, and uses a deterministic one-time recovery call at `src/lib/suggestions/llm.ts:300-315`.
- The unrecoverable path still returns `null` when combined safe alternatives remain below 2 at `src/lib/suggestions/llm.ts:311-312`.
- The route preserves the exact unavailable response interface at `src/app/api/suggestions/route.ts:24-27` and returns exactly `{ available: false, sentenceIndex }` at `src/app/api/suggestions/route.ts:86-88`.
- Successful responses still expose top-level aliases plus the alternatives array at `src/app/api/suggestions/route.ts:91-97`.
- Recovery-path coverage passed in `tests/integration/suggestions-route.test.ts:807-946` and `tests/unit/suggestions.test.ts:1015-1213`.

### Task 4 — APPROVE
Plan acceptance requires preserving review/apply/retry semantics while hardening success rendering (`.sisyphus/plans/voice-profile-suggestion-fixes.md:248-252`). The current repo satisfies that:

- Retry semantics remain unchanged because `shouldSkipSuggestionFetch()` still allows refetch for `unavailable:true` and `error` entries at `src/components/ReviewPanel.tsx:7-12`; matching unit coverage exists at `tests/unit/revisedAnalysisReducer.test.ts:554-579`.
- Click-time popover positioning now happens before fetch state dispatch at `src/components/ReviewPanel.tsx:59-68`.
- `available:true` with empty alternatives is converted back to unavailable at `src/components/ReviewPanel.tsx:103-119`, preventing false success rendering.
- Apply + revised-analysis semantics remain intact at `src/components/ReviewPanel.tsx:126-136`.
- Required selectors remain present: `suggestion-popover` (`src/components/ReviewPanel.tsx:154`), `suggestion-empty` (`src/components/ReviewPanel.tsx:177`), `suggestion-success` (`src/components/ReviewPanel.tsx:181`), and `apply-suggestion-btn-{index}` (`src/components/ReviewPanel.tsx:209`).

### Task 5 — APPROVE
Plan acceptance requires reveal/rewrite regression coverage aligned with the hidden-by-default textarea model and indexed apply flow (`.sisyphus/plans/voice-profile-suggestion-fixes.md:291-295`). The current repo now satisfies that:

- Browser coverage for reveal-before-manual-entry is present at `e2e/voice-rewrite.spec.ts:385-390`.
- Generated-profile auto-reveal coverage is present at `e2e/voice-rewrite.spec.ts:96-98` and `208-210`.
- Successful 2–3 alternative rendering with and without `voiceProfile` is covered at `e2e/voice-rewrite.spec.ts:174-228` and `231-271`.
- Indexed apply coverage remains present at `e2e/voice-rewrite.spec.ts:273-335`.
- The previously stale selector mismatch is fixed: `e2e/task4-qa.spec.ts:116` now uses `apply-suggestion-btn-0`, matching the indexed selector contract rendered at `src/components/ReviewPanel.tsx:209`.
- I did not find another selector mismatch in the audited browser specs.

## Final decision

**APPROVE**

Tasks 1–5 are compliant in the current repo state. The code and test contracts now align, including the updated indexed selector assertion for Task 5, and the remaining Playwright launch failure is the already-accounted-for environment issue documented in F3 rather than a plan-specific blocker.
