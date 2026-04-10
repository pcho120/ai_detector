# LLM Rewrite Improvements

## TL;DR

> **Quick Summary**: Upgrade Claude model to latest Sonnet, implement 2-pass rewrite strategy with optimized temperatures, and improve prompts to produce more natural human-sounding output.
>
> **Deliverables**:
> - Updated model: `claude-sonnet-4-6-20260401` in `anthropic.ts`
> - 2-pass rewrite logic in `llm.ts` (pass 1: temp 0.7, pass 2: temp 0.85)
> - Improved system prompts focused on natural human writing patterns
>
> **Estimated Effort**: Short
> **Parallel Execution**: NO - sequential (tasks depend on each other's contracts)
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request
- AI detection scores not going down after rewriting sentences
- Model was `claude-haiku-4-5-20251001` — underpowered for nuanced rewriting
- Single-pass rewrite at low temperature produces predictable, AI-like output
- Prompts were too abstract ("write like a thoughtful undergraduate")

### Key Decisions
- **Model**: Hard-code `claude-sonnet-4-6-20260401` in adapter (no env var, no Settings UI change)
- **Temperature**: Pass 1 = `0.7` (stable rewrite), Pass 2 = `0.85` (add naturalness)
- **2-pass scope**: Apply to both single suggestion AND multi-alternatives flows
- **Prompt style**: Based on user-provided examples — conversational, varied structure, less "perfect"

---

## Work Objectives

### Core Objective
Make LLM rewrites produce text that scores lower on AI detectors by upgrading the model, using a 2-pass rewrite strategy, and improving prompt specificity.

### Concrete Deliverables
- `src/lib/suggestions/adapters/anthropic.ts` — model updated
- `src/lib/suggestions/llm.ts` — 2-pass logic + improved prompts

### Must Have
- 2-pass rewrite: pass 1 output feeds into pass 2 as input
- Pass 1 temp = `0.7`, Pass 2 temp = `0.85`
- Prompts explicitly instruct: informal tone, varied sentence length, conversational style, less "perfect"
- Both single (`generateSingleSuggestionWithProvider`) and multi (`generateAlternativeSuggestions`) flows use 2-pass

### Must NOT Have
- No changes to Settings UI or `AppSettings` type
- No new env variables
- No changes to `.env.local`
- No changes to API route files
- No changes to detection logic

---

## TODOs

- [x] 1. Update Claude model in anthropic adapter

  **What to do**:
  - In `src/lib/suggestions/adapters/anthropic.ts` line 23, change model from `claude-haiku-4-5-20251001` to `claude-sonnet-4-6-20260401`
  - Update the JSDoc comment on line 7 to reflect the new model name

  **Must NOT do**:
  - Do not add env variable fallback
  - Do not touch constructor, error handling, or any other logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 2 (model must be updated before testing rewrite flows)
  - **Blocked By**: None

  **References**:
  - `src/lib/suggestions/adapters/anthropic.ts:23` — line to change
  - Current value: `'claude-haiku-4-5-20251001'`
  - New value: `'claude-sonnet-4-6-20260401'`

  **Acceptance Criteria**:
  - [ ] `grep -r "claude-haiku" src/` returns no results
  - [ ] `grep -r "claude-sonnet-4-6" src/lib/suggestions/adapters/anthropic.ts` returns a match
  - [ ] `npm run typecheck` passes

  **Commit**: YES
  - Message: `feat(llm): upgrade claude model to sonnet-4-6`
  - Files: `src/lib/suggestions/adapters/anthropic.ts`

---

- [x] 2. Improve prompts in llm.ts

  **What to do**:
  - Replace `SYSTEM_PROMPT` (single rewrite) with the following:

  ```
  You are a writing assistant that rewrites sentences to sound like they were written by a real person, not an AI.

  Respond with ONLY valid JSON in this exact shape:
  {"rewrite":"<full replacement sentence>","explanation":"<one concise sentence explaining the change>"}

  Rules:
  - rewrite must be a complete, grammatically correct replacement sentence.
  - Make the tone slightly informal but still appropriate for academic context.
  - Break any repetitive or predictable patterns from the original.
  - Avoid generic or vague wording — prefer specific, concrete language.
  - Add subtle variation in sentence length and flow.
  - Keep the core meaning intact.
  - Do NOT mention AI detection, evasion, or scores.
  - explanation must be one sentence, <= 120 characters.
  ```

  - Replace `MULTI_SYSTEM_PROMPT` (3 alternatives) with the following:

  ```
  You are a writing assistant that rewrites sentences to sound like they were written by a real person, not an AI.

  Respond with ONLY valid JSON in this exact shape:
  {"alternatives":[{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"},{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"},{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"}]}

  Rules:
  - Each rewrite must be a complete, grammatically correct replacement sentence.
  - Produce exactly 3 alternatives, each with noticeably different phrasing and sentence shape.
  - Make the tone slightly informal but still appropriate for academic context.
  - Break repetitive or predictable patterns — vary structure across all 3 alternatives.
  - Avoid generic or vague wording — use specific, concrete language.
  - Add subtle variation in sentence length and flow within each rewrite.
  - Use a slightly conversational style — not stiff or overly formal.
  - Keep the meaning but make it feel less "perfect" and more human.
  - Do NOT mention AI detection, evasion, or scores.
  - Each explanation must be one sentence, <= 120 characters.
  ```

  - Replace `buildUserPrompt` to:
  ```typescript
  function buildUserPrompt(sentence: string): string {
    return `Rewrite the following sentence to sound like natural human writing:\n\n"${sentence}"`;
  }
  ```
  (remove unused `score` param — check if callers need updating)

  - Replace `buildMultiUserPrompt` base string to:
  ```typescript
  const base = `Rewrite the following sentence so it sounds like it was written by a real person, not an AI. Provide 3 distinct alternatives:\n\n"${sentence}"`;
  ```
  (remove unused `score` param from base — keep voiceProfile logic intact)

  **Must NOT do**:
  - Do not change `parseRewritePayload`, `parseMultiAlternativesPayload`, `applyGuardrails`, or any parsing logic
  - Do not change function signatures visible to callers (route files)
  - Do not remove voiceProfile injection in `buildMultiUserPrompt`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `src/lib/suggestions/llm.ts:17-41` — current SYSTEM_PROMPT, MULTI_SYSTEM_PROMPT, buildUserPrompt, buildMultiUserPrompt
  - `src/lib/suggestions/llm.ts:132-153` — `suggest()` method calling `buildUserPrompt`
  - `src/lib/suggestions/llm.ts:161-191` — `generateSingleSuggestionWithProvider` calling `buildUserPrompt`
  - `src/lib/suggestions/llm.ts:213-273` — `generateAlternativeSuggestions` calling `buildMultiUserPrompt`

  **Acceptance Criteria**:
  - [ ] `npm run typecheck` passes
  - [ ] `npm run lint` passes
  - [ ] `npm run test` passes (prompt changes should not break existing tests — they mock the adapter)

  **Commit**: YES
  - Message: `feat(llm): improve rewrite prompts for more natural human-sounding output`
  - Files: `src/lib/suggestions/llm.ts`

---

- [x] 3. Implement 2-pass rewrite strategy

  **What to do**:

  Extract a helper `twoPassRewrite` in `src/lib/suggestions/llm.ts`:

  ```typescript
  async function twoPassRewrite(
    adapter: LlmAdapter,
    systemPrompt: string,
    sentence: string,
    buildPrompt: (text: string) => string,
  ): Promise<string | null> {
    // Pass 1: stable rewrite (temp 0.7)
    const pass1 = await adapter.complete({
      systemPrompt,
      userPrompt: buildPrompt(sentence),
      temperature: 0.7,
      maxTokens: 256,
    });
    if (!pass1) return null;
    const payload1 = parseRewritePayload(pass1.content);
    if (!payload1) return null;

    // Pass 2: add naturalness to pass 1 output (temp 0.85)
    const pass2 = await adapter.complete({
      systemPrompt,
      userPrompt: buildPrompt(payload1.rewrite),
      temperature: 0.85,
      maxTokens: 256,
    });
    if (!pass2) return null;
    const payload2 = parseRewritePayload(pass2.content);

    // Fall back to pass 1 result if pass 2 fails to parse
    return payload2?.rewrite ?? payload1.rewrite;
  }
  ```

  Update `generateSingleSuggestionWithProvider` to use `twoPassRewrite`:
  - Replace the single `adapter.complete(...)` call with `twoPassRewrite(...)`
  - The final `rewrite` field in the returned `Suggestion` comes from `twoPassRewrite`
  - Keep `explanation` from pass 1 result (pass 2 doesn't generate a new explanation)

  Update `generateAlternativeSuggestions` for multi-pass:
  - For each of the 3 alternatives from `completeMulti` (pass 1, temp 0.7), run a second `adapter.complete` call (temp 0.85) on each rewrite
  - Keep `explanation` from pass 1
  - Use 2-pass result as final `rewrite`
  - `completeMulti` for pass 1 stays at temp 0.7; individual pass 2 calls use `adapter.complete` at temp 0.85
  - Maintain existing recovery/deduplication logic — apply it to pass 1 results, then 2-pass the surviving alternatives

  Update `LlmSuggestionService.suggest()` similarly — apply 2-pass per sentence.

  Remove hardcoded `temperature` values from all existing `adapter.complete` / `adapter.completeMulti` calls that are now replaced by the 2-pass helper.

  **Must NOT do**:
  - Do not change `LlmCompletionRequest` interface or `LlmAdapter` interface
  - Do not change any adapter files (openai.ts, anthropic.ts) beyond Task 1
  - Do not change route files
  - Do not remove the recovery/deduplication path in `generateAlternativeSuggestions`

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 2)
  - **Blocks**: nothing
  - **Blocked By**: Task 2

  **References**:
  - `src/lib/suggestions/llm.ts:117-153` — `LlmSuggestionService.suggest()`
  - `src/lib/suggestions/llm.ts:161-201` — `generateSingleSuggestionWithProvider` and `generateSingleSuggestion`
  - `src/lib/suggestions/llm.ts:213-273` — `generateAlternativeSuggestions` with recovery path
  - `src/lib/suggestions/llm-adapter.ts` — `LlmCompletionRequest` interface (DO NOT CHANGE)
  - `tests/integration/suggestions-route.test.ts` — integration tests that mock the adapter; 2-pass means adapter.complete gets called more times — update call count assertions if needed

  **Acceptance Criteria**:
  - [ ] `npm run typecheck` passes
  - [ ] `npm run test` passes
  - [ ] `npm run lint` passes
  - [ ] Manual smoke test: trigger a suggestion rewrite in the UI — confirm two `adapter.complete` calls happen (add a temporary `console.log` to verify, then remove)

  **Commit**: YES
  - Message: `feat(llm): implement 2-pass rewrite strategy for more natural output`
  - Files: `src/lib/suggestions/llm.ts`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Verify: model updated in anthropic.ts, 2-pass logic present in llm.ts, prompts updated. Check Must NOT Have: no Settings UI changes, no new env vars, no route file changes.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run typecheck && npm run lint && npm run test`. Check for any regressions in suggestions-route tests due to changed call counts.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | VERDICT`

---

## Success Criteria

```bash
npm run typecheck   # Expected: no errors
npm run lint        # Expected: no errors
npm run test        # Expected: all pass
grep -r "claude-haiku" src/   # Expected: no results
grep -r "claude-sonnet-4-6" src/lib/suggestions/adapters/anthropic.ts  # Expected: 1 match
```
