# Learnings - score-display-fix

**Session Start**: 2026-04-10

## Key Insights

### F3 QA Session — 2026-04-10

- **Score badge three-way conditional** in `ReviewPanel.tsx` (lines 302–342): `revisedLoading` → spinner; `scoresDiffer` (`.toFixed(1)` comparison) → struck-through original + inline revised; else → plain original.
- **`scoresDiffer` threshold**: Scores must differ at the first decimal place. If both round to the same `.toFixed(1)` string, the UI shows only the plain original (no strikethrough). In practice with Test2.docx, applying a replacement for a 0.984-scored sentence caused the score to jump from 1.1% AI → 90.1% AI — a dramatic visible change.
- **Revert flow**: Clicking a replaced highlight in the right panel (`RevisedReviewPanel`) triggers `onRevert(sentenceIndex)` → `removeSentenceReplacement(index)` → if no replacements remain, `revisedResult` becomes null → score badge returns to plain original (no re-analysis call needed for the last remaining replacement).
- **Spinner timing**: The loading spinner fires during the `/api/analyze-revised` call after Apply. It is transient (~300–500ms) and hard to screenshot mid-flight without polling. Programmatic polling confirmed it with `{ spinnerFound: true }`.
- **Test fixture**: `Test-doc/Test2.docx` is the reliable fixture. `.sisyphus/test-essay.docx` is too short (28 chars, fails 422).
- **Dev server port**: App was started on port 3200 (port 3105 had a stale broken `.next` build).

