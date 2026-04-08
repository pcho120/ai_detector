import { FileProcessingError } from '../../files/errors';
import type { LlmAdapter, LlmCompletionRequest, LlmCompletionResponse } from '../llm-adapter';

// NOTE: Anthropic response shape differs from OpenAI.
// Anthropic uses `content[0].text` whereas OpenAI uses `choices[0].message.content`.
// This distinction must be handled when this stub is implemented.

/**
 * Anthropic Claude LLM adapter stub.
 *
 * Not yet implemented. Both methods throw `FileProcessingError('DETECTION_FAILED')`.
 */
export class ClaudeLlmAdapter implements LlmAdapter {
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse | null> {
    // Reference parameter to prevent lint warnings in stub
    void request;
    throw new FileProcessingError('DETECTION_FAILED', 'Anthropic Claude adapter is not yet implemented.');
  }

  async completeMulti(request: LlmCompletionRequest): Promise<LlmCompletionResponse | null> {
    // Reference parameter to prevent lint warnings in stub
    void request;
    throw new FileProcessingError('DETECTION_FAILED', 'Anthropic Claude adapter is not yet implemented.');
  }
}
