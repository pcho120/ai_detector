# F1 Plan Compliance Audit

**Plan reviewed:** `.sisyphus/plans/ai-detect-essay-app.md`
**Scope reviewed:** completed Tasks 1-10 only
**Audit date:** 2026-03-30
**Verdict:** **REJECT**

## Verification performed
- Read the full plan plus relevant implementation, tests, docs, CI, fixtures, and existing evidence files.
- Ran local verification: `npm run lint && npm run typecheck && npm run test && npm run build && npm run test:e2e`.
- Result: `lint`, `typecheck`, `test`, and `build` passed; `test:e2e` failed with `Port 3000 is in use by an unknown process, using available port 3001 instead. Error: Timed out waiting 60000ms from config.webServer.`

## Blocking rejection findings

1. **Task 1 — acceptance criterion failed**
   - **Criterion text:** ``npm run test:e2e` exits 0 with a placeholder home-page smoke test`
   - **Finding:** FAIL.
   - **Evidence:** `package.json:5-12` defines the script; `e2e/home.spec.ts:3-9` contains the placeholder smoke test; `playwright.config.ts:11-19` hardcodes `http://127.0.0.1:3000` for both `baseURL` and `webServer.url`. The 2026-03-30 verification run failed because Next moved to port 3001 while Playwright still waited on 3000.

2. **Task 3 — acceptance criterion failed**
   - **Criterion text:** `Empty, image-only, corrupted, and password-protected .docx fixtures return structured extraction failures`
   - **Finding:** FAIL / not fully evidenced.
   - **Evidence:** `tests/unit/docx.test.ts:37-69` covers empty and corrupted fixtures plus a raw in-memory buffer for a “password-protected-style invalid document”; `tests/fixtures/` contains `valid.docx`, `empty.docx`, `corrupted.docx`, `short.docx`, and `long.docx`, but no image-only `.docx` fixture and no password-protected `.docx` fixture.

3. **Task 7 — acceptance criterion failed**
   - **Criterion text:** `Temp-file cleanup is verified on both success and failure paths`
   - **Finding:** FAIL.
   - **Evidence:** `src/app/api/analyze/route.ts:66-140` processes the upload entirely from an in-memory `Buffer` and contains no `withTempFile(...)` call and no `finally`-based temp cleanup. Temp lifecycle logic exists only in `src/lib/files/temp.ts:13-53`, and only unit tests reference it (`tests/unit/temp.test.ts:16-131`). `tests/integration/analyze-route.test.ts:98-423` verifies route behavior but does not verify temp-file creation/deletion on either path.

4. **Task 8 — acceptance criterion failed**
   - **Criterion text:** `Successful upload displays highlighted spans with data-ai-score attributes and visible risk labels`
   - **Finding:** FAIL.
   - **Evidence:** `src/components/ReviewPanel.tsx:45-53` renders spans with `data-ai-score`, but the risk wording is stored only in the `title` attribute built at `src/components/ReviewPanel.tsx:31-40`. There is no visible rendered low/medium/high label text next to the highlighted content.

5. **Task 9 — acceptance criterion failed**
   - **Criterion text:** `Suggestion output is limited to sentence-level coaching objects linked to analyzed sentences`
   - **Finding:** FAIL.
   - **Evidence:** `src/lib/suggestions/types.ts:8-15` defines suggestions as `{ sentence, rewrite, explanation }`; `src/app/api/analyze/route.ts:24-30` returns the same shape. No sentence ID or other stable linkage field is present. Also, the implementation diverges from the task’s required “real server-side suggestion service” because `src/app/api/analyze/route.ts:8,43-45` wires `RuleBasedSuggestionService`, and `src/lib/suggestions/rule-based.ts:1-96` is regex/rule-based rather than LLM-backed.

6. **Mandatory QA evidence gaps (blocking)**
   - The plan says every task’s QA scenarios are mandatory and F1 must not ignore missing evidence files.
   - Existing task evidence found: `task-2-upload-lifecycle.txt`, `task-2-upload-lifecycle-error.txt`, `task-3-docx-extraction.txt`, `task-3-docx-extraction-error.txt`.
   - Missing required task evidence artifacts:
     - Task 1: `.sisyphus/evidence/task-1-scaffold.txt`, `.sisyphus/evidence/task-1-scaffold.png`
     - Task 4: `.sisyphus/evidence/task-4-doc-extraction.txt`, `.sisyphus/evidence/task-4-doc-extraction-error.txt`
     - Task 5: `.sisyphus/evidence/task-5-detection-adapter.txt`, `.sisyphus/evidence/task-5-detection-adapter-error.txt`
     - Task 6: `.sisyphus/evidence/task-6-highlight-spans.txt`, `.sisyphus/evidence/task-6-highlight-spans-error.txt`
     - Task 7: `.sisyphus/evidence/task-7-analysis-route.txt`, `.sisyphus/evidence/task-7-analysis-route-error.txt`
     - Task 8: `.sisyphus/evidence/task-8-review-ui.png`, `.sisyphus/evidence/task-8-review-ui-error.png`
     - Task 9: `.sisyphus/evidence/task-9-suggestions.txt`, `.sisyphus/evidence/task-9-suggestions-error.txt`
     - Task 10: `.sisyphus/evidence/task-10-ci-docs.txt`, `.sisyphus/evidence/task-10-ci-docs-error.txt`

## Criterion-by-criterion findings

### Task 1 — Scaffold Next.js app, tooling, and baseline project conventions

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| `npm run lint` exits 0 in a fresh clone after install | PASS | `package.json:5-12`; 2026-03-30 local run exited 0 with warnings only. |
| `npm run typecheck` exits 0 | PASS | `package.json:5-12`; 2026-03-30 local run exited 0. |
| `npm run test` exits 0 with placeholder smoke tests | PASS | `package.json:11`; placeholder UI smoke test at `tests/unit/homepage.test.tsx:5-12`; 2026-03-30 local run exited 0. |
| `npm run test:e2e` exits 0 with a placeholder home-page smoke test | FAIL | `e2e/home.spec.ts:3-9`; `playwright.config.ts:11-19`; 2026-03-30 local run timed out waiting for the web server. |
| `npm run build` exits 0 | PASS | `package.json:7`; 2026-03-30 local run exited 0. |

**Task 1 evidence status:** FAIL — required artifacts `task-1-scaffold.txt` and `task-1-scaffold.png` are missing.

### Task 2 — Implement upload validation and temporary file lifecycle

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| Upload validator rejects files over 5 MB with code `FILE_TOO_LARGE` | PASS | `src/lib/files/validate.ts:48-58`; `tests/unit/validate.test.ts:27-42`. |
| MIME + magic-byte mismatch returns `UNSUPPORTED_FORMAT` | PASS | `src/lib/files/validate.ts:68-88`; `tests/unit/validate.test.ts:88-145`; route coverage at `tests/integration/analyze-route.test.ts:247-271`. |
| Temp files are deleted after both success and thrown-error paths in unit tests | PASS | `src/lib/files/temp.ts:43-53`; `tests/unit/temp.test.ts:75-112`. |
| API responses never include filesystem paths | PASS | `src/lib/files/errors.ts:23-30`; `tests/integration/analyze-route.test.ts:414-422`. |

**Task 2 evidence status:** PASS — `.sisyphus/evidence/task-2-upload-lifecycle.txt` and `.sisyphus/evidence/task-2-upload-lifecycle-error.txt` exist.

### Task 3 — Implement `.docx` extraction and extraction-quality checks

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| Valid `.docx` fixture returns normalized non-empty text | PASS | `src/lib/files/docx.ts:60-98`; `tests/unit/docx.test.ts:13-35`. |
| Empty, image-only, corrupted, and password-protected `.docx` fixtures return structured extraction failures | FAIL | `tests/unit/docx.test.ts:37-69` does not provide image-only or password-protected fixtures; `tests/fixtures/` has no such fixture files. |
| Text under 300 chars returns `TEXT_TOO_SHORT` | PASS | `src/lib/files/docx.ts:76-81`; `tests/unit/docx.test.ts:72-79`. |
| Text over 100,000 chars returns `TEXT_TOO_LONG` | PASS | `src/lib/files/docx.ts:83-88`; `tests/unit/docx.test.ts:80-85`. |

**Task 3 evidence status:** PASS — `.sisyphus/evidence/task-3-docx-extraction.txt` and `.sisyphus/evidence/task-3-docx-extraction-error.txt` exist.

### Task 4 — Implement `.doc` extraction and binary-format fallback handling

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| Valid `.doc` fixture extracts readable text and stays within min/max text limits | PASS | `src/lib/files/doc.ts:73-119`; `tests/unit/doc.test.ts:86-115`. |
| Garbled or unreadable `.doc` fixture returns `EXTRACTION_FAILED` or a structured quality warning path | PASS | `tests/unit/doc.test.ts:117-127`; `tests/unit/doc-mocked.test.ts:48-97`. |
| Mixed extension/MIME spoofing does not reach the extractor | PASS | `src/lib/files/validate.ts:68-88`; `tests/unit/validate.test.ts:88-145`; `tests/integration/analyze-route.test.ts:258-271`. |

**Task 4 evidence status:** FAIL — required artifacts `task-4-doc-extraction.txt` and `task-4-doc-extraction-error.txt` are missing.

### Task 5 — Implement normalized detection adapter with Sapling provider

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| Sapling fixture normalization preserves provider sentence scores in the 0-1 range where higher means higher AI-like risk | PASS | `src/lib/detection/types.ts:1-50`; `src/lib/detection/sapling.ts:83-90`; `tests/unit/detection.test.ts:13-95`. |
| API timeouts, 4xx, and 5xx responses return `DETECTION_FAILED` | PASS | `src/lib/detection/sapling.ts:31-79`; `tests/unit/detection.test.ts:168-295`. |
| No Sapling API key string appears in client code or build output | PASS | API key is server-only in `src/app/api/analyze/route.ts:32-40`; build grep over `.next/**/*` for `SAPLING_API_KEY|COACHING_LLM_API_KEY` returned no matches. |
| Caller depends only on `DetectionAdapter`, not provider-specific fields | PASS | Route consumes normalized `{ score, sentences }` from `DetectionAdapter` in `src/app/api/analyze/route.ts:104-137`; provider-native fields such as `sentence_scores` remain confined to `src/lib/detection/sapling.ts:7-19,83-90`. |

**Task 5 evidence status:** FAIL — required artifacts `task-5-detection-adapter.txt` and `task-5-detection-adapter-error.txt` are missing.

### Task 6 — Implement sentence matching and highlight span generation

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| Given extracted text and mocked sentence results, span generator returns deterministic `start`/`end` offsets | PASS | `src/lib/highlights/spans.ts:77-107`; `tests/unit/highlights.test.ts:38-61,174-199,252-279`. |
| Duplicate sentence text is handled without collapsing all matches to the first occurrence | PASS | `src/lib/highlights/spans.ts:83-107`; `tests/unit/highlights.test.ts:94-147`. |
| Empty sentence-result arrays return an empty span list safely | PASS | `src/lib/highlights/spans.ts:77-82`; `tests/unit/highlights.test.ts:13-35`. |

**Task 6 evidence status:** FAIL — required artifacts `task-6-highlight-spans.txt` and `task-6-highlight-spans-error.txt` are missing.

### Task 7 — Build the analysis route and orchestration pipeline

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| Valid `.docx` request returns normalized JSON with extracted text, sentence results, spans, and a stable `suggestions` array field (empty allowed before Task 9) | PASS | `src/app/api/analyze/route.ts:24-30,124-140`; `tests/integration/analyze-route.test.ts:98-130`. |
| Valid `.doc` request returns either normalized JSON or a structured extraction-quality error/warning response | PASS | `src/app/api/analyze/route.ts:81-92,132-140`; `tests/integration/analyze-route.test.ts:214-227`. |
| Unsupported file, short text, long text, non-English text (`UNSUPPORTED_LANGUAGE`), and detector failure each return structured error codes | PASS (implemented, partially evidenced) | Unsupported/short/non-English/detector failure are covered at `tests/integration/analyze-route.test.ts:247-395`; long-text guards are implemented in `src/lib/files/docx.ts:83-88` and `src/lib/files/doc.ts:112-117` and are propagated by `src/app/api/analyze/route.ts:89-101`. |
| Temp-file cleanup is verified on both success and failure paths | FAIL | `src/app/api/analyze/route.ts:66-140` never uses `src/lib/files/temp.ts:43-53`; route tests do not verify temp cleanup. |

**Task 7 evidence status:** FAIL — required artifacts `task-7-analysis-route.txt` and `task-7-analysis-route-error.txt` are missing.

### Task 8 — Build the upload and highlighted review UI

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| Home page renders a file input and submit button with stable `data-testid` hooks | PASS | `src/app/page.tsx:68-89`; `tests/unit/homepage.test.tsx:5-12`; `e2e/home.spec.ts:3-9`. |
| Successful upload displays highlighted spans with `data-ai-score` attributes and visible risk labels | FAIL | `src/components/ReviewPanel.tsx:45-53` renders `data-ai-score`; `src/components/ReviewPanel.tsx:31-40` stores risk text in `title` only; there is no visible rendered label. |
| Error responses display user-friendly text for each structured error code including `UNSUPPORTED_LANGUAGE` | PASS | `src/app/page.tsx:36-46,93-100`; `e2e/home.spec.ts:90-169`. |
| UI remains stable when `suggestions` is an empty array | PASS | `src/components/ReviewPanel.tsx:85-98`; `e2e/home.spec.ts:60-88`. |
| No raw provider field names or stack traces appear in the UI | PASS | `src/app/page.tsx:36-46`; `src/components/ReviewPanel.tsx:69-99`; no provider-native keys are rendered. |

**Task 8 evidence status:** FAIL — required artifacts `task-8-review-ui.png` and `task-8-review-ui-error.png` are missing.

### Task 9 — Implement safe suggestion generation service and UI mapping

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| Suggestion output is limited to sentence-level coaching objects linked to analyzed sentences | FAIL | `src/lib/suggestions/types.ts:8-15` and `src/app/api/analyze/route.ts:24-30` provide no sentence ID/linkage field. |
| Guardrail tests reject responses containing banned phrases such as `avoid detection`, `bypass`, or `undetectable` | PASS | `src/lib/suggestions/guardrails.ts:15-46`; `tests/unit/suggestions.test.ts:128-203`. |
| Route responses include concrete suggestion objects when sentences exceed the coaching threshold | PASS | `src/app/api/analyze/route.ts:126-137`; `tests/integration/analyze-route.test.ts:178-211`. |
| Suggestions are omitted cleanly when no sentence exceeds the coaching threshold | PASS | Threshold filter exists at `src/app/api/analyze/route.ts:127-130`; empty-input behavior is covered at `tests/unit/suggestions.test.ts:8-13`. |
| LLM API key remains server-only and absent from build/client output | PASS | `.env.example:1-5` defines `COACHING_LLM_API_KEY`; grep over `.next/**/*` found no `SAPLING_API_KEY` or `COACHING_LLM_API_KEY` references. |

**Task 9 evidence status:** FAIL — required artifacts `task-9-suggestions.txt` and `task-9-suggestions-error.txt` are missing.

### Task 10 — Add CI, privacy docs, deployment config, and end-to-end verification

| Acceptance criterion | Status | Evidence |
| --- | --- | --- |
| GitHub Actions workflow runs lint, typecheck, unit/integration tests, build, and Playwright E2E | PASS | `.github/workflows/ci.yml:1-45`. |
| `PRIVACY.md` explicitly states immediate deletion, no persistent storage, and English-only analysis policy | PASS | `PRIVACY.md:5-15`. |
| Build artifact inspection confirms no detector/LLM secrets are bundled client-side | PASS | Grep over `.next/**/*` for `SAPLING_API_KEY|COACHING_LLM_API_KEY` returned no matches. |
| Playwright covers valid `.docx`, valid `.doc`, unsupported file, non-English rejection, and extraction failure flows | PASS | `e2e/home.spec.ts:11-169`. |

**Task 10 evidence status:** FAIL — required artifacts `task-10-ci-docs.txt` and `task-10-ci-docs-error.txt` are missing.

## Overall conclusion
The repo is **not plan-compliant for Tasks 1-10**. Even ignoring the missing task evidence artifacts, there are concrete acceptance-criterion failures in Tasks **1, 3, 7, 8, and 9**. With the mandatory evidence gaps included, the correct verdict is **REJECT**.
