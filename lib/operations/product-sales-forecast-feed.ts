import { FORECAST_MONTHS, type ForecastMonth } from '@/lib/operations/product-revenue-forecast';
import type { RevenueMonthTotals } from '@/lib/operations/product-revenue-actual';

/** Wholesale sector key for Atlantic "Contract / Program Revenue". */
export const CONTRACT_PROGRAM_REVENUE_FIELD = 'rev_contract_program_revenue';

/** Products pages drive income-statement sales for these calendar years only. */
export const PRODUCT_SALES_FORECAST_YEARS = [2026, 2027] as const;

export function isProductSalesLockedYear(year: number): boolean {
  return PRODUCT_SALES_FORECAST_YEARS.includes(year as (typeof PRODUCT_SALES_FORECAST_YEARS)[number]);
}

export function productForecastMonthKey(year: number, month1to12: number): string {
  return `${year}-${String(month1to12).padStart(2, '0')}`;
}

export function productAdjMonthsFromTotals(
  year: number,
  months: Partial<Record<ForecastMonth | string, RevenueMonthTotals>> | null | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const month of FORECAST_MONTHS) {
    const raw = Number(months?.[month]?.adjusted ?? months?.[String(month)]?.adjusted);
    out[productForecastMonthKey(year, month)] = Number.isFinite(raw) ? Math.max(0, raw) : 0;
  }
  return out;
}

export function lastProductAdjMonthKey(months: Record<string, number> | null | undefined): string | null {
  if (!months) return null;
  let last: string | null = null;
  for (const [key, raw] of Object.entries(months)) {
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    const [yearText] = key.split('-');
    const year = Number(yearText);
    if (!isProductSalesLockedYear(year)) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (!last || key > last) last = key;
  }
  return last;
}

export function lockedProductAdjSalesAmount(params: {
  fieldKey: string;
  year: number;
  monthKey: string;
  hasProductForecast: boolean;
  months: Record<string, number>;
  lastAdjMonth?: string | null;
}): number | null {
  if (params.fieldKey !== CONTRACT_PROGRAM_REVENUE_FIELD) return null;
  if (!params.hasProductForecast) return null;
  if (!isProductSalesLockedYear(params.year)) return null;
  const lastAdjMonth = params.lastAdjMonth ?? lastProductAdjMonthKey(params.months);
  if (!lastAdjMonth || params.monthKey > lastAdjMonth) return null;
  if (!Object.prototype.hasOwnProperty.call(params.months, params.monthKey)) return null;
  const value = Number(params.months[params.monthKey]);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
