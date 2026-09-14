import { loadProductGroupDataset } from '@/lib/operations/product-group-reports';
import { loadProductGoalUpdate } from '@/lib/operations/product-revenue-actual-db';
import { type ProductGroupRow } from '@/lib/operations/product-group-types';
import {
  FORECAST_MONTHS,
  FORECAST_MONTH_LABELS,
  monthQty,
  type ForecastMonth,
} from '@/lib/operations/product-revenue-forecast';
import { estMonthIndex, estYear } from '@/lib/time/eastern';

export type YtdGapLine = {
  key: string;
  itemSku: string;
  customerPartNumber: string;
  customerName: string;
  forecast: number;
  adjusted: number;
  actual: number;
  annualForecast: number;
  annualAdjusted: number;
  projectedRevenue: number;
};

export type YtdGapGroup = YtdGapLine & {
  label: string;
  skuCount: number;
  lines: YtdGapLine[];
};

export type YtdGapGoals = {
  baseline: number | null;
  growth: number | null;
  stretch: number | null;
};

export type YtdGapTotals = YtdGapLine & {
  goals: YtdGapGoals;
  annualGoals: YtdGapGoals;
};

export type YtdGapDataset = {
  year: number;
  dataThru: string | null;
  /** Last month included in every YTD column, so forecast and actual cover the same span. */
  throughMonth: number;
  throughMonthLabel: string;
  monthsElapsed: number;
  priceCount: number;
  totals: YtdGapTotals;
  groups: YtdGapGroup[];
};

/**
 * Actuals are only complete through the workbook's dataThru month, so every YTD
 * column stops there. Comparing a full-year forecast against a partial year of
 * actuals would show a shortfall on every line.
 */
export function resolveThroughMonth(params: {
  year: number;
  dataThru: string | null;
  today?: { year: number; month: number };
}): number {
  const currentYear = params.today?.year ?? estYear();
  const currentMonth = params.today?.month ?? estMonthIndex();
  const dataThru = String(params.dataThru || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dataThru)) {
    const thruYear = Number(dataThru.slice(0, 4));
    const thruMonth = Number(dataThru.slice(5, 7));
    if (thruYear === params.year) return clampMonth(thruMonth);
    if (thruYear > params.year) return 12;
  }
  if (params.year < currentYear) return 12;
  if (params.year > currentYear) return 0;
  return clampMonth(currentMonth);
}

function clampMonth(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(12, Math.max(0, Math.trunc(value)));
}

function monthsThrough(throughMonth: number): ForecastMonth[] {
  return FORECAST_MONTHS.filter((month) => month <= throughMonth);
}

function monthsAfter(throughMonth: number): ForecastMonth[] {
  return FORECAST_MONTHS.filter((month) => month > throughMonth);
}

function sumMonths(map: unknown, months: readonly ForecastMonth[]): number {
  if (!map || typeof map !== 'object') return 0;
  return months.reduce((sum, month) => sum + monthQty(map as Record<string, number>, month), 0);
}

function toLine(
  row: ProductGroupRow,
  months: ForecastMonth[],
  remainingMonths: ForecastMonth[]
): YtdGapLine {
  return {
    key: row.key,
    itemSku: row.itemSku,
    customerPartNumber: row.customerPartNumber,
    customerName: row.customerName,
    forecast: sumMonths(row.estimated, months),
    adjusted: sumMonths(row.estimatedAdjusted, months),
    actual: sumMonths(row.actualRevenue, months),
    annualForecast: sumMonths(row.estimated, FORECAST_MONTHS),
    annualAdjusted: sumMonths(row.estimatedAdjusted, FORECAST_MONTHS),
    projectedRevenue: sumMonths(row.actualRevenue, months) + sumMonths(row.estimatedAdjusted, remainingMonths),
  };
}

export async function loadProductYtdGapDataset(params: {
  companyId: string;
  year: number;
}): Promise<YtdGapDataset> {
  const dataset = await loadProductGroupDataset(params);
  const throughMonth = resolveThroughMonth({ year: dataset.year, dataThru: dataset.dataThru });
  const months = monthsThrough(throughMonth);
  const remaining = monthsAfter(throughMonth);

  const groups: YtdGapGroup[] = dataset.rows.map((row) => ({
    ...toLine(row, months, remaining),
    label: row.customerGroup || 'Unassigned',
    skuCount: row.skuCount,
    lines: row.lines.map((line) => toLine(line, months, remaining)),
  }));

  const totals = groups.reduce(
    (acc, group) => ({
      ...acc,
      forecast: acc.forecast + group.forecast,
      adjusted: acc.adjusted + group.adjusted,
      actual: acc.actual + group.actual,
      annualForecast: acc.annualForecast + group.annualForecast,
      annualAdjusted: acc.annualAdjusted + group.annualAdjusted,
      projectedRevenue: acc.projectedRevenue + group.projectedRevenue,
    }),
    {
      key: 'totals',
      itemSku: '',
      customerPartNumber: '',
      customerName: '',
      forecast: 0,
      adjusted: 0,
      actual: 0,
      annualForecast: 0,
      annualAdjusted: 0,
      projectedRevenue: 0,
    }
  );

  return {
    year: dataset.year,
    dataThru: dataset.dataThru,
    throughMonth,
    throughMonthLabel: throughMonth > 0 ? FORECAST_MONTH_LABELS[throughMonth as ForecastMonth] : '',
    monthsElapsed: months.length,
    priceCount: dataset.priceCount,
    totals: {
      ...totals,
      goals: await loadYtdGoals({ ...params, throughMonth }),
      annualGoals: await loadYtdGoals({ ...params, throughMonth: 12 }),
    },
    groups,
  };
}

/**
 * Company-wide monthly SGP goals summed over the same YTD window. These exist
 * only at company level, so they belong on the totals row rather than being
 * allocated across line items.
 */
async function loadYtdGoals(params: {
  companyId: string;
  year: number;
  throughMonth: number;
}): Promise<YtdGapGoals> {
  if (params.throughMonth <= 0) return { baseline: null, growth: null, stretch: null };
  const snapshot = await loadProductGoalUpdate({ companyId: params.companyId, year: params.year }).catch(() => null);
  const rows = Array.isArray(snapshot?.monthlyRevenueGoals) ? snapshot!.monthlyRevenueGoals : [];
  if (rows.length === 0) return { baseline: null, growth: null, stretch: null };

  const totals: YtdGapGoals = { baseline: null, growth: null, stretch: null };
  for (const row of rows) {
    const month = Number((row as { month?: unknown })?.month);
    if (!Number.isInteger(month) || month < 1 || month > params.throughMonth) continue;
    for (const key of ['baseline', 'growth', 'stretch'] as const) {
      const value = (row as Record<string, unknown>)[key];
      if (value == null || value === '') continue;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) continue;
      totals[key] = (totals[key] ?? 0) + numeric;
    }
  }
  return totals;
}
