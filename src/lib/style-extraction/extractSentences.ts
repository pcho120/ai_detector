import { MAX_PROFILE_LENGTH } from '@/lib/suggestions/voiceProfile';
import type { StyleExtractionResult } from './types';

export const MIN_STYLE_TEXT_LENGTH = 500;
export const MAX_STYLE_TEXT_LENGTH = 50000;
export const DEFAULT_SENTENCE_COUNT = 5;
const MIN_SENTENCE_LENGTH = 20;
const MAX_SENTENCE_LENGTH = 300;

const ABBREVIATION_PATTERN = /(?:^|\s)(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|fig|al|e\.g|i\.e|u\.s|u\.k)\.$/i;
const MULTI_INITIAL_PATTERN = /(?:^|\s)(?:[A-Za-z]\.){2,}$/;
const LIST_ITEM_PATTERN = /^\s*(?:\d+\.|[a-z]\)|[-•])\s+/i;
const URL_PATTERN = /(?:https?:\/\/|www\.)/i;
const CITATION_PATTERN = /\([A-Z][a-z]+,?\s+\d{4}\)|\[\d+\]/;
const REFERENCE_ENTRY_PATTERN = /^(?:[A-Z][A-Za-z'’.-]+,\s*(?:[A-Z]\.\s*)+(?:,\s*)?)+(?:\(?\d{4}[a-z]?\)?)/;
const FIGURE_CAPTION_PATTERN = /^\s*(?:Fig\.|Figure|Table)\s+\d+/i;
const AUTHOR_YEAR_LEAD_PATTERN = /^[A-Z][A-Za-z'’.-]+\s+\(\d{4}[a-z]?\)/;
const REFERENCES_SECTION_PATTERN = /^References\s+[A-Z][A-Za-z'’.,-]+(?:\s*,|\s+[A-Z]\.)/;
const DEFINITION_FORMAT_PATTERN = /^[A-Z][A-Za-z\s]{2,60}:\s/;

type LengthBucket = 'short' | 'medium' | 'long';
type PositionBucket = 'first' | 'middle' | 'last';

interface CandidateEntry {
  sentence: string;
  lengthBucket: LengthBucket;
  positionBucket: PositionBucket;
}

function isSentenceBoundary(text: string, index: number): boolean {
  const current = text[index];
  if (current !== '.' && current !== '?' && current !== '!') {
    return false;
  }

  const next = text[index + 1];
  if (next !== undefined && !/\s/.test(next)) {
    return false;
  }

  if (current === '.') {
    const sliceStart = Math.max(0, index - 20);
    const tail = text.slice(sliceStart, index + 1);
    if (ABBREVIATION_PATTERN.test(tail) || MULTI_INITIAL_PATTERN.test(tail)) {
      return false;
    }

    const tailToken = text.slice(Math.max(0, index - 24), index + 1);
    if (/(?:^|\s)\d+\.$/.test(tailToken)) {
      return false;
    }
  }

  return true;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isAllCapsSentence(sentence: string): boolean {
  const letters = sentence.match(/[A-Za-z]/g);
  if (!letters || letters.length < 5) {
    return false;
  }

  return sentence === sentence.toUpperCase() && !/[a-z]/.test(sentence);
}

function isMostlyNumbersOrSymbols(sentence: string): boolean {
  const letters = sentence.match(/[A-Za-z]/g)?.length ?? 0;
  const digits = sentence.match(/\d/g)?.length ?? 0;
  const symbols = sentence.match(/[^A-Za-z0-9\s]/g)?.length ?? 0;
  const significantChars = letters + digits + symbols;

  if (significantChars === 0) {
    return true;
  }

  return letters / significantChars < 0.45;
}

function getLengthBucket(sentence: string): LengthBucket {
  if (sentence.length < 60) {
    return 'short';
  }
  if (sentence.length <= 120) {
    return 'medium';
  }
  return 'long';
}

function getPositionBucket(index: number, total: number): PositionBucket {
  if (total <= 1) {
    return 'first';
  }

  const firstCutoff = Math.ceil(total / 3);
  const secondCutoff = Math.ceil((2 * total) / 3);

  if (index < firstCutoff) {
    return 'first';
  }
  if (index < secondCutoff) {
    return 'middle';
  }
  return 'last';
}

function fitsProfileBudget(sentences: string[]): boolean {
  return JSON.stringify(sentences).length <= MAX_PROFILE_LENGTH;
}

export function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (!isSentenceBoundary(text, index)) {
      continue;
    }

    const sentence = normalizeWhitespace(text.slice(start, index + 1));
    if (sentence) {
      sentences.push(sentence);
    }

    start = index + 1;
  }

  const trailing = normalizeWhitespace(text.slice(start));
  if (trailing) {
    sentences.push(trailing);
  }

  return sentences;
}

export function filterCandidates(sentences: string[]): string[] {
  const seen = new Set<string>();

  return sentences.filter((rawSentence) => {
    const sentence = normalizeWhitespace(rawSentence);
    if (!sentence || seen.has(sentence)) {
      return false;
    }
    if (sentence.length < MIN_SENTENCE_LENGTH || sentence.length > MAX_SENTENCE_LENGTH) {
      return false;
    }
    if (isAllCapsSentence(sentence)) {
      return false;
    }
    if (LIST_ITEM_PATTERN.test(sentence)) {
      return false;
    }
    if (URL_PATTERN.test(sentence)) {
      return false;
    }
    if (CITATION_PATTERN.test(sentence)) {
      const stripped = sentence.replace(CITATION_PATTERN, '').trim();
      if (stripped.length < 30) {
        return false;
      }
    }
    if (REFERENCE_ENTRY_PATTERN.test(sentence)) {
      return false;
    }
    if (AUTHOR_YEAR_LEAD_PATTERN.test(sentence)) {
      const strippedLead = sentence.replace(AUTHOR_YEAR_LEAD_PATTERN, '').trim();
      if (strippedLead.length < 30) {
        return false;
      }
    }
    if (FIGURE_CAPTION_PATTERN.test(sentence)) {
      return false;
    }
    if (isMostlyNumbersOrSymbols(sentence)) {
      return false;
    }

    if (sentence.split(/\s+/).filter(Boolean).length < 5) {
      return false;
    }

    if (REFERENCES_SECTION_PATTERN.test(sentence)) {
      return false;
    }

    const words = sentence.replace(/[.!?]$/, '').split(/\s+/).filter(Boolean);
    const significantWords = words.filter((word) => word.replace(/[^A-Za-z]/g, '').length > 3);
    const isTitleCaseHeading =
      words.length <= 8 &&
      !sentence.includes(',') &&
      significantWords.length > 0 &&
      significantWords.every((word) => /^[A-Z]/.test(word));
    const isShortFragmentHeading =
      words.length <= 8 &&
      !sentence.includes(',') &&
      !/\b(?:is|are|was|were|be|being|been|am|has|have|had|do|does|did|can|could|may|might|must|shall|should|will|would)\b/i.test(sentence) &&
      !/\b\w+(?:ed|es)\b/.test(sentence) &&
      /\b\w+ing\b/i.test(sentence);
    if (isTitleCaseHeading || isShortFragmentHeading) {
      return false;
    }

    if (DEFINITION_FORMAT_PATTERN.test(sentence)) {
      return false;
    }

    seen.add(sentence);
    return true;
  });
}

export function selectDiverse(candidates: string[], count: number): string[] {
  if (count <= 0 || candidates.length === 0) {
    return [];
  }

  const entries: CandidateEntry[] = candidates.map((sentence, index, all) => ({
    sentence,
    lengthBucket: getLengthBucket(sentence),
    positionBucket: getPositionBucket(index, all.length),
  }));

  const buckets: Record<LengthBucket, Record<PositionBucket, CandidateEntry[]>> = {
    short: { first: [], middle: [], last: [] },
    medium: { first: [], middle: [], last: [] },
    long: { first: [], middle: [], last: [] },
  };

  for (const entry of entries) {
    buckets[entry.lengthBucket][entry.positionBucket].push(entry);
  }

  const selected: string[] = [];
  const positionUsage: Record<PositionBucket, number> = {
    first: 0,
    middle: 0,
    last: 0,
  };
  const lengthOrder: LengthBucket[] = ['medium', 'short', 'long'];
  let cycleStart = 0;
  let lastPosition: PositionBucket | null = null;

  while (selected.length < count) {
    let pickedInCycle = false;

    for (let step = 0; step < lengthOrder.length && selected.length < count; step += 1) {
      const lengthBucket = lengthOrder[(cycleStart + step) % lengthOrder.length];
      const positionOrder = (['first', 'middle', 'last'] as PositionBucket[]).sort((left, right) => {
        const usageDelta = positionUsage[left] - positionUsage[right];
        if (usageDelta !== 0) {
          return usageDelta;
        }
        if (left === lastPosition) {
          return 1;
        }
        if (right === lastPosition) {
          return -1;
        }
        return 0;
      });

      const source = positionOrder
        .map((positionBucket) => buckets[lengthBucket][positionBucket])
        .find((bucket) => bucket.length > 0);

      if (!source) {
        continue;
      }

      const next = source.shift();
      if (!next) {
        continue;
      }

      selected.push(next.sentence);
      positionUsage[next.positionBucket] += 1;
      lastPosition = next.positionBucket;
      pickedInCycle = true;
    }

    if (!pickedInCycle) {
      break;
    }

    cycleStart = (cycleStart + 1) % lengthOrder.length;
  }

  while (selected.length > 0 && !fitsProfileBudget(selected)) {
    selected.pop();
  }

  return selected;
}

export function extractStyleSentences(
  text: string,
  count: number = DEFAULT_SENTENCE_COUNT,
): StyleExtractionResult {
  if (text.length < MIN_STYLE_TEXT_LENGTH) {
    return {
      sentences: [],
      count: 0,
      sourceCharCount: text.length,
    };
  }

  const boundedText = text.length > MAX_STYLE_TEXT_LENGTH ? text.slice(0, MAX_STYLE_TEXT_LENGTH) : text;
  const sentences = selectDiverse(filterCandidates(splitIntoSentences(boundedText)), count);

  return {
    sentences,
    count: sentences.length,
    sourceCharCount: text.length,
  };
}
