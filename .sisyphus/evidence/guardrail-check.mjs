import { readFileSync, writeFileSync } from 'fs';

const BANNED_PATTERNS = [
  /avoid\s+detection/i,
  /bypass\s+(the\s+)?(ai|detection|checker|tool)/i,
  /undetect(able|ed)/i,
  /fool\s+(the|an?)?\s*(ai|detector|checker)/i,
  /make\s+it\s+(look|seem)\s+(human|natural|less\s+ai)/i,
  /lower\s+(your|the)\s+(ai\s+)?score/i,
  /cheat\s+(the|an?)?\s*(detector|checker|tool)/i,
  /evade\s+(detection|ai|checker)/i,
  /defeat\s+(the|an?)?\s*(detector|checker|ai)/i,
  /trick\s+(the|an?)?\s*(detector|checker|ai)/i,
];

// Read the actual file to extract prompt text
const fileContent = readFileSync('src/lib/suggestions/llm.ts', 'utf-8');

// Extract BULK_SYSTEM_PROMPT
const bulkPromptMatch = fileContent.match(/export const BULK_SYSTEM_PROMPT = `([\s\S]*?)`;/);
const bulkPrompt = bulkPromptMatch ? bulkPromptMatch[1] : '';

// Extract each variation from BULK_PROMPT_VARIATIONS
const variationsMatch = fileContent.match(/export const BULK_PROMPT_VARIATIONS: string\[\] = \[([\s\S]*?)\];/);
const variationsBlock = variationsMatch ? variationsMatch[1] : '';
const variations = [];
const varRegex = /`([\s\S]*?)`/g;
let m;
while ((m = varRegex.exec(variationsBlock)) !== null) {
  variations.push(m[1]);
}

const allTexts = [
  { name: 'BULK_SYSTEM_PROMPT', text: bulkPrompt },
  ...variations.map((v, i) => ({ name: `BULK_PROMPT_VARIATIONS[${i}]`, text: v })),
];

let allPassed = true;
const results = [];

results.push('=== Guardrail Compatibility Check ===');
results.push(`Date: ${new Date().toISOString()}`);
results.push(`Banned patterns count: ${BANNED_PATTERNS.length}`);
results.push(`Prompt texts to check: ${allTexts.length}`);
results.push('');

for (const { name, text } of allTexts) {
  let matched = false;
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(text)) {
      results.push(`FAIL: ${name} matches banned pattern: ${pattern.toString()}`);
      allPassed = false;
      matched = true;
    }
  }
  if (!matched) {
    results.push(`PASS: ${name} — no banned patterns found`);
  }
}

results.push('');
results.push(allPassed ? 'RESULT: ALL PROMPTS PASS GUARDRAILS CHECK ✓' : 'RESULT: SOME PROMPTS FAILED GUARDRAILS CHECK ✗');

const output = results.join('\n');
console.log(output);
writeFileSync('.sisyphus/evidence/task-2-guardrail-check.txt', output, 'utf-8');
