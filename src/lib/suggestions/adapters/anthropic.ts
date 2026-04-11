import Anthropic from '@anthropic-ai/sdk';
import type { LlmAdapter, LlmCompletionRequest, LlmCompletionResponse } from '../llm-adapter';

/**
 * Anthropic Claude LLM adapter implementation.
 *
 * Handles communication with Anthropic's messages API (claude-sonnet-4-6).
 * All network/API failures and missing content are surfaced as `null` — callers decide
 * how to handle them.
 */
export class ClaudeLlmAdapter implements LlmAdapter {
  private readonly apiKey: string | undefined;
  private readonly client: Anthropic;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    this.client = new Anthropic({ apiKey: this.apiKey });
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse | null> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: request.maxTokens,
        temperature: Math.min(request.temperature, 1.0),
        ...(request.topP !== undefined ? { top_p: request.topP } : {}),
        system: request.systemPrompt,
        messages: [
          {
            role: 'user',
            content: request.userPrompt,
          },
        ],
      });

      if (!response.content || response.content.length === 0) {
        return null;
      }

      const firstBlock = response.content[0];
      if (firstBlock.type !== 'text') {
        return null;
      }

      return { content: firstBlock.text };
    } catch {
      return null;
    }
  }

  async completeMulti(request: LlmCompletionRequest): Promise<LlmCompletionResponse | null> {
    return this.complete(request);
  }
}
