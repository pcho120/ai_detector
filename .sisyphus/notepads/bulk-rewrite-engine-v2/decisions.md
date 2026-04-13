# Decisions — bulk-rewrite-engine-v2

## [2026-04-12] Session Start

### Architectural Decisions
- Time-budget approach: injectable `now?: () => number` for test determinism
- Deadline: 50s (10s buffer from Vercel's 60s timeout)
- MAX_ROUNDS = 10 (hard safety cap even with time budget)
- Plateau: 2 consecutive rounds with <2% improvement triggers early stop
- Regression protection: track bestRewrites per sentence index across rounds
- Score-aware prompt: prepend detection % to user prompt (NOT system prompt), guard against banned patterns
- `BulkRewriteResult` interface: FROZEN — no changes to API contract
- `TargetScorePanelProps`: add optional `iterations?: number` only (backward compatible)

## [2026-04-12] Task 1 decisions

- The time-budget core computes `deadline` once from injected `now()` plus `deadlineMs`, then checks that same deadline at loop entry, at the top of each round, before each LLM call, and before re-analysis so timeout exits return partial work instead of throwing.
- The safety cap remains enforced independently of time budget via `MAX_ROUNDS = 10`, preserving deterministic upper bounds on API calls.
