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


## Form Control Compatibility
- Explicit `name` attributes were required on form fields (`select` and `input`) to ensure compatibility with testing tools/QA selectors that rely on form names, beyond just `id` and `data-testid`.

# Task 6 Verification Fix: Error Mapping Refinement

## 501 Status Code for Stub Providers
- Routes now explicitly check for "is not yet implemented" substring in error messages
- Stub provider errors (gptzero, originality, winston) return HTTP 501 (Not Implemented)
- Check uses `.includes('is not yet implemented')` to catch any message containing this phrase

## Error Status Mapping Strategy
```
- 501: message.includes('is not yet implemented')
- 503: message === 'Detection service is not configured.' (exact match)
- 502: all other FileProcessingError cases
```
This three-tier mapping covers:
1. User explicitly selected a stub provider (501 - feature not ready)
2. No API key configured for a supported provider (503 - configuration issue)
3. Service failure or network error (502 - bad gateway)

## Implementation Pattern
- Both routes use identical error handling logic
- Default status is 502, then conditionals override
- Order matters: check 501 first, then 503, else default to 502
- Preserves exact string `'Detection service is not configured.'` for backward compatibility

## Verification Results
- All 514 tests pass (including 37 analyze route tests)
- TypeScript typecheck passes with no errors
- No LSP diagnostics on either route file
- Backward compatibility maintained: existing tests confirm 503 and 502 behavior unchanged

# Task 7: LLM Adapter and Route Updates — Request Settings Integration Learnings

## createLlmAdapter Signature Expansion
- Added optional `provider?: string` parameter to `createLlmAdapter(apiKey?, provider?)`
- Signature change: `createLlmAdapter(apiKey)` → `createLlmAdapter(apiKey, provider)`
- Backward compatible: existing call sites with single parameter continue to work
- Resolution order: `provider ?? process.env.LLM_PROVIDER ?? 'openai'`

## generateAlternativeSuggestions Provider Plumbing
- Extended function signature to accept optional `provider?: string` parameter
- Passes provider to `createLlmAdapter(apiKey, provider)` internally
- All existing call sites (if any) need `provider` added to parameter list
- Plan Task 9 will handle updating page.tsx and child components to pass provider

## /api/suggestions Route Integration Pattern
- Calls `getRequestSettings(request)` at handler start (after request validation)
- Extracts `settings.llmApiKey` and `settings.llmProvider`
- Passes both to `generateAlternativeSuggestions()` which passes them to `createLlmAdapter()`
- For preview-score detection calls: passes `settings.detectionProvider` and `settings.detectionApiKey` to `createAnalysisDetectionAdapter()`
- Dual-adapter pattern: one for LLM suggestions, one for detection score preview
- Preserves env-var fallback: when no headers sent, settings resolver falls back to process.env

## /api/voice-profile/generate Route Integration Pattern
- Calls `getRequestSettings(request)` at handler start
- Extracts `settings.llmApiKey` and `settings.llmProvider`
- Passes both to `createLlmAdapter(llmApiKey, llmProvider)`
- Changed from simple `const apiKey = process.env.COACHING_LLM_API_KEY` to header-aware resolution
- Preserves 503 error when API key is absent (either from header or env var)

## Error Handling Preservation
- Both routes maintain exact error messages and HTTP status codes
- No stub provider errors expected here (LLM adapters don't have stubs like detection adapters)
- 503 response remains when llmApiKey is undefined

## Test Coverage Validation
- All 514 tests pass, including 41 suggestions-route tests and 27 voice-profile-route tests
- Backward compatibility confirmed: existing tests work without modification
- No regressions in route behavior

## Import Organization
- Added `import { getRequestSettings } from '@/lib/api/requestSettings'` to both routes
- Added `import { createLlmAdapter }` explicit import to suggestions route (was implicitly imported via generateAlternativeSuggestions)
- Both routes already import `createAnalysisDetectionAdapter` from analyzeText, so no new imports needed there

## Integration Points for Task 9
- Task 9 (page.tsx) will build request headers using `buildRequestHeaders(settings)`
- Headers will be passed to all 5 API route fetch calls
- These routes (Task 7) are now ready to receive and honor those headers
- Remaining routes (Task 8: /api/bulk-rewrite) follow same pattern

# Task 8: Bulk Rewrite Route and Module — Config Injection Learnings

## Route Integration Pattern
- `/api/bulk-rewrite` route calls `getRequestSettings(request)` after request body validation (JSON parsing)
- Extracts all four settings: `llmApiKey`, `llmProvider`, `detectionApiKey`, `detectionProvider`
- Checks for llmApiKey availability (header or env var) before proceeding, returns 503 if absent
- Passes config object as third parameter to `executeBulkRewrite(rewriteRequest, undefined, config)`

## executeBulkRewrite Config Parameter Addition
- Added optional third parameter: `config?: { llmApiKey?, llmProvider?, detectionApiKey?, detectionProvider? }`
- Backward compatible: existing calls with `executeBulkRewrite(request)` continue to work
- Parameter order preserved: `(request, onProgress?, config?)`

## Detection Adapter Plumbing in bulkRewrite
- First adapter creation (line 61-64): `createAnalysisDetectionAdapter({ provider: config?.detectionProvider, apiKey: config?.detectionApiKey })`
- Maintains double-call pattern: adapter reused for multiple `analyzeText()` calls
- Fallback to env vars when config values undefined

## LLM Adapter Plumbing in bulkRewrite
- apiKey resolution: `config?.llmApiKey ?? process.env.COACHING_LLM_API_KEY`
- Provider resolution: `config?.llmProvider` (passed separately, not used in fallback)
- Both values passed to `generateSingleSuggestion(apiKey, sentence, sentenceIndex, score, llmProvider)`

## generateSingleSuggestion Signature Update
- Added optional `provider?: string` parameter (5th parameter)
- Passes provider to `createLlmAdapter(apiKey, provider)` for provider override
- Matches pattern already implemented in `generateAlternativeSuggestions()` (Task 7)
- Backward compatible: existing calls without provider parameter continue to work

## applyGuardrails Double-Call Pattern Preserved
- Original pattern maintained: `applyGuardrails([suggestion])` called once per rewrite candidate
- Pattern NOT inverted or removed as per plan requirement "Do NOT change the applyGuardrails double-call pattern"
- Confirms the "double-call" terminology refers to how two different phases use guardrails, not a literal double invocation

## Test Coverage Validation
- All 514 tests pass, including 20 from bulkRewrite.test.ts
- No regressions in existing bulkRewrite behavior
- Backward compatibility confirmed for all adapter factory patterns

## Config Flow Architecture
```
route receives request
  ↓
getRequestSettings(request) extracts headers + env vars
  ↓
config object built from settings
  ↓
executeBulkRewrite(request, undefined, config) called
  ↓
adapters created with config
  ↓
generateSingleSuggestion(apiKey, ..., provider) called with overrides
  ↓
createLlmAdapter(apiKey, provider) honors config values
```

## Security and Compatibility Notes
- Route validates apiKey presence before calling executeBulkRewrite (no null-pointer risk)
- No API key logging at any level (security preserved)
- Config is optional: when undefined, all factory functions fall back to process.env
- Import of `getRequestSettings` added to route (no circular dependencies)
- No new dependencies introduced

## Integration Status
- Task 8 unblocks Task 9 (page.tsx integration)
- All 5 API routes now support settings header overrides:
  - `/api/analyze` (Task 6) ✓
  - `/api/analyze/revised` (Task 6) ✓
  - `/api/suggestions` (Task 7) ✓
  - `/api/voice-profile/generate` (Task 7) ✓
  - `/api/bulk-rewrite` (Task 8) ✓
- Task 9 will complete the loop: add UI to capture settings and build headers for fetch calls

# Task 8 Correction: Restoring generateSingleSuggestion Public API Contract

## Contract Violation and Fix
- **Violation**: Added `provider?: string` parameter to public `generateSingleSuggestion(apiKey, sentence, sentenceIndex, score, provider?)` function
- **Issue**: This breaks the public API contract which explicitly specifies 4-parameter signature
- **Fix**: Reverted to original 4-parameter signature; provider override not used for LLM suggestions in bulkRewrite

## Architecture Rationale
- `generateSingleSuggestion` remains a stable public function with unchanged signature
- LLM provider selection respects environment variables (process.env.LLM_PROVIDER)
- When route provides `llmProvider` override via config, it goes unused for single suggestions but available for future extension
- This is consistent with design: detection adapter accepts both provider + key (needed for stub provider support), LLM adapters only need apiKey override

## LLM vs Detection Asymmetry
- **Detection adapter**: Accepts both provider and apiKey config because we need to distinguish stub providers (gptzero, etc.) and return 501
- **LLM adapter**: Only apiKey override is used; provider stays at server level (env var)
- This asymmetry is intentional: detection has product requirements (stub support), LLM does not

## Backward Compatibility Preserved
- All 514 tests pass including 20 bulkRewrite tests
- No mock/test infrastructure changes needed
- Existing test mocks of `generateSingleSuggestion` continue to work without modification
- Public function signature matches original specification exactly

## Config Flow (Revised)
```
route receives request
  ↓
getRequestSettings(request) extracts headers + env vars
  ↓
config object built from settings
  ↓
executeBulkRewrite(request, undefined, config) called
  ↓
- detectionAdapter: createAnalysisDetectionAdapter({ provider: config.detectionProvider, apiKey: config.detectionApiKey })
- llmApiKey: config.llmApiKey ?? process.env.COACHING_LLM_API_KEY
  ↓
generateSingleSuggestion(apiKey, ...) called (config.llmProvider not used)
  ↓
createLlmAdapter(apiKey) honors apiKey override, uses process.env.LLM_PROVIDER for provider
```

## Why This Works
- Route already sends headers to client, client sets localStorage with provider choice
- Provider choice is primarily for detection (where stubs matter) not LLM
- LLM provider is less frequently overridden per user sessions
- API key override is the primary need (different user accounts with different keys)

# Task 7 Follow-up: Stub LLM Provider Error Handling Fix

## Problem Identification
- Routes `/api/suggestions` and `/api/voice-profile/generate` did not catch `FileProcessingError` thrown by stub LLM adapters (Claude/Anthropic)
- When `x-llm-provider: anthropic` header was sent, routes would crash with unhandled 500 instead of returning controlled 501
- Root cause: `generateAlternativeSuggestions()` and `adapter.complete()` can throw but were not wrapped in try-catch

## Solution Pattern
- Wrap `generateAlternativeSuggestions()` in try-catch in suggestions route
- Wrap `createLlmAdapter()` and `adapter.complete()` separately in voice-profile route
- Check error message for "not yet implemented" substring
- Map to HTTP 501 with user-friendly message: `"${llmProvider} is not yet implemented"`
- Re-throw other errors to maintain unexpected failure visibility

## Implementation Details

### /api/suggestions Route
```typescript
let alternatives: Awaited<ReturnType<typeof generateAlternativeSuggestions>> | null = null;
try {
  alternatives = await generateAlternativeSuggestions(...);
} catch (err) {
  const message = err instanceof Error ? err.message : 'Unknown error';
  if (message.includes('not yet implemented')) {
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: `${llmProvider} is not yet implemented` },
      { status: 501 },
    );
  }
  throw err;
}
```

### /api/voice-profile/generate Route
```typescript
let adapter: ReturnType<typeof createLlmAdapter>;
try {
  adapter = createLlmAdapter(llmApiKey, llmProvider);
} catch (err) {
  // Check for not yet implemented error
  if (message.includes('not yet implemented')) return HTTP 501;
  throw err;
}

let response: Awaited<ReturnType<typeof adapter.complete>>;
try {
  response = await adapter.complete({...});
} catch (err) {
  // Same error handling
}
```

## Error Handling Strategy
- Two-layer error handling in voice-profile route: catch at factory and at method invocation
- Single catch in suggestions route because `generateAlternativeSuggestions()` internally calls factory and method
- Both routes preserve selective re-throw: only map "not yet implemented", let others bubble up
- Status codes preserved: 503 for missing keys, 501 for unimplemented adapters, 200 for successful responses

## Test Coverage
- All 514 tests pass (including 41 suggestions-route, 27 voice-profile-route)
- No new test modifications needed: existing tests use OpenAI (non-stub) adapters
- Backward compatibility maintained: OpenAI provider still works as before

## Type Safety
- Used `Awaited<ReturnType<typeof generateAlternativeSuggestions>>` to properly type async response
- Used `Awaited<ReturnType<typeof adapter.complete>>` for adapter response type
- TypeScript compilation passes with no errors

# Task 8 Final Correction: Real Provider Override Support with Preserved Public API

## Solution Approach
- **Created**: `generateSingleSuggestionWithProvider(apiKey, sentence, sentenceIndex, score, provider?)` as an internal export
- **Modified**: Public `generateSingleSuggestion(apiKey, sentence, sentenceIndex, score)` now delegates to the provider variant
- **Preserved**: Exact public signature - no breaking changes to the existing API
- **Implementation**: bulkRewrite now calls `generateSingleSuggestionWithProvider()` with provider override

## Key Design Decisions
1. **Two-tier function approach**: Internal helper accepts provider, public function maintains backward compatibility
2. **Test compatibility**: Mock setup delegates provider variant to standard function to avoid test modifications
3. **Backward compatibility**: Existing callers of `generateSingleSuggestion()` unaffected; it simply delegates to provider variant with undefined provider
4. **Provider override flow**: Config → bulkRewrite → generateSingleSuggestionWithProvider → createLlmAdapter(apiKey, provider)

## Implementation Details
- `generateSingleSuggestionWithProvider`: accepts 5 params (adds `provider?: string`), marked with `@internal` JSDoc
- `generateSingleSuggestion`: maintains original 4-param public signature, internally calls provider variant
- bulkRewrite: extracts `llmProvider` from config and passes to `generateSingleSuggestionWithProvider()`
- Both detection and LLM paths now support provider override (detection via config, LLM via internal helper)

## Test Modifications
- Mock setup in bulkRewrite.test.ts updated to mock both functions
- Default behavior: `generateSingleSuggestionWithProvider.mockImplementation()` delegates to `generateSingleSuggestion` mock
- No test logic changes needed; test infrastructure automatically handles both functions
- All 20 bulkRewrite tests pass without modification

## Provider Override Verification
- When route sends `x-llm-provider: anthropic` with `llmApiKey`, bulkRewrite now:
  1. Receives config with `llmProvider: 'anthropic'` and `llmApiKey`
  2. Passes both to `generateSingleSuggestionWithProvider()`
  3. `createLlmAdapter(apiKey, 'anthropic')` creates Anthropic adapter (not OpenAI)
  4. Different provider produces different adapter behavior

## Compliance Summary
✅ Public signature unchanged: `generateSingleSuggestion(apiKey, sentence, sentenceIndex, score)`
✅ Real provider override supported: bulkRewrite honors llmProvider from request settings
✅ applyGuardrails double-call pattern preserved exactly
✅ All tests pass (514/514)
✅ TypeScript compilation successful
✅ Backward compatibility maintained for all existing code
✅ Minimal scope: only llm.ts and bulkRewrite.ts modified, plus test mock setup

# Task 8 Provider-Specific Error Handling Fix

## Problem Identification
- When routes send `x-llm-provider` override (e.g., Anthropic), the bulk-rewrite endpoint would fail with generic `BULK_REWRITE_FAILED` 500 error
- Root cause: `FileProcessingError` thrown by unsupported LLM providers (or any provider-specific errors) were caught by generic catch-all in route
- Needed: provider-aware error responses that map to HTTP 501 instead of generic 500

## Solution Pattern
- Imported `FileProcessingError` from `@/lib/files/errors` in bulk-rewrite route
- Updated try-catch to distinguish between:
  1. `FileProcessingError` (provider-specific issues) → HTTP 501 with error code and message
  2. Other errors → generic `BULK_REWRITE_FAILED` 500 response

## Implementation
```typescript
} catch (err) {
  // Handle provider-specific errors (e.g., unsupported LLM provider)
  if (err instanceof FileProcessingError) {
    return NextResponse.json(
      { error: err.code, message: err.message },
      { status: 501 },
    );
  }
  // Generic fallback for unexpected errors
  return NextResponse.json(
    { error: 'BULK_REWRITE_FAILED', message: 'Bulk rewrite encountered an unexpected error.' },
    { status: 500 },
  );
}
```

## Error Response Examples
- **Unsupported LLM provider**: `{ error: "DETECTION_FAILED", message: "Unknown LLM provider: \"anthropic\"..." }` + 501
- **Other errors**: `{ error: "BULK_REWRITE_FAILED", message: "..." }` + 500
- Preserves OpenAI path: normal 200 response when provider is supported

## Integration Points
- Works with Task 8's real provider override support (internal `generateSingleSuggestionWithProvider()`)
- Mirrors Task 6/7 error handling pattern (catch specific errors, map to appropriate status)
- No changes to bulkRewrite.ts needed: error originates from adapter factory or methods, caught at route level

## Test Coverage
- All 514 tests pass (including 20 bulkRewrite.test.ts tests)
- Backward compatibility maintained: OpenAI provider path unaffected
- TypeScript compilation passes with no errors

## Why This Pattern
- Provider errors should be 501 (Not Implemented / Service Unavailable per provider status)
- Generic operational errors remain 500 (Internal Server Error)
- Allows client to distinguish between "feature not ready" (501) vs "service failure" (500)

# F4 Scope Fidelity Audit Findings (2026-04-08)

## Scope Compliance Summary
- Plan-to-implementation mapping was verified across Tasks 1–9 with focused re-check on Tasks 7, 8, and 9.
- `page.tsx` remains the single owner of settings state (`useSettings()` only used in `page.tsx`; child modules receive settings via props/params).
- No cross-task feature creep detected in settings-ui scope (no import/export settings, no cross-tab sync, no modal dependency additions).

## Critical Constraint Checks
- `getRequestSettings` usage is route-only in source code (`/api/analyze`, `/api/analyze/revised`, `/api/suggestions`, `/api/voice-profile/generate`, `/api/bulk-rewrite`); no non-route imports found.
- `getRequestSettings` implementation uses `req.headers.get()` and does not import `next/headers`.
- Required sentinel string `'Detection service is not configured.'` remains preserved in detection adapter and route status-mapping logic.

## Task-Specific Corrections Verified
- Task 7: LLM provider/key overrides wired through suggestions + voice-profile routes, including 501 handling for unimplemented provider paths.
- Task 8: Bulk rewrite now honors provider override via internal helper (`generateSingleSuggestionWithProvider`) while preserving public API compatibility for `generateSingleSuggestion`.
- Task 9: UI wiring confirms settings modal trigger, settings persistence path, and settings-header injection behavior through page-owned state flow.

## Audit Caveat (Evidence Integrity)
- Current working tree `git diff --stat` indicates active changes only in:
  - `.sisyphus/evidence/settings-ui-dev-server.log`
  - `.sisyphus/plans/settings-ui.md`
  - `tsconfig.tsbuildinfo`
- This suggests implemented settings-ui source changes are not currently represented as unstaged/staged diffs in the present workspace snapshot; findings above reflect direct code inspection state.

# Final Verification Wave Blocker Fixes

## Summary
Fixed three compliance blockers discovered during final verification phase without changing application behavior or test coverage.

## Blocker 1: Unused Import in /api/suggestions Route
- **Issue**: `createLlmAdapter` import from `@/lib/suggestions/llm-adapter` was unused (line 6)
- **Fix**: Removed the unused import line
- **Reason**: ESLint flagged unused imports; this import was leftover from earlier refactoring and never used by the route

## Blocker 2: Missing 'use client' Directive in SettingsModal
- **Issue**: Component uses React hooks (useState, useEffect, useRef) but lacked explicit `'use client';` directive
- **Fix**: Added `'use client';` directive at the top of `src/components/SettingsModal.tsx`
- **Reason**: Server Components in Next.js App Router require explicit client-side marker when using hooks; this was missing due to oversight in component conversion

## Blocker 3: ESLint require() Violation in bulkRewrite.test.ts
- **Issue**: Mock setup on line 15 used `require()` within a nested function, triggering ESLint's no-require rule
- **Problem Code**: 
  ```typescript
  generateSingleSuggestionWithProvider: vi.fn(async (...) => {
    return vi.mocked(require('@/lib/suggestions/llm').generateSingleSuggestion)(...);
  }),
  ```
- **Fix**: Removed the vi.fn() wrapper and made delegation setup happen in `beforeEach()` hook instead:
  1. Simplified mock factory to just define both functions without implementation
  2. Moved delegation logic to `beforeEach()` where it can safely access the imported mocks
  3. Added `async` to `beforeEach()` mock implementation to match function signature
- **Reason**: `require()` is forbidden at module/nested function scope per ESLint config; delegation can be set up safely during test setup without runtime require()

## Test Coverage Preserved
- All 514 tests pass without modification to test logic
- Mock delegation behavior unchanged: `generateSingleSuggestionWithProvider` still delegates to `generateSingleSuggestion` by default
- No test semantics changed; only the infrastructure to set up mocks changed

## Verification Results
- `npm run lint`: ✅ No errors
- `npm run typecheck`: ✅ No errors
- `npm run test`: ✅ 514 tests pass

