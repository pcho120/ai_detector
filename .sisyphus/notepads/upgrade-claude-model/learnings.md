# Model Upgrade Learnings

## Task Execution: Update Claude Model ID
- Date: 2026-04-10
- Target model: `claude-haiku-4-5-20251001` (exact pinned version required)
- File: `src/lib/suggestions/adapters/anthropic.ts`

## Key Findings
1. **Exact version matters**: Anthropic SDK requires full model ID with date suffix (e.g., `claude-haiku-4-5-20251001`), not short aliases.
2. **Two locations in adapter**: JSDoc comments must match runtime strings for documentation accuracy.
3. **Error handling protects misconfigs**: The adapter's try/catch with `null` return prevents API errors from cascading, but exact model ID prevents those errors in the first place.
4. **Test coverage validates changes**: All 574 tests passed with model string change, indicating no downstream dependencies on the old string.

## Verification Pattern
- Grep for old ID presence (should be 0)
- Grep count for new ID (should be 2: JSDoc + model literal)
- TypeScript compilation must pass
- Full test suite must pass

## Evidence File Requirement (F1 Feedback)
- The F1 final review requires exact evidence filenames in `.sisyphus/evidence/`
- Created files: `task-1-old-string-gone.txt` and `task-1-new-string-count.txt`
- These must document the verification results with exact command outputs
- Evidence naming convention appears critical for plan closure
