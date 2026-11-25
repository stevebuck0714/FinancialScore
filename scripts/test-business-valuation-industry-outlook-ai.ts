import assert from 'node:assert/strict';
import type { BenchmarkResult } from '../lib/business-valuation/benchmarking';
import { DEFAULT_OUTLOOK, type EconomicIndicator } from '../lib/business-valuation/outlook';
import {
  DEFAULT_VALUATION_OUTLOOK_MODEL,
  buildIndustryOutlookPrompt,
  cleanDraftText,
  extractDraftText,
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

console.log('business valuation industry outlook AI tests passed');
