# Task 3: useSettings Hook - COMPLETED

## Files Created
1. `src/hooks/useSettings.ts` - SSR-safe localStorage hook + buildRequestHeaders helper
2. `src/hooks/__tests__/useSettings.test.ts` - 11 unit tests, all passing

## Implementation Details

### useSettings Hook
- Marks file with `'use client'`
- Initializes with DEFAULT_SETTINGS
- Reads localStorage ONLY in useEffect (never in useState initializer)
- Provides `isLoaded` flag for SSR hydration safety
- Trims whitespace from both llmApiKey and detectionApiKey before saving
- Includes security TODO comment for future encryption

### buildRequestHeaders Helper
- Exported alongside hook
- Takes AppSettings and returns HeadersInit object
- Only includes non-empty headers (empty API keys are omitted)
- Allows server env-var fallback when client has no config

## Test Coverage (11 tests, all passing)
1. Initializes with DEFAULT_SETTINGS ✓
2. isLoaded becomes true after mount ✓
3. Saves settings to localStorage ✓
4. Loads saved settings on mount ✓
5. Trims whitespace from API keys ✓
6. Updates settings state on save ✓
7. Handles invalid JSON gracefully ✓
8. buildRequestHeaders includes all non-empty settings ✓
9. buildRequestHeaders omits empty keys ✓
10. buildRequestHeaders returns empty for DEFAULT_SETTINGS ✓
11. buildRequestHeaders returns valid HeadersInit ✓

## Verification
- `npx vitest run src/hooks/__tests__/useSettings.test.ts` → 11/11 passed ✓
- `npx vitest run` (full suite) → 514/514 passed ✓
- `npx lsp_diagnostics` → No errors on both files ✓

## Dependencies & Context
- Depends on Task 1: AppSettings types created ✓
- Blocks Task 4: SettingsModal component (uses hook API)
- Blocks Task 9: page.tsx integration (will call this hook)

## Notes
- No new npm dependencies added
- No cross-tab sync implemented (per plan constraints)
- No server-side code in this hook (strictly client)
- Ready for SettingsModal and page.tsx integration
