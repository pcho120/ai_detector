# Fix Few-Shot My Paper Feature — Diagnosis & Deep Prompt Engineering Fix

## TL;DR

> **Quick Summary**: The 3-layer fix (extraction filters, prompt improvements, Pass2 skip) was technically correct but functionally ineffective — AI scores don't drop. Root cause: the SYSTEM_PROMPT gives generic "sound human" instructions that override the user prompt's style-specific few-shot examples, the LLM never analyzes the author's style before rewriting, and Pass2 skip removes needed humanizing imperfections. Fix: conditional style-aware system prompt, CoT-structured user prompt with explicit style analysis, re-enabled style-aware Pass2, and extraction refinements.
> 
> **Deliverables**:
> - Diagnostic baseline capturing actual before/after Sapling scores (Task 1)
> - Style-aware system prompt for few-shot mode (`STYLE_SYSTEM_PROMPT` + `STYLE_MULTI_SYSTEM_PROMPT`) in `llm.ts`
> - CoT-restructured user prompt with explicit 4-level style analysis in `voiceProfile.ts`
> - Re-enabled Pass2 with style-preserving refinement prompt in `llm.ts`
> - Refined extraction: relaxed citation filter, 5 sentences, annotated with style dimensions in `extractSentences.ts` + `voiceProfile.ts`
> - Optional `top_p` parameter in `LlmCompletionRequest` and both adapters
> - Updated `parseRewritePayload` to handle CoT text before JSON
> - Verification test comparing post-fix scores to baseline
> 
> **Estimated Effort**: Medium (7 tasks, ~4-6 hours)
> **Parallel Execution**: YES — 3 waves
> **Critical Path**: Task 1 (diagnostic) → Tasks 2+5 (parallel: prompt + extraction) → Tasks 3+4+6 (parallel: CoT + Pass2 + top_p) → Task 7 (verification)

---

## Context

### Original Request
User tested the My Paper feature with `Test-doc/Test.docx` (analysis target) and `Test-doc/User example paper4.docx` (style source). AI detection scores did NOT decrease. A previous 3-layer fix plan (`few-shot-quality-fix`) was fully implemented (3 commits, 600 tests passing) but had no functional impact. User said: "아직도 나아진게 없어. 너가 실제로 테스트해보고 개선해봐."

### Interview Summary
**Key Discussions**:
- Previous plan was technically sound but addressed symptoms, not root cause
- Data flow confirmed complete — fewShotExamples DO reach the LLM
- Problem is in WHAT the prompt says, not WHETHER data flows

**Research Findings** (4 parallel agents):
- **System prompt override** (CRITICAL): `SYSTEM_PROMPT` gives generic "slightly informal, break patterns" rules that CONTRADICT the user prompt's "match this author's patterns exactly" — LLMs weight system prompts more heavily
- **Pass2 skip counterproductive** (HIGH): Removing Pass2 removes needed humanizing imperfections. Fix should be style-aware Pass2, not skip
- **Insufficient/unannotated examples** (MEDIUM): 6 raw sentences < 3-5 annotated examples (research: Persona+Analysis+CoT = 65-85% vs 15-30% for examples alone)
- **No style analysis** (HIGH): Current prompt just lists examples. Research shows LLM must ANALYZE style dimensions before rewriting (chain-of-thought)
- **Missing top_p** (LOW): Temperature 0.7 is fine but top_p=0.9 helps perplexity disruption

### Metis Review
**Identified Gaps** (addressed):
- MULTI_SYSTEM_PROMPT also needs style-aware treatment (not just SYSTEM_PROMPT)
- `parseRewritePayload` must handle CoT text before JSON (current parser only strips markdown fences)
- `top_p` interface change must be optional to avoid breaking non-few-shot path
- CITATION_PATTERN filter is too aggressive — removes inline citations that ARE academic style
- Budget overflow risk: annotated examples + header must fit within MAX_FEWSHOT_CONTEXT_LENGTH (3000 chars)
- Sapling existential risk: if Sapling scores human academic text as high-AI, approach needs pivoting
- Task 1 must capture rewritten text AND scores for manual inspection

---

## Work Objectives

### Core Objective
Make the "My Paper" few-shot feature ACTUALLY lower AI detection scores by fundamentally restructuring how the LLM is prompted when style examples are present.

### Concrete Deliverables
- `src/lib/suggestions/llm.ts`: New `STYLE_SYSTEM_PROMPT`, `STYLE_MULTI_SYSTEM_PROMPT`, `getSystemPrompt()` function, re-enabled style-aware Pass2, updated `parseRewritePayload`
- `src/lib/suggestions/voiceProfile.ts`: Restructured `buildFewShotContextBlock` with CoT + 4-level style analysis
- `src/lib/style-extraction/extractSentences.ts`: Relaxed `CITATION_PATTERN`, `DEFAULT_SENTENCE_COUNT` → 5
- `src/lib/suggestions/llm-adapter.ts`: Optional `top_p` in `LlmCompletionRequest`
- `src/lib/suggestions/adapters/openai.ts`: Pass `top_p` when provided
- `src/lib/suggestions/adapters/anthropic.ts`: Pass `top_p` when provided (with temp interaction guard)
- Test files for all changes

### Definition of Done
- [ ] `npm run test` — all tests pass (including new tests)
- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run lint` — 0 errors
- [ ] `npm run test:e2e` — all existing E2E tests pass
- [ ] Task 7 verification: per-sentence Sapling scores with few-shot are lower than without

### Must Have
- Conditional style-aware system prompt (separate from original `SYSTEM_PROMPT`)
- CoT-structured user prompt that forces style analysis before rewriting
- ALL changes gated behind `fewShotExamples && fewShotExamples.length > 0`
- Updated JSON parser to handle CoT text before JSON
- Both `SYSTEM_PROMPT` and `MULTI_SYSTEM_PROMPT` get style-aware treatment
- Non-few-shot code paths produce byte-identical output

### Must NOT Have (Guardrails)
- No modification to `SYSTEM_PROMPT` or `MULTI_SYSTEM_PROMPT` constants themselves — add NEW constants + selector function
- No modification to non-few-shot code paths (voice profile only, bare rewrite)
- No modification to `guardrails.ts` or detection pipeline (`sapling.ts`)
- No modification to UI components or API routes
- No modification to JSON response format (`{"rewrite":"...","explanation":"..."}`)
- No new API endpoints or npm dependencies
- No LLM model upgrade (stay on gpt-4o-mini / claude-sonnet-4-6)
- No adversarial paraphrasing, RL-based evasion, or semantic clustering (too complex)
- No acceptance criteria requiring human manual testing

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (600 unit tests, 43 E2E, vitest + Playwright)
- **Automated tests**: YES (TDD — RED→GREEN→REFACTOR per task)
- **Framework**: vitest (unit), Playwright (E2E)
- **TDD**: Each task writes failing test first, then implements to make it pass

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Diagnostic tasks (1, 7)**: Use Bash — run Node.js script that calls Sapling API directly
- **Implementation tasks (2-6)**: Use Bash — `npm test` with specific test files
- **Final verification**: Use Playwright for E2E, Bash for unit tests

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — diagnostic baseline):
└── Task 1: Capture baseline Sapling scores (before/after with current code) [deep]

Wave 2 (After Wave 1 — core prompt + extraction fixes, MAX PARALLEL):
├── Task 2: Style-aware system prompts + parseRewritePayload fix (depends: 1) [deep]
└── Task 5: Extraction refinements — relax filters, reduce to 5, add annotations (depends: 1) [deep]

Wave 3 (After Wave 2 — dependent prompt/param fixes, MAX PARALLEL):
├── Task 3: CoT-structured user prompt with 4-level style analysis (depends: 2, 5) [deep]
├── Task 4: Re-enable style-aware Pass2 refinement (depends: 2) [deep]
└── Task 6: Add optional top_p parameter to LLM adapter (depends: none, but group here) [quick]

Wave 4 (After Wave 3 — verification):
└── Task 7: Live verification — compare post-fix scores to Task 1 baseline [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 3 → Task 7 → F1-F4 → user okay
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 3 (Wave 3)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2, 5, 7 | 1 |
| 2 | 1 | 3, 4 | 2 |
| 5 | 1 | 3 | 2 |
| 3 | 2, 5 | 7 | 3 |
| 4 | 2 | 7 | 3 |
| 6 | — | 7 | 3 |
| 7 | 3, 4, 6 | F1-F4 | 4 |

### Agent Dispatch Summary

- **Wave 1**: 1 task — T1 → `deep`
- **Wave 2**: 2 tasks — T2 → `deep`, T5 → `deep`
- **Wave 3**: 3 tasks — T3 → `deep`, T4 → `deep`, T6 → `quick`
- **Wave 4**: 1 task — T7 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Diagnostic Baseline — Capture Actual Sapling Scores Before & After Few-Shot

  **What to do**:
  - Create a diagnostic test script (or inline test in a `.test.ts` file) that:
    1. Reads `Test-doc/Test.docx` and extracts text using the existing document processing pipeline
    2. Calls Sapling AI detection API on the full text — records overall + per-sentence scores
    3. Reads `Test-doc/User example paper4.docx` and extracts style sentences using `extractStyleSentences`
    4. For 3-5 HIGH-scoring sentences from step 2, calls `generateAlternativeSuggestions` WITHOUT fewShotExamples — records the rewrites + scores
    5. For the SAME sentences, calls `generateAlternativeSuggestions` WITH fewShotExamples — records the rewrites + scores
    6. Also runs the User example paper4.docx text through Sapling as a CONTROL — if human academic text scores >0.5, Sapling may not distinguish well
    7. Logs ALL results as structured JSON to `.sisyphus/evidence/task-1-diagnostic-baseline.json`
  - The script must capture: original text, rewritten text (with and without few-shot), Sapling scores for each, and the extracted style sentences
  - This establishes the baseline for Task 7 comparison

  **Must NOT do**:
  - Do not modify any production code
  - Do not change Sapling API calling patterns
  - Do not commit this as a permanent test — it's a diagnostic artifact

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Requires understanding the full codebase pipeline (docx parsing, detection, suggestion generation) and orchestrating multiple API calls with careful data capture
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — this is a Node.js script, not browser testing

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 5, 7
  - **Blocked By**: None (starts immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/lib/detection/sapling.ts` — Sapling detection adapter, `detect()` method for scoring text
  - `src/lib/suggestions/llm.ts:generateAlternativeSuggestions` — Function to call with/without fewShotExamples parameter
  - `src/lib/style-extraction/extractSentences.ts:extractStyleSentences` — To extract style sentences from paper4
  - `src/lib/document/` — Document processing pipeline to read .docx files

  **API/Type References**:
  - `src/lib/detection/types.ts` — DetectionResult, SentenceScore types
  - `src/lib/style-extraction/types.ts` — ExtractionResult type
  - `src/lib/suggestions/types.ts` — Suggestion types

  **External References**:
  - Sapling API docs: `https://sapling.ai/docs/api/detector` — Detection endpoint

  **WHY Each Reference Matters**:
  - `sapling.ts` — Need to call `detect()` directly to get per-sentence scores
  - `llm.ts:generateAlternativeSuggestions` — Need to compare its output with vs without fewShotExamples
  - `extractSentences.ts` — Need to extract the SAME style sentences the app would extract
  - `document/` — Need to parse .docx files the same way the app does

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Diagnostic captures all required data points
    Tool: Bash (node/bun)
    Preconditions: .env.local has SAPLING_API_KEY and COACHING_LLM_API_KEY configured
    Steps:
      1. Run the diagnostic script: `npx tsx scripts/diagnostic-baseline.ts` (or equivalent)
      2. Wait for completion (may take 30-60s due to API calls)
      3. Read `.sisyphus/evidence/task-1-diagnostic-baseline.json`
      4. Assert JSON contains: `baseline_scores` (array with per-sentence scores), `no_fewshot_rewrites` (array), `fewshot_rewrites` (array), `control_scores` (paper4 Sapling scores), `extracted_sentences` (array of 6 strings)
      5. Assert each rewrite entry has: `original`, `rewritten`, `original_score`, `rewritten_score`
    Expected Result: JSON file exists with all fields populated, no null/undefined values
    Failure Indicators: Script throws error, JSON missing fields, API timeout
    Evidence: .sisyphus/evidence/task-1-diagnostic-baseline.json

  Scenario: Control check — human paper scores low on Sapling
    Tool: Bash (node/bun)
    Preconditions: Diagnostic script completed
    Steps:
      1. Read `.sisyphus/evidence/task-1-diagnostic-baseline.json`
      2. Check `control_scores.overall` field
      3. If control_scores.overall > 0.5: LOG WARNING "Sapling scores human text as high-AI — approach may need pivoting"
    Expected Result: control_scores.overall < 0.5 (human text should score low)
    Failure Indicators: control_scores.overall > 0.5 — this is an existential risk for the approach
    Evidence: .sisyphus/evidence/task-1-diagnostic-baseline.json (control_scores section)
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-1-diagnostic-baseline.json` — Full diagnostic data

  **Commit**: YES
  - Message: `test: capture baseline diagnostic Sapling scores for few-shot comparison`
  - Files: `scripts/diagnostic-baseline.ts` (or equivalent)
  - Pre-commit: `npm run typecheck`

- [x] 2. Style-Aware System Prompts + parseRewritePayload Fix

  **What to do**:
  - **TDD: Write tests FIRST** in `src/lib/suggestions/__tests__/llm.test.ts`:
    - Test: `getSystemPrompt(false)` returns original `SYSTEM_PROMPT` unchanged
    - Test: `getSystemPrompt(true)` returns `STYLE_SYSTEM_PROMPT` (different from `SYSTEM_PROMPT`)
    - Test: `getMultiSystemPrompt(false)` returns original `MULTI_SYSTEM_PROMPT` unchanged
    - Test: `getMultiSystemPrompt(true)` returns `STYLE_MULTI_SYSTEM_PROMPT`
    - Test: `twoPassRewrite` with fewShotExamples calls adapter with style-aware system prompt
    - Test: `generateAlternativeSuggestions` with fewShotExamples calls adapter with style-aware multi system prompt
    - Test: `twoPassRewrite` WITHOUT fewShotExamples still uses original `SYSTEM_PROMPT`
    - Test: `parseRewritePayload` handles CoT text before JSON: input `"Style analysis: ...\n\n{\"rewrite\":\"test\",\"explanation\":\"test\"}"` → correctly extracts JSON
    - Test: `parseRewritePayload` still handles plain JSON (no regression)
    - Test: `parseRewritePayload` still handles markdown-fenced JSON (no regression)
  - **Implement** in `src/lib/suggestions/llm.ts`:
    - Add `STYLE_SYSTEM_PROMPT` constant — emphasizes: "You are an expert writing coach specializing in individual authorship style adaptation. Your primary goal is to make rewritten content sound authentically like the source author. When style examples are provided, prioritize matching the author's specific patterns over generic humanization. The rewrite should feel like the author wrote it."
    - Add `STYLE_MULTI_SYSTEM_PROMPT` constant — same philosophy but for multi-alternative format
    - Both MUST keep the JSON response format instructions identical to originals
    - Add `getSystemPrompt(hasFewShot: boolean)` function — returns style-aware or original
    - Add `getMultiSystemPrompt(hasFewShot: boolean)` function — returns style-aware or original
    - Update `twoPassRewrite` to use `getSystemPrompt(!!fewShotExamples?.length)` instead of hardcoded `SYSTEM_PROMPT`
    - Update `generateAlternativeSuggestions` to use `getMultiSystemPrompt(!!fewShotExamples?.length)` instead of hardcoded `MULTI_SYSTEM_PROMPT`
    - Update `parseRewritePayload` to handle CoT text: use regex to find first `{` and last `}` containing valid JSON, strip surrounding text
  - **CRITICAL**: Do NOT modify `SYSTEM_PROMPT` or `MULTI_SYSTEM_PROMPT` constants. Add NEW constants alongside them.
  - **CRITICAL**: Use `lsp_find_references` on `SYSTEM_PROMPT` and `MULTI_SYSTEM_PROMPT` to find ALL usage sites before modifying

  **Must NOT do**:
  - Do not rename or delete `SYSTEM_PROMPT` or `MULTI_SYSTEM_PROMPT`
  - Do not change the JSON response format in any system prompt
  - Do not modify non-few-shot code paths
  - Do not add banned phrases that would trigger guardrails

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core prompt engineering with strict non-regression requirements, multiple interacting concerns (system prompts, parser, adapter calls)
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — unit test focused

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 2 (with Task 5)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `src/lib/suggestions/llm.ts:17-30` — Current `SYSTEM_PROMPT` constant (DO NOT MODIFY — use as template for new prompt)
  - `src/lib/suggestions/llm.ts:32-47` — Current `MULTI_SYSTEM_PROMPT` constant (DO NOT MODIFY — use as template)
  - `src/lib/suggestions/llm.ts:52-55` — Existing conditional branching pattern for few-shot (follow this pattern)
  - `src/lib/suggestions/llm.ts:89-107` — Current `parseRewritePayload` function (needs CoT text handling)
  - `src/lib/suggestions/llm.ts:164-167` — Existing Pass2 skip logic (where system prompt is used)

  **API/Type References**:
  - `src/lib/suggestions/llm-adapter.ts:LlmCompletionRequest` — Interface used for adapter calls (systemPrompt field)

  **Test References**:
  - `src/lib/suggestions/__tests__/fewShot.test.ts:106-150` — Existing tests for voiceProfile fallback (MUST still pass)
  - `src/lib/suggestions/__tests__/llm.test.ts` — Existing LLM tests (add new tests here)

  **WHY Each Reference Matters**:
  - `llm.ts:17-30` — Template for the new STYLE_SYSTEM_PROMPT; keep JSON format identical, change behavior instructions
  - `llm.ts:52-55` — Pattern to follow for conditional few-shot branching
  - `llm.ts:89-107` — parseRewritePayload must be updated to handle CoT prefix text without breaking existing JSON/markdown-fence handling
  - `fewShot.test.ts:106-150` — Non-regression anchor; these tests prove the non-few-shot path is unchanged

  **Acceptance Criteria**:

  **If TDD:**
  - [ ] Test file updated: `src/lib/suggestions/__tests__/llm.test.ts`
  - [ ] `npm test src/lib/suggestions/__tests__/llm.test.ts` → PASS (all new + existing tests)
  - [ ] `npm test src/lib/suggestions/__tests__/fewShot.test.ts` → PASS (non-regression)
  - [ ] `npm test` → PASS (full suite, 600+ tests)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Style-aware system prompt used when fewShotExamples present
    Tool: Bash (npm test)
    Preconditions: Tests written and implementation complete
    Steps:
      1. Run `npm test src/lib/suggestions/__tests__/llm.test.ts`
      2. Verify test "getSystemPrompt returns STYLE_SYSTEM_PROMPT when hasFewShot=true" passes
      3. Verify test "getSystemPrompt returns SYSTEM_PROMPT when hasFewShot=false" passes
      4. Verify test "twoPassRewrite uses style-aware prompt with fewShotExamples" passes
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Any test failure, especially non-regression tests
    Evidence: .sisyphus/evidence/task-2-system-prompt-tests.txt

  Scenario: parseRewritePayload handles CoT text before JSON
    Tool: Bash (npm test)
    Preconditions: Parser updated
    Steps:
      1. Run `npm test src/lib/suggestions/__tests__/llm.test.ts`
      2. Verify test "parseRewritePayload extracts JSON after CoT analysis text" passes
      3. Verify test "parseRewritePayload still handles plain JSON" passes (regression)
      4. Verify test "parseRewritePayload still handles markdown fenced JSON" passes (regression)
    Expected Result: All parser tests pass
    Failure Indicators: Parser fails to extract JSON from CoT output
    Evidence: .sisyphus/evidence/task-2-parser-tests.txt

  Scenario: Non-few-shot path unchanged
    Tool: Bash (npm test)
    Preconditions: All changes complete
    Steps:
      1. Run `npm test src/lib/suggestions/__tests__/fewShot.test.ts`
      2. Verify ALL existing tests pass without modification
      3. Run `npm run typecheck` — 0 errors
    Expected Result: 0 test failures, 0 type errors
    Failure Indicators: Any existing test fails
    Evidence: .sisyphus/evidence/task-2-nonregression.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-2-system-prompt-tests.txt`
  - [ ] `.sisyphus/evidence/task-2-parser-tests.txt`
  - [ ] `.sisyphus/evidence/task-2-nonregression.txt`

  **Commit**: YES
  - Message: `fix(llm): add style-aware system prompts for few-shot mode`
  - Files: `src/lib/suggestions/llm.ts`, `src/lib/suggestions/__tests__/llm.test.ts`
  - Pre-commit: `npm test`

- [x] 3. CoT-Structured User Prompt with 4-Level Style Analysis

  **What to do**:
  - **TDD: Write tests FIRST** in `src/lib/suggestions/__tests__/fewShot.test.ts`:
    - Test: `buildFewShotContextBlock` output contains "First, analyze" or CoT trigger phrase
    - Test: `buildFewShotContextBlock` output contains all 4 style dimensions: vocabulary/lexis, sentence structure/syntax, tone, transitions/semantics
    - Test: `buildFewShotContextBlock` output contains numbered examples with annotation format
    - Test: `buildFewShotContextBlock` output ends with "Now rewrite" trigger (not just "Rewrite to sound like")
    - Test: `buildFewShotContextBlock` with 5 example sentences fits within MAX_FEWSHOT_CONTEXT_LENGTH (3000 chars) including annotations
    - Test: `buildFewShotContextBlock` with 1 example sentence still produces valid output (edge case)
    - Test: `buildFewShotContextBlock` truncation still works — no mid-sentence cuts
  - **Implement** in `src/lib/suggestions/voiceProfile.ts`:
    - Restructure `buildFewShotContextBlock` to use Persona + Analysis + CoT + Examples format:
      ```
      You will rewrite text to match a specific author's writing style.
      
      First, analyze the author's style from these examples:
      
      Example 1: "[sentence]"
      Example 2: "[sentence]"
      ...
      
      Consider these style dimensions:
      - Vocabulary: What word choices characterize this author? (formal/informal, technical/accessible, specific/general)
      - Sentence structure: What are their sentence length and complexity patterns?
      - Tone: What is the emotional register and formality level?
      - Transitions: How does the author connect ideas and build arguments?
      
      Now rewrite the following text to authentically match this author's voice. The rewrite must feel like this specific person wrote it, not like generic AI or a different writer.
      ```
    - The CoT trigger ("First, analyze") forces the LLM to reason about style before generating
    - Keep truncation logic but adapted for new format
    - Verify total output fits within MAX_FEWSHOT_CONTEXT_LENGTH (3000 chars)
  - **CRITICAL**: The prompt must NOT instruct the LLM to output its analysis — only to reason internally. The JSON response format must still be the output.

  **Must NOT do**:
  - Do not change MAX_FEWSHOT_CONTEXT_LENGTH value
  - Do not change how `buildFewShotContextBlock` is called (same signature)
  - Do not add explicit style annotations per sentence (annotation is in the PROMPT structure, not per-example metadata) — keep it simple
  - Do not instruct the LLM to output analysis text before JSON (this would break parsing) — the "analyze" instruction is for internal reasoning only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Prompt engineering requiring careful balance between CoT reasoning and JSON output format preservation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 4, 6)
  - **Parallel Group**: Wave 3 (with Tasks 4, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Tasks 2, 5

  **References** (CRITICAL):

  **Pattern References**:
  - `src/lib/suggestions/voiceProfile.ts:120-144` — Current `buildFewShotContextBlock` function (restructure this)
  - `src/lib/suggestions/voiceProfile.ts:40` — `MAX_FEWSHOT_CONTEXT_LENGTH = 3000` (budget constraint)
  - `src/lib/suggestions/voiceProfile.ts:100-118` — Truncation logic (preserve sentence-boundary truncation)

  **Test References**:
  - `src/lib/suggestions/__tests__/fewShot.test.ts` — Existing tests (add new tests, don't break existing)

  **External References**:
  - TINYSTYLER research: CoT-structured prompts with explicit style dimensions achieve 65-85% style transfer vs 15-30% for examples-only

  **WHY Each Reference Matters**:
  - `voiceProfile.ts:120-144` — This is the function being restructured; must understand current logic to preserve truncation and budget
  - `voiceProfile.ts:40` — Hard budget limit; new prompt format must fit within 3000 chars with examples
  - `fewShot.test.ts` — Non-regression anchor for existing few-shot behavior

  **Acceptance Criteria**:

  **If TDD:**
  - [ ] Tests added to `src/lib/suggestions/__tests__/fewShot.test.ts`
  - [ ] `npm test src/lib/suggestions/__tests__/fewShot.test.ts` → PASS
  - [ ] `npm test` → PASS (full suite)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: CoT prompt structure is correct
    Tool: Bash (npm test)
    Preconditions: Implementation complete
    Steps:
      1. Run `npm test src/lib/suggestions/__tests__/fewShot.test.ts`
      2. Verify test "buildFewShotContextBlock contains CoT trigger phrase" passes
      3. Verify test "buildFewShotContextBlock contains all 4 style dimensions" passes
      4. Verify test "buildFewShotContextBlock ends with Now rewrite trigger" passes
    Expected Result: All CoT structure tests pass
    Failure Indicators: Missing style dimensions, missing CoT trigger
    Evidence: .sisyphus/evidence/task-3-cot-prompt-tests.txt

  Scenario: Budget constraint respected
    Tool: Bash (npm test)
    Preconditions: Implementation complete
    Steps:
      1. Run `npm test src/lib/suggestions/__tests__/fewShot.test.ts`
      2. Verify test "5 examples with CoT structure fits within 3000 chars" passes
      3. Verify test "truncation preserves sentence boundaries" passes
    Expected Result: Total output length <= 3000 chars with 5 average-length examples
    Failure Indicators: Output exceeds budget, sentences cut mid-word
    Evidence: .sisyphus/evidence/task-3-budget-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-3-cot-prompt-tests.txt`
  - [ ] `.sisyphus/evidence/task-3-budget-tests.txt`

  **Commit**: YES
  - Message: `fix(prompt): restructure few-shot user prompt with CoT style analysis`
  - Files: `src/lib/suggestions/voiceProfile.ts`, `src/lib/suggestions/__tests__/fewShot.test.ts`
  - Pre-commit: `npm test`

- [x] 4. Re-Enable Style-Aware Pass2 Refinement for Few-Shot Mode

  **What to do**:
  - **TDD: Write tests FIRST** in `src/lib/suggestions/__tests__/llm.test.ts`:
    - Test: `twoPassRewrite` with fewShotExamples now CALLS Pass2 (not skipped)
    - Test: `twoPassRewrite` Pass2 uses style-aware system prompt (`STYLE_SYSTEM_PROMPT`)
    - Test: `twoPassRewrite` Pass2 includes fewShotExamples in its user prompt (style preserved through refinement)
    - Test: `generateAlternativeSuggestions` with fewShotExamples now CALLS Pass2 refinement
    - Test: `twoPassRewrite` WITHOUT fewShotExamples still follows original Pass2 behavior (non-regression)
    - Test: `generateAlternativeSuggestions` WITHOUT fewShotExamples still follows original Pass2 behavior
  - **Implement** in `src/lib/suggestions/llm.ts`:
    - **REMOVE** the early-return/skip logic at lines ~164-167 (`if (fewShotExamples) return pass1Result`)
    - **REPLACE** with style-aware Pass2: when fewShotExamples present, Pass2 STILL runs but:
      - Uses `getSystemPrompt(true)` (style-aware system prompt)
      - Pass2 user prompt includes the fewShotExamples via `buildUserPrompt` with the Pass1 rewrite as the sentence
      - Temperature for Pass2 stays at 0.85 (adds needed imperfections)
    - **SAME** for `generateAlternativeSuggestions` — remove the skip at line ~332, re-enable Pass2 with style-aware prompts
    - **KEY INSIGHT**: Pass2's role when few-shot is active changes from "generic humanize" to "refine while preserving author style"

  **Must NOT do**:
  - Do not change Pass2 temperature (keep 0.85)
  - Do not add additional LLM calls beyond the existing 2-pass pattern
  - Do not modify non-few-shot Pass2 behavior

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Delicate logic change reversing a previous fix, must understand the interaction between Pass1 style matching and Pass2 refinement
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 6)
  - **Parallel Group**: Wave 3 (with Tasks 3, 6)
  - **Blocks**: Task 7
  - **Blocked By**: Task 2

  **References** (CRITICAL):

  **Pattern References**:
  - `src/lib/suggestions/llm.ts:150-185` — `twoPassRewrite` function with current Pass2 skip logic (lines ~164-167)
  - `src/lib/suggestions/llm.ts:310-350` — `generateAlternativeSuggestions` with current Pass2 skip logic (line ~332)
  - `src/lib/suggestions/llm.ts:52-55` — Pattern for conditional few-shot branching

  **Test References**:
  - `src/lib/suggestions/__tests__/llm.test.ts` — Existing Pass2 skip tests (these need to be REVERSED, not deleted — update expectations)
  - `src/lib/suggestions/__tests__/fewShot.test.ts:289-315` — Pass2 regression tests

  **WHY Each Reference Matters**:
  - `llm.ts:150-185` — The exact location of Pass2 skip logic that needs to be removed/replaced
  - `llm.ts:310-350` — Second location of Pass2 skip in multi-alternatives function
  - `llm.test.ts` — Existing tests for Pass2 skip need their expectations reversed (now Pass2 SHOULD be called with few-shot)

  **Acceptance Criteria**:

  **If TDD:**
  - [ ] Tests updated in `src/lib/suggestions/__tests__/llm.test.ts`
  - [ ] `npm test src/lib/suggestions/__tests__/llm.test.ts` → PASS
  - [ ] `npm test` → PASS (full suite)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Pass2 runs with few-shot examples
    Tool: Bash (npm test)
    Preconditions: Implementation complete
    Steps:
      1. Run `npm test src/lib/suggestions/__tests__/llm.test.ts`
      2. Verify test "twoPassRewrite calls Pass2 when fewShotExamples present" passes
      3. Verify test "Pass2 uses style-aware system prompt" passes
      4. Verify test "Pass2 includes fewShotExamples in user prompt" passes
    Expected Result: All Pass2 re-enable tests pass
    Failure Indicators: Pass2 still being skipped, wrong system prompt used
    Evidence: .sisyphus/evidence/task-4-pass2-reenable-tests.txt

  Scenario: Non-few-shot Pass2 behavior unchanged
    Tool: Bash (npm test)
    Preconditions: All changes complete
    Steps:
      1. Run `npm test src/lib/suggestions/__tests__/llm.test.ts`
      2. Verify test "twoPassRewrite without fewShotExamples still uses original Pass2" passes
      3. Run `npm test src/lib/suggestions/__tests__/fewShot.test.ts` — all pass
    Expected Result: Non-regression — original behavior preserved
    Failure Indicators: Any existing test fails
    Evidence: .sisyphus/evidence/task-4-nonregression.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-4-pass2-reenable-tests.txt`
  - [ ] `.sisyphus/evidence/task-4-nonregression.txt`

  **Commit**: YES
  - Message: `fix(llm): re-enable style-aware Pass2 refinement for few-shot mode`
  - Files: `src/lib/suggestions/llm.ts`, `src/lib/suggestions/__tests__/llm.test.ts`
  - Pre-commit: `npm test`

- [x] 5. Extraction Refinements — Relax Citation Filter, Reduce to 5 Sentences

  **What to do**:
  - **TDD: Write tests FIRST** in `src/lib/style-extraction/__tests__/extractSentences.test.ts`:
    - Test: Sentence with inline citation `"Smith (2020) argues that data shows a clear trend."` passes `filterCandidates` (currently rejected by CITATION_PATTERN)
    - Test: Sentence with bracket citation `"The results were significant [3]."` passes `filterCandidates` (currently rejected)
    - Test: Reference list entries STILL rejected: `"Smith, J. (2020). Title of paper. Journal, 5(2), 1-10."` (REFERENCE_ENTRY_PATTERN still active)
    - Test: `DEFAULT_SENTENCE_COUNT` equals 5 (changed from 6)
    - Test: `extractStyleSentences` returns exactly 5 sentences when given sufficient input
    - Test: Diversity selection with 5 sentences still covers multiple length/position buckets
  - **Implement** in `src/lib/style-extraction/extractSentences.ts`:
    - **Relax `CITATION_PATTERN`**: Change from rejecting ALL sentences with citations to ONLY rejecting sentences that ARE citation-only (e.g., entire sentence is a citation). Sentences with inline citations like "Smith (2020) found that..." should PASS. Approach: instead of checking if sentence CONTAINS citation pattern, check if sentence is PREDOMINANTLY a citation (>50% of content is citation markup)
    - **Change `DEFAULT_SENTENCE_COUNT`**: 6 → 5
    - **Keep all other filters**: heading, fragment, reference section, definition filters remain unchanged
    - **Verify**: REFERENCE_ENTRY_PATTERN and AUTHOR_YEAR_LEAD_PATTERN still correctly reject reference list items (these are different from inline citations)

  **Must NOT do**:
  - Do not modify `selectDiverse` algorithm logic
  - Do not modify `splitIntoSentences` logic
  - Do not remove REFERENCE_ENTRY_PATTERN or AUTHOR_YEAR_LEAD_PATTERN filters
  - Do not change MIN_STYLE_TEXT_LENGTH

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Regex engineering with careful distinction between inline citations (keep) and reference entries (reject)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `src/lib/style-extraction/extractSentences.ts:14` — `CITATION_PATTERN` regex (needs relaxing)
  - `src/lib/style-extraction/extractSentences.ts:6` — `DEFAULT_SENTENCE_COUNT = 6` (change to 5)
  - `src/lib/style-extraction/extractSentences.ts:16-18` — `REFERENCE_ENTRY_PATTERN`, `AUTHOR_YEAR_LEAD_PATTERN` (keep as-is)
  - `src/lib/style-extraction/extractSentences.ts` — `filterCandidates` function (modify citation check only)

  **Test References**:
  - `src/lib/style-extraction/__tests__/extractSentences.test.ts` — Existing 8 tests (all must still pass)

  **WHY Each Reference Matters**:
  - `CITATION_PATTERN` — The specific regex being relaxed; need to understand what it currently matches
  - `REFERENCE_ENTRY_PATTERN` — Must NOT be changed; need to verify it still catches reference list entries
  - `filterCandidates` — The function where citation check logic is modified

  **Acceptance Criteria**:

  **If TDD:**
  - [ ] Tests added to `src/lib/style-extraction/__tests__/extractSentences.test.ts`
  - [ ] `npm test src/lib/style-extraction/__tests__/extractSentences.test.ts` → PASS
  - [ ] `npm test` → PASS (full suite)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Inline citations now pass through extraction
    Tool: Bash (npm test)
    Preconditions: Implementation complete
    Steps:
      1. Run `npm test src/lib/style-extraction/__tests__/extractSentences.test.ts`
      2. Verify test "sentence with inline citation passes filterCandidates" passes
      3. Verify test "sentence with bracket citation passes filterCandidates" passes
      4. Verify test "reference list entry still rejected" passes
    Expected Result: Inline citations pass, reference entries still rejected
    Failure Indicators: Inline citations still rejected, or reference entries now pass
    Evidence: .sisyphus/evidence/task-5-citation-filter-tests.txt

  Scenario: Sentence count reduced to 5
    Tool: Bash (npm test)
    Preconditions: Implementation complete
    Steps:
      1. Run `npm test src/lib/style-extraction/__tests__/extractSentences.test.ts`
      2. Verify test "DEFAULT_SENTENCE_COUNT equals 5" passes
      3. Verify test "extractStyleSentences returns 5 sentences" passes
    Expected Result: Default count is 5, extraction returns 5 sentences
    Failure Indicators: Still returns 6, or DEFAULT_SENTENCE_COUNT unchanged
    Evidence: .sisyphus/evidence/task-5-count-tests.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-5-citation-filter-tests.txt`
  - [ ] `.sisyphus/evidence/task-5-count-tests.txt`

  **Commit**: YES
  - Message: `fix(extraction): relax citation filter, reduce to 5 diverse sentences`
  - Files: `src/lib/style-extraction/extractSentences.ts`, `src/lib/style-extraction/__tests__/extractSentences.test.ts`
  - Pre-commit: `npm test`

- [x] 6. Add Optional top_p Parameter to LLM Adapter

  **What to do**:
  - **TDD: Write tests FIRST**:
    - Test: `LlmCompletionRequest` type accepts optional `topP` field
    - Test: OpenAI adapter passes `top_p` to API when `topP` is provided in request
    - Test: OpenAI adapter omits `top_p` from API when `topP` is NOT provided (no regression)
    - Test: Anthropic adapter passes `top_p` to API when `topP` is provided
    - Test: Anthropic adapter omits `top_p` when NOT provided
  - **Implement**:
    - `src/lib/suggestions/llm-adapter.ts`: Add `topP?: number` to `LlmCompletionRequest` interface
    - `src/lib/suggestions/adapters/openai.ts`: Include `top_p: request.topP` in OpenAI API call when provided
    - `src/lib/suggestions/adapters/anthropic.ts`: Include `top_p: request.topP` in Anthropic API call when provided
    - `src/lib/suggestions/llm.ts`: When fewShotExamples present, add `topP: 0.9` to the `LlmCompletionRequest` for both Pass1 and Pass2 calls. When no fewShotExamples, do NOT set topP (preserves existing behavior).
  - **CRITICAL**: `topP` must be OPTIONAL in the interface to avoid breaking all existing adapter calls

  **Must NOT do**:
  - Do not change temperature values
  - Do not set topP for non-few-shot calls
  - Do not change the adapter interface beyond adding the optional field

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple interface addition + passthrough — low complexity, clear implementation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4)
  - **Parallel Group**: Wave 3 (with Tasks 3, 4)
  - **Blocks**: Task 7
  - **Blocked By**: None (but grouped in Wave 3 for simplicity)

  **References** (CRITICAL):

  **Pattern References**:
  - `src/lib/suggestions/llm-adapter.ts:13-22` — `LlmCompletionRequest` interface (add `topP?: number`)
  - `src/lib/suggestions/adapters/openai.ts:30-45` — OpenAI API call construction (add `top_p`)
  - `src/lib/suggestions/adapters/anthropic.ts:20-35` — Anthropic API call construction (add `top_p`)
  - `src/lib/suggestions/llm.ts` — `twoPassRewrite` and `generateAlternativeSuggestions` adapter calls (add topP when fewShot active)

  **WHY Each Reference Matters**:
  - `llm-adapter.ts:13-22` — The interface being extended; must be optional to avoid breaking existing calls
  - `openai.ts` / `anthropic.ts` — The adapter implementations that need to forward the parameter

  **Acceptance Criteria**:

  **If TDD:**
  - [ ] Tests written for adapter parameter passing
  - [ ] `npm test` → PASS (full suite)
  - [ ] `npm run typecheck` → 0 errors (interface change compiles)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: topP passed through to LLM APIs
    Tool: Bash (npm test)
    Preconditions: Implementation complete
    Steps:
      1. Run `npm test` (relevant adapter test files)
      2. Verify test "OpenAI adapter passes top_p when topP provided" passes
      3. Verify test "OpenAI adapter omits top_p when topP not provided" passes
      4. Run `npm run typecheck` — 0 errors
    Expected Result: topP forwarded correctly, no type errors
    Failure Indicators: Type errors, parameter not forwarded
    Evidence: .sisyphus/evidence/task-6-topp-tests.txt

  Scenario: Existing adapter calls unaffected
    Tool: Bash (npm test)
    Preconditions: All changes complete
    Steps:
      1. Run `npm test` — full suite
      2. Verify 0 failures in existing adapter tests
    Expected Result: No regression in existing adapter behavior
    Failure Indicators: Any existing test fails
    Evidence: .sisyphus/evidence/task-6-nonregression.txt
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-6-topp-tests.txt`
  - [ ] `.sisyphus/evidence/task-6-nonregression.txt`

  **Commit**: YES
  - Message: `feat(llm): add optional top_p parameter to LLM adapter`
  - Files: `src/lib/suggestions/llm-adapter.ts`, `src/lib/suggestions/adapters/openai.ts`, `src/lib/suggestions/adapters/anthropic.ts`, `src/lib/suggestions/llm.ts`, relevant test files
  - Pre-commit: `npm test`

- [x] 7. Live Verification — Compare Post-Fix Scores to Task 1 Baseline

  **What to do**:
  - Re-run the EXACT same diagnostic from Task 1, but now with all fixes applied (Tasks 2-6)
  - Use the same script/test from Task 1 (or copy+modify for post-fix context)
  - Compare results:
    1. Read Task 1 baseline from `.sisyphus/evidence/task-1-diagnostic-baseline.json`
    2. Run the same tests: same sentences from Test.docx, same style source from paper4.docx
    3. Record post-fix scores to `.sisyphus/evidence/task-7-diagnostic-postfix.json`
    4. Generate comparison report: for each sentence, show `baseline_score → postfix_score` and delta
    5. SUCCESS criteria: per-sentence scores with few-shot should be LOWER than without few-shot
    6. Also verify: non-few-shot rewrites produce similar scores to Task 1 baseline (no regression)
  - If scores are NOT lower, log the actual rewritten text for inspection — the issue may be in prompt wording
  - Save comparison as `.sisyphus/evidence/task-7-comparison-report.txt`

  **Must NOT do**:
  - Do not modify any production code
  - Do not change the diagnostic methodology from Task 1

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must interpret API results, compare baselines, and diagnose if improvements are insufficient
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (solo)
  - **Blocks**: F1-F4
  - **Blocked By**: Tasks 3, 4, 6

  **References** (CRITICAL):

  **Pattern References**:
  - Task 1 diagnostic script (whatever was created)
  - `.sisyphus/evidence/task-1-diagnostic-baseline.json` — Baseline to compare against

  **WHY Each Reference Matters**:
  - Task 1 script — Re-run same methodology for apples-to-apples comparison
  - Baseline JSON — Source of truth for "before" scores

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Post-fix few-shot scores are lower than baseline
    Tool: Bash (node/bun)
    Preconditions: All implementation tasks (2-6) complete, diagnostic script from Task 1 available
    Steps:
      1. Run the diagnostic script again
      2. Read `.sisyphus/evidence/task-7-diagnostic-postfix.json`
      3. Read `.sisyphus/evidence/task-1-diagnostic-baseline.json`
      4. For each sentence: compare `fewshot_rewrites[i].rewritten_score` (postfix) vs `fewshot_rewrites[i].rewritten_score` (baseline)
      5. Calculate average delta across all sentences
    Expected Result: Average delta is NEGATIVE (scores decreased). At least 60% of sentences show lower scores with few-shot post-fix than pre-fix.
    Failure Indicators: Scores unchanged or increased. Average delta is positive or zero.
    Evidence: .sisyphus/evidence/task-7-comparison-report.txt

  Scenario: Non-few-shot path shows no regression
    Tool: Bash (node/bun)
    Preconditions: Diagnostic script completed
    Steps:
      1. Compare `no_fewshot_rewrites` scores between baseline and postfix
      2. Delta should be near-zero (within ±0.05)
    Expected Result: Non-few-shot scores are approximately the same as baseline
    Failure Indicators: Non-few-shot scores changed significantly (>0.05 delta)
    Evidence: .sisyphus/evidence/task-7-comparison-report.txt (non-fewshot section)
  ```

  **Evidence to Capture:**
  - [ ] `.sisyphus/evidence/task-7-diagnostic-postfix.json`
  - [ ] `.sisyphus/evidence/task-7-comparison-report.txt`

  **Commit**: YES
  - Message: `test: verify post-fix Sapling scores show improvement with few-shot`
  - Files: diagnostic script (if modified), evidence files
  - Pre-commit: `npm run typecheck`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check function). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan. Verify `SYSTEM_PROMPT` and `MULTI_SYSTEM_PROMPT` constants are UNCHANGED. Verify all changes are gated behind `fewShotExamples && fewShotExamples.length > 0`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck` + `npm run lint` + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify `parseRewritePayload` correctly handles CoT output. Verify `top_p` is optional and doesn't break existing calls.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start dev server. Upload Test.docx via the app. Record baseline score. Upload User example paper4.docx via My Paper tab. Extract style. Generate suggestions for high-scoring sentences. Record post-rewrite scores. Compare: few-shot scores should be lower than baseline. Also test non-few-shot path works identically. Save evidence screenshots + score logs.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 match. Check "Must NOT do" compliance. Detect cross-task contamination. Verify SYSTEM_PROMPT and MULTI_SYSTEM_PROMPT constants unchanged. Verify non-few-shot path untouched. Flag any unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

| Commit | Message | Files | Pre-commit |
|--------|---------|-------|------------|
| 1 | `test: capture baseline diagnostic Sapling scores for few-shot comparison` | diagnostic script | `npm test` |
| 2 | `fix(extraction): relax citation filter, reduce to 5 sentences with style annotations` | extractSentences.ts, extractSentences.test.ts | `npm test` |
| 3 | `fix(llm): add style-aware system prompts for few-shot mode` | llm.ts, llm.test.ts | `npm test` |
| 4 | `fix(prompt): restructure few-shot user prompt with CoT style analysis` | voiceProfile.ts, fewShot.test.ts | `npm test` |
| 5 | `fix(llm): re-enable style-aware Pass2 refinement for few-shot mode` | llm.ts, llm.test.ts | `npm test` |
| 6 | `feat(llm): add optional top_p parameter to LLM adapter` | llm-adapter.ts, openai.ts, anthropic.ts, adapter tests | `npm test` |
| 7 | `test: verify post-fix Sapling scores show improvement with few-shot` | diagnostic script | `npm test` |

---

## Success Criteria

### Verification Commands
```bash
npm run lint        # Expected: 0 errors
npm run typecheck   # Expected: 0 errors
npm run test        # Expected: all pass (600+ tests)
npm run test:e2e    # Expected: all pass (43+ tests)
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Task 7 scores show improvement over Task 1 baseline
- [ ] Non-few-shot path unchanged (existing tests prove this)
