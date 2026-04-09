# API Refactor - Decisions

## Task 1: Type Extension Pattern

### Decision: Copyleaks as Separate Fields vs Enum Entry
- **Chosen**: Separate fields (`copyleaksEmail`, `copyleaksApiKey`)
- **Rationale**:
  - Copyleaks uses email+apiKey pair (2 values), while other providers use single key
  - Keeps existing `detectionProvider` enum clean (only Sapling, GPTZero, Originality, Winston)
  - Allows independent Copyleaks configuration without changing provider selection logic
  - Enables parallel detection provider + Copyleaks configuration (per plan requirement)
  - Simpler migration: existing provider selection works unchanged

### Decision: Header Naming Convention
- **Chosen**: `x-copyleaks-email` and `x-copyleaks-api-key`
- **Rationale**:
  - Matches existing `x-llm-*` and `x-detection-*` custom header patterns
  - Clear intent via naming (no ambiguity)
  - Consistent with HTTP custom header convention (lowercase, hyphen-separated)

### Decision: Empty String Omission Pattern
- **Chosen**: Omit header if value is empty string (allow env var fallback)
- **Rationale**:
  - Matches existing pattern for `llmApiKey` and `detectionApiKey`
  - Allows server-side env var override when client doesn't provide value
  - Clean fallback chain: header → env var → undefined

### Decision: Trim Behavior
- **Chosen**: Trim all key/email fields in `saveSettings()` before localStorage
- **Rationale**:
  - Prevents accidental whitespace-only values from causing auth failures
  - Consistent with existing trim logic for LLM and detection keys
  - Reduces user-side debugging when copy-pasting values with spaces

## Task 1: Implementation Notes
- No breaking changes to existing behavior
- Backward compatible (existing stored settings + default values work unchanged)
- Copyleaks adapter can be integrated independently without modifying provider selection logic

## Task 4 – CopyleaksDetectionAdapter Design Decisions

### 1. Module-scope token cache vs instance-scope
**Decision**: Module-scope `Map` keyed by `${email}:${apiKey}`.
**Rationale**: Multiple adapter instances created per-request (e.g., in a Next.js serverless function) would lose cached tokens if stored on the instance. Module-scope survives across requests within the same process, avoiding unnecessary login calls. The key isolation ensures different credential pairs don't interfere.

### 2. No `explain: true` in detect body
**Decision**: Omit `explain` entirely rather than sending `explain: false`.
**Rationale**: Task spec explicitly says "Do NOT send `explain: true`; omit explain entirely." Omitting is cleaner than explicitly setting false and avoids any potential API behavior change.

### 3. `summary.ai` as overall score
**Decision**: Use `data.summary.ai` directly as the `DetectionResult.score`.
**Rationale**: Per task spec. The Copyleaks API `summary` object contains `ai` as a 0–1 score representing AI likelihood, consistent with our score convention (0 = human, 1 = AI). No inversion needed.

### 4. `crypto.randomUUID()` from Node built-in
**Decision**: Import `crypto` from `'node:crypto'` rather than relying on `globalThis.crypto`.
**Rationale**: Next.js App Router API routes run on Node.js. Using `node:crypto` is explicit and reliable. `globalThis.crypto` is available in modern Node but the explicit import makes the dependency clear and avoids confusion with browser crypto.

### 5. Test isolation via unique email per test
**Decision**: Append `Date.now()` to email in tests that exercise the cache.
**Rationale**: The module-scope cache persists across tests in the same test file. Using unique emails prevents a cached token from a previous test leaking into a subsequent test and masking login call expectations.

## Task 5 – CompositeDetectionAdapter Design Decisions

### 1. Composite only for Sapling provider branch
**Decision**: Only wrap Sapling in a `CompositeDetectionAdapter` when Copyleaks creds are present. Winston/Originality/GPTZero branches do not composite with Copyleaks.
**Rationale**: Per task spec: "Copyleaks score + Sapling sentences" is the merge strategy. It relies on Sapling producing per-sentence granularity. Winston/Originality/GPTZero are stub adapters; pairing them with Copyleaks would be meaningless and outside scope.

### 2. `hasCopyleaks` requires BOTH email and apiKey
**Decision**: `hasCopyleaks = Boolean(copyleaksEmail && copyleaksApiKey)` — partial credentials (email only, or key only) skip composite and fall back to Sapling-only.
**Rationale**: `CopyleaksDetectionAdapter` constructor throws if either is missing. Failing silently at the factory is better than failing deep in the adapter mid-request. Consistent with the empty-string omission pattern for other providers.

### 3. Merge rule: Copyleaks score, Sapling sentences
**Decision**: In the both-present path, return `{ score: copyleaksResult.score, sentences: saplingResult.sentences }`.
**Rationale**: Per task spec ("use Copyleaks score and Sapling sentences"). Copyleaks provides a reliable overall AI probability; Sapling provides rich per-sentence breakdown that powers highlights.

### 4. `Promise.all` for parallelism
**Decision**: Run both adapters concurrently with `Promise.all([sapling.detect(text), copyleaks.detect(text)])`.
**Rationale**: The two providers are independent; running them sequentially doubles latency. Parallel execution keeps total latency bounded by the slower provider.

### 5. No-provider error message
**Decision**: Error message: `"No detection provider is configured. Set SAPLING_API_KEY and/or COPYLEAKS_EMAIL + COPYLEAKS_API_KEY."`
**Rationale**: Must be actionable — tells the operator exactly what env vars to set. Distinct from "Detection service is not configured." (missing key for chosen provider) to aid debugging.
