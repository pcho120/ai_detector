# Sapling Detection Patterns & Error Handling

## Overview

This document captures external references and patterns for integrating Sapling AI-detection calls into a route handler, specifically for per-alternative score enrichment.

---

## Sapling API Reference

### Detection Endpoint
- **URL**: `https://api.sapling.ai/api/v1/aidetect`
- **Method**: POST
- **Authentication**: `X-API-Key: {SAPLING_API_KEY}`
- **Content-Type**: `application/json`

### Request Payload
```json
{
  "text": "Full document or revised text"
}
```

### Response Payload
```json
{
  "score": 0.45,
  "sentence_scores": [...],
  "text": "...",
  "tokens": [...],
  "token_probs": [...]
}
```

**Key field for previewScore**: `score` — float in range [0, 1], where 1 = "most likely AI-generated"

### Integration Point in Codebase

**Reference**: `src/lib/detection/sapling.ts`
- `createAnalysisDetectionAdapter()` → creates adapter instance (may throw `FileProcessingError`)
- `adapter.detect(text: string)` → calls Sapling API, returns `DetectionResult` with `.score`

---

## Error Scenarios & Handling

### 1. SAPLING_API_KEY Not Set

**Symptom**: `createAnalysisDetectionAdapter()` throws `FileProcessingError`

**Message pattern**: Usually includes "SAPLING_API_KEY" or "API key" substring

**Handling**:
```typescript
try {
  const adapter = createAnalysisDetectionAdapter();
} catch (error) {
  if (error instanceof FileProcessingError) {
    // Expected: no API key configured for this environment
    logger.info('Sapling unavailable', { reason: 'no API key' });
    // Continue without previewScore enrichment
    continue;
  }
  throw error; // Unexpected—let route-level handler catch
}
```

**Implication**: Graceful degradation for non-production or dev environments

### 2. Network Timeout

**Symptom**: `adapter.detect(text)` awaits indefinitely or throws timeout error

**Typical causes**: Sapling API slow, network latency, firewall

**Handling**:
```typescript
try {
  const detectionPromise = adapter.detect(revisedText);
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Sapling timeout')), 5000)
  );
  const result = await Promise.race([detectionPromise, timeoutPromise]);
  alt.previewScore = result.score;
} catch (error) {
  logger.warn('Sapling timeout', { altIndex: i, timeoutMs: 5000 });
  // Continue—previewScore undefined for this alternative
}
```

**Implication**: Route completes normally; client sees partial enrichment

### 3. Rate Limiting (429)

**Symptom**: `adapter.detect()` throws with HTTP 429 or similar

**Typical causes**: Too many requests to Sapling API in short time window

**Handling**:
```typescript
try {
  const result = await adapter.detect(revisedText);
  alt.previewScore = result.score;
} catch (error) {
  if (error?.message?.includes('429') || error?.statusCode === 429) {
    logger.warn('Sapling rate limited', { altIndex: i });
    // Don't retry in this request—would block route
    // Return partial results to client
  } else {
    logger.error('Sapling error', { error });
  }
}
```

**Implication**: Multiple concurrent enrichment calls may hit rate limits; distribute load or implement per-request batching if needed

### 4. Malformed Text / Invalid Input

**Symptom**: `adapter.detect(text)` throws validation error

**Typical causes**: Empty text, text too long, unsupported characters

**Handling**:
```typescript
try {
  // Validate before Sapling call
  if (!revisedText || revisedText.trim().length === 0) {
    logger.warn('Skipping Sapling for empty revised text', { altIndex: i });
    continue; // previewScore remains undefined
  }
  const result = await adapter.detect(revisedText);
  alt.previewScore = result.score;
} catch (error) {
  logger.error('Sapling validation error', { altIndex: i, error });
  // Continue—previewScore undefined
}
```

**Implication**: Validate input before calling Sapling to reduce API errors and costs

### 5. Unexpected API Error (5xx)

**Symptom**: `adapter.detect()` throws 5xx error code

**Typical causes**: Sapling API temporary outage, service restart

**Handling**:
```typescript
try {
  const result = await adapter.detect(revisedText);
  alt.previewScore = result.score;
} catch (error) {
  logger.error('Sapling API error', {
    altIndex: i,
    statusCode: error?.statusCode,
    message: error?.message
  });
  // Continue—previewScore undefined, but alternatives still valid
  // Client receives degraded response (200, but missing some scores)
}
```

**Implication**: Sapling failures must not block the route

---

## Revised Text Generation Pattern

### Why Replace Instead of Split

**Current approach** (simple string replace):
```typescript
const revisedText = body.text.replace(body.sentence, alt.rewrite);
```

**Advantages**:
- No need to parse sentence boundaries (Sapling's tokenization is internal)
- `body.sentence` is guaranteed to exist in `body.text` (extracted from analysis result)
- Exactly 1 occurrence expected (unique sentence from analysis)

**Guarantees**:
- `body.sentence` comes from the original analysis of `body.text`
- Sentence-to-rewrite mapping is 1:1
- No ambiguity about which sentence is replaced

### Edge Case: Sentence Appears Multiple Times

**Scenario**: Same sentence appears multiple times in document

**Current handling**: `replace()` replaces first occurrence (safe for most cases)

**If exact occurrence needed**: Use index-based slicing instead
```typescript
const beforeSentence = body.text.substring(0, sentenceStartIndex);
const afterSentence = body.text.substring(sentenceEndIndex);
const revisedText = beforeSentence + alt.rewrite + afterSentence;
```

**For now**: Simple `replace()` is acceptable per plan requirements

---

## Per-Alternative Independence Principle

### Core Rule

Each alternative's enrichment must be independent. Failures must not affect sibling alternatives or parent response.

### Loop Structure

```typescript
for (let i = 0; i < alternatives.length; i++) {
  const alt = alternatives[i];
  try {
    // All enrichment logic for this alt inside try block
    const revisedText = body.text.replace(body.sentence, alt.rewrite);
    const adapter = createAnalysisDetectionAdapter();
    const detectionResult = await adapter.detect(revisedText);
    alt.previewScore = detectionResult.score;
  } catch (error) {
    // Catch all errors from this alternative
    logger.warn(`Failed to enrich alternative ${i}`, {
      rewrite: alt.rewrite,
      error: error.message
    });
    // alt.previewScore remains undefined
    // Loop continues to next alternative
  }
}
```

### Why This Pattern

- **Fail-safe**: One alt's error doesn't crash the loop
- **Partial success**: Client gets previewScore for some alternatives even if others fail
- **Observable**: Each failure is logged independently
- **Recoverable**: Alternatives without previewScore are still usable (UI handles undefined gracefully)

---

## Logging Strategy for Detection Calls

### Entry Log
```typescript
logger.info('Starting previewScore enrichment', {
  sentenceIndex: body.sentenceIndex,
  alternativesCount: alternatives.length,
  sentence: body.sentence.substring(0, 50) + '...' // Truncate for readability
});
```

### Per-Alternative Log
```typescript
logger.debug('Enriching alternative', {
  altIndex: i,
  rewrite: alt.rewrite.substring(0, 50) + '...',
  revisedTextLength: revisedText.length
});
```

### Success Log
```typescript
logger.info('previewScore computed', {
  altIndex: i,
  previewScore: detectionResult.score,
  scorePercentage: (detectionResult.score * 100).toFixed(1) + '%'
});
```

### Failure Log
```typescript
logger.warn('previewScore enrichment failed', {
  altIndex: i,
  altRewrite: alt.rewrite.substring(0, 50) + '...',
  errorType: error.constructor.name,
  errorMessage: error.message,
  causedBy: error.statusCode ? `HTTP ${error.statusCode}` : 'unknown'
});
```

### Summary Log
```typescript
logger.info('previewScore enrichment complete', {
  sentenceIndex: body.sentenceIndex,
  alternativesTotal: alternatives.length,
  alternativesEnriched: enrichedCount,
  enrichmentLatencyMs: enrichmentEndTime - enrichmentStartTime,
  failureReasons: failureReasons // e.g., ['timeout', 'no API key']
});
```

---

## File Processing Error Classification

**Source**: `src/lib/files/errors.ts`

### FileProcessingError
- Thrown when file processing fails (parsing, validation, initialization)
- May include subtype info (e.g., missing API key, invalid format)
- **Action on catch**: Log and degrade gracefully

### Detection Adapter Initialization
```typescript
// From src/lib/analysis/analyzeText.ts
export function createAnalysisDetectionAdapter() {
  // May throw FileProcessingError if:
  // 1. SAPLING_API_KEY not set
  // 2. Invalid configuration
  // 3. Unable to initialize adapter
}
```

### Safe Wrapper
```typescript
function getDetectionAdapter() {
  try {
    return createAnalysisDetectionAdapter();
  } catch (error) {
    if (error instanceof FileProcessingError) {
      logger.info('Detection adapter unavailable', {
        reason: error.message,
        code: error.code
      });
      return null; // Signal degradation
    }
    throw error; // Unexpected—propagate to route handler
  }
}
```

---

## Testing & Verification

### Unit Test: Independent Enrichment
```typescript
it('each alternative enriched independently', async () => {
  // Mock adapter to fail on 2nd call
  const mockAdapter = {
    detect: jest.fn()
      .mockResolvedValueOnce({ score: 0.5 })
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ score: 0.3 })
  };

  // Verify:
  // alt[0].previewScore = 0.5
  // alt[1].previewScore = undefined (failed)
  // alt[2].previewScore = 0.3
  // Route returns 200, not 500
});
```

### Integration Test: Graceful Degradation
```typescript
it('returns alternatives even if Sapling is down', async () => {
  // Mock Sapling to always fail
  // Call /api/suggestions
  // Verify: available = true, alternatives returned, previewScore all undefined
  // Verify: HTTP 200
});
```

---

## References & External Links

- **Next.js Route Handlers**: https://makerkit.dev/blog/tutorials/nextjs-api-best-practices (Jan 2026)
- **API Resilience**: https://medium.com/@oshiryaeva/building-resilient-rest-api-integrations-graceful-degradation-and-combining-patterns-e8352d8e29c0 (Olga, Jan 2026)
- **Error Handling Patterns**: https://zuplo.com/learning-center/api-gateway-resilience-fault-tolerance
- **Graceful Degradation**: https://sreschool.com/blog/graceful-degradation/ (SRE School, 2026)
- **Production AI Workflows**: https://blog.n8n.io/best-practices-for-deploying-ai-agents-in-production/ (n8n, Jan 2026)

---

## Summary

1. **Sapling calls can fail** for legitimate reasons (no API key, timeout, rate limit, API down)
2. **Each alternative enrichment must be independent** — wrap in its own try-catch
3. **Failures don't cascade** — continue to next alternative, log, and return partial results (200 status)
4. **Optional fields remain undefined** — UI handles gracefully without error messaging
5. **Log thoroughly** — each failure point, type, and recovery provides observability without exposing internals

