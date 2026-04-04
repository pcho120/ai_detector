# Research Summary: Safe Route Enrichment with External Detection Services

**Date**: April 4, 2026  
**Objective**: Identify best-practice patterns for safely enriching a Next.js route response with per-alternative Sapling AI-detection scores while gracefully degrading on partial failures.

---

## Guidance Identified

### 1. **Independent Try-Catch Per Item** (Core Pattern)

Each item in an array enrichment must have its own error boundary. Failures in one item's enrichment must not affect others or the overall response.

**Key Reference**: 
- Next.js Route Handlers Best Practices Guide (Makerkit, Jan 2026)
- "Building Resilient REST API Integrations" (Olga, Medium, Jan 2026)

**Implementation**:
```typescript
for (const alt of alternatives) {
  try {
    alt.previewScore = await computeScore(alt);
  } catch (error) {
    logger.warn('Enrichment failed for item', { error });
    // Continue—item remains in response without optional metadata
  }
}
```

---

### 2. **Graceful Degradation: Preserve Response Shape**

When optional metadata (previewScore) cannot be computed, return the core response unchanged. Do NOT return an error status or null values.

**Key Reference**:
- Zuplo API Gateway Resilience Guide (2026)
- SRE School Graceful Degradation Guide (2026)

**Pattern**:
- **HTTP 200**: Return alternatives with available previewScores; omit previewScore on failures
- **HTTP 500**: Only if base logic fails (LLM call, invalid input)
- **Never**: Return null, error string, or partial object with previewScore=undefined

**Why This Works**:
- Client expects consistent response shape
- Missing optional fields are explicitly different from empty/null values
- UI layer handles undefined gracefully (shows no label, not error)

---

### 3. **Three-Layer Error Handling**

**Layer 1 (Route)**: Catches failures in base logic → returns 4xx/5xx  
**Layer 2 (Item Enrichment)**: Catches failures per item → continues loop, logs  
**Layer 3 (External Service)**: Classifies failure type → informs logging/monitoring  

**Pattern**:
```typescript
export async function POST(request: NextRequest) {
  try {
    // Layer 1: Route-level try-catch
    const alternatives = await generateAlternativeSuggestions(body);
    
    for (const alt of alternatives) {
      try {
        // Layer 2: Item-level try-catch
        const adapter = createAnalysisDetectionAdapter(); // May throw
        const result = await adapter.detect(revisedText); // May fail
        alt.previewScore = result.score;
      } catch (error) {
        // Layer 3: Classify error
        if (error instanceof FileProcessingError) {
          logger.info('Sapling unavailable (no API key)');
        } else if (error.message.includes('timeout')) {
          logger.warn('Sapling timeout');
        } else {
          logger.error('Unexpected Sapling error', { error });
        }
        // Continue without previewScore for this alt
      }
    }
    
    return NextResponse.json({ available: true, alternatives });
  } catch (error) {
    // Route-level failure → return error
    return handleApiError(error);
  }
}
```

---

### 4. **Independent Error Isolation**

Rule: "If one of five integrations fails, the other four should continue working."

**Applied to alternatives**:
- If Sapling times out on alt[0], alt[1]+ still get computed
- Failure is localized to that alternative
- Doesn't propagate to route-level error handler
- Client receives valid response with partial enrichment

---

## Functionality Patterns

### Response Shape Contract

**Success (HTTP 200)**:
```json
{
  "available": true,
  "alternatives": [
    { "rewrite": "...", "explanation": "...", "previewScore": 0.45 },
    { "rewrite": "...", "explanation": "..." }
  ]
}
```
→ Some alternatives have previewScore, others don't.

**Degradation (HTTP 200)**:
```json
{
  "available": true,
  "alternatives": [
    { "rewrite": "...", "explanation": "..." },
    { "rewrite": "...", "explanation": "..." }
  ]
}
```
→ No previewScore fields—Sapling was unavailable.

**Error (HTTP 500)**:
```json
{
  "error": "Failed to generate suggestions: LLM rate limited",
  "code": "SUGGESTIONS_ERROR"
}
```
→ Only if base generation (LLM) fails, not enrichment.

---

### Revised Text Generation

**Simple replace approach**:
```typescript
const revisedText = body.text.replace(body.sentence, alt.rewrite);
```

**Why this works**:
- `body.sentence` is guaranteed to exist in `body.text`
- Extracted from analysis result, so 1:1 mapping
- No need to re-parse sentence boundaries

**Sapling call**:
```typescript
const adapter = createAnalysisDetectionAdapter();
const detectionResult = await adapter.detect(revisedText);
const previewScore = detectionResult.score; // [0, 1]
```

---

### Timeout & Deadlock Prevention

Set explicit timeout for each Sapling call (5-10 seconds). If timeout → catch, move to next alternative.

```typescript
const timeoutMs = 5000;
const result = await Promise.race([
  adapter.detect(revisedText),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), timeoutMs)
  )
]);
```

---

## Error Scenarios & Handling

| Scenario | Handling | Result |
|----------|----------|--------|
| **No SAPLING_API_KEY** | Catch `FileProcessingError`, continue | HTTP 200, no previewScores |
| **Network Timeout** | Catch timeout error, continue | HTTP 200, partial previewScores |
| **Rate Limit (429)** | Catch, don't retry in-request | HTTP 200, partial previewScores |
| **Malformed Text** | Validate before call, skip if empty | HTTP 200, no previewScore for that alt |
| **API 5xx Error** | Catch, log, continue | HTTP 200, partial previewScores |
| **LLM Failure** | Propagate to route handler | HTTP 500 |

---

## Observability & Logging

**Metrics to track**:
- Enriched count / total alternatives
- Failure types: API key missing, timeout, network error, rate limit
- Latency: enrichment time vs. total route time

**Log entry example**:
```json
{
  "msg": "suggestions route completed",
  "sentenceIndex": 0,
  "alternatives_total": 3,
  "alternatives_enriched": 2,
  "alternatives_failed": 1,
  "enrichment_time_ms": 1250,
  "route_time_ms": 1500
}
```

---

## External References

| Source | Link | Key Insight |
|--------|------|-------------|
| **Next.js Route Handlers Guide** | https://makerkit.dev/blog/tutorials/nextjs-api-best-practices (Jan 2026) | Error handling layers, response contracts |
| **Resilient API Integration** | https://medium.com/@oshiryaeva/building-resilient-rest-api-integrations-graceful-degradation-and-combining-patterns-e8352d8e29c0 (Jan 2026) | Graceful degradation principles, partial functionality |
| **API Gateway Resilience** | https://zuplo.com/learning-center/api-gateway-resilience-fault-tolerance | Error isolation, failure classification |
| **Graceful Degradation** | https://sreschool.com/blog/graceful-degradation/ (SRE School, 2026) | Core/optional feature separation |
| **AI Workflow Production** | https://blog.n8n.io/best-practices-for-deploying-ai-agents-in-production/ (n8n, Jan 2026) | Timeout handling, fallback mechanisms |

---

## Guardrails & Must-Nots

❌ **Do NOT**:
- Return 500 if enrichment fails (only if base logic fails)
- Return `null` or empty previewScore values
- Let one alternative's error affect others
- Wait indefinitely for optional enrichment
- Expose internal error details to client
- Retry failed enrichments within the same request

✅ **DO**:
- Log all failures with context
- Continue to next item on enrichment failure
- Preserve core response shape
- Set explicit timeouts
- Classify failure types for observability
- Return HTTP 200 with partial data

---

## Key Takeaways for Task 2 Implementation

1. **Loop through alternatives**, each in independent try-catch
2. **For each alternative**:
   - Generate `revisedText` via simple string replace
   - Create Sapling adapter (may throw if no API key)
   - Call `adapter.detect(revisedText)` with 5s timeout
   - Assign `alt.previewScore = detectionResult.score`
3. **On any error**: Log warning, continue to next alternative
4. **Always return 200** if alternatives were generated (even if enrichment partially failed)
5. **Log metrics** at end: enriched count, failure reasons, latency

---

## Documents Created

1. **route-enrichment-recommendations.md** — Comprehensive guide to route-level enrichment patterns, three-layer error handling, and response contracts
2. **sapling-detection-patterns.md** — Sapling API reference, error scenarios, revised text generation, logging strategy, and testing patterns
3. **RESEARCH-SUMMARY.md** (this file) — Quick reference capturing guidance, patterns, and guardrails

All documents are located in: `.sisyphus/notepads/suggestion-score-preview/`

---

## Usage for Task 2

Before implementing Task 2 (route enrichment), refer to:
- **route-enrichment-recommendations.md** → for general pattern and error handling structure
- **sapling-detection-patterns.md** → for Sapling-specific details, error classification, and logging
- **RESEARCH-SUMMARY.md** → for quick ref during implementation

