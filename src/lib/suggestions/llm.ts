import type { Suggestion, SentenceEntry, SuggestionService } from './types';
import { applyGuardrails } from './guardrails';

interface ChatChoice {
  message: { content: string | null };
}
interface ChatCompletionResponse {
  choices: ChatChoice[];
}

interface LlmRewritePayload {
  rewrite: string;
  explanation: string;
}

const SYSTEM_PROMPT = `You are an academic writing coach helping students improve essay authenticity.
When given an AI-sounding sentence, respond with ONLY valid JSON in this exact shape:
{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence explaining the change>"}
Rules:
- rewrite must be a complete, grammatically correct replacement sentence, not a coaching hint.
- Do NOT mention AI detection, evasion, or scores.
- Keep the core meaning of the original sentence.
- Write at a natural undergraduate academic level.
- explanation must be one sentence, <= 120 characters.`;

function buildUserPrompt(sentence: string, score: number): string {
  const riskLevel = score >= 0.85 ? 'high' : score >= 0.7 ? 'medium' : 'low';
  return `Rewrite this ${riskLevel}-risk AI-sounding sentence:\n"${sentence}"`;
}

function parseRewritePayload(raw: string): LlmRewritePayload | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/m, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'rewrite' in parsed &&
      'explanation' in parsed &&
      typeof (parsed as Record<string, unknown>).rewrite === 'string' &&
      typeof (parsed as Record<string, unknown>).explanation === 'string'
    ) {
      return parsed as LlmRewritePayload;
    }
  } catch {
    return null;
  }
  return null;
}

async function callChatCompletions(
  apiKey: string,
  sentence: string,
  score: number,
): Promise<LlmRewritePayload | null> {
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 256,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(sentence, score) },
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

  return parseRewritePayload(content);
}

export class LlmSuggestionService implements SuggestionService {
  private readonly apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.COACHING_LLM_API_KEY;
  }

  async suggest(sentences: SentenceEntry[]): Promise<Suggestion[]> {
    if (!this.apiKey) {
      return [];
    }

    const raw: Suggestion[] = [];

    for (const entry of sentences) {
      const payload = await callChatCompletions(this.apiKey, entry.sentence, 0.5);
      if (payload) {
        raw.push({
          sentence: entry.sentence,
          rewrite: payload.rewrite,
          explanation: payload.explanation,
          sentenceIndex: entry.index,
        });
      }
    }

    return applyGuardrails(raw);
  }
}

export async function generateSingleSuggestion(
  apiKey: string | undefined,
  sentence: string,
  sentenceIndex: number,
  score: number,
): Promise<Suggestion | null> {
  if (!apiKey) return null;

  const payload = await callChatCompletions(apiKey, sentence, score);
  if (!payload) return null;

  const [filtered] = applyGuardrails([
    {
      sentence,
      rewrite: payload.rewrite,
      explanation: payload.explanation,
      sentenceIndex,
    },
  ]);

  return filtered ?? null;
}
