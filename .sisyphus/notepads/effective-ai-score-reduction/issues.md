# Issues & Gotchas — effective-ai-score-reduction

## [2026-04-12] Initial Issues

- `bun` NOT available in shell — always use `npm run test`, `npm run typecheck`, etc.
- Integration response shape inspection needed before asserting success (previous plan hit this)
- Time mocking: prefer injectable `now()` over `vi.useFakeTimers()` for reliability with async code
- Manual replacements (`preserveReplacements`) must NEVER be retried — must preserve existing behavior
- 50-second deadline may be tight with paragraph-level rewrites — if E2E times out, increase `ROUTE_DEADLINE_MS` and `DEFAULT_DEADLINE_MS` to 80_000
- Sapling rate limits: E2E test should use ONE document (~500 words) — don't use multiple large documents in tests
- Real Sapling API in E2E: skip test gracefully if `SAPLING_API_KEY` / `OPENAI_API_KEY` not set
