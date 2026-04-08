# Settings UI — API Key & Provider Configuration

## TL;DR

> **Quick Summary**: Build a Settings modal (triggered from the main page) that lets users input their own API keys and select LLM/Detection providers, persisted to localStorage and sent as request headers to override server-side env vars.
>
> **Deliverables**:
> - `AppSettings` TypeScript type + `getRequestSettings()` server utility
> - `useSettings` SSR-safe localStorage hook
> - `SettingsModal` Tailwind-only component (no new npm deps)
> - `createAnalysisDetectionAdapter()` refactored to accept injected config
> - All 5 API routes updated to read override headers
> - Settings trigger button on main page
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (types) → Task 2 (getRequestSettings) → Task 5 (analyzeText refactor) → Task 6 (analyze routes) → Tasks 7–8 (remaining routes) → Task 9 (page integration) → Final Wave

---

## Context

### Original Request
Build a Settings UI where users can input `SAPLING_API_KEY`, `COACHING_LLM_API_KEY`, and select LLM/Detection providers — saved to localStorage and applied to all API requests.

### Interview Summary
**Key Discussions**:
- **Storage**: localStorage (no server-side persistence, no auth)
- **Location**: Modal/Slideover triggered from the main page (no new routes)
- **Providers**: All current adapters — LLM: OpenAI + Anthropic; Detection: Sapling + GPTZero + Originality + Winston
- **analyzeText.ts**: Include config injection in this plan (not deferred)

**Research Findings**:
- No modal/dialog library exists — must be custom Tailwind-only
- `COACHING_LLM_API_KEY` referenced in 5 places across routes + lib files
- `createAnalysisDetectionAdapter()` in `analyzeText.ts` reads `process.env.DETECTION_PROVIDER` directly — requires refactor
- SSR hydration risk: `localStorage` must be read in `useEffect`, not `useState` initializer
- `getRequestSettings` must live in route-handler-only scope — `headers()` from `next/headers` throws outside request context

### Metis Review
**Identified Gaps** (addressed):
- No `AppSettings` type existed → Task 1 defines it first
- `analyzeText.ts` direct env var read → Task 5 refactors with injected config
- Empty string headers treated as present → `getRequestSettings` must treat `""` as absent
- Stub adapters (GPTZero, Winston, Originality) need explicit 501 behavior → Task 3 handles
- No SSR hydration guard on hook → Task 3 mandates `useEffect` + `isLoaded` pattern
- No modal a11y (Escape key, backdrop click, aria-modal) → Task 9 mandates these

---

## Work Objectives

### Core Objective
Enable users to configure their own API keys and provider choices in-app, persisted across sessions, applied to all API calls without requiring env var changes.

### Concrete Deliverables
- `src/lib/settings/types.ts` — `AppSettings` type + `PROVIDER_LABELS` constants
- `src/lib/api/requestSettings.ts` — `getRequestSettings(req)` server utility
- `src/hooks/useSettings.ts` — SSR-safe localStorage hook
- `src/components/SettingsModal.tsx` — Tailwind-only settings modal
- `src/lib/analysis/analyzeText.ts` — `createAnalysisDetectionAdapter()` accepts injected config
- All 5 API routes updated to read and apply override headers

### Definition of Done
- [ ] `npm run test` → 0 failures
- [ ] Settings saved to localStorage survive page reload
- [ ] All API routes send correct provider/key based on settings headers
- [ ] Stub providers (GPTZero, Winston, Originality) return HTTP 501 when selected
- [ ] Modal closes on Escape key and backdrop click

### Must Have
- `AppSettings` type defined before any component or hook
- `getRequestSettings` treats empty string as absent (falls back to env var)
- All 5 API routes updated (not just LLM routes)
- `useSettings` hook uses `useEffect` for localStorage hydration with `isLoaded` gate
- `page.tsx` owns the single `useSettings()` instance; `settings` + `saveSettings` are passed as props to `SettingsModal` and `buildRequestHeaders(settings)` is used in all fetch calls — do NOT call `useSettings()` inside `SettingsModal` or child components
- Modal: Escape key, backdrop click close, `aria-modal="true"` — no external library
- Whitespace trimmed from all API key inputs before saving
- Stub adapters return HTTP 501 with message `"[Provider] is not yet implemented"`

### Must NOT Have (Guardrails)
- No new npm dependencies for modal
- No API key values in logs (only log boolean presence)
- No live key validation (validate at use-time)
- No localStorage encryption in v1 (add `// TODO(security): encrypt API keys before storing`)
- No multi-key-per-provider
- No import/export settings feature
- No cross-tab sync
- `getRequestSettings` must NOT be imported in non-route files (throws outside request context)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (Vitest)
- **Automated tests**: Tests-after (not TDD)
- **Framework**: Vitest

### QA Policy
Every task has agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Playwright — navigate, interact, assert DOM, screenshot
- **API/Backend**: Bash (curl) — assert status + response fields

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — types + utilities, no dependencies):
├── Task 1: AppSettings type + provider constants            [quick]
├── Task 2: getRequestSettings server utility               [quick]
└── Task 3: useSettings localStorage hook                   [quick]

Wave 2 (After Wave 1 — core logic + analyzeText refactor):
├── Task 4: SettingsModal component                         [visual-engineering]
├── Task 5: analyzeText.ts config injection refactor        [quick]
└── Task 6: Route updates — /analyze + /analyze/revised     [quick]

Wave 3 (After Wave 2 — remaining routes + page integration):
├── Task 7: Route updates — /suggestions + /voice-profile/generate  [quick]
├── Task 8: Route update — /bulk-rewrite + bulkRewrite.ts           [quick]
└── Task 9: page.tsx — settings trigger button + modal integration  [visual-engineering]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── F1: Plan compliance audit                               [oracle]
├── F2: Code quality review                                 [unspecified-high]
├── F3: Real QA execution                                   [unspecified-high]
└── F4: Scope fidelity check                               [deep]
→ Present consolidated results → Get explicit user okay

Critical Path: T1 → T2 → T5 → T6 → T7 → T8 → T9 → F1-F4
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2, 3, 4, 5, 6, 7, 8, 9 |
| 2 | 1 | 6, 7, 8 |
| 3 | 1 | 4, 9 |
| 4 | 1, 3 | 9 |
| 5 | 1 | 6 |
| 6 | 1, 2, 5 | 9 |
| 7 | 1, 2 | 9 |
| 8 | 1, 2 | 9 |
| 9 | 1, 3, 4, 6, 7, 8 | Final |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks — T1 → `quick`, T2 → `quick`, T3 → `quick`
- **Wave 2**: 3 tasks — T4 → `visual-engineering`, T5 → `quick`, T6 → `quick`
- **Wave 3**: 3 tasks — T7 → `quick`, T8 → `quick`, T9 → `visual-engineering`
- **Final**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Define `AppSettings` type and provider constants

  **What to do**:
  - Create `src/lib/settings/types.ts`
  - Define `AppSettings` interface:
    ```ts
    export interface AppSettings {
      llmProvider: 'openai' | 'anthropic';
      llmApiKey: string;
      detectionProvider: 'sapling' | 'gptzero' | 'originality' | 'winston';
      detectionApiKey: string;
    }
    export const DEFAULT_SETTINGS: AppSettings = {
      llmProvider: 'openai',
      llmApiKey: '',
      detectionProvider: 'sapling',
      detectionApiKey: '',
    };
    export const LOCALSTORAGE_KEY = 'ai_detector_settings';
    export const LLM_PROVIDER_LABELS: Record<AppSettings['llmProvider'], string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic (Claude)',
    };
    export const DETECTION_PROVIDER_LABELS: Record<AppSettings['detectionProvider'], string> = {
      sapling: 'Sapling',
      gptzero: 'GPTZero',
      originality: 'Originality.ai',
      winston: 'Winston AI',
    };
    export const STUB_DETECTION_PROVIDERS: AppSettings['detectionProvider'][] = ['gptzero', 'originality', 'winston'];
    ```
  - Export all from `src/lib/settings/index.ts`

  **Must NOT do**:
  - Do not add provider-specific logic here — types only
  - Do not import from route handlers or Next.js server modules

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definition file, no logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: All other tasks
  - **Blocked By**: None

  **References**:
  - `src/lib/detection/types.ts` — existing `DetectionAdapter` pattern to follow for naming style
  - `src/lib/suggestions/llm-adapter.ts` — existing LLM_PROVIDER string literals used today

  **Acceptance Criteria**:
  - [ ] `src/lib/settings/types.ts` exists with all exported types
  - [ ] `tsc --noEmit` passes with no errors on this file
  - [ ] `STUB_DETECTION_PROVIDERS` array contains exactly gptzero, originality, winston

  **QA Scenarios**:
  ```
  Scenario: Types compile correctly
    Tool: Bash
    Steps:
      1. Run: npx tsc --noEmit
    Expected Result: exit code 0, no errors mentioning settings/types.ts
    Evidence: .sisyphus/evidence/task-1-tsc.txt

  Scenario: Export structure is correct
    Tool: Bash
    Steps:
      1. Run: npx tsc --noEmit
      2. Assert: exit code 0 with no errors mentioning settings/types.ts or settings/index.ts
      3. Run: npx vitest run --reporter=verbose 2>&1 | head -5 (verify test suite can import the new module)
    Expected Result: tsc exit code 0; vitest can import settings module without error
    Evidence: .sisyphus/evidence/task-1-exports.txt
  ```

  **Commit**: YES (groups with Tasks 2, 3)
  - Message: `feat(settings): add AppSettings type and provider constants`
  - Files: `src/lib/settings/types.ts`, `src/lib/settings/index.ts`

- [x] 2. Create `getRequestSettings` server utility

  **What to do**:
  - Create `src/lib/api/requestSettings.ts`
  - Implement `getRequestSettings(req: Request)` function:
    ```ts
    // Returns settings extracted from request headers, falling back to env vars.
    // Priority: non-empty header string → env var → undefined
    export interface RequestSettings {
      llmProvider: string;
      llmApiKey: string | undefined;
      detectionProvider: string;
      detectionApiKey: string | undefined;
    }
    export function getRequestSettings(req: Request): RequestSettings { ... }
    ```
  - Header names to read:
    - `x-llm-provider` → fallback to `process.env.LLM_PROVIDER ?? 'openai'`
    - `x-llm-api-key` → fallback to `process.env.COACHING_LLM_API_KEY`
    - `x-detection-provider` → fallback to `process.env.DETECTION_PROVIDER ?? 'sapling'`
    - `x-detection-api-key` → fallback to `process.env.SAPLING_API_KEY` (or appropriate env var per provider)
  - **CRITICAL**: Treat empty string headers as absent (fall back to env var)
  - **CRITICAL**: Never log key values — only log `"llm key present: true/false"`
  - Add `// TODO(security): encrypt API keys before storing` comment at top of file
  - Write unit tests in `src/lib/api/__tests__/requestSettings.test.ts`

  **Must NOT do**:
  - Do NOT use `headers()` from `next/headers` here — use `req.headers.get()` so this utility works with the standard Web `Request` object passed to route handlers
  - Do NOT import this file from `analyzeText.ts` or any non-route file
  - Do NOT log key values

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Small utility function with clear contract
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 6, 7, 8
  - **Blocked By**: Task 1

  **References**:
  - `src/app/api/suggestions/route.ts` — example of how routes currently read `process.env.COACHING_LLM_API_KEY`
  - `src/lib/analysis/analyzeText.ts` — how `DETECTION_PROVIDER` and `SAPLING_API_KEY` are currently read

  **Acceptance Criteria**:
  - [ ] Unit tests pass: empty string header treated as absent, env var fallback works
  - [ ] `tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Empty string header falls back to env var
    Tool: Bash (Vitest unit test)
    Steps:
      1. Run: npx vitest run src/lib/api/__tests__/requestSettings.test.ts
    Expected Result: all tests pass including "empty string treated as absent" case
    Evidence: .sisyphus/evidence/task-2-tests.txt

  Scenario: Non-empty header overrides env var
    Tool: Bash (Vitest unit test)
    Steps:
      1. Run: npx vitest run src/lib/api/__tests__/requestSettings.test.ts
    Expected Result: "x-llm-api-key: sk-test" returns "sk-test", not env var value
    Evidence: .sisyphus/evidence/task-2-tests.txt
  ```

  **Commit**: YES (groups with Tasks 1, 3)
  - Message: `feat(settings): add AppSettings type and provider constants`
  - Files: `src/lib/api/requestSettings.ts`, `src/lib/api/__tests__/requestSettings.test.ts`

- [x] 3. Create `useSettings` SSR-safe localStorage hook

  **What to do**:
  - Create `src/hooks/useSettings.ts` as a `'use client'` module
  - Implement:
    ```ts
    'use client';
    export function useSettings() {
      const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
      const [isLoaded, setIsLoaded] = useState(false);
      useEffect(() => {
        // Read from localStorage ONLY in effect (never in useState initializer)
        const saved = localStorage.getItem(LOCALSTORAGE_KEY);
        if (saved) setSettingsState(JSON.parse(saved));
        setIsLoaded(true);
      }, []);
      const saveSettings = (next: AppSettings) => {
        // Trim whitespace from API key values before saving
        const trimmed = { ...next, llmApiKey: next.llmApiKey.trim(), detectionApiKey: next.detectionApiKey.trim() };
        localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(trimmed));
        setSettingsState(trimmed);
        // TODO(security): encrypt API keys before storing
      };
      return { settings, saveSettings, isLoaded };
    }
    ```
  - Also export a `buildRequestHeaders(settings: AppSettings): HeadersInit` helper that returns the 4 custom headers for fetch calls
  - Write unit tests in `src/hooks/__tests__/useSettings.test.ts` using jsdom localStorage mock

  **Must NOT do**:
  - Do NOT read localStorage in `useState` initializer — only in `useEffect`
  - Do NOT use this hook in Server Components
  - Do NOT implement cross-tab storage sync

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: React hook with localStorage — well-established pattern
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 9
  - **Blocked By**: Task 1

  **References**:
  - `src/lib/settings/types.ts` (Task 1) — `AppSettings`, `DEFAULT_SETTINGS`, `LOCALSTORAGE_KEY`
  - SSR-safe pattern: initialize with defaults, hydrate in `useEffect`, expose `isLoaded`

  **Acceptance Criteria**:
  - [ ] `isLoaded` starts as `false`, becomes `true` after mount
  - [ ] Saving settings persists to `localStorage` under `LOCALSTORAGE_KEY`
  - [ ] Re-mounting hook reads saved settings from localStorage
  - [ ] API key strings are trimmed before saving
  - [ ] Unit tests pass

  **QA Scenarios**:
  ```
  Scenario: Settings persist to localStorage on save
    Tool: Bash (Vitest unit test)
    Steps:
      1. Run: npx vitest run src/hooks/__tests__/useSettings.test.ts
    Expected Result: all tests pass, including "saves to localStorage" and "reads on remount"
    Evidence: .sisyphus/evidence/task-3-tests.txt

  Scenario: API key whitespace is trimmed
    Tool: Bash (Vitest unit test)
    Steps:
      1. Unit test: call saveSettings with llmApiKey "  sk-abc  "
      2. Assert localStorage value has "sk-abc" (trimmed)
    Expected Result: trimmed value stored
    Evidence: .sisyphus/evidence/task-3-tests.txt
  ```

  **Commit**: YES (groups with Tasks 1, 2)
  - Message: `feat(settings): add AppSettings type and provider constants`
  - Files: `src/hooks/useSettings.ts`, `src/hooks/__tests__/useSettings.test.ts`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] 4. Build `SettingsModal` component

  **What to do**:
  - Create `src/components/SettingsModal.tsx` as a `'use client'` component
  - Props: `{ isOpen: boolean; onClose: () => void; settings: AppSettings; saveSettings: (s: AppSettings) => void; }`
  - **CRITICAL**: Do NOT call `useSettings()` inside this component — settings state is owned by `page.tsx` and passed as props
  - Form fields:
    - **LLM Provider** dropdown: OpenAI, Anthropic (Claude)
    - **LLM API Key** password input (`type="password"`)
    - **Detection Provider** dropdown: Sapling, GPTZero *(coming soon)*, Originality.ai *(coming soon)*, Winston AI *(coming soon)*
    - **Detection API Key** password input (`type="password"`)
    - "Save Settings" button + "Cancel" button
  - Mark stub providers in dropdown with *(coming soon)* — they remain selectable
  - Accessibility requirements (MANDATORY):
    - `aria-modal="true"` and `role="dialog"` on modal container
    - `aria-labelledby` pointing to modal title `id`
    - Escape key listener closes modal (remove listener on unmount)
    - Backdrop click closes modal
  - Use `settings` and `saveSettings` props (passed from `page.tsx`) — on Save: call `saveSettings()` then `onClose()`
  - Show subtle note: "API keys are stored in your browser's localStorage"
  - `data-testid="settings-modal"` on the modal container
  - `data-testid="settings-trigger"` is added in Task 9 (page.tsx)

  **Must NOT do**:
  - Do NOT install any new npm package (no shadcn, no Radix, no Headless UI)
  - Do NOT implement live key validation
  - Do NOT add import/export settings feature
  - Do NOT log API key values

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Building a UI modal component with accessibility requirements and Tailwind styling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 5, 6 in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 3

  - **References**:
  - `src/components/ReviewPanel.tsx` — existing custom overlay/popover pattern (Tailwind overlay reference)
  - `src/lib/settings/types.ts` (Task 1) — `LLM_PROVIDER_LABELS`, `DETECTION_PROVIDER_LABELS`, `STUB_DETECTION_PROVIDERS`
  - NOTE: Do NOT import `useSettings` here — settings state flows in via props from `page.tsx`

  **Acceptance Criteria**:
  - [ ] Modal renders when `isOpen=true`, is not rendered when `isOpen=false`
  - [ ] Escape key closes modal
  - [ ] Clicking backdrop (outside modal card) closes modal
  - [ ] `aria-modal="true"` and `role="dialog"` present in DOM
  - [ ] No new entries in `package.json` dependencies

  **QA Scenarios**:
  ```
  Scenario: Modal opens with form fields visible
    Tool: Playwright
    Preconditions: App running at localhost:3000, settings trigger on page
    Steps:
      1. Navigate to http://localhost:3000
      2. Click element with data-testid="settings-trigger"
      3. Assert: element with data-testid="settings-modal" is visible
      4. Assert: input[name="llmApiKey"] exists and is visible
      5. Assert: select[name="detectionProvider"] exists
      6. Screenshot: .sisyphus/evidence/task-4-modal-open.png
    Expected Result: Modal visible with all 4 form fields
    Evidence: .sisyphus/evidence/task-4-modal-open.png

  Scenario: Escape key closes modal
    Tool: Playwright
    Steps:
      1. Click data-testid="settings-trigger" to open modal
      2. Press Escape: await page.keyboard.press('Escape')
      3. Assert: data-testid="settings-modal" is NOT visible
    Expected Result: Modal dismissed on Escape
    Evidence: .sisyphus/evidence/task-4-escape-close.png

  Scenario: Backdrop click closes modal
    Tool: Playwright
    Steps:
      1. Open modal via settings trigger
      2. Click at position { x: 10, y: 10 } (outside modal card)
      3. Assert: data-testid="settings-modal" is NOT visible
    Expected Result: Modal dismissed on backdrop click
    Evidence: .sisyphus/evidence/task-4-backdrop-close.png
  ```

  **Commit**: NO (commits with Task 9 page integration)

- [x] 5. Refactor `analyzeText.ts` — inject detection config

  **What to do**:
  - Modify `src/lib/analysis/analyzeText.ts`
  - Change `createAnalysisDetectionAdapter()` to accept optional config:
    ```ts
    export function createAnalysisDetectionAdapter(config?: {
      provider?: string;
      apiKey?: string;
    }): DetectionAdapter { ... }
    ```
  - Inside: use `config?.provider ?? process.env.DETECTION_PROVIDER ?? 'sapling'` and `config?.apiKey ?? <env-var-for-provider>`
  - **CRITICAL**: If resolved provider is in `STUB_DETECTION_PROVIDERS`, throw a typed error with message `"[ProviderName] is not yet implemented"` — callers map this to HTTP 501
  - Existing callers with no arguments continue to work (backward compatible)
  - Update/add tests in existing test file if present

  **Must NOT do**:
  - Do NOT import `getRequestSettings` here — this is a library file
  - Do NOT break existing call sites that pass no arguments
  - Do NOT remove the env var fallback

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single function signature change with backward compatibility
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 6 in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 6
  - **Blocked By**: Task 1

  **References**:
  - `src/lib/analysis/analyzeText.ts` — current implementation to modify
  - `src/lib/detection/types.ts` — `DetectionAdapter` interface
  - `src/lib/settings/types.ts` (Task 1) — `STUB_DETECTION_PROVIDERS` constant

  **Acceptance Criteria**:
  - [ ] `createAnalysisDetectionAdapter()` (no args) works — backward compatible
  - [ ] `createAnalysisDetectionAdapter({ provider: 'gptzero' })` throws with message containing "not yet implemented"
  - [ ] `createAnalysisDetectionAdapter({ provider: 'sapling', apiKey: 'k' })` uses provided key
  - [ ] `tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Backward compatibility
    Tool: Bash
    Steps:
      1. Run: npm run test
    Expected Result: 0 test failures (no regressions)
    Evidence: .sisyphus/evidence/task-5-tests.txt

  Scenario: Stub provider throws correct error
    Tool: Bash (Vitest)
    Steps:
      1. Run test for createAnalysisDetectionAdapter({ provider: 'gptzero' })
      2. Assert: throws with message matching /not yet implemented/i
    Expected Result: Error thrown with correct message
    Evidence: .sisyphus/evidence/task-5-stub-error.txt
  ```

  **Commit**: NO (commits with Task 6)

- [x] 6. Update `/api/analyze` and `/api/analyze/revised` routes

  **What to do**:
  - Modify `src/app/api/analyze/route.ts`
  - Modify `src/app/api/analyze/revised/route.ts`
  - In each handler:
    1. Call `getRequestSettings(req)` to extract override settings
    2. Pass `{ provider: settings.detectionProvider, apiKey: settings.detectionApiKey }` to `createAnalysisDetectionAdapter()`
    3. Catch "not yet implemented" error → return HTTP 501 `{ error: "[Provider] is not yet implemented" }`
  - Preserve existing behavior when no override headers present
  - **CRITICAL**: Do NOT modify or remove the exact string `'Detection service is not configured.'` — it controls 503 vs 502 logic

  **Must NOT do**:
  - Do NOT change the `'Detection service is not configured.'` string
  - Do NOT log key values
  - Do NOT alter the existing 503/502 logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding header-reading to existing routes — mechanical, well-defined change
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 5 in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 2, 5

  **References**:
  - `src/app/api/analyze/route.ts` — current implementation (note 503/502 string)
  - `src/app/api/analyze/revised/route.ts` — current implementation
  - `src/lib/api/requestSettings.ts` (Task 2) — `getRequestSettings`
  - `src/lib/analysis/analyzeText.ts` (Task 5) — updated adapter function

  **Acceptance Criteria**:
  - [ ] `curl POST /api/analyze` with no override headers → 200 (env var fallback)
  - [ ] `curl POST /api/analyze` with `x-detection-provider: gptzero` → 501
  - [ ] `'Detection service is not configured.'` string unchanged

  **QA Scenarios**:
  ```
  Scenario: Env var fallback — no settings headers
    Tool: Bash
    Preconditions: .env.local has SAPLING_API_KEY set, dev server running
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/analyze -F "file=@tests/fixtures/valid.docx"
    Expected Result: NOT "500" (200 or 422 for invalid file)
    Evidence: .sisyphus/evidence/task-6-fallback.txt

  Scenario: Stub detection provider returns 501
    Tool: Bash
    Steps:
      1. curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/analyze -H "x-detection-provider: gptzero" -F "file=@tests/fixtures/valid.docx"
    Expected Result: Last line is "501"
    Evidence: .sisyphus/evidence/task-6-stub-501.txt
  ```

  **Commit**: YES
  - Message: `feat(settings): wire header overrides into analyze routes with 501 stub handling`
  - Files: `src/app/api/analyze/route.ts`, `src/app/api/analyze/revised/route.ts`, `src/lib/analysis/analyzeText.ts`
  - Pre-commit: `npm run test`

- [ ] 7. Update `/api/suggestions` and `/api/voice-profile/generate` routes

  **What to do**:
  - Modify `src/app/api/suggestions/route.ts`
  - Modify `src/app/api/voice-profile/generate/route.ts`
  - In each handler:
    1. Call `getRequestSettings(req)` to extract override settings
    2. Pass `settings.llmApiKey` (if present) and `settings.llmProvider` to `createLlmAdapter()`
    3. For `suggestions/route.ts`: also pass `settings.detectionApiKey`/`settings.detectionProvider` to the Sapling preview-score call
  - Preserve existing env var fallback behavior

  **Must NOT do**:
  - Do NOT log key values
  - Do NOT change existing error handling logic
  - Do NOT break existing integration tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical addition of header-reading to existing routes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 8 in Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `src/app/api/suggestions/route.ts` — current implementation (COACHING_LLM_API_KEY usage)
  - `src/app/api/voice-profile/generate/route.ts` — current implementation
  - `src/lib/api/requestSettings.ts` (Task 2) — `getRequestSettings`
  - `src/lib/suggestions/llm-adapter.ts` — `createLlmAdapter()` factory signature

  **Acceptance Criteria**:
  - [ ] `curl POST /api/suggestions` with `x-llm-api-key` header uses provided key
  - [ ] `curl POST /api/suggestions` with no headers falls back to `COACHING_LLM_API_KEY` env var
  - [ ] `npm run test` passes — no regressions in integration tests

  **QA Scenarios**:
  ```
  Scenario: LLM key header overrides env var
    Tool: Bash
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/suggestions \
           -H "Content-Type: application/json" \
           -H "x-llm-provider: openai" \
           -H "x-llm-api-key: sk-invalid-key-for-test" \
           -d '{"text":"test sentence","sentenceIndex":0,"sentence":"test sentence","score":80,"voiceProfile":{}}'
    Expected Result: 401 or 400 from OpenAI (NOT 500 "missing api key")
    Evidence: .sisyphus/evidence/task-7-header-override.txt

  Scenario: No headers falls back to env var
    Tool: Bash
    Preconditions: COACHING_LLM_API_KEY set in .env.local
    Steps:
      1. Same curl without x-llm-api-key header
    Expected Result: 200 (or OpenAI auth error if key invalid) — NOT 500 "missing api key"
    Evidence: .sisyphus/evidence/task-7-fallback.txt
  ```

  **Commit**: YES
  - Message: `feat(settings): wire LLM header overrides into suggestions and voice-profile routes`
  - Files: `src/app/api/suggestions/route.ts`, `src/app/api/voice-profile/generate/route.ts`
  - Pre-commit: `npm run test`

- [ ] 8. Update `/api/bulk-rewrite` route and `bulkRewrite.ts`

  **What to do**:
  - Modify `src/app/api/bulk-rewrite/route.ts`
  - Modify `src/lib/bulk-rewrite/bulkRewrite.ts`
  - In `bulk-rewrite/route.ts`:
    1. Call `getRequestSettings(req)` to extract override settings
    2. Pass `llmApiKey`, `llmProvider`, `detectionApiKey`, `detectionProvider` down to `bulkRewrite()`
  - In `bulkRewrite.ts`:
    1. Accept new optional config parameter: `{ llmApiKey?, llmProvider?, detectionApiKey?, detectionProvider? }`
    2. Pass these to `createLlmAdapter()` and `createAnalysisDetectionAdapter()` calls
    3. Preserve default behavior when not passed

  **Must NOT do**:
  - Do NOT change the `applyGuardrails` double-call pattern
  - Do NOT log key values
  - Do NOT break existing bulkRewrite tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Plumbing config through existing function signatures
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 7 in Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `src/app/api/bulk-rewrite/route.ts` — current implementation
  - `src/lib/bulk-rewrite/bulkRewrite.ts` — current implementation (note applyGuardrails double-call — do NOT touch)
  - `src/lib/api/requestSettings.ts` (Task 2) — `getRequestSettings`

  **Acceptance Criteria**:
  - [ ] `npm run test` passes — no regressions in bulkRewrite unit tests
  - [ ] `applyGuardrails` double-call pattern unchanged

  **QA Scenarios**:
  ```
  Scenario: Bulk rewrite uses provided LLM key
    Tool: Bash
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/bulk-rewrite \
           -H "Content-Type: application/json" \
           -H "x-llm-api-key: sk-invalid" \
           -d '{"text":"This is a test sentence for bulk rewriting.","targetScore":50,"sentences":[{"sentence":"This is a test sentence for bulk rewriting.","index":0,"score":85}]}'
    Expected Result: 401 from OpenAI (NOT 500 "missing api key") — confirms header override reached adapter
    Evidence: .sisyphus/evidence/task-8-header-override.txt
  ```

  **Commit**: YES
  - Message: `feat(settings): wire header overrides into bulk-rewrite route and bulkRewrite module`
  - Files: `src/app/api/bulk-rewrite/route.ts`, `src/lib/bulk-rewrite/bulkRewrite.ts`
  - Pre-commit: `npm run test`

- [ ] 9. Integrate `SettingsModal` into `page.tsx`

  **What to do**:
  - Modify `src/app/page.tsx`
  - **CRITICAL**: `page.tsx` is the SINGLE owner of `useSettings()`. Call the hook once here at the top level and pass down props.
  - Add settings trigger button (gear icon or "Settings" text) — position: top-right corner of the page
    - Add `data-testid="settings-trigger"` to this button
  - Add `useState` for `isSettingsOpen: boolean`
  - Render `<SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} saveSettings={saveSettings} />`
  - Update all `fetch()` calls to include settings headers. The fetch call sites are spread across multiple files — update ALL of them:
    - `src/app/page.tsx` — `/api/analyze` and `/api/bulk-rewrite` calls: add `headers: { ...buildRequestHeaders(settings) }`, pass `settings` as prop to child components that make API calls
    - `src/app/useRevisedAnalysisState.ts` — `/api/analyze/revised` calls: accept `settings: AppSettings` parameter and add headers
    - `src/components/ReviewPanel.tsx` — `/api/suggestions` calls: accept `settings: AppSettings` prop and add headers
    - `src/components/VoiceProfilePanel.tsx` — `/api/voice-profile/generate` calls: accept `settings: AppSettings` prop and add headers
  - Show a subtle indicator when settings are NOT configured (no api keys set): e.g., a yellow dot on the settings trigger

  **Must NOT do**:
  - Do NOT add a new page route — stay on `/`
  - Do NOT break existing file-upload or analysis flow
  - Do NOT render settings state on the server (use `isLoaded` gate from `useSettings`)
  - Do NOT call `useSettings()` in `SettingsModal`, `ReviewPanel`, `VoiceProfilePanel`, or `useRevisedAnalysisState` — settings flow via props only

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI integration — adding button, modal, and updating fetch calls in the main page
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on all prior tasks
  - **Parallel Group**: Wave 3 (last task)
  - **Blocks**: Final Wave
  - **Blocked By**: Tasks 1, 3, 4, 6, 7, 8

  **References**:
  - `src/app/page.tsx` — current main page implementation
  - `src/app/useRevisedAnalysisState.ts` — `/api/analyze/revised` fetch call (needs `settings` param added)
  - `src/components/ReviewPanel.tsx` — `/api/suggestions` fetch call (needs `settings` prop added)
  - `src/components/VoiceProfilePanel.tsx` — `/api/voice-profile/generate` fetch call (needs `settings` prop added)
  - `src/components/SettingsModal.tsx` (Task 4) — component to integrate (receives settings/saveSettings as props)
  - `src/hooks/useSettings.ts` (Task 3) — `useSettings`, `buildRequestHeaders` (called ONLY in page.tsx)

  **Acceptance Criteria**:
  - [ ] Settings trigger button visible on main page
  - [ ] Clicking trigger opens SettingsModal
  - [ ] All 5 fetch calls include settings headers (verify in Network tab via Playwright)
  - [ ] Page still works normally (analyze, suggestions, bulk-rewrite) after integration
  - [ ] `isLoaded` gate prevents SSR hydration mismatch

  **QA Scenarios**:
  ```
  Scenario: Settings persist across page reload
    Tool: Playwright
    Steps:
      1. Navigate to http://localhost:3000
      2. Click data-testid="settings-trigger"
      3. Fill input[name="llmApiKey"] with "sk-test-persist-123"
      4. Select option "anthropic" in select[name="llmProvider"]
      5. Click button[type="submit"] (Save Settings)
      6. Assert: modal closes
      7. Hard reload: await page.reload({ waitUntil: 'networkidle' })
      8. Click data-testid="settings-trigger"
      9. Assert: input[name="llmApiKey"] value is "sk-test-persist-123"
      10. Assert: select[name="llmProvider"] value is "anthropic"
      11. Screenshot: .sisyphus/evidence/task-9-persist-reload.png
    Expected Result: Settings retained after reload
    Evidence: .sisyphus/evidence/task-9-persist-reload.png

  Scenario: Settings headers sent on API call
    Tool: Playwright
    Steps:
      1. Save settings with llmApiKey="sk-header-test", detectionApiKey="sapling-header-test"
      2. Set up request interception: page.on('request', req => { if (req.url().includes('/api/analyze')) capture headers })
      3. Upload a test file to trigger /api/analyze
      4. Assert: captured request has header "x-llm-api-key: sk-header-test"
      5. Assert: captured request has header "x-detection-api-key: sapling-header-test"
    Expected Result: Custom headers present on all API requests
    Evidence: .sisyphus/evidence/task-9-headers-sent.txt

  Scenario: App works without settings configured (env var fallback)
    Tool: Playwright
    Steps:
      1. Clear localStorage: await page.evaluate(() => localStorage.clear())
      2. Reload page
      3. Upload test file, trigger analysis
      4. Assert: analysis completes (HTTP 200), NOT 500 error
    Expected Result: App functions normally with empty settings
    Evidence: .sisyphus/evidence/task-9-no-settings-fallback.png
  ```

  **Commit**: YES
  - Message: `feat(settings): integrate SettingsModal into main page with fetch header injection`
  - Files: `src/app/page.tsx`, `src/components/SettingsModal.tsx`
  - Pre-commit: `npm run test`

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read plan end-to-end. For each "Must Have": verify implementation exists. For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist in `.sisyphus/evidence/`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod (except allowed presence logs), commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` + `playwright` skill
  Execute ALL QA scenarios from ALL tasks. Test cross-task integration. Test edge cases: empty state, invalid input, rapid actions. Save evidence to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: verify 1:1 spec vs implementation. Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(settings): add AppSettings type, getRequestSettings utility, and useSettings hook`
- **Wave 2**: `feat(settings): refactor analyzeText config injection and add route header overrides`
- **Wave 3**: `feat(settings): add SettingsModal component and integrate into main page`

---

## Success Criteria

### Verification Commands
```bash
npm run test  # Expected: 0 failures
# Expected: localStorage key "ai_detector_settings" present after saving
# Expected: all API routes return 200 with settings headers, 501 for stub providers
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Settings persist across page reload
- [ ] Stub providers return 501
