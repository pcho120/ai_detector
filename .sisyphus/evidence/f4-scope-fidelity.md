# F4 — Scope Fidelity Check (Re-run)

**Date**: 2026-04-02  
**Verdict**: ❌ REJECT

> This is a fresh re-run. The prior 2026-03-30 entry found no violations. The current implementation has changed materially since that review.

---

## 1. Must Have — Checklist

Each item mapped to plan (`.sisyphus/plans/ai-detect-essay-app.md:64-73`).

| # | Must Have Requirement | Status | Evidence |
|---|----------------------|--------|---------|
| MH-1 | Max upload size: **5 MB** | ✅ PRESENT | `src/lib/files/validate.ts:3` — `MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024`; enforced at line 53 |
| MH-2 | Max extracted text: **100,000 characters** | ✅ PRESENT | `src/lib/files/docx.ts:5` — `MAX_TEXT_LENGTH = 100_000`; `src/lib/files/doc.ts:15` — same constant; enforced in both extractors |
| MH-3 | Min extracted text: **300 characters** | ✅ PRESENT | `src/lib/files/docx.ts:4` — `MIN_TEXT_LENGTH = 300`; `src/lib/files/doc.ts:14` same; enforced in both extractors |
| MH-4 | MIME + magic-byte validation before extraction | ✅ PRESENT | `src/lib/files/validate.ts:18-88` — DOCX magic `PK\x03\x04`, DOC magic `D0 CF 11 E0...`; per-extension MIME allowlist |
| MH-5 | Immediate temp-file cleanup with `try/finally` | ✅ PRESENT | `src/lib/files/temp.ts:43-54` — `withTempFile` uses `try/finally`; route `api/analyze/route.ts:64-82` wraps extraction in `withTempFile` |
| MH-6 | Sentence-level highlight spans as character offsets | ✅ PRESENT | `src/lib/highlights/spans.ts:6-11` — `HighlightSpan { start, end, score, label, sentenceIndex }` |
| MH-7 | UI wording: **risk review / AI-like phrasing risk**, never definitive cheating claims | ✅ PRESENT | `ReviewPanel.tsx:231,236` — "High AI-like phrasing risk (Score: X%)" / "Medium AI-like phrasing risk"; no "cheating detected" found in UI files; PRIVACY.md line 24: "not a definitive proof of origin" |
| MH-8 | Suggestions focus on specificity, evidence, personal framing, sentence naturalness | ✅ PRESENT (rule-based service) | `src/lib/suggestions/rule-based.ts:10-70` — 12 coaching rules address formulaic phrases, filler, vague quantifiers. However: `llm.ts` suggestions are full rewrites (see scope-creep section) |
| MH-9 | No database, no session history, no persistent storage | ✅ PRESENT | No DB imports anywhere in `src/`; stateless routes; PRIVACY.md explicit |

**Result: 9/9 Must Have items confirmed present.**

---

## 2. Must NOT Have — Checklist

Each item mapped to plan (`.sisyphus/plans/ai-detect-essay-app.md:75-81`).

| # | Must NOT Have Requirement | Status | Evidence |
|---|--------------------------|--------|---------|
| MNH-1 | Must NOT give detector-evasion tactics or promise lower detection likelihood | ⚠️ BORDERLINE | Direct evasion language is blocked by `guardrails.ts`. However, the combination of `/api/analyze/revised` + apply-replacement workflow creates an evasion feedback loop (upload → rewrite → rescore → iterate). No single piece promises evasion but the system as a whole enables it. Logged as scope-creep concern. |
| MNH-2 | Must NOT auto-rewrite the original file or overwrite user content | ✅ ABSENT | No file overwrite occurs. However, `/api/suggestions` now returns **full sentence replacements** (complete grammatically correct sentences from LLM), and the UI `APPLY` button substitutes them into the text for re-scoring. This is not original-file overwrite, but it IS a rewrite-in-place of user content in the analysis session. |
| MNH-3 | Must NOT add login, payments, user history, plagiarism checks, analytics, or provider-switching UI | ✅ ABSENT | No auth/analytics/history/payments/plagiarism/provider-switching found. Grep confirms zero matches for `login`, `auth`, `analytics`, `gtag`, `stripe`, `payment`. |
| MNH-4 | Must NOT support PDF, `.rtf`, `.odt`, paste-only input, or batch uploads | ✅ ABSENT | `validate.ts:5` — only `.docx`, `.doc` supported. Input `accept` in `page.tsx:100` restricts correctly. No paste or batch UI. |
| MNH-5 | Must NOT use `dangerouslySetInnerHTML` for highlight rendering | ✅ ABSENT | Grep of all `.tsx` files: zero matches. JSX array-slicing used. |
| MNH-6 | Must NOT log essay text to console, telemetry, or third-party error tracking | ✅ ABSENT | Zero `console.log` in `src/`. No telemetry SDKs in package. |

**Result: 6/6 Must NOT Have items technically absent, but MNH-1 and MNH-2 have functional scope-creep violations through new unscoped features (see Section 3).**

---

## 3. Scope Creep Violations (BLOCKING)

These are features present in the current implementation that were explicitly excluded from v1 or directly contradict plan constraints.

### VIOLATION SC-1: `/api/suggestions` — On-Demand LLM Full-Sentence Rewrite Endpoint (BLOCKING)

**File**: `src/app/api/suggestions/route.ts`  
**Feature**: Accepts `{ sentence, sentenceIndex, score, voiceProfile }` and calls `generateAlternativeSuggestions()` in `llm.ts` to produce up to 3 **full replacement sentences** via OpenAI `gpt-4o-mini`.

**Plan constraint violated**:
- Task 9 Must NOT: "Must NOT generate whole-paragraph replacements" — the LLM generates complete grammatically correct sentences (`SYSTEM_PROMPT:24-25`: "rewrite must be a complete, grammatically correct replacement sentence, not a coaching hint"). This is a full sentence rewrite, explicitly banned.
- Task 9 Must NOT: "Must NOT promise lower detection risk" — iterating apply→rescore→apply enables score reduction without any explicit promise, but the mechanism exists.
- Plan interview summary: "Safety scope: no detector-evasion guidance, no auto-edit of original file" — the apply-and-rescore cycle constitutes guided automated editing.

**Why blocking**: The rule-based coaching service (`rule-based.ts`) was the compliant v1 implementation. `llm.ts` + `/api/suggestions` introduces an out-of-scope full-rewrite pathway.

---

### VIOLATION SC-2: `/api/analyze/revised` — Re-scoring of Arbitrarily Edited Text (BLOCKING)

**File**: `src/app/api/analyze/revised/route.ts`  
**Feature**: Accepts raw text (no file), calls the Sapling detector, returns a new analysis. Bypasses file validation entirely.

**Plan constraint violated**:
- The plan defines one flow: upload Word file → extract → detect → return. No "re-analyze edited text without uploading a file" flow is anywhere in Tasks 1-10.
- This endpoint accepts arbitrary text — a user could paste text, detectors be damned. The plan explicitly excluded paste-only input (Must NOT Have MNH-4).
- Combined with SC-1, this creates a score-reduction feedback loop, which constitutes the functional equivalent of "detector-evasion guidance."

**Why blocking**: No plan task authorized a text-only re-analysis endpoint. It is an unscoped feature that enables an evasion workflow.

---

### VIOLATION SC-3: Voice Profile Feature — Fully Unscoped (BLOCKING)

**Files**:
- `src/app/api/voice-profile/generate/route.ts` — LLM-backed voice profile generation
- `src/lib/suggestions/voiceProfile.ts` — voice profile utilities, Korean language support
- `src/components/VoiceProfilePanel.tsx` — UI panel for preset selection and writing samples

**Feature**: Generates a prose description of the user's writing style from presets and/or a pasted writing sample, stores it client-side, and injects it into rewrite prompts.

**Plan constraint violated**:
- Zero mention of "voice profile" in the plan anywhere.
- The panel collects user-provided writing samples ("paste a sample of your writing here") — this is a form of paste-only input (MNH-4: Must NOT support paste-only input).
- The feature adds UI complexity (header section, textarea, preset buttons) beyond the Upload → Analyze → Review flow.
- The Korean language prompts (`당신의 목소리는`, `감지 회피나 AI 점수에 대한 언급은 절대 하지 마세요`) indicate multi-language support was introduced, while the plan's English-only constraint (Must Have) is technically preserved in the main analysis pipeline but the suggestion/profile system now operates in Korean too.

**Why blocking**: Entirely out-of-scope feature. No plan task authorizes it. Renders the app materially different from the specified v1 deliverable.

---

### VIOLATION SC-4: Revised Review Panel and Apply-Replacement Workflow (BLOCKING)

**Files**:
- `src/components/RevisedReviewPanel.tsx` — second analysis panel
- `src/app/useRevisedAnalysisState.ts` + `src/lib/review/revisedAnalysisReducer.ts` — complex state management for revised analysis

**Feature**: After analysis, users can click highlighted sentences, request LLM rewrites, apply them inline, and see a side-by-side re-scored "Revised Analysis" panel.

**Plan constraint violated**:
- Task 8 scope: "Upload page, analysis route, and result view" — no "apply rewrite + rescore" workflow.
- Task 9 Must NOT: "Must NOT generate whole-paragraph replacements" — this workflow applies sentence-by-sentence full rewrites and re-analyzes.
- The "revised analysis" state machine (`revisedAnalysisReducer.ts`, 330 lines) is a substantial feature with apply/revert/rescore. No plan task authorized it.

**Why blocking**: Implements a rewrite-apply-rescore iteration loop that is structurally equivalent to the evasion coaching the plan explicitly prohibited.

---

### CONCERN SC-5: `analyzeText.ts` No Longer Calls SuggestionService (Scope Loss)

**File**: `src/lib/analysis/analyzeText.ts:31` — `suggestions: []` hardcoded.

**Issue**: The main analysis pipeline always returns `suggestions: []`. The `RuleBasedSuggestionService` is never called from the analysis route. Suggestions only arrive via the separate on-demand `/api/suggestions` route which uses the LLM, not the rule-based service.

**Plan constraint**: Task 9 requirement: "Wire the concrete service into the analysis route and attach suggestions to the corresponding sentence IDs for UI rendering." This linkage was broken.

**Severity**: Medium — the original coaching functionality exists in `rule-based.ts` but is disconnected. Not a hard Must Have failure (Must Have #8 requires the service exist and focus on coaching, which it does), but the architectural intent was violated.

---

### CONCERN SC-6: README Documents Out-of-Scope Features

**File**: `README.md:10`  
> "**Rewritten Suggestions**: On-demand full-sentence rewrites for any highlighted span; requires both `SAPLING_API_KEY` and `COACHING_LLM_API_KEY`."

**Issue**: This explicitly advertises the out-of-scope full-sentence-rewrite feature. The plan's Task 10 Must NOT says: "Must NOT document unsupported promises such as '100% accurate detection.'" While this constraint targets accuracy promises, the spirit requires docs reflect the actual scoped v1 feature set.

**Severity**: Medium — the violation is in the underlying features, not the documentation.

---

## 4. UI Wording Compliance

### Risk-Review Framing

| Location | Wording | Compliant? |
|----------|---------|-----------|
| `ReviewPanel.tsx:231` | `"High AI-like phrasing risk (Score: X%)"` | ✅ Yes |
| `ReviewPanel.tsx:236` | `"Medium AI-like phrasing risk (Score: X%)"` | ✅ Yes |
| `ReviewPanel.tsx:289` | `(score * 100).toFixed(1)}% AI` | ✅ Yes — probabilistic |
| `page.tsx:89` | `"Upload your essay to analyze it for AI-generated phrasing."` | ✅ Yes |
| `PRIVACY.md:24` | `"AI-like phrasing risk review, not a definitive proof of origin"` | ✅ Yes |

### Anti-Evasion Framing

| Location | Wording | Compliant? |
|----------|---------|-----------|
| `guardrails.ts:15-26` | Bans `avoid detection`, `bypass`, `undetectable`, etc. | ✅ Yes (code-level) |
| LLM system prompts (`llm.ts:22-30`) | "Do NOT mention AI detection, evasion, or scores" | ✅ Yes (prompt-level) |
| Voice profile prompts (`voiceProfile.ts:100`) | "Do NOT mention AI detection, evasion, or scores" | ✅ Yes (prompt-level) |

Wording is technically compliant. The violations are behavioral/architectural, not linguistic.

---

## 5. Summary

| Category | Result |
|----------|--------|
| Must Have (9 items) | ✅ All 9 Present |
| Must NOT Have (6 items) | ⚠️ Nominally absent but functionally circumvented by SC-1/SC-2/SC-4 |
| UI Risk-Review Framing | ✅ Compliant |
| Anti-Evasion Wording | ✅ Compliant (text-level) |
| Scope Creep — Blocking | ❌ 4 violations (SC-1 through SC-4) |
| Scope Loss | ⚠️ 1 concern (SC-5: rule-based service disconnected) |

---

## VERDICT: **REJECT**

### Reason

Four unscoped features have been added that collectively violate the plan's core safety and scope constraints:

1. **SC-1** (`/api/suggestions` + `LlmSuggestionService`): LLM produces full sentence replacements, explicitly banned in Task 9.
2. **SC-2** (`/api/analyze/revised`): Accepts raw text without file upload (banned in MNH-4), enables a rewrite→rescore evasion loop.
3. **SC-3** (Voice Profile feature): Fully unscoped — not in any plan task. Introduces paste-only text input (MNH-4) and language support beyond English-only analysis.
4. **SC-4** (RevisedReviewPanel + apply-replacement workflow): Unscoped rewrite-apply-rescore iteration loop structurally equivalent to evasion coaching.

### Required Fixes

To achieve APPROVE:

1. Remove `/api/suggestions` route and `LlmSuggestionService` or restrict rewrite output to coaching hints only (matching the rule-based service contract).
2. Remove `/api/analyze/revised` route and all associated state management (`RevisedReviewPanel`, `useRevisedAnalysisState`, `revisedAnalysisReducer`).
3. Remove `/api/voice-profile/generate` route and `VoiceProfilePanel` component and `voiceProfile.ts` utilities.
4. Re-wire `analyzeText.ts` to call `RuleBasedSuggestionService` and return coaching suggestions in the main analysis response (restoring SC-5).
5. Update `README.md` to remove references to on-demand rewrites and voice profiles.
