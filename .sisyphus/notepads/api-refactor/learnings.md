# API Refactor - Learnings

## Wave 1: Dependency Installation

### @anthropic-ai/sdk Package Installation
- **Status**: Successfully installed
- **Version**: @anthropic-ai/sdk@0.86.1
- **Location**: Added to `dependencies` in package.json
- **Verification**: 
  - `npm list @anthropic-ai/sdk` confirms installation
  - No import/typecheck errors in `src/lib/suggestions/adapters/anthropic.ts`
  - ClaudeLlmAdapter stub class can now be extended with actual SDK usage
  
### Key Findings
- Package was not present in original package.json
- Installation completed without dependency conflicts
- Pre-existing typecheck errors in test files (unrelated to this task)
- Anthropic adapter file is a stub with both `complete()` and `completeMulti()` methods throwing FileProcessingError

### Next Steps
- Task 4 (implement complete() method) can now proceed with SDK available
- SDK is ready for integration with Anthropic API calls

## Wave 1: Task 1 - AppSettings Extension + RequestSettings Update

### Copyleaks Type Extension
- **Status**: Successfully completed
- **Changes Made**:
  - Extended `AppSettings` interface with `copyleaksEmail: string` and `copyleaksApiKey: string` fields
  - Updated `DEFAULT_SETTINGS` constant to include `copyleaksEmail: ''` and `copyleaksApiKey: ''`
  - Extended `RequestSettings` interface with `copyleaksEmail: string | undefined` and `copyleaksApiKey: string | undefined`
  - Updated `getRequestSettings()` to read `x-copyleaks-email` and `x-copyleaks-api-key` headers with fallback to `COPYLEAKS_EMAIL` and `COPYLEAKS_API_KEY` env vars
  - Updated `useSettings.saveSettings()` to trim both Copyleaks fields before localStorage persistence
  - Updated `buildRequestHeaders()` to emit `x-copyleaks-email` and `x-copyleaks-api-key` headers when values are non-empty

### Design Decisions
1. **Separate Fields vs Enum**: Copyleaks credentials remain separate fields (not added to `detectionProvider` enum) to preserve existing provider selection pattern
2. **Header Omission Pattern**: Empty string credentials omit headers (allow env var fallback), consistent with existing llmApiKey/detectionApiKey pattern
3. **Header Names**: Using `x-copyleaks-*` prefix matches existing `x-llm-*` and `x-detection-*` convention
4. **Type Consistency**: Both `RequestSettings` and `AppSettings` include Copyleaks fields with same naming

### Test Fixes
- Updated 7 test cases in `src/hooks/__tests__/useSettings.test.ts` to include `copyleaksEmail: ''` and `copyleaksApiKey: ''` in all `AppSettings` object literals
- All tests now pass TypeScript type checking without modification to test logic

### Verification Status
- ✅ `npm run typecheck` passes with 0 errors
- Files modified: 3
  - `src/lib/settings/types.ts` (types, defaults)
  - `src/lib/api/requestSettings.ts` (RequestSettings, getRequestSettings)
  - `src/hooks/useSettings.ts` (saveSettings, buildRequestHeaders)
  - `src/hooks/__tests__/useSettings.test.ts` (test fixtures)

### Dependencies Established
- Task 4 (Copyleaks adapter) can now use `getRequestSettings()` to read credentials
- Task 6 (SettingsModal UI) can save/load copyleaksEmail and copyleaksApiKey
- Foundation complete for Wave 2 adapter implementation

## Wave 1: Task 3 - Copyleaks Sentence Mapping Utility

### Implementation Summary
- **File**: `src/lib/detection/copyleaks-sentences.ts`
- **Status**: ✅ Complete, all tests passing
- **Test Coverage**: 16 test cases covering all scenarios

### Key Findings

#### Sentence Splitting Algorithm
- Implemented simple punctuation-based splitter (`.`, `!`, `?`)
- Character-range tracking prevents off-by-one errors in overlap detection
- Fallback: treats entire text as single sentence if no punctuation found
- Handles edge cases: multiple punctuation (e.g., `!!?`), mixed whitespace

#### Classification Logic
1. Extract AI ranges (classification === 2) and human ranges (classification === 1)
2. For each sentence:
   - Check AI overlap → score: 1.0
   - Else check human overlap → score: 0.0
   - Else (no match) → score: 0.5
3. Priority: AI > Human > Ambiguous (prevents contradictory scores)

#### Test Coverage Details
- **All-AI**: Validates all sentences marked 1.0 when entire text is AI-classified
- **All-Human**: Validates all sentences marked 0.0 when entire text is human-classified
- **No-Match**: Validates score 0.5 for unmatched text with empty results
- **Mixed**: Tests partial overlaps, multiple match ranges, priority resolution
- **Edge Cases**: Single sentence, multiple punctuation, empty text, whitespace handling

### Type Definitions
- Added `CopyleaksResult` interface with `classification` (1=human, 2=AI) and `matches[]` structure
- Imported `DetectionSentenceResult` from types.ts for normalization

### Fixes Applied
- **useSettings.ts**: Added safe null-coalescing for trim() calls on copyleaksEmail/ApiKey
  - Changed: `next.copyleaksEmail.trim()` → `(next.copyleaksEmail ?? '').trim()`
  - Reason: Fields can be undefined before initialization, causing existing tests to fail

### Integration Notes
- Function is pure and side-effect free
- Ready for use in CopyleaksDetectionAdapter (Task 4)
- Follows existing detection adapter patterns in repo
- No external dependencies required

### Test Results
- ✅ All 16 copyleaks-sentences tests passing
- ✅ All 530 project tests passing (no regressions)
- ✅ No LSP/TypeScript errors in new code


## Task 4 – CopyleaksDetectionAdapter

### Implementation Summary
- **File**: `src/lib/detection/copyleaks.ts`
- **Test file**: `src/lib/detection/__tests__/copyleaks.test.ts`
- **Status**: ✅ Complete, 19 tests passing (all 53 detection tests pass, typecheck clean)

### Key Patterns Used

#### Token Cache Design
- Module-scope `Map<string, CachedToken>` keyed by `${email}:${apiKey}`
- 60-second safety buffer (`TOKEN_EXPIRY_BUFFER_MS`) subtracted from token expiry
- Supports `expiry` (ISO datetime string) and `expires_in` (seconds) response formats; defaults to 1 hour if both absent
- Cache key isolation with unique emails per test prevents cross-test contamination

#### API Endpoints
- Login: `POST https://id.copyleaks.com/v3/account/login/api` with `{ email, key: apiKey }`
- Detect: `POST https://api.copyleaks.com/v2/writer-detector/{scanId}/check` with `Authorization: Bearer <token>`
- scanId generated via `crypto.randomUUID()` (Node built-in, no extra import needed)

#### Detect Body
- `{ text, sandbox: boolean, sensitivity: 2 }` — NO `explain` field
- Score normalized from `response.summary.ai`
- Sentences from `mapCopyleaksResultsToSentences(text, results ?? [])`

#### Sandbox Resolution Order
1. Constructor option `sandbox` (explicit boolean)
2. `process.env.COPYLEAKS_SANDBOX === 'true'` (env fallback)
3. Defaults to `false`

#### Error Handling
- 429 on login → "Copyleaks authentication rate limit exceeded. Please try again in 5 minutes."
- Text > 25,000 chars → throw before any fetch, message contains "25,000"
- Network/timeout errors map to FileProcessingError('DETECTION_FAILED', ...)

### Test Strategy
- Used `vi.stubGlobal('fetch', vi.fn())` + `vi.unstubAllGlobals()` in beforeEach/afterEach for clean isolation
- Unique emails per test (`${name}-${Date.now()}@example.com`) prevent cross-test token cache hits
- 4 required test categories: length guard, token cache re-use, login 429, normalize detect success

## Task 5 – CompositeDetectionAdapter + analyzeText Factory Wiring

### Implementation Summary
- **New file**: `src/lib/detection/composite.ts` – `CompositeDetectionAdapter implements DetectionAdapter`
- **Modified**: `src/lib/analysis/analyzeText.ts` – `createAnalysisDetectionAdapter` accepts optional `copyleaksEmail` / `copyleaksApiKey`
- **Modified**: `src/app/api/analyze/route.ts` – passes Copyleaks credentials from `getRequestSettings()` to factory
- **Modified**: `src/lib/detection/index.ts` – barrel-exports `copyleaks` and `composite`
- **New test**: `src/lib/detection/__tests__/composite.test.ts` – 13 tests
- **Modified test**: `src/lib/detection/__tests__/detection-factory.test.ts` – +5 composite-selection tests, +2 new ENV_KEYS
- **Status**: ✅ 73 detection tests pass, typecheck clean

### Composite Adapter Behavior Matrix
| sapling | copyleaks | result |
|---------|-----------|--------|
| ✓       | ✓         | `score` from Copyleaks, `sentences` from Sapling (parallel via Promise.all) |
| ✓       | ✗         | Sapling result unchanged |
| ✗       | ✓         | Copyleaks result unchanged |
| ✗       | ✗         | `FileProcessingError('DETECTION_FAILED', 'No detection provider is configured...')` |

### Factory Selection Logic
- Copyleaks credentials resolved: `config.copyleaksEmail/ApiKey → COPYLEAKS_EMAIL/API_KEY env var`
- `hasCopyleaks = Boolean(email && apiKey)` — both must be present (partial credentials ignored)
- For `sapling` branch: if `hasCopyleaks`, wraps both in `CompositeDetectionAdapter`; otherwise returns bare `SaplingDetectionAdapter`
- GPTZero/Originality/Winston branches unchanged (no composite wrapping)

### Test Patterns Used
- `CompositeDetectionAdapter` tested with mock adapters (`{ detect: vi.fn() }`) — no real network calls
- Factory tests manipulate env vars (save/restore pattern already established)
- `CompositeDetectionAdapter` import added to factory test file alongside existing adapter imports

## Task 5 Bug Fix – Copyleaks-only factory path

### Bug
The original sapling branch threw 'Detection service is not configured.' when Sapling key was absent but Copyleaks credentials were present. It only built a Copyleaks adapter inside the Sapling case, requiring both.

### Fix
Refactored the sapling switch branch: independently compute hasSapling + hasCopyleaks; build available adapter(s); if neither throw; if sapling-only return bare Sapling; otherwise delegate to CompositeDetectionAdapter.

### Verification
76 detection tests pass, typecheck clean.

## SettingsModal Updates
- The Copyleaks section was successfully added to `SettingsModal.tsx` directly beneath the existing AI Detection section. 
- Using standard styling (`border-t border-slate-100 my-6` etc.), it blends seamlessly with the existing inputs and preserves the standard modal flow.
- `useSettings` hook natively handles standard inputs without modifying the root initialization logic for new keys (since it maps to/from localStorage and applies trimming universally to string fields). The existing `buildRequestHeaders` implementation also maps `settings.copyleaksEmail` and `settings.copyleaksApiKey` seamlessly to HTTP headers (`x-copyleaks-email` and `x-copyleaks-api-key`). No changes were strictly required outside of the UI component.

## Task 7 – Exports Finalization + Smoke Test Verification

### Implementation Summary
- **File Modified**: `src/lib/detection/index.ts`
- **Changes**: Added exports for `copyleaks`, `copyleaks-sentences`, and `composite` modules
- **Status**: ✅ Complete, all smoke tests pass

### Final Exports
```typescript
export * from './types';
export * from './sapling';
export * from './copyleaks';
export * from './copyleaks-sentences';
export * from './composite';
```

### Verification Results

#### TypeScript Type Checking
- **Command**: `npm run typecheck`
- **Status**: ✅ PASS (0 errors)
- **Duration**: < 2s

#### ESLint Linting
- **Command**: `npm run lint`
- **Status**: ✅ PASS (0 errors)
- **Duration**: < 1s

#### Unit Tests
- **Command**: `npm run test`
- **Status**: ✅ PASS (572 tests, 23 test files)
- **Duration**: 7.24s
- **Test Files**:
  - ✅ src/lib/detection/__tests__/copyleaks.test.ts (21 tests)
  - ✅ src/lib/detection/__tests__/composite.test.ts (13 tests)
  - ✅ src/lib/detection/__tests__/copyleaks-sentences.test.ts (16 tests)
  - ✅ src/lib/detection/__tests__/detection-factory.test.ts (26 tests)
  - ✅ All other tests passing (no regressions)

### Export Verification
- All new exports are properly re-exported from `detection/index.ts`
- `CompositeDetectionAdapter` available for use
- `CopyleaksDetectionAdapter` available for use
- `mapCopyleaksResultsToSentences` utility function available
- `CopyleaksResult` type available
- No breaking changes to existing exports (types, sapling remain intact)

### Final Scope Completion
- ✅ Task 1: AppSettings extension (DONE)
- ✅ Task 2: @anthropic-ai/sdk installation (DONE)
- ✅ Task 3: copyleaks-sentences utility (DONE)
- ✅ Task 4: CopyleaksDetectionAdapter (DONE)
- ✅ Task 5: CompositeDetectionAdapter + factory (DONE)
- ✅ Task 6: SettingsModal UI (DONE)
- ✅ Task 7: Exports finalization + smoke test (DONE)

All 7 tasks complete. Ready for Final Verification Wave.
