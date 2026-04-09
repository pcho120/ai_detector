import type { DetectionSentenceResult } from './types';

/**
 * Represents a match location from Copyleaks API.
 * Copyleaks provides character position and length for each match.
 */
interface CopyleaksCharRange {
  starts: number[];
  lengths: number[];
}

/**
 * Represents a text match within a Copyleaks result.
 */
interface CopyleaksMatch {
  text: {
    chars: CopyleaksCharRange;
  };
}

/**
 * Represents a Copyleaks detection result with classification and matches.
 * Classification: 1 = human-written, 2 = AI-generated
 */
export interface CopyleaksResult {
  classification: number;
  matches: CopyleaksMatch[];
}

/**
 * Simple sentence splitter using period, exclamation, and question marks as delimiters.
 * Returns array of { text, startChar, endChar } for each sentence.
 */
function splitSentences(
  text: string,
): Array<{ text: string; startChar: number; endChar: number }> {
  // Match sentence boundaries: periods, exclamation marks, question marks
  // followed by optional whitespace and a space or end of string.
  const sentences: Array<{ text: string; startChar: number; endChar: number }> = [];

  // Split on sentence-ending punctuation
  const sentencePattern = /[.!?]+(?=\s+|$)/g;
  let lastIndex = 0;
  let match;

  // Create a copy of pattern for iteration
  const regex = new RegExp(sentencePattern);

  while ((match = regex.exec(text)) !== null) {
    const endIndex = match.index + match[0].length;
    const sentenceText = text.substring(lastIndex, endIndex).trim();

    if (sentenceText.length > 0) {
      // Record actual character positions in the original text
      const startCharInOriginal = text.indexOf(sentenceText, lastIndex);
      sentences.push({
        text: sentenceText,
        startChar: startCharInOriginal,
        endChar: startCharInOriginal + sentenceText.length,
      });
    }

    lastIndex = endIndex;
  }

  // Handle remaining text after last sentence-ending punctuation
  const remainingText = text.substring(lastIndex).trim();
  if (remainingText.length > 0) {
    const startCharInOriginal = text.indexOf(remainingText, lastIndex);
    sentences.push({
      text: remainingText,
      startChar: startCharInOriginal,
      endChar: startCharInOriginal + remainingText.length,
    });
  }

  // If no sentences were found by punctuation, treat entire text as one sentence
  if (sentences.length === 0 && text.trim().length > 0) {
    const trimmedText = text.trim();
    const startChar = text.indexOf(trimmedText);
    sentences.push({
      text: trimmedText,
      startChar,
      endChar: startChar + trimmedText.length,
    });
  }

  return sentences;
}

/**
 * Extract character ranges that are marked as AI (classification === 2) from Copyleaks results.
 */
function extractAICharRanges(results: CopyleaksResult[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  for (const result of results) {
    // Only process AI-classified results (classification === 2)
    if (result.classification === 2) {
      for (const match of result.matches) {
        const { starts, lengths } = match.text.chars;
        // starts and lengths are parallel arrays
        for (let i = 0; i < starts.length; i++) {
          const start = starts[i];
          const length = lengths[i];
          ranges.push([start, start + length]);
        }
      }
    }
  }

  return ranges;
}

/**
 * Extract character ranges that are marked as human (classification === 1) from Copyleaks results.
 */
function extractHumanCharRanges(results: CopyleaksResult[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];

  for (const result of results) {
    // Only process human-classified results (classification === 1)
    if (result.classification === 1) {
      for (const match of result.matches) {
        const { starts, lengths } = match.text.chars;
        // starts and lengths are parallel arrays
        for (let i = 0; i < starts.length; i++) {
          const start = starts[i];
          const length = lengths[i];
          ranges.push([start, start + length]);
        }
      }
    }
  }

  return ranges;
}

/**
 * Check if a sentence (character range) overlaps with any range in the given array.
 */
function hasOverlap(sentenceStart: number, sentenceEnd: number, ranges: Array<[number, number]>): boolean {
  for (const [rangeStart, rangeEnd] of ranges) {
    // Check for overlap: [a, b) overlaps [c, d) if a < d and c < b
    if (sentenceStart < rangeEnd && rangeStart < sentenceEnd) {
      return true;
    }
  }
  return false;
}

/**
 * Map Copyleaks detection results to sentence-level scores.
 *
 * Algorithm:
 * 1. Split text into sentences using simple punctuation-based splitting
 * 2. Extract AI character ranges (classification === 2) and human ranges (classification === 1)
 * 3. For each sentence:
 *    - If overlaps with AI range → score: 1.0
 *    - If overlaps with human range → score: 0.0
 *    - If no overlap → score: 0.5 (ambiguous/unclassified)
 */
export function mapCopyleaksResultsToSentences(
  text: string,
  results: CopyleaksResult[],
): DetectionSentenceResult[] {
  const sentences = splitSentences(text);
  const aiRanges = extractAICharRanges(results);
  const humanRanges = extractHumanCharRanges(results);

  return sentences.map((sentence) => {
    let score: number;

    // Check for AI overlap first (highest priority)
    if (hasOverlap(sentence.startChar, sentence.endChar, aiRanges)) {
      score = 1.0;
    }
    // Then check for human overlap
    else if (hasOverlap(sentence.startChar, sentence.endChar, humanRanges)) {
      score = 0.0;
    }
    // Default to ambiguous/unclassified
    else {
      score = 0.5;
    }

    return {
      sentence: sentence.text,
      score,
    };
  });
}
