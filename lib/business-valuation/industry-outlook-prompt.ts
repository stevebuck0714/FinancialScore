import { formatBenchmarkDifference, formatBenchmarkValue, type BenchmarkResult } from './benchmarking';
import {
  PUBLISHED_OUTLOOKS,
  formatIndicatorChange,
  formatIndicatorValue,
  citedNumbers,
  formatObservationDate,
  type EconomicIndicator,
  type Outlook,
  type OutlookWebSource,
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
  research?: IndustryResearch | null;
};

/** Web research notes whose [n] markers refer to sources. */
export type IndustryResearch = { topics: Array<{ title: string; notes: string }>; sources: OutlookWebSource[] };

/** One research reply: its [n] markers refer to its own 1-based citation list. */
export type ResearchReply = { title: string; content: string; citations: Array<{ url: string; title?: string | null; date?: string | null }> };

/** Combines replies into one numbered source list, dropping sources dated after the valuation date. */
export function mergeResearch(replies: ResearchReply[], valuationDate: string): IndustryResearch {
  const sources: OutlookWebSource[] = [];
  const topics = replies
    .filter((reply) => reply.content.trim())
    .map((reply) => {
      const notes = reply.content.replace(/\[(\d+)\]/g, (marker, local: string) => {
        const citation = reply.citations[Number(local) - 1];
        if (!citation?.url || !/^https?:\/\//i.test(citation.url)) return '';
        if (citation.date && citation.date > valuationDate) return '';
        let source = sources.find((item) => item.url === citation.url);
        if (!source) {
          source = { number: sources.length + 1, url: citation.url, title: citation.title?.trim() || null, date: citation.date || null };
          sources.push(source);
        }
        return `[${source.number}]`;
      });
      return { title: reply.title, notes: notes.trim() };
    });
  return { topics, sources };
}

export const INDUSTRY_RESEARCH_SYSTEM =
  'You research industries for a business valuation prepared for an SBA lender. Report only facts supported by your sources, cite every fact with a bracketed source number, give the date or period of each statistic, and say plainly when information is not publicly available. Do not estimate or speculate.';

/** Company names are often stored with an import suffix, such as "PlatosCloset_80957". */
export function researchCompanyName(name: string): string {
  return name.replace(/_\d+$/, '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

/** Mirrors Perplexity's MM/DD/YYYY date filter format. */
export function perplexityDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${month}/${day}/${year}`;
}

export function industryResearchQuestions(input: Pick<IndustryOutlookInput, 'companyName' | 'industryName' | 'industryCode' | 'location' | 'valuationDate'>): Array<{ title: string; prompt: string }> {
  const industry = `${input.industryName || 'the subject company\'s industry'}${input.industryCode ? ` (NAICS ${input.industryCode})` : ''}`;
  const company = researchCompanyName(input.companyName);
  const context = [
    `Industry: ${industry}`,
    `Subject company (for context only): ${company}${input.location ? `, located in ${input.location}` : ''}`,
    `Valuation date: ${input.valuationDate}. Use only information published on or before this date.`,
  ].join('\n');
  return [
    {
      title: 'Industry size, structure, and growth',
      prompt: `${context}\nResearch the United States ${industry} industry: total revenue or market size, recent and projected growth rates, number of establishments, main segments, and the share held by national chains versus independent operators. Give the period and source for each figure.`,
    },
    {
      title: 'Demand drivers and competition',
      prompt: `${context}\nResearch what drives customer demand in this industry (consumer trends, demographics, economic sensitivity) and its competitive landscape: the major national chains and franchise systems (including the subject company's brand or franchisor, if it belongs to one), online platforms that compete with physical stores, and competing businesses in or near ${input.location || 'the company\'s trade area'}.`,
    },
    {
      title: 'Operating economics, barriers to entry, and risks',
      prompt: `${context}\nResearch this industry's typical operating economics (gross margin, major costs, how inventory or supply is sourced, seasonality), barriers to entry, franchise fees or royalties where franchising is common, regulation, and the main risks and published outlook for the industry.`,
    },
  ];
}

/** Renumbers the sources the draft cites as 1, 2, 3 in order of use and removes markers with no source. */
export function finalizeCitations(text: string, sources: OutlookWebSource[]): { text: string; sources: OutlookWebSource[] } {
  const known = new Map(sources.map((source) => [source.number, source]));
  const order = citedNumbers(text).filter((number) => known.has(number));
  const renumber = new Map(order.map((number, index) => [number, index + 1]));
  const next = text
    .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_marker, list: string) => {
      const numbers = list.split(',').map((part) => renumber.get(Number(part.trim()))).filter((value): value is number => value !== undefined);
      return numbers.length ? `[${numbers.join(', ')}]` : '';
    })
    .replace(/ +([.,;:])/g, '$1')
    .replace(/ {2,}/g, ' ');
  return { text: next, sources: order.map((number) => ({ ...known.get(number)!, number: renumber.get(number)! })) };
}

const SYSTEM_PROMPT = [
  'You draft the Industry subsection of the Economic and Industry Outlook in a business valuation report prepared for an SBA lender. An accredited business valuation expert will edit, approve, and sign the report.',
  'Rules:',
  '1. Use only the facts in the DATA block: the indicators, published outlooks, benchmarks, and industry research notes. Do not add statistics, company names, events, trends, or forecasts that are not in it, and do not rely on outside knowledge.',
  '2. When you use an indicator figure, keep its source label in parentheses, for example (FRED MRTSSM448USN). When you use a fact from the research notes, cite it with the bracketed source number shown in the notes, for example [3]. Every research fact needs a citation, and only use numbers that appear in the Sources list.',
  '3. Everything is as of the valuation date. Leave out anything the notes describe as happening after it.',
  '4. Cover, in this order where the data supports it: what the industry is and how it is structured; its size and growth; demand drivers and customer trends; competition, including national chains or franchise systems, online alternatives, and competitors in the company\'s trade area; barriers to entry and industry risks; and how the company compares with the industry benchmarks, stating the direction plainly (above, below, or in line).',
  '5. This is an industry section, not a company description. Mention the company only where it shows its position in the industry, such as a franchise affiliation or its trade area. Leave out store hours, contact details, and the company\'s own policies.',
  '6. Where the data does not cover something the section needs, write a bracketed note for the appraiser, for example [Appraiser: confirm the number of competing resale stores in the trade area]. Never fill a gap with a guess, and do not present an unsourced estimate as fact.',
  '7. End with a paragraph on how these conditions affect the company\'s expected earnings and risk. Do not state a discount rate, capitalization rate, multiple, or value, and do not use listing-price language.',
  '8. Write five to seven paragraphs, about 450 to 750 words, in formal third person and plain text. No headings, bullets, or markdown. Do not mention AI, web research, the DATA block, or these instructions.',
  '9. Respond with a JSON object that has one key, "text", whose value is the draft with paragraphs separated by a blank line, for example {"text": "First paragraph.\\n\\nSecond paragraph."}.',
].join('\n');

function indicatorLine(indicator: EconomicIndicator): string {
  const area = indicator.scope === 'NATIONAL' || indicator.scope === 'INDUSTRY' ? '' : `, ${indicator.area}`;
  const prior = indicator.priorValue !== null ? `; year earlier ${formatIndicatorValue(indicator.priorValue, indicator.unit, indicator.unitsLabel)} (change ${formatIndicatorChange(indicator)})` : '';
  return `- ${indicator.label}${area}: ${formatIndicatorValue(indicator.value, indicator.unit, indicator.unitsLabel)} for ${formatObservationDate(indicator.date, indicator.frequency)}${prior} (${indicator.provider} ${indicator.seriesId})`;
}

export function buildIndustryOutlookPrompt(input: IndustryOutlookInput): { system: string; user: string } {
  const { outlook, valuationDate, research } = input;
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
        `- ${row.label}: company ${formatBenchmarkValue(row.company[0], row.unit)}, benchmark ${formatBenchmarkValue(row.benchmark, row.unit)} (Corelytics industry table), difference ${formatBenchmarkDifference(row.difference, row.unit)}${row.assessment ? `, ${row.assessment.toLowerCase()}` : ''}`,
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
    'Industry research notes (web sources published on or before the valuation date):',
    ...(research?.topics.length
      ? research.topics.flatMap((topic) => [`${topic.title}:`, topic.notes, ''])
      : ['- none available', '']),
    'Sources:',
    ...(research?.sources.length
      ? research.sources.map((source) => `[${source.number}] ${source.title || 'Untitled'}${source.date ? ` (${source.date})` : ''} ${source.url}`)
      : ['- none']),
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
