
## Architectural Decisions - Score Badge Update (Session 1)

### Decision 1: Single-File Modification Only
- Scope: Only `src/components/ReviewPanel.tsx` modified
- Rationale: UX issue, not backend; revised score already available in state
- Impact: Minimal, non-invasive change to existing component

### Decision 2: Epsilon Comparison for Score Difference Detection
- Method: `Math.abs(revisedScore - score) > 0.001` instead of `!==`
- Rationale: Floating-point arithmetic safety; prevents false positives from rounding artifacts
- Impact: Robust detection of meaningful score changes

### Decision 3: Loading State as Priority
- Rendering order: loading > score-diff > original-only
- Rationale: User sees immediate feedback during analysis, prevents visual flicker
- Impact: Cleaner UX during the revision cycle

### Decision 4: Independent Color Thresholds
- Original score colors applied to struck-through text
- Revised score uses fresh color calculation from its own value
- Rationale: Each score independently determines its severity level (red/orange/green)
- Impact: Consistent color semantics across UI


## Decision: Display-String Equality (Session 3)

### Decision
Use one-decimal display string equality to drive the differs/same logic, not raw floating-point comparison.

### Rationale
- User-perceived difference is what matters for UX (what they see rendered)
- Raw floats from API can differ slightly due to re-analysis but round to identical displayed percentages
- Showing "100.0% AI → 100.0% AI" is misleading and clutters the UI

### Trade-off
- Slightly more computational overhead (two `.toFixed(1)` calls upfront) is negligible and improves clarity
- Guarantees no duplicate percentage displays to user

