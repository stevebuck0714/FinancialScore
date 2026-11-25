import { optionalText } from './deal-terms';
import { formatMonthKey } from './fiscal-years';

export type IndicatorScope = 'NATIONAL' | 'STATE' | 'METRO' | 'COUNTY' | 'INDUSTRY';
export type IndicatorUnit = 'PERCENT' | 'INDEX' | 'DOLLARS' | 'NUMBER';
export type IndicatorFrequency = 'D' | 'M' | 'Q' | 'A';

export const INDICATOR_SCOPES: Array<{ value: IndicatorScope; label: string }> = [
  { value: 'NATIONAL', label: 'United States' },
  { value: 'STATE', label: 'State' },
  { value: 'METRO', label: 'Metro area' },
  { value: 'COUNTY', label: 'County' },
  { value: 'INDUSTRY', label: 'Industry' },
];

export type EconomicIndicator = {
  key: string;
  scope: IndicatorScope;
  area: string;
  label: string;
  provider: 'FRED' | 'BLS';
  seriesId: string;
  url: string;
  unit: IndicatorUnit;
  frequency: IndicatorFrequency;
  value: number;
  date: string;
  priorValue: number | null;
  priorDate: string | null;
  /** FRED values as first published by the valuation date (ALFRED), or today's revised figures. */
  vintage: 'AS_OF_VALUATION_DATE' | 'CURRENT';
};

export type OutlookGeography = {
  source: 'CENSUS_GEOCODER' | 'STATE_ONLY';
  stateCode: string;
  stateName: string;
  stateFips: string;
  countyName: string | null;
  countyFips: string | null;
  metroName: string | null;
  cbsa: string | null;
  matchedAddress: string | null;
};

export const PUBLISHED_OUTLOOKS = [
  {
    key: 'SEP',
    title: 'Summary of Economic Projections',
    publisher: 'Federal Reserve Board (FOMC)',
    url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
    prompt: 'Median projections for real GDP growth, unemployment, PCE inflation, and the federal funds rate.',
  },
  {
    key: 'SPF',
    title: 'Survey of Professional Forecasters',
    publisher: 'Federal Reserve Bank of Philadelphia',
    url: 'https://www.philadelphiafed.org/surveys-and-data/real-time-data-research/survey-of-professional-forecasters',
    prompt: 'Consensus forecast for output, unemployment, and inflation over the next year and ten years.',
  },
  {
    key: 'BEIGE_BOOK',
    title: 'Beige Book',
    publisher: 'Federal Reserve',
    url: 'https://www.federalreserve.gov/monetarypolicy/beigebook/',
    prompt: 'Conditions reported for the company\'s Federal Reserve district: activity, employment, prices, and its sector.',
  },
  {
    key: 'STATE_PROJECTIONS',
    title: 'State employment projections',
    publisher: 'State labor market information office (Projections Central)',
    url: 'https://projectionscentral.org/',
    prompt: 'Long-term employment growth for the state and for the company\'s industry or main occupations.',
  },
] as const;
export type PublishedOutlookKey = (typeof PUBLISHED_OUTLOOKS)[number]['key'];
export type PublishedOutlookEntry = { publishedDate: string | null; url: string | null; keyPoints: string | null };

export const OUTLOOK_SECTIONS = [
  { key: 'national', label: 'National economy' },
  { key: 'regional', label: 'Regional economy' },
  { key: 'industry', label: 'Industry' },
] as const;
export type OutlookSectionKey = (typeof OUTLOOK_SECTIONS)[number]['key'];

export type Outlook = {
  geography: OutlookGeography | null;
  indicators: EconomicIndicator[];
  indicatorsAsOf: string | null;
  indicatorsFetchedAt: string | null;
  indicatorNotes: string[];
  published: Partial<Record<PublishedOutlookKey, PublishedOutlookEntry>>;
  national: string | null;
  regional: string | null;
  industry: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
};

export const DEFAULT_OUTLOOK: Outlook = {
  geography: null,
  indicators: [],
  indicatorsAsOf: null,
  indicatorsFetchedAt: null,
  indicatorNotes: [],
  published: {},
  national: null,
  regional: null,
  industry: null,
  approvedAt: null,
  approvedByName: null,
};

const MAX_SECTION_LENGTH = 12000;
const MAX_KEY_POINTS_LENGTH = 3000;

const dateOnly = (value: unknown) => {
  const text = optionalText(value);
  return text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
};

const finite = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function normalizeIndicator(raw: unknown): EconomicIndicator | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const value = finite(item.value);
  const date = dateOnly(item.date);
  const scope = INDICATOR_SCOPES.find((entry) => entry.value === item.scope)?.value;
  if (value === null || !date || !scope || !item.seriesId) return null;
  const unit = (['PERCENT', 'INDEX', 'DOLLARS', 'NUMBER'] as const).find((entry) => entry === item.unit) || 'NUMBER';
  const frequency = (['D', 'M', 'Q', 'A'] as const).find((entry) => entry === item.frequency) || 'M';
  return {
    key: String(item.key || item.seriesId),
    scope,
    area: String(item.area || ''),
    label: String(item.label || item.seriesId),
    provider: item.provider === 'BLS' ? 'BLS' : 'FRED',
    seriesId: String(item.seriesId),
    url: String(item.url || ''),
    unit,
    frequency,
    value,
    date,
    priorValue: finite(item.priorValue),
    priorDate: dateOnly(item.priorDate),
    vintage: item.vintage === 'AS_OF_VALUATION_DATE' ? 'AS_OF_VALUATION_DATE' : 'CURRENT',
  };
}

function normalizeGeography(raw: unknown): OutlookGeography | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const stateCode = optionalText(item.stateCode);
  if (!stateCode) return null;
  return {
    source: item.source === 'CENSUS_GEOCODER' ? 'CENSUS_GEOCODER' : 'STATE_ONLY',
    stateCode,
    stateName: String(item.stateName || stateCode),
    stateFips: String(item.stateFips || ''),
    countyName: optionalText(item.countyName),
    countyFips: optionalText(item.countyFips),
    metroName: optionalText(item.metroName),
    cbsa: optionalText(item.cbsa),
    matchedAddress: optionalText(item.matchedAddress),
  };
}

export function normalizeOutlook(raw: unknown): Outlook {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rawPublished = source.published && typeof source.published === 'object' ? (source.published as Record<string, unknown>) : {};
  const published: Outlook['published'] = {};
  for (const item of PUBLISHED_OUTLOOKS) {
    const entry = rawPublished[item.key];
    if (!entry || typeof entry !== 'object') continue;
    const fields = entry as Record<string, unknown>;
    const normalized = { publishedDate: dateOnly(fields.publishedDate), url: optionalText(fields.url), keyPoints: optionalText(fields.keyPoints) };
    if (normalized.publishedDate || normalized.url || normalized.keyPoints) published[item.key] = normalized;
  }
  return {
    geography: normalizeGeography(source.geography),
    indicators: (Array.isArray(source.indicators) ? source.indicators : []).map(normalizeIndicator).filter((item): item is EconomicIndicator => Boolean(item)),
    indicatorsAsOf: dateOnly(source.indicatorsAsOf),
    indicatorsFetchedAt: optionalText(source.indicatorsFetchedAt),
    indicatorNotes: (Array.isArray(source.indicatorNotes) ? source.indicatorNotes : []).map(String).filter(Boolean),
    published,
    national: optionalText(source.national),
    regional: optionalText(source.regional),
    industry: optionalText(source.industry),
    approvedAt: optionalText(source.approvedAt),
    approvedByName: optionalText(source.approvedByName),
  };
}

/** Returns an error message, or null when the record is acceptable to save. */
export function validateOutlook(outlook: Outlook): string | null {
  for (const section of OUTLOOK_SECTIONS) {
    if ((outlook[section.key] || '').length > MAX_SECTION_LENGTH) return `${section.label} is limited to ${MAX_SECTION_LENGTH} characters.`;
  }
  for (const item of PUBLISHED_OUTLOOKS) {
    const entry = outlook.published[item.key];
    if ((entry?.keyPoints || '').length > MAX_KEY_POINTS_LENGTH) return `${item.title} key points are limited to ${MAX_KEY_POINTS_LENGTH} characters.`;
    if (entry?.url && !/^https?:\/\//i.test(entry.url)) return `${item.title} link must start with http:// or https://.`;
  }
  return null;
}

/** Text fields whose edits withdraw an approval. */
export function outlookTextChanged(before: Outlook, after: Outlook): boolean {
  if (OUTLOOK_SECTIONS.some((section) => (before[section.key] || '') !== (after[section.key] || ''))) return true;
  return JSON.stringify(before.published) !== JSON.stringify(after.published);
}

/** Federal Reserve district that covers most of each state; split states are flagged. */
const FED_DISTRICTS: Record<number, string> = {
  1: 'Boston', 2: 'New York', 3: 'Philadelphia', 4: 'Cleveland', 5: 'Richmond', 6: 'Atlanta',
  7: 'Chicago', 8: 'St. Louis', 9: 'Minneapolis', 10: 'Kansas City', 11: 'Dallas', 12: 'San Francisco',
};
const STATE_DISTRICT: Record<string, number> = {
  CT: 1, ME: 1, MA: 1, NH: 1, RI: 1, VT: 1,
  NY: 2, NJ: 2,
  PA: 3, DE: 3,
  OH: 4,
  VA: 5, MD: 5, NC: 5, SC: 5, WV: 5, DC: 5,
  GA: 6, FL: 6, AL: 6, TN: 6, MS: 6, LA: 6,
  IL: 7, IN: 7, IA: 7, MI: 7, WI: 7,
  AR: 8, MO: 8, KY: 8,
  MN: 9, MT: 9, ND: 9, SD: 9,
  CO: 10, KS: 10, NE: 10, OK: 10, WY: 10,
  TX: 11, NM: 11,
  AK: 12, AZ: 12, CA: 12, HI: 12, ID: 12, NV: 12, OR: 12, UT: 12, WA: 12,
};
const SPLIT_STATES = new Set(['NJ', 'PA', 'KY', 'WV', 'TN', 'MS', 'LA', 'MO', 'WI', 'MI', 'NM']);

export function federalReserveDistrict(stateCode: string | null | undefined): { number: number; name: string; split: boolean } | null {
  const code = String(stateCode || '').toUpperCase();
  const number = STATE_DISTRICT[code];
  return number ? { number, name: FED_DISTRICTS[number], split: SPLIT_STATES.has(code) } : null;
}

/** BLS Local Area Unemployment Statistics, unemployment rate, not seasonally adjusted. */
export const lausSeriesId = {
  state: (stateFips: string) => `LAUST${stateFips}0000000000003`,
  metro: (stateFips: string, cbsa: string) => `LAUMT${stateFips}${cbsa}00000003`,
  county: (countyFips: string) => `LAUCN${countyFips}0000000003`,
};

export type Observation = { date: string; value: number };

const shiftYear = (date: string, years: number) => `${Number(date.slice(0, 4)) + years}${date.slice(4)}`;

/** Latest observation on or before `asOf`, and the latest one at least a year before it. */
export function summarizeObservations(observations: Observation[], asOf: string): { value: number; date: string; priorValue: number | null; priorDate: string | null } | null {
  const rows = observations.filter((row) => row.date <= asOf && Number.isFinite(row.value)).sort((a, b) => a.date.localeCompare(b.date));
  const latest = rows[rows.length - 1];
  if (!latest) return null;
  const yearEarlier = shiftYear(latest.date, -1);
  const prior = [...rows].reverse().find((row) => row.date <= yearEarlier) || null;
  return { value: latest.value, date: latest.date, priorValue: prior?.value ?? null, priorDate: prior?.date ?? null };
}

export function formatObservationDate(date: string, frequency: IndicatorFrequency): string {
  if (frequency === 'A') return date.slice(0, 4);
  if (frequency === 'Q') return `Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1} ${date.slice(0, 4)}`;
  if (frequency === 'D') return date;
  return formatMonthKey(date.slice(0, 7));
}

export function formatIndicatorValue(value: number | null, unit: IndicatorUnit): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (unit === 'PERCENT') return `${value.toFixed(1)}%`;
  if (unit === 'DOLLARS') return `$${Math.round(value).toLocaleString('en-US')}`;
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

/** Percentage-point change for rates, percent change for levels. */
export function formatIndicatorChange(indicator: Pick<EconomicIndicator, 'value' | 'priorValue' | 'unit'>): string {
  if (indicator.priorValue === null) return '—';
  if (indicator.unit === 'PERCENT') {
    const points = indicator.value - indicator.priorValue;
    return `${points >= 0 ? '+' : ''}${points.toFixed(1)} pts`;
  }
  if (indicator.priorValue === 0) return '—';
  const pct = (indicator.value / indicator.priorValue - 1) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

const cite = (indicator: EconomicIndicator) => `(${indicator.provider} ${indicator.seriesId})`;

function sentence(indicator: EconomicIndicator): string {
  const when = formatObservationDate(indicator.date, indicator.frequency);
  const value = formatIndicatorValue(indicator.value, indicator.unit);
  const prior = indicator.priorValue !== null && indicator.priorDate
    ? `, compared with ${formatIndicatorValue(indicator.priorValue, indicator.unit)} a year earlier`
    : '';
  const area = indicator.scope === 'NATIONAL' || indicator.scope === 'INDUSTRY' ? '' : ` in ${indicator.area}`;
  return `${indicator.label}${area} was ${value} for ${when}${prior} ${cite(indicator)}.`;
}

function publishedParagraph(outlook: Outlook, key: PublishedOutlookKey, lead: string): string | null {
  const entry = outlook.published[key];
  if (!entry?.keyPoints) return null;
  const item = PUBLISHED_OUTLOOKS.find((outlookItem) => outlookItem.key === key);
  const date = entry.publishedDate ? ` published ${entry.publishedDate}` : '';
  return `${lead} the ${item?.publisher} ${item?.title}${date}: ${entry.keyPoints}`;
}

/**
 * Plain-text first draft of the Economic and Industry Outlook built only from the stored
 * indicators and the published outlook notes. The appraiser edits and approves it.
 */
export function buildOutlookDraft(
  outlook: Outlook,
  context: { companyName: string; industryName: string | null; industryCode: string | null; valuationDate: string | null },
): Record<OutlookSectionKey, string> {
  const by = (scope: IndicatorScope) => outlook.indicators.filter((indicator) => indicator.scope === scope);
  const asOf = context.valuationDate ? `As of the valuation date, ${context.valuationDate}` : 'As of the valuation date';
  const national = [
    by('NATIONAL').length ? `${asOf}, the most recent national data showed the following. ${by('NATIONAL').map(sentence).join(' ')}` : `${asOf}, [summarize national output, employment, inflation, and interest rates].`,
    publishedParagraph(outlook, 'SEP', 'Looking ahead, according to'),
    publishedParagraph(outlook, 'SPF', 'According to'),
  ].filter(Boolean).join('\n\n');

  const geography = outlook.geography;
  const district = federalReserveDistrict(geography?.stateCode);
  const place = [geography?.countyName, geography?.metroName, geography?.stateName].filter(Boolean).join(', ');
  const regionalData = [...by('STATE'), ...by('METRO'), ...by('COUNTY')];
  const regional = [
    `${context.companyName} operates in ${place || '[location]'}.`,
    regionalData.length ? regionalData.map(sentence).join(' ') : '[Summarize state and local employment and output.]',
    district ? publishedParagraph(outlook, 'BEIGE_BOOK', `For the ${district.name} Federal Reserve District, according to`) : null,
    publishedParagraph(outlook, 'STATE_PROJECTIONS', 'For the longer term, according to'),
  ].filter(Boolean).join('\n\n');

  const naics = context.industryCode ? ` (NAICS ${context.industryCode})` : '';
  const industry = [
    `${context.companyName} operates in the ${context.industryName || '[industry]'} industry${naics}.`,
    by('INDUSTRY').length ? by('INDUSTRY').map(sentence).join(' ') : '[Summarize industry demand and cost indicators.]',
    '[Describe competition, demand drivers, and how these conditions affect the company\'s expected earnings and risk.]',
  ].join('\n\n');

  return { national, regional, industry };
}

export type OutlookCitation = { key: string; label: string; detail: string; url: string | null };

export function outlookCitations(outlook: Outlook): OutlookCitation[] {
  const citations: OutlookCitation[] = outlook.indicators.map((indicator) => ({
    key: `${indicator.provider}-${indicator.seriesId}`,
    label: `${indicator.provider} ${indicator.seriesId}`,
    detail: `${indicator.label}${indicator.scope === 'NATIONAL' || indicator.scope === 'INDUSTRY' ? '' : `, ${indicator.area}`}, ${formatObservationDate(indicator.date, indicator.frequency)}`,
    url: indicator.url || null,
  }));
  for (const item of PUBLISHED_OUTLOOKS) {
    const entry = outlook.published[item.key];
    if (!entry?.keyPoints) continue;
    citations.push({ key: item.key, label: item.publisher, detail: `${item.title}${entry.publishedDate ? `, ${entry.publishedDate}` : ''}`, url: entry.url || item.url });
  }
  return citations;
}

/** Open items and cautions, in the order a reviewer would raise them. */
export function outlookGaps(outlook: Outlook, valuationDate: string | null): string[] {
  const gaps: string[] = [];
  if (outlook.indicators.length === 0) gaps.push('Refresh the economic indicators.');
  else if (valuationDate && outlook.indicatorsAsOf && outlook.indicatorsAsOf !== valuationDate) {
    gaps.push(`Indicators were pulled as of ${outlook.indicatorsAsOf}; the valuation date is now ${valuationDate}. Refresh them.`);
  }
  if (outlook.indicators.some((indicator) => indicator.provider === 'FRED' && indicator.vintage === 'CURRENT')) {
    gaps.push('Some FRED figures are today\'s revised values because no record of what was published at the valuation date was available.');
  }
  if (outlook.geography?.source === 'STATE_ONLY') gaps.push('The company address could not be matched to a county or metro area; regional data is state level only.');
  const district = federalReserveDistrict(outlook.geography?.stateCode);
  if (district?.split) gaps.push(`${outlook.geography?.stateName} is split between Federal Reserve districts; confirm the ${district.name} District covers the company.`);
  for (const item of PUBLISHED_OUTLOOKS) {
    const entry = outlook.published[item.key];
    if (!entry?.keyPoints) gaps.push(`Add key points from the ${item.title}.`);
    else if (valuationDate && entry.publishedDate && entry.publishedDate > valuationDate) {
      gaps.push(`The ${item.title} is dated after the valuation date and was not known at that date.`);
    }
  }
  if (OUTLOOK_SECTIONS.some((section) => !outlook[section.key])) gaps.push('Build or write each section of the outlook.');
  else if (!outlook.approvedAt) gaps.push('The outlook is not approved.');
  return gaps;
}
