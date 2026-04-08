# Rejected Mismatch Correction

## Initial Implementation vs. Contract Mismatch

**Issue**: Initial implementation used sentence-specific request/response types that did not match the required generic prompt-based contract.

### Rejected Shapes
- **Request**: `{ sentence: string; score: number; voiceProfile?: string }`
- **Response**: `{ rewrite: string; explanation: string }`
- **Factory**: `createLlmAdapter(provider?: string, apiKey?: string)`
- **Adapter Methods**: Only `complete()`, missing `completeMulti()`
- **Provider Reading**: Hardcoded read from `provider` parameter, not from `LLM_PROVIDER` env var

### Corrected Shapes
- **Request**: `{ systemPrompt: string; userPrompt: string; temperature: number; maxTokens: number }`
- **Response**: `{ content: string }`
- **Return Type**: `Promise<LlmCompletionResponse | null>` (nullable)
- **Factory**: `createLlmAdapter(apiKey?: string)` (single parameter)
- **Provider Reading**: `(process.env.LLM_PROVIDER ?? 'openai').toLowerCase()`
- **Adapter Methods**: Both `complete()` and `completeMulti()`

## Rationale

The corrected contract enables:
1. Generic prompt-based request/response for future LLM implementations
2. Environment-based provider switching via `LLM_PROVIDER`
3. Support for both single and multiple completions
4. Proper null-return semantics for failed LLM calls
5. Future refactoring of `llm.ts` to use adapters behind this generic interface
