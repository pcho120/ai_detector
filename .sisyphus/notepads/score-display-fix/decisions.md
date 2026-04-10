# Decisions - score-display-fix

**Session Start**: 2026-04-10

## Architectural & Implementation Choices

### F3 QA Session — 2026-04-10

- **Chosen fixture**: `Test-doc/Test2.docx` over `.sisyphus/test-essay.docx` because the latter is too short (28 chars) and returns 422.
- **Spinner evidence strategy**: Used programmatic polling (`browser_run_code` with loop) rather than screenshot to confirm the loading spinner, since it appears for only ~300ms. This is acceptable QA evidence (code confirms DOM presence).
- **Revert trigger**: Clicking the replaced highlight in the *right* panel (`RevisedReviewPanel`) is the correct revert path — not the left panel. The right-panel highlight for the replaced sentence has `cursor-pointer` and `group relative` classes, distinguishing it from other highlights.
- **No re-analysis on final revert**: When the last/only replacement is reverted, the state goes to zero replacements → `revisedResult = null` immediately with no API call, so no spinner is shown. This is by design.

