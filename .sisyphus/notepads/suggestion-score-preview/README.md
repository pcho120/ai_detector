# Suggestion Score Preview: Research & Implementation Guidance

This directory contains implementation-ready guidance for Task 1-4 of the Suggestion Score Preview feature.

## Quick Navigation

### 📋 Start Here
- **[RESEARCH-SUMMARY.md](./RESEARCH-SUMMARY.md)** ← Quick reference for all patterns & guardrails

### 🔧 Implementation Guides
- **[route-enrichment-recommendations.md](./route-enrichment-recommendations.md)** ← For Task 2 (route-level enrichment)
- **[sapling-detection-patterns.md](./sapling-detection-patterns.md)** ← For Task 2 (Sapling-specific details)

---

## Document Overview

### RESEARCH-SUMMARY.md
**Purpose**: One-page reference for patterns, error scenarios, and guardrails.

**Contains**:
- 4 core guidance patterns with citations
- Functionality patterns (response shapes, timeouts)
- Error scenario lookup table
- Observability metrics
- External references with URLs
- Guardrails (must-do's & must-not's)

**Read when**: You need a quick answer during implementation (5-10 min read)

---

### route-enrichment-recommendations.md
**Purpose**: Comprehensive guide to route-level enrichment patterns and error handling.

**Contains**:
- Core pattern: independent try-catch per item
- Graceful degradation principles
- Three-layer error handling (route, item, service)
- Response shape contract with examples
- Timeout & deadlock prevention
- Practical implementation checklist
- Observability & monitoring strategy
- Key takeaways for Task 2

**Read when**: You're implementing the route enrichment logic (20 min read)

---

### sapling-detection-patterns.md
**Purpose**: Sapling API reference and integration patterns.

**Contains**:
- Sapling API endpoint & payload reference
- 5 detailed error scenarios with handling code
- Revised text generation rationale
- Per-alternative independence principle
- Comprehensive logging strategy (entry, per-item, success, failure, summary)
- FileProcessingError classification
- Unit & integration test patterns
- External references

**Read when**: You're implementing the Sapling call logic (25 min read)

---

## Usage by Task

### Task 1: Type Update (llm.ts)
**Files to read**: None (this is a type-only change)

**Guidance**: Add `previewScore?: number` to `SuggestionAlternative` interface.

---

### Task 2: Route Enrichment (suggestions/route.ts)
**Files to read in order**:
1. [RESEARCH-SUMMARY.md](./RESEARCH-SUMMARY.md) — Overview (5 min)
2. [route-enrichment-recommendations.md](./route-enrichment-recommendations.md) — Patterns & structure (15 min)
3. [sapling-detection-patterns.md](./sapling-detection-patterns.md) — Sapling specifics (20 min)

**Key concepts**:
- Independent try-catch per alternative
- Graceful degradation (HTTP 200 with partial data)
- Three-layer error handling
- Explicit timeout (5-10s)
- Comprehensive logging

---

### Task 3: UI Update (ReviewPanel.tsx)
**Files to read**: None required

**Guidance**: Conditionally render `(XX.X% AI if replaced)` when `alt.previewScore` is defined.

---

### Task 4: Test Updates (suggestions-route.test.ts)
**Files to read**:
1. [RESEARCH-SUMMARY.md](./RESEARCH-SUMMARY.md) — Error scenarios (5 min)
2. [sapling-detection-patterns.md](./sapling-detection-patterns.md) — Testing patterns (10 min)

**Key concepts**:
- URL-based fetch mock routing (LLM vs. Sapling)
- Testing independent enrichment
- Testing graceful degradation
- Testing partial failures

---

## External References

All research is sourced from current (2026) production-ready guidance:

| Source | Link | Key For |
|--------|------|---------|
| **Next.js Route Handlers Guide** | https://makerkit.dev/blog/tutorials/nextjs-api-best-practices | Route patterns, error handling |
| **Resilient API Integration** | https://medium.com/@oshiryaeva/building-resilient-rest-api-integrations-graceful-degradation-and-combining-patterns-e8352d8e29c0 | Graceful degradation principles |
| **API Gateway Resilience** | https://zuplo.com/learning-center/api-gateway-resilience-fault-tolerance | Error isolation, failure classification |
| **Graceful Degradation** | https://sreschool.com/blog/graceful-degradation/ | Core vs. optional features |
| **AI Workflow Production** | https://blog.n8n.io/best-practices-for-deploying-ai-agents-in-production/ | Timeout handling, fallback mechanisms |

---

## Core Principle

**Independent enrichment + Graceful degradation + Preserved contract = Production-ready**

1. **Each alternative** enriched independently (own try-catch)
2. **Failures don't cascade** (one error doesn't affect siblings)
3. **Optional metadata remains undefined** on failure (never null)
4. **Response contract preserved** even with partial enrichment (HTTP 200)
5. **Everything is logged** for observability without exposing internals

---

## Task Sequence

```
Task 1 (Type Update)
  ↓
Task 2 (Route Enrichment) ← USE THESE GUIDES
  ↓
Task 3 (UI Update)
  ↓
Task 4 (Test Updates) ← USE GUIDES FOR TESTING PATTERNS
  ↓
Final Verification
```

---

## Questions?

Refer to the appropriate guide:

- **"How do I structure the enrichment loop?"** → route-enrichment-recommendations.md § Core Pattern
- **"What errors can Sapling throw?"** → sapling-detection-patterns.md § Error Scenarios & Handling
- **"How should I log this?"** → sapling-detection-patterns.md § Logging Strategy
- **"When do I return 500 vs 200?"** → RESEARCH-SUMMARY.md § Response Shape Contract
- **"How do I test independent enrichment?"** → sapling-detection-patterns.md § Testing & Verification

---

## Verification

All guidance is:
- ✅ Read-only research (no implementation code)
- ✅ Based on current (2026) production standards
- ✅ Sourced from authoritative references
- ✅ Specific to the previewScore enrichment task
- ✅ Aligned with plan requirements (graceful degradation, optional metadata, preserved response shape)

## Session Note

- Added `previewScore?: number` to `SuggestionAlternative` in `src/lib/suggestions/llm.ts` to support later preview enrichment without changing existing generation behavior.

## Task 2 Implementation Note (Sat Apr 04 2026)

Implemented per-alternative `previewScore` enrichment in `src/app/api/suggestions/route.ts`:

- Added import of `createAnalysisDetectionAdapter` from `@/lib/analysis/analyzeText`
- After `generateAlternativeSuggestions` returns, attempt to build a `DetectionAdapter` once via `createAnalysisDetectionAdapter()`; if it throws (Sapling unconfigured), `adapter` stays `null` and all alternatives skip enrichment
- `Promise.all` maps each alternative independently: if `adapter` is available, compute `revisedText = body.text.replace(body.sentence, alt.rewrite)`, call `adapter.detect(revisedText)`, attach `result.score` as `previewScore`; individual `catch` returns the unmodified `alt` so sibling enrichment proceeds
- Unavailable branch (`!alternatives`) left untouched — no `previewScore` there
- Top-level `rewrite`/`explanation` aliases now read from `enrichedAlternatives[0]` (same shape)
- `npm run typecheck` passes clean

## Task 3 Implementation Note (Sat Apr 04 2026)

- Updated `ReviewPanel.tsx` so the alternative "Why" label shows `Why (XX.X% AI if replaced)` when `alt.previewScore` exists and falls back to `Why` when it does not.
- Kept the change localized to the label text inside the explanation block and mirrored the existing one-decimal percentage formatting.

## Task 4 Implementation Note (Sat Apr 04 2026)

Updated `tests/integration/suggestions-route.test.ts` (36 → 40 tests, all passing):

- Added `OPENAI_URL` and `SAPLING_URL` constants for explicit URL-based routing in mocks
- Added `buildRoutedFetchMock(openaiResponder, saplingScore?)` helper: routes fetch calls by URL — OpenAI calls get LLM JSON responses, Sapling calls succeed with given score or return 503 if score is omitted
- Added `openaiMultiResponse` / `openaiSingleResponse` helpers to decouple response shape from stub wiring
- Refactored `mockLlmSuccess` and `mockLlmMultiSuccess` to use `buildRoutedFetchMock` so existing tests tolerate future Sapling calls transparently
- Fixed `sanitizeVoiceProfile` test: replaced `toHaveBeenCalledOnce()` with `calls.filter(url === OPENAI_URL)` so it remains correct even if Sapling calls are present
- Fixed `empty string voiceProfile` test: same URL-filter approach for prompt body inspection
- Added new describe block `previewScore enrichment` with 4 tests:
  1. previewScore numbers present on all alternatives when Sapling is available
  2. previewScore absent (graceful degradation) when SAPLING_API_KEY missing — available:true preserved
  3. previewScore absent when Sapling call fails (503) — available:true preserved
  4. unavailable response carries no previewScore even when SAPLING_API_KEY is set — strict contract unchanged
- `npm run test` passes clean: 393/393 tests across 14 files
