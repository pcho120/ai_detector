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
import { createLlmAdapter } from '@/lib/suggestions/llm-adapter';
import { getRequestSettings } from '@/lib/api/requestSettings';

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

  const settings = getRequestSettings(request);
  const llmApiKey = settings.llmApiKey;
  const llmProvider = settings.llmProvider;

  if (!llmApiKey) {
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: 'Voice profile generation is not available.' },
      { status: 503 },
    );
  }

  let adapter: ReturnType<typeof createLlmAdapter>;
  try {
    adapter = createLlmAdapter(llmApiKey, llmProvider);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('not yet implemented')) {
      return NextResponse.json(
        { error: 'SERVICE_UNAVAILABLE', message: `${llmProvider} is not yet implemented` },
        { status: 501 },
      );
    }
    throw err;
  }

  let response: Awaited<ReturnType<typeof adapter.complete>>;
  try {
    response = await adapter.complete({
      systemPrompt,
      userPrompt: userContent,
      temperature: 0.4,
      maxTokens: 512,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('not yet implemented')) {
      return NextResponse.json(
        { error: 'SERVICE_UNAVAILABLE', message: `${llmProvider} is not yet implemented` },
        { status: 501 },
      );
    }
    throw err;
  }

  const rawProfile = response?.content ?? null;

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

  const voiceProfileResponse: VoiceProfileResponse = { profile, language: lang };
  return NextResponse.json(voiceProfileResponse, { status: 200 });
}
