export interface SentenceScore {
  sentence: string;
  score: number;
}

export interface HighlightSpan {
  start: number;
  end: number;
  score: number;
  label: RiskLabel;
  sentenceIndex: number;
}

export type RiskLabel = 'low' | 'medium' | 'high';

export const HIGH_RISK_THRESHOLD = 0.7;
export const MEDIUM_RISK_THRESHOLD = 0.4;

function collapseWhitespace(s: string): string {
  return s.replace(/[\s\u00a0\u200b\u3000]+/g, ' ').trim();
}

function stripOuterPunct(s: string): string {
  return s
    .replace(/^[\s\u00a0.,;:!?'"»«()\[\]{}\-–—]+/, '')
    .replace(/[\s\u00a0.,;:!?'"»«()\[\]{}\-–—]+$/, '');
}

function normStrict(s: string): string {
  return collapseWhitespace(s).toLowerCase();
}

function normLoose(s: string): string {
  return stripOuterPunct(collapseWhitespace(s)).toLowerCase();
}

/**
 * Sliding-window search: finds the first occurrence of needle in text starting
 * at fromIndex. Two-pass normalisation: strict (whitespace-only collapse) first,
 * then loose (also strips outer punctuation) to handle detectors that omit
 * leading/trailing sentence delimiters. Expands windows up to needleLen+20 chars
 * to tolerate surrounding punctuation. Early-bails on normalised-window overshoot
 * to avoid quadratic blowup. Returns {start, end} into the original text or null.
 */
export function findSentenceInText(
  text: string,
  sentence: string,
  fromIndex: number,
): { start: number; end: number } | null {
  const strictNeedle = normStrict(sentence);
  const looseNeedle = normLoose(sentence);

  if (strictNeedle.length === 0 && looseNeedle.length === 0) return null;

  const textLen = text.length;
  const needleLen = strictNeedle.length || looseNeedle.length;
  const maxWindow = needleLen + 20;

  for (let i = fromIndex; i < textLen; i++) {
    if (/[\s.,;:!?]/.test(text[i])) continue;

    for (let winLen = needleLen; winLen <= maxWindow && i + winLen <= textLen; winLen++) {
      const windowSlice = text.slice(i, i + winLen);
      const strictWindow = normStrict(windowSlice);
      const looseWindow = normLoose(windowSlice);

      if (strictWindow === strictNeedle || looseWindow === looseNeedle) {
        return { start: i, end: i + winLen };
      }

      if (looseWindow.length > looseNeedle.length + 5) break;
    }
  }

  return null;
}

export function buildHighlightSpans(
  text: string,
  sentences: SentenceScore[],
): HighlightSpan[] {
  if (sentences.length === 0) return [];

  const spans: HighlightSpan[] = [];
  const lastMatchEnd = new Map<string, number>();

  for (let idx = 0; idx < sentences.length; idx++) {
    const { sentence, score } = sentences[idx];
    const dedupKey = normLoose(sentence);
    if (dedupKey.length === 0) continue;

    const searchFrom = lastMatchEnd.get(dedupKey) ?? 0;
    const match = findSentenceInText(text, sentence, searchFrom);

    if (match === null) continue;

    lastMatchEnd.set(dedupKey, match.end);

    spans.push({
      start: match.start,
      end: match.end,
      score,
      label: scoreToLabel(score),
      sentenceIndex: idx,
    });
  }

  spans.sort((a, b) => a.start - b.start);

  return spans;
}

export function scoreToLabel(score: number): RiskLabel {
  if (score >= HIGH_RISK_THRESHOLD) return 'high';
  if (score >= MEDIUM_RISK_THRESHOLD) return 'medium';
  return 'low';
}
