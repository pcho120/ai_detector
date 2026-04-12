import { analyzeText, createAnalysisDetectionAdapter } from '@/lib/analysis/analyzeText';
import { applyGuardrails } from '@/lib/suggestions/guardrails';
import {
  BULK_PROMPT_VARIATIONS,
  generateParagraphSuggestionWithProvider,
  generateSingleSuggestionWithProvider,
} from '@/lib/suggestions/llm';
import type {
  BulkRewriteEngineConfig,
  BulkRewriteRequest,
  BulkRewriteResult,
  BulkRewriteProgress,
} from './types';

// Max API call ceiling: MAX_ROUNDS × N_sentences × 2 LLM calls + MAX_ROUNDS detection calls
// At 10 rounds with 10 sentences: 10 × 10 × 2 + 10 = 210 API calls maximum
const MAX_ROUNDS = 10;
const DEFAULT_DEADLINE_MS = 50_000;
const CONCURRENCY = 5;
// Lowered to let more low/medium-score sentences participate in rewrite rounds.
const ELIGIBLE_SCORE_FLOOR = 0.05;
const PLATEAU_THRESHOLD = 0.02;
const PLATEAU_ROUNDS = 2;

type SentenceEntry = {
  sentence: string;
  sentenceIndex: number;
};

type WorkingSentence = SentenceEntry & {
  score: number;
};

function normalizeTargetScorePercent(percent: number): number {
  if (!Number.isFinite(percent)) return 1;
  return Math.max(0, Math.min(1, percent / 100));
}

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

  const sentenceRanges: Array<SentenceEntry & { start: number; end: number }> = [];
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

function normalizeSentenceForMatching(sentence: string): string {
  return sentence.replace(/\s+/g, ' ').trim();
}

function buildSentenceIndexLookup(
  originalSentences: SentenceEntry[],
  mergedRewrites: Record<number, string>,
): Map<string, number[]> {
  const lookup = new Map<string, number[]>();

  const addVariant = (text: string | undefined, sentenceIndex: number) => {
    if (!text) return;
    const normalized = normalizeSentenceForMatching(text);
    if (!normalized) return;

    const entries = lookup.get(normalized) ?? [];
    if (!entries.includes(sentenceIndex)) {
      entries.push(sentenceIndex);
      lookup.set(normalized, entries);
    }
  };

  for (const entry of originalSentences) {
    addVariant(entry.sentence, entry.sentenceIndex);
    addVariant(mergedRewrites[entry.sentenceIndex], entry.sentenceIndex);
  }

  return lookup;
}

function takeLookupMatch(
  matches: number[] | undefined,
  usedIndices: Set<number>,
  lastAssignedIndex: number,
): number | undefined {
  if (!matches) return undefined;

  return matches.find((index) => index > lastAssignedIndex && !usedIndices.has(index))
    ?? matches.find((index) => !usedIndices.has(index));
}

function getFallbackSentenceIndex(
  sentence: string,
  originalSentences: SentenceEntry[],
  mergedRewrites: Record<number, string>,
  usedIndices: Set<number>,
  lastAssignedIndex: number,
): number | undefined {
  const normalizedSentence = normalizeSentenceForMatching(sentence);
  const remaining = originalSentences.filter((entry) => !usedIndices.has(entry.sentenceIndex));
  const orderedPools = [
    remaining.filter((entry) => entry.sentenceIndex > lastAssignedIndex),
    remaining,
  ];

  for (const pool of orderedPools) {
    let bestMatch: { sentenceIndex: number; score: number } | undefined;

    for (const entry of pool) {
      const candidateTexts = [entry.sentence, mergedRewrites[entry.sentenceIndex]];
      let matchScore = Number.NEGATIVE_INFINITY;

      for (const candidateText of candidateTexts) {
        if (!candidateText) continue;
        const normalizedCandidate = normalizeSentenceForMatching(candidateText);
        if (!normalizedCandidate) continue;

        if (normalizedCandidate === normalizedSentence) {
          matchScore = 1000;
          break;
        }

        if (
          normalizedCandidate.includes(normalizedSentence)
          || normalizedSentence.includes(normalizedCandidate)
        ) {
          matchScore = Math.max(matchScore, Math.min(normalizedCandidate.length, normalizedSentence.length));
        }
      }

      if (matchScore <= Number.NEGATIVE_INFINITY) continue;

      if (
        !bestMatch
        || matchScore > bestMatch.score
        || (matchScore === bestMatch.score && entry.sentenceIndex < bestMatch.sentenceIndex)
      ) {
        bestMatch = { sentenceIndex: entry.sentenceIndex, score: matchScore };
      }
    }

    if (bestMatch) return bestMatch.sentenceIndex;
  }

  return orderedPools[0][0]?.sentenceIndex ?? orderedPools[1][0]?.sentenceIndex;
}

function rebuildWorkingSentences(
  reAnalysisSentences: Array<{ sentence: string; score: number }>,
  originalSentences: SentenceEntry[],
  mergedRewrites: Record<number, string>,
): WorkingSentence[] {
  const lookup = buildSentenceIndexLookup(originalSentences, mergedRewrites);
  const usedIndices = new Set<number>();
  let lastAssignedIndex = -1;

  return reAnalysisSentences.map((entry) => {
    const normalizedSentence = normalizeSentenceForMatching(entry.sentence);
    const lookupMatch = takeLookupMatch(lookup.get(normalizedSentence), usedIndices, lastAssignedIndex);
    const sentenceIndex = lookupMatch
      ?? getFallbackSentenceIndex(
        entry.sentence,
        originalSentences,
        mergedRewrites,
        usedIndices,
        lastAssignedIndex,
      )
      ?? originalSentences.at(-1)?.sentenceIndex
      ?? 0;

    usedIndices.add(sentenceIndex);
    lastAssignedIndex = sentenceIndex;

    return {
      sentence: entry.sentence,
      score: entry.score,
      sentenceIndex,
    };
  });
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      await task(items[current]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
}

function groupConsecutiveCandidates(
  candidates: WorkingSentence[],
  maxGroupSize: number = 4,
): Array<WorkingSentence[]> {
  const groups: Array<WorkingSentence[]> = [];
  if (candidates.length === 0) return groups;

  const pushPartitionedRun = (run: WorkingSentence[]) => {
    if (run.length <= 1) {
      groups.push(run);
      return;
    }

    let remaining = run.length;
    let offset = 0;

    while (remaining > 0) {
      if (remaining <= maxGroupSize + 1) {
        groups.push(run.slice(offset, offset + remaining));
        return;
      }

      if (remaining === 6) {
        groups.push(run.slice(offset, offset + 3));
        groups.push(run.slice(offset + 3, offset + 6));
        return;
      }

      const groupSize = 5;
      groups.push(run.slice(offset, offset + groupSize));
      offset += groupSize;
      remaining -= groupSize;
    }
  };

  let currentRun: WorkingSentence[] = [candidates[0]];

  for (let i = 1; i < candidates.length; i += 1) {
    const prev = currentRun[currentRun.length - 1];
    const curr = candidates[i];
    const isConsecutive = Math.abs(curr.sentenceIndex - prev.sentenceIndex) <= 1;

    if (isConsecutive) {
      currentRun.push(curr);
    } else {
      pushPartitionedRun(currentRun);
      currentRun = [curr];
    }
  }

  pushPartitionedRun(currentRun);
  return groups;
}

function selectMoreDiverseRewrite(
  original: string,
  candidate1: string,
  candidate2: string,
): string {
  const origWords = original.trim().split(/\s+/).length;
  const words1 = candidate1.trim().split(/\s+/).length;
  const words2 = candidate2.trim().split(/\s+/).length;
  const wordDiff1 = Math.abs(words1 - origWords);
  const wordDiff2 = Math.abs(words2 - origWords);

  const origSet = new Set(original.toLowerCase().split(/\s+/));
  const unique1 = candidate1.toLowerCase().split(/\s+/).filter(w => !origSet.has(w)).length;
  const unique2 = candidate2.toLowerCase().split(/\s+/).filter(w => !origSet.has(w)).length;

  const score1 = wordDiff1 + unique1;
  const score2 = wordDiff2 + unique2;

  return score2 > score1 ? candidate2 : candidate1;
}

function splitIntoSentences(text: string): string[] {
  const matches = text
    .match(/[^.!?]+(?:[.!?]+|$)/g)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean);

  return matches && matches.length > 0 ? matches : [text.trim()].filter(Boolean);
}

export async function executeBulkRewrite(
  request: BulkRewriteRequest,
  onProgress?: BulkRewriteProgress,
  config?: BulkRewriteEngineConfig,
): Promise<BulkRewriteResult> {
  const targetScore = normalizeTargetScorePercent(request.targetScore);
  const preserveReplacements = request.manualReplacements ?? {};
  const rewrites: Record<number, string> = {};
  const bestRewrites: Record<number, { text: string; score: number }> = {};
  const nowFn = config?.now ?? Date.now;
  const deadlineMs = config?.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const startTime = nowFn();
  const deadline = startTime + deadlineMs;

  const emit = (current: number, total: number, phase: 'rewriting' | 'analyzing') => {
    onProgress?.(current, total, phase);
  };

  const detectionAdapter = createAnalysisDetectionAdapter({
    provider: config?.detectionProvider,
    apiKey: config?.detectionApiKey,
  });
  let achievedScore = (await analyzeText(request.text, detectionAdapter)).score;

  if (achievedScore <= targetScore) {
    return {
      rewrites,
      achievedScore: achievedScore * 100,
      iterations: 0,
      totalRewritten: 0,
      targetMet: true,
    };
  }

  const originalSentences = request.sentences
    .slice()
    .sort((a, b) => a.sentenceIndex - b.sentenceIndex)
    .map((entry) => ({ sentence: entry.sentence, sentenceIndex: entry.sentenceIndex }));

  const apiKey = config?.llmApiKey;
  const llmProvider = config?.llmProvider;
  let workingSentences: WorkingSentence[] = request.sentences.slice();
  let iterations = 0;
  let previousScore = achievedScore;
  let plateauCount = 0;

  while (iterations < MAX_ROUNDS && achievedScore > targetScore && nowFn() < deadline) {
    if (nowFn() >= deadline) break;

    const candidates = workingSentences
      .filter(
        (entry) =>
          entry.score >= ELIGIBLE_SCORE_FLOOR &&
          preserveReplacements[entry.sentenceIndex] === undefined,
      )
      .sort((a, b) => a.sentenceIndex - b.sentenceIndex);

    if (candidates.length === 0) break;

    const groups = groupConsecutiveCandidates(candidates)
      .sort((a, b) => {
        const aMaxScore = Math.max(...a.map((entry) => entry.score));
        const bMaxScore = Math.max(...b.map((entry) => entry.score));
        return bMaxScore - aMaxScore || a[0].sentenceIndex - b[0].sentenceIndex;
      });

    let completed = 0;
    let rewrittenInRound = 0;
    const attemptedRewrites: Record<number, { text: string }> = {};
    const promptVariationIndex = iterations % BULK_PROMPT_VARIATIONS.length;

    await runWithConcurrency(groups, CONCURRENCY, async (group) => {
      if (nowFn() >= deadline) return;

      if (group.length === 1) {
        const candidate = group[0];
        const suggestion = await generateSingleSuggestionWithProvider(
          apiKey,
          candidate.sentence,
          candidate.sentenceIndex,
          candidate.score,
          llmProvider,
          request.voiceProfile,
          request.fewShotExamples,
          true,
          promptVariationIndex,
        );

        let chosenRewrite: string | null = null;
        if (suggestion) {
          const [safeSuggestion] = applyGuardrails([suggestion]);
          if (safeSuggestion) {
            chosenRewrite = safeSuggestion.rewrite;
          }
        }

        // Retry with different prompt variation if time permits
        const RETRY_DEADLINE_BUFFER_MS = 8_000;
        if (chosenRewrite !== null && nowFn() < deadline - RETRY_DEADLINE_BUFFER_MS) {
          const altVariationIndex = (promptVariationIndex + 1) % BULK_PROMPT_VARIATIONS.length;
          const altSuggestion = await generateSingleSuggestionWithProvider(
            apiKey,
            candidate.sentence,
            candidate.sentenceIndex,
            candidate.score,
            llmProvider,
            request.voiceProfile,
            request.fewShotExamples,
            true,
            altVariationIndex,
          );
          if (altSuggestion) {
            const [safeAlt] = applyGuardrails([altSuggestion]);
            if (safeAlt) {
              chosenRewrite = selectMoreDiverseRewrite(
                candidate.sentence,
                chosenRewrite,
                safeAlt.rewrite,
              );
            }
          }
        }

        if (chosenRewrite !== null) {
          rewrites[candidate.sentenceIndex] = chosenRewrite;
          attemptedRewrites[candidate.sentenceIndex] = { text: chosenRewrite };
          rewrittenInRound += 1;
        }
      } else {
        const paragraphText = group.map((entry) => entry.sentence).join(' ');
        const averageScore = group.reduce((sum, entry) => sum + entry.score, 0) / group.length;
        const rewrittenParagraph = await generateParagraphSuggestionWithProvider(
          apiKey,
          paragraphText,
          averageScore,
          llmProvider,
          promptVariationIndex,
        );

        if (rewrittenParagraph) {
          const rewrittenSentences = splitIntoSentences(rewrittenParagraph);
          const mappedSuggestions = group
            .slice(0, Math.min(rewrittenSentences.length, group.length))
            .map((entry, index) => ({
              sentence: entry.sentence,
              rewrite: rewrittenSentences[index],
              explanation: 'Paragraph-level bulk rewrite.',
              sentenceIndex: entry.sentenceIndex,
            }));
          const safeSuggestions = applyGuardrails(mappedSuggestions);

          for (const suggestion of safeSuggestions) {
            rewrites[suggestion.sentenceIndex] = suggestion.rewrite;
            attemptedRewrites[suggestion.sentenceIndex] = { text: suggestion.rewrite };
            rewrittenInRound += 1;
          }
        }
      }

      completed += 1;
      emit(completed, groups.length, 'rewriting');
    });

    if (rewrittenInRound === 0) break;

    iterations += 1;
    emit(iterations, MAX_ROUNDS, 'analyzing');

    const mergedRewrites = { ...preserveReplacements, ...rewrites };
    const revisedText = deriveTextWithRewrites(request.text, originalSentences, mergedRewrites);
    if (nowFn() >= deadline) break;
    const reAnalysis = await analyzeText(revisedText, detectionAdapter);
    achievedScore = reAnalysis.score;
    workingSentences = rebuildWorkingSentences(reAnalysis.sentences, originalSentences, mergedRewrites);

    for (const entry of workingSentences) {
      const attemptedRewrite = attemptedRewrites[entry.sentenceIndex];
      if (!attemptedRewrite) continue;

      const bestRewrite = bestRewrites[entry.sentenceIndex];
      if (bestRewrite && entry.score > bestRewrite.score) {
        rewrites[entry.sentenceIndex] = bestRewrite.text;
        entry.sentence = bestRewrite.text;
        entry.score = bestRewrite.score;
        continue;
      }

      bestRewrites[entry.sentenceIndex] = {
        text: attemptedRewrite.text,
        score: entry.score,
      };
    }

    if ((previousScore - achievedScore) < PLATEAU_THRESHOLD) {
      plateauCount += 1;
    } else {
      plateauCount = 0;
    }
    if (plateauCount >= PLATEAU_ROUNDS) break;
    previousScore = achievedScore;
  }

  const finalRewrites = {
    ...preserveReplacements,
    ...Object.fromEntries(
      Object.entries(bestRewrites).map(([sentenceIndex, rewrite]) => [Number(sentenceIndex), rewrite.text]),
    ),
  };

  return {
    rewrites: finalRewrites,
    achievedScore: achievedScore * 100,
    iterations,
    totalRewritten: Object.keys(bestRewrites).length,
    targetMet: achievedScore <= targetScore,
  };
}
