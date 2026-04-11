import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SENTENCE_COUNT,
  MIN_STYLE_TEXT_LENGTH,
  extractStyleSentences,
  filterCandidates,
  selectDiverse,
  splitIntoSentences,
} from '../extractSentences';

function padText(text: string, minLength: number = MIN_STYLE_TEXT_LENGTH): string {
  let value = text;

  while (value.length < minLength) {
    value += ` Additional context explains the methodology in a precise and readable way (${value.length}).`;
  }

  return value;
}

describe('splitIntoSentences', () => {
  it('does not split on common abbreviations', () => {
    const text =
      'Dr. Rivera reviewed the archive before sunrise. Mr. Chen summarized the findings clearly. The final section closed the argument well.';

    expect(splitIntoSentences(text)).toEqual([
      'Dr. Rivera reviewed the archive before sunrise.',
      'Mr. Chen summarized the findings clearly.',
      'The final section closed the argument well.',
    ]);
  });
});

describe('filterCandidates', () => {
  it('removes garbage patterns and preserves real prose', () => {
    const candidates = [
      'INTRODUCTION OVERVIEW RESULTS',
      '1. Gather all source files before comparing the revisions.',
      'a) Record every baseline metric before the intervention begins.',
      '- Remove duplicate rows before exporting the appendix.',
      'Visit https://example.com/archive for the raw tables.',
      'The effect remained stable across semesters (Smith 2020).',
      'The replication produced a measurable improvement in student confidence.',
      'Johnson, A. B. (2020). Reference entry for the bibliography section.',
      'Figure 2 demonstrates the calibration workflow in detail.',
      '2024 99.1% ## %% 44321 -- ++',
      'This sentence remains because it reads like natural academic prose.',
      'This sentence remains because it reads like natural academic prose.',
    ];

    expect(filterCandidates(candidates)).toEqual([
      'The replication produced a measurable improvement in student confidence.',
      'This sentence remains because it reads like natural academic prose.',
    ]);
  });

  it('rejects real garbage sentence fragments, headings, references lines, and definition formats', () => {
    const candidates = [
      'Recruiting Connection.',
      "Staffing models supporting today's workforce mix.",
      'Staff augmentation: involves expanding the full-time workforce with temporary hires to complete specific projects or short-term goals.',
      'References Roussel, L.A., Thomas, P.L., & Harris, J.L. (2023).',
      'References Barber, A.',
      'Wisconsin Nurses Association.',
      'Limited Staffing and On-Call Providers.',
      'Usability Challenges in Electronic Health Records: Impact on Documentation Burden and Clinical Workflow: A Scoping Review.',
    ];

    expect(filterCandidates(candidates)).toEqual([]);
  });

  it('preserves valid sentences that could look like false positives', () => {
    const candidates = [
      'References to earlier studies support this claim.',
      'Nurse staffing directly impacts patient outcomes.',
      'Rural hospitals face ongoing staffing shortages.',
    ];

    expect(filterCandidates(candidates)).toEqual(candidates);
  });
});

describe('selectDiverse', () => {
  it('draws from at least two length buckets', () => {
    const short = [
      'Clear evidence supports the claim for this cohort.',
      'Revision improved clarity without changing the conclusion.',
    ];
    const medium = [
      'The seminar notes describe a careful sequence of revisions that preserved the original argument while making the structure easier to follow.',
      'Students responded more thoughtfully when the prompt asked them to connect evidence, interpretation, and methodological caution in one paragraph.',
    ];
    const long = [
      'Because the comparison groups were observed across multiple checkpoints, the paper can explain change over time without overstating certainty, and that balance gives the prose a distinctively patient rhythm that still feels purposeful.',
      'The concluding discussion returns to earlier claims, qualifies them with fresh evidence, and then closes by identifying practical implications, which creates a longer sentence shape than the rest of the document but still sounds like the same writer.',
    ];

    const selected = selectDiverse([...short, ...medium, ...long], 4);
    const bucketKinds = new Set(
      selected.map((sentence) => {
        if (sentence.length < 60) return 'short';
        if (sentence.length <= 120) return 'medium';
        return 'long';
      }),
    );

    expect(selected).toHaveLength(4);
    expect(bucketKinds.size).toBeGreaterThanOrEqual(2);
    expect(new Set(selected).size).toBe(selected.length);
  });
});

describe('extractStyleSentences', () => {
  it('extracts six diverse sentences from normal academic text within size bounds', () => {
    const text = padText(
      [
        'The introduction situates the case study within a broader debate about assessment and revision.',
        'Although the archive spans several decades, the author keeps the chronology easy to follow with short transition cues.',
        'A concise sentence clarifies the core claim before the evidence becomes more detailed.',
        'The methodology section moves deliberately, explaining each choice in language that feels confident rather than inflated.',
        'By returning to earlier terminology at key moments, the paper sounds consistent even when individual paragraphs vary in length.',
        'One longer sentence gathers competing interpretations, weighs them carefully, and then narrows the discussion toward the explanation that best fits the evidence presented in the classroom records.',
        'The results paragraph stays concrete and names specific shifts in participation, tone, and revision habits.',
        'In the conclusion, the writer acknowledges limitations without weakening the article’s overall sense of direction.',
        'A final reflective sentence leaves the reader with a practical implication instead of a vague summary.',
      ].join(' '),
    );

    const result = extractStyleSentences(text);

    expect(result.count).toBe(DEFAULT_SENTENCE_COUNT);
    expect(result.sentences).toHaveLength(DEFAULT_SENTENCE_COUNT);
    expect(new Set(result.sentences).size).toBe(result.sentences.length);
    expect(result.sourceCharCount).toBe(text.length);
    expect(result.sentences.every((sentence) => sentence.length >= 20 && sentence.length <= 300)).toBe(true);
  });

  it('returns fewer sentences without duplicates when only three usable sentences exist', () => {
    const usable = [
      'The writer frames each claim with a brief signal phrase that keeps the argument grounded.',
      'Evidence is introduced smoothly, with enough context for the reader to see why each quotation matters.',
      'The final paragraph narrows to a practical takeaway rather than repeating the thesis word for word.',
    ];
    const filler = [
      'INTRODUCTION METHODS RESULTS.',
      'a) Prepare the coding sheet before the discussion begins.',
      'Visit www.example.org for the appendix materials.',
      'Table 3 reports calibration values for the pilot run.',
      '2025 88% ### &&& 3412.',
    ];
    const text = [
      ...usable,
      ...filler,
      ...Array.from({ length: 20 }, () => 'INTRODUCTION METHODS RESULTS.'),
      ...Array.from({ length: 10 }, () => 'Visit www.example.org for the appendix materials.'),
      ...Array.from({ length: 10 }, () => '2025 88% ### &&& 3412.'),
    ].join(' ');

    const result = extractStyleSentences(text, 6);

    expect(result.sentences).toHaveLength(3);
    expect(new Set(result.sentences).size).toBe(3);
    expect(result.sentences.every((sentence) => usable.includes(sentence))).toBe(true);
    expect(result.count).toBe(3);
  });

  it('returns an empty result when the source text is below the minimum length', () => {
    const text = 'Too short to establish a stable style sample.';

    expect(extractStyleSentences(text)).toEqual({
      sentences: [],
      count: 0,
      sourceCharCount: text.length,
    });
  });
});
