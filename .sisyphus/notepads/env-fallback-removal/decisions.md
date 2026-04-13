# Decisions — env-fallback-removal

## [2026-04-11] Plan Start

### Decision: COPYLEAKS_SANDBOX defaults to false
- Rationale: This is a feature flag, not an API key. User has no need to configure sandbox mode via Settings UI.
- Default: `false` (safe production default)

### Decision: Keep provider name defaults (openai, sapling)
- Rationale: Provider name is not sensitive — hardcoding sensible defaults is fine
- API Keys however: NEVER default — must be undefined when not in headers

### Decision: Error messages reference Settings UI
- OLD: "Set DETECTION_PROVIDER to 'sapling', 'winston', 'originality', or 'gptzero'."
- NEW: "Unknown detection provider: "X". Select a valid detection provider in Settings (sapling, winston, originality, or gptzero)."

### Decision: TDD approach
- Task 1: Update tests to expect no env fallback (RED — tests will fail)
- Task 2: Modify requestSettings.ts to remove env fallbacks (GREEN — tests pass)
- Wave 2 continues same pattern per-module
