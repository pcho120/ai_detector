# User Paper as Few-Shot Style Reference for Rewrite Suggestions

## TL;DR

> **Quick Summary**: Add a "My Paper" tab to the Voice Profile panel where users upload/paste their own previously-written paper. The system extracts 5-8 diverse representative sentences and uses them as few-shot examples in the LLM rewrite prompt, making suggestions match the user's actual writing style. Also fix the bulk rewrite bug where voiceProfile is ignored.
> 
> **Deliverables**:
> - New "My Paper" tab in Voice Profile panel (file upload + text paste)
> - Server-side sentence extraction algorithm (diversity-based selection)
> - `/api/extract-style` API endpoint
> - Few-shot context block integration into rewrite prompts (individual + bulk)
> - Bug fix: bulk rewrite now uses voiceProfile/few-shot
> - Unit tests, integration tests, E2E tests
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 3 waves
> **Critical Path**: Task 1 (bug fix) → Task 2 (extraction lib) → Task 3 (prompt integration) → Task 5 (API endpoint) → Task 6 (UI) → Task 7 (E2E wiring) → Final Verification

---

## Context

### Original Request
User wants to replace the abstract voice profile concept with something more concrete: upload their own paper and have the system use that paper's style to generate rewrite suggestions that sound like the user actually wrote them.

### Interview Summary
**Key Discussions**:
- **Input**: Both .docx/.doc file upload AND text paste supported
- **Existing Voice Profile**: Keep but make mutually exclusive with My Paper (tab switch)
- **Style Analysis**: Few-shot examples (extract 5-8 sentences, inject directly into prompt)
- **Sentence Selection**: Diversity-based — varied length, structure, position
- **Application**: Both individual suggestions AND bulk rewrite (fix existing bug)
- **Storage**: Session-only React state (privacy-first)
- **Language**: English only
- **UI**: Tabs within Voice Profile panel — "Voice Profile" | "My Paper"
- **Extracted sentences UI**: Summary count + preview + Clear button
- **Essay upload independence**: Few-shot examples persist when user uploads new essay for analysis

**Research Findings**:
- `buildMultiUserPrompt` already prepends voice profile as context — few-shot follows same pattern
- `bulkRewrite.ts:62` has `void request.voiceProfile` — explicitly ignores voice profile (bug)
- `generateSingleSuggestionWithProvider` and `twoPassRewrite` don't accept voiceProfile — needs threading
- File parsing infrastructure fully reusable (`src/lib/files/docx.ts`, `doc.ts`)
- `MAX_PROFILE_LENGTH = 2000` — few-shot at ~1200 chars fits within budget
- VoiceProfilePanel already has 14 props — new component `MyPaperTab` needed to avoid explosion

### Metis Review
**Identified Gaps** (addressed):
- Voice Profile + Few-shot combination: Resolved → mutually exclusive (tab switch)
- Min text length for style extraction: Resolved → 500 chars (separate from analysis 300 chars)
- Extracted sentence editability: Resolved → summary + clear (no individual edit)
- Few-shot persistence across essay uploads: Resolved → persists
- Text paste size limit: Resolved → 50,000 chars
- Prompt bloat risk: Mitigated → cap context at 3000 chars, mutually exclusive profiles
- Sentence extraction quality: Mitigated → pre-filter garbage (headers, citations, short, URLs)
- VoiceProfilePanel prop explosion: Mitigated → separate MyPaperTab component
- Two-pass voice context: Resolved → both passes use voice context

---

## Work Objectives

### Core Objective
Enable users to provide their own writing as a style reference, so rewrite suggestions match their actual writing voice instead of a generic or preset-based profile.

### Concrete Deliverables
- `src/lib/style-extraction/extractSentences.ts` — sentence extraction algorithm
- `src/lib/style-extraction/types.ts` — types for extraction
- `src/app/api/extract-style/route.ts` — API endpoint for style extraction
- `src/components/MyPaperTab.tsx` — new tab component for file upload/paste
- Modified `src/lib/suggestions/llm.ts` — voiceProfile threading + few-shot context
- Modified `src/lib/suggestions/voiceProfile.ts` — `buildFewShotContextBlock` function
- Modified `src/lib/bulk-rewrite/bulkRewrite.ts` — voiceProfile bug fix
- Modified `src/components/VoiceProfilePanel.tsx` — tab UI
- Modified `src/app/page.tsx` — few-shot state management

### Definition of Done
- [ ] User can upload .docx/.doc or paste text in "My Paper" tab
- [ ] System extracts 5-8 diverse sentences and shows count + preview
- [ ] Rewrite suggestions reflect user's writing style when few-shot is active
- [ ] Voice Profile and My Paper are mutually exclusive (tab switch clears the other)
- [ ] Bulk rewrite correctly uses voiceProfile/few-shot (bug fixed)
- [ ] All tests pass: `npm run test`, `npm run test:e2e`, `npm run lint`, `npm run typecheck`

### Must Have
- File upload (.docx/.doc) AND text paste input in "My Paper" tab
- Diversity-based sentence selection (varied length, structure, position)
- Pre-filtering of garbage sentences (headers, citations, short, URLs, etc.)
- Few-shot context injected into both individual and bulk rewrite prompts
- Mutually exclusive tab switching (Voice Profile OR My Paper active)
- Summary UI showing extracted sentence count + preview + Clear
- Session-only storage (no persistence)
- English only

### Must NOT Have (Guardrails)
- No NLP/ML dependencies for sentence extraction — heuristics only
- No modification to `MULTI_SYSTEM_PROMPT` or `SYSTEM_PROMPT` constants
- No persisting extracted sentences to localStorage, server, or any storage
- No language support other than English
- No modification to existing `/api/analyze` endpoint
- No more than 3 new props added to VoiceProfilePanel
- No combined voice profile + few-shot (mutually exclusive only)
- No individual sentence editing/deletion UI (summary + clear only)
- No AI-slop: excessive comments, over-abstraction, generic variable names

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: Tests-after
- **Framework**: vitest (unit/integration) + Playwright (E2E)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright — navigate, interact, assert DOM, screenshot
- **API/Backend**: Use Bash (curl) — send requests, assert status + response fields
- **Library/Module**: Use Bash (node/bun REPL or vitest) — import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, MAX PARALLEL):
├── Task 1: Bug fix — thread voiceProfile through bulk rewrite pipeline [quick]
├── Task 2: Sentence extraction algorithm library [deep]
├── Task 3: Few-shot context block builder + prompt integration [unspecified-high]

Wave 2 (After Wave 1 — API + UI, MAX PARALLEL):
├── Task 4: /api/extract-style endpoint [unspecified-high]
├── Task 5: MyPaperTab component + VoiceProfilePanel tab UI [visual-engineering]
├── Task 6: Page-level state management + API wiring [quick]

Wave 3 (After Wave 2 — integration + E2E):
├── Task 7: End-to-end wiring + E2E tests [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 3 → Task 4 → Task 7 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 3, 7 | 1 |
| 2 | — | 4, 5, 7 | 1 |
| 3 | 1 | 4, 6, 7 | 1 |
| 4 | 2, 3 | 7 | 2 |
| 5 | 2 | 6, 7 | 2 |
| 6 | 3, 5 | 7 | 2 |
| 7 | 4, 5, 6 | F1-F4 | 3 |
| F1-F4 | 7 | — | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** — T1 → `quick`, T2 → `deep`, T3 → `unspecified-high`
- **Wave 2**: **3 tasks** — T4 → `unspecified-high`, T5 → `visual-engineering`, T6 → `quick`
- **Wave 3**: **1 task** — T7 → `unspecified-high`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Bug Fix: Thread voiceProfile through bulk rewrite pipeline

  **What to do**:
  - Add optional `voiceProfile?: string` parameter to `twoPassRewrite()` in `src/lib/suggestions/llm.ts`
  - In `twoPassRewrite`, replace `buildUserPrompt(sentence)` with `buildMultiUserPrompt(sentence, voiceProfile)` for pass1 (and optionally pass2 to preserve style through refinement)
  - Add optional `voiceProfile?: string` parameter to `generateSingleSuggestionWithProvider()` in `src/lib/suggestions/llm.ts`
  - Pass `voiceProfile` from `generateSingleSuggestionWithProvider` down to `twoPassRewrite`
  - In `src/lib/bulk-rewrite/bulkRewrite.ts`: remove `void request.voiceProfile` (line 62) and pass `request.voiceProfile` to each `generateSingleSuggestionWithProvider` call
  - Add unit tests for the modified functions verifying voiceProfile propagation

  **Must NOT do**:
  - Do NOT change the public API of `LlmSuggestionService.suggest()` method
  - Do NOT modify `SYSTEM_PROMPT` or `MULTI_SYSTEM_PROMPT` constants
  - Do NOT change the signature of `generateSingleSuggestion()` (backward compat wrapper)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Focused bug fix with clear scope — threading an existing parameter through function calls
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No UI changes in this task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 3, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/suggestions/llm.ts:49-66` — `buildUserPrompt` and `buildMultiUserPrompt` functions — shows how voiceProfile is already used in multi-prompt but missing from single-prompt
  - `src/lib/suggestions/llm.ts:126-156` — `twoPassRewrite` function — the function that needs voiceProfile parameter added
  - `src/lib/suggestions/llm.ts:194-226` — `generateSingleSuggestionWithProvider` and `generateSingleSuggestion` — shows current signature without voiceProfile
  - `src/lib/suggestions/llm.ts:238-319` — `generateAlternativeSuggestions` — reference for how voiceProfile is correctly used (this already works)

  **API/Type References**:
  - `src/lib/bulk-rewrite/types.ts` — `BulkRewriteRequest` type — verify `voiceProfile` field exists
  - `src/lib/suggestions/voiceProfile.ts:41-64` — `sanitizeVoiceProfile` — already used for sanitization

  **Test References**:
  - `src/lib/suggestions/__tests__/` — existing suggestion test patterns
  - `src/lib/bulk-rewrite/__tests__/` — existing bulk rewrite test patterns

  **WHY Each Reference Matters**:
  - `llm.ts:126-156` — This is the exact function to modify; study how pass1/pass2 work to understand where to inject voiceProfile
  - `llm.ts:238-319` — `generateAlternativeSuggestions` already correctly threads voiceProfile; copy this pattern
  - `bulkRewrite.ts:62` — This is the exact bug line (`void request.voiceProfile`) to fix

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: voiceProfile propagates through bulk rewrite
    Tool: Bash (vitest)
    Preconditions: Test file created with mock LLM adapter
    Steps:
      1. Create unit test that calls `generateSingleSuggestionWithProvider` with voiceProfile="test profile"
      2. Mock `createLlmAdapter` to capture the userPrompt passed to `complete()`
      3. Assert the captured userPrompt contains "test profile" text
    Expected Result: userPrompt includes voice profile context block
    Failure Indicators: userPrompt does not contain "test profile" or "Author voice profile"
    Evidence: .sisyphus/evidence/task-1-voice-profile-propagation.txt

  Scenario: bulk rewrite no longer voids voiceProfile
    Tool: Bash (vitest)
    Preconditions: Test with mock LLM adapter and mock detection adapter
    Steps:
      1. Call `executeBulkRewrite` with request containing `voiceProfile: "academic tone"`
      2. Spy on `generateSingleSuggestionWithProvider` calls
      3. Assert each call receives the voiceProfile argument
    Expected Result: All calls to generateSingleSuggestionWithProvider include "academic tone"
    Failure Indicators: voiceProfile parameter is undefined in any call
    Evidence: .sisyphus/evidence/task-1-bulk-rewrite-voice-fix.txt

  Scenario: existing tests still pass (no regression)
    Tool: Bash (vitest)
    Preconditions: None
    Steps:
      1. Run `npm run test`
      2. Run `npm run typecheck`
    Expected Result: All tests pass, no type errors
    Failure Indicators: Any test failure or type error
    Evidence: .sisyphus/evidence/task-1-regression.txt
  ```

  **Commit**: YES
  - Message: `fix(bulk-rewrite): thread voiceProfile through rewrite pipeline`
  - Files: `src/lib/suggestions/llm.ts`, `src/lib/bulk-rewrite/bulkRewrite.ts`, test files
  - Pre-commit: `npm run test`

- [x] 2. Sentence Extraction Algorithm Library

  **What to do**:
  - Create `src/lib/style-extraction/types.ts` with `StyleExtractionResult` type: `{ sentences: string[]; count: number; sourceCharCount: number }`
  - Create `src/lib/style-extraction/extractSentences.ts` with these functions:
    - `splitIntoSentences(text: string): string[]` — split text by sentence boundaries (period/question/exclamation followed by space or end)
    - `filterCandidates(sentences: string[]): string[]` — remove garbage: sentences <20 chars, >300 chars, all-caps, list items (starting with `^\\d+\\.`), URLs, citation patterns like `(Author, 2024)`, references/bibliography entries, figure/table captions
    - `selectDiverse(candidates: string[], count: number): string[]` — diversity selection algorithm:
      - Bucket candidates by length: short (<60 chars), medium (60-120 chars), long (>120 chars)
      - Bucket by position: first third, middle third, last third of document
      - Round-robin select from different buckets to maximize diversity
      - Target: 5-8 sentences (default 6, configurable via `count` param)
    - `extractStyleSentences(text: string, count?: number): StyleExtractionResult` — main entry: split → filter → select → return
  - Create `src/lib/style-extraction/index.ts` with public exports
  - Constants: `MIN_STYLE_TEXT_LENGTH = 500`, `MAX_STYLE_TEXT_LENGTH = 50000`, `DEFAULT_SENTENCE_COUNT = 6`, `MIN_SENTENCE_LENGTH = 20`, `MAX_SENTENCE_LENGTH = 300`
  - Write comprehensive unit tests

  **Must NOT do**:
  - Do NOT add NLP/ML dependencies (no nlp.js, compromise, etc.) — heuristics only
  - Do NOT import from or modify analysis/detection modules
  - Do NOT handle file parsing here — this module receives plain text only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Algorithm design requiring careful edge case handling and thorough testing
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser testing needed for library code

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/suggestions/guardrails.ts` — Pattern for pure utility module with regex-based filtering
  - `src/lib/suggestions/types.ts` — Pattern for clean type definition files

  **API/Type References**:
  - `src/lib/suggestions/voiceProfile.ts:39` — `MAX_PROFILE_LENGTH = 2000` — extracted sentences must fit within this budget when serialized

  **External References**:
  - No external deps needed — pure string manipulation with regex

  **WHY Each Reference Matters**:
  - `guardrails.ts` — Shows the project's style for regex-based text filtering utilities; follow same export pattern and testing approach
  - `types.ts` — Shows how to define clean interfaces with JSDoc comments

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Extract diverse sentences from a normal academic paper
    Tool: Bash (vitest)
    Preconditions: Test with a 2000-char sample academic text
    Steps:
      1. Call `extractStyleSentences(sampleText, 6)`
      2. Assert result.count === 6
      3. Assert result.sentences.length === 6
      4. Measure length distribution: at least 2 different length buckets represented
      5. Verify no sentence is <20 chars or >300 chars
    Expected Result: 6 sentences returned with diverse lengths, all within size bounds
    Failure Indicators: All sentences similar length, count mismatch, sentences outside bounds
    Evidence: .sisyphus/evidence/task-2-normal-extraction.txt

  Scenario: Filter garbage sentences
    Tool: Bash (vitest)
    Preconditions: Test with text containing headers, citations, URLs, list items
    Steps:
      1. Provide text: "1. Introduction\nThis is a real sentence about methodology. See https://example.com for details. (Smith, 2024) found that results vary. FIGURE 1: CAPTION TEXT. The analysis reveals interesting patterns in the data."
      2. Call `filterCandidates(splitIntoSentences(text))`
      3. Assert "1. Introduction" NOT in result (list item / too short)
      4. Assert URL-containing sentence NOT in result
      5. Assert all-caps sentence NOT in result
      6. Assert real sentences ARE in result
    Expected Result: Only natural prose sentences survive filtering
    Failure Indicators: Garbage sentences not filtered, good sentences incorrectly removed
    Evidence: .sisyphus/evidence/task-2-garbage-filtering.txt

  Scenario: Handle short text (fewer usable sentences than requested)
    Tool: Bash (vitest)
    Preconditions: Test with text containing only 3 usable sentences (500+ chars total)
    Steps:
      1. Call `extractStyleSentences(shortText, 6)`
      2. Assert result.count === 3 (returns what's available)
      3. Assert result.sentences.length === 3
    Expected Result: Returns all available sentences without error when fewer than requested
    Failure Indicators: Throws error, returns empty, or duplicates sentences to fill count
    Evidence: .sisyphus/evidence/task-2-short-text.txt

  Scenario: Reject text below minimum length
    Tool: Bash (vitest)
    Preconditions: Text shorter than 500 chars
    Steps:
      1. Call `extractStyleSentences("Short text.")`
      2. Expect it to return `{ sentences: [], count: 0, sourceCharCount: 10 }` or throw
    Expected Result: Graceful handling of too-short input
    Failure Indicators: Returns garbage results or crashes
    Evidence: .sisyphus/evidence/task-2-min-length.txt
  ```

  **Commit**: YES
  - Message: `feat(style-extraction): add diversity-based sentence extraction algorithm`
  - Files: `src/lib/style-extraction/*`, test files
  - Pre-commit: `npm run test`

- [x] 3. Few-Shot Context Block Builder + Prompt Integration

  **What to do**:
  - Add `buildFewShotContextBlock(sentences: string[]): string` to `src/lib/suggestions/voiceProfile.ts`:
    - If `sentences` is empty, return `''`
    - Format: `"Write in the same style as these example sentences from the author:\n1. \"sentence one\"\n2. \"sentence two\"\n..."`
    - Truncate if total exceeds 2000 chars (same as MAX_PROFILE_LENGTH)
  - Add `MAX_FEWSHOT_CONTEXT_LENGTH = 2000` constant
  - Modify `buildMultiUserPrompt(sentence, voiceProfile?, fewShotExamples?: string[])` in `src/lib/suggestions/llm.ts`:
    - Accept optional `fewShotExamples` parameter
    - If `fewShotExamples` is provided and non-empty, use `buildFewShotContextBlock` instead of `buildRewriteContextBlock` (mutually exclusive — few-shot takes precedence since UI enforces mutual exclusivity, but code handles edge case)
    - If only `voiceProfile` is provided, use existing `buildRewriteContextBlock` (unchanged behavior)
  - Modify `buildUserPrompt(sentence, voiceProfile?, fewShotExamples?: string[])` to also accept few-shot context (needed for `twoPassRewrite` after Task 1 fix)
  - Update `generateAlternativeSuggestions` to accept and forward `fewShotExamples`
  - Update `generateSingleSuggestionWithProvider` to accept and forward `fewShotExamples`
  - Update `twoPassRewrite` to accept and use `fewShotExamples`
  - Write unit tests verifying few-shot context appears in prompts, and that existing voiceProfile behavior is unchanged when fewShotExamples is absent

  **Must NOT do**:
  - Do NOT modify `MULTI_SYSTEM_PROMPT` or `SYSTEM_PROMPT` constants
  - Do NOT combine voiceProfile + fewShotExamples in the same prompt (mutually exclusive)
  - Do NOT change the response format or parsing logic

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple file modifications with careful backward compatibility requirements
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No UI involved

  **Parallelization**:
  - **Can Run In Parallel**: YES (but should start after Task 1 merges the voiceProfile threading)
  - **Parallel Group**: Wave 1 (with Tasks 1, 2) — but depends on Task 1 for `twoPassRewrite` voiceProfile parameter
  - **Blocks**: Tasks 4, 6, 7
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/lib/suggestions/voiceProfile.ts:105-117` — `buildRewriteContextBlock` — copy this pattern for `buildFewShotContextBlock`
  - `src/lib/suggestions/llm.ts:53-66` — `buildMultiUserPrompt` — the function to modify for few-shot injection
  - `src/lib/suggestions/llm.ts:49-51` — `buildUserPrompt` — also needs modification for two-pass support

  **API/Type References**:
  - `src/lib/suggestions/voiceProfile.ts:39` — `MAX_PROFILE_LENGTH = 2000` — use same budget for few-shot context
  - `src/lib/suggestions/voiceProfile.ts:1-6` — `VoicePresetKey` type — reference for export patterns

  **Test References**:
  - `src/lib/suggestions/__tests__/` — existing test patterns for suggestion module

  **WHY Each Reference Matters**:
  - `buildRewriteContextBlock` — The exact pattern to follow; new function has same structure but formats string[] instead of string
  - `buildMultiUserPrompt` — This is WHERE few-shot gets injected; must understand existing voiceProfile flow to extend
  - `llm.ts:53-66` — Shows how voiceProfile is currently prepended to user prompt

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Few-shot context block correctly formatted
    Tool: Bash (vitest)
    Preconditions: None
    Steps:
      1. Call `buildFewShotContextBlock(["First example sentence.", "Second one here.", "Third different sentence."])`
      2. Assert output starts with "Write in the same style as these example sentences from the author:"
      3. Assert output contains numbered items with quoted sentences
      4. Assert output contains all 3 sentences
    Expected Result: Properly formatted few-shot context block
    Failure Indicators: Missing sentences, wrong format, missing quotes or numbering
    Evidence: .sisyphus/evidence/task-3-context-block-format.txt

  Scenario: Few-shot replaces voiceProfile in prompt (mutually exclusive)
    Tool: Bash (vitest)
    Preconditions: Mock LLM adapter
    Steps:
      1. Call `buildMultiUserPrompt("test sentence", "voice profile text", ["example 1", "example 2"])`
      2. Assert result contains "Write in the same style" (few-shot)
      3. Assert result does NOT contain "Author voice profile" (voiceProfile block)
    Expected Result: Few-shot takes precedence, voiceProfile block absent
    Failure Indicators: Both context blocks present, or neither present
    Evidence: .sisyphus/evidence/task-3-mutual-exclusivity.txt

  Scenario: VoiceProfile still works when no fewShotExamples
    Tool: Bash (vitest)
    Preconditions: None
    Steps:
      1. Call `buildMultiUserPrompt("test sentence", "my writing style is concise")`
      2. Assert result contains "Author voice profile"
      3. Assert result contains "my writing style is concise"
    Expected Result: Existing voiceProfile behavior unchanged
    Failure Indicators: VoiceProfile not injected, or fewShotExamples erroneously appears
    Evidence: .sisyphus/evidence/task-3-backward-compat.txt

  Scenario: Empty fewShotExamples falls back to voiceProfile
    Tool: Bash (vitest)
    Preconditions: None
    Steps:
      1. Call `buildMultiUserPrompt("test sentence", "profile text", [])`
      2. Assert result contains "Author voice profile" (falls back)
    Expected Result: Empty array treated as absent
    Failure Indicators: Empty few-shot block injected
    Evidence: .sisyphus/evidence/task-3-empty-fallback.txt
  ```

  **Commit**: YES
  - Message: `feat(suggestions): add few-shot context block and prompt integration`
  - Files: `src/lib/suggestions/voiceProfile.ts`, `src/lib/suggestions/llm.ts`, test files
  - Pre-commit: `npm run test`

- [x] 4. API Endpoint: /api/extract-style

  **What to do**:
  - Create `src/app/api/extract-style/route.ts`:
    - Accept both `multipart/form-data` (file upload) and `application/json` (text paste)
    - For file upload: reuse `extractDocx`/`extractDoc` from `src/lib/files/` to get text
    - For text paste: accept JSON body `{ text: string }`
    - Validate: file must be .docx/.doc, text must be 500-50000 chars
    - Call `extractStyleSentences(text)` from `src/lib/style-extraction/`
    - Return `{ sentences: string[], count: number }` on success
    - Return appropriate error codes: `INVALID_REQUEST` (400), `TEXT_TOO_SHORT` (400), `TEXT_TOO_LONG` (400), `UNSUPPORTED_FORMAT` (400)
  - Set `export const runtime = 'nodejs'`
  - Follow existing API route patterns for error handling and validation

  **Must NOT do**:
  - Do NOT modify existing `/api/analyze` endpoint
  - Do NOT persist uploaded files or extracted text
  - Do NOT enforce language detection (English-only is enforced by the analysis side; style extraction just extracts sentences)
  - Do NOT require authentication or API keys (no LLM calls needed)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: API endpoint with file handling, two input modes, validation, error handling
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: No browser testing needed for API

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 2, 3

  **References**:

  **Pattern References**:
  - `src/app/api/analyze/route.ts` — Pattern for multipart/form-data file handling with temp file processing
  - `src/app/api/suggestions/route.ts` — Pattern for JSON body API with validation
  - `src/app/api/voice-profile/generate/route.ts:93-194` — Pattern for POST handler with error handling

  **API/Type References**:
  - `src/lib/files/docx.ts` — `extractDocx(buffer)` — returns `{ text, charCount, warnings }`
  - `src/lib/files/doc.ts` — `extractDoc(buffer)` — same interface
  - `src/lib/files/validate.ts` — file validation (MIME type, magic bytes, 5MB limit)
  - `src/lib/style-extraction/types.ts` — `StyleExtractionResult` type
  - `src/lib/files/errors.ts` — `FileProcessingError` class for error handling

  **Test References**:
  - `tests/` — check existing integration test patterns for API routes

  **WHY Each Reference Matters**:
  - `api/analyze/route.ts` — Shows exactly how to handle `multipart/form-data`, extract File from FormData, validate, process with mammoth/word-extractor
  - `files/docx.ts` — The exact functions to reuse for text extraction from uploaded files
  - `files/validate.ts` — Reuse file validation but apply different min length (500 vs 300)

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Extract style from .docx file upload
    Tool: Bash (curl)
    Preconditions: Dev server running, test .docx file available at Test-doc/ or Test.docx
    Steps:
      1. curl -X POST http://localhost:3000/api/extract-style -F "file=@Test.docx"
      2. Parse JSON response
      3. Assert response status 200
      4. Assert response body has `sentences` (array of strings) and `count` (number)
      5. Assert count >= 1 and count <= 8
    Expected Result: 200 OK with sentences array and count
    Failure Indicators: 400/500 error, empty sentences, count mismatch
    Evidence: .sisyphus/evidence/task-4-docx-upload.txt

  Scenario: Extract style from pasted text
    Tool: Bash (curl)
    Preconditions: Dev server running
    Steps:
      1. curl -X POST http://localhost:3000/api/extract-style -H "Content-Type: application/json" -d '{"text":"<500+ char sample text with multiple sentences>"}'
      2. Assert response status 200
      3. Assert response body has sentences and count
    Expected Result: 200 OK with extracted sentences
    Failure Indicators: Error response or empty sentences
    Evidence: .sisyphus/evidence/task-4-text-paste.txt

  Scenario: Reject text too short
    Tool: Bash (curl)
    Preconditions: Dev server running
    Steps:
      1. curl -X POST http://localhost:3000/api/extract-style -H "Content-Type: application/json" -d '{"text":"Too short."}'
      2. Assert response status 400
      3. Assert error code is "TEXT_TOO_SHORT"
    Expected Result: 400 with TEXT_TOO_SHORT error
    Failure Indicators: 200 response or different error code
    Evidence: .sisyphus/evidence/task-4-too-short.txt

  Scenario: Reject invalid file format
    Tool: Bash (curl)
    Preconditions: Dev server running
    Steps:
      1. Create a .txt file and try to upload it
      2. curl -X POST http://localhost:3000/api/extract-style -F "file=@test.txt"
      3. Assert response status 400
      4. Assert error code is "UNSUPPORTED_FORMAT"
    Expected Result: 400 with UNSUPPORTED_FORMAT error
    Failure Indicators: 200 response or server crash
    Evidence: .sisyphus/evidence/task-4-invalid-format.txt
  ```

  **Commit**: YES
  - Message: `feat(api): add /api/extract-style endpoint`
  - Files: `src/app/api/extract-style/route.ts`, test files
  - Pre-commit: `npm run test`

- [ ] 5. MyPaperTab Component + VoiceProfilePanel Tab UI

  **What to do**:
  - Create `src/components/MyPaperTab.tsx`:
    - File upload input accepting `.docx`, `.doc` files
    - Text paste textarea with placeholder "Paste your writing here (min 500 characters)..."
    - "Extract Style" button that calls `/api/extract-style` with either the file or pasted text
    - Loading state during extraction
    - Error display (inline red box, matching existing pattern)
    - Success state: "N style sentences extracted" with a preview (first 2 sentences truncated) and "Clear" button
    - Clear button resets all state (file, text, extracted sentences)
    - Props: `{ fewShotExamples: string[]; setFewShotExamples: (s: string[]) => void; settings: AppSettings }`
  - Modify `src/components/VoiceProfilePanel.tsx`:
    - Add a tab bar at the top: "Voice Profile" | "My Paper"
    - Add `activeTab` local state (default: "Voice Profile")
    - Accept new prop: `activeStyleTab: 'voice-profile' | 'my-paper'` and `onStyleTabChange: (tab) => void`
    - When "My Paper" tab is active, render `MyPaperTab` instead of existing content
    - When switching tabs, clear the other tab's data (mutually exclusive):
      - Switching to "My Paper" → clear voiceProfile string
      - Switching to "Voice Profile" → call `setFewShotExamples([])`
    - Keep existing VoiceProfilePanel UI unchanged when "Voice Profile" tab is active
  - Style with Tailwind matching existing design (slate color scheme, rounded borders, subtle shadows)

  **Must NOT do**:
  - Do NOT add more than 3 new props to VoiceProfilePanel (use `activeStyleTab`, `onStyleTabChange`, and render `MyPaperTab` as child)
  - Do NOT add localStorage persistence for extracted sentences
  - Do NOT add individual sentence editing/deletion — only summary + Clear
  - Do NOT change existing VoiceProfilePanel behavior when "Voice Profile" tab is active

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component creation with tab switching, file upload, loading states, matching existing design system
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: E2E testing is in Task 7, not here

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: Tasks 6, 7
  - **Blocked By**: Task 2 (needs extraction types for display)

  **References**:

  **Pattern References**:
  - `src/components/VoiceProfilePanel.tsx:103-218` — Entire existing component — study layout, styling classes, state management pattern to match
  - `src/components/VoiceProfilePanel.tsx:146-155` — Textarea pattern for the paste input
  - `src/components/VoiceProfilePanel.tsx:163-170` — Button pattern for the extract button
  - `src/components/VoiceProfilePanel.tsx:157-161` — Error display pattern (red box)

  **API/Type References**:
  - `src/lib/settings/types.ts` — `AppSettings` type for the settings prop
  - `src/hooks/useSettings.ts` — `buildRequestHeaders` for API calls from components

  **External References**:
  - No external component libraries — plain Tailwind CSS

  **WHY Each Reference Matters**:
  - `VoiceProfilePanel.tsx:103-218` — Must match exact styling patterns (color classes, spacing, border styles) for visual consistency
  - `VoiceProfilePanel.tsx:146-155` — Copy textarea className and styling for the paste input
  - `VoiceProfilePanel.tsx:163-170` — Copy button styling for the extract button

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Tab switching between Voice Profile and My Paper
    Tool: Playwright
    Preconditions: App running, essay uploaded and analyzed (result shown)
    Steps:
      1. Navigate to http://localhost:3000
      2. Upload a .docx file and wait for analysis
      3. Locate Voice Profile panel section
      4. Assert "Voice Profile" tab is active by default
      5. Click "My Paper" tab
      6. Assert My Paper content is visible (file upload input, paste textarea)
      7. Assert Voice Profile content is hidden
      8. Click "Voice Profile" tab
      9. Assert Voice Profile content is visible again
    Expected Result: Tab switching works, content toggles correctly
    Failure Indicators: Both contents visible, tab click doesn't switch, content doesn't change
    Evidence: .sisyphus/evidence/task-5-tab-switching.png

  Scenario: Paste text and extract style sentences
    Tool: Playwright
    Preconditions: App running, essay analyzed, My Paper tab active
    Steps:
      1. Click "My Paper" tab
      2. Fill textarea with 600+ chars of sample text: "The methodology employed in this study involved a comprehensive analysis of existing literature. We examined multiple data sources to establish baseline measurements. Our findings suggest that previous assumptions were not entirely accurate. The statistical analysis revealed significant correlations between the variables. Furthermore, the qualitative data provided rich contextual information that complemented our quantitative findings. In conclusion, this research contributes new insights to the field."
      3. Click "Extract Style" button
      4. Wait for loading to complete (button should show loading state)
      5. Assert success message visible: contains "style sentences extracted"
      6. Assert preview shows first 1-2 sentences
      7. Assert "Clear" button is visible
    Expected Result: Extraction succeeds, count displayed, preview shown
    Failure Indicators: Error message, no count, loading never completes
    Evidence: .sisyphus/evidence/task-5-paste-extract.png

  Scenario: Clear extracted sentences
    Tool: Playwright
    Preconditions: Sentences already extracted in My Paper tab
    Steps:
      1. Assert extracted sentences summary is visible
      2. Click "Clear" button
      3. Assert summary disappears
      4. Assert textarea is empty
      5. Assert file input is cleared
    Expected Result: All My Paper state reset
    Failure Indicators: State not fully cleared, summary still visible
    Evidence: .sisyphus/evidence/task-5-clear.png

  Scenario: Mutual exclusivity — switching tabs clears other
    Tool: Playwright
    Preconditions: App running, essay analyzed
    Steps:
      1. Go to Voice Profile tab, generate a profile (select a preset, click Generate)
      2. Assert voice profile textarea has content
      3. Switch to "My Paper" tab
      4. Assert voice profile is now cleared (check data-testid="voice-profile-state" data-value is empty)
      5. Extract some sentences in My Paper tab
      6. Switch back to "Voice Profile" tab
      7. Assert few-shot examples are cleared
    Expected Result: Tab switch clears the other tab's data
    Failure Indicators: Previous tab's data persists after switch
    Evidence: .sisyphus/evidence/task-5-mutual-exclusivity.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add My Paper tab with file upload and text paste`
  - Files: `src/components/MyPaperTab.tsx`, `src/components/VoiceProfilePanel.tsx`
  - Pre-commit: `npm run typecheck`

- [ ] 6. Page-Level State Management + API Wiring

  **What to do**:
  - In `src/app/page.tsx`:
    - Add `fewShotExamples` state: `const [fewShotExamples, setFewShotExamples] = useState<string[]>([])`
    - Add `activeStyleTab` state: `const [activeStyleTab, setActiveStyleTab] = useState<'voice-profile' | 'my-paper'>('voice-profile')`
    - Pass `fewShotExamples`, `setFewShotExamples`, `activeStyleTab`, `onStyleTabChange` to VoiceProfilePanel
    - When `activeStyleTab` changes to 'my-paper': clear `voiceProfile` state
    - When `activeStyleTab` changes to 'voice-profile': clear `fewShotExamples` state
    - Pass `fewShotExamples` to all API calls that currently pass `voiceProfile`:
      - Individual suggestions (ReviewPanel → /api/suggestions): add `fewShotExamples` to request body
      - Bulk rewrite (handleBulkRewrite → /api/bulk-rewrite): add `fewShotExamples` to request body
  - Modify `src/app/api/suggestions/route.ts`:
    - Accept optional `fewShotExamples: string[]` in request body
    - Pass to `generateAlternativeSuggestions`
  - Modify `src/app/api/bulk-rewrite/route.ts`:
    - Accept optional `fewShotExamples: string[]` in request body
    - Pass through `BulkRewriteRequest` to `executeBulkRewrite`
  - Modify `src/lib/bulk-rewrite/types.ts`:
    - Add `fewShotExamples?: string[]` to `BulkRewriteRequest`
  - Modify `src/lib/bulk-rewrite/bulkRewrite.ts`:
    - Thread `fewShotExamples` to `generateSingleSuggestionWithProvider` calls
  - Ensure `handleSubmit` (new essay upload) does NOT clear `fewShotExamples` state (user wants to keep reference paper across analysis submissions)

  **Must NOT do**:
  - Do NOT persist fewShotExamples to localStorage
  - Do NOT clear fewShotExamples on new essay upload (only on tab switch)
  - Do NOT send both voiceProfile AND fewShotExamples in the same API call (mutually exclusive enforced by tab switching)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mostly wiring/plumbing — adding a new field through existing data flow
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 3, 5

  **References**:

  **Pattern References**:
  - `src/app/page.tsx:20-30` — Existing state declarations for voiceProfile — add fewShotExamples alongside
  - `src/app/page.tsx:46-122` — `handleBulkRewrite` — shows how voiceProfile is passed to bulk-rewrite API; add fewShotExamples similarly
  - `src/app/page.tsx:236-253` — VoiceProfilePanel rendering — add new props here

  **API/Type References**:
  - `src/app/api/suggestions/route.ts:12-18` — `SuggestionRequest` interface — add fewShotExamples field
  - `src/app/api/bulk-rewrite/route.ts:30-36` — validation function — add fewShotExamples validation
  - `src/lib/bulk-rewrite/types.ts` — `BulkRewriteRequest` — add field

  **Test References**:
  - Existing API route tests if any

  **WHY Each Reference Matters**:
  - `page.tsx:46-122` — Shows exact pattern for passing data to API calls; replicate for fewShotExamples
  - `SuggestionRequest` — Must extend this interface to accept the new field

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: fewShotExamples passed to suggestions API
    Tool: Playwright (with network interception)
    Preconditions: App running, essay analyzed, My Paper tab with extracted sentences
    Steps:
      1. Upload essay, wait for analysis
      2. Switch to My Paper tab, paste text, extract sentences
      3. Click a highlighted sentence to request rewrite suggestion
      4. Intercept the POST to /api/suggestions
      5. Assert request body contains `fewShotExamples` array (non-empty)
      6. Assert request body does NOT contain `voiceProfile` (or it's empty/undefined)
    Expected Result: API request includes fewShotExamples, not voiceProfile
    Failure Indicators: fewShotExamples missing from request, or voiceProfile also present
    Evidence: .sisyphus/evidence/task-6-suggestion-api-body.txt

  Scenario: fewShotExamples passed to bulk-rewrite API
    Tool: Playwright (with network interception)
    Preconditions: App running, essay analyzed, My Paper active with extracted sentences
    Steps:
      1. Set target score in Target Score panel
      2. Click bulk rewrite button
      3. Intercept POST to /api/bulk-rewrite
      4. Assert request body contains `fewShotExamples` array
    Expected Result: Bulk rewrite request includes few-shot examples
    Failure Indicators: fewShotExamples missing from bulk request
    Evidence: .sisyphus/evidence/task-6-bulk-api-body.txt

  Scenario: fewShotExamples persists across new essay upload
    Tool: Playwright
    Preconditions: App running
    Steps:
      1. Upload essay A, wait for analysis
      2. Switch to My Paper, paste text, extract sentences
      3. Note the extracted sentence count
      4. Upload essay B (different file)
      5. Wait for new analysis
      6. Check My Paper tab — assert sentences are still present (same count)
    Expected Result: Few-shot examples survive new essay upload
    Failure Indicators: Sentences cleared after uploading new essay
    Evidence: .sisyphus/evidence/task-6-persist-across-upload.png
  ```

  **Commit**: YES
  - Message: `feat(integration): wire few-shot examples end-to-end`
  - Files: `src/app/page.tsx`, `src/app/api/suggestions/route.ts`, `src/app/api/bulk-rewrite/route.ts`, `src/lib/bulk-rewrite/types.ts`, `src/lib/bulk-rewrite/bulkRewrite.ts`
  - Pre-commit: `npm run test`

- [x] 7. End-to-End Wiring + E2E Tests

  **What to do**:
  - Create E2E test file `e2e/my-paper-flow.spec.ts`:
    - Test: Full flow — upload essay → My Paper tab → paste reference text → extract → click highlighted sentence → verify rewrite suggestion received
    - Test: Full flow — upload essay → My Paper tab → upload reference .docx → extract → bulk rewrite → verify rewrites applied
    - Test: Tab mutual exclusivity E2E — generate voice profile → switch to My Paper → verify profile cleared → extract sentences → switch to Voice Profile → verify sentences cleared
    - Test: Error handling — paste text too short → verify error message
  - Run full verification suite: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:e2e`
  - Fix any issues discovered during integration testing
  - Verify the complete data flow works: UI → API → extraction → prompt → LLM → response → UI display

  **Must NOT do**:
  - Do NOT skip any existing tests — all must still pass
  - Do NOT mock the extract-style API in E2E tests (test real endpoint)
  - Do NOT add unnecessary waits — use Playwright auto-waiting

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration testing across entire stack requires understanding of all components
  - **Skills**: [`playwright`]
    - `playwright`: Required for E2E browser automation tests

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — after all other tasks)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 4, 5, 6

  **References**:

  **Pattern References**:
  - `e2e/` — Existing E2E test patterns, test configuration, helper utilities
  - `playwright.config.ts` — Playwright configuration for test setup

  **Test References**:
  - `e2e/` — All existing E2E tests — follow naming convention, page object patterns if any

  **WHY Each Reference Matters**:
  - `e2e/` — Must follow existing test naming and structure conventions for consistency
  - `playwright.config.ts` — Understand test server setup, base URL, timeouts

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Complete paste → extract → rewrite flow
    Tool: Playwright
    Preconditions: Dev server running at localhost:3000
    Steps:
      1. Navigate to http://localhost:3000
      2. Upload Test.docx file via file input
      3. Click "Submit for Review" and wait for analysis results
      4. Click "My Paper" tab in Voice Profile section
      5. Paste 600+ chars of reference text into textarea
      6. Click "Extract Style" button
      7. Wait for extraction to complete
      8. Assert "N style sentences extracted" message visible
      9. Click a highlighted (high-score) sentence in the review panel
      10. Wait for suggestion to load
      11. Assert suggestion panel shows rewrite alternatives
    Expected Result: Full flow works — extraction to suggestion with style reference
    Failure Indicators: Any step fails, extraction error, suggestion not received
    Evidence: .sisyphus/evidence/task-7-full-paste-flow.png

  Scenario: Complete file upload → extract → bulk rewrite flow
    Tool: Playwright
    Preconditions: Dev server running, two .docx files available (one for analysis, one for reference)
    Steps:
      1. Upload analysis essay
      2. Wait for analysis
      3. Switch to My Paper tab
      4. Upload reference paper .docx via file input in My Paper tab
      5. Click Extract Style
      6. Wait for extraction
      7. Enter target score (e.g., "30") in Target Score panel
      8. Click bulk rewrite button
      9. Wait for bulk rewrite to complete
      10. Assert revised panel appears with rewritten content
    Expected Result: Bulk rewrite completes using file-uploaded style reference
    Failure Indicators: Extraction fails, bulk rewrite error, no revised panel
    Evidence: .sisyphus/evidence/task-7-full-file-flow.png

  Scenario: All existing tests pass (regression check)
    Tool: Bash
    Preconditions: All tasks implemented
    Steps:
      1. Run `npm run typecheck`
      2. Run `npm run lint`
      3. Run `npm run test`
      4. Run `npm run test:e2e`
    Expected Result: All commands exit 0 with no failures
    Failure Indicators: Any command fails
    Evidence: .sisyphus/evidence/task-7-regression-check.txt
  ```

  **Commit**: YES
  - Message: `test(e2e): add E2E tests for My Paper flow`
  - Files: `e2e/my-paper-flow.spec.ts`
  - Pre-commit: `npm run test:e2e`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message | Files | Pre-commit |
|--------|---------|-------|------------|
| 1 | `fix(bulk-rewrite): thread voiceProfile through rewrite pipeline` | `llm.ts`, `bulkRewrite.ts` | `npm run test` |
| 2 | `feat(style-extraction): add diversity-based sentence extraction algorithm` | `src/lib/style-extraction/*` | `npm run test` |
| 3 | `feat(suggestions): add few-shot context block and prompt integration` | `voiceProfile.ts`, `llm.ts` | `npm run test` |
| 4 | `feat(api): add /api/extract-style endpoint` | `src/app/api/extract-style/route.ts` | `npm run test` |
| 5 | `feat(ui): add My Paper tab with file upload and text paste` | `MyPaperTab.tsx`, `VoiceProfilePanel.tsx`, `page.tsx` | `npm run typecheck` |
| 6 | `feat(integration): wire few-shot examples end-to-end` | `page.tsx`, API routes | `npm run test` |
| 7 | `test(e2e): add E2E tests for My Paper flow` | `e2e/*` | `npm run test:e2e` |

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck  # Expected: no errors
npm run lint       # Expected: no errors
npm run test       # Expected: all tests pass
npm run test:e2e   # Expected: all tests pass
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Bulk rewrite voice profile bug fixed
- [ ] My Paper tab functional with file upload + text paste
- [ ] Few-shot examples reflected in rewrite suggestions
- [ ] Mutually exclusive tab switching works correctly
