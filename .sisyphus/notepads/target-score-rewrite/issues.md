## 2026-04-07T17:38:52.202Z Task: initialization
No active implementation issues yet.

Watch items:
- Target score unit conversion between client percent input and score float logic.
- Need to verify existing reducer can accept bulk-applied replacements without hook changes.
- Need to verify best place to show progress since API is planned as single-response JSON.

## 2026-04-07 Task 2 correction note
- Corrected `bulkRewrite.ts` to strictly consume `BulkRewriteRequest`, `BulkRewriteResult`, and `BulkRewriteProgress` from `./types`.
- Removed duplicate/local request-result-progress interfaces and removed legacy compatibility normalization shim.

### TargetScorePanel Props Update
- Adjusted `TargetScorePanel` props to exactly match the `{ onRewrite: (targetScore: number) => Promise<void>, isLoading: boolean, progress: { current: number; total: number; phase: string } | null, result: { achievedScore: number; targetMet: boolean; targetScore: number } | null, disabled: boolean }` structure.
- Modified copy to include "Minimum target is 10%" and "Maximum target is 100%".
- Changed button text to "Rewrite to Target" and progress label to "Rewriting X/Y sentences...".

### TargetScorePanel Copy Match Update
- Removed unrequested phase text output in the progress display to match the plan's clean UX.
- Updated the success result string to `Score reduced to XX%!`.
- Updated the fallback result string to `Best achieved: XX% (target: YY%). Try editing individual sentences.`

## 2026-04-07 Task 4 correction
- Added missing `export const maxDuration = 60` to route.ts.
- Changed 503 error key from `SERVICE_UNAVAILABLE` to `COACHING_LLM_NOT_CONFIGURED` to match the planned contract.
- Wrapped `executeBulkRewrite` in try/catch returning JSON 500 with `{ error: 'BULK_REWRITE_FAILED', message }` instead of an uncaught throw.
- All three fixes verified: LSP 0 errors, `npm run typecheck` PASSED.
