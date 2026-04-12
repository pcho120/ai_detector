import { analyzeText, createAnalysisDetectionAdapter } from '@/lib/analysis/analyzeText';
import { applyGuardrails } from '@/lib/suggestions/guardrails';
import { generateSingleSuggestionWithProvider } from '@/lib/suggestions/llm';
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

function normalizeTargetScorePercent(percent: number): number {
  if (!Number.isFinite(percent)) return 1;
  return Math.max(0, Math.min(1, percent / 100));
}

export function deriveTextWithRewrites(
  originalSentences: Array<{ sentence: string }>,
  rewrites: Record<number, string>,
): string {
  return originalSentences
    .map((entry, sentenceIndex) => rewrites[sentenceIndex] ?? entry.sentence)
    .join(' ');
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
    .map((entry) => ({ sentence: entry.sentence }));

  const apiKey = config?.llmApiKey;
  const llmProvider = config?.llmProvider;
  let workingSentences = request.sentences.slice();
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
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) break;

    let completed = 0;
    let rewrittenInRound = 0;
    const attemptedRewrites: Record<number, { text: string }> = {};

    await runWithConcurrency(candidates, CONCURRENCY, async (candidate) => {
      if (nowFn() >= deadline) return;

      const suggestion = await generateSingleSuggestionWithProvider(
        apiKey,
        candidate.sentence,
        candidate.sentenceIndex,
        candidate.score,
        llmProvider,
        request.voiceProfile,
        request.fewShotExamples,
      );

      if (suggestion) {
        const [safeSuggestion] = applyGuardrails([suggestion]);
        if (safeSuggestion) {
          rewrites[candidate.sentenceIndex] = safeSuggestion.rewrite;
          attemptedRewrites[candidate.sentenceIndex] = { text: safeSuggestion.rewrite };
          rewrittenInRound += 1;
        }
      }

      completed += 1;
      emit(completed, candidates.length, 'rewriting');
    });

    if (rewrittenInRound === 0) break;

    iterations += 1;
    emit(iterations, MAX_ROUNDS, 'analyzing');

    const mergedRewrites = { ...preserveReplacements, ...rewrites };
    const revisedText = deriveTextWithRewrites(originalSentences, mergedRewrites);
    if (nowFn() >= deadline) break;
    const reAnalysis = await analyzeText(revisedText, detectionAdapter);
    achievedScore = reAnalysis.score;
    workingSentences = reAnalysis.sentences.map((entry, sentenceIndex) => ({
      sentence: entry.sentence,
      score: entry.score,
      sentenceIndex,
    }));

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
