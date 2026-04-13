# Issues & Gotchas — bulk-rewrite-engine-v2

## [2026-04-12] Session Start

### Known Gotchas
- Guardrails `BANNED_PATTERNS` in `src/lib/suggestions/guardrails.ts` — score-aware prompt text MUST NOT match banned patterns like "avoid detection", "reduce AI score" etc.
- `_score` parameter currently ignored (underscore prefix) — renaming it is the fix
- Re-analysis after each round: each call costs 1 detection API call
- CONCURRENCY=5: do NOT change this value
- Manual replacements (`preserveReplacements`) must never be retried — this is existing behavior to preserve
- Time mocking: prefer injectable `now()` over `vi.useFakeTimers()` for reliability with async code
