# Route-Level Enrichment: Implementation Guidance for Per-Alternative Sapling Score

## Summary

This document captures best-practice patterns for safely enriching a Next.js route response with optional external service metadata (per-alternative Sapling AI-detection scores). The guidance focuses on route-level resilience, graceful degradation, and preserving stable response contracts.

---

## Core Pattern: Independent Try-Catch per Item

**Source**: Next.js Route Handlers Best Practices Guide (2026) & "Building Resilient REST API Integrations" (Medium, Olga, Jan 2026)

### Principle

When enriching a collection (e.g., alternatives array) with external metadata:
- **Wrap each enrichment operation independently** in its own try-catch
- Failure of one enrichment must NOT affect other items or the overall response
- Each item's metadata field becomes **optional** if the external call fails

### Pattern

```typescript
export async function POST(request: NextRequest) {
  try {
    // 1. Compute base response (always succeeds)
    const alternatives = await generateAlternativeSuggestions(body);

    // 2. Enrich each alternative independently
    for (const alt of alternatives) {
      try {
        const revisedText = body.text.replace(body.sentence, alt.rewrite);
        const adapter = createAnalysisDetectionAdapter(); // May throw if no SAPLING_API_KEY
        const result = await adapter.detect(revisedText); // May fail: network, timeout, etc.
        alt.previewScore = result.score;
      } catch (error) {
        // Silent fail: alt.previewScore remains undefined
        logger.warn(`Failed to compute previewScore for alternative`, { error });
      }
    }

    return NextResponse.json({ available: true, alternatives, ... });
  } catch (error) {
    return handleApiError(error);
  }
}
```

**Why this works**:
- The loop continues even if one enrichment fails
- Alternatives remain in response; specific scores are absent if unavailable
- Client receives partial but valid data, not error page

---

## Graceful Degradation: Preserve Response Shape

**Source**: Zuplo API Gateway Resilience Guide & SRE School (2026)

### Definition

When optional metadata cannot be computed, **preserve the core response contract**—don't fall back to error responses for an enrichment that's not critical to the main feature.

### Application to previewScore

- **Core contract**: `{ available: true, alternatives: [...], explanation, rewrite }`
  - Must always be present in successful response
  - Returning alternatives proves the route succeeded
- **Optional metadata**: `alternatives[i].previewScore`
  - If Sapling is unavailable or request fails → `previewScore: undefined`
  - UI simply omits the score label, no visual indication of "error"

### Implementation

```typescript
// ✅ GOOD: Return alternatives unchanged, previewScore absent
{
  "available": true,
  "alternatives": [
    { "rewrite": "...", "explanation": "...", "previewScore": 0.45 },
    { "rewrite": "...", "explanation": "..." } // previewScore undefined
  ]
}

// ❌ BAD: Return error if any enrichment fails
{
  "error": "Sapling API unavailable",
  "status": 500
}

// ❌ BAD: Return null/empty previewScore (ambiguous)
{
  "previewScore": null
}
```

---

## Three-Layer Error Handling

**Source**: Next.js Route Handlers Guide (Makerkit, Jan 2026) & n8n production best practices (2026)

### Layer 1: Route-Level Try-Catch
Catches failures in base logic (LLM call, invalid input). Returns 4xx/5xx error.

```typescript
export async function POST(request: NextRequest) {
  try {
    const alternatives = await generateAlternativeSuggestions(body);
    // ... enrichment logic
    return NextResponse.json({ available: true, alternatives });
  } catch (error) {
    // Base generation failed → route fails
    return handleApiError(error);
  }
}
```

### Layer 2: Enrichment-Level Try-Catch (per item)
Catches failures in optional metadata computation. Silently skips that item's enrichment.

```typescript
for (const alt of alternatives) {
  try {
    const adapter = createAnalysisDetectionAdapter();
    const result = await adapter.detect(revisedText);
    alt.previewScore = result.score;
  } catch (enrichmentError) {
    // Log but don't throw—continue to next alternative
    logger.warn('previewScore enrichment failed', { enrichmentError });
    // alt.previewScore remains undefined
  }
}
```

### Layer 3: External Service Failure Classification
Distinguishes transient vs. permanent failures (retry logic, observability).

```typescript
try {
  const adapter = createAnalysisDetectionAdapter(); // Throws FileProcessingError if no API key
} catch (error) {
  if (error instanceof FileProcessingError && error.message.includes('SAPLING_API_KEY')) {
    // Permanent: no API key configured
    logger.info('Sapling unavailable (no API key)—graceful degradation');
  } else {
    // Transient: network timeout, rate limit, etc.
    logger.warn('Sapling API failed—graceful degradation', { error });
  }
  // Either way, continue without previewScore
}
```

---

## Independent Error Isolation Pattern

**Source**: "Partial Functionality Over Complete Failure" (Olga, Medium, Jan 2026)

### Rule

> If one of five API integrations fails, the other four should continue working. A single failure shouldn't cascade into total application failure.

### Applied to Alternatives

```typescript
const results = alternatives.map((alt, idx) => {
  try {
    // Compute per-alternative metadata
    return enrichAlternative(alt);
  } catch (err) {
    logger.error(`Alternative ${idx} enrichment failed`, err);
    // Return alternative unchanged; omit optional fields
    return alt; // previewScore undefined
  }
});
```

This pattern ensures:
- If Sapling times out on alt[0], alt[1], alt[2], ... still get scores
- Failure is localized; doesn't propagate to route-level error handling
- Client receives a valid response with partial data

---

## Practical Implementation Checklist

### Route Level
- [ ] Wrap entire POST handler in try-catch → return 500 on failure
- [ ] Log with context: request body, error stack, timing
- [ ] Return consistent HTTP status codes (200, 400, 500, etc.)

### Enrichment Level (per alternative)
- [ ] For each alternative: independent try-catch block
- [ ] On enrichment failure: log warning, continue loop
- [ ] Optional fields (`previewScore`) remain undefined if unavailable
- [ ] Preserve base fields (`rewrite`, `explanation`) always

### Logging
- [ ] Log route entry/exit with request ID
- [ ] Log each enrichment attempt: alternative index, operation
- [ ] Log errors with ERROR level (permanent failures), WARN level (transient)
- [ ] Include metrics: count succeeded, count failed, timing

### Testing
- [ ] Verify alternatives returned even if Sapling API is down
- [ ] Verify some alternatives have `previewScore`, others don't
- [ ] Verify 200 status even with partial enrichment failures
- [ ] Verify 500 only if base generation (LLM) fails

---

## Response Shape Contract

### Success Scenario (HTTP 200)

```typescript
{
  "available": true,
  "alternatives": [
    {
      "rewrite": "The data shows significant trends.",
      "explanation": "More concise language",
      "previewScore": 0.45 // ✓ present if Sapling succeeded
    },
    {
      "rewrite": "Trends are evident in the data.",
      "explanation": "Active voice",
      // ✓ previewScore absent if Sapling failed for this alt
    }
  ],
  "explanation": "...",
  "rewrite": "..."
}
```

### Failure Scenario (HTTP 200, Degraded)
```typescript
{
  "available": true,
  "alternatives": [
    {
      "rewrite": "...",
      "explanation": "...",
      // previewScore undefined — Sapling failed but alternatives still valid
    },
    // ... more alternatives
  ],
  "explanation": "...",
  "rewrite": "..."
}
```

### Error Scenario (HTTP 500)
```typescript
{
  "error": "Failed to generate suggestions: LLM API rate limited",
  "code": "SUGGESTIONS_ERROR"
}
```
→ Returned only if base generation (LLM) fails, not if enrichment (Sapling) fails.

---

## Timeout & Deadlock Prevention

**Source**: n8n production guide & Next.js best practices (2026)

### Guideline
- Set explicit timeout for each Sapling call (e.g., 5 seconds)
- If timeout → catch error, move to next alternative
- Do NOT wait indefinitely for optional enrichment

```typescript
const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Sapling timeout')), 5000)
);

for (const alt of alternatives) {
  try {
    const result = await Promise.race([
      adapter.detect(revisedText),
      timeoutPromise
    ]);
    alt.previewScore = result.score;
  } catch (error) {
    // Timeout or other error → skip and continue
    logger.warn('Sapling call timed out', { altIndex: alternatives.indexOf(alt) });
  }
}
```

---

## Observability & Monitoring

### Metrics to Log
- **Success rate**: `enriched_count / total_alternatives`
- **Failure types**: API key missing, timeout, network error, rate limit
- **Latency**: time to enrich all alternatives
- **Route latency**: total time including enrichment

### Example Log Entry
```
{
  "msg": "suggestions route completed",
  "sentenceIndex": 0,
  "alternatives_total": 3,
  "alternatives_enriched": 2,
  "alternatives_failed": 1,
  "enrichment_time_ms": 1250,
  "route_time_ms": 1500,
  "sapling_failures": ["timeout"]
}
```

---

## Key Takeaways

1. **Independent try-catch per enrichment** → one failure doesn't cascade
2. **Optional fields remain undefined** if enrichment fails → client handles missing data gracefully
3. **Response contract preserved** even with partial enrichment → 200 response, not 500
4. **Log everything with context** → troubleshoot failures without client visibility
5. **Timeout enrichment calls** → prevent route from hanging on external service delay

This pattern (independent enrichment + graceful degradation + preserved contract) is foundational for production-ready route handlers that integrate optional metadata from unreliable external services.
