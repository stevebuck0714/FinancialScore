import type { FiscalPeriod, FiscalPeriodSummary } from './fiscal-years';
import { optionalNumber, optionalText } from './deal-terms';

export const EARNINGS_SOURCES = [
  { value: 'QOE_ADJUSTED', label: 'Quality of Earnings adjusted EBITDA' },
  { value: 'BOOK_EBITDA', label: 'Book EBITDA' },
] as const;
export type EarningsSource = (typeof EARNINGS_SOURCES)[number]['value'];

export const WEIGHTED_PERIOD = 'WEIGHTED';

export const OWNER_OCCUPATIONS = [
  { code: '111021', label: 'General and Operations Managers' },
  { code: '111011', label: 'Chief Executives' },
  { code: '411011', label: 'First-Line Supervisors of Retail Sales Workers' },
  { code: '351012', label: 'First-Line Supervisors of Food Preparation and Serving Workers' },
  { code: '119021', label: 'Construction Managers' },
  { code: '113031', label: 'Financial Managers' },
] as const;

export const MARKET_AREAS = [
  { value: 'STATE', label: 'Company state' },
  { value: 'NATIONAL', label: 'National' },
] as const;
export const MARKET_STATISTICS = [
  { value: 'MEDIAN', label: 'Median' },
  { value: 'MEAN', label: 'Mean' },
] as const;

export type Normalization = { id: string; label: string; amount: number; note: string | null };

export type EarningsBase = {
  /** Null means automatic: Quality of Earnings when saved totals exist, otherwise book EBITDA. */
  source: EarningsSource | null;
  /** 'TTM', a fiscal period key, or WEIGHTED_PERIOD. */
  period: string;
  weights: Record<string, number>;
  reason: string | null;
  ownerActualComp: number | null;
  ownerMarketSalary: number | null;
  ownerOccupationCode: string;
  ownerMarketArea: 'STATE' | 'NATIONAL';
  ownerMarketStatistic: 'MEDIAN' | 'MEAN';
  ownerMarketSource: string | null;
  normalizations: Normalization[];
  normalCapex: number | null;
  capexNote: string | null;
  normalWorkingCapitalPct: number | null;
  workingCapitalNote: string | null;
};

export const DEFAULT_EARNINGS_BASE: EarningsBase = {
  source: null,
  period: 'TTM',
  weights: {},
  reason: null,
  ownerActualComp: null,
  ownerMarketSalary: null,
  ownerOccupationCode: '111021',
  ownerMarketArea: 'STATE',
  ownerMarketStatistic: 'MEDIAN',
  ownerMarketSource: null,
  normalizations: [],
  normalCapex: null,
  capexNote: null,
  normalWorkingCapitalPct: null,
  workingCapitalNote: null,
};

const MAX_NORMALIZATIONS = 30;
const STALE_FINANCIALS_MONTHS = 3;

/** Whole months from the as-of month (YYYY-MM) to the month of the valuation date (YYYY-MM-DD). */
function monthsBetween(asOfMonth: string | undefined, valuationDate: string | undefined) {
  const from = /^(\d{4})-(\d{2})/.exec(asOfMonth || '');
  const to = /^(\d{4})-(\d{2})/.exec(valuationDate || '');
  if (!from || !to) return null;
  return (Number(to[1]) - Number(from[1])) * 12 + (Number(to[2]) - Number(from[2]));
}

const newId = () => globalThis.crypto?.randomUUID?.() ?? `n${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

export function normalizeEarningsBase(raw: unknown): EarningsBase {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const sourceValue = String(source.source ?? '');
  const occupation = String(source.ownerOccupationCode ?? '');
  const weights = source.weights && typeof source.weights === 'object' ? (source.weights as Record<string, unknown>) : {};
  return {
    source: EARNINGS_SOURCES.some((item) => item.value === sourceValue) ? (sourceValue as EarningsSource) : null,
    period: optionalText(source.period) || 'TTM',
    weights: Object.fromEntries(
      Object.entries(weights)
        .map(([key, value]) => [key, optionalNumber(value)] as const)
        .filter((entry): entry is readonly [string, number] => entry[1] !== null),
    ),
    reason: optionalText(source.reason),
    ownerActualComp: optionalNumber(source.ownerActualComp),
    ownerMarketSalary: optionalNumber(source.ownerMarketSalary),
    ownerOccupationCode: OWNER_OCCUPATIONS.some((item) => item.code === occupation) ? occupation : DEFAULT_EARNINGS_BASE.ownerOccupationCode,
    ownerMarketArea: source.ownerMarketArea === 'NATIONAL' ? 'NATIONAL' : 'STATE',
    ownerMarketStatistic: source.ownerMarketStatistic === 'MEAN' ? 'MEAN' : 'MEDIAN',
    ownerMarketSource: optionalText(source.ownerMarketSource),
    normalizations: (Array.isArray(source.normalizations) ? source.normalizations : [])
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        id: optionalText(item.id) || newId(),
        label: optionalText(item.label) || '',
        amount: optionalNumber(item.amount) ?? 0,
        note: optionalText(item.note),
      })),
    normalCapex: optionalNumber(source.normalCapex),
    capexNote: optionalText(source.capexNote),
    normalWorkingCapitalPct: optionalNumber(source.normalWorkingCapitalPct),
    workingCapitalNote: optionalText(source.workingCapitalNote),
  };
}

/** Returns an error message, or null when the earnings base is acceptable to save. */
export function validateEarningsBase(base: EarningsBase): string | null {
  if (base.normalizations.length > MAX_NORMALIZATIONS) return `No more than ${MAX_NORMALIZATIONS} normalizations.`;
  if (base.normalizations.some((item) => !item.label)) return 'Every normalization needs a description.';
  for (const field of ['ownerActualComp', 'ownerMarketSalary', 'normalCapex'] as const) {
    const value = base[field];
    if (value !== null && value < 0) return 'Owner compensation, market salary and capital spending cannot be negative.';
  }
  if (base.normalWorkingCapitalPct !== null && (base.normalWorkingCapitalPct < -50 || base.normalWorkingCapitalPct > 100)) {
    return 'Normal working capital must be between -50% and 100% of revenue.';
  }
  if (Object.values(base.weights).some((weight) => weight < 0 || weight > 10)) return 'Period weights must be between 0 and 10.';
  return null;
}

export type SnapshotEarningsInput = {
  valuationDate?: string;
  asOfMonth?: string;
  periods?: FiscalPeriod[];
  periodSummaries?: FiscalPeriodSummary[];
  trailingTwelveMonths?: (FiscalPeriodSummary & { period: FiscalPeriod }) | null;
  qoe?: { savedTotals: Record<string, number> | null } | null;
} | null;

export type WeightedLine = { key: string; label: string; ebitda: number; weight: number };

export type EarningsBaseResult = {
  hasQoe: boolean;
  source: EarningsSource;
  period: string;
  periodLabel: string;
  startingEarnings: number | null;
  weightedLines: WeightedLine[];
  ownerCompAdjustment: number | null;
  normalizationTotal: number;
  normalizedEbitda: number | null;
  capexSuggestion: number | null;
  capexBasis: string;
  normalCapex: number | null;
  ebitdaLessCapex: number | null;
  sde: number | null;
  workingCapital: {
    revenue: number | null;
    actual: number | null;
    actualPct: number | null;
    normalPct: number | null;
    normal: number | null;
    excess: number | null;
    month: string | null;
  };
  warnings: string[];
};

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Complete prior fiscal years, newest first, paired with their summaries. */
export function completeFiscalYears(snapshot: SnapshotEarningsInput) {
  const periods = snapshot?.periods || [];
  const summaries = snapshot?.periodSummaries || [];
  return periods
    .map((period, index) => ({ period, summary: summaries[index] }))
    .filter((item) => item.summary && !item.period.isYearToDate && item.period.isComplete);
}

/** Default weights for a weighted average: newest complete year 3, then 2, then 1. */
export function defaultWeights(snapshot: SnapshotEarningsInput): Record<string, number> {
  return Object.fromEntries(completeFiscalYears(snapshot).slice(0, 3).map((item, index) => [item.period.key, 3 - index]));
}

export function computeEarningsBase(base: EarningsBase, snapshot: SnapshotEarningsInput): EarningsBaseResult {
  const warnings: string[] = [];
  const qoeEbitda = optionalNumber(snapshot?.qoe?.savedTotals?.qualityOfEarnings);
  const hasQoe = qoeEbitda !== null;
  let source: EarningsSource = base.source ?? (hasQoe ? 'QOE_ADJUSTED' : 'BOOK_EBITDA');
  if (source === 'QOE_ADJUSTED' && !hasQoe) {
    warnings.push('No saved Quality of Earnings totals in the snapshot, so book EBITDA is used.');
    source = 'BOOK_EBITDA';
  }

  const ttm = snapshot?.trailingTwelveMonths || null;
  const years = completeFiscalYears(snapshot);
  let period = source === 'QOE_ADJUSTED' ? 'TTM' : base.period;
  let periodLabel = '';
  let startingEarnings: number | null = null;
  const weightedLines: WeightedLine[] = [];

  if (source === 'QOE_ADJUSTED') {
    startingEarnings = qoeEbitda;
    periodLabel = ttm?.period?.label || 'Trailing 12 months';
  } else if (period === WEIGHTED_PERIOD) {
    const weights = Object.keys(base.weights).length > 0 ? base.weights : defaultWeights(snapshot);
    for (const { period: fiscal, summary } of years) {
      const weight = weights[fiscal.key] ?? 0;
      if (weight <= 0) continue;
      weightedLines.push({ key: fiscal.key, label: fiscal.label, ebitda: num(summary.income?.ebitda), weight });
      if (num(summary.income?.revenue) === 0) warnings.push(`${fiscal.label} shows no revenue; its months may be placeholders.`);
    }
    const totalWeight = weightedLines.reduce((total, line) => total + line.weight, 0);
    if (totalWeight > 0) {
      startingEarnings = weightedLines.reduce((total, line) => total + line.ebitda * line.weight, 0) / totalWeight;
      periodLabel = `Weighted average of ${weightedLines.length} fiscal year${weightedLines.length === 1 ? '' : 's'}`;
    } else {
      periodLabel = 'Weighted average';
      warnings.push('No complete fiscal years carry a weight, so there is no weighted average.');
    }
  } else if (period !== 'TTM') {
    const index = (snapshot?.periods || []).findIndex((item) => item.key === period);
    const fiscal = index >= 0 ? snapshot?.periods?.[index] : undefined;
    const summary = index >= 0 ? snapshot?.periodSummaries?.[index] : undefined;
    if (fiscal && summary) {
      startingEarnings = num(summary.income?.ebitda);
      periodLabel = fiscal.label;
      if (!fiscal.isComplete) warnings.push(`${fiscal.label} is missing ${fiscal.missingMonths.length} month(s) of data.`);
      if (num(summary.income?.revenue) === 0) warnings.push(`${fiscal.label} shows no revenue; its months may be placeholders.`);
    } else {
      warnings.push('The selected fiscal period is not in the latest snapshot, so the trailing 12 months are used.');
      period = 'TTM';
    }
  }
  if (period === 'TTM' && source === 'BOOK_EBITDA') {
    startingEarnings = ttm ? num(ttm.income?.ebitda) : null;
    periodLabel = ttm?.period?.label || 'Trailing 12 months';
    if (ttm?.period && !ttm.period.isComplete) warnings.push(`The trailing 12 months are missing ${ttm.period.missingMonths.length} month(s) of data.`);
  }

  if (!snapshot) warnings.push('Freeze data on the Data Snapshot tab to bring in earnings.');
  if (!hasQoe && snapshot) warnings.push('No Quality of Earnings report is saved for this company. Record each normalization below with support.');

  const ownerCompAdjustment =
    base.ownerActualComp !== null && base.ownerMarketSalary !== null ? base.ownerActualComp - base.ownerMarketSalary : null;
  if (ownerCompAdjustment !== null && source === 'QOE_ADJUSTED') {
    warnings.push('Confirm the Quality of Earnings adjustments do not already normalize owner compensation, or it is counted twice.');
  }
  const normalizationTotal = base.normalizations.reduce((total, item) => total + item.amount, 0);
  const normalizedEbitda = startingEarnings === null ? null : startingEarnings + (ownerCompAdjustment ?? 0) + normalizationTotal;
  if (normalizedEbitda !== null && normalizedEbitda <= 0) warnings.push('Normalized EBITDA is zero or negative; an income approach will not support value.');

  const daByYear = years
    .filter((item) => num(item.summary.income?.revenue) !== 0)
    .map((item) => num(item.summary.income?.depreciationAmortization));
  const capexSuggestion = daByYear.length > 0 ? daByYear.reduce((total, value) => total + value, 0) / daByYear.length : null;
  const capexBasis = daByYear.length > 0 ? `Average depreciation and amortization over ${daByYear.length} complete fiscal year${daByYear.length === 1 ? '' : 's'}` : 'No complete fiscal years with revenue';
  const normalCapex = base.normalCapex ?? capexSuggestion;
  if (!normalCapex) {
    warnings.push('Normal capital spending is zero, so nothing is reserved to maintain equipment and fixtures. Enter a supported annual amount.');
  }
  const gapMonths = monthsBetween(snapshot?.asOfMonth, snapshot?.valuationDate);
  if (gapMonths !== null && gapMonths > STALE_FINANCIALS_MONTHS) {
    warnings.push(`The financials end ${gapMonths} months before the valuation date. Update the data and freeze a new snapshot, or support why the older period is representative.`);
  }
  const ebitdaLessCapex = normalizedEbitda === null ? null : normalizedEbitda - (normalCapex ?? 0);
  const sde = normalizedEbitda === null || base.ownerMarketSalary === null ? null : normalizedEbitda + base.ownerMarketSalary;
  if (!base.reason) warnings.push('Record why this earnings base was chosen.');

  const bs = (ttm?.balanceSheet || null) as Record<string, number> | null;
  const revenue = ttm ? num(ttm.income?.revenue) : null;
  const actual = bs ? num(bs.ar) + num(bs.inventory) + num(bs.otherCA) - num(bs.ap) - num(bs.otherCL) : null;
  const actualPct = actual !== null && revenue ? (actual / revenue) * 100 : null;
  const normalPct = base.normalWorkingCapitalPct ?? actualPct;
  const normal = normalPct !== null && revenue ? (normalPct / 100) * revenue : null;

  return {
    hasQoe,
    source,
    period,
    periodLabel,
    startingEarnings,
    weightedLines,
    ownerCompAdjustment,
    normalizationTotal,
    normalizedEbitda,
    capexSuggestion,
    capexBasis,
    normalCapex,
    ebitdaLessCapex,
    sde,
    workingCapital: {
      revenue,
      actual,
      actualPct,
      normalPct,
      normal,
      excess: actual !== null && normal !== null ? actual - normal : null,
      month: (bs as { month?: string } | null)?.month || null,
    },
    warnings,
  };
}
