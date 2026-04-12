# Learnings

## [2026-04-12] Session: ses_284d531b3ffeqFBT4wK9B1Xy2r

### Root Cause
`deriveRevisedText` in `revisedAnalysisReducer.ts:321` joins sentences with `.join(' ')`, destroying paragraph breaks (`\n\n`).
This causes the revised analysis to re-analyze differently-formatted text, producing wrong scores.

### Fix Strategy
Replace all 3 call sites of `deriveRevisedText` with `deriveTextWithRewrites` from `@/lib/bulk-rewrite/bulkRewrite`.

### Call Sites to Update
1. `src/app/page.tsx:43` — revert handler: `deriveRevisedText(result, nextReplacements)` → `deriveTextWithRewrites(result.text, result.sentences, nextReplacements)`
2. `src/app/page.tsx:117` — bulk rewrite handler: `deriveRevisedText(result, mergedReplacements)` → `deriveTextWithRewrites(result.text, result.sentences, mergedReplacements)`
3. `src/components/ReviewPanel.tsx:139` — single apply: `deriveRevisedText(revisedState.state.originalResult, nextReplacements)` → `deriveTextWithRewrites(revisedState.state.originalResult.text, revisedState.state.originalResult.sentences, nextReplacements)`
4. `src/app/useRevisedAnalysisState.ts:42` — computed property: `deriveRevisedText(state.originalResult, state.appliedReplacements)` → `deriveTextWithRewrites(state.originalResult.text, state.originalResult.sentences, state.appliedReplacements)`

### Import Changes
- Add `import { deriveTextWithRewrites } from '@/lib/bulk-rewrite/bulkRewrite';` to page.tsx, ReviewPanel.tsx, useRevisedAnalysisState.ts
- Remove `deriveRevisedText` from imports in page.tsx (line 9) and ReviewPanel.tsx (line 4)
- Remove `deriveRevisedText` from imports in useRevisedAnalysisState.ts (line 7) — keep `hasAppliedReplacements`
- Remove re-export of `deriveRevisedText` in useRevisedAnalysisState.ts (line 20) — keep `hasAppliedReplacements`

### MUST NOT Change
- `deriveTextWithRewrites` in bulkRewrite.ts — it works correctly
- `/api/analyze/revised` endpoint
- ReviewPanel score display logic (lines 307-344)
- BulkRewriteResult interface
- Detection adapters (sapling.ts, etc.)

### Signature of deriveTextWithRewrites
`deriveTextWithRewrites(originalText: string, originalSentences: Array<{ sentence: string; sentenceIndex?: number }>, rewrites: Record<number, string>): string`
AnalysisSuccessResponse.sentences is compatible (has `sentence` field; `sentenceIndex` optional).

### Test Context
- Existing `deriveRevisedText` tests in `tests/unit/revisedAnalysisReducer.test.ts:363+` — DO NOT CHANGE, they test the deprecated function
- New tests needed: `describe('deriveTextWithRewrites for revised analysis')` with multi-paragraph preservation

## [2026-04-12] Build fix: node:crypto bundling issue
- `deriveTextWithRewrites` extracted to `src/lib/bulk-rewrite/textUtils.ts` (no server deps)
- `bulkRewrite.ts` imports from `./textUtils` and re-exports for backward compat
- All 4 consumer files updated to import from `@/lib/bulk-rewrite/textUtils`
- Root cause: bulkRewrite.ts transitively imports node:crypto via analyzeText → copyleaks

## [2026-04-12] Task 3 Verification: node:crypto Build Error Blocker

### Critical Finding
Commit `066d322` introduced a **client-side webpack build error** that prevents the Next.js dev server from rendering the page.

### Root Cause
`page.tsx` (marked `'use client'`) now imports `deriveTextWithRewrites` from `@/lib/bulk-rewrite/bulkRewrite`.
The import chain is:
- `page.tsx` �� `bulkRewrite.ts` �� `analyzeText.ts` �� `copyleaks.ts` �� `node:crypto`

`node:crypto` is a Node.js-only module. Webpack (client bundler) cannot handle it, causing:
`
Module build failed: UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins
`

### Before vs After
- **Before (066d322^)**: `page.tsx` imported `deriveRevisedText` from `useRevisedAnalysisState.ts` (client-safe)
- **After (066d322)**: `page.tsx` imports `deriveTextWithRewrites` from `bulkRewrite.ts` (has server-only transitive deps)

### Impact
- Dev server returns HTTP 500 on all page loads
- `<div id="__next"></div>` is empty ? no app content renders
- ALL E2E tests are blocked (page can't load in browser)

### Fix Required
Move `deriveTextWithRewrites` to a client-safe module (e.g., keep it in `useRevisedAnalysisState.ts` or create a separate utility file without server imports), OR use dynamic imports/`next/dynamic` to avoid bundling server code.

### Evidence
- Screenshot: `.sisyphus/evidence/task-3-build-error.png`
- Typecheck passes (0 errors) ? TypeScript doesn't catch client/server boundary violations
- All 648 tests pass ? Vitest runs in Node.js, not a browser
