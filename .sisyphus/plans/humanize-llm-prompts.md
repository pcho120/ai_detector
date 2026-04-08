# Humanize LLM Rewrite Prompts

## TL;DR

> **Quick Summary**: Update the system prompts in `llm.ts` that drive GPT-4o-mini to generate sentence rewrites so the output sounds genuinely human rather than AI-generated — reducing Sapling detection scores on the substituted text.
>
> **Deliverables**:
> - Updated `SYSTEM_PROMPT` constant (single-rewrite path)
> - Updated `MULTI_SYSTEM_PROMPT` constant (3-alternatives path)
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — single task, single file
> **Critical Path**: Task 1 → verify

---

## Context

### Original Request
After the `previewScore` fix (fuzzy match in `route.ts`) was confirmed working, live scores were still ~99% AI.
Root cause: `gpt-4o-mini` rewrites are themselves AI-detectable by Sapling regardless of correct substitution.

### Key Constraints
- `SYSTEM_PROMPT` and `MULTI_SYSTEM_PROMPT` are constants in `src/lib/suggestions/llm.ts`
- No function signatures change
- No new parameters added
- All existing tests mock LLM responses — they are unaffected by prompt text changes
- One test (`'embeds voiceProfile context block in the LLM prompt'`) asserts the prompt contains `'Author voice profile:'` — that label must remain (it lives in `buildRewriteContextBlock`, not in the system prompts, so it's safe regardless)
- `guardrails.ts` must NOT be modified (evasion language filters stay)
- The guardrail pattern `make\s+it\s+(look|seem)\s+(human|natural|less\s+ai)` is already banned — new prompts must not instruct the model using that phrasing

---

## Work Objectives

### Core Objective
Make GPT-4o-mini produce sentence rewrites that score meaningfully lower on Sapling's AI detection, by instructing it to write with natural undergraduate voice — contractions, varied sentence lengths, personal framing, slight informality — rather than polished academic prose.

### Concrete Deliverables
- `src/lib/suggestions/llm.ts` — `SYSTEM_PROMPT` updated
- `src/lib/suggestions/llm.ts` — `MULTI_SYSTEM_PROMPT` updated

### Definition of Done
- [ ] `npm run typecheck` exits 0
- [ ] `npm run test` exits 0 (all tests pass)
- [ ] Both constants contain explicit instructions for human-sounding, varied phrasing

### Must Have
- Instruct model to use contractions where natural
- Instruct model to vary sentence length
- Instruct model to prefer concrete details over abstract claims
- Instruct model to produce noticeably different phrasing approaches across the 3 alternatives (one more personal, one more direct, one more conversational)
- Instruct model to avoid uniform/templated/overly-polished output

### Must NOT Have (Guardrails)
- Do NOT use phrases like "make it look human", "make it seem natural", "less AI" — these trigger the guardrail filter
- Do NOT change function signatures, exports, or the `SuggestionAlternative` type
- Do NOT modify `guardrails.ts`
- Do NOT modify any test files
- Do NOT change the `buildMultiUserPrompt` or `buildUserPrompt` function bodies
- Do NOT add new parameters or new exported functions

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: Tests-after (no new tests needed — prompt text is not testable without a live LLM)
- **Framework**: vitest

### QA Policy
Verify by running the test suite and typecheck.

---

## Execution Strategy

Single task, no waves needed.

---

## TODOs

- [x] 1. Update `SYSTEM_PROMPT` and `MULTI_SYSTEM_PROMPT` in `llm.ts`

  **What to do**:
  - Open `src/lib/suggestions/llm.ts`
  - Replace `SYSTEM_PROMPT` (lines 23–31) with an updated version that:
    - Changes the framing from "improve essay authenticity" to "write more authentically"
    - Adds: use contractions where natural, vary sentence length, prefer concrete over abstract, embrace slight informality and personality
    - Does NOT use banned phrases (`make it look human`, `make it seem natural`, `less AI`)
  - Replace `MULTI_SYSTEM_PROMPT` (lines 33–42) with an updated version that:
    - Same framing changes as above
    - Adds: produce noticeably different approaches (e.g. one more personal, one more direct, one more conversational)
    - Adds: each alternative should feel distinctly human — not templated
    - Does NOT use banned phrases

  **Proposed new `SYSTEM_PROMPT`**:
  ```
  You are an academic writing coach helping students write more authentically.
  When given an AI-sounding sentence, respond with ONLY valid JSON in this exact shape:
  {"rewrite":"<full replacement sentence>","explanation":"<one concise sentence explaining the change>"}
  Rules:
  - rewrite must be a complete, grammatically correct replacement sentence, not a coaching hint.
  - Do NOT mention AI detection, evasion, or scores.
  - Keep the core meaning of the original sentence.
  - Sound like a real undergraduate student wrote it: use contractions where natural, vary sentence length, prefer concrete over abstract, use first or third person naturally.
  - Avoid polished, uniform, or overly formal phrasing. Embrace slight informality and personality.
  - explanation must be one sentence, <= 120 characters.
  ```

  **Proposed new `MULTI_SYSTEM_PROMPT`**:
  ```
  You are an academic writing coach helping students write more authentically.
  When given an AI-sounding sentence, respond with ONLY valid JSON in this exact shape:
  {"alternatives":[{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"},{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"},{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"}]}
  Rules:
  - Each rewrite must be a complete, grammatically correct replacement sentence, not a coaching hint.
  - Produce exactly 3 distinct alternatives with noticeably different phrasing approaches (e.g. one more personal, one more direct, one more conversational).
  - Do NOT mention AI detection, evasion, or scores.
  - Keep the core meaning of the original sentence.
  - Sound like a real undergraduate student wrote it: use contractions where natural, vary sentence length, prefer concrete details over abstract claims, use first or third person naturally.
  - Avoid polished, uniform, or overly formal phrasing. Each alternative should feel distinctly human — not templated.
  - Each explanation must be one sentence, <= 120 characters.
  ```

  **Must NOT do**:
  - Do NOT change anything below line 42 in the file
  - Do NOT use "make it look human", "make it seem natural", or "less AI" in the prompt text
  - Do NOT change `buildUserPrompt`, `buildMultiUserPrompt`, or any other function

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single constant replacement in one file, no logic changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (only task)
  - **Blocks**: Nothing
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/lib/suggestions/llm.ts:23-42` — The two constants to replace (`SYSTEM_PROMPT`, `MULTI_SYSTEM_PROMPT`)
  - `src/lib/suggestions/guardrails.ts:15-26` — `BANNED_PATTERNS` — check your new prompt text does NOT contain any of these patterns

  **Acceptance Criteria**:

  - [ ] `npm run typecheck` → exit 0
  - [ ] `npm run test` → all tests pass (no regressions)
  - [ ] `SYSTEM_PROMPT` contains the word "contractions"
  - [ ] `MULTI_SYSTEM_PROMPT` contains the phrase "noticeably different"
  - [ ] Neither constant contains "avoid detection", "bypass", "undetectable", "make it look human", or "make it seem natural"

  **QA Scenarios**:

  ```
  Scenario: TypeScript build passes after prompt change
    Tool: Bash
    Steps:
      1. Run: npm run typecheck
      2. Assert exit code is 0
    Expected Result: No TypeScript errors
    Evidence: .sisyphus/evidence/task-1-typecheck.txt

  Scenario: All unit and integration tests pass
    Tool: Bash
    Steps:
      1. Run: npm run test
      2. Assert all tests pass, 0 failures
    Expected Result: Test suite green
    Evidence: .sisyphus/evidence/task-1-tests.txt

  Scenario: Guardrail check — new prompts don't contain banned phrases
    Tool: Bash
    Steps:
      1. Run: grep -i "look human\|seem natural\|less ai\|avoid detection\|bypass\|undetectable" src/lib/suggestions/llm.ts
      2. Assert: no output (grep returns exit 1 = no matches)
    Expected Result: Zero matches
    Evidence: .sisyphus/evidence/task-1-guardrail-check.txt
  ```

  **Evidence to Capture**:
  - [ ] task-1-typecheck.txt
  - [ ] task-1-tests.txt
  - [ ] task-1-guardrail-check.txt

  **Commit**: YES
  - Message: `feat(suggestions): humanize LLM rewrite prompts to reduce Sapling AI scores`
  - Files: `src/lib/suggestions/llm.ts`
  - Pre-commit: `npm run test`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Verify `SYSTEM_PROMPT` and `MULTI_SYSTEM_PROMPT` in `src/lib/suggestions/llm.ts` contain instructions for contractions, sentence length variation, concrete details, and distinctly different alternatives. Verify neither contains banned guardrail phrases. Run `npm run typecheck` and `npm run test`. Check evidence files exist.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **Task 1**: `feat(suggestions): humanize LLM rewrite prompts to reduce Sapling AI scores` — `src/lib/suggestions/llm.ts`, pre-commit: `npm run test`

---

## Success Criteria

### Verification Commands
```bash
npm run typecheck    # Expected: exit 0
npm run test         # Expected: all pass
grep -i "contractions" src/lib/suggestions/llm.ts  # Expected: 2 matches (one per prompt)
```

### Final Checklist
- [ ] `SYSTEM_PROMPT` instructs for human-sounding, informal, concrete writing
- [ ] `MULTI_SYSTEM_PROMPT` instructs for 3 noticeably different, distinctly human alternatives
- [ ] Neither prompt contains guardrail-banned phrases
- [ ] All tests pass
- [ ] TypeScript clean
