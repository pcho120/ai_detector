
## Implementation - Score Badge Update (Session 1)

### Pattern Recognition
- Score color ternary already exists in ReviewPanel (lines 307) and RevisedReviewPanel (line 125)
- Null-safe access to revisedState is critical: use optional chaining + nullish coalescing
- State flow: `revisedState?.state.revisedLoading` and `revisedState?.state.revisedResult?.score`

### Implementation Details
- Added three variables before render: revisedLoading, revisedResult, revisedScore
- Epsilon comparison: `Math.abs(revisedScore - score) > 0.001` prevents floating-point equality issues
- Rendering priority implemented correctly:
  1. If loading: show spinner with "Updating..." text
  2. If scores differ: show struck-through original + revised score side-by-side
  3. Otherwise: show original score only
- Color thresholds applied independently to each score (original & revised)

### Test IDs Applied
- `data-testid="score-loading-spinner"` on the loading div
- `data-testid="original-overall-score"` on original score elements (both strike-through and standalone)
- `data-testid="revised-score-inline"` on the revised score element


## Verified UI Contract (Session 2 - Correction Fix)

### Loading State
- Render: `<span data-testid="score-loading-spinner" aria-label="Re-analyzing score…" className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-slate-600 rounded-full inline-block" />`
- Explicit spinner element with rotating animation, no text label

### Revised-Differs State
- Original struck-through: `className="text-lg font-bold line-through text-slate-400"` (muted, no color ternary)
- Arrow separator: `<span>→</span>` between original and revised
- Revised score inline: Uses color ternary (>= 0.7 red, >= 0.4 orange, else green)
- Both scores use `(score * 100).toFixed(1)}% AI` formatting

### Score Comparison Logic
- Use exact equality: `revisedResult !== null && revisedResult.score !== score`
- Not epsilon-based; floating-point values from same API will match exactly when unchanged

### Test IDs Verified
- `data-testid="score-loading-spinner"` on spinner element
- `data-testid="original-overall-score"` on original score (struck-through and standalone)
- `data-testid="revised-score-inline"` on revised score element


## Display Equality Fix (Session 3 - Browser QA)

### Root Cause
- Raw floating-point comparison `revisedResult.score !== score` could be true even when displayed one-decimal percentages round to the same value
- Browser QA showed: `100.0% AI → 100.0% AI` (confusing duplicate display)

### Solution
- Pre-calculate both displayed strings: `(score * 100).toFixed(1)` and `(revisedResult.score * 100).toFixed(1)`
- Compare displayed strings: `revisedDisplayed !== originalDisplayed`
- Prevents arrow and duplication when user cannot visually tell the scores apart

### Implementation
- Three variables before render: `originalDisplayed`, `revisedDisplayed`, `scoresDiffer` (string-based)
- Reuse pre-calculated strings in render to avoid redundant `.toFixed(1)` calls
- Loading priority and spinner markup remain unchanged

