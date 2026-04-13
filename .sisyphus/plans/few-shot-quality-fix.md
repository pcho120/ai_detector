# Fix Few-Shot My Paper Feature — Score Goes Up Instead of Down

## TL;DR

> **Quick Summary**: The "My Paper" few-shot feature extracts garbage sentences (headings, references, fragments) and sends them in a weak prompt to the LLM, which then washes out any remaining style signal through a two-pass rewrite. Fix all three layers: extraction filters, prompt design, and two-pass logic.
> 
> **Deliverables**:
> - Fixed extraction filters in `extractSentences.ts` that reject headings, fragments, reference entries, and definition formats
> - Improved few-shot prompt in `voiceProfile.ts` with explicit style analysis guidance and safe truncation
> - Adjusted two-pass logic in `llm.ts` to skip Pass2 when few-shot examples are active (both `twoPassRewrite` and `generateAlternativeSuggestions`)
> - TDD tests for all changes with concrete garbage inputs from the 3 test papers
> 
> **Estimated Effort**: Short (3 tasks, ~2 hours)
> **Parallel Execution**: YES — 2 waves (extraction first, then prompt+llm in parallel)
> **Critical Path**: Task 1 (extraction) → Task 2 & 3 (parallel) → Final Verification

---

## Context

### Original Request
User tested the "My Paper" feature with 3 sample papers (`Test-doc/User example paper.docx`, `paper2.docx`, `paper3.docx`) and discovered that AI detection scores went UP instead of down when few-shot examples were active.

### Interview Summary
**Key Discussions**:
- User confirmed scores increased (worse) with My Paper feature active
- User chose "prompt-centric improvements" over full redesign
- Test infrastructure exists: 592 unit + 43 E2E tests, all passing
- API keys configured in `.env.local`

**Research Findings — Actual Extract-Style API Test Results**:

**Paper 1** (User example paper.docx) — 4/6 garbage:
1. ⚠️ "Managing a changing workforce mix is important..." ← OK
2. ❌ "Recruiting Connection." ← 2-word fragment/heading
3. ❌ "Staff augmentation: involves expanding..." ← definition format
4. ❌ "Staffing models supporting today's workforce mix." ← heading
5. ⚠️ "When designing cost center budgets..." ← OK
6. ❌ "References Roussel, L.A., Thomas, P.L...." ← reference entry

**Paper 2** (paper2.docx) — 2/6 garbage:
1. ⚠️ "I see physical activity and nutrition..." ← OK
2. ❌ "References Barber, A." ← reference entry
3. ⚠️ "Nutrition Nutrition is important for nurses'..." ← starts with repeated word (heading leak)
4. ❌ "Wisconsin Nurses Association." ← organization name fragment
5. ⚠️ "It does not have to be lifting heavy weights..." ← OK
6. ⚠️ "It increases the production of endorphins..." ← OK

**Paper 3** (paper3.docx) — 3/6 garbage:
1. ⚠️ "On the night shift, where one nurse may have..." ← OK
2. ❌ "Rural hospitals face ongoing staffing shortages." ← too short/generic
3. ❌ "Usability Challenges in Electronic Health Records:..." ← paper title
4. ❌ "Limited Staffing and On-Call Providers." ← section heading
5. ⚠️ "High nurse-to-patient ratios at night..." ← OK
6. ⚠️ "Night shift and occupational fatigue among nurses..." ← paper title (also garbage)

**Root Cause Analysis** (3 layers):
1. **Extraction**: `filterCandidates` in `extractSentences.ts` misses headings, "References" prefix lines, short fragments, definition formats
2. **Prompt**: `buildFewShotContextBlock` in `voiceProfile.ts` is just "Write in the same style" with numbered sentences — no style guidance
3. **Two-pass**: `twoPassRewrite` in `llm.ts` runs Pass2 (temp 0.85) on already-rewritten text, washing out style signal. Same problem in `generateAlternativeSuggestions` lines 326-342.

### Metis Review
**Identified Gaps** (addressed):
- **generateAlternativeSuggestions Pass2** (lines 326-342): Same wash-out as twoPassRewrite — must fix both
- **Truncation safety**: `buildFewShotContextBlock` uses `slice(0, 2000)` which cuts mid-sentence — must drop last sentence instead
- **Minimum quality threshold**: After improved filtering, papers may yield <3 good sentences — need graceful handling
- **Citation filter re-evaluation**: Current CITATION_PATTERN rejects sentences containing `(Smith 2020)` — but these ARE the user's characteristic academic sentences. Consider stripping citation markers instead of rejecting whole sentence.
- **"References" false positive**: "References to earlier studies support this claim." is valid prose starting with "References" — filter must check for author-name pattern after the word, not just the word itself.

---

## Work Objectives

### Core Objective
Fix the My Paper few-shot feature so rewritten text actually reflects the user's writing style instead of increasing AI detection scores.

### Concrete Deliverables
- `src/lib/style-extraction/extractSentences.ts` — improved `filterCandidates` with 4 new filters
- `src/lib/style-extraction/__tests__/extractSentences.test.ts` — TDD tests with real garbage inputs
- `src/lib/suggestions/voiceProfile.ts` — improved `buildFewShotContextBlock` prompt + safe truncation
- `src/lib/suggestions/__tests__/fewShot.test.ts` — tests for new prompt structure + truncation
- `src/lib/suggestions/llm.ts` — Skip Pass2 when fewShotExamples active (both functions)
- `src/lib/suggestions/__tests__/llm.test.ts` — tests verifying Pass2 skip behavior

### Definition of Done
- [ ] All 3 test papers extract ≥3 quality sentences (no headings, fragments, references)
- [ ] `buildFewShotContextBlock` output contains style analysis guidance keywords
- [ ] `twoPassRewrite` calls LLM exactly once (not twice) when `fewShotExamples` provided
- [ ] `generateAlternativeSuggestions` skips Pass2 refinement when `fewShotExamples` provided
- [ ] `npm run test` → 592+ pass, `npm run typecheck` → 0 errors, `npm run lint` → 0 errors
- [ ] Non-few-shot paths produce identical behavior

### Must Have
- Heading/title detection filter in `filterCandidates`
- "References" section line detection (not just reference entry pattern)
- Word-count minimum (≥5 words) in addition to character length
- Definition format detection ("Term: definition..." pattern)
- Style analysis guidance in few-shot prompt
- Safe truncation that drops last sentence instead of slicing mid-text
- Pass2 skip for few-shot mode in BOTH `twoPassRewrite` AND `generateAlternativeSuggestions`

### Must NOT Have (Guardrails)
- No modification to `SYSTEM_PROMPT` (llm.ts:17-30) or `MULTI_SYSTEM_PROMPT` (llm.ts:32-47)
- No modification to `selectDiverse` algorithm logic in extractSentences.ts
- No modification to `splitIntoSentences` logic
- No modification to `applyGuardrails` or guardrails.ts
- No modification to API routes, UI components, or file processing code
- No modification to non-few-shot code paths (voiceProfile-only must remain identical)
- No new npm dependencies
- No new source files (only modify existing + test files)
- No style pre-analysis LLM call or scoring system (over-engineering)
- No changes to `DEFAULT_SENTENCE_COUNT` (fix filter quality, don't reduce count)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD (write failing tests first, then implement)
- **Framework**: vitest (bun test alias)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Library/Module**: Use Bash (vitest run) — Run targeted tests, verify pass count
- **Regression**: Use Bash (npm run test) — Full suite, verify 0 failures

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — extraction filter fix):
└── Task 1: Fix filterCandidates with new filters + TDD tests [deep]

Wave 2 (After Wave 1 — prompt + two-pass fixes in parallel):
├── Task 2: Improve buildFewShotContextBlock prompt + truncation [deep]
└── Task 3: Skip Pass2 in few-shot mode (both functions) [deep]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | None | 2, 3 | 1 |
| 2 | 1 | F1-F4 | 2 |
| 3 | 1 | F1-F4 | 2 |
| F1-F4 | 2, 3 | — | FINAL |

### Agent Dispatch Summary
- **Wave 1**: 1 task — T1 → `deep`
- **Wave 2**: 2 tasks — T2 → `deep`, T3 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Fix filterCandidates extraction filters (TDD)

  **What to do**:
  - **TDD RED phase**: Add test cases to `extractSentences.test.ts` using the actual garbage sentences from all 3 test papers:
    - `"Recruiting Connection."` → REJECTED (fragment, <5 words)
    - `"Staffing models supporting today's workforce mix."` → REJECTED (heading: short Title Case with period)
    - `"Staff augmentation: involves expanding the full-time workforce with temporary hires to complete specific projects or short-term goals."` → REJECTED (definition format: "Term: definition...")
    - `"References Roussel, L.A., Thomas, P.L., & Harris, J.L. (2023)."` → REJECTED (references section line)
    - `"References Barber, A."` → REJECTED (references section line)
    - `"Wisconsin Nurses Association."` → REJECTED (organization fragment, <5 words)
    - `"Limited Staffing and On-Call Providers."` → REJECTED (heading: short Title Case with period)
    - `"Usability Challenges in Electronic Health Records: Impact on Documentation Burden..."` → REJECTED (title with colon)
    - `"Rural hospitals face ongoing staffing shortages."` → edge case — this is short but valid prose. Do NOT reject if ≥5 words.
    - `"References to earlier studies support this claim."` → MUST PASS (valid prose starting with "References")
    - `"Nurse staffing directly impacts patient outcomes."` → MUST PASS (valid short declarative sentence)
  - Verify all new tests FAIL with current code
  - **TDD GREEN phase**: Add 4 new filters to `filterCandidates` in `extractSentences.ts`:
    1. **Word-count minimum**: Reject sentences with fewer than 5 words (split on whitespace)
    2. **References section detection**: Reject if sentence matches `/^References\s+[A-Z][A-Za-z''.,-]+/` (word "References" followed by author-name-like pattern). MUST NOT reject "References to..." or "References in..." (followed by common prepositions)
    3. **Heading/title detection**: Reject if sentence is ≤8 words AND every significant word (>3 chars) is Title Case AND no comma present. This catches "Limited Staffing and On-Call Providers." but preserves "Insulin resistance worsened significantly."
    4. **Definition format**: Reject if sentence matches `/^[A-Z][A-Za-z\s]{2,30}:\s/` (short capitalized phrase followed by colon+space, indicating "Term: definition...")
  - **TDD REFACTOR phase**: Verify existing tests still pass, clean up if needed
  - Also consider (from Metis): revisit `CITATION_PATTERN` — currently rejects entire sentences containing `(Smith, 2020)`. Better approach: strip citation markers from sentence text before evaluation, or at least don't reject sentences where the citation is <20% of the text. **Decision: Leave CITATION_PATTERN as-is for this fix.** Changing citation behavior is a separate scope item.

  **Must NOT do**:
  - Do NOT modify `selectDiverse` algorithm
  - Do NOT modify `splitIntoSentences` logic
  - Do NOT change `MIN_SENTENCE_LENGTH` or `MAX_SENTENCE_LENGTH` constants
  - Do NOT change `DEFAULT_SENTENCE_COUNT`
  - Do NOT add a scoring/ranking system

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: TDD discipline with regex edge cases requires careful reasoning about false positives
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (must complete first — Wave 1)
  - **Parallel Group**: Wave 1 (solo)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None

  **References** (CRITICAL):

  **Pattern References**:
  - `src/lib/style-extraction/extractSentences.ts:137-173` — existing `filterCandidates` function with current regex patterns (REFERENCE_ENTRY_PATTERN line 15, CITATION_PATTERN line 14, etc.)
  - `src/lib/style-extraction/extractSentences.ts:10-17` — existing regex patterns to understand naming conventions and style
  - `src/lib/style-extraction/extractSentences.ts:59-79` — existing helper functions `isAllCapsSentence` and `isMostlyNumbersOrSymbols` as pattern for new filter helpers

  **Test References**:
  - `src/lib/style-extraction/__tests__/extractSentences.test.ts` — existing test structure, `padText` helper usage, describe blocks for `filterCandidates`
  - The `padText` helper pads short test input to meet `MIN_STYLE_TEXT_LENGTH` — new tests should use the same approach

  **Context Data** (actual garbage from test papers):
  - Paper 1 garbage: `"Recruiting Connection."`, `"Staff augmentation: involves expanding..."`, `"Staffing models supporting today's workforce mix."`, `"References Roussel, L.A., Thomas, P.L., & Harris, J.L. (2023)."`
  - Paper 2 garbage: `"References Barber, A."`, `"Wisconsin Nurses Association."`
  - Paper 3 garbage: `"Limited Staffing and On-Call Providers."`, `"Usability Challenges in Electronic Health Records: Impact on Documentation Burden and Clinical Workflow: A Scoping Review."`

  **Acceptance Criteria**:

  - [ ] Test file updated: `src/lib/style-extraction/__tests__/extractSentences.test.ts`
  - [ ] `vitest run src/lib/style-extraction/__tests__/extractSentences.test.ts` → ALL tests pass (old + new)
  - [ ] All 8 garbage sentences from test papers are rejected by `filterCandidates`
  - [ ] `"References to earlier studies support this claim."` is NOT rejected (false positive check)
  - [ ] `"Nurse staffing directly impacts patient outcomes."` is NOT rejected (short valid prose check)
  - [ ] `"Rural hospitals face ongoing staffing shortages."` is NOT rejected (≥5 words valid prose)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Garbage sentences from test papers are all rejected
    Tool: Bash (vitest)
    Preconditions: extractSentences.test.ts has new test cases
    Steps:
      1. Run: vitest run src/lib/style-extraction/__tests__/extractSentences.test.ts
      2. Check output for test count and pass/fail
    Expected Result: All tests pass, 0 failures
    Failure Indicators: Any test failure mentioning "filterCandidates" or "garbage"
    Evidence: .sisyphus/evidence/task-1-filter-tests.txt

  Scenario: Valid prose sentences are not false-positive rejected
    Tool: Bash (vitest)
    Preconditions: Test includes "References to earlier studies..." and "Nurse staffing..." as MUST-PASS
    Steps:
      1. Run same test file
      2. Verify the false-positive tests pass
    Expected Result: All pass — no valid sentences rejected
    Evidence: .sisyphus/evidence/task-1-false-positive-check.txt

  Scenario: Full extraction on test paper produces quality results
    Tool: Bash (node script or vitest)
    Preconditions: Dev server running or direct function call
    Steps:
      1. Call extractStyleSentences with text from User example paper.docx
      2. Verify: returned sentences contain ≥3 items, NONE match garbage patterns
    Expected Result: ≥3 quality sentences, 0 garbage
    Evidence: .sisyphus/evidence/task-1-extraction-quality.txt
  ```

  **Commit**: YES
  - Message: `fix(extraction): add heading, fragment, reference-section, and definition filters to filterCandidates`
  - Files: `src/lib/style-extraction/extractSentences.ts`, `src/lib/style-extraction/__tests__/extractSentences.test.ts`
  - Pre-commit: `vitest run src/lib/style-extraction/__tests__/extractSentences.test.ts`

---

- [ ] 2. Improve buildFewShotContextBlock prompt + safe truncation

  **What to do**:
  - **TDD RED phase**: Add tests to `fewShot.test.ts`:
    - Test that output contains style guidance keywords like "sentence structure", "vocabulary", "tone" (not just "Write in the same style")
    - Test that truncation drops the last sentence cleanly instead of slicing mid-text
    - Test that output with 6 realistic sentences stays within MAX_FEWSHOT_CONTEXT_LENGTH
    - Test that output with 1 sentence still produces valid guidance
  - **TDD GREEN phase**: Rewrite `buildFewShotContextBlock` in `voiceProfile.ts`:
    - Replace the simple `"Write in the same style as these example sentences from the author:"` with a richer prompt that tells the LLM specifically what to analyze:
      ```
      The following sentences are examples of this author's writing. Match their:
      - Sentence structure and length patterns
      - Vocabulary level and word choices
      - Tone (formal/informal, active/passive voice preference)
      - Transition and linking patterns
      
      Author's example sentences:
      1. "sentence A"
      2. "sentence B"
      ...
      
      Rewrite to sound like this specific author, not like generic AI text.
      ```
    - Fix truncation: instead of `full.slice(0, MAX_FEWSHOT_CONTEXT_LENGTH)`, build incrementally — add sentences one by one until budget is exceeded, then stop. This ensures no mid-sentence cuts.
    - Consider increasing `MAX_FEWSHOT_CONTEXT_LENGTH` from 2000 to 3000 to accommodate the richer prompt header (the header alone might be ~300 chars now vs ~60 before). **Decision: Increase to 3000.**
  - **TDD REFACTOR**: Verify existing tests still pass

  **Must NOT do**:
  - Do NOT change `sanitizeVoiceProfile` or `buildRewriteContextBlock` (voice profile path)
  - Do NOT change `MAX_PROFILE_LENGTH` (used by voice profile, separate concern)
  - Do NOT add LLM pre-analysis call
  - Do NOT modify `buildProfileGenerationPrompt`

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Prompt engineering requires careful wording; truncation logic needs correct incremental build
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `src/lib/suggestions/voiceProfile.ts:120-133` — current `buildFewShotContextBlock` implementation to replace
  - `src/lib/suggestions/voiceProfile.ts:106-118` — `buildRewriteContextBlock` as pattern reference for context block formatting (do NOT modify)
  - `src/lib/suggestions/voiceProfile.ts:40` — `MAX_FEWSHOT_CONTEXT_LENGTH = 2000` constant to increase to 3000

  **Test References**:
  - `src/lib/suggestions/__tests__/fewShot.test.ts` — existing test structure and patterns for buildFewShotContextBlock tests

  **External References**:
  - The prompt improvement should focus on style dimensions: sentence structure, vocabulary, tone, transitions — these are the key differentiators between human and AI writing

  **Acceptance Criteria**:

  - [ ] `vitest run src/lib/suggestions/__tests__/fewShot.test.ts` → ALL tests pass (old + new)
  - [ ] `buildFewShotContextBlock(["sentence A", "sentence B"])` output contains keywords: "sentence structure", "vocabulary", "tone"
  - [ ] Truncation with many long sentences drops last sentence cleanly (no mid-sentence cut)
  - [ ] MAX_FEWSHOT_CONTEXT_LENGTH increased to 3000

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Improved prompt contains style analysis guidance
    Tool: Bash (vitest)
    Preconditions: fewShot.test.ts has new assertions
    Steps:
      1. Run: vitest run src/lib/suggestions/__tests__/fewShot.test.ts
      2. Check all tests pass including new style-keyword assertions
    Expected Result: All pass, output contains style guidance
    Evidence: .sisyphus/evidence/task-2-prompt-tests.txt

  Scenario: Truncation drops last sentence cleanly
    Tool: Bash (vitest)
    Preconditions: Test with array of 20 long sentences that exceed budget
    Steps:
      1. Run: vitest run src/lib/suggestions/__tests__/fewShot.test.ts
      2. Verify truncation test passes — no mid-sentence cut in output
    Expected Result: Output ends with complete sentence, within budget
    Evidence: .sisyphus/evidence/task-2-truncation-test.txt
  ```

  **Commit**: YES
  - Message: `fix(prompt): improve buildFewShotContextBlock with style guidance and safe truncation`
  - Files: `src/lib/suggestions/voiceProfile.ts`, `src/lib/suggestions/__tests__/fewShot.test.ts`
  - Pre-commit: `vitest run src/lib/suggestions/__tests__/fewShot.test.ts`

---

- [ ] 3. Skip Pass2 refinement when few-shot examples are active

  **What to do**:
  - **TDD RED phase**: Add tests to `llm.test.ts` and/or `fewShot.test.ts`:
    - Test that `twoPassRewrite` calls `adapter.complete` exactly ONCE (not twice) when `fewShotExamples` is provided
    - Test that `twoPassRewrite` still calls `adapter.complete` TWICE when `fewShotExamples` is undefined (regression)
    - Test that `generateAlternativeSuggestions` Pass2 refinement loop (lines 326-342) is SKIPPED when `fewShotExamples` is provided
    - Test that `generateAlternativeSuggestions` Pass2 still runs when `fewShotExamples` is undefined (regression)
  - **TDD GREEN phase**: Modify `llm.ts`:
    - In `twoPassRewrite` (lines 147-179): Add condition — if `fewShotExamples && fewShotExamples.length > 0`, return `pass1Payload` directly without calling Pass2. Keep the existing Pass2 path unchanged for non-few-shot.
    - In `generateAlternativeSuggestions` (lines 326-342): Add same condition — if `fewShotExamples && fewShotExamples.length > 0`, skip the `refined = await Promise.all(finalSafe.map(...))` Pass2 loop and return `finalSafe` directly mapped to `{rewrite, explanation}` format.
  - **TDD REFACTOR**: Clean up, verify all old tests pass

  **Must NOT do**:
  - Do NOT modify `SYSTEM_PROMPT` or `MULTI_SYSTEM_PROMPT` constants
  - Do NOT change `buildUserPrompt` or `buildMultiUserPrompt` function signatures or non-few-shot logic
  - Do NOT change temperature values for existing non-few-shot paths
  - Do NOT change `parseRewritePayload` or `parseMultiAlternativesPayload`
  - Do NOT change `applyGuardrails` usage
  - Do NOT change the `LlmSuggestionService.suggest()` method (it doesn't use fewShot)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Must carefully modify two code paths (twoPassRewrite + generateAlternativeSuggestions) without breaking non-few-shot behavior; mock-based testing requires attention to call count assertions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References** (CRITICAL):

  **Pattern References**:
  - `src/lib/suggestions/llm.ts:147-179` — `twoPassRewrite` function. Pass1 at line 153 (temp 0.7), Pass2 at line 164 (temp 0.85). The few-shot skip should be between line 162 (after `pass1Payload` validation) and line 164 (before Pass2 call).
  - `src/lib/suggestions/llm.ts:326-342` — Pass2 refinement loop in `generateAlternativeSuggestions`. The `refined = await Promise.all(finalSafe.map(async (s) => { ... }))` block applies Pass2 to each alternative. The few-shot skip should replace this block with a simple map when fewShot is active.
  - `src/lib/suggestions/llm.ts:49-67` — `buildUserPrompt` showing how `fewShotExamples` is checked (this function is NOT being modified, just referenced for understanding the fewShot parameter flow)

  **Test References**:
  - `src/lib/suggestions/__tests__/llm.test.ts` — existing test file with mock adapter pattern
  - `src/lib/suggestions/__tests__/fewShot.test.ts` — existing few-shot tests using `vi.mock` for adapter

  **WHY Each Reference Matters**:
  - `llm.ts:147-179`: The executor must understand the two-pass flow to know WHERE to insert the skip condition
  - `llm.ts:326-342`: This is the **most likely code path to miss** (Metis flagged this) — it's a SEPARATE Pass2 inside generateAlternativeSuggestions
  - `llm.test.ts / fewShot.test.ts`: The executor needs to follow existing mock patterns (`vi.mock`, `mockComplete.mock.calls.length`) to write call-count assertions

  **Acceptance Criteria**:

  - [ ] `vitest run src/lib/suggestions/__tests__/llm.test.ts` → ALL pass
  - [ ] `vitest run src/lib/suggestions/__tests__/fewShot.test.ts` → ALL pass
  - [ ] When fewShotExamples provided: `twoPassRewrite` calls adapter.complete exactly 1 time
  - [ ] When fewShotExamples NOT provided: `twoPassRewrite` calls adapter.complete exactly 2 times (regression)
  - [ ] When fewShotExamples provided: `generateAlternativeSuggestions` does NOT run Pass2 refinement loop
  - [ ] When fewShotExamples NOT provided: `generateAlternativeSuggestions` runs Pass2 as before (regression)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: twoPassRewrite skips Pass2 with few-shot examples
    Tool: Bash (vitest)
    Preconditions: llm.test.ts has mock-based call count assertions
    Steps:
      1. Run: vitest run src/lib/suggestions/__tests__/llm.test.ts
      2. Verify test "twoPassRewrite calls adapter once with fewShotExamples" passes
      3. Verify test "twoPassRewrite calls adapter twice without fewShotExamples" passes
    Expected Result: Both tests pass — call count differs based on fewShot presence
    Evidence: .sisyphus/evidence/task-3-twopass-skip.txt

  Scenario: generateAlternativeSuggestions skips Pass2 refinement with few-shot
    Tool: Bash (vitest)
    Preconditions: Test covers generateAlternativeSuggestions with mock
    Steps:
      1. Run: vitest run src/lib/suggestions/__tests__/fewShot.test.ts
      2. Verify Pass2 refinement is not called when fewShotExamples active
    Expected Result: No Pass2 calls in alternatives when few-shot active
    Evidence: .sisyphus/evidence/task-3-alternatives-skip.txt

  Scenario: Regression — non-few-shot paths unchanged
    Tool: Bash (npm run test)
    Preconditions: All existing tests unchanged
    Steps:
      1. Run: npm run test
      2. Verify total pass count ≥592
      3. Run: npm run typecheck
      4. Run: npm run lint
    Expected Result: All pass, zero failures, zero new errors
    Evidence: .sisyphus/evidence/task-3-regression.txt
  ```

  **Commit**: YES
  - Message: `fix(llm): skip Pass2 refinement when few-shot examples are active`
  - Files: `src/lib/suggestions/llm.ts`, `src/lib/suggestions/__tests__/llm.test.ts`, `src/lib/suggestions/__tests__/fewShot.test.ts`
  - Pre-commit: `npm run test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, grep for pattern). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck` + `npm run lint` + `npm run test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Run `npm run test:e2e` to verify all 43+ E2E tests still pass. Also run targeted unit tests for each changed module. Verify no regressions.
  Output: `E2E [N/N pass] | Unit [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | VERDICT`

---

## Commit Strategy

| # | Message | Files | Pre-commit |
|---|---------|-------|------------|
| 1 | `fix(extraction): add heading, fragment, reference-section, and definition filters` | extractSentences.ts, extractSentences.test.ts | `vitest run extractSentences.test.ts` |
| 2 | `fix(prompt): improve buildFewShotContextBlock with style guidance and safe truncation` | voiceProfile.ts, fewShot.test.ts | `vitest run fewShot.test.ts` |
| 3 | `fix(llm): skip Pass2 refinement when few-shot examples are active` | llm.ts, llm.test.ts, fewShot.test.ts | `npm run test` |

---

## Success Criteria

### Verification Commands
```bash
npm run test       # Expected: 592+ tests pass, 0 failures
npm run typecheck  # Expected: 0 errors
npm run lint       # Expected: 0 errors, 0 warnings
npm run test:e2e   # Expected: 43+ tests pass
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Extraction from 3 test papers yields ≥3 quality sentences each
- [ ] Few-shot prompt contains explicit style analysis guidance
- [ ] Pass2 skipped when few-shot active (both twoPassRewrite and generateAlternativeSuggestions)
