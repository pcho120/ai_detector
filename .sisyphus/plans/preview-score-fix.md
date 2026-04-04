# Fix: previewScore Always ~100% (String.replace Mismatch)

## TL;DR

> **Quick Summary**: The `previewScore` feature is implemented but broken — every alternative shows ~100% AI score because `String.replace(sentence, rewrite)` silently fails when Sapling's sentence string has minor whitespace/punctuation differences from the original text. Fix by reusing the existing `findSentenceInText` fuzzy-matcher from `spans.ts`.
>
> **Deliverables**:
> - `src/lib/highlights/spans.ts` — export `findSentenceInText`
> - `src/app/api/suggestions/route.ts` — replace `String.replace()` with slice-based replacement using `findSentenceInText`
> - `tests/integration/suggestions-route.test.ts` — add regression test for whitespace-mismatch case
>
> **Estimated Effort**: Quick
> **Parallel Execution**: NO — sequential (3 steps depend on each other)
> **Critical Path**: Task 1 (export) → Task 2 (route fix) → Task 3 (test) → Task 4 (verify)

---

## Context

### Original Request
"모든 문장 suggestion sentence가 100% ai if replaced라고 나오는데 이러면 의미가 없잖아. 어떻게든 overall score를 낮춰야되는거야. 뭐가 문제야"

### Root Cause (Confirmed)

**File**: `src/app/api/suggestions/route.ts`, line 103:
```typescript
const revisedText = body.text.replace(body.sentence, alt.rewrite);
```

`body.sentence` is Sapling's sentence string. It may differ from `body.text` due to:
- Whitespace normalization differences
- Leading/trailing punctuation stripped by Sapling
- Unicode space variants

`String.replace()` requires an **exact** match. When it fails, `revisedText === body.text` (unchanged). Sapling receives the original text → returns the original ~100% score.

**Proof**: `src/lib/highlights/spans.ts` already has `findSentenceInText()` — a two-pass fuzzy matcher with whitespace collapsing and punctuation stripping — precisely because Sapling sentences don't match raw text exactly.

**Why tests didn't catch it**: Tests mock Sapling to always return `0.42`, so the replace failure is invisible at test time. Only real Sapling calls reveal the bug.

### What Must Change

1. **`spans.ts`**: Change `function findSentenceInText` → `export function findSentenceInText` (single-word change)
2. **`route.ts`**: Replace 1 line with a 4-line fuzzy slice replacement
3. **Test**: Add regression test proving whitespace-mismatched sentence still produces a changed `revisedText` (i.e. Sapling is called with different text than the original)

---

## Work Objectives

### Core Objective
Replace the exact-string `replace()` with the existing fuzzy-matcher so that `revisedText` is actually the document with the target sentence swapped, even when Sapling's sentence string has minor whitespace/punctuation differences.

### Concrete Deliverables
- `src/lib/highlights/spans.ts` — `findSentenceInText` exported
- `src/app/api/suggestions/route.ts` — uses `findSentenceInText` + slice instead of `String.replace()`
- `tests/integration/suggestions-route.test.ts` — whitespace-mismatch regression test

### Definition of Done
- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` exits 0 (all tests pass, including new regression test)
- [ ] `bun run build` exits 0

### Must Have
- `findSentenceInText` imported in `route.ts` from `@/lib/highlights/spans`
- If `findSentenceInText` returns `null` (sentence not found in text), fall back gracefully: skip enrichment for that alternative (return `alt` without `previewScore`)
- Existing behavior preserved: if Sapling fails → `alt` returned without `previewScore`

### Must NOT Have
- Do NOT change the function signature of `findSentenceInText`
- Do NOT change any other logic in `spans.ts` (only the `export` keyword addition)
- Do NOT change `generateAlternativeSuggestions` signature
- Do NOT change `handleApply` or any client-side logic
- Do NOT modify `SaplingDetectionAdapter`
- No new utility files — inline the fix directly in `route.ts`

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: Tests-after (regression test added in Task 3)
- **Framework**: vitest

### QA Policy
Agent-executed verification via `bun run test` and `bun run typecheck`.

---

## Execution Strategy

### Sequential Steps

```
Step 1: Export findSentenceInText in spans.ts
Step 2: Fix route.ts (import + slice replacement)
Step 3: Add regression test
Step 4: Typecheck + test run
```

---

## TODOs

- [x] 1. Export `findSentenceInText` from `spans.ts`

  **What to do**:
  - In `src/lib/highlights/spans.ts`, find the line:
    ```
    function findSentenceInText(
    ```
  - Change it to:
    ```
    export function findSentenceInText(
    ```
  - That's the **only** change in this file.

  **Must NOT do**:
  - Do not change anything else in `spans.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `src/lib/highlights/spans.ts:45` — the `function findSentenceInText(` declaration to export

  **Acceptance Criteria**:
  - [ ] `export function findSentenceInText(` appears at line ~45 in `spans.ts`
  - [ ] `bun run typecheck` exits 0

  **QA Scenarios**:
  ```
  Scenario: Export keyword present
    Tool: Bash
    Steps:
      1. grep "export function findSentenceInText" src/lib/highlights/spans.ts
    Expected Result: Line is found (grep exits 0)
    Evidence: terminal output
  ```

  **Commit**: NO (group with Task 2)

---

- [x] 2. Fix `route.ts` — use `findSentenceInText` instead of `String.replace()`

  **What to do**:
  - Add import at top of `src/app/api/suggestions/route.ts`:
    ```typescript
    import { findSentenceInText } from '@/lib/highlights/spans';
    ```
  - Replace lines 99–110 (the `enrichedAlternatives` block) with:
    ```typescript
    const enrichedAlternatives: SuggestionAlternative[] = await Promise.all(
      alternatives.map(async (alt) => {
        if (!adapter) return alt;
        try {
          const match = findSentenceInText(body.text, body.sentence, 0);
          if (!match) return alt;
          const revisedText = body.text.slice(0, match.start) + alt.rewrite + body.text.slice(match.end);
          const result = await adapter.detect(revisedText);
          return { ...alt, previewScore: result.score };
        } catch {
          return alt;
        }
      }),
    );
    ```
  - Key changes:
    - Uses `findSentenceInText` (fuzzy match) instead of `String.replace` (exact match)
    - If match is `null` → return `alt` without `previewScore` (graceful fallback)
    - Slice-based replacement: `text.slice(0, start) + rewrite + text.slice(end)`

  **Must NOT do**:
  - Do not move `findSentenceInText` call inside the `try` — keep it accessible so `null` check happens before the async `adapter.detect()` call
  - Do not change any other route logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `src/app/api/suggestions/route.ts:92–110` — the adapter + enrichment block to replace
  - `src/lib/highlights/spans.ts:45–76` — `findSentenceInText` signature: `(text: string, sentence: string, fromIndex: number) => { start: number; end: number } | null`

  **Acceptance Criteria**:
  - [ ] `import { findSentenceInText }` present in `route.ts`
  - [ ] No `body.text.replace(` in `route.ts`
  - [ ] `findSentenceInText(body.text, body.sentence, 0)` call present
  - [ ] Null guard `if (!match) return alt;` present
  - [ ] `bun run typecheck` exits 0

  **QA Scenarios**:
  ```
  Scenario: No exact-replace call remains
    Tool: Bash
    Steps:
      1. grep "\.replace(body\.sentence" src/app/api/suggestions/route.ts
    Expected Result: grep exits 1 (no match — old code gone)
    Evidence: terminal output

  Scenario: findSentenceInText import present
    Tool: Bash
    Steps:
      1. grep "findSentenceInText" src/app/api/suggestions/route.ts
    Expected Result: At least 2 lines found (import + usage)
    Evidence: terminal output
  ```

  **Commit**: YES (with Task 1)
  - Message: `fix(suggestions): use fuzzy sentence match for previewScore revisedText`
  - Files: `src/lib/highlights/spans.ts`, `src/app/api/suggestions/route.ts`
  - Pre-commit: `bun run typecheck`

---

- [x] 3. Add regression test: whitespace-mismatch sentence still changes `revisedText`

  **What to do**:
  - In `tests/integration/suggestions-route.test.ts`, in the `describe('POST /api/suggestions — previewScore enrichment')` block, add a new test:

  ```typescript
  it('previewScore uses fuzzy-matched replacement when sentence has whitespace mismatch', async () => {
    process.env.COACHING_LLM_API_KEY = 'test-key';
    process.env.SAPLING_API_KEY = 'sapling-key';

    // Text has double-space before second sentence — Sapling normalizes to single space
    const textWithExtraSpace = 'In conclusion, the experiment shows improved outcomes.  Furthermore, the data supports this hypothesis.';
    const saplingNormalizedSentence = 'In conclusion, the experiment shows improved outcomes.'; // single-space normalized

    let capturedDetectText = '';
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === SAPLING_URL) {
        const body = JSON.parse((init as RequestInit & { body: string }).body) as { text: string };
        capturedDetectText = body.text;
        return Promise.resolve({
          ok: true,
          json: async () => ({ score: 0.42, sentence_scores: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => openaiMultiResponse([
          { rewrite: 'The experiment consistently demonstrated improved outcomes.', explanation: 'Direct empirical claim.' },
          { rewrite: 'Results from the experiment showed consistent improvement.', explanation: 'More concise framing.' },
        ]),
      });
    }));

    const req = buildSuggestionRequest({
      text: textWithExtraSpace,
      sentenceIndex: 0,
      sentence: saplingNormalizedSentence,
      score: 0.9,
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as SuggestionAvailableResponse;
    expect(body.available).toBe(true);

    // The critical assertion: Sapling must have received a DIFFERENT text than the original
    expect(capturedDetectText).not.toBe(textWithExtraSpace);
    // And it must contain the rewrite, not the original sentence
    expect(capturedDetectText).toContain('The experiment consistently demonstrated improved outcomes.');
    expect(capturedDetectText).not.toContain('In conclusion, the experiment shows improved outcomes.');

    for (const alt of body.alternatives) {
      expect(typeof alt.previewScore).toBe('number');
    }

    delete process.env.SAPLING_API_KEY;
  });
  ```

  **Must NOT do**:
  - Do not remove or change any existing tests
  - Do not add this outside the `previewScore enrichment` describe block

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 2

  **References**:
  - `tests/integration/suggestions-route.test.ts:963–1001` — the existing `previewScore enrichment` describe block to add test inside
  - `tests/integration/suggestions-route.test.ts:21–37` — `buildRoutedFetchMock` helper pattern (reference for mock structure)
  - `src/lib/highlights/spans.ts:19–21` — `collapseWhitespace` to understand what "fuzzy match" means

  **Acceptance Criteria**:
  - [ ] New test present in `describe('POST /api/suggestions — previewScore enrichment')`
  - [ ] `bun run test tests/integration/suggestions-route.test.ts` exits 0 (all tests pass)

  **QA Scenarios**:
  ```
  Scenario: All tests pass
    Tool: Bash
    Steps:
      1. bun run test tests/integration/suggestions-route.test.ts
    Expected Result: Exit 0, all tests pass (including new regression test)
    Evidence: terminal output showing test count and PASS
  ```

  **Commit**: YES
  - Message: `test(suggestions): add regression test for fuzzy sentence replacement in previewScore`
  - Files: `tests/integration/suggestions-route.test.ts`
  - Pre-commit: `bun run test tests/integration/suggestions-route.test.ts`

---

- [x] 4. Final verification

  **What to do**:
  - Run `bun run typecheck` — must exit 0
  - Run `bun run test` — must exit 0, all tests pass
  - Run `bun run build` — must exit 0

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Blocked By**: Tasks 1, 2, 3

  **Acceptance Criteria**:
  - [ ] `bun run typecheck` → exit 0
  - [ ] `bun run test` → all tests pass
  - [ ] `bun run build` → exit 0

  **QA Scenarios**:
  ```
  Scenario: Full verification
    Tool: Bash
    Steps:
      1. bun run typecheck && bun run test && bun run build
    Expected Result: All three commands exit 0
    Evidence: terminal output
  ```

  **Commit**: NO

---

## Final Verification Wave

- [x] F1. **Scope check** — confirm `body.text.replace(body.sentence` is gone, `findSentenceInText` is used, null guard present, all tests pass.

---

## Success Criteria

```bash
grep "export function findSentenceInText" src/lib/highlights/spans.ts  # Found
grep -c "findSentenceInText" src/app/api/suggestions/route.ts          # ≥ 2
grep "\.replace(body\.sentence" src/app/api/suggestions/route.ts       # Not found (exit 1)
bun run typecheck                                                        # Exit 0
bun run test                                                             # All pass
bun run build                                                            # Exit 0
```
