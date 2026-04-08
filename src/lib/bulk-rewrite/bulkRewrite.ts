import { analyzeText, createAnalysisDetectionAdapter } from '@/lib/analysis/analyzeText';
import { applyGuardrails } from '@/lib/suggestions/guardrails';
import { generateSingleSuggestionWithProvider } from '@/lib/suggestions/llm';
import type { BulkRewriteRequest, BulkRewriteResult, BulkRewriteProgress } from './types';

const MAX_ROUNDS = 3;
const CONCURRENCY = 5;
const ELIGIBLE_SCORE_FLOOR = 0.4;

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
  config?: {
    llmApiKey?: string;
    llmProvider?: string;
    detectionApiKey?: string;
    detectionProvider?: string;
  },
): Promise<BulkRewriteResult> {
  const targetScore = normalizeTargetScorePercent(request.targetScore);
  const preserveReplacements = request.manualReplacements ?? {};
  const rewrites: Record<number, string> = {};

  // Current primitive does not accept voice profile for single suggestion.
  void request.voiceProfile;

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

  const apiKey = config?.llmApiKey ?? process.env.COACHING_LLM_API_KEY;
  const llmProvider = config?.llmProvider;
  let workingSentences = request.sentences.slice();
  let iterations = 0;

  while (iterations < MAX_ROUNDS && achievedScore > targetScore) {
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

    await runWithConcurrency(candidates, CONCURRENCY, async (candidate) => {
      const suggestion = await generateSingleSuggestionWithProvider(
        apiKey,
        candidate.sentence,
        candidate.sentenceIndex,
        candidate.score,
        llmProvider,
      );

      if (suggestion) {
        const [safeSuggestion] = applyGuardrails([suggestion]);
        if (safeSuggestion) {
          rewrites[candidate.sentenceIndex] = safeSuggestion.rewrite;
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
    const reAnalysis = await analyzeText(revisedText, detectionAdapter);
    achievedScore = reAnalysis.score;
    workingSentences = reAnalysis.sentences.map((entry, sentenceIndex) => ({
      sentence: entry.sentence,
      score: entry.score,
      sentenceIndex,
    }));
  }

  return {
    rewrites,
    achievedScore: achievedScore * 100,
    iterations,
    totalRewritten: Object.keys(rewrites).length,
    targetMet: achievedScore <= targetScore,
  };
}
