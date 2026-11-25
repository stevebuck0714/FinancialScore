import { formatBenchmarkDifference, formatBenchmarkValue, type BenchmarkResult } from './benchmarking';
import {
  PUBLISHED_OUTLOOKS,
  formatIndicatorChange,
  formatIndicatorValue,
  formatObservationDate,
  type EconomicIndicator,
  type Outlook,
} from './outlook';

export const DEFAULT_VALUATION_OUTLOOK_MODEL = 'gpt-5.1';
const MAX_DRAFT_LENGTH = 12000;

/** OPENAI_MODEL_VALUATION_OUTLOOK, else the Industry Brief final model, else gpt-5.1. */
export function valuationOutlookModel(env: Record<string, string | undefined> = process.env): string {
  return env.OPENAI_MODEL_VALUATION_OUTLOOK?.trim() || env.OPENAI_MODEL_INDUSTRY_BRIEF_FINAL?.trim() || DEFAULT_VALUATION_OUTLOOK_MODEL;
}

export type IndustryOutlookInput = {
  companyName: string;
  industryName: string | null;
  industryCode: string | null;
  location: string | null;
  /** YYYY-MM-DD */
  valuationDate: string;
  outlook: Outlook;
  benchmarks: BenchmarkResult | null;
};

const SYSTEM_PROMPT = [
  'You draft the Industry subsection of the Economic and Industry Outlook in a business valuation report prepared for an SBA lender. An accredited business valuation expert will edit, approve, and sign the report.',
  'Rules:',
  '1. Use only the facts in the DATA block. Do not add statistics, company names, events, trends, or forecasts that are not in it, and do not rely on outside knowledge of the industry.',
  '2. When you use a figure, keep the source label shown with it in parentheses, for example (BLS CES4245300001).',
  '3. Everything is as of the valuation date. Do not describe anything after it.',
  '4. Where the data does not cover something the section needs (such as competition, demand drivers, or barriers to entry), write a bracketed note for the appraiser, for example [Appraiser: describe the main competitors in the trade area]. Never fill a gap with a guess.',
  '5. Compare the company with the industry benchmarks provided, stating the direction plainly (above, below, or in line with the benchmark).',
  '6. End with a paragraph on how these conditions affect the company\'s expected earnings and risk. Do not state a discount rate, capitalization rate, multiple, or value, and do not use listing-price language.',
  '7. Write three or four paragraphs, about 250 to 400 words, in formal third person and plain text. No headings, bullets, or markdown. Do not mention AI, the DATA block, or these instructions.',
  '8. Respond with a JSON object that has one key, "text", whose value is the draft with paragraphs separated by a blank line, for example {"text": "First paragraph.\\n\\nSecond paragraph."}.',
].join('\n');

function indicatorLine(indicator: EconomicIndicator): string {
  const area = indicator.scope === 'NATIONAL' || indicator.scope === 'INDUSTRY' ? '' : `, ${indicator.area}`;
  const prior = indicator.priorValue !== null ? `; year earlier ${formatIndicatorValue(indicator.priorValue, indicator.unit, indicator.unitsLabel)} (change ${formatIndicatorChange(indicator)})` : '';
  return `- ${indicator.label}${area}: ${formatIndicatorValue(indicator.value, indicator.unit, indicator.unitsLabel)} for ${formatObservationDate(indicator.date, indicator.frequency)}${prior} (${indicator.provider} ${indicator.seriesId})`;
}

export function buildIndustryOutlookPrompt(input: IndustryOutlookInput): { system: string; user: string } {
  const { outlook, valuationDate } = input;
  const byScope = (scopes: string[]) => outlook.indicators.filter((indicator) => scopes.includes(indicator.scope) && indicator.date <= valuationDate);
  const industry = byScope(['INDUSTRY']);
  const context = byScope(['NATIONAL', 'STATE', 'METRO', 'COUNTY']);
  const published = PUBLISHED_OUTLOOKS.flatMap((item) => {
    const entry = outlook.published[item.key];
    if (!entry?.keyPoints) return [];
    if (entry.publishedDate && entry.publishedDate > valuationDate) return [];
    return [`- ${item.publisher}, ${item.title}${entry.publishedDate ? ` (published ${entry.publishedDate})` : ''}: ${entry.keyPoints}`];
  });
  const benchmarkLines = (input.benchmarks?.rows || [])
    .filter((row) => row.company[0] !== null && row.benchmark !== null)
    .map(
      (row) =>
        `- ${row.label}: company ${formatBenchmarkValue(row.company[0], row.unit)}, benchmark ${formatBenchmarkValue(row.benchmark, row.unit)} (${row.benchmarkSource === 'RMA' ? 'RMA' : 'Corelytics industry table'}), difference ${formatBenchmarkDifference(row.difference, row.unit)}${row.assessment ? `, ${row.assessment.toLowerCase()}` : ''}`,
    );
  const latestYear = input.benchmarks?.years[0]?.label;

  const user = [
    'DATA',
    `Company: ${input.companyName}`,
    `Industry: ${input.industryName || 'not recorded'}${input.industryCode ? ` (NAICS ${input.industryCode})` : ''}`,
    `Location: ${input.location || 'not recorded'}`,
    `Valuation date: ${valuationDate}`,
    '',
    'Industry indicators:',
    ...(industry.length ? industry.map(indicatorLine) : ['- none available']),
    '',
    'National and regional indicators (context only):',
    ...(context.length ? context.map(indicatorLine) : ['- none available']),
    '',
    'Published outlooks:',
    ...(published.length ? published : ['- none recorded']),
    '',
    `Company compared with industry benchmarks${latestYear ? ` (company figures for ${latestYear})` : ''}:`,
    ...(benchmarkLines.length ? benchmarkLines : ['- none available']),
    '',
    'Write the Industry subsection now.',
  ].join('\n');

  return { system: SYSTEM_PROMPT, user };
}

/** Reads the draft from the {"text": ...} JSON reply, falling back to the raw reply. */
export function extractDraftText(raw: string): string {
  const trimmed = raw.trim().replace(/^```[a-z]*\s*|\s*```$/gi, '');
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const value = record.text ?? record.draft ?? record.industry ?? Object.values(record).find((item) => typeof item === 'string');
      if (typeof value === 'string') return value;
    }
  } catch {
    return raw;
  }
  return raw;
}

/** Removes markdown the model may add despite instructions. */
export function cleanDraftText(text: string): string {
  return text
    .replace(/^```[a-z]*\s*|\s*```$/gi, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_DRAFT_LENGTH);
}
