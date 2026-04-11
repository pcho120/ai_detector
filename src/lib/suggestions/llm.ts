import type { Suggestion, SentenceEntry, SuggestionService } from './types';
import { applyGuardrails } from './guardrails';
import { sanitizeVoiceProfile, detectProfileLanguage, buildRewriteContextBlock, buildFewShotContextBlock } from './voiceProfile';
import { createLlmAdapter } from './llm-adapter';

interface LlmRewritePayload {
  rewrite: string;
  explanation: string;
}

export interface SuggestionAlternative {
  rewrite: string;
  explanation: string;
  previewScore?: number;
}

const SYSTEM_PROMPT = `You are a writing assistant that rewrites sentences to sound like they were written by a real person, not an AI.

Respond with ONLY valid JSON in this exact shape:
{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence explaining the change>"}

Rules:
- rewrite must be a complete, grammatically correct replacement sentence.
- Make the tone slightly informal but still appropriate for academic context.
- Break any repetitive or predictable patterns from the original.
- Avoid generic or vague wording — prefer specific, concrete language.
- Add subtle variation in sentence length and flow.
- Keep the core meaning intact.
- Do NOT mention AI detection, evasion, or scores.
- explanation must be one sentence, <= 120 characters.`;

const STYLE_SYSTEM_PROMPT = `You are an expert writing coach specializing in individual authorship style adaptation.

Respond with ONLY valid JSON in this exact shape:
{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence explaining the change>"}

Rules:
- rewrite must be a complete, grammatically correct replacement sentence.
- Your PRIMARY goal is to make the rewrite sound like the specific author whose examples are provided.
- Match the author's vocabulary level, sentence rhythm, and characteristic patterns — not generic informal writing.
- When style examples are provided, prioritize style fidelity over generic humanization.
- Preserve the core meaning while adopting the author's voice.
- Do NOT mention AI detection, evasion, or scores.
- explanation must be one sentence, <= 120 characters.`;

const MULTI_SYSTEM_PROMPT = `You are a writing assistant that rewrites sentences to sound like they were written by a real person, not an AI.

Respond with ONLY valid JSON in this exact shape:
{"alternatives":[{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"},{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"},{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"}]}

Rules:
- Each rewrite must be a complete, grammatically correct replacement sentence.
- Produce exactly 3 alternatives, each with noticeably different phrasing and sentence shape.
- Make the tone slightly informal but still appropriate for academic context.
- Break repetitive or predictable patterns — vary structure across all 3 alternatives.
- Avoid generic or vague wording — use specific, concrete language.
- Add subtle variation in sentence length and flow within each rewrite.
- Use a slightly conversational style — not stiff or overly formal.
- Keep the meaning but make it feel less "perfect" and more human.
- Do NOT mention AI detection, evasion, or scores.
- Each explanation must be one sentence, <= 120 characters.`;

const STYLE_MULTI_SYSTEM_PROMPT = `You are an expert writing coach specializing in individual authorship style adaptation.

Respond with ONLY valid JSON in this exact shape:
{"alternatives":[{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"},{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"},{"rewrite":"<full replacement sentence>","explanation":"<one concise sentence>"}]}

Rules:
- Each rewrite must be a complete, grammatically correct replacement sentence.
- Produce exactly 3 alternatives, each with noticeably different phrasing and sentence shape.
- Your PRIMARY goal is to make each rewrite sound like the specific author whose examples are provided.
- Match the author's vocabulary level, sentence rhythm, and characteristic patterns.
- When style examples are provided, prioritize style fidelity over generic humanization.
- Keep the meaning but make it feel like this specific person wrote it.
- Do NOT mention AI detection, evasion, or scores.
- Each explanation must be one sentence, <= 120 characters.`;

export function getSystemPrompt(hasFewShot: boolean): string {
  return hasFewShot ? STYLE_SYSTEM_PROMPT : SYSTEM_PROMPT;
}

export function getMultiSystemPrompt(hasFewShot: boolean): string {
  return hasFewShot ? STYLE_MULTI_SYSTEM_PROMPT : MULTI_SYSTEM_PROMPT;
}

function buildUserPrompt(sentence: string, voiceProfile?: string, fewShotExamples?: string[]): string {
  const base = `Rewrite the following sentence to sound like natural human writing:\n\n"${sentence}"`;

  if (fewShotExamples && fewShotExamples.length > 0) {
    const block = buildFewShotContextBlock(fewShotExamples);
    if (block) return `${block}\n\n${base}`;
  }

  if (!voiceProfile) return base;

  const sanitized = sanitizeVoiceProfile(voiceProfile);
  if (!sanitized) return base;

  const lang = detectProfileLanguage(sanitized);
  const contextBlock = buildRewriteContextBlock(sanitized, lang);
  if (!contextBlock) return base;

  return `${contextBlock}\n\n${base}`;
}

function buildMultiUserPrompt(sentence: string, voiceProfile?: string, fewShotExamples?: string[]): string {
  const base = `Rewrite the following sentence so it sounds like it was written by a real person, not an AI. Provide 3 distinct alternatives:\n\n"${sentence}"`;

  if (fewShotExamples && fewShotExamples.length > 0) {
    const block = buildFewShotContextBlock(fewShotExamples);
    if (block) return `${block}\n\n${base}`;
  }

  if (!voiceProfile) return base;

  const sanitized = sanitizeVoiceProfile(voiceProfile);
  if (!sanitized) return base;

  const lang = detectProfileLanguage(sanitized);
  const contextBlock = buildRewriteContextBlock(sanitized, lang);
  if (!contextBlock) return base;

  return `${contextBlock}\n\n${base}`;
}

function parseRewritePayload(raw: string): LlmRewritePayload | null {
  const tryParse = (value: string): LlmRewritePayload | null => {
    try {
      const parsed = JSON.parse(value) as unknown;
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
  };

  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/m, '').trim();
  const cleanedResult = tryParse(cleaned);
  if (cleanedResult) return cleanedResult;

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return tryParse(raw.slice(firstBrace, lastBrace + 1));
  }

  return null;
}

function parseMultiAlternativesPayload(raw: string): LlmRewritePayload[] | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/m, '').trim();
    const parsed = JSON.parse(cleaned) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'alternatives' in parsed &&
      Array.isArray((parsed as Record<string, unknown>).alternatives)
    ) {
      const alts = (parsed as Record<string, unknown>).alternatives as unknown[];
      const valid = alts.filter(
        (a): a is LlmRewritePayload =>
          typeof a === 'object' &&
          a !== null &&
          'rewrite' in a &&
          'explanation' in a &&
          typeof (a as Record<string, unknown>).rewrite === 'string' &&
          typeof (a as Record<string, unknown>).explanation === 'string',
      );
      return valid.length > 0 ? valid : null;
    }
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'rewrite' in parsed &&
      'explanation' in parsed &&
      typeof (parsed as Record<string, unknown>).rewrite === 'string' &&
      typeof (parsed as Record<string, unknown>).explanation === 'string'
    ) {
      return [parsed as LlmRewritePayload];
    }
  } catch {
    return null;
  }
  return null;
}

async function twoPassRewrite(
  adapter: ReturnType<typeof createLlmAdapter>,
  sentence: string,
  voiceProfile?: string,
  fewShotExamples?: string[],
): Promise<LlmRewritePayload | null> {
  const pass1Result = await adapter.complete({
    systemPrompt: getSystemPrompt(!!fewShotExamples?.length),
    userPrompt: buildUserPrompt(sentence, voiceProfile, fewShotExamples),
    temperature: 0.7,
    maxTokens: 256,
  });
  if (!pass1Result) return null;

  const pass1Payload = parseRewritePayload(pass1Result.content);
  if (!pass1Payload) return null;

  // Skip Pass2 refinement when few-shot examples are active to preserve style signal
  if (fewShotExamples && fewShotExamples.length > 0) {
    return pass1Payload;
  }

  const pass2Result = await adapter.complete({
    systemPrompt: getSystemPrompt(!!fewShotExamples?.length),
    userPrompt: buildUserPrompt(pass1Payload.rewrite, voiceProfile, fewShotExamples),
    temperature: 0.85,
    maxTokens: 256,
  });

  if (pass2Result) {
    const pass2Payload = parseRewritePayload(pass2Result.content);
    if (pass2Payload) {
      return { rewrite: pass2Payload.rewrite, explanation: pass1Payload.explanation };
    }
  }

  return pass1Payload;
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

    const adapter = createLlmAdapter(this.apiKey);
    const raw: Suggestion[] = [];

    for (const entry of sentences) {
      const payload = await twoPassRewrite(adapter, entry.sentence);
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

/**
 * Internal helper for generating a single suggestion with optional LLM provider override.
 * Used by bulk rewrite to honor provider preferences without changing the public API.
 * @internal
 */
export async function generateSingleSuggestionWithProvider(
  apiKey: string | undefined,
  sentence: string,
  sentenceIndex: number,
  _score: number,
  provider?: string,
  voiceProfile?: string,
  fewShotExamples?: string[],
): Promise<Suggestion | null> {
  if (!apiKey) return null;

  const adapter = createLlmAdapter(apiKey, provider);
  const payload = await twoPassRewrite(adapter, sentence, voiceProfile, fewShotExamples);
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

export async function generateSingleSuggestion(
  apiKey: string | undefined,
  sentence: string,
  sentenceIndex: number,
  score: number,
): Promise<Suggestion | null> {
  return generateSingleSuggestionWithProvider(apiKey, sentence, sentenceIndex, score);
}

function deduplicateAlternativesByRewrite(alts: LlmRewritePayload[]): LlmRewritePayload[] {
  const seen = new Set<string>();
  return alts.filter((a) => {
    const key = a.rewrite.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function generateAlternativeSuggestions(
  apiKey: string | undefined,
  sentence: string,
  sentenceIndex: number,
  _score: number,
  voiceProfile?: string,
  provider?: string,
  fewShotExamples?: string[],
): Promise<SuggestionAlternative[] | null> {
  if (!apiKey) return null;

  const adapter = createLlmAdapter(apiKey, provider);

  const result = await adapter.completeMulti({
    systemPrompt: getMultiSystemPrompt(!!fewShotExamples?.length),
    userPrompt: buildMultiUserPrompt(sentence, voiceProfile, fewShotExamples),
    temperature: 0.7,
    maxTokens: 768,
  });
  if (!result) return null;

  const payloads = parseMultiAlternativesPayload(result.content);
  if (!payloads || payloads.length === 0) return null;

  const asSuggestions = payloads.map((p) => ({
    sentence,
    rewrite: p.rewrite,
    explanation: p.explanation,
    sentenceIndex,
  }));

  const safe = applyGuardrails(asSuggestions);

  let finalSafe: typeof safe;

  if (safe.length >= 2) {
    finalSafe = safe.slice(0, 3);
  } else {
    const recoveryResult = await adapter.completeMulti({
      systemPrompt: getMultiSystemPrompt(!!fewShotExamples?.length),
      userPrompt: buildMultiUserPrompt(sentence, voiceProfile, fewShotExamples),
      temperature: 0.7,
      maxTokens: 768,
    });
    if (!recoveryResult) return null;

    const recoveryPayloads = parseMultiAlternativesPayload(recoveryResult.content);
    if (!recoveryPayloads || recoveryPayloads.length === 0) return null;

    const combined = deduplicateAlternativesByRewrite([...payloads, ...recoveryPayloads]);
    const combinedSuggestions = combined.map((p) => ({
      sentence,
      rewrite: p.rewrite,
      explanation: p.explanation,
      sentenceIndex,
    }));

    const combinedSafe = applyGuardrails(combinedSuggestions);
    if (combinedSafe.length < 2) return null;

    finalSafe = combinedSafe.slice(0, 3);
  }

  // Skip Pass2 refinement when few-shot examples are active to preserve style signal
  if (fewShotExamples && fewShotExamples.length > 0) {
    return finalSafe.map((s) => ({ rewrite: s.rewrite, explanation: s.explanation }));
  }

  const refined = await Promise.all(
    finalSafe.map(async (s) => {
      const pass2Result = await adapter.complete({
        systemPrompt: getSystemPrompt(!!fewShotExamples?.length),
        userPrompt: buildUserPrompt(s.rewrite, voiceProfile, fewShotExamples),
        temperature: 0.85,
        maxTokens: 256,
      });
      if (pass2Result) {
        const pass2Payload = parseRewritePayload(pass2Result.content);
        if (pass2Payload) {
          return { rewrite: pass2Payload.rewrite, explanation: s.explanation };
        }
      }
      return { rewrite: s.rewrite, explanation: s.explanation };
    }),
  );

  return refined;
}
