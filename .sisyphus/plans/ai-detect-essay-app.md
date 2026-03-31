# AI Detect Essay Review Web App

## TL;DR
> **Summary**: Build a public Next.js full-stack web app that accepts `.docx` and `.doc` essay files, extracts English text, sends the extracted text to a paid AI-detection API, highlights high-risk passages, and provides safe writing-improvement guidance without helping users evade detectors.
> **Deliverables**:
> - Public Next.js App Router web app with upload → analysis → review flow
> - `.docx` + `.doc` extraction pipeline with strict validation and immediate deletion
> - Sapling-backed AI-risk analysis adapter with normalized sentence-level results
> - Highlighted review UI plus sentence-level safe improvement suggestions
> - Vitest, Playwright, GitHub Actions CI, privacy docs, and deployment/runbook docs
> **Effort**: Large
> **Parallel**: YES - 3 waves
> **Critical Path**: 1 → 2 → 5 → 6 → 7 → 8 → 9 → 10

## Context
### Original Request
- 학교 에세이 페이퍼 제출 전 체크용 앱
- Word 파일 입력
- AI detect된 부분 하이라이트 표시
- 해당 부분을 더 안전하고 진정성 있게 개선할 방향 제시

### Interview Summary
- Product form: public web app
- Stack: Next.js full-stack
- Auth: none
- Language scope: English-only in v1
- File scope: `.docx` and `.doc` in v1
- Storage policy: uploaded files and analysis artifacts deleted immediately after analysis
- Detection: paid external API; adapter structure required
- Safety scope: no detector-evasion guidance, no auto-edit of original file
- Testing: include initial unit/e2e/CI setup

### Metis Review (gaps addressed)
- Primary detector fixed to **Sapling** for v1 because sentence/token-level output best fits highlighting
- Detection fallback resolved to **adapter-ready only** in v1; no live multi-provider failover in v1
- Suggestion mechanism resolved to **server-side LLM coaching service** with strict safe-writing guardrails and no evasion language
- Hosting default fixed to **Vercel-compatible Node runtime**
- File size and text length limits fixed to explicit values to avoid provider/runtime ambiguity
- `.doc` fragility addressed with extraction-quality validation and explicit user-facing warnings

## Work Objectives
### Core Objective
Ship a public essay review app that analyzes uploaded Word documents and returns a clear, non-deceptive “AI-likeness risk review” with highlighted passages and constructive sentence-level coaching.

### Deliverables
- Next.js 14+ App Router project configured for Node runtime deployment on Vercel
- Upload page, analysis route, result view, and reusable review components
- Extraction services for `.docx` (`mammoth`) and `.doc` (`word-extractor`)
- Detection adapter contract plus Sapling implementation and mocked test fixtures
- Suggestion service using a server-side LLM for safe writing coaching examples
- Privacy/deletion documentation and CI pipeline

### Definition of Done (verifiable conditions with commands)
- `npm run lint` exits 0
- `npm run typecheck` exits 0
- `npm run test` exits 0
- `npm run test:e2e` exits 0
- `npm run build` exits 0
- Uploading a valid `.docx` fixture produces visible highlighted spans and suggestions in Playwright
- Uploading a valid `.doc` fixture produces either a successful review or a graceful extraction-quality warning in Playwright
- No uploaded temp file remains on disk after successful or failed analysis in automated tests
- No detector or LLM API key appears in client bundle output

### Must Have
- Max upload size: **5 MB**
- Max extracted text sent for analysis: **100,000 characters**
- Min extracted text length: **300 characters**
- MIME + magic-byte validation before extraction
- Immediate temp-file cleanup with `try/finally`
- Sentence-level highlight spans represented as character offsets
- UI wording uses **risk review** / **AI-like phrasing risk**, never definitive cheating claims
- Suggestions focus on specificity, evidence, personal framing, and sentence naturalness
- No database, no session history, no persistent storage

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- Must NOT give detector-evasion tactics or promise lower detection likelihood
- Must NOT auto-rewrite the original file or overwrite user content
- Must NOT add login, payments, user history, plagiarism checks, analytics, or provider-switching UI
- Must NOT support PDF, `.rtf`, `.odt`, paste-only input, or batch uploads in v1
- Must NOT use `dangerouslySetInnerHTML` for highlight rendering
- Must NOT log essay text to console, telemetry, or third-party error tracking

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: **tests-after** with immediate test coverage per implementation unit
- Frameworks: **Vitest** for unit/component/integration, **Playwright** for browser E2E, **GitHub Actions** for CI
- QA policy: every task includes executable happy-path and failure-path scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. Shared foundations are extracted into Wave 1.

Wave 1: foundation, validation, extraction, test scaffolding (Tasks 1-4)

Wave 2: detector integration, span mapping, analysis orchestration (Tasks 5-7)

Wave 3: UI review flow, safe suggestion generation, docs/ops/CI completion (Tasks 8-10)

### Dependency Matrix (full, all tasks)
- 1 blocks 2, 3, 4, 8, 10
- 2 blocks 7 and supports 8
- 3 and 4 block 7
- 5 blocks 7 and 9
- 6 blocks 8
- 7 blocks 8 and 9
- 8 blocks 10
- 9 blocks 10
- 10 is the last implementation task before final verification wave

### Agent Dispatch Summary (wave → task count → categories)
- Wave 1 → 4 tasks → quick, unspecified-low, writing
- Wave 2 → 3 tasks → unspecified-high, deep
- Wave 3 → 3 tasks → visual-engineering, unspecified-high, writing

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [x] 1. Scaffold Next.js app, tooling, and baseline project conventions

  **What to do**: Initialize a Next.js App Router TypeScript project configured for Node runtime deployment, ESLint, Tailwind, Vitest, Playwright, and npm scripts `lint`, `typecheck`, `test`, `test:e2e`, `build`. Create the initial directory layout: `src/app`, `src/components`, `src/lib/files`, `src/lib/detection`, `src/lib/suggestions`, `src/lib/highlights`, `tests/unit`, `tests/fixtures`, `e2e`. Add `.env.example` with placeholder server-only keys for Sapling and the coaching LLM.
  **Must NOT do**: Must NOT add authentication, database packages, analytics SDKs, or any UI beyond a bare upload page shell.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: Greenfield scaffolding with standard conventions
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — Visual polish is not the goal yet

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [2, 3, 4, 8, 10] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.sisyphus/notepads/ai-detect-essay-app/decisions.md:1-13` — confirmed first-pass scope, upload shell constraints, and foundational implementation decisions
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:1-89` — project architecture, limits, and guardrails
  - External: `https://nextjs.org/docs/app/getting-started/project-structure` — App Router structure
  - External: `https://vitest.dev/guide/` — Vitest setup
  - External: `https://playwright.dev/docs/intro` — Playwright setup

  **Acceptance Criteria** (agent-executable only):
  - [ ] `npm run lint` exits 0 in a fresh clone after install
  - [ ] `npm run typecheck` exits 0
  - [ ] `npm run test` exits 0 with placeholder smoke tests
  - [ ] `npm run test:e2e` exits 0 with a placeholder home-page smoke test
  - [ ] `npm run build` exits 0

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Baseline app boots successfully
    Tool: Bash
    Steps: run `npm install`; run `npm run build`; run `npm run test`
    Expected: all commands exit 0
    Evidence: .sisyphus/evidence/task-1-scaffold.txt

  Scenario: Browser smoke test passes
    Tool: Playwright
    Steps: run app locally; open `/`; assert upload form shell and submit button render
    Expected: page shows the upload shell without runtime errors
    Evidence: .sisyphus/evidence/task-1-scaffold.png
  ```

  **Commit**: YES | Message: `chore(app): scaffold nextjs project with test tooling` | Files: `package.json`, `next.config.*`, `playwright.config.*`, `vitest.config.*`, `src/**`, `e2e/**`

- [x] 2. Implement upload validation and temporary file lifecycle

  **What to do**: Build server-side utilities that validate file extension, MIME type, and magic bytes for `.docx` and `.doc`, enforce the 5 MB max size, create a temp file in `/tmp`, and guarantee deletion with `try/finally`. Define the shared structured app error codes used by later tasks: `FILE_TOO_LARGE`, `UNSUPPORTED_FORMAT`, `UNSUPPORTED_LANGUAGE`, `EXTRACTION_FAILED`, `TEXT_TOO_SHORT`, `TEXT_TOO_LONG`, `DETECTION_FAILED`.
  **Must NOT do**: Must NOT trust extension alone, must NOT keep files after any request path, and must NOT expose raw temp paths in API responses.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: File validation and cleanup correctness are security-critical
  - Skills: `[]` — No extra skill required
  - Omitted: `['/playwright']` — Task is backend-first

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: [7, 8] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:34-61` — hard limits and structured error policy
  - External: `https://nodejs.org/api/fs.html#fspromisesunlinkpath` — temp file cleanup
  - External: `https://nextjs.org/docs/app/building-your-application/routing/route-handlers` — Route Handler request processing

  **Acceptance Criteria** (agent-executable only):
  - [ ] Upload validator rejects files over 5 MB with code `FILE_TOO_LARGE`
  - [ ] MIME + magic-byte mismatch returns `UNSUPPORTED_FORMAT`
  - [ ] Temp files are deleted after both success and thrown-error paths in unit tests
  - [ ] API responses never include filesystem paths

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Valid file is created and deleted safely
    Tool: Bash
    Steps: run unit tests covering temp-file creation/deletion flow
    Expected: tests confirm ENOENT after success path and after simulated failure path
    Evidence: .sisyphus/evidence/task-2-upload-lifecycle.txt

  Scenario: Spoofed file is rejected
    Tool: Bash
    Steps: run unit test with `.docx` extension but `.doc` magic bytes
    Expected: response code is `UNSUPPORTED_FORMAT`
    Evidence: .sisyphus/evidence/task-2-upload-lifecycle-error.txt
  ```

  **Commit**: YES | Message: `feat(files): add upload validation and temp cleanup` | Files: `src/lib/files/**`, `tests/unit/**`, `tests/fixtures/**`

- [x] 3. Implement `.docx` extraction and extraction-quality checks

  **What to do**: Use `mammoth` to extract raw text from `.docx`, normalize whitespace, detect empty/image-only outputs, warn about tracked-changes limitations, and reject extracted text shorter than 300 characters or longer than 100,000 characters. Provide extraction-quality heuristics so obviously garbled text is surfaced as an error instead of sent downstream.
  **Must NOT do**: Must NOT silently pass through empty text, must NOT preserve formatting HTML for v1 rendering, and must NOT ignore extraction errors from corrupted or password-protected documents.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: binary document parsing and guardrails
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — Pure service-layer task

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [7] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:50-61` — text length constraints
  - External: `https://github.com/mwilliamson/mammoth.js` — `.docx` extraction API and limitations

  **Acceptance Criteria** (agent-executable only):
  - [ ] Valid `.docx` fixture returns normalized non-empty text
  - [ ] Empty, image-only, corrupted, and password-protected `.docx` fixtures return structured extraction failures
  - [ ] Text under 300 chars returns `TEXT_TOO_SHORT`
  - [ ] Text over 100,000 chars returns `TEXT_TOO_LONG`

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Valid docx text extracts cleanly
    Tool: Bash
    Steps: run extraction unit test suite against valid `.docx` fixture
    Expected: extracted text length is within limits and contains expected sample sentences
    Evidence: .sisyphus/evidence/task-3-docx-extraction.txt

  Scenario: Corrupted docx is handled gracefully
    Tool: Bash
    Steps: run unit test with corrupted/password-protected `.docx` fixture
    Expected: service returns `EXTRACTION_FAILED` without crashing
    Evidence: .sisyphus/evidence/task-3-docx-extraction-error.txt
  ```

  **Commit**: YES | Message: `feat(extraction): add docx parser with quality guards` | Files: `src/lib/files/docx.ts`, `tests/unit/docx*.test.*`, `tests/fixtures/*.docx`

- [x] 4. Implement `.doc` extraction and binary-format fallback handling

  **What to do**: Use `word-extractor` for `.doc` parsing, normalize output, add garbled-text heuristics, and return a clear warning/error when old binary documents cannot be parsed reliably. Ensure the API can still produce a graceful response path for valid `.doc` uploads and reject unreadable cases without crashing.
  **Must NOT do**: Must NOT pretend binary `.doc` extraction is always reliable, must NOT send obviously corrupted output to the detector, and must NOT broaden support to other legacy formats.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: legacy binary format reliability and defensive handling
  - Skills: `[]` — No extra skill required
  - Omitted: `['/playwright']` — Service-layer task

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [7] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:50-61` — validation and safety limits
  - External: `https://www.npmjs.com/package/word-extractor` — `.doc` extraction API

  **Acceptance Criteria** (agent-executable only):
  - [ ] Valid `.doc` fixture extracts readable text and stays within min/max text limits
  - [ ] Garbled or unreadable `.doc` fixture returns `EXTRACTION_FAILED` or a structured quality warning path
  - [ ] Mixed extension/MIME spoofing does not reach the extractor

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Valid doc file is processed
    Tool: Bash
    Steps: run `.doc` extraction unit tests with valid fixture
    Expected: extracted text contains expected sample content
    Evidence: .sisyphus/evidence/task-4-doc-extraction.txt

  Scenario: Garbled legacy doc is rejected safely
    Tool: Bash
    Steps: run `.doc` extraction test with invalid/garbled fixture
    Expected: structured failure is returned and no downstream detector call is made
    Evidence: .sisyphus/evidence/task-4-doc-extraction-error.txt
  ```

  **Commit**: YES | Message: `feat(extraction): add legacy doc parser and fallback guards` | Files: `src/lib/files/doc.ts`, `tests/unit/doc*.test.*`, `tests/fixtures/*.doc`

- [x] 5. Implement normalized detection adapter with Sapling provider

  **What to do**: Define `DetectionAdapter` and normalized result types with score convention `0 = human-like, 1 = AI-like risk`. Build the Sapling adapter server-side only, preserve Sapling’s native `0 = human / 1 = AI-generated` score convention directly in the normalized schema, convert sentence-level output into the app result model, and map all provider failures into structured app error codes. Prepare the architecture so a second provider can be added later without changing callers.
  **Must NOT do**: Must NOT expose provider response shapes directly to UI components, must NOT call the detector from client code, and must NOT implement live fallback switching in v1.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: external API abstraction and normalization correctness
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — API abstraction task

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [7, 9] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:33-39` — primary detector fixed to Sapling and fallback scope limited to adapter readiness
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:34-61` — score framing and API-key constraints
  - External: `https://sapling.ai/docs/api/detector/` — detector request/response and sentence score fields

  **Acceptance Criteria** (agent-executable only):
  - [ ] Sapling fixture normalization preserves provider sentence scores in the 0-1 range where higher means higher AI-like risk
  - [ ] API timeouts, 4xx, and 5xx responses return `DETECTION_FAILED`
  - [ ] No Sapling API key string appears in client code or build output
  - [ ] Caller depends only on `DetectionAdapter`, not provider-specific fields

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Sapling response normalizes correctly
    Tool: Bash
    Steps: run unit tests for adapter normalization using stored fixture JSON
    Expected: first sentence risk score equals `saplingFixture.sentence_scores[0].score`
    Evidence: .sisyphus/evidence/task-5-detection-adapter.txt

  Scenario: Detector failure becomes structured app error
    Tool: Bash
    Steps: run unit/integration tests with mocked Sapling timeout and 429 response
    Expected: service returns `DETECTION_FAILED` without leaking upstream details
    Evidence: .sisyphus/evidence/task-5-detection-adapter-error.txt
  ```

  **Commit**: YES | Message: `feat(detection): add normalized sapling adapter` | Files: `src/lib/detection/**`, `tests/unit/detection*.test.*`, `tests/fixtures/sapling*.json`

- [x] 6. Implement sentence matching and highlight span generation

  **What to do**: Build a pure utility that converts extracted full-text plus detector sentence results into highlight spans shaped as `{ start, end, score }[]`. Normalize whitespace and punctuation for robust sentence matching, preserve original text for rendering, and assign threshold-based labels for low/medium/high risk buckets used by UI styling.
  **Must NOT do**: Must NOT mutate the original extracted text, must NOT depend on DOM APIs, and must NOT use fuzzy matching so loose that multiple unrelated segments can be highlighted.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: text-offset correctness is core to highlighting
  - Skills: `[]` — No extra skill required
  - Omitted: `['/playwright']` — pure utility and tests

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [8] | Blocked By: [1]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:53-58` — sentence-level highlight requirement
  - External: `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String` — string slicing/offset behavior

  **Acceptance Criteria** (agent-executable only):
  - [ ] Given extracted text and mocked sentence results, span generator returns deterministic `start`/`end` offsets
  - [ ] Duplicate sentence text is handled without collapsing all matches to the first occurrence
  - [ ] Empty sentence-result arrays return an empty span list safely

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Repeated sentence text maps correctly
    Tool: Bash
    Steps: run unit tests on text containing repeated sentences and multiple risk levels
    Expected: spans target the correct occurrences and remain sorted by start offset
    Evidence: .sisyphus/evidence/task-6-highlight-spans.txt

  Scenario: No sentence results does not crash
    Tool: Bash
    Steps: run unit test with empty detector sentence list
    Expected: utility returns empty array and renderer-safe output
    Evidence: .sisyphus/evidence/task-6-highlight-spans-error.txt
  ```

  **Commit**: YES | Message: `feat(highlights): add sentence span mapper` | Files: `src/lib/highlights/**`, `tests/unit/highlights*.test.*`

- [x] 7. Build the analysis route and orchestration pipeline

  **What to do**: Implement the main server-side analysis route that accepts multipart upload, validates the file, extracts text based on type, enforces English-only and length constraints, calls the detector adapter, computes highlight spans via Task 6, and returns a normalized JSON result for the UI. Define and wire a stable `SuggestionService` interface plus a default noop implementation that returns `[]`; Task 9 replaces that noop with the real LLM-backed service. Use `UNSUPPORTED_LANGUAGE` for non-English rejections, keep all secrets server-side, and guarantee cleanup in `finally`.
  **Must NOT do**: Must NOT stream the raw document to the client, must NOT persist results, must NOT accept unsupported formats, and must NOT continue to suggestions if extraction or detection fails.

  **Recommended Agent Profile**:
  - Category: `deep` — Reason: central orchestration and error-path integration
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — backend orchestration task

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: [8, 9] | Blocked By: [2, 3, 4, 5, 6]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:41-61` — input limits, storage policy, and error codes
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:95-218` — validation, extraction, and adapter prerequisites
  - External: `https://nextjs.org/docs/app/building-your-application/routing/route-handlers#request-body-formdata` — multipart handling in route handlers

  **Acceptance Criteria** (agent-executable only):
  - [ ] Valid `.docx` request returns normalized JSON with extracted text, sentence results, spans, and a stable `suggestions` array field (empty allowed before Task 9)
  - [ ] Valid `.doc` request returns either normalized JSON or a structured extraction-quality error/warning response
  - [ ] Unsupported file, short text, long text, non-English text (`UNSUPPORTED_LANGUAGE`), and detector failure each return structured error codes
  - [ ] Temp-file cleanup is verified on both success and failure paths

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Full analysis pipeline succeeds for docx
    Tool: Bash
    Steps: run integration tests against the route with mocked detector output, real span generation, and the default noop suggestion service
    Expected: JSON response contains `highlights`, `sentences`, and `suggestions` arrays, with `suggestions` defaulting to `[]` and no temp file left behind
    Evidence: .sisyphus/evidence/task-7-analysis-route.txt

  Scenario: Non-English or oversized content is rejected
    Tool: Bash
    Steps: run integration tests with mocked extracted text outside policy limits
    Expected: response uses the correct structured error code including `UNSUPPORTED_LANGUAGE` for non-English input, and no detector or suggestion call occurs
    Evidence: .sisyphus/evidence/task-7-analysis-route-error.txt
  ```

  **Commit**: YES | Message: `feat(api): add essay analysis route pipeline` | Files: `src/app/api/analyze/route.ts`, `src/lib/**`, `tests/integration/**`

- [x] 8. Build the upload and highlighted review UI

  **What to do**: Create the public upload page and result view in Next.js using accessible form controls, file input, loading state, structured error messages, and a review panel that renders extracted text with span-based highlights. Use clear labels such as “AI-like phrasing risk” and “review suggestion,” show sentence-level scores, render safe suggestions alongside the related highlighted sentence when present, and handle an empty `suggestions` array cleanly before Task 9 is integrated.
  **Must NOT do**: Must NOT use verdict language like “cheating detected,” must NOT render HTML returned from external APIs, and must NOT require login or multi-step navigation.

  **Recommended Agent Profile**:
  - Category: `visual-engineering` — Reason: UI composition, styling, and accessibility
  - Skills: `[]` — No extra skill required
  - Omitted: `['/playwright']` — Verification handled separately

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [10] | Blocked By: [1, 2, 6, 7]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:34-61` — wording and scope guardrails
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:358-396` — expected analysis response shape
  - External: `https://nextjs.org/docs/app/building-your-application/rendering/client-components` — client interactions in App Router
  - External: `https://www.w3.org/WAI/ARIA/apg/` — accessibility reference for form and status messaging

  **Acceptance Criteria** (agent-executable only):
  - [ ] Home page renders a file input and submit button with stable `data-testid` hooks
  - [ ] Successful upload displays highlighted spans with `data-ai-score` attributes and visible risk labels
  - [ ] Error responses display user-friendly text for each structured error code including `UNSUPPORTED_LANGUAGE`
  - [ ] UI remains stable when `suggestions` is an empty array
  - [ ] No raw provider field names or stack traces appear in the UI

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: User uploads valid document and sees highlights
    Tool: Playwright
    Steps: open `/`; set input files on `[data-testid="file-input"]` with valid `.docx`; click `[data-testid="submit-button"]`
    Expected: `[data-testid="review-panel"]` becomes visible and `[data-ai-score]` count is greater than 0
    Evidence: .sisyphus/evidence/task-8-review-ui.png

  Scenario: User uploads invalid document and sees clear error
    Tool: Playwright
    Steps: upload invalid/unsupported fixture; submit form
    Expected: `[data-testid="error-message"]` shows a mapped friendly error, and no review panel is rendered
    Evidence: .sisyphus/evidence/task-8-review-ui-error.png
  ```

  **Commit**: YES | Message: `feat(ui): add upload flow and highlighted review panel` | Files: `src/app/page.tsx`, `src/components/**`, `src/styles/**`, `e2e/**`

- [x] 9. Implement safe suggestion generation service and UI mapping

  **What to do**: Replace Task 7’s noop `SuggestionService` with a real server-side suggestion service that takes high-risk sentences and produces concise coaching in a safe frame: explain why the sentence reads generic, then give a better-direction example emphasizing specificity, evidence, or personal detail. Constrain the prompt and post-processing so the service never claims to help beat detectors, never returns a full essay rewrite, and never modifies the uploaded file. Wire the concrete service into the analysis route and attach suggestions to the corresponding sentence IDs for UI rendering.
  **Must NOT do**: Must NOT promise lower detection risk, must NOT generate whole-paragraph replacements, and must NOT expose the LLM provider response raw.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` — Reason: prompt safety, structured generation, and integration with detector results
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — UI is secondary to guardrails and structure

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: [10] | Blocked By: [5, 7]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:34-61` — safe scope and hard exclusions
  - Pattern: `.sisyphus/notepads/ai-detect-essay-app/decisions.md:1-13` — safe sentence-level coaching expectations and no file auto-edit behavior
  - External: `https://platform.openai.com/docs/guides/text-generation` — structured server-side text generation patterns if OpenAI is chosen

  **Acceptance Criteria** (agent-executable only):
  - [ ] Suggestion output is limited to sentence-level coaching objects linked to analyzed sentences
  - [ ] Guardrail tests reject responses containing banned phrases such as `avoid detection`, `bypass`, or `undetectable`
  - [ ] Route responses include concrete suggestion objects when sentences exceed the coaching threshold
  - [ ] Suggestions are omitted cleanly when no sentence exceeds the coaching threshold
  - [ ] LLM API key remains server-only and absent from build/client output

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: High-risk sentence receives safe coaching suggestion
    Tool: Bash
    Steps: run unit/integration tests with mocked high-risk sentence inputs through the concrete suggestion service wired into the route seam from Task 7
    Expected: output contains structured coaching with rationale and example, no banned evasion terms, and appears in the route response `suggestions` array
    Evidence: .sisyphus/evidence/task-9-suggestions.txt

  Scenario: Suggestion guardrail blocks unsafe phrasing
    Tool: Bash
    Steps: run guardrail test with mocked LLM output containing evasion language
    Expected: unsafe output is filtered/rejected and not returned to the UI
    Evidence: .sisyphus/evidence/task-9-suggestions-error.txt
  ```

  **Commit**: YES | Message: `feat(suggestions): add safe sentence coaching service` | Files: `src/lib/suggestions/**`, `tests/unit/suggestions*.test.*`, `tests/fixtures/suggestions*.json`

- [x] 10. Add CI, privacy docs, deployment config, and end-to-end verification

  **What to do**: Complete the repo with GitHub Actions CI, `.env.example`, `README.md`, and `PRIVACY.md` documenting immediate deletion, supported formats, English-only policy, limits, structured error codes including `UNSUPPORTED_LANGUAGE`, and detector-risk framing. Add full Playwright flows for success and failure cases, verify secrets are not bundled, and document deployment settings for Vercel Node runtime and required environment variables.
  **Must NOT do**: Must NOT document unsupported promises such as “100% accurate detection,” must NOT add telemetry, and must NOT skip CI gates.

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: docs and runbook clarity plus CI wiring
  - Skills: `[]` — No extra skill required
  - Omitted: `['/frontend-ui-ux']` — polish is not the target

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [] | Blocked By: [1, 8, 9]

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:62-78` — verification strategy requirements
  - Pattern: `.sisyphus/plans/ai-detect-essay-app.md:398-419` — UI and suggestion behavior that docs/tests must reflect
  - External: `https://docs.github.com/en/actions` — GitHub Actions workflows
  - External: `https://vercel.com/docs/functions/runtimes/node-js` — Vercel Node runtime reference

  **Acceptance Criteria** (agent-executable only):
  - [ ] GitHub Actions workflow runs lint, typecheck, unit/integration tests, build, and Playwright E2E
  - [ ] `PRIVACY.md` explicitly states immediate deletion, no persistent storage, and English-only analysis policy
  - [ ] Build artifact inspection confirms no detector/LLM secrets are bundled client-side
  - [ ] Playwright covers valid `.docx`, valid `.doc`, unsupported file, non-English rejection, and extraction failure flows

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: CI-equivalent local verification passes
    Tool: Bash
    Steps: run `npm run lint && npm run typecheck && npm run test && npm run build && npm run test:e2e`
    Expected: all commands exit 0
    Evidence: .sisyphus/evidence/task-10-ci-docs.txt

  Scenario: Secrets are not present in client output
    Tool: Bash
    Steps: run production build; search output artifacts for detector and suggestion env var names
    Expected: no secret values or secret variable names are exposed in client bundle files
    Evidence: .sisyphus/evidence/task-10-ci-docs-error.txt
  ```

  **Commit**: YES | Message: `docs(ops): add privacy docs ci and deployment runbook` | Files: `.github/workflows/**`, `README.md`, `PRIVACY.md`, `.env.example`, `e2e/**`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle

  **What to do**: Run an oracle review against the completed implementation and compare actual behavior, file changes, and verification artifacts against Tasks 1-10 in this plan. Flag every missing acceptance criterion, every unverifiable claim, and every deviation from the required guardrails.
  **Must NOT do**: Must NOT approve partial compliance, must NOT ignore missing evidence files, and must NOT waive plan requirements because the app “mostly works.”

  **Parallelization**: Can Parallel: YES | Final Wave | Blocks: [] | Blocked By: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  **Acceptance Criteria** (agent-executable only):
  - [ ] Oracle returns either explicit approval or a concrete rejection list mapped to plan task numbers
  - [ ] Review output cites exact files and acceptance criteria for each finding
  - [ ] Verification artifact is saved for user review

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Full plan compliance review succeeds
    Tool: task (oracle)
    Steps: review completed repo against `.sisyphus/plans/ai-detect-essay-app.md`; inspect implementation files and evidence artifacts; produce approval/rejection report
    Expected: oracle returns APPROVE only if all task acceptance criteria are met and evidenced
    Evidence: .sisyphus/evidence/f1-plan-compliance.md

  Scenario: Missing acceptance criterion is caught
    Tool: task (oracle)
    Steps: review repo state with one intentionally absent acceptance proof or failed requirement still present
    Expected: oracle rejects and cites the exact missing criterion/task number
    Evidence: .sisyphus/evidence/f1-plan-compliance-reject.md
  ```
- [ ] F2. Code Quality Review — unspecified-high

  **What to do**: Run a deep code-quality review of the completed implementation for correctness, maintainability, type safety, security/privacy mistakes, and test quality. Focus on upload safety, cleanup guarantees, server-only secrets, and brittle span/suggestion logic.
  **Must NOT do**: Must NOT limit review to style issues, must NOT skip test files, and must NOT ignore privacy leaks because they are “non-blocking.”

  **Parallelization**: Can Parallel: YES | Final Wave | Blocks: [] | Blocked By: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  **Acceptance Criteria** (agent-executable only):
  - [ ] Reviewer returns APPROVE or a concrete defect list with severity
  - [ ] Review covers implementation files plus tests and config
  - [ ] Any privacy/security issue is explicitly called out as blocking

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Code quality review finds no blocking issues
    Tool: task (unspecified-high)
    Steps: inspect source, tests, and config for correctness, maintainability, and privacy/security defects
    Expected: reviewer approves only if no blocking defects remain
    Evidence: .sisyphus/evidence/f2-code-quality.md

  Scenario: Secret exposure or cleanup bug is flagged
    Tool: task (unspecified-high)
    Steps: inspect client/server boundaries and file lifecycle code for leaked env usage or missing cleanup guarantees
    Expected: reviewer rejects and cites the exact file and defect class
    Evidence: .sisyphus/evidence/f2-code-quality-reject.md
  ```
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)

  **What to do**: Run the completed app and execute the real end-to-end flows using browser automation and command verification: valid `.docx`, valid `.doc`, unsupported file, too-short text, and provider/extraction failure handling. Capture screenshots and terminal output for each path.
  **Must NOT do**: Must NOT rely only on unit tests, must NOT skip browser verification for UI states, and must NOT mark pass without evidence for both success and failure flows.

  **Parallelization**: Can Parallel: YES | Final Wave | Blocks: [] | Blocked By: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  **Acceptance Criteria** (agent-executable only):
  - [ ] Browser QA covers at least one successful `.docx` and one successful or graceful-warning `.doc` run
  - [ ] Failure paths show correct friendly errors and no broken UI state
  - [ ] Evidence includes screenshots plus command output for test/build execution

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: End-to-end happy paths pass in browser
    Tool: Playwright
    Steps: launch app; upload valid `.docx` fixture; verify highlighted review renders; upload valid `.doc` fixture; verify either review or graceful extraction-quality warning renders
    Expected: both flows complete without uncaught runtime errors and match plan wording/behavior
    Evidence: .sisyphus/evidence/f3-manual-qa.png

  Scenario: End-to-end failure paths are graceful
    Tool: Playwright
    Steps: upload unsupported file and a too-short extracted-text fixture; submit each through the UI
    Expected: friendly mapped error appears, review panel does not render, and app remains interactive
    Evidence: .sisyphus/evidence/f3-manual-qa-error.png
  ```
- [ ] F4. Scope Fidelity Check — deep

  **What to do**: Review the finished implementation specifically for scope creep and scope loss against the Must Have / Must NOT Have sections. Confirm that banned features were not added and required v1 constraints were preserved.
  **Must NOT do**: Must NOT treat extra unsupported features as harmless, must NOT ignore wording drift into cheating/evasion framing, and must NOT approve if required v1 constraints are missing.

  **Parallelization**: Can Parallel: YES | Final Wave | Blocks: [] | Blocked By: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  **Acceptance Criteria** (agent-executable only):
  - [ ] Review explicitly confirms presence of all Must Have items or lists exact gaps
  - [ ] Review explicitly confirms absence of all Must NOT Have items or lists exact violations
  - [ ] Review checks UI wording for risk-review framing and anti-evasion compliance

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Scope fidelity passes cleanly
    Tool: task (deep)
    Steps: compare completed repo and user-facing copy against the Must Have and Must NOT Have sections of this plan
    Expected: reviewer approves only if no scope creep or missing required feature is found
    Evidence: .sisyphus/evidence/f4-scope-fidelity.md

  Scenario: Scope creep or wording violation is caught
    Tool: task (deep)
    Steps: inspect for banned features such as auth/history/analytics or wording that promises evasion or definitive cheating detection
    Expected: reviewer rejects and cites the exact violation with file references
    Evidence: .sisyphus/evidence/f4-scope-fidelity-reject.md
  ```

## Commit Strategy
- Use Conventional Commits only
- Keep each commit buildable and testable
- Recommended sequence:
  - `chore: scaffold nextjs app with testing and ci`
  - `feat: add word file validation and extraction services`
  - `feat: integrate sapling detection adapter and analysis pipeline`
  - `feat: add highlighted review ui and safe coaching suggestions`
  - `docs: add privacy and deployment runbook`

## Success Criteria
- Public deployment accepts supported Word files and returns a review in one flow
- High-risk passages are visibly highlighted with sentence-level confidence labels
- Suggestions remain within safe-writing coaching scope and avoid evasion framing
- All automated checks pass locally and in CI
- No persistence of user document content occurs after request completion
