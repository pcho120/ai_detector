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

# Task 4: SettingsModal Component Learnings

## State Management
- Designed the modal as a purely controlled component without local hook dependencies
- Utilized an internal `localSettings` state initialized from the `settings` prop via `useEffect`
- This ensures any unsaved changes are cleanly discarded upon cancellation or closing by backdrop/Escape

## UI and Accessibility
- Handled keyboard events (Escape to close) securely with cleanup during unmount
- Styled overlay with standard Tailwind utilities (`fixed inset-0 z-50 bg-slate-900/50`), avoiding external libraries (no Radix/shadcn)
- Addressed accessibility effectively with `role="dialog"`, `aria-modal="true"`, and appropriate labels for ARIA screen-readers
- Applied "Coming Soon" dynamically to detection providers leveraging `STUB_DETECTION_PROVIDERS` constant array from `types.ts`

# Task 5: analyzeText.ts Refactor — Configuration Injection Learnings

## Config Injection Pattern
- Function signature changed: `createAnalysisDetectionAdapter()` → `createAnalysisDetectionAdapter(config?: { provider?: string; apiKey?: string; })`
- Injected config takes precedence: `config?.provider ?? process.env.DETECTION_PROVIDER ?? 'sapling'`
- Backward compatibility fully preserved: existing call sites with no arguments continue to work
- Pattern identical for apiKey: `config?.apiKey ?? process.env.<PROVIDER_NAME>_API_KEY`

## Stub Provider Handling
- **Key insight**: Stub provider errors only throw when explicitly requested via config
- When `config?.provider` is set to a stub provider (gptzero, originality, winston), throw `"[ProviderName] is not yet implemented"` at factory time
- When using env vars only and hitting a stub provider without an API key, maintain original behavior: `"Detection service is not configured."`
- This prevents the factory from throwing stub errors when env vars inadvertently set to stub providers

## Env Var Fallback Preserved
- Provider-aware key resolution intact: each provider has its own env var (SAPLING_API_KEY, WINSTON_API_KEY, etc.)
- Empty string header support enabled: allows routes to send empty headers for explicit fallback to env vars

## Provider Label Lookup
- Leveraged DETECTION_PROVIDER_LABELS from settings/types.ts to generate user-friendly error messages
- Case-insensitive lookup ensures robust label resolution even if provider is passed in mixed case

## Test Coverage Impact
- All 514 existing tests pass without modification
- Existing factory tests already verify stub provider detection behavior at adapter.detect() time
- Backward compatibility confirmed: no regression in stub adapter initialization

## Integration with Task 6
- Routes (analyze/route.ts, analyze/revised/route.ts) will call this with injected config from headers
- Config extraction handled by `getRequestSettings()` utility from Task 2
- Stub provider errors caught by routes and mapped to HTTP 501 response

# Task 6: Analyze Routes Update — Request Settings Integration Learnings

## Route Header Integration Pattern
- Both `/api/analyze` and `/api/analyze/revised` routes now call `getRequestSettings(req)` at the start of their analysis flow
- Settings extraction is done AFTER file validation (for /analyze) and JSON parsing (for /analyze/revised)
- This ensures invalid requests fail early with specific error messages, not header-parsing errors

## Config Injection into Adapter
- Both routes pass the same pattern: `{ provider: settings.detectionProvider, apiKey: settings.detectionApiKey }`
- Config is injected into `createAnalysisDetectionAdapter()`, overriding env vars when headers are present
- Backward compatibility maintained: routes work normally when no override headers are sent

## Error Mapping Strategy
- Stub provider errors (from Task 5) are caught as FileProcessingError with message "is not yet implemented"
- These errors are mapped to HTTP 501 (Not Implemented), distinct from configuration errors
- The exact string `'Detection service is not configured.'` is preserved and still maps to HTTP 503
- All other detection errors (API failures, missing keys) map to HTTP 502

## "Detection service is not configured." String Preservation
- The conditional logic checking for this exact string was maintained in both routes
- Error semantics are preserved: 503 for configuration issues, 502 for service failures
- This allows existing client code and tests to function without modification

## Test Coverage Validation
- All 514 tests pass without modification (24 from analyze-route, 13 from analyze-revised-route)
- Route tests already cover 503/502 behavior with the "Detection service is not configured." scenario
- New stub provider handling (501) will be validated through Task 9 QA scenarios

## Import Organization
- Added `import { getRequestSettings } from '@/lib/api/requestSettings'` to both routes
- Imports are placed logically with other file/analysis imports
- No circular dependencies: requestSettings.ts only uses standard Request object, no route-specific types

## Security Notes
- getRequestSettings() never logs API key values (enforced at utility level)
- Settings are passed as plain config object to adapter, not logged by routes
- Plan's security TODO for key encryption applies at storage layer (localStorage in Task 3), not transmission

## Integration Point
- Task 6 depends on Task 5 (analyzeText.ts config support) and Task 2 (getRequestSettings utility)
- Task 6 blocks Task 9 (page.tsx integration) which adds the actual header-building logic for fetch calls
- Routes are now ready to accept overridden provider/key combinations from client headers

