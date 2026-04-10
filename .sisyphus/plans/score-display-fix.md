# Score Display Fix: In-Place Revised Score Badge

## TL;DR

> **Quick Summary**: Fix the UX bug where the "Overall Score" badge in ReviewPanel always shows the original score, even after rewrites are applied. Update the badge to show the revised score in-place with a strikethrough on the original score.
>
> **Deliverables**:
> - `src/components/ReviewPanel.tsx` — score badge updated to reflect revised score
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — single task, single file
> **Critical Path**: Task 1 → F1-F4

---

## Context

### Original Request
User reported: "Rewrite 버튼을 눌러도 overall score가 변하지 않는다"

### Investigation Summary
**Key Discussions**:
- Backend pipeline is correct: `triggerRevisedAnalysis` → `/api/analyze/revised` → `revisedResult` is populated
- Root cause: `ReviewPanel.tsx:24` destructures `score` from the immutable `result` prop (original)
- The `RevisedReviewPanel` correctly shows the revised score, but appears below/beside and is easy to miss
- Fix chosen: In-place update — revised score replaces the original score badge, with strikethrough on original

**User Decisions**:
- Strikethrough on original score when revised score differs
- No strikethrough when revised score equals original score
- Loading state: show spinner only (hide any stale score)
- Style: strikethrough original + new score next to it

### Metis Review
**Identified Gaps** (addressed):
- Missing `data-testid` on score badge → Added `data-testid="original-overall-score"` and `data-testid="revised-score-inline"`
- `revisedError` edge case: stale `revisedResult` is kept in reducer on error → show last known revised score (no change to reducer)
- `revisedState === undefined` → fall back to original score with no change
- Identical scores → no strikethrough (only show when scores actually differ)

---

## Work Objectives

### Core Objective
Update ReviewPanel's "Overall Score" badge so it shows the revised score in-place when a rewrite is applied, with a strikethrough on the original score.

### Concrete Deliverables
- `src/components/ReviewPanel.tsx` — score badge section updated (lines ~303-311)

### Definition of Done
- [ ] When a rewrite is applied and `revisedResult` is non-null, the badge shows the revised score
- [ ] When `revisedResult.score !== result.score`, original score has strikethrough; revised score shown next to it
- [ ] When `revisedResult.score === result.score`, no strikethrough; just the (unchanged) score
- [ ] When `revisedLoading` is true, a spinner replaces the score display
- [ ] When all replacements are reverted (`revisedResult` → `null`), badge returns to original score with no strikethrough
- [ ] When `revisedState` is `undefined`, original score badge renders unchanged

### Must Have
- `data-testid="original-overall-score"` on the original score `<span>`
- `data-testid="revised-score-inline"` on the revised score element
- `data-testid="score-loading-spinner"` on the spinner element
- Color class on revised score uses same threshold logic (`>= 0.7`, `>= 0.4`)

### Must NOT Have (Guardrails)
- DO NOT modify `RevisedReviewPanel.tsx`
- DO NOT modify `revisedAnalysisReducer.ts`
- DO NOT change `ReviewPanelProps` interface
- DO NOT extract a shared `ScoreBadge` component
- DO NOT change `renderHighlightedText()` or sentence-level rendering
- DO NOT add animation/transitions unless already in codebase pattern
- DO NOT add tooltip explaining strikethrough
- DO NOT inline-compute color class helper (keep existing ternary pattern)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (Playwright e2e + vitest unit tests)
- **Automated tests**: Tests-after (update/add tests after implementation)
- **Framework**: Playwright (e2e), vitest (unit)

### QA Policy
Every scenario must be agent-executed. Evidence saved to `.sisyphus/evidence/task-1-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — navigate, apply rewrite, assert DOM, screenshot

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (single task):
└── Task 1: Update ReviewPanel score badge [quick]

Wave FINAL (after Task 1 — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright skill)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: Task 1 → F1-F4 → user okay
```

### Dependency Matrix
- **1**: none → F1, F2, F3, F4
- **F1-F4**: 1 (all final wave)

### Agent Dispatch Summary
- **Wave 1**: 1 task → T1: `quick`
- **FINAL**: 4 tasks → F1: `oracle`, F2: `unspecified-high`, F3: `unspecified-high` (+playwright skill), F4: `deep`

---

## TODOs

- [x] 1. Update ReviewPanel score badge to show revised score in-place

  **What to do**:
  - In `ReviewPanel.tsx`, locate the score display section (lines ~303-311 — the `<div className="flex items-center gap-2">` containing "Overall Score:")
  - Read the current `revisedState` values: `revisedState?.state.revisedResult`, `revisedState?.state.revisedLoading`
  - Replace the single score `<span>` with conditional rendering:

  **Case 1 — `revisedLoading === true` (analysis in-flight)**:
  ```tsx
  <span data-testid="score-loading-spinner" aria-label="Re-analyzing score…" className="animate-spin h-5 w-5 border-2 border-slate-300 border-t-slate-600 rounded-full inline-block" />
  ```

  **Case 2 — `revisedResult` non-null AND `revisedResult.score !== result.score`**:
  ```tsx
  <span data-testid="original-overall-score" className={`text-lg font-bold line-through text-slate-400`}>
    {(result.score * 100).toFixed(1)}% AI
  </span>
  <span>→</span>
  <span data-testid="revised-score-inline" className={`text-lg font-bold ${revisedResult.score >= 0.7 ? 'text-red-600' : revisedResult.score >= 0.4 ? 'text-orange-500' : 'text-green-600'}`}>
    {(revisedResult.score * 100).toFixed(1)}% AI
  </span>
  ```

  **Case 3 — `revisedResult` non-null AND `revisedResult.score === result.score`** (score unchanged):
  ```tsx
  <span data-testid="original-overall-score" className={`text-lg font-bold ${result.score >= 0.7 ? 'text-red-600' : result.score >= 0.4 ? 'text-orange-500' : 'text-green-600'}`}>
    {(result.score * 100).toFixed(1)}% AI
  </span>
  ```

  **Case 4 — `revisedResult === null` (no rewrites applied, or all reverted)**:
  ```tsx
  <span data-testid="original-overall-score" className={`text-lg font-bold ${score >= 0.7 ? 'text-red-600' : score >= 0.4 ? 'text-orange-500' : 'text-green-600'}`}>
    {(score * 100).toFixed(1)}% AI
  </span>
  ```

  **Logic summary**: derive `revisedResult` and `revisedLoading` from `revisedState?.state` (null-safe). Priority: loading > revised-differs > revised-same > original.

  **Must NOT do**:
  - Do NOT modify anything outside the score `<div>` container (lines ~305-310)
  - Do NOT modify `RevisedReviewPanel.tsx`
  - Do NOT modify `revisedAnalysisReducer.ts`
  - Do NOT extract a shared component
  - Do NOT change `ReviewPanelProps`

  **Recommended Agent Profile**:
  > Single file, inline JSX change, clear spec.
  - **Category**: `quick`
    - Reason: Single file, ~10-15 line change, no architectural decisions needed
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed for implementation; needed for QA only (handled in F3)
    - `visual-engineering`: Overkill for a badge inline fix

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (only task)
  - **Blocks**: F1, F2, F3, F4
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/components/ReviewPanel.tsx:305-310` — existing score badge to replace (the `<div className="flex items-center gap-2">` block)
  - `src/components/ReviewPanel.tsx:307` — existing color class ternary: `${score >= 0.7 ? 'text-red-600' : score >= 0.4 ? 'text-orange-500' : 'text-green-600'}` — replicate this for revised score
  - `src/components/RevisedReviewPanel.tsx:124-129` — reference for `data-testid="revised-overall-score"` pattern and same color ternary

  **API/Type References**:
  - `src/app/useRevisedAnalysisState.ts:22-35` — `UseRevisedAnalysisStateReturn` interface; `revisedState.state.revisedResult` and `revisedState.state.revisedLoading`
  - `src/lib/review/revisedAnalysisReducer.ts:49-90` — `RevisedAnalysisState` shape; `revisedResult: AnalysisSuccessResponse | null`, `revisedLoading: boolean`
  - `src/app/api/analyze/route.ts` — `AnalysisSuccessResponse` type; `.score` is the overall AI score (0–1)

  **WHY Each Reference Matters**:
  - `ReviewPanel.tsx:305-310`: This is the exact DOM you're replacing — know what's there before modifying
  - `ReviewPanel.tsx:307`: Copy the color ternary exactly — don't invent a new pattern
  - `revisedAnalysisReducer.ts:RevisedAnalysisState`: Confirms `revisedResult` is `null` when no rewrites, `AnalysisSuccessResponse` when available, `revisedLoading` is bool
  - `useRevisedAnalysisState.ts`: Confirms `revisedState.state` is the path to access these fields (not `revisedState.revisedResult` directly)

  **Acceptance Criteria**:

  > Agent-executable verification only.

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario 1: No rewrite applied — original score badge renders normally
    Tool: Playwright
    Preconditions: App loaded, essay analyzed, no rewrites applied
    Steps:
      1. Navigate to http://localhost:3000
      2. Upload a test .docx with AI-detected content
      3. Wait for [data-testid="review-panel"] to be visible
      4. Assert [data-testid="original-overall-score"] is visible
      5. Assert [data-testid="original-overall-score"] text matches /\d+\.\d+% AI/
      6. Assert [data-testid="original-overall-score"] does NOT have CSS class "line-through"
      7. Assert [data-testid="score-loading-spinner"] is NOT present in DOM
      8. Assert [data-testid="revised-score-inline"] is NOT present in DOM
    Expected Result: Score badge shows original score, no strikethrough, no spinner
    Evidence: .sisyphus/evidence/task-1-no-rewrite.png

  Scenario 2: Rewrite applied and score changed — strikethrough + new score
    Tool: Playwright
    Preconditions: App loaded, essay analyzed, at least one highlighted sentence visible
    Steps:
      1. Click a highlighted (red/orange) sentence span
      2. Wait for [data-testid="suggestion-popover"] to be visible
      3. Click the "Apply" button for the first suggestion alternative
      4. Wait for [data-testid="score-loading-spinner"] to disappear (timeout: 15s)
      5. Assert [data-testid="original-overall-score"] is visible
      6. Assert [data-testid="original-overall-score"] has CSS class "line-through" (if score changed)
      7. Assert [data-testid="revised-score-inline"] is visible
      8. Assert [data-testid="revised-score-inline"] text matches /\d+\.\d+% AI/
    Expected Result: Original score struck through, new revised score shown
    Failure Indicators: No line-through on original, or revised-score-inline not visible
    Evidence: .sisyphus/evidence/task-1-rewrite-applied.png

  Scenario 3: Loading state — spinner replaces score
    Tool: Playwright
    Preconditions: App loaded, essay analyzed, ready to apply rewrite
    Steps:
      1. Click a highlighted sentence span
      2. Wait for [data-testid="suggestion-popover"] to be visible
      3. Click "Apply" button
      4. Immediately assert [data-testid="score-loading-spinner"] is visible (within 500ms)
      5. Assert [data-testid="revised-score-inline"] is NOT visible during loading
    Expected Result: Spinner shown during re-analysis, score values hidden
    Evidence: .sisyphus/evidence/task-1-loading-state.png

  Scenario 4: All replacements reverted — score badge returns to original
    Tool: Playwright
    Preconditions: At least one rewrite applied (Scenario 2 complete)
    Steps:
      1. In RevisedReviewPanel, click the applied sentence to revert it (× button)
      2. Wait for [data-testid="revised-review-panel"] to disappear (or revisedResult null)
      3. Assert [data-testid="original-overall-score"] is visible
      4. Assert [data-testid="original-overall-score"] does NOT have class "line-through"
      5. Assert [data-testid="revised-score-inline"] is NOT present in DOM
    Expected Result: Score badge restored to original, no strikethrough
    Evidence: .sisyphus/evidence/task-1-reverted.png
  ```

  **Evidence to Capture**:
  - [ ] task-1-no-rewrite.png
  - [ ] task-1-rewrite-applied.png
  - [ ] task-1-loading-state.png
  - [ ] task-1-reverted.png

  **Commit**: YES
  - Message: `fix(review-panel): show revised AI score in-place after rewrite`
  - Files: `src/components/ReviewPanel.tsx`
  - Pre-commit: `npm run typecheck && npm run lint`

---

## Final Verification Wave (MANDATORY — after Task 1)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For `ReviewPanel.tsx`: verify the score badge section shows conditional rendering for loading/revised-differs/revised-same/null cases. Verify `data-testid` attributes are present: `original-overall-score`, `revised-score-inline`, `score-loading-spinner`. Check evidence files exist in `.sisyphus/evidence/`. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck` + `npm run lint` + `npm test`. Review `ReviewPanel.tsx` score badge section for: null-safety on `revisedState?.state.revisedResult`, correct TypeScript types, no `as any`, no console.log. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
  Execute ALL 4 QA scenarios from Task 1. Start from clean state (fresh upload). Capture evidence screenshots. Verify strikethrough only appears when scores differ. Verify spinner appears during loading. Verify revert restores original score.
  Output: `Scenarios [4/4 pass] | Evidence [4 files] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  Read Task 1 "What to do" and "Must NOT do". Check git diff — only `ReviewPanel.tsx` should be changed. Verify no changes to `RevisedReviewPanel.tsx`, `revisedAnalysisReducer.ts`, `ReviewPanelProps`. Verify no new components were extracted.
  Output: `Tasks [1/1 compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Task 1**: `fix(review-panel): show revised AI score in-place after rewrite` — `src/components/ReviewPanel.tsx`

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck   # Expected: no errors
npm run lint        # Expected: no errors
npm test            # Expected: all pass
```

### Final Checklist
- [ ] `data-testid="original-overall-score"` present on score span
- [ ] `data-testid="revised-score-inline"` present when revised score differs
- [ ] `data-testid="score-loading-spinner"` present during loading
- [ ] Strikethrough only shown when `revisedResult.score !== result.score`
- [ ] Spinner shown (and score hidden) when `revisedLoading === true`
- [ ] Original score restored when all replacements reverted
- [ ] `revisedState === undefined` falls back to original rendering with no errors
- [ ] Only `ReviewPanel.tsx` modified
