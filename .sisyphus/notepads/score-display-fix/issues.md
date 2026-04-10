# Issues - score-display-fix

**Session Start**: 2026-04-10

## Encountered Problems & Solutions

### F3 QA Session — 2026-04-10

**Issue 1: Stale `.next` build on port 3105**
- Symptom: `./331.js` module error on all page loads
- Resolution: Deleted `.next/` directory entirely, started fresh dev server on port 3200
- Status: Resolved

**Issue 2: `.sisyphus/test-essay.docx` too short**
- Symptom: 422 response "Text is too short" (28 chars; minimum is 300)
- Resolution: Switched to `Test-doc/Test2.docx` which is a full-length essay
- Status: Resolved

**Issue 3: Spinner screenshot hard to capture mid-flight**
- Symptom: Spinner shows for ~300ms during `/api/analyze-revised` — too brief for sequential screenshot capture
- Resolution: Used `browser_run_code` polling loop to detect DOM presence programmatically (`{ spinnerFound: true }`); accepted as valid QA evidence
- Status: Resolved (programmatic confirmation accepted; no mid-flight screenshot)

**Issue 4: Revert spinner not visible**
- Symptom: When reverting the last (only) replacement, no spinner appeared — revert is synchronous state removal, no re-analysis API call
- Resolution: Expected behavior. Documented in decisions. Spinner evidence relies on the Apply flow (Issue 3).
- Status: Non-issue — by design

