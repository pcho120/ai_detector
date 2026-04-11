export type VoicePresetKey =
  | 'academic'
  | 'conversational'
  | 'formal'
  | 'narrative'
  | 'technical';

export const PRESET_DESCRIPTORS: Readonly<Record<VoicePresetKey, string>> = {
  academic:
    'precise, evidence-driven prose with clear logical structure and minimal hedging',
  conversational:
    'approachable, first-person tone with natural contractions and direct address',
  formal:
    'polished, impersonal register suitable for professional or institutional contexts',
  narrative:
    'story-driven voice with vivid details, active verbs, and a clear authorial perspective',
  technical:
    'concise, jargon-appropriate writing with exact terminology and step-by-step clarity',
};

const WRAPPER_PATTERNS: RegExp[] = [
  /^your\s+voice\s+profile\s+is\s*:?\s*/i,
  /^voice\s+profile\s*:?\s*/i,
  /^my\s+writing\s+style\s+is\s*:?\s*/i,
  /^writing\s+style\s*:?\s*/i,
  /^style\s+profile\s*:?\s*/i,
  /^당신의\s*목소리는\s*:?\s*/,
  /^목소리\s*프로필\s*:?\s*/,
  /^나의\s*글쓰기\s*스타일은\s*:?\s*/,
  /^글쓰기\s*스타일\s*:?\s*/,
];

/**
 * Matches the Korean full-sentence copy wrapper: 당신의 목소리는 '...' 입니다.
 * Captures the body between the single quotes.
 */
const KOREAN_FULL_SENTENCE_WRAPPER = /^당신의\s*목소리는\s*'(.*)'\s*입니다\.\s*$/s;

export const MAX_PROFILE_LENGTH = 2000;
export const MAX_FEWSHOT_CONTEXT_LENGTH = 3000;

export function sanitizeVoiceProfile(raw: string): string {
  if (!raw) return '';

  let text = raw.trim();

  const koFullMatch = KOREAN_FULL_SENTENCE_WRAPPER.exec(text);
  if (koFullMatch) {
    text = koFullMatch[1].trim();
  } else {
    for (const pattern of WRAPPER_PATTERNS) {
      if (pattern.test(text)) {
        text = text.replace(pattern, '');
        break;
      }
    }
    text = text.trim();
  }

  if (text.length > MAX_PROFILE_LENGTH) {
    text = text.slice(0, MAX_PROFILE_LENGTH);
  }

  return text;
}

export type ProfileLanguage = 'en' | 'ko';

/**
 * Returns 'ko' if Hangul syllables (U+AC00–U+D7A3), Jamo (U+1100–U+11FF),
 * or Compat Jamo (U+3130–U+318F) are present; otherwise 'en'.
 */
export function detectProfileLanguage(text: string): ProfileLanguage {
  const HANGUL_RE = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;
  return HANGUL_RE.test(text) ? 'ko' : 'en';
}

export function getPresetDescriptor(key: VoicePresetKey): string {
  const descriptor = PRESET_DESCRIPTORS[key];
  if (descriptor === undefined) {
    throw new TypeError(`Unknown voice preset key: "${String(key)}"`);
  }
  return descriptor;
}

export function buildProfileGenerationPrompt(lang: ProfileLanguage = 'en'): string {
  if (lang === 'ko') {
    return (
      '당신은 글쓰기 코치입니다. ' +
      '제공된 글 샘플을 분석하여 저자의 고유한 목소리를 간결하게 설명하세요. ' +
      '문체, 어조, 문장 구조, 어휘 선택의 특징을 포함하세요. ' +
      '감지 회피나 AI 점수에 대한 언급은 절대 하지 마세요. ' +
      '결과는 한국어로 작성하세요.'
    );
  }

  return (
    'You are a writing coach. ' +
    'Analyse the provided writing sample and concisely describe the author\'s distinctive voice. ' +
    'Include characteristics of style, tone, sentence structure, and vocabulary choice. ' +
    'Do NOT mention AI detection, evasion, or scores. ' +
    'Write the profile in English.'
  );
}

export function buildRewriteContextBlock(
  profile: string,
  lang: ProfileLanguage = 'en',
): string {
  const trimmed = profile.trim();
  if (!trimmed) return '';

  if (lang === 'ko') {
    return `작성자의 목소리 프로필:\n${trimmed}`;
  }

  return `Author voice profile:\n${trimmed}`;
}

export function buildFewShotContextBlock(sentences: string[]): string {
  if (!sentences || sentences.length === 0) return '';

  const header = `You will rewrite text to match a specific author's writing style.\n\n`
    + `First, analyze the author's style from these examples:\n\n`;

  const footer = `\nConsider these style dimensions:\n`
    + `- Vocabulary: What word choices characterize this author? (formal/informal, technical/accessible, specific/general)\n`
    + `- Sentence structure: What are their sentence length and complexity patterns?\n`
    + `- Tone: What is the emotional register and formality level?\n`
    + `- Transitions: How does the author connect ideas and build arguments?\n\n`
    + `Now rewrite the following text to authentically match this author's voice. The rewrite must feel like this specific person wrote it, not like generic AI or a different writer.`;

  let body = '';
  for (let i = 0; i < sentences.length; i++) {
    const line = `Example ${i + 1}: "${sentences[i]}"\n`;
    const candidate = header + body + line + footer;
    if (candidate.length > MAX_FEWSHOT_CONTEXT_LENGTH) {
      if (body.length > 0) break;
    }
    body += line;
  }

  if (!body) return '';

  return header + body + footer;
}
