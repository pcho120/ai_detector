# Effective AI Score Reduction

## TL;DR

> **Quick Summary**: Fix critical text reconstruction bugs and overhaul the rewrite strategy so bulk rewrite actually reduces Sapling AI detection scores from ~100% to ≤70%. The current `deriveTextWithRewrites` destroys document structure with `.join(' ')`, sentence indices drift after re-analysis, Pass 2 re-polishes text back to AI-like, and prompts are too generic to produce statistically different text.
> 
> **Deliverables**:
> - Fixed text reconstruction that preserves original document whitespace/paragraphs
> - Overhauled prompts with specific structural transformation instructions
> - Single-pass high-temperature rewriting (eliminate counterproductive Pass 2)
> - Paragraph-level rewriting for better cross-sentence pattern disruption
> - Recursive retry with varied prompts for persistent high-scoring passages
> - Playwright E2E test proving score drops to ≤70% with real Sapling API
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: T1 (text fix) → T4 (paragraph rewrite) → T6 (E2E test) → T7 (iterate)

---

## Context

### Original Request
User tested bulk rewrite with real documents (`Test.docx`, `User example4.docx`). Score stayed at 100% with a target of 70%. User said: "I don't care how it is done, just update the code so that it reduces the score of the essay. Test with Playwright after editing. If score doesn't meet target, change code again."

### Interview Summary
**Key Discussions**:
- Previous plan (`bulk-rewrite-engine-v2`) completed all 7 tasks + final wave — engine mechanics work perfectly (637/637 tests pass) but rewrites don't reduce scores
- User chose "Change anything needed" — no constraints on rewrite strategy
- Real Sapling API for every test iteration (not mocked)
- Playwright E2E only — no unit test updates, focus on proving score drops
- No new npm dependencies

**Research Findings**:
- **Critical bug**: `deriveTextWithRewrites` joins sentences with `.join(' ')`, destroying paragraph breaks and whitespace. Sapling re-analyzes garbled single-paragraph text, producing different sentence boundaries and drifted indices
- **Sentence index drift**: After re-analysis, `workingSentences` is re-indexed from 0 based on Sapling's NEW sentence splits of the flattened text — indices no longer match original `rewrites` Record keys
- **gpt-4o-mini at 0.7 temperature** produces fluent text with low perplexity — exactly what Sapling detects
- **Pass 2 is counterproductive**: Re-polishes Pass 1 output back toward AI-typical fluency patterns
- **Sentence-level rewriting is insufficient**: Sapling uses document-level coherence, cross-sentence patterns, and perplexity distribution — sentence-by-sentence doesn't disrupt these
- **Research-backed strategy**: Recursive paraphrasing with structural diversity (70-85% effectiveness), paragraph-level rewriting disrupts cross-sentence coherence, specific transformation instructions (sentence length variation, self-correction, specificity) produce genuinely different statistical properties

### Metis Review
**Identified Gaps** (addressed):
- Sentence index drift after re-analysis is a compounding bug beyond just `.join(' ')` — plan must handle re-mapping
- Temperature increase alone won't beat Sapling — prompt overhaul is the real lever
- Paragraph-level rewriting changes the pipeline — must keep function signature compatible
- Real Sapling API rate limits — E2E test should use ONE document of reasonable length
- Guardrails might filter effective rewrites if new prompts are too directive — verify compatibility
- 50-second deadline may be tight with paragraph-level rewrites — monitor and adjust if needed
- Iterative fix loop needs hard cap: 3 diagnostic iterations maximum

---

## Work Objectives

### Core Objective
Make bulk rewrite actually reduce Sapling AI detection scores from ~100% to ≤70% by fixing text reconstruction bugs and overhauling the rewrite strategy.

### Concrete Deliverables
- Fixed `deriveTextWithRewrites` that preserves original text structure
- Stable sentence index mapping after re-analysis
- Overhauled system/user prompts with structural transformation instructions
- Single-pass high-temperature rewriting for bulk rewrite path
- Paragraph-level rewriting capability
- Recursive retry with varied prompts
- Playwright E2E test with real Sapling API proving ≤70% score

### Definition of Done
- [ ] Playwright E2E test passes: real document scores ≤70% after bulk rewrite
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run test` passes (existing 637+ tests still green)

### Must Have
- Text reconstruction preserves original whitespace, newlines, paragraph breaks
- Sentence indices stay stable across re-analysis rounds
- Prompts include specific structural transformation instructions (not generic "sound human")
- Pass 2 eliminated for bulk rewrite path
- Temperature ≥ 0.9 for bulk rewrite Pass 1
- Paragraph-level rewriting for adjacent high-score sentences
- Recursive retry with DIFFERENT prompts for persistent high-score items
- Playwright E2E test with REAL Sapling API (not mocked)
- Score reduction to ≤70% on test document

### Must NOT Have (Guardrails)
- NO changes to `BulkRewriteResult` interface shape (`src/lib/bulk-rewrite/types.ts`)
- NO changes to `CONCURRENCY` value (stays at 5)
- NO changes to detection adapters (`sapling.ts`, `copyleaks.ts`, etc.)
- NO changes to Settings UI components
- NO new npm dependencies
- NO changes to `guardrails.ts` banned patterns or filtering logic
- NO changes to `generateAlternativeSuggestions` or `LlmSuggestionService.suggest` (single-suggestion UI path must keep working)
- NO mocked Sapling API in E2E test
- NO SSE/streaming changes
- NO changes to `buildRequestHeaders()` or `getRequestSettings()`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (bun test + Playwright)
- **Automated tests**: Playwright E2E only for new behavior; existing unit tests as regression guard
- **Framework**: bun test (unit/integration), Playwright (E2E)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Unit regression**: Use Bash (`npm run test`) — verify 637+ tests still pass
- **Type safety**: Use Bash (`npm run typecheck`) — zero errors
- **E2E validation**: Use Playwright — real Sapling API, real document upload, assert score ≤70%

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — fix foundation, MAX PARALLEL):
├── Task 1: Fix deriveTextWithRewrites + sentence index stability [deep]
├── Task 2: Overhaul rewrite prompts for structural transformation [unspecified-high]
├── Task 3: Eliminate Pass 2 for bulk rewrite, increase temperature [quick]

Wave 2 (After Wave 1 — strategic rewrite improvements):
├── Task 4: Paragraph-level rewriting for bulk rewrite [deep]
├── Task 5: Recursive retry with varied prompts [unspecified-high]

Wave 3 (After Wave 2 — validation + iteration):
├── Task 6: Playwright E2E test with real Sapling API [unspecified-high]
├── Task 7: Iterative diagnosis and fix loop (max 3 rounds) [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: T1 → T4 → T6 → T7 → F1-F4 → user okay
Parallel Speedup: ~40% faster than sequential
Max Concurrent: 3 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1   | None      | T4, T5, T6 | 1 |
| T2   | None      | T5, T6 | 1 |
| T3   | None      | T4, T5, T6 | 1 |
| T4   | T1, T3    | T6     | 2 |
| T5   | T1, T2, T3 | T6    | 2 |
| T6   | T4, T5    | T7     | 3 |
| T7   | T6        | F1-F4  | 3 |
| F1-F4 | T7       | user okay | FINAL |

### Agent Dispatch Summary

- **Wave 1**: **3** — T1 → `deep`, T2 → `unspecified-high`, T3 → `quick`
- **Wave 2**: **2** — T4 → `deep`, T5 → `unspecified-high`
- **Wave 3**: **2** — T6 → `unspecified-high`, T7 → `deep`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix `deriveTextWithRewrites` + Sentence Index Stability

  **What to do**:
  - Rewrite `deriveTextWithRewrites` in `src/lib/bulk-rewrite/bulkRewrite.ts` to preserve original text structure. Instead of `.join(' ')`, locate each original sentence within the original full text using string position matching and replace it in-place, preserving all whitespace, newlines, and paragraph breaks between sentences.
  - Add `originalText: string` as a new parameter to `deriveTextWithRewrites`. The function signature changes from `(originalSentences, rewrites)` to `(originalText, originalSentences, rewrites)`.
  - Use `lsp_find_references` on `deriveTextWithRewrites` to find ALL callers and update them to pass the original text.
  - Fix the sentence index drift bug in the re-analysis loop (lines 156-160): After Sapling re-analysis, the engine must map Sapling's new sentence splits back to original indices. Use **text matching** — for each sentence from re-analysis, find which original sentence index it corresponds to (or which rewrite it matches) by comparing the text content. If Sapling splits differently than the original, use the best-match approach (substring matching or Levenshtein distance on sentence text).
  - Alternatively, simpler approach: After re-analysis, instead of blindly re-indexing from 0, reconstruct `workingSentences` by iterating over the ORIGINAL sentence indices and looking up the new score for each by matching sentence text against the re-analysis results. If an original sentence was rewritten, match the rewrite text against re-analysis sentences.
  - Ensure `bestRewrites` comparison (lines 162-178) uses correct indices after the fix.

  **Must NOT do**:
  - Do NOT change `BulkRewriteResult` interface shape
  - Do NOT change `CONCURRENCY` value
  - Do NOT change detection adapters
  - Do NOT add new npm dependencies

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex algorithmic logic with text matching, index mapping, and careful preservation of document structure. Requires understanding the full re-analysis loop.
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — this is engine-level code, not UI

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/bulk-rewrite/bulkRewrite.ts:26-33` — Current `deriveTextWithRewrites` implementation with the `.join(' ')` bug
  - `src/lib/bulk-rewrite/bulkRewrite.ts:150-187` — The re-analysis loop including `workingSentences` re-indexing (lines 156-160) and `bestRewrites` regression protection (lines 162-178)
  - `src/lib/bulk-rewrite/bulkRewrite.ts:91-94` — `originalSentences` construction from `request.sentences`
  - `src/lib/bulk-rewrite/bulkRewrite.ts:103` — The main engine loop that calls `deriveTextWithRewrites` on line 152

  **API/Type References**:
  - `src/lib/detection/sapling.ts:7-10` — Sapling's `SaplingSentenceScore` interface: `{ score: number; sentence: string }` — this is what comes back from Sapling re-analysis
  - `src/lib/detection/types.ts:11-22` — `DetectionSentenceResult` with `sentence` and `score` fields
  - `src/lib/bulk-rewrite/types.ts` — `BulkRewriteRequest` with `text` field (the original full text) and `sentences` array

  **Test References**:
  - `src/lib/bulk-rewrite/__tests__/bulkRewrite.test.ts` — Existing 34 tests for the engine. Many mock `analyzeText` and may need attention if `deriveTextWithRewrites` signature changes.

  **WHY Each Reference Matters**:
  - `bulkRewrite.ts:26-33`: This IS the bug — `.join(' ')` destroys whitespace/newlines. You need to replace this entire function body.
  - `bulkRewrite.ts:150-187`: This is where sentence index drift compounds — after re-analysis, indices get re-assigned sequentially (0, 1, 2...) based on Sapling's re-split, not the original indices.
  - `sapling.ts:7-10`: Sapling returns `sentence_scores` with `sentence` text — you'll use this text content to match back to original indices.
  - `types.ts (BulkRewriteRequest)`: The `text` field holds the original document text you need to use as the base for in-place replacement.

  **Acceptance Criteria**:

  - [ ] `deriveTextWithRewrites` accepts `originalText` parameter and replaces sentences in-place within it
  - [ ] Whitespace, newlines, and paragraph breaks from original text are preserved in output
  - [ ] Sentence indices remain stable across re-analysis rounds (no drift)
  - [ ] `npm run typecheck` passes with zero errors
  - [ ] `npm run test` passes (all existing tests green, update any broken by signature change)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Text reconstruction preserves paragraph breaks
    Tool: Bash (node/bun REPL)
    Preconditions: Import deriveTextWithRewrites function
    Steps:
      1. Create test text with paragraph breaks: "First sentence.\n\nSecond paragraph sentence. Third sentence."
      2. Create originalSentences array: [{sentence: "First sentence."}, {sentence: "Second paragraph sentence."}, {sentence: "Third sentence."}]
      3. Create rewrites: {1: "Rewritten second sentence."}
      4. Call deriveTextWithRewrites(originalText, originalSentences, rewrites)
      5. Assert output === "First sentence.\n\nRewritten second sentence. Third sentence."
    Expected Result: Paragraph break (\n\n) between first and second sentence is preserved
    Failure Indicators: Output has single space instead of \n\n, or sentences are garbled
    Evidence: .sisyphus/evidence/task-1-paragraph-preservation.txt

  Scenario: Sentence indices stable after mock re-analysis
    Tool: Bash (bun test)
    Preconditions: Run the existing test suite
    Steps:
      1. Run `npm run test -- --grep "bulkRewrite"` to execute all engine tests
      2. Verify all 34+ existing tests pass
      3. Check for any test failures related to `deriveTextWithRewrites` signature change
    Expected Result: All existing tests pass (some may need updates for new signature)
    Failure Indicators: Test failures mentioning deriveTextWithRewrites or argument count
    Evidence: .sisyphus/evidence/task-1-test-results.txt
  ```

  **Commit**: YES
  - Message: `fix: preserve original text structure in deriveTextWithRewrites`
  - Files: `src/lib/bulk-rewrite/bulkRewrite.ts`, any files calling `deriveTextWithRewrites`
  - Pre-commit: `npm run typecheck; npm run test`

---

- [x] 2. Overhaul Rewrite Prompts for Structural Transformation

  **What to do**:
  - Overhaul `SYSTEM_PROMPT` in `src/lib/suggestions/llm.ts` (lines 17-30) with specific structural transformation instructions. Replace generic "vary rhythm" with concrete targets:
    - Mix sentence lengths dramatically (5-25 words range in a single response)
    - Include parenthetical asides or self-correction phrases ("well, actually..." / "— though I'm not sure about this —")
    - Use specific details instead of generic claims ("In a 2019 study at MIT" not "Research shows")
    - Vary paragraph openings — avoid parallel structure ("Furthermore... Moreover... Additionally..." is AI-typical)
    - Use occasional contractions ("it's", "don't", "wouldn't") and casual transitions
    - Include at least one sentence fragment for emphasis where appropriate
  - Overhaul `buildUserPrompt` in `src/lib/suggestions/llm.ts` (lines 86-108) to add transformation-specific instructions beyond score context. Instead of just "Rewrite the following sentence to sound like natural human writing", add concrete structural directives that rotate based on the sentence's position or score.
  - Create a small set of **prompt variations** (3-4 different transformation instruction sets) that can be rotated across sentences/rounds to prevent all rewrites from following the same pattern. Store as an array of instruction strings.
  - Keep the JSON response format requirement (`{"rewrite":"...","explanation":"..."}`) — only change the transformation instructions.
  - **IMPORTANT**: Do NOT change `STYLE_SYSTEM_PROMPT`, `MULTI_SYSTEM_PROMPT`, or `STYLE_MULTI_SYSTEM_PROMPT` — those are for single-suggestion UI path. Only change `SYSTEM_PROMPT` and `buildUserPrompt` / `buildMultiUserPrompt`.
  - Actually, reconsider: `SYSTEM_PROMPT` is also used by the single-suggestion path via `getSystemPrompt(false)`. To avoid affecting single-suggestion, create a new `BULK_SYSTEM_PROMPT` constant specifically for bulk rewrite, and modify `generateSingleSuggestionWithProvider` to accept an optional `useBulkPrompt` parameter (or add a `bulkMode` flag).
  - Verify new prompts don't contain phrases that would trigger `guardrails.ts` banned patterns (e.g., "avoid detection", "lower score", "make it look human"). The prompts should focus on writing quality and structural diversity, NOT mention AI detection.

  **Must NOT do**:
  - Do NOT change `STYLE_SYSTEM_PROMPT` or `STYLE_MULTI_SYSTEM_PROMPT` (voice profile paths)
  - Do NOT change `guardrails.ts`
  - Do NOT change `generateAlternativeSuggestions` behavior
  - Do NOT change `LlmSuggestionService.suggest` behavior

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Prompt engineering requires careful wording to avoid guardrail triggers while maximizing effectiveness. Not trivial but not algorithmic.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/suggestions/llm.ts:17-30` — Current `SYSTEM_PROMPT` with generic "vary rhythm" instructions — THIS is what needs to be replaced/augmented with a `BULK_SYSTEM_PROMPT`
  - `src/lib/suggestions/llm.ts:86-108` — Current `buildUserPrompt` with score context — needs structural transformation instructions added
  - `src/lib/suggestions/llm.ts:283-308` — `generateSingleSuggestionWithProvider` — the function called by bulk rewrite engine. Needs to know when to use bulk prompt vs standard prompt.

  **API/Type References**:
  - `src/lib/suggestions/guardrails.ts:15-26` — Banned patterns list. New prompts MUST NOT produce rewrites containing these phrases. Review each pattern to ensure new prompt instructions don't trigger them.

  **External References**:
  - Research finding: SICO (Substitution-Based In-Context Optimization) prompts include explicit targets for sentence length variation, self-correction, specific details, and casual language markers. These produce text with genuinely different statistical properties than generic "sound human" prompts.

  **WHY Each Reference Matters**:
  - `llm.ts:17-30`: This is THE prompt Sapling sees the output of. Generic instructions produce generic (AI-detectable) output. Specific structural instructions produce statistically diverse text.
  - `guardrails.ts:15-26`: New prompts must be checked against these patterns — if a prompt says "make it look human", guardrails will filter the REWRITE even if it's good.
  - `llm.ts:283-308`: This is the entry point from bulk rewrite — needs modification to use the new bulk-specific prompt.

  **Acceptance Criteria**:

  - [ ] New `BULK_SYSTEM_PROMPT` constant exists with specific structural transformation instructions
  - [ ] `buildUserPrompt` includes transformation directives for bulk mode
  - [ ] 3-4 prompt variations exist for rotation across sentences/rounds
  - [ ] No prompt text triggers guardrails banned patterns (verify programmatically)
  - [ ] `generateSingleSuggestionWithProvider` supports bulk mode flag
  - [ ] Single-suggestion UI path behavior unchanged (still uses original `SYSTEM_PROMPT`)
  - [ ] `npm run typecheck` passes
  - [ ] `npm run test` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Bulk prompt doesn't trigger guardrails
    Tool: Bash (bun test or node REPL)
    Preconditions: Import containsBannedPhrase from guardrails.ts
    Steps:
      1. Import the new BULK_SYSTEM_PROMPT text
      2. Run containsBannedPhrase(BULK_SYSTEM_PROMPT) — expect false
      3. Run containsBannedPhrase against each prompt variation — expect all false
    Expected Result: Zero guardrail triggers from any new prompt text
    Failure Indicators: containsBannedPhrase returns true for any prompt
    Evidence: .sisyphus/evidence/task-2-guardrail-check.txt

  Scenario: Single-suggestion path unaffected
    Tool: Bash (bun test)
    Preconditions: Existing LLM tests exist in src/lib/suggestions/__tests__/llm.test.ts
    Steps:
      1. Run `npm run test -- --grep "llm"` to execute all LLM-related tests
      2. Verify all 19+ existing tests pass unchanged
    Expected Result: All existing LLM tests pass — single-suggestion behavior preserved
    Failure Indicators: Test failures in llm.test.ts
    Evidence: .sisyphus/evidence/task-2-llm-test-results.txt
  ```

  **Commit**: YES
  - Message: `feat: overhaul rewrite prompts for structural transformation`
  - Files: `src/lib/suggestions/llm.ts`
  - Pre-commit: `npm run typecheck; npm run test`

---

- [x] 3. Eliminate Pass 2 for Bulk Rewrite + Increase Temperature

  **What to do**:
  - In `src/lib/suggestions/llm.ts`, modify the bulk rewrite path to use **single-pass** rewriting instead of the current two-pass approach. Pass 2 takes Pass 1's output and rewrites it AGAIN with the same "sound human" instruction — this re-polishes the text back toward AI-typical fluency, undoing the diversity Pass 1 introduced.
  - Create a new function `singlePassBulkRewrite` (or modify `twoPassRewrite` to accept a `singlePass` flag) that:
    - Uses temperature **0.95** (up from 0.7)
    - Uses the bulk-specific system prompt from T2
    - Makes only ONE LLM call per sentence (not two)
    - Keeps topP at 0.9 when fewShotExamples are present
  - Update `generateSingleSuggestionWithProvider` to use single-pass when called in bulk mode (the `bulkMode` flag from T2).
  - **Keep `twoPassRewrite` intact** for the non-bulk single-suggestion UI path — users clicking individual sentence rewrites still get the refined two-pass result.
  - This halves the LLM API calls during bulk rewrite (from 2N to N per round), which also helps with the 50-second deadline.

  **Must NOT do**:
  - Do NOT remove `twoPassRewrite` — keep it for single-suggestion path
  - Do NOT change temperature for single-suggestion path
  - Do NOT change `generateAlternativeSuggestions`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Straightforward code change — add a flag to skip Pass 2 and increase temperature. No complex logic.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Tasks 4, 5, 6
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/suggestions/llm.ts:210-245` — Current `twoPassRewrite` function. Pass 1 at temp 0.7 (line 220), Pass 2 at temp 0.85 (line 232). Pass 2 re-polishes Pass 1 output with NO score context (line 231: score param not passed).
  - `src/lib/suggestions/llm.ts:283-308` — `generateSingleSuggestionWithProvider` — calls `twoPassRewrite` on line 295. This is where the bulk vs single-pass branching should happen.

  **API/Type References**:
  - `src/lib/suggestions/llm-adapter.ts:13-24` — `LlmCompletionRequest` interface with `temperature`, `maxTokens`, `topP` fields

  **WHY Each Reference Matters**:
  - `llm.ts:210-245`: Pass 2 (lines 229-234) takes Pass 1's diverse output and smooths it — making it MORE AI-like. For bulk rewrite, this is counterproductive. Single-suggestion users benefit from the polish, so keep it for them.
  - `llm.ts:295`: The branching point — when bulk rewrite calls this, it should use single-pass. When single-suggestion calls it (via `generateSingleSuggestion` on line 316), it should still use two-pass.

  **Acceptance Criteria**:

  - [ ] Bulk rewrite path uses single-pass with temperature 0.95
  - [ ] Single-suggestion path still uses two-pass with original temperatures
  - [ ] LLM API calls per sentence halved for bulk rewrite (1 instead of 2)
  - [ ] `npm run typecheck` passes
  - [ ] `npm run test` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Bulk path uses single-pass
    Tool: Bash (bun test or code inspection)
    Preconditions: Code changes applied
    Steps:
      1. Read generateSingleSuggestionWithProvider function
      2. Verify that when bulkMode=true (or equivalent flag), only one adapter.complete() call is made
      3. Verify temperature is 0.95 for bulk path
      4. Run `npm run test` to verify no regressions
    Expected Result: Bulk path makes 1 LLM call at temp 0.95; single path still makes 2 calls
    Failure Indicators: Both paths make same number of calls, or temperature unchanged
    Evidence: .sisyphus/evidence/task-3-single-pass-verification.txt

  Scenario: Existing LLM tests still pass
    Tool: Bash (npm run test)
    Preconditions: None
    Steps:
      1. Run `npm run test`
      2. Verify all tests pass
    Expected Result: All 637+ tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-3-test-results.txt
  ```

  **Commit**: YES
  - Message: `feat: single-pass high-temperature rewriting for bulk rewrite`
  - Files: `src/lib/suggestions/llm.ts`
  - Pre-commit: `npm run typecheck; npm run test`

---

- [x] 4. Paragraph-Level Rewriting for Bulk Rewrite

  **What to do**:
  - In `src/lib/bulk-rewrite/bulkRewrite.ts`, modify the candidate selection and rewriting logic to group **adjacent high-score sentences** into paragraph-level blocks and rewrite them as a unit instead of individually.
  - Grouping algorithm:
    1. After sorting candidates by score, identify runs of consecutive sentence indices where all sentences have `score >= ELIGIBLE_SCORE_FLOOR`
    2. Group consecutive sentences into blocks of 2-5 sentences each
    3. For each block, concatenate the sentences into a single paragraph text
    4. Send the paragraph to the LLM for rewriting as a whole unit (not sentence-by-sentence)
    5. After getting the rewritten paragraph back, split it back into individual sentences and map them to the original indices
  - This disrupts **cross-sentence coherence patterns** — Sapling's document-level analysis detects that AI text has mechanically consistent transitions between sentences. Paragraph-level rewriting produces more natural inter-sentence flow.
  - For the LLM prompt, send the grouped text as: "Rewrite the following paragraph..." instead of "Rewrite the following sentence..."
  - Update `buildUserPrompt` to handle multi-sentence input (or create a `buildParagraphPrompt` function).
  - Handle edge cases:
    - If a block is just 1 sentence (isolated high-score sentence with low-score neighbors), treat it as sentence-level (existing behavior)
    - If Sapling's sentence split of the rewritten paragraph doesn't match the expected number of sentences, use the full rewritten paragraph and map it back to the first index of the group
  - Maintain `CONCURRENCY = 5` — now 5 paragraph blocks process concurrently instead of 5 individual sentences.

  **Must NOT do**:
  - Do NOT change `CONCURRENCY` value
  - Do NOT change `BulkRewriteResult` interface
  - Do NOT change detection adapters
  - Do NOT change the single-suggestion rewrite path

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex grouping algorithm, multi-sentence LLM interaction, sentence re-splitting, and index mapping. Requires careful edge case handling.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `src/lib/bulk-rewrite/bulkRewrite.ts:106-113` — Current candidate selection logic: filters by score, sorts descending. This needs to be augmented with grouping consecutive indices.
  - `src/lib/bulk-rewrite/bulkRewrite.ts:120-144` — Current per-sentence rewrite loop with `runWithConcurrency`. This needs to operate on paragraph blocks instead of individual sentences.
  - `src/lib/bulk-rewrite/bulkRewrite.ts:35-55` — `runWithConcurrency` function — will now process paragraph blocks concurrently.
  - `src/lib/bulk-rewrite/bulkRewrite.ts:26-33` — `deriveTextWithRewrites` (fixed in T1) — stores per-sentence rewrites. Paragraph rewrites need to be split back into per-sentence entries for this Record.

  **API/Type References**:
  - `src/lib/suggestions/llm.ts:86-108` — `buildUserPrompt` — needs paragraph-aware variant
  - `src/lib/suggestions/llm.ts:283-308` — `generateSingleSuggestionWithProvider` — may need a `generateParagraphSuggestion` variant or the paragraph text is passed as a single "sentence"

  **WHY Each Reference Matters**:
  - `bulkRewrite.ts:106-113`: Candidate selection currently treats each sentence independently. The grouping step must happen AFTER filtering but BEFORE the rewrite loop.
  - `bulkRewrite.ts:120-144`: The core rewrite loop — must be refactored to iterate over paragraph blocks, sending multi-sentence text to the LLM and splitting results back.
  - `llm.ts:86-108`: The prompt builder — "Rewrite the following sentence..." won't work for paragraphs. Need "Rewrite the following paragraph..." with instructions to maintain the same number of sentences.

  **Acceptance Criteria**:

  - [ ] Adjacent high-score sentences are grouped into blocks of 2-5 for rewriting
  - [ ] Grouped blocks are sent to LLM as paragraph text, not individual sentences
  - [ ] Rewritten paragraphs are split back and mapped to original sentence indices
  - [ ] Isolated high-score sentences still work (single-sentence fallback)
  - [ ] `CONCURRENCY` remains 5 (now operating on blocks)
  - [ ] `npm run typecheck` passes
  - [ ] `npm run test` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Paragraph grouping produces correct blocks
    Tool: Bash (bun test)
    Preconditions: T1 and T3 committed
    Steps:
      1. Run `npm run test -- --grep "bulkRewrite"` to execute engine tests
      2. Verify all existing tests pass (may need minor updates for new grouping behavior)
      3. If test counts for rewritten sentences differ, verify it's due to grouping (expected)
    Expected Result: All engine tests pass; grouping doesn't break regression protection or plateau detection
    Failure Indicators: Test failures in bulkRewrite tests related to iteration counts or rewrite counts
    Evidence: .sisyphus/evidence/task-4-test-results.txt

  Scenario: Single isolated sentences still work
    Tool: Bash (bun test)
    Preconditions: Code changes applied
    Steps:
      1. Create a test scenario with one high-score sentence surrounded by low-score sentences
      2. Verify it's treated as a single-sentence block (no grouping)
      3. Verify the rewrite still applies correctly
    Expected Result: Isolated sentences rewrite correctly without paragraph grouping
    Failure Indicators: Isolated sentence skipped or error thrown
    Evidence: .sisyphus/evidence/task-4-isolated-sentence.txt
  ```

  **Commit**: YES
  - Message: `feat: paragraph-level rewriting for bulk rewrite`
  - Files: `src/lib/bulk-rewrite/bulkRewrite.ts`, `src/lib/suggestions/llm.ts` (paragraph prompt)
  - Pre-commit: `npm run typecheck; npm run test`

---

- [x] 5. Recursive Retry with Varied Prompts for Persistent High Scores

  **What to do**:
  - In `src/lib/bulk-rewrite/bulkRewrite.ts`, add **intra-round retry logic**: if a sentence/paragraph block still scores high (>= `targetScore`) after the first rewrite attempt in a round, re-attempt with a DIFFERENT prompt variation (from the prompt variation set created in T2), up to **2 retries per item per round**.
  - This is different from the existing round-level retry (the engine already runs up to 10 rounds). This is WITHIN a single round — if the first rewrite of a sentence doesn't help, try again with different transformation instructions before moving to re-analysis.
  - Implementation approach:
    1. After the first rewrite attempt, do a quick per-sentence score check (not a full document re-analysis — just compare the rewritten text's likely quality markers)
    2. Actually, simpler: just always do 1 retry with a different prompt variation. The cost is 1 extra LLM call per sentence, but the first pass is already single-pass (from T3), so this is 2 calls max — same as the old two-pass but with two DIFFERENT prompts instead of the same prompt twice.
    3. Compare the two rewrites by length diversity (pick the one that differs more from the original in structure, not just words)
  - Add a `promptVariationIndex` parameter to `generateSingleSuggestionWithProvider` (or the paragraph equivalent) so the caller can specify which prompt variation to use.
  - Integrate with the deadline check — don't retry if deadline is approaching.

  **Must NOT do**:
  - Do NOT increase `CONCURRENCY` value
  - Do NOT add full document re-analysis between retries (too expensive)
  - Do NOT change the round-level loop structure (MAX_ROUNDS, plateau detection, etc.)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration of retry logic with existing engine loop, prompt variation selection, and deadline awareness. Moderate complexity.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `src/lib/bulk-rewrite/bulkRewrite.ts:120-144` — Current per-item rewrite loop. Retry logic inserts here — after the first `generateSingleSuggestionWithProvider` call, if result is obtained, optionally try again with different prompt variation.
  - `src/lib/bulk-rewrite/bulkRewrite.ts:103-104` — Deadline check pattern: `nowFn() < deadline`. Use this same pattern for retry gating.
  - `src/lib/suggestions/llm.ts:283-308` — `generateSingleSuggestionWithProvider` — needs `promptVariationIndex` parameter.

  **API/Type References**:
  - `src/lib/bulk-rewrite/types.ts` — Engine config types (no changes needed to interface)

  **WHY Each Reference Matters**:
  - `bulkRewrite.ts:120-144`: The rewrite loop is where retry logic naturally fits — after getting one rewrite, try a second with different instructions and pick the better one.
  - `bulkRewrite.ts:103-104`: Deadline check prevents retries from blowing the time budget — don't retry if < 5s remaining.
  - `llm.ts:283-308`: The LLM function needs to know which prompt variation to use, so the caller can say "try variation 0" then "try variation 1".

  **Acceptance Criteria**:

  - [ ] Each sentence/block gets up to 2 rewrite attempts with different prompt variations per round
  - [ ] The structurally more diverse rewrite is selected (not random)
  - [ ] Retry respects deadline — no retry if insufficient time
  - [ ] `CONCURRENCY` unchanged at 5
  - [ ] `npm run typecheck` passes
  - [ ] `npm run test` passes

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Retry produces different output than first attempt
    Tool: Bash (bun test or code inspection)
    Preconditions: T1-T4 committed
    Steps:
      1. Run `npm run test -- --grep "bulkRewrite"` to execute engine tests
      2. Verify all tests pass including retry-related behavior
      3. Inspect code to confirm two different prompt variations are used
    Expected Result: Tests pass; retry uses different prompt variation than first attempt
    Failure Indicators: Same prompt used for both attempts, or test failures
    Evidence: .sisyphus/evidence/task-5-retry-verification.txt

  Scenario: Retry respects deadline
    Tool: Bash (bun test)
    Preconditions: Existing deadline tests in test suite
    Steps:
      1. Run `npm run test -- --grep "deadline"` or similar
      2. Verify that when deadline is near, retry is skipped
    Expected Result: No retry when deadline < 5s remaining
    Failure Indicators: Retry happens despite deadline pressure, causing timeout
    Evidence: .sisyphus/evidence/task-5-deadline-test.txt
  ```

  **Commit**: YES
  - Message: `feat: recursive retry with varied prompts for persistent scores`
  - Files: `src/lib/bulk-rewrite/bulkRewrite.ts`, `src/lib/suggestions/llm.ts`
  - Pre-commit: `npm run typecheck; npm run test`

---

- [x] 6. Playwright E2E Test with Real Sapling API

  **What to do**:
  - Create `e2e/bulk-rewrite-score.spec.ts` — a Playwright end-to-end test that proves bulk rewrite actually reduces AI detection scores using the REAL Sapling API (not mocked).
  - Test flow:
    1. Configure API keys via `page.addInitScript()` to set localStorage settings before navigation (Sapling API key for detection, OpenAI API key for LLM)
    2. Navigate to `/`
    3. Upload a test `.docx` file containing known-AI-generated academic text (~500 words, reliably scores ≥90% on Sapling)
    4. Wait for analysis to complete — verify initial score is ≥90%
    5. Set target score input to `70`
    6. Click "Rewrite to Target" button (`data-testid="bulk-rewrite-btn"`)
    7. Wait for bulk rewrite to complete (look for `data-testid="bulk-result-message"` to appear)
    8. Assert the result message indicates target was met (green styling, or parse the achieved score text)
    9. Intercept the `/api/bulk-rewrite` response to assert `achievedScore <= 70` numerically
  - Set `test.setTimeout(120_000)` since bulk rewrite takes time with real API calls.
  - Create a test fixture `.docx` file: `e2e/fixtures/ai-generated-essay.docx` — a ~500 word ChatGPT-generated essay on a common academic topic. Use the `docx` library or manually create it.
  - **API Key Configuration**: Read API keys from environment variables in the test (`process.env.SAPLING_API_KEY`, `process.env.OPENAI_API_KEY`) to avoid hardcoding secrets. Skip test if env vars not set.
  - Follow existing E2E test patterns from `e2e/home.spec.ts` — use `page.getByTestId()`, `expect(...).toBeVisible()`, `page.waitForSelector()`.

  **Must NOT do**:
  - Do NOT mock the Sapling API or bulk-rewrite API — test must use real endpoints
  - Do NOT hardcode API keys in the test file
  - Do NOT change existing E2E tests

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Playwright test writing with real API integration, fixture creation, environment variable handling, and async waiting for long operations. Uses `playwright` skill for browser automation patterns.
  - **Skills**: [`playwright`]
    - `playwright`: Needed for browser automation patterns, page.addInitScript for localStorage, response interception, and assertion patterns.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — must run after Wave 2)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 4, 5

  **References**:

  **Pattern References**:
  - `e2e/home.spec.ts:1-50` — Existing E2E test pattern: imports, `test()` blocks, `page.getByTestId()`, `page.route()` for mocking (but we DON'T mock), file upload via `setInputFiles`
  - `e2e/home.spec.ts:38-43` — File upload pattern using `page.getByTestId('file-input').setInputFiles(...)` with buffer
  - `src/components/TargetScorePanel.tsx:59` — `data-testid="target-score-input"` — the input to set target score
  - `src/components/TargetScorePanel.tsx:75` — `data-testid="bulk-rewrite-btn"` — the rewrite button
  - `src/components/TargetScorePanel.tsx:104` — `data-testid="bulk-result-message"` — the result message element

  **API/Type References**:
  - `src/hooks/useSettings.ts` — How settings/API keys are stored in localStorage. The test needs to pre-configure these via `page.addInitScript`.
  - `src/lib/api/requestSettings.ts` — How API keys are extracted from request headers (`x-llm-api-key`, `x-detection-api-key`, etc.)
  - `playwright.config.ts` — Playwright config: dev server on port 3001, chromium only

  **Test References**:
  - `e2e/home.spec.ts:11-50` — Full pattern for mocked analysis flow. Our test follows the same upload flow but with REAL API calls and longer timeouts.

  **WHY Each Reference Matters**:
  - `home.spec.ts`: Provides the exact upload flow pattern — file input selector, submit button, review panel expectations. Copy this flow but skip the `page.route()` mocking.
  - `TargetScorePanel.tsx`: Exact test IDs for target score input, rewrite button, and result message — these are the selectors for the E2E test.
  - `useSettings.ts`: Need to understand localStorage key names to pre-configure API keys in the test.
  - `requestSettings.ts`: Confirms that `x-detection-api-key` and `x-llm-api-key` headers carry the keys — the frontend reads from localStorage and puts them in headers.

  **Acceptance Criteria**:

  - [ ] Test file exists: `e2e/bulk-rewrite-score.spec.ts`
  - [ ] Test fixture exists: `e2e/fixtures/ai-generated-essay.docx`
  - [ ] Test configures real API keys from environment variables
  - [ ] Test skips gracefully if API keys not set
  - [ ] Test uploads document, sets target 70%, clicks rewrite, waits for result
  - [ ] Test asserts achieved score ≤ 70% (numerically, not just UI text)
  - [ ] Test timeout is 120 seconds
  - [ ] `npx playwright test e2e/bulk-rewrite-score.spec.ts` passes with real API keys

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: E2E test passes with real Sapling API
    Tool: Playwright (npx playwright test)
    Preconditions: SAPLING_API_KEY and OPENAI_API_KEY env vars set, dev server running
    Steps:
      1. Set environment variables: SAPLING_API_KEY=<real-key>, OPENAI_API_KEY=<real-key>
      2. Run: npx playwright test e2e/bulk-rewrite-score.spec.ts --headed
      3. Observe: page loads, document uploads, analysis shows ≥90% score
      4. Observe: target set to 70%, rewrite button clicked
      5. Wait: bulk rewrite completes (up to 120s)
      6. Assert: result message shows achieved score, and score ≤ 70%
    Expected Result: Test passes. Achieved score is ≤ 70%.
    Failure Indicators: Test timeout (>120s), score > 70%, API errors, missing test IDs
    Evidence: .sisyphus/evidence/task-6-e2e-result.png (screenshot), .sisyphus/evidence/task-6-e2e-output.txt

  Scenario: Test skips when API keys not set
    Tool: Playwright
    Preconditions: No SAPLING_API_KEY or OPENAI_API_KEY env vars
    Steps:
      1. Unset API key env vars
      2. Run: npx playwright test e2e/bulk-rewrite-score.spec.ts
      3. Verify test is skipped (not failed)
    Expected Result: Test skipped with message about missing API keys
    Failure Indicators: Test fails instead of skipping
    Evidence: .sisyphus/evidence/task-6-skip-test.txt
  ```

  **Commit**: YES
  - Message: `test: add Playwright E2E test for bulk rewrite score reduction`
  - Files: `e2e/bulk-rewrite-score.spec.ts`, `e2e/fixtures/ai-generated-essay.docx`
  - Pre-commit: `npm run typecheck`

---

- [x] 7. Iterative Diagnosis and Fix Loop (Max 3 Rounds)

  **What to do**:
  - Run the Playwright E2E test from T6. If it passes (score ≤ 70%), this task is done immediately.
  - If the score is still > 70%, perform diagnosis:
    1. Run the E2E test with `--headed` to observe the flow visually
    2. Add temporary `console.log` or intercept the `/api/bulk-rewrite` response to capture: `achievedScore`, `iterations`, `totalRewritten`
    3. Identify which sentences remain high-scoring — look at the re-analysis results
    4. Examine the rewritten text — does it look genuinely different from the original? Or does it read like AI-polished AI?
  - Based on diagnosis, apply targeted fixes. Common adjustments:
    - If score barely moved: prompts may still be too generic — make transformation instructions even more specific
    - If score dropped to 80-85% but not 70%: the approach works but needs more aggressive diversity — increase temperature to 1.0, add more prompt variations
    - If some sentences resist rewriting: those may be factual/technical sentences that inherently score high — lower the `ELIGIBLE_SCORE_FLOOR` or add special handling
    - If paragraph grouping isn't working: check the block boundaries — maybe groups of 3-5 are too large, try 2-3
    - If deadline is being hit before enough rounds: increase `ROUTE_DEADLINE_MS` (and `DEFAULT_DEADLINE_MS`) to 80_000 or 100_000
  - After each fix, re-run the E2E test. Cap at **3 diagnostic rounds**.
  - If after 3 rounds the score is still > 70%, document: (a) best achieved score, (b) what was tried, (c) which sentences resist, (d) what remaining options exist. Present to user.

  **Must NOT do**:
  - Do NOT exceed 3 diagnostic iteration rounds
  - Do NOT change detection adapters or Sapling integration
  - Do NOT add new npm dependencies
  - Do NOT change Settings UI

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Diagnostic reasoning, iterative debugging with real APIs, targeted code fixes based on observed behavior. Requires deep understanding of the full pipeline.
  - **Skills**: [`playwright`]
    - `playwright`: Needed to run E2E tests, observe headed mode, intercept API responses for diagnosis.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (sequential — runs after T6)
  - **Blocks**: F1-F4 (final wave)
  - **Blocked By**: Task 6

  **References**:

  **Pattern References**:
  - `e2e/bulk-rewrite-score.spec.ts` (created in T6) — The E2E test to run and diagnose
  - `src/lib/bulk-rewrite/bulkRewrite.ts` — The engine to potentially adjust (temperatures, deadlines, grouping sizes, score floors)
  - `src/lib/suggestions/llm.ts` — Prompts and temperature to potentially adjust
  - `src/app/api/bulk-rewrite/route.ts:11` — `ROUTE_DEADLINE_MS = 50_000` — may need increase

  **API/Type References**:
  - `src/lib/bulk-rewrite/bulkRewrite.ts:13-19` — Engine constants: `MAX_ROUNDS`, `DEFAULT_DEADLINE_MS`, `ELIGIBLE_SCORE_FLOOR`, `PLATEAU_THRESHOLD`, `PLATEAU_ROUNDS` — all candidates for adjustment

  **WHY Each Reference Matters**:
  - `bulkRewrite.ts:13-19`: These constants control how aggressively the engine works. If the score isn't dropping enough, increasing deadline or lowering score floor can help.
  - `route.ts:11`: The route deadline must match or exceed the engine deadline — if engine deadline increases, route must too.
  - `llm.ts`: Prompts are the primary lever — if diagnosis shows rewrites are still too AI-like, prompts need more aggressive transformation instructions.

  **Acceptance Criteria**:

  - [ ] Playwright E2E test passes: achieved score ≤ 70%
  - [ ] OR: after 3 diagnostic rounds, findings documented with best score achieved and remaining options
  - [ ] All fixes committed with descriptive messages
  - [ ] `npm run typecheck` passes
  - [ ] `npm run test` passes
  - [ ] No new dependencies added

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: E2E test passes after iterative fixes
    Tool: Playwright (npx playwright test)
    Preconditions: All T1-T6 committed, API keys configured
    Steps:
      1. Run: npx playwright test e2e/bulk-rewrite-score.spec.ts
      2. If PASS: capture screenshot and achieved score — task done
      3. If FAIL: diagnose (intercept response, check achievedScore, identify resistant sentences)
      4. Apply targeted fix based on diagnosis
      5. Re-run test
      6. Repeat up to 3 times
    Expected Result: Test passes within 3 diagnostic iterations with score ≤ 70%
    Failure Indicators: Score stuck above 70% after 3 rounds; timeout; API errors
    Evidence: .sisyphus/evidence/task-7-iteration-{N}-result.png, .sisyphus/evidence/task-7-final-score.txt

  Scenario: Diagnostic data captured for each iteration
    Tool: Bash (capture test output)
    Preconditions: Each iteration run
    Steps:
      1. After each test run, capture: achievedScore, iterations, totalRewritten
      2. Log which sentence indices still score > 0.7
      3. Save before/after text for resistant sentences
    Expected Result: Clear diagnostic trail for each iteration round
    Failure Indicators: No diagnostic data captured
    Evidence: .sisyphus/evidence/task-7-diagnostics.md
  ```

  **Commit**: YES (per iteration)
  - Message: `fix: [specific diagnosis-based fix — e.g., "increase temperature to 1.0 for resistant sentences"]`
  - Files: TBD per iteration
  - Pre-commit: `npm run typecheck; npm run test`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
>
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + linter + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| After | Message | Files | Pre-commit |
|-------|---------|-------|------------|
| T1 | `fix: preserve original text structure in deriveTextWithRewrites` | `src/lib/bulk-rewrite/bulkRewrite.ts` | `npm run typecheck; npm run test` |
| T2 | `feat: overhaul rewrite prompts for structural transformation` | `src/lib/suggestions/llm.ts` | `npm run typecheck; npm run test` |
| T3 | `feat: single-pass high-temperature rewriting for bulk rewrite` | `src/lib/suggestions/llm.ts` | `npm run typecheck; npm run test` |
| T4 | `feat: paragraph-level rewriting for bulk rewrite` | `src/lib/bulk-rewrite/bulkRewrite.ts` | `npm run typecheck; npm run test` |
| T5 | `feat: recursive retry with varied prompts for persistent scores` | `src/lib/bulk-rewrite/bulkRewrite.ts`, `src/lib/suggestions/llm.ts` | `npm run typecheck; npm run test` |
| T6 | `test: add Playwright E2E test for bulk rewrite score reduction` | `e2e/bulk-rewrite-score.spec.ts` | `npm run typecheck` |
| T7 | `fix: [diagnosis-based fix per iteration]` | TBD per iteration | `npm run typecheck; npm run test` |

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck  # Expected: zero errors
npm run test       # Expected: all tests pass (637+ existing + any new)
npx playwright test e2e/bulk-rewrite-score.spec.ts  # Expected: score ≤ 70%
```

### Final Checklist
- [ ] Bulk rewrite reduces Sapling AI score to ≤70% on real test document
- [ ] Original text structure preserved (whitespace, newlines, paragraphs)
- [ ] Sentence indices stable across re-analysis rounds
- [ ] All existing unit/integration tests pass
- [ ] TypeScript compiles with zero errors
- [ ] No changes to detection adapters, Settings UI, BulkRewriteResult interface, or CONCURRENCY
- [ ] E2E test uses real (not mocked) Sapling API
