/**
 * Client-safe text utility functions for bulk rewrite operations.
 * This module has NO server-only dependencies and can be imported in 'use client' files.
 */

export function deriveTextWithRewrites(
  originalText: string,
  originalSentences: Array<{ sentence: string; sentenceIndex?: number }>,
  rewrites: Record<number, string>,
): string {
  if (originalSentences.length === 0) return originalText;

  const indexedSentences = originalSentences.map((entry, sentenceIndex) => ({
    sentence: entry.sentence,
    sentenceIndex: entry.sentenceIndex ?? sentenceIndex,
  }));

  const sentenceRanges: Array<{ sentence: string; sentenceIndex: number; start: number; end: number }> = [];
  let searchFrom = 0;

  for (const entry of indexedSentences) {
    let start = originalText.indexOf(entry.sentence, searchFrom);
    if (start === -1) {
      start = originalText.indexOf(entry.sentence);
    }
    if (start === -1) continue;

    const end = start + entry.sentence.length;
    sentenceRanges.push({ ...entry, start, end });
    searchFrom = end;
  }

  let result = originalText;
  for (const entry of sentenceRanges.sort((a, b) => b.start - a.start)) {
    const rewrite = rewrites[entry.sentenceIndex];
    if (rewrite === undefined) continue;
    result = `${result.slice(0, entry.start)}${rewrite}${result.slice(entry.end)}`;
  }

  return result;
}
