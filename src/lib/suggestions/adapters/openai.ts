import type { LlmAdapter, LlmCompletionRequest, LlmCompletionResponse } from '../llm-adapter';

interface ChatChoice {
  message: { content: string | null };
}

interface ChatCompletionResponse {
  choices: ChatChoice[];
}

/**
 * OpenAI LLM adapter implementation.
 *
 * Handles communication with OpenAI's chat completions API (gpt-4o-mini).
 * All network/fetch failures, non-OK responses, unreadable JSON, and missing
 * content are surfaced as `null` — callers decide how to handle them.
 */
export class OpenAiLlmAdapter implements LlmAdapter {
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse | null> {
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          ...(request.topP !== undefined ? { top_p: request.topP } : {}),
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
        }),
      });
    } catch {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    let data: ChatCompletionResponse;
    try {
      data = (await response.json()) as ChatCompletionResponse;
    } catch {
      return null;
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    return { content };
  }

  async completeMulti(request: LlmCompletionRequest): Promise<LlmCompletionResponse | null> {
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          temperature: request.temperature,
          max_tokens: request.maxTokens,
          ...(request.topP !== undefined ? { top_p: request.topP } : {}),
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
        }),
      });
    } catch {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    let data: ChatCompletionResponse;
    try {
      data = (await response.json()) as ChatCompletionResponse;
    } catch {
      return null;
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    return { content };
  }
}
