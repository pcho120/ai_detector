# Learnings — user-paper-few-shot

- Few-shot examples should be threaded as optional request data and kept mutually exclusive with voice profiles at the UI level.
- ReviewPanel must forward any style inputs it sends to /api/suggestions so individual sentence suggestions stay consistent with bulk rewrite behavior.

## [2026-04-10] Task 7: E2E Tests
- E2E tests follow same MOCK_FILE + BASE_ANALYZE_RESPONSE + page.route() mocking pattern as voice-rewrite.spec.ts
- MyPaperTab button disabled logic: `disabled={loading || (!file && text.trim().length < 500)}` ? client-side validation prevents API call for short text, so Test 4 tests disabled state rather than API error
- Tab mutual exclusivity verified via hidden data-testid spans: `voice-profile-state` (data-value attr) and `active-style-tab-state` (data-value attr)
- Switching from Voice Profile to My Paper clears voiceProfile to ''; switching back clears fewShotExamples[]
- Pre-existing lint errors in MyPaperTab.tsx (unescaped entities) are not from E2E test work
- All 43 E2E tests pass including 4 new my-paper-flow tests
