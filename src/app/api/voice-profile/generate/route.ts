import { NextRequest, NextResponse } from 'next/server';
import {
  type VoicePresetKey,
  type ProfileLanguage,
  PRESET_DESCRIPTORS,
  MAX_PROFILE_LENGTH,
  sanitizeVoiceProfile,
  detectProfileLanguage,
  getPresetDescriptor,
  buildProfileGenerationPrompt,
} from '@/lib/suggestions/voiceProfile';

export const runtime = 'nodejs';

const VALID_PRESET_KEYS = Object.keys(PRESET_DESCRIPTORS) as VoicePresetKey[];
const VALID_LANGUAGE_HINTS = ['en', 'ko'] as const;

export interface VoiceProfileRequest {
  presets?: VoicePresetKey[];
  writingSample?: string;
  languageHint?: 'en' | 'ko';
}

export interface VoiceProfileResponse {
  profile: string;
  language: 'en' | 'ko';
}

interface ChatChoice {
  message: { content: string | null };
}
interface ChatCompletionResponse {
  choices: ChatChoice[];
}

function isValidPresetKey(key: unknown): key is VoicePresetKey {
  return typeof key === 'string' && (VALID_PRESET_KEYS as string[]).includes(key);
}

function isValidRequest(body: unknown): body is VoiceProfileRequest {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;

  if ('presets' in b) {
    if (!Array.isArray(b.presets)) return false;
    if (b.presets.length === 0) return false;
    if (!b.presets.every(isValidPresetKey)) return false;
  }

  if ('writingSample' in b) {
    if (typeof b.writingSample !== 'string') return false;
    if (b.writingSample.trim().length === 0) return false;
  }

  if ('languageHint' in b) {
    if (!(VALID_LANGUAGE_HINTS as readonly unknown[]).includes(b.languageHint)) return false;
  }

  return true;
}

function hasAtLeastOneInputSource(body: VoiceProfileRequest): boolean {
  const hasPresets = Array.isArray(body.presets) && body.presets.length > 0;
  const hasSample = typeof body.writingSample === 'string' && body.writingSample.trim().length > 0;
  return hasPresets || hasSample;
}

function buildUserContent(presets: VoicePresetKey[] | undefined, writingSample: string | undefined): string {
  const parts: string[] = [];

  if (Array.isArray(presets) && presets.length > 0) {
    const descriptors = presets.map((key) => `- ${key}: ${getPresetDescriptor(key)}`).join('\n');
    parts.push(`Preferred style traits:\n${descriptors}`);
  }

  if (typeof writingSample === 'string' && writingSample.trim().length > 0) {
    const clamped =
      writingSample.length > MAX_PROFILE_LENGTH
        ? writingSample.slice(0, MAX_PROFILE_LENGTH)
        : writingSample;
    parts.push(`Writing sample:\n${clamped.trim()}`);
  }

  return parts.join('\n\n');
}

function resolveLanguage(
  writingSample: string | undefined,
  languageHint: 'en' | 'ko' | undefined,
): ProfileLanguage {
  if (languageHint) return languageHint;
  if (typeof writingSample === 'string' && writingSample.trim().length > 0) {
    return detectProfileLanguage(writingSample);
  }
  return 'en';
}

async function callProfileGeneration(
  apiKey: string,
  systemPrompt: string,
  userContent: string,
): Promise<string | null> {
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
        max_tokens: 512,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
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

  return content;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: 'Request body must be valid JSON.' },
      { status: 400 },
    );
  }

  if (!isValidRequest(body)) {
    return NextResponse.json(
      {
        error: 'INVALID_REQUEST',
        message:
          'Body may include presets (non-empty array of valid preset keys), writingSample (non-empty string), and languageHint ("en" | "ko"). At least one of presets or writingSample must be provided.',
      },
      { status: 400 },
    );
  }

  if (!hasAtLeastOneInputSource(body)) {
    return NextResponse.json(
      {
        error: 'INVALID_REQUEST',
        message: 'At least one of presets or writingSample must be provided.',
      },
      { status: 400 },
    );
  }

  const { presets, writingSample, languageHint } = body;
  const lang = resolveLanguage(writingSample, languageHint);
  const systemPrompt = buildProfileGenerationPrompt(lang);
  const userContent = buildUserContent(presets, writingSample);

  const apiKey = process.env.COACHING_LLM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: 'Voice profile generation is not available.' },
      { status: 503 },
    );
  }

  const rawProfile = await callProfileGeneration(apiKey, systemPrompt, userContent);

  if (!rawProfile) {
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: 'Voice profile generation failed. Please try again.' },
      { status: 503 },
    );
  }

  const profile = sanitizeVoiceProfile(rawProfile);

  if (!profile) {
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: 'Voice profile generation produced no usable output.' },
      { status: 503 },
    );
  }

  const response: VoiceProfileResponse = { profile, language: lang };
  return NextResponse.json(response, { status: 200 });
}
