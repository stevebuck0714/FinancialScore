import assert from 'node:assert/strict';
import type { BenchmarkResult } from '../lib/business-valuation/benchmarking';
import { DEFAULT_OUTLOOK, normalizeOutlook, outlookCitations, type EconomicIndicator } from '../lib/business-valuation/outlook';
import {
  DEFAULT_VALUATION_OUTLOOK_MODEL,
  buildIndustryOutlookPrompt,
  cleanDraftText,
  extractDraftText,
  finalizeCitations,
  industryResearchQuestions,
  mergeResearch,
  perplexityDate,
  researchCompanyName,
  valuationOutlookModel,
} from '../lib/business-valuation/industry-outlook-prompt';

// Model setting falls back to the Industry Brief final model, then gpt-5.1.
assert.equal(valuationOutlookModel({ OPENAI_MODEL_VALUATION_OUTLOOK: 'model-a', OPENAI_MODEL_INDUSTRY_BRIEF_FINAL: 'model-b' }), 'model-a');
assert.equal(valuationOutlookModel({ OPENAI_MODEL_VALUATION_OUTLOOK: ' ', OPENAI_MODEL_INDUSTRY_BRIEF_FINAL: 'model-b' }), 'model-b');
assert.equal(valuationOutlookModel({}), DEFAULT_VALUATION_OUTLOOK_MODEL);
assert.equal(valuationOutlookModel({ OPENAI_MODEL: 'gpt-5-codex' }), DEFAULT_VALUATION_OUTLOOK_MODEL);

const indicator = (overrides: Partial<EconomicIndicator>): EconomicIndicator => ({
  key: 'k',
  scope: 'INDUSTRY',
  area: 'United States',
  label: 'Used merchandise store employment',
  provider: 'BLS',
  seriesId: 'CES4245300001',
  url: 'https://example.com',
  unit: 'THOUSANDS' as EconomicIndicator['unit'],
  frequency: 'M',
  value: 210,
  date: '2026-09-01',
  priorValue: 205,
  priorDate: '2025-09-01',
  vintage: 'AS_OF_VALUATION_DATE',
  ...overrides,
});

const benchmarks: BenchmarkResult = {
  years: [{ key: 'FY2025', label: 'FY2025' }],
  rows: [
    { key: 'gm', label: 'Gross margin', group: 'PROFITABILITY' as any, unit: 'PCT', company: [48.2], rma: null, table: 41, tableUsedAllSizes: false, benchmark: 41, benchmarkSource: 'TABLE', difference: 7.2, assessment: 'Better' },
    { key: 'none', label: 'Current ratio', group: 'LIQUIDITY' as any, unit: 'RATIO', company: [null], rma: null, table: 1.4, tableUsedAllSizes: false, benchmark: 1.4, benchmarkSource: 'TABLE', difference: null, assessment: null },
  ],
  warnings: [],
};

const prompt = buildIndustryOutlookPrompt({
  companyName: 'PlatosCloset_80957',
  industryName: 'Used Merchandise Stores',
  industryCode: '459510',
  location: 'Boise, ID',
  valuationDate: '2026-10-31',
  outlook: {
    ...DEFAULT_OUTLOOK,
    indicators: [
      indicator({}),
      indicator({ key: 'late', label: 'Late series', date: '2026-11-01' }),
      indicator({ key: 'nat', scope: 'NATIONAL', label: 'Unemployment rate', provider: 'FRED', seriesId: 'UNRATE', unit: 'PERCENT' as EconomicIndicator['unit'], value: 4.3, priorValue: 4.1 }),
    ],
    published: {
      SEP: { publishedDate: '2026-09-17', url: null, keyPoints: 'Growth near 1.8%.' } as any,
      SPF: { publishedDate: '2026-11-15', url: null, keyPoints: 'Published after the valuation date.' } as any,
    },
  },
  benchmarks,
});

// The rules that keep the draft defensible are in the instructions.
assert.ok(prompt.system.includes('Use only the facts in the DATA block'));
assert.ok(prompt.system.includes('[Appraiser:'));
assert.ok(prompt.system.includes('Do not state a discount rate'));

// Only data on or before the valuation date reaches the model, with source labels.
assert.ok(prompt.user.includes('Used merchandise store employment: 210 for'));
assert.ok(prompt.user.includes('(BLS CES4245300001)'));
assert.ok(!prompt.user.includes('Late series'));
assert.ok(prompt.user.includes('Unemployment rate: 4.3%'));
assert.ok(prompt.user.includes('Growth near 1.8%.'));
assert.ok(!prompt.user.includes('Published after the valuation date.'));
assert.ok(prompt.user.includes('(NAICS 459510)'));

// Benchmarks without a company figure are left out.
assert.ok(prompt.user.includes('Gross margin: company 48.2%, benchmark 41.0% (Corelytics industry table)'));
assert.ok(prompt.user.includes('better'));
assert.ok(!prompt.user.includes('Current ratio'));

// Empty inputs say so instead of leaving blanks.
const empty = buildIndustryOutlookPrompt({ companyName: 'X', industryName: null, industryCode: null, location: null, valuationDate: '2026-10-31', outlook: DEFAULT_OUTLOOK, benchmarks: null });
assert.ok(empty.user.includes('Industry: not recorded'));
assert.ok(empty.user.includes('- none available'));

assert.equal(cleanDraftText('```text\n## Industry\n\n\n\n**Demand** held steady.\n```'), 'Industry\n\nDemand held steady.');

// The shared AI helper requests JSON output, which OpenAI rejects unless the prompt mentions JSON.
assert.ok(/json/i.test(prompt.system + prompt.user));
assert.equal(extractDraftText('{"text": "First.\\n\\nSecond."}'), 'First.\n\nSecond.');
assert.equal(extractDraftText('```json\n{"draft": "Only one."}\n```'), 'Only one.');
assert.equal(extractDraftText('Plain paragraph.'), 'Plain paragraph.');

// Research replies merge into one numbered source list; late and duplicate sources are handled.
const research = mergeResearch(
  [
    {
      title: 'Size',
      content: 'Resale grew 9% [1]. Thrift stores number 25,000 [2]. A later report [3].',
      citations: [
        { url: 'https://a.example/report', title: 'Report A', date: '2026-03-01' },
        { url: 'https://b.example/stores', title: null, date: null },
        { url: 'https://c.example/late', title: 'Late', date: '2026-12-01' },
      ],
    },
    { title: 'Competition', content: 'Online resale competes [1]. Missing source [4].', citations: [{ url: 'https://b.example/stores' }] },
    { title: 'Empty', content: '  ', citations: [] },
  ],
  '2026-10-31',
);
assert.equal(research.topics.length, 2);
assert.equal(research.topics[0].notes, 'Resale grew 9% [1]. Thrift stores number 25,000 [2]. A later report .');
assert.equal(research.topics[1].notes, 'Online resale competes [2]. Missing source .');
assert.deepEqual(research.sources.map((source) => source.url), ['https://a.example/report', 'https://b.example/stores']);

const withResearch = buildIndustryOutlookPrompt({
  companyName: 'X', industryName: 'Used Goods Stores', industryCode: '45331', location: 'Spokane, WA', valuationDate: '2026-10-31', outlook: DEFAULT_OUTLOOK, benchmarks: null, research,
});
assert.ok(withResearch.user.includes('Size:\nResale grew 9% [1].'));
assert.ok(withResearch.user.includes('[1] Report A (2026-03-01) https://a.example/report'));
assert.ok(withResearch.user.includes('[2] Untitled https://b.example/stores'));
assert.ok(withResearch.system.includes('cite it with the bracketed source number'));

// Only cited sources are kept, renumbered in order of use; unknown numbers are removed.
const finalized = finalizeCitations('Online resale competes [2]. Resale grew [1, 2]. Unknown [9].', research.sources);
assert.equal(finalized.text, 'Online resale competes [1]. Resale grew [2, 1]. Unknown.');
assert.deepEqual(finalized.sources.map((source) => [source.number, source.url]), [[1, 'https://b.example/stores'], [2, 'https://a.example/report']]);
assert.ok(finalizeCitations('[Appraiser: confirm competitors.]', research.sources).text.includes('[Appraiser: confirm competitors.]'));

// The Citations table lists only web sources still cited in the Industry text.
const citations = outlookCitations({ ...DEFAULT_OUTLOOK, industry: 'Grew [2].', industrySources: finalized.sources });
assert.deepEqual(citations.map((citation) => citation.label), ['[2] a.example']);
assert.equal(normalizeOutlook({ industrySources: [{ number: 1, url: 'javascript:alert(1)' }, { number: 2, url: 'https://ok.example', date: '2026-01-02' }] }).industrySources.length, 1);

assert.equal(researchCompanyName('PlatosCloset_80957'), 'Platos Closet');
assert.equal(perplexityDate('2026-10-31'), '10/31/2026');
const questions = industryResearchQuestions({ companyName: 'PlatosCloset_80957', industryName: 'Used Goods Stores', industryCode: '45331', location: 'Spokane Valley, WA', valuationDate: '2026-10-31' });
assert.equal(questions.length, 3);
assert.ok(questions.every((question) => question.prompt.includes('on or before this date') && question.prompt.includes('NAICS 45331')));
assert.ok(questions[1].prompt.includes('Spokane Valley, WA'));

console.log('business valuation industry outlook AI tests passed');
