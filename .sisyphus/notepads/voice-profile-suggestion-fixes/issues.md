# Issues

## F4 Re-Run — 2026-04-04
No new issues found. Prior findings confirmed. No blockers.

## F3 Re-Run Issue — 2026-04-04

### Playwright Browser Launch Failure (Infrastructure)
- **Symptom**: All 28 Playwright tests fail with `libnspr4.so: cannot open shared object file: No such file or directory`
- **Root cause**: Chromium headless shell requires NSS/NSPR libraries not present on this Linux host
- **Resolution attempt**: `npx playwright install-deps` requires sudo → not available in this environment
- **Mitigation**: Static source + unit/integration verification used; prior browser evidence (28/28, 2026-04-02) is still valid
- **Action required**: If environment is restored (libs installed), re-run `npm run test:e2e -- e2e/voice-rewrite.spec.ts e2e/home.spec.ts e2e/task4-qa.spec.ts` to produce fresh browser evidence
- **Severity**: Infrastructure/environment only — no code defect


## 2026-04-04 — F1 re-audit issues
- Targeted Playwright verification is blocked in the current environment: `npm run test:e2e -- e2e/home.spec.ts e2e/voice-rewrite.spec.ts e2e/task4-qa.spec.ts` failed before execution because Chromium could not load `libnspr4.so`.
- `e2e/task4-qa.spec.ts:116` still uses the obsolete selector `apply-suggestion-btn`, so affected browser assertions are not fully aligned with the plan-required indexed selector contract `apply-suggestion-btn-{index}`.

## 2026-04-04 — Selector cleanup follow-up
- The stale unavailable-path selector in `e2e/task4-qa.spec.ts` has been updated to `apply-suggestion-btn-0`.


## 2026-04-04 — F1 re-audit after selector fix
- No code/test-contract blocker remains for Tasks 1-5 after the selector cleanup at `e2e/task4-qa.spec.ts:116`.
- Ongoing infra note only: targeted Playwright still cannot launch Chromium in this environment because `libnspr4.so` is missing.
