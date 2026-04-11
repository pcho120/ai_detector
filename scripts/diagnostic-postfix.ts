import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, basename, resolve } from 'node:path';
import process from 'node:process';

import { SaplingDetectionAdapter } from '../src/lib/detection/sapling';
import { extractStyleSentences } from '../src/lib/style-extraction/extractSentences';
import { generateAlternativeSuggestions } from '../src/lib/suggestions/llm';
import { extractDocx } from '../src/lib/files/docx';
import { extractDoc } from '../src/lib/files/doc';
import { validateFileBuffer } from '../src/lib/files/validate';
import { withTempFile } from '../src/lib/files/temp';
import type { DetectionResult } from '../src/lib/detection/types';

type DiagnosticSentenceScore = {
  sentence: string;
  score: number;
};

type RewriteDiagnostic = {
  original: string;
  rewritten: string;
  original_score: number;
  rewritten_score: number;
};

type DiagnosticOutput = {
  generated_at: string;
  analysis_target: string;
  style_source: string;
  extracted_sentences: string[];
  baseline_overall: number;
  baseline_scores: DiagnosticSentenceScore[];
  no_fewshot_rewrites: RewriteDiagnostic[];
  fewshot_rewrites: RewriteDiagnostic[];
  control_scores: {
    overall: number;
    sentences: DiagnosticSentenceScore[];
  };
  warnings: string[];
};

const ROOT = process.cwd();
const TARGET_DOC_PATH = resolve(ROOT, 'Test-doc', 'Test.docx');
const STYLE_DOC_PATH = resolve(ROOT, 'Test-doc', 'User example paper4.docx');
const OUTPUT_PATH = resolve(ROOT, '.sisyphus', 'evidence', 'task-7-diagnostic-postfix.json');
const MIN_SELECTED_SENTENCES = 3;
const MAX_SELECTED_SENTENCES = 5;

function inferLlmProvider(apiKey: string, configuredProvider?: string): { provider: string; warning?: string } {
  const normalizedConfigured = configuredProvider?.trim().toLowerCase();
  const inferred = apiKey.startsWith('sk-ant-') ? 'anthropic' : 'openai';

  if (!normalizedConfigured) {
    return { provider: inferred };
  }

  if (normalizedConfigured === 'openai' || normalizedConfigured === 'anthropic') {
    if (normalizedConfigured === inferred) {
      return { provider: normalizedConfigured };
    }

    return {
      provider: inferred,
      warning: `LLM_PROVIDER=${normalizedConfigured} does not match the configured API key format; using inferred provider ${inferred} for diagnostics.`,
    };
  }

  return {
    provider: inferred,
    warning: `Unsupported LLM_PROVIDER=${configuredProvider}; using inferred provider ${inferred} for diagnostics.`,
  };
}

function parseEnvValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

async function loadEnvLocal(): Promise<void> {
  const envPath = resolve(ROOT, '.env.local');
  let raw: string;

  try {
    raw = await readFile(envPath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read .env.local: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = normalized.slice(0, separatorIndex).trim();
    const value = parseEnvValue(normalized.slice(separatorIndex + 1));
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

function getMimeType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.docx') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (extension === '.doc') {
    return 'application/msword';
  }
  return 'application/octet-stream';
}

async function extractDocumentText(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const filename = basename(filePath);
  const validated = validateFileBuffer(filename, getMimeType(filePath), buffer);

  return withTempFile(validated.buffer, validated.extension, async () => {
    if (validated.extension === '.docx') {
      const result = await extractDocx(validated.buffer);
      return result.text;
    }

    const result = await extractDoc(validated.buffer);
    return result.text;
  });
}

function toSentenceScores(result: DetectionResult): DiagnosticSentenceScore[] {
  return result.sentences.map((entry) => ({
    sentence: entry.sentence,
    score: entry.score,
  }));
}

async function detectStandaloneSentenceScore(
  adapter: SaplingDetectionAdapter,
  sentence: string,
): Promise<number> {
  const result = await adapter.detect(sentence);
  return result.sentences[0]?.score ?? result.score;
}

async function main(): Promise<void> {
  await loadEnvLocal();

  const saplingApiKey = process.env.SAPLING_API_KEY;
  const llmApiKey = process.env.COACHING_LLM_API_KEY;

  if (!saplingApiKey) {
    throw new Error('Missing SAPLING_API_KEY in environment or .env.local');
  }
  if (!llmApiKey) {
    throw new Error('Missing COACHING_LLM_API_KEY in environment or .env.local');
  }

  const { provider: llmProvider, warning: providerWarning } = inferLlmProvider(
    llmApiKey,
    process.env.LLM_PROVIDER,
  );

  const detectionAdapter = new SaplingDetectionAdapter(saplingApiKey);

  const [targetText, styleText] = await Promise.all([
    extractDocumentText(TARGET_DOC_PATH),
    extractDocumentText(STYLE_DOC_PATH),
  ]);

  const extractedSentences = extractStyleSentences(styleText).sentences;
  if (extractedSentences.length === 0) {
    throw new Error('No style sentences were extracted from User example paper4.docx');
  }

  const [baselineResult, controlResult] = await Promise.all([
    detectionAdapter.detect(targetText),
    detectionAdapter.detect(styleText),
  ]);

  const sortedCandidates = baselineResult.sentences
    .map((entry, sentenceIndex) => ({
      sentenceIndex,
      sentence: entry.sentence,
      score: entry.score,
    }))
    .filter((entry) => entry.sentence.trim().length > 0)
    .sort((left, right) => right.score - left.score);

  const noFewShotRewrites: RewriteDiagnostic[] = [];
  const fewShotRewrites: RewriteDiagnostic[] = [];
  const warnings: string[] = providerWarning ? [providerWarning] : [];

  for (const candidate of sortedCandidates) {
    if (noFewShotRewrites.length >= MAX_SELECTED_SENTENCES) {
      break;
    }

    const noFewShotAlternatives = await generateAlternativeSuggestions(
      llmApiKey,
      candidate.sentence,
      candidate.sentenceIndex,
      candidate.score,
      undefined,
      llmProvider,
    );
    const fewShotAlternatives = await generateAlternativeSuggestions(
      llmApiKey,
      candidate.sentence,
      candidate.sentenceIndex,
      candidate.score,
      undefined,
      llmProvider,
      extractedSentences,
    );

    const noFewShotRewrite = noFewShotAlternatives?.[0]?.rewrite?.trim();
    const fewShotRewrite = fewShotAlternatives?.[0]?.rewrite?.trim();

    if (!noFewShotRewrite || !fewShotRewrite) {
      warnings.push(`Skipped sentence ${candidate.sentenceIndex} because one of the rewrite calls returned no usable alternative.`);
      continue;
    }

    const [noFewShotScore, fewShotScore] = await Promise.all([
      detectStandaloneSentenceScore(detectionAdapter, noFewShotRewrite),
      detectStandaloneSentenceScore(detectionAdapter, fewShotRewrite),
    ]);

    noFewShotRewrites.push({
      original: candidate.sentence,
      rewritten: noFewShotRewrite,
      original_score: candidate.score,
      rewritten_score: noFewShotScore,
    });
    fewShotRewrites.push({
      original: candidate.sentence,
      rewritten: fewShotRewrite,
      original_score: candidate.score,
      rewritten_score: fewShotScore,
    });
  }

  if (noFewShotRewrites.length < MIN_SELECTED_SENTENCES || fewShotRewrites.length < MIN_SELECTED_SENTENCES) {
    throw new Error(
      `Diagnostic collected only ${Math.min(noFewShotRewrites.length, fewShotRewrites.length)} comparable rewrite pairs; need at least ${MIN_SELECTED_SENTENCES}.`,
    );
  }

  if (controlResult.score > 0.5) {
    const warning = `WARNING: control overall score is ${controlResult.score.toFixed(3)} (> 0.5) for the human-written style source.`;
    warnings.push(warning);
    console.warn(warning);
  }

  const output: DiagnosticOutput = {
    generated_at: new Date().toISOString(),
    analysis_target: 'Test-doc/Test.docx',
    style_source: 'Test-doc/User example paper4.docx',
    extracted_sentences: extractedSentences,
    baseline_overall: baselineResult.score,
    baseline_scores: toSentenceScores(baselineResult),
    no_fewshot_rewrites: noFewShotRewrites,
    fewshot_rewrites: fewShotRewrites,
    control_scores: {
      overall: controlResult.score,
      sentences: toSentenceScores(controlResult),
    },
    warnings,
  };

  await mkdir(resolve(ROOT, '.sisyphus', 'evidence'), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log(`Saved post-fix diagnostic to ${OUTPUT_PATH}`);
  console.log(`Baseline overall score: ${baselineResult.score.toFixed(3)}`);
  console.log(`Control overall score: ${controlResult.score.toFixed(3)}`);
  console.log(`Comparable rewrite pairs: ${noFewShotRewrites.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
