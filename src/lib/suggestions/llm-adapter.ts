/**
 * Provider-agnostic LLM adapter contract and types.
 *
 * Implementations must:
 *   - Live server-side only (never imported from client components).
 *   - Map all upstream failures to `FileProcessingError` with code `DETECTION_FAILED`.
 */

import { FileProcessingError } from '../files/errors';
import { OpenAiLlmAdapter } from './adapters/openai';
import { ClaudeLlmAdapter } from './adapters/anthropic';

export interface LlmCompletionRequest {
  /** System prompt guiding the LLM behavior. */
  systemPrompt: string;
  /** User prompt for the specific request. */
  userPrompt: string;
  /** Sampling temperature (0-2). */
  temperature: number;
  /** Maximum tokens to generate. */
  maxTokens: number;
  /** Optional nucleus sampling probability (0-1). When provided, constrains token sampling to top-p probability mass. */
  topP?: number;
}

export interface LlmCompletionResponse {
  /** Raw response content from the LLM. */
  content: string;
}

/**
 * Provider-agnostic LLM adapter.
 *
 * Implementations must handle all provider-specific logic and return
 * normalized responses or throw `FileProcessingError` with code `DETECTION_FAILED`.
 */
export interface LlmAdapter {
  /**
   * Request a single completion from the LLM provider.
   *
   * @returns null if the provider returns no content, otherwise the completion response.
   * @throws {FileProcessingError} with code `DETECTION_FAILED` on any provider error,
   *   timeout, 4xx, or 5xx response.
   */
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse | null>;

  /**
   * Request multiple completions from the LLM provider.
   *
   * @returns null if the provider returns no content, otherwise the completion response.
   * @throws {FileProcessingError} with code `DETECTION_FAILED` on any provider error,
   *   timeout, 4xx, or 5xx response.
   */
  completeMulti(request: LlmCompletionRequest): Promise<LlmCompletionResponse | null>;
}

/**
 * Factory function to create an LLM adapter.
 *
 * @param apiKey - API key for the provider. Defaults to `process.env.COACHING_LLM_API_KEY`
 *   if not provided or undefined. Provider is read from `process.env.LLM_PROVIDER` (defaults to 'openai').
 * @param provider - Optional provider override. If not provided, uses `process.env.LLM_PROVIDER` (defaults to 'openai').
 * @returns An LlmAdapter instance for the configured provider.
 * @throws {FileProcessingError} with code `DETECTION_FAILED` if the provider is unknown.
 */
export function createLlmAdapter(apiKey?: string, provider?: string): LlmAdapter {
  const resolvedProvider = (provider ?? process.env.LLM_PROVIDER ?? 'openai').toLowerCase();
  const finalApiKey = apiKey ?? process.env.COACHING_LLM_API_KEY;

  switch (resolvedProvider) {
    case 'openai':
      return new OpenAiLlmAdapter(finalApiKey);
    case 'anthropic':
      return new ClaudeLlmAdapter(finalApiKey);
    default:
      throw new FileProcessingError(
        'DETECTION_FAILED',
        `Unknown LLM provider: "${resolvedProvider}". Set LLM_PROVIDER to "openai" or "anthropic".`,
      );
  }
}
