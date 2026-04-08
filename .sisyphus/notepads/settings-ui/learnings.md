# Task 1: Learnings

## Naming Conventions
- Followed existing adapter pattern from `src/lib/detection/types.ts` — JSDoc header comment explaining module purpose
- Provider label constants use UPPERCASE + simple string values matching adapter factory patterns
- Type exports use `export type` for interfaces when `isolatedModules` is enabled

## Architecture Notes
- Settings are immutable value types (simple object interface, no methods)
- Provider unions are literal unions ('openai' | 'anthropic', etc.) for strict type safety
- Constants exported separately from type to allow tree-shaking of unused provider labels

## Key Decisions
- Used `Record<AppSettings['provider'], string>` pattern for provider labels to ensure label keys match provider values
- `STUB_DETECTION_PROVIDERS` is an array (not a set/map) because it's small and order doesn't matter
- `LOCALSTORAGE_KEY` is a shared constant (no per-user variant) since settings are localStorage-only, no server sync

## Type Safety Patterns
- Default settings object matches `AppSettings` interface — ensures no field omissions at compile time
- Provider literals are repeated in interface and label constants — no string enum (keeps types compatible with plain objects)
# useSettings Hook Implementation Learnings

## SSR Hydration Pattern
- **Key finding**: useEffect is the correct place for localStorage reads
- localStorage access in useState initializer causes hydration mismatches in Next.js
- The `isLoaded` flag gates rendering until hydration completes
- Pattern: `useState(defaultValue)` → `useEffect(() => { load & set })` → return `{ state, isLoaded }`

## Trimming API Keys
- Implemented whitespace trimming in `saveSettings` for both llmApiKey and detectionApiKey
- Trim happens before localStorage save, so persisted state is always clean
- Tests confirm trimmed values are stored and retrieved correctly

## buildRequestHeaders Helper
- Correctly handles empty strings by omitting them from headers object
- Only non-empty provider and key fields are included
- Empty API keys do NOT create headers - allows server env-var fallback
- Returns plain object (Record<string, string>) suitable for fetch headers

## Testing with React Testing Library
- Effects run synchronously in jsdom environment
- Tests using `waitFor` are reliable for isLoaded state transitions
- localStorage mock from vitest works seamlessly with hook

## TODO Comment Placement
- Security TODO added at point where keys are persisted to localStorage
- Matches plan requirement for future encryption implementation

# Task 2: getRequestSettings Server Utility Learnings

## Header-to-Env Fallback Pattern
- Priority order is strictly: non-empty header → env var → default/undefined
- Empty string headers (after `.trim()`) are treated as absent, not as valid values
- This allows client to send empty string to explicitly fall back to server env var

## Request Object Compatibility
- Used standard Web `Request` object with `req.headers.get()` (NOT `next/headers`)
- This pattern is route-handler compatible and works with both NextRequest and standard Request
- Allows testing with vanilla `new Request()` without Next.js runtime dependencies

## Provider-Aware Key Resolution
- Detection API key resolution is provider-aware using switch statement
- Each provider has its own env var: SAPLING_API_KEY, GPTZERO_API_KEY, ORIGINALITY_API_KEY, WINSTON_API_KEY
- Provider name lookup is case-insensitive to handle user input robustly

## TypeScript Union Handling
- Return type uses `string | undefined` for optional keys, not `string | null`
- Providers always resolve to string (never undefined) due to defaults
- Test suite covers all provider cases to ensure type safety

## Testing Strategy
- 25 unit tests covering all resolution paths and combinations
- Key scenarios: header override, env var fallback, default values, whitespace trimming
- Spy on console.log to verify no key leakage (security contract)
- All tests use standard `new Request()` without Next.js mocks

## Integration Notes
- Next task (Task 5+) will inject RequestSettings into adapter constructors
- Route handlers will call `getRequestSettings(req)` and destructure needed fields
- Pattern maintains clean separation: utility never logs keys, routes control logging behavior
