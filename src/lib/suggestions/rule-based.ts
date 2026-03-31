import type { Suggestion, SentenceEntry, SuggestionService } from './types';
import { applyGuardrails } from './guardrails';

interface CoachingRule {
  pattern: RegExp;
  explanation: string;
  rewriteHint: string;
}

const COACHING_RULES: CoachingRule[] = [
  {
    pattern: /\b(in conclusion|to summarize|to sum up|in summary)\b/i,
    explanation: 'Formulaic conclusion phrases signal AI writing. Try closing with a specific insight or call to action instead.',
    rewriteHint: 'Replace the formulaic opener with a concrete closing thought that ties back to your main argument.',
  },
  {
    pattern: /\b(furthermore|moreover|additionally|in addition)\b/i,
    explanation: 'Stacked connector words are a common AI pattern. Use a sentence that makes the logical link explicit instead.',
    rewriteHint: 'Cut the connector and rewrite so the new idea follows naturally from the previous sentence.',
  },
  {
    pattern: /\b(it is (important|crucial|essential|worth noting) (to note|that|to))\b/i,
    explanation: '"It is important to note" is a filler phrase that adds no information. State what matters directly.',
    rewriteHint: 'Drop the filler phrase and make the point directly: what matters, and why.',
  },
  {
    pattern: /\b(it should be noted that|it is worth noting that)\b/i,
    explanation: 'Passive-voice throat-clearing adds length without meaning. Lead with the substantive claim.',
    rewriteHint: 'Start with the subject making the claim rather than the meta-commentary.',
  },
  {
    pattern: /\b(delve into|delve deeper|delve further)\b/i,
    explanation: '"Delve" is a strong AI-writing marker rarely used in natural prose. Choose a more direct verb.',
    rewriteHint: 'Replace "delve into" with examine, explore, analyse, or simply discuss.',
  },
  {
    pattern: /\b(utilization|utilise|utilize)\b/i,
    explanation: '"Utilization" / "utilize" is a nominalization common in AI text. "Use" is clearer and more direct.',
    rewriteHint: 'Substitute "utilize" or "utilization" with the simpler verb "use".',
  },
  {
    pattern: /\b(it is (widely|generally|commonly|broadly) (accepted|acknowledged|recognized|understood))\b/i,
    explanation: 'Vague attribution ("widely accepted") avoids specificity. Cite who accepts it, or restate as your own claim.',
    rewriteHint: 'Name the source or community that holds this view, or own the statement as your own position.',
  },
  {
    pattern: /\b(in today's (society|world|era|age|day and age))\b/i,
    explanation: '"In today\'s world" is an overused framing device. Ground the idea in a specific context instead.',
    rewriteHint: 'Replace the vague framing with a concrete context: a specific field, era, or situation.',
  },
  {
    pattern: /\b(the (importance|significance|impact) of .{1,40} (cannot be|can't be) (overstated|understated))\b/i,
    explanation: 'Superlative importance claims are cliché filler. Make the specific claim instead.',
    rewriteHint: 'State directly what the importance or impact is, rather than asserting it cannot be measured.',
  },
  {
    pattern: /\b(plays? a (crucial|vital|key|significant|important|pivotal) role in)\b/i,
    explanation: '"Plays a crucial role" is vague. Describe the specific mechanism or contribution instead.',
    rewriteHint: 'Replace with a verb that shows the mechanism: "drives", "shapes", "determines", "enables".',
  },
  {
    pattern: /\b(has (the potential|the ability) to|has potential to)\b/i,
    explanation: '"Has the potential to" hedges unnecessarily when you can make the claim directly.',
    rewriteHint: 'If the statement is true, assert it directly. If uncertain, quantify the uncertainty.',
  },
  {
    pattern: /\b(a wide (range|variety|array) of)\b/i,
    explanation: '"A wide range of" is a vague quantifier. Specify the scope or give examples.',
    rewriteHint: 'Name the specific things in the range, or use "many" if specificity is unavailable.',
  },
];

function buildSuggestion(entry: SentenceEntry, rule: CoachingRule): Suggestion {
  return {
    sentence: entry.sentence,
    rewrite: rule.rewriteHint,
    explanation: rule.explanation,
    sentenceIndex: entry.index,
  };
}

export class RuleBasedSuggestionService implements SuggestionService {
  async suggest(sentences: SentenceEntry[]): Promise<Suggestion[]> {
    const raw: Suggestion[] = [];

    for (const entry of sentences) {
      for (const rule of COACHING_RULES) {
        if (rule.pattern.test(entry.sentence)) {
          raw.push(buildSuggestion(entry, rule));
          break;
        }
      }
    }

    return applyGuardrails(raw);
  }
}
