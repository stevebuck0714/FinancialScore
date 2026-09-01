import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import prisma from '@/lib/prisma';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { getAiTransport, getOpenAiClient } from '@/lib/ai-gateway';
import { createModelText } from '@/lib/openai-helpers';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { loadMonthlyFromDfs } from '@/lib/performance-analytics/monthly-from-dfs';
import {
  buildConstructionBriefingFacts,
  buildDailyOperationsFacts,
  getExecBriefingModuleProfile,
} from '@/lib/pulse/exec-briefing-modules';
import {
  resolveDailyBriefingCapability,
  type DailyBriefingMode,
} from '@/lib/pulse/daily-briefing-readiness';
import { resolveCompanyIndustrySectorCategory } from '@/lib/industry-sector-resolver';
import { formatMoney as formatMoneyShared } from '@/lib/format/currency';
import { formatEstDate } from '@/lib/time/eastern';
import {
  DEFAULT_BASE_CURRENCY,
  resolveDisplayCurrency,
} from '@/lib/constants/currencies';
import { applyReportingCurrencyIfNeeded } from '@/lib/fx/reporting';
import { getCompanyCurrencySettings } from '@/lib/currency/company-currency';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type BriefingSection = { title: string; bullets: string[] };
type BriefingPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
type BriefingResponse = {
  generatedAt: string;
  period: BriefingPeriod;
  asOfDate: string;
  model?: string;
  aiGenerated: boolean;
  sections: BriefingSection[];
  sourceNotes: string[];
  dailyMode?: DailyBriefingMode;
  currency?: {
    baseCurrency: string;
    reportingCurrency: string | null;
    displayCurrency: string;
  };
};

const dailyBriefingCache = new Map<string, BriefingResponse>();
const MS_IN_DAY = 24 * 60 * 60 * 1000;
const MATERIAL_AMOUNT = 1000;
const MATERIAL_PCT = 0.01;
const MATERIAL_FINANCIAL_PCT = 0.03;
const MIN_MTD_COMPARISON_DAYS = 10;
const MIN_WEEK_COMPARISON_DAYS = 4;
const PERSISTED_CACHE_TTL_DAYS = 2;
const DAILY_BRIEFING_LOOKBACK_DAYS = 90;
const MONTHLY_BRIEFING_LOOKBACK_MONTHS = 48;
const MONTHLY_FINANCIAL_ROW_CAP = 60;
const DAILY_FINANCIAL_ROW_CAP = 100;
const CORE_SNAPSHOT_ROW_CAP = 150;
const DETAIL_SNAPSHOT_ROW_CAP = 300;
const EXEC_BRIEFING_LOGIC_VERSION = 'exec-briefing-v21-trailing-ended-wording';
const PRIVATE_DAILY_CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=300, stale-while-revalidate=1800',
};
const GENE_SOLUTIONS_COMPANY_ID = 'cmrc86g8l0001qhbkgcq6wrf9';

let pulseCacheTablesPromise: Promise<void> | null = null;

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const authHeader = String(request.headers.get('authorization') || '').trim();
  return Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);
}

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pct(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 0.000001) return null;
  return numerator / denominator;
}

function dateKey(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value || ''));
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function preferDailyFrequencyRows<T extends { frequency?: string | null }>(rows: T[], preferDaily: boolean): T[] {
  if (!preferDaily || !rows.length) return rows;
  const daily = rows.filter((row) => String(row.frequency || '').toLowerCase() === 'daily');
  return daily.length ? daily : rows;
}

function latestSnapshotDateKey(rows: Array<{ snapshotDate?: Date | string | null }>): string {
  const keys = rows.map((row) => dateKey(row.snapshotDate)).filter(Boolean).sort();
  return keys.length ? keys[keys.length - 1] : '';
}

function priorSnapshotDateKey(
  rows: Array<{ snapshotDate?: Date | string | null }>,
  currentKey: string
): string {
  const keys = Array.from(new Set(rows.map((row) => dateKey(row.snapshotDate)).filter(Boolean))).sort();
  if (!keys.length) return '';
  if (currentKey) {
    const idx = keys.lastIndexOf(currentKey);
    if (idx > 0) return keys[idx - 1];
  }
  return keys.length >= 2 ? keys[keys.length - 2] : '';
}

function todayCacheKey(companyId: string): string {
  return `${companyId}:${formatEstDate()}`;
}

function normalizeBriefingPeriod(value: string | null): BriefingPeriod {
  if (value === 'weekly' || value === 'monthly' || value === 'quarterly' || value === 'annual') return value;
  return 'daily';
}

function periodDisplayName(period: BriefingPeriod): string {
  if (period === 'weekly') return 'Weekly';
  if (period === 'monthly') return 'Monthly';
  if (period === 'quarterly') return 'Quarterly';
  if (period === 'annual') return 'Annual';
  return 'Daily';
}

function periodCacheDate(cacheDate: string, period: BriefingPeriod): string {
  return `${cacheDate}:${period}`;
}

function sortByDate<T extends { snapshotDate?: Date; monthDate?: Date }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ad = (a.snapshotDate || a.monthDate || new Date(0)).getTime();
    const bd = (b.snapshotDate || b.monthDate || new Date(0)).getTime();
    return ad - bd;
  });
}

function last<T>(rows: T[]): T | null {
  return rows.length ? rows[rows.length - 1] : null;
}

function currentMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function isCompleteMonthlyPeriod(row: { monthDate?: Date }): boolean {
  if (!row.monthDate) return false;
  return row.monthDate.getTime() < currentMonthStart().getTime();
}

const UTC_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatUtcMonthDay(date: Date): string {
  return `${UTC_MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function formatInclusiveUtcRangeLabel(start: Date, end: Date): string {
  const startKey = start.toISOString().slice(0, 10);
  const endKey = end.toISOString().slice(0, 10);
  if (startKey === endKey) {
    return `${formatUtcMonthDay(start)}, ${start.getUTCFullYear()}`;
  }
  if (start.getUTCFullYear() === end.getUTCFullYear()) {
    return `${formatUtcMonthDay(start)} to ${formatUtcMonthDay(end)}, ${end.getUTCFullYear()}`;
  }
  return `${formatUtcMonthDay(start)}, ${start.getUTCFullYear()} to ${formatUtcMonthDay(end)}, ${end.getUTCFullYear()}`;
}

function monthDatesFromRows(rows: Array<{ monthDate?: Date; snapshotDate?: Date }>): Date[] {
  return rows
    .map((row) => (row.monthDate instanceof Date ? row.monthDate : row.monthDate ? new Date(row.monthDate) : null))
    .filter((date): date is Date => Boolean(date) && !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());
}

function lastMonthEndLabel(rows: Array<{ monthDate?: Date; snapshotDate?: Date }>): string | null {
  const monthDates = monthDatesFromRows(rows);
  if (!monthDates.length) return null;
  const end = utcMonthEnd(monthDates[monthDates.length - 1]);
  return `${formatUtcMonthDay(end)}, ${end.getUTCFullYear()}`;
}

function monthNameYearLabel(rows: Array<{ monthDate?: Date; snapshotDate?: Date }>): string | null {
  const monthDates = monthDatesFromRows(rows);
  if (!monthDates.length) return null;
  const month = monthDates[monthDates.length - 1];
  return `${UTC_MONTH_NAMES[month.getUTCMonth()]} ${month.getUTCFullYear()}`;
}

function trailingEndedLabel(rows: Array<{ monthDate?: Date; snapshotDate?: Date }>, monthCount: number): string | null {
  const ended = lastMonthEndLabel(rows);
  return ended ? `trailing ${monthCount} months ended ${ended}` : null;
}

function periodLabel(rows: Array<{ monthDate?: Date; snapshotDate?: Date }>): string | null {
  const monthDates = monthDatesFromRows(rows);
  const usesOnlyMonthDates =
    monthDates.length > 0 && rows.every((row) => row.monthDate || !row.snapshotDate);
  if (usesOnlyMonthDates) {
    return formatInclusiveUtcRangeLabel(utcMonthStart(monthDates[0]), utcMonthEnd(monthDates[monthDates.length - 1]));
  }
  const dates = rows
    .map((row) => row.monthDate || row.snapshotDate)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());
  if (!dates.length) return null;
  const start = dates[0].toISOString().slice(0, 10);
  const end = dates[dates.length - 1].toISOString().slice(0, 10);
  return start === end ? start : `${start} to ${end}`;
}

function comparisonPeriodLabels(
  cadence: BriefingPeriod,
  currentRows: Array<{ monthDate?: Date; snapshotDate?: Date }>,
  priorRows: Array<{ monthDate?: Date; snapshotDate?: Date }>
): { currentPeriod: string | null; priorPeriod: string | null } {
  if (cadence === 'quarterly') {
    return {
      currentPeriod: trailingEndedLabel(currentRows, 3),
      priorPeriod: 'the previous 3 months',
    };
  }
  if (cadence === 'annual') {
    return {
      currentPeriod: trailingEndedLabel(currentRows, 12),
      priorPeriod: 'the previous 12 months',
    };
  }
  if (cadence === 'monthly') {
    return {
      currentPeriod: monthNameYearLabel(currentRows),
      priorPeriod: monthNameYearLabel(priorRows),
    };
  }
  return {
    currentPeriod: periodLabel(currentRows),
    priorPeriod: periodLabel(priorRows),
  };
}

function latestDateKey(...values: unknown[]): string | null {
  const dates = values
    .map((value) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(String(value));
      return Number.isNaN(date.getTime()) ? null : date;
    })
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime());
  return dates[0]?.toISOString().slice(0, 10) || null;
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfIsoWeekUtc(date: Date): Date {
  const dayStart = startOfUtcDay(date);
  const weekday = dayStart.getUTCDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  return addUtcDays(dayStart, -daysFromMonday);
}

function latestCompletedIsoWeekUtc(asOf: Date): { start: Date; end: Date } {
  const dayStart = startOfUtcDay(asOf);
  const thisWeekStart = startOfIsoWeekUtc(dayStart);
  const thisWeekEnd = addUtcDays(thisWeekStart, 6);
  if (dayStart.getTime() >= thisWeekEnd.getTime()) {
    return { start: thisWeekStart, end: thisWeekEnd };
  }
  const prevStart = addUtcDays(thisWeekStart, -7);
  return { start: prevStart, end: addUtcDays(thisWeekStart, -1) };
}

function completedIsoWeekPairUtc(asOf: Date = new Date()): {
  current: { start: Date; end: Date };
  prior: { start: Date; end: Date };
} {
  const current = latestCompletedIsoWeekUtc(asOf);
  return {
    current,
    prior: {
      start: addUtcDays(current.start, -7),
      end: addUtcDays(current.end, -7),
    },
  };
}

function rowsInUtcDateRange(rows: any[], start: Date, end: Date): any[] {
  const startMs = startOfUtcDay(start).getTime();
  const endMs = startOfUtcDay(end).getTime() + MS_IN_DAY - 1;
  return rows.filter((row) => {
    const snapshot = row?.snapshotDate instanceof Date ? row.snapshotDate : new Date(row?.snapshotDate || '');
    if (Number.isNaN(snapshot.getTime())) return false;
    const t = snapshot.getTime();
    return t >= startMs && t <= endMs;
  });
}

function ebitda(row: any): number {
  return asNumber(row?.revenue) - asNumber(row?.cogsTotal) - asNumber(row?.expense) + asNumber(row?.depreciationAmortization);
}

function isZeroIncomeActivityRow(row: any): boolean {
  return Math.abs(asNumber(row?.revenue)) < 0.005 &&
    Math.abs(asNumber(row?.cogsTotal)) < 0.005 &&
    Math.abs(asNumber(row?.expense)) < 0.005;
}

function isWeekendZeroIncomeActivityRow(row: any): boolean {
  const snapshot = row?.snapshotDate ? new Date(row.snapshotDate) : null;
  if (!snapshot || Number.isNaN(snapshot.getTime())) return false;
  const weekday = snapshot.getUTCDay();
  return (weekday === 0 || weekday === 6) && isZeroIncomeActivityRow(row);
}

const EXEC_BRIEFING_EXPENSE_FIELDS = new Set([
  'expense',
  'payroll',
  'ownerbasepay',
  'benefits',
  'insurance',
  'professionalfees',
  'subcontractors',
  'rent',
  'taxlicense',
  'phonecomm',
  'infrastructure',
  'autotravel',
  'salesexpense',
  'marketing',
  'trainingcert',
  'mealsentertainment',
  'interestexpense',
  'depreciationamortization',
  'otherexpense',
]);

function applyMappedIncomeTotalsToDailyRows(rows: any[], mappedLines: any[]): any[] {
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(mappedLines) || !mappedLines.length) return rows;
  const totalsByDate = new Map<string, { revenue: number; cogsTotal: number; expense: number; lineCount: number }>();
  for (const line of mappedLines) {
    const snapshot = line?.snapshotDate ? new Date(line.snapshotDate) : null;
    if (!snapshot || Number.isNaN(snapshot.getTime())) continue;
    const dateKey = snapshot.toISOString().slice(0, 10);
    const rawTarget = String(line?.targetField || '').trim();
    const targetWithoutMovementPrefix = rawTarget.replace(/^balance_movement:/i, '').trim();
    const normalizedTarget = targetWithoutMovementPrefix.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    const lowerTarget = targetWithoutMovementPrefix.toLowerCase();
    const amount = asNumber(line?.amount);
    const bucket = totalsByDate.get(dateKey) || { revenue: 0, cogsTotal: 0, expense: 0, lineCount: 0 };
    if (normalizedTarget === 'revenue' || lowerTarget.startsWith('rev_')) {
      bucket.revenue += amount;
      bucket.lineCount += 1;
    } else if (normalizedTarget === 'cogstotal' || lowerTarget.startsWith('cogs_')) {
      bucket.cogsTotal += amount;
      bucket.lineCount += 1;
    } else if (EXEC_BRIEFING_EXPENSE_FIELDS.has(normalizedTarget)) {
      bucket.expense += amount;
      bucket.lineCount += 1;
    }
    totalsByDate.set(dateKey, bucket);
  }
  return rows.map((row) => {
    const snapshot = row?.snapshotDate ? new Date(row.snapshotDate) : null;
    if (!snapshot || Number.isNaN(snapshot.getTime())) return row;
    const totals = totalsByDate.get(snapshot.toISOString().slice(0, 10));
    if (!totals || totals.lineCount === 0) return row;
    return {
      ...row,
      revenue: totals.revenue,
      cogsTotal: totals.cogsTotal,
      expense: totals.expense,
    };
  });
}

function summarizeFinancialRows(rows: any[]) {
  const revenue = rows.reduce((sum, row) => sum + asNumber(row.revenue), 0);
  const cogs = rows.reduce((sum, row) => sum + asNumber(row.cogsTotal), 0);
  const expense = rows.reduce((sum, row) => sum + asNumber(row.expense), 0);
  const grossProfit = revenue - cogs;
  const ebitdaValue = rows.reduce((sum, row) => sum + ebitda(row), 0);
  return {
    rowCount: rows.length,
    revenue,
    cogs,
    expense,
    grossProfit,
    grossMarginPct: pct(grossProfit, revenue),
    ebitda: ebitdaValue,
    ebitdaMargin: pct(ebitdaValue, revenue),
  };
}

function buildFinancialComparison(params: {
  key: string;
  label: string;
  cadence: BriefingPeriod;
  currentRows: any[];
  priorRows: any[];
  note?: string;
  minComparableRows?: number;
}) {
  const current = summarizeFinancialRows(params.currentRows);
  const prior = summarizeFinancialRows(params.priorRows);
  const comparable = params.minComparableRows
    ? current.rowCount >= params.minComparableRows && prior.rowCount >= params.minComparableRows
    : current.rowCount > 0 && current.rowCount === prior.rowCount;
  const periodNames = comparisonPeriodLabels(params.cadence, params.currentRows, params.priorRows);
  return {
    key: params.key,
    label: params.label,
    cadence: params.cadence,
    comparable,
    note: params.note || null,
    currentPeriod: periodNames.currentPeriod,
    priorPeriod: periodNames.priorPeriod,
    current,
    prior,
    deltas: {
      revenue: current.revenue - prior.revenue,
      revenuePct: pct(current.revenue - prior.revenue, prior.revenue),
      grossProfit: current.grossProfit - prior.grossProfit,
      grossProfitPct: pct(current.grossProfit - prior.grossProfit, prior.grossProfit),
      grossMarginPct: current.grossMarginPct != null && prior.grossMarginPct != null ? current.grossMarginPct - prior.grossMarginPct : null,
      ebitda: current.ebitda - prior.ebitda,
      ebitdaPct: pct(current.ebitda - prior.ebitda, prior.ebitda),
      ebitdaMargin: current.ebitdaMargin != null && prior.ebitdaMargin != null ? current.ebitdaMargin - prior.ebitdaMargin : null,
      expense: current.expense - prior.expense,
      expensePct: pct(current.expense - prior.expense, prior.expense),
    },
    materiality: {
      revenueMoveIsMaterial: isMaterialPct(pct(current.revenue - prior.revenue, prior.revenue)),
      grossProfitMoveIsMaterial: isMaterialAmount(current.grossProfit - prior.grossProfit, prior.grossProfit),
      grossMarginMoveIsMaterial: isMaterialPct(current.grossMarginPct != null && prior.grossMarginPct != null ? current.grossMarginPct - prior.grossMarginPct : null),
      ebitdaMoveIsMaterial: isMaterialAmount(current.ebitda - prior.ebitda, prior.ebitda),
      expenseMoveIsMaterial: isMaterialAmount(current.expense - prior.expense, prior.expense),
    },
  };
}

function trailingWindowNote(period: BriefingPeriod): string | null {
  if (period === 'quarterly') {
    return 'Write income-statement movement like: For the trailing 3 months ended July 31, 2026, revenue increased $72,357 (5.2%) from the previous 3 months. Use the same pattern for customer revenue, margin, and EBITDA. Do not list both date ranges.';
  }
  if (period === 'annual') {
    return 'Write income-statement movement like: For the trailing 12 months ended July 31, 2026, revenue increased $1,240,000 (9.1%) from the previous 12 months. Use the same pattern for customer revenue, margin, and EBITDA. Do not list both date ranges.';
  }
  if (period === 'monthly') {
    return 'Write income-statement movement like: In July 2026, revenue increased $22,100 (4.1%) from June 2026. Do not say trailing. Use the same pattern for customer revenue, margin, and EBITDA.';
  }
  return null;
}

function quarterlyIncomeWindows(completeMonthlyFinancials: any[]) {
  const sorted = sortByDate(completeMonthlyFinancials);
  return {
    primaryCurrent: sorted.slice(-3),
    primaryPrior: sorted.slice(-6, -3),
  };
}

function annualIncomeWindows(completeMonthlyFinancials: any[]) {
  const sorted = sortByDate(completeMonthlyFinancials);
  return {
    primaryCurrent: sorted.slice(-12),
    primaryPrior: sorted.slice(-24, -12),
  };
}

function buildFinancialComparisonsForPeriod(params: {
  period: BriefingPeriod;
  sortedDailyFinancials: any[];
  completeMonthlyFinancials: any[];
}) {
  const { period, sortedDailyFinancials, completeMonthlyFinancials } = params;
  const latestDailyFinancial = last(sortedDailyFinancials);
  const latestDailyDate = latestDailyFinancial?.snapshotDate || null;
  const currentMtdStart = latestDailyDate
    ? new Date(Date.UTC(latestDailyDate.getUTCFullYear(), latestDailyDate.getUTCMonth(), 1))
    : null;
  const currentMtdEnd = latestDailyDate;
  const priorMtdStart = currentMtdStart ? addUtcMonths(currentMtdStart, -1) : null;
  const priorMtdEnd = priorMtdStart && latestDailyDate ? addUtcDays(priorMtdStart, latestDailyDate.getUTCDate() - 1) : null;
  const currentMtdRows =
    currentMtdStart && currentMtdEnd
      ? sortedDailyFinancials.filter((row) => row.snapshotDate >= currentMtdStart && row.snapshotDate <= currentMtdEnd)
      : [];
  const priorMtdRows =
    priorMtdStart && priorMtdEnd
      ? sortedDailyFinancials.filter((row) => row.snapshotDate >= priorMtdStart && row.snapshotDate <= priorMtdEnd)
      : [];

  if (period === 'daily') {
    return [
      buildFinancialComparison({
        key: 'latest_day_vs_prior_day',
        label: 'Latest day vs prior day',
        cadence: 'daily',
        currentRows: sortedDailyFinancials.slice(-1),
        priorRows: sortedDailyFinancials.slice(-2, -1),
        note: 'Use only for material day-over-day movement.',
      }),
      buildFinancialComparison({
        key: 'current_mtd_vs_same_elapsed_prior_month',
        label: 'Current month-to-date vs same elapsed days last month',
        cadence: 'daily',
        currentRows:
          currentMtdRows.length >= MIN_MTD_COMPARISON_DAYS && priorMtdRows.length >= MIN_MTD_COMPARISON_DAYS
            ? currentMtdRows
            : [],
        priorRows:
          currentMtdRows.length >= MIN_MTD_COMPARISON_DAYS && priorMtdRows.length >= MIN_MTD_COMPARISON_DAYS
            ? priorMtdRows
            : [],
        note: `Same elapsed calendar days only; requires at least ${MIN_MTD_COMPARISON_DAYS} days in each period.`,
      }),
    ].filter((comparison) => comparison.comparable);
  }

  if (period === 'weekly') {
    const { current: completedWeek, prior: priorWeek } = completedIsoWeekPairUtc();
    return [
      buildFinancialComparison({
        key: 'latest_completed_week_vs_prior_week',
        label: 'Latest completed week vs prior completed week',
        cadence: 'weekly',
        currentRows: rowsInUtcDateRange(sortedDailyFinancials, completedWeek.start, completedWeek.end),
        priorRows: rowsInUtcDateRange(sortedDailyFinancials, priorWeek.start, priorWeek.end),
        note: 'Use completed Monday–Sunday weeks only. Do not mix with day-over-day or month-over-month analysis.',
        minComparableRows: MIN_WEEK_COMPARISON_DAYS,
      }),
    ].filter((comparison) => comparison.comparable);
  }

  if (period === 'quarterly') {
    const windows = quarterlyIncomeWindows(completeMonthlyFinancials);
    return [
      buildFinancialComparison({
        key: 'trailing_3_months_vs_prior_trailing_3_months',
        label: 'Trailing 3 months vs previous 3 months',
        cadence: 'quarterly',
        currentRows: windows.primaryCurrent,
        priorRows: windows.primaryPrior,
        note: trailingWindowNote('quarterly'),
      }),
    ].filter((comparison) => comparison.comparable);
  }

  if (period === 'annual') {
    const windows = annualIncomeWindows(completeMonthlyFinancials);
    return [
      buildFinancialComparison({
        key: 'trailing_12_months_vs_prior_trailing_12_months',
        label: 'Trailing 12 months vs previous 12 months',
        cadence: 'annual',
        currentRows: windows.primaryCurrent,
        priorRows: windows.primaryPrior,
        note: trailingWindowNote('annual'),
      }),
    ].filter((comparison) => comparison.comparable);
  }

  return [
    buildFinancialComparison({
      key: 'latest_completed_month_vs_prior_month',
      label: 'Latest completed month vs prior completed month',
      cadence: 'monthly',
      currentRows: completeMonthlyFinancials.slice(-1),
      priorRows: completeMonthlyFinancials.slice(-2, -1),
      note: trailingWindowNote('monthly'),
    }),
  ].filter((comparison) => comparison.comparable);
}

function utcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function utcMonthEnd(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function rangeFromMonthRows(rows: Array<{ monthDate?: Date }>): { start: Date; end: Date } | null {
  const dates = rows
    .map((row) => (row?.monthDate instanceof Date ? row.monthDate : row?.monthDate ? new Date(row.monthDate) : null))
    .filter((date): date is Date => Boolean(date) && !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());
  if (!dates.length) return null;
  return { start: utcMonthStart(dates[0]), end: utcMonthEnd(dates[dates.length - 1]) };
}

function salesWindowFromCompleteMonths(
  period: BriefingPeriod,
  completeMonthlyFinancials: any[]
): { current: { start: Date; end: Date } | null; prior: { start: Date; end: Date } | null } {
  if (period === 'quarterly') {
    const windows = quarterlyIncomeWindows(completeMonthlyFinancials);
    return {
      current: rangeFromMonthRows(windows.primaryCurrent),
      prior: rangeFromMonthRows(windows.primaryPrior),
    };
  }
  if (period === 'annual') {
    const windows = annualIncomeWindows(completeMonthlyFinancials);
    return {
      current: rangeFromMonthRows(windows.primaryCurrent),
      prior: rangeFromMonthRows(windows.primaryPrior),
    };
  }
  if (period === 'monthly') {
    return {
      current: rangeFromMonthRows(completeMonthlyFinancials.slice(-1)),
      prior: rangeFromMonthRows(completeMonthlyFinancials.slice(-2, -1)),
    };
  }
  return { current: null, prior: null };
}

function monthsInUtcRange(start: Date, end: Date): Array<{ start: Date; end: Date }> {
  const months: Array<{ start: Date; end: Date }> = [];
  let cursor = utcMonthStart(start);
  const last = utcMonthStart(end);
  while (cursor.getTime() <= last.getTime()) {
    months.push({ start: utcMonthStart(cursor), end: utcMonthEnd(cursor) });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return months;
}

function snapshotMonthKey(value: unknown): string {
  const date = value instanceof Date ? value : value ? new Date(String(value)) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
}

function salesRowsFromGroupBy(
  current: Array<{ name: string; revenue: number; cogs: number; qty?: number }>,
  prior: Array<{ name: string; revenue: number; cogs: number; qty?: number }>
) {
  const byName = new Map<string, any>();
  const add = (name: string, revenue: number, cogs: number, qty: number, bucket: 'recent' | 'prior') => {
    const key = String(name || '').trim();
    if (!key) return;
    const currentRow = byName.get(key) || {
      name: key,
      recentRevenue: 0,
      priorRevenue: 0,
      recentCogs: 0,
      priorCogs: 0,
      recentQty: 0,
      priorQty: 0,
    };
    if (bucket === 'recent') {
      currentRow.recentRevenue += revenue;
      currentRow.recentCogs += cogs;
      currentRow.recentQty += qty;
    } else {
      currentRow.priorRevenue += revenue;
      currentRow.priorCogs += cogs;
      currentRow.priorQty += qty;
    }
    byName.set(key, currentRow);
  };
  for (const row of current) add(row.name, row.revenue, row.cogs, asNumber(row.qty), 'recent');
  for (const row of prior) add(row.name, row.revenue, row.cogs, asNumber(row.qty), 'prior');
  return Array.from(byName.values()).map((entry) => {
    const recentGrossProfit = entry.recentRevenue - entry.recentCogs;
    const priorGrossProfit = entry.priorRevenue - entry.priorCogs;
    const recentMarginPct = pct(recentGrossProfit, entry.recentRevenue);
    const priorMarginPct = pct(priorGrossProfit, entry.priorRevenue);
    const recentAvgPrice = pct(entry.recentRevenue, entry.recentQty);
    const priorAvgPrice = pct(entry.priorRevenue, entry.priorQty);
    const recentUnitCost = pct(entry.recentCogs, entry.recentQty);
    const priorUnitCost = pct(entry.priorCogs, entry.priorQty);
    return {
      ...entry,
      recentGrossProfit,
      priorGrossProfit,
      grossProfitDelta: recentGrossProfit - priorGrossProfit,
      grossProfitDeltaPct: pct(recentGrossProfit - priorGrossProfit, priorGrossProfit),
      recentMarginPct,
      priorMarginPct,
      marginPctDelta: recentMarginPct != null && priorMarginPct != null ? recentMarginPct - priorMarginPct : null,
      revenueDelta: entry.recentRevenue - entry.priorRevenue,
      revenueDeltaPct: pct(entry.recentRevenue - entry.priorRevenue, entry.priorRevenue),
      avgPriceDeltaPct: recentAvgPrice != null && priorAvgPrice != null ? pct(recentAvgPrice - priorAvgPrice, priorAvgPrice) : null,
      unitCostDeltaPct: recentUnitCost != null && priorUnitCost != null ? pct(recentUnitCost - priorUnitCost, priorUnitCost) : null,
    };
  });
}

async function latestSnapshotDatesByMonth(
  delegate: any,
  whereBase: Record<string, unknown>,
  start: Date,
  end: Date,
  frequency: string
): Promise<Date[]> {
  if (!delegate?.groupBy) return [];
  const rows = await delegate.groupBy({
    by: ['snapshotDate'],
    where: { ...whereBase, frequency, snapshotDate: { gte: start, lte: end } },
  });
  const latestByMonth = new Map<string, Date>();
  for (const row of rows || []) {
    const date = row?.snapshotDate instanceof Date ? row.snapshotDate : row?.snapshotDate ? new Date(row.snapshotDate) : null;
    if (!date || Number.isNaN(date.getTime())) continue;
    const key = snapshotMonthKey(date);
    if (!key) continue;
    const previous = latestByMonth.get(key);
    if (!previous || date.getTime() > previous.getTime()) latestByMonth.set(key, date);
  }
  return Array.from(latestByMonth.values());
}

async function loadDailyMonthSales(
  delegate: any,
  whereBase: Record<string, unknown>,
  nameField: 'customerName' | 'itemName',
  sumFields: Record<string, boolean>,
  month: { start: Date; end: Date }
) {
  const dateRows = await delegate.groupBy({
    by: ['snapshotDate'],
    where: { ...whereBase, frequency: 'daily', snapshotDate: { gte: month.start, lte: month.end } },
  });
  const dates = (dateRows || [])
    .map((row: any) => (row?.snapshotDate instanceof Date ? row.snapshotDate : row?.snapshotDate ? new Date(row.snapshotDate) : null))
    .filter((date: Date | null): date is Date => Boolean(date) && !Number.isNaN(date.getTime()))
    .sort((left: Date, right: Date) => left.getTime() - right.getTime());
  if (!dates.length) return [];
  const lastDate = dates[dates.length - 1];
  const [summed, lastDay] = await Promise.all([
    delegate.groupBy({
      by: [nameField],
      where: { ...whereBase, frequency: 'daily', snapshotDate: { gte: month.start, lte: month.end } },
      _sum: sumFields,
    }),
    delegate.groupBy({
      by: [nameField],
      where: { ...whereBase, frequency: 'daily', snapshotDate: lastDate },
      _sum: sumFields,
    }),
  ]);
  const namedSum = (rows: any[]) => (rows || []).reduce((total, row) => total + asNumber(row?._sum?.revenue), 0);
  if (dates.length > 2 && namedSum(lastDay) > 0 && namedSum(summed) > namedSum(lastDay) * 3) {
    return lastDay;
  }
  return summed;
}

async function loadNamedSalesForRange(params: {
  delegate: any;
  nameField: 'customerName' | 'itemName';
  companyId: string;
  range: { start: Date; end: Date };
}): Promise<Array<{ name: string; revenue: number; cogs: number; qty: number }>> {
  const { delegate, nameField, companyId, range } = params;
  if (!delegate?.groupBy) return [];
  const whereBase = { companyId };
  const sumFields =
    nameField === 'itemName'
      ? { revenue: true, cogs: true, quantitySold: true }
      : { revenue: true, cogs: true };
  const asNamed = (rows: any[]) =>
    (rows || [])
      .map((row) => ({
        name: String(row?.[nameField] || '').trim(),
        revenue: asNumber(row?._sum?.revenue),
        cogs: asNumber(row?._sum?.cogs),
        qty: asNumber(row?._sum?.quantitySold),
      }))
      .filter((row) => row.name);
  const mergeNamed = (groups: Array<Array<{ name: string; revenue: number; cogs: number; qty: number }>>) => {
    const byName = new Map<string, { name: string; revenue: number; cogs: number; qty: number }>();
    for (const rows of groups) {
      for (const row of rows) {
        const current = byName.get(row.name) || { name: row.name, revenue: 0, cogs: 0, qty: 0 };
        current.revenue += row.revenue;
        current.cogs += row.cogs;
        current.qty += row.qty;
        byName.set(row.name, current);
      }
    }
    return Array.from(byName.values());
  };

  const monthWindows = monthsInUtcRange(range.start, range.end);
  const monthlyDates = await latestSnapshotDatesByMonth(delegate, whereBase, range.start, range.end, 'monthly');
  const monthlyMonthKeys = new Set(monthlyDates.map((date) => snapshotMonthKey(date)).filter(Boolean));
  const dailyMonths = monthWindows.filter((month) => !monthlyMonthKeys.has(snapshotMonthKey(month.start)));

  const monthlyRows = monthlyDates.length
    ? await delegate.groupBy({
        by: [nameField],
        where: { ...whereBase, frequency: 'monthly', snapshotDate: { in: monthlyDates } },
        _sum: sumFields,
      })
    : [];

  const dailyRowSets = await Promise.all(
    dailyMonths.map((month) => loadDailyMonthSales(delegate, whereBase, nameField, sumFields, month))
  );

  return mergeNamed([asNamed(monthlyRows), ...dailyRowSets.map(asNamed)]);
}

async function loadSalesGroupByPeriod(params: {
  table: 'customerSalesSnapshot' | 'productSalesSnapshot';
  nameField: 'customerName' | 'itemName';
  companyId: string;
  currentRange: { start: Date; end: Date };
  priorRange: { start: Date; end: Date } | null;
}): Promise<ReturnType<typeof salesRowsFromGroupBy>> {
  const delegate = (prisma as any)[params.table];
  if (!delegate?.groupBy) return [];
  const [current, prior] = await Promise.all([
    loadNamedSalesForRange({
      delegate,
      nameField: params.nameField,
      companyId: params.companyId,
      range: params.currentRange,
    }),
    params.priorRange
      ? loadNamedSalesForRange({
          delegate,
          nameField: params.nameField,
          companyId: params.companyId,
          range: params.priorRange,
        })
      : Promise.resolve([]),
  ]);
  return salesRowsFromGroupBy(current, prior);
}

function buildPeriodSets(rows: any[]) {
  const dates = Array.from(new Set(rows.map((row) => dateKey(row.snapshotDate)).filter(Boolean))).sort();
  if (dates.length <= 1) return { recentDates: new Set(dates), priorDates: new Set() };
  const windowSize = Math.max(1, Math.min(6, Math.floor(dates.length / 2)));
  return {
    recentDates: new Set(dates.slice(-windowSize)),
    priorDates: new Set(dates.slice(-windowSize * 2, -windowSize)),
  };
}

function aggregateSales(rows: any[], nameKey: 'itemName' | 'customerName') {
  const { recentDates, priorDates } = buildPeriodSets(rows);
  const byName = new Map<string, any>();

  for (const row of rows) {
    const name = String(row?.[nameKey] || '').trim();
    const d = dateKey(row?.snapshotDate);
    if (!name || (!recentDates.has(d) && !priorDates.has(d))) continue;
    const current = byName.get(name) || {
      name,
      recentRevenue: 0,
      priorRevenue: 0,
      recentCogs: 0,
      priorCogs: 0,
      recentQty: 0,
      priorQty: 0,
    };
    const revenue = asNumber(row?.revenue);
    const cogs = asNumber(row?.cogs);
    const qty = asNumber(row?.quantitySold);
    if (recentDates.has(d)) {
      current.recentRevenue += revenue;
      current.recentCogs += cogs;
      current.recentQty += qty;
    } else {
      current.priorRevenue += revenue;
      current.priorCogs += cogs;
      current.priorQty += qty;
    }
    byName.set(name, current);
  }

  return Array.from(byName.values()).map((entry) => {
    const recentGrossProfit = entry.recentRevenue - entry.recentCogs;
    const priorGrossProfit = entry.priorRevenue - entry.priorCogs;
    const recentMarginPct = pct(recentGrossProfit, entry.recentRevenue);
    const priorMarginPct = pct(priorGrossProfit, entry.priorRevenue);
    const recentAvgPrice = pct(entry.recentRevenue, entry.recentQty);
    const priorAvgPrice = pct(entry.priorRevenue, entry.priorQty);
    const recentUnitCost = pct(entry.recentCogs, entry.recentQty);
    const priorUnitCost = pct(entry.priorCogs, entry.priorQty);
    return {
      ...entry,
      recentGrossProfit,
      priorGrossProfit,
      grossProfitDelta: recentGrossProfit - priorGrossProfit,
      grossProfitDeltaPct: pct(recentGrossProfit - priorGrossProfit, priorGrossProfit),
      recentMarginPct,
      priorMarginPct,
      marginPctDelta: recentMarginPct != null && priorMarginPct != null ? recentMarginPct - priorMarginPct : null,
      revenueDelta: entry.recentRevenue - entry.priorRevenue,
      revenueDeltaPct: pct(entry.recentRevenue - entry.priorRevenue, entry.priorRevenue),
      avgPriceDeltaPct: recentAvgPrice != null && priorAvgPrice != null ? pct(recentAvgPrice - priorAvgPrice, priorAvgPrice) : null,
      unitCostDeltaPct: recentUnitCost != null && priorUnitCost != null ? pct(recentUnitCost - priorUnitCost, priorUnitCost) : null,
    };
  });
}

function likelyMarginDriver(row: any): string {
  if ((row.avgPriceDeltaPct ?? 0) <= -0.02) return 'lower average selling price / discounting';
  if ((row.unitCostDeltaPct ?? 0) >= 0.02) return 'higher unit cost';
  if ((row.revenueDeltaPct ?? 0) > 0.02 && (row.marginPctDelta ?? 0) < 0) return 'mix shift toward lower-margin volume';
  if ((row.revenueDeltaPct ?? 0) < -0.02 && (row.marginPctDelta ?? 0) > 0) return 'lower volume offset by better margin rate';
  return 'margin mix';
}

function findBenchmark(benchmarks: any[], patterns: RegExp[]): any | null {
  return benchmarks.find((benchmark) => patterns.some((pattern) => pattern.test(String(benchmark?.metricName || '')))) || null;
}

async function loadGoals(table: 'ExpenseGoal' | 'OperationalGoal', companyId: string) {
  try {
    return table === 'ExpenseGoal'
      ? await prisma.$queryRaw<Array<{ goals: any }>>`SELECT goals FROM "ExpenseGoal" WHERE "companyId" = ${companyId}`
      : await prisma.$queryRaw<Array<{ goals: any }>>`SELECT goals FROM "OperationalGoal" WHERE "companyId" = ${companyId}`;
  } catch {
    return [];
  }
}

function agingSummary(row: any, totalKey: 'totalAR' | 'totalAP') {
  if (!row) return null;
  const total = asNumber(row?.[totalKey]);
  const over30 = asNumber(row?.days31to60) + asNumber(row?.days61to90) + asNumber(row?.days90plus);
  const over60 = asNumber(row?.days61to90) + asNumber(row?.days90plus);
  return {
    snapshotDate: row.snapshotDate,
    total,
    over30,
    over30Pct: pct(over30, total),
    over60,
    over60Pct: pct(over60, total),
    dso: row?.dso != null ? asNumber(row.dso) : null,
  };
}

function agingTotalReconcilesToBalanceSheet(aging: ReturnType<typeof agingSummary>, balanceSheetTotal: number | null): boolean {
  if (!aging || balanceSheetTotal == null) return Boolean(aging);
  const agingTotal = Math.abs(asNumber(aging.total));
  const bsTotal = Math.abs(asNumber(balanceSheetTotal));
  if (agingTotal === 0 && bsTotal === 0) return true;
  if (agingTotal === 0 || bsTotal === 0) return false;
  const variance = Math.abs(agingTotal - bsTotal);
  return variance <= Math.max(5000, bsTotal * 0.25);
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text.trim());
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function sectionCandidatesFromPayload(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.sections)) return value.sections;
  if (Array.isArray(value.briefingSections)) return value.briefingSections;
  if (Array.isArray(value.execBriefingSections)) return value.execBriefingSections;
  if (Array.isArray(value.dailyExecBriefing?.sections)) return value.dailyExecBriefing.sections;
  if (Array.isArray(value.briefing?.sections)) return value.briefing.sections;
  if (value.title && value.bullets) return [value];

  return Object.entries(value)
    .filter(([, sectionValue]) => Array.isArray(sectionValue))
    .map(([title, bullets]) => ({ title, bullets }));
}

function normalizeBullet(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    return String(value.bullet || value.text || value.summary || value.recommendation || value.action || '').trim();
  }
  return String(value).trim();
}

function hasSpecificEvidence(text: string): boolean {
  return /(\$[\d,.]+|\d+(?:\.\d+)?%|\d+(?:\.\d+)?\s*(?:days?|weeks?|months?|pts?|points?|bps|x)\b|threshold|headroom|margin|gross profit|revenue|cash|AR|AP|DSO|LOC|EBITDA|customer|product|covenant)/i.test(text);
}

function hasUnsupportedMarketingLanguage(text: string): boolean {
  return /\b(marketing|paid search|referrals?|email campaigns?|events?|social media|channel ROI|CAC|LTV|CPA|customer acquisition cost|lifetime value|cost per acquisition|pilot budget|campaigns?|ad spend|advertising)\b/i.test(text);
}

function isMaterialAmount(value: number | null | undefined, baseline?: number | null): boolean {
  if (value == null || !Number.isFinite(value)) return false;
  if (Math.abs(value) >= MATERIAL_AMOUNT * 10) return true;
  if (baseline != null && Number.isFinite(baseline) && Math.abs(baseline) > 0) {
    return Math.abs(value / baseline) >= MATERIAL_FINANCIAL_PCT;
  }
  return Math.abs(value) >= MATERIAL_AMOUNT;
}

function isMaterialPct(value: number | null | undefined, threshold = MATERIAL_FINANCIAL_PCT): boolean {
  return value != null && Number.isFinite(value) && Math.abs(value) >= threshold;
}

function normalizeSections(value: any, options?: { allowMarketingLanguage?: boolean }): BriefingSection[] {
  const sections = sectionCandidatesFromPayload(value);
  return sections
    .map((section: any) => {
      const title = String(section?.title || section?.heading || section?.name || '').trim();
      const rawBullets = section?.bullets || section?.items || section?.points || section?.takeaways || section?.recommendations;
      const bullets = Array.isArray(rawBullets)
        ? rawBullets.map(normalizeBullet).filter(Boolean)
        : [];
      const evidenceFiltered = /recommended actions?/i.test(title) ? bullets.filter(hasSpecificEvidence) : bullets;
      const filtered = options?.allowMarketingLanguage
        ? evidenceFiltered
        : evidenceFiltered.filter((bullet) => !hasUnsupportedMarketingLanguage(`${title} ${bullet}`));
      return { title, bullets: filtered.slice(0, 6) };
    })
    .filter((section) => section.title && section.bullets.length > 0)
    .slice(0, 8);
}

function sourceNote(label: string, count: number): string {
  if (count <= 0) return '';
  return `${label} available`;
}

/** Set per-request from company base/reporting currency before formatting briefing amounts. */
let briefingMoneyCurrency = DEFAULT_BASE_CURRENCY;

function formatMoney(value: unknown, currency: string = briefingMoneyCurrency): string {
  return formatMoneyShared(asNumber(value), { currency, decimals: 0 });
}

function formatPercent(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.0%';
  return `${(n * 100).toFixed(1)}%`;
}

function formatPercentPoints(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.0 pts';
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(1)} pts`;
}

function buildMockExecBriefingResponse(facts: any, sourceNotes: string[], period: BriefingPeriod, asOfDate: string): BriefingResponse {
  const financials = facts?.financials || {};
  const workingCapital = facts?.workingCapital || {};
  const customers = facts?.customers || {};
  const products = facts?.products || {};
  const sections: BriefingSection[] = [];

  const topTakeawayBullets = [
    `Recent revenue is ${formatMoney(financials.recentRevenue)} versus ${formatMoney(financials.priorRevenue)}, a ${formatMoney(financials.revenueDelta)} change (${formatPercent(financials.revenueDeltaPct)}).`,
    `Gross profit is ${formatMoney(financials.recentGrossProfit)} versus ${formatMoney(financials.priorGrossProfit)}, with gross margin at ${formatPercent(financials.grossMarginPct)} (${formatPercentPoints(financials.grossMarginDeltaPct)} versus the prior window).`,
  ];
  if (financials.latestCash || financials.balanceSheetAR || financials.balanceSheetAP) {
    topTakeawayBullets.push(
      `Latest cash is ${formatMoney(financials.latestCash)}, with balance sheet AR of ${formatMoney(financials.balanceSheetAR)} and AP of ${formatMoney(financials.balanceSheetAP)}.`
    );
  }
  sections.push({ title: 'Top Takeaway', bullets: topTakeawayBullets });

  const workingCapitalBullets: string[] = [];
  if (workingCapital.arAging) {
    workingCapitalBullets.push(
      `AR aging shows ${formatMoney(workingCapital.arAging.over30)} over 30 days (${formatPercent(workingCapital.arAging.over30Pct)}) and ${formatMoney(workingCapital.arAging.over60)} over 60 days (${formatPercent(workingCapital.arAging.over60Pct)}).`
    );
  }
  if (workingCapital.apAging) {
    workingCapitalBullets.push(
      `AP aging shows ${formatMoney(workingCapital.apAging.over30)} over 30 days (${formatPercent(workingCapital.apAging.over30Pct)}) and ${formatMoney(workingCapital.apAging.over60)} over 60 days (${formatPercent(workingCapital.apAging.over60Pct)}).`
    );
  }
  if (workingCapitalBullets.length) {
    sections.push({ title: 'Working Capital', bullets: workingCapitalBullets });
  }

  const operatingBullets: string[] = [];
  if (period === 'daily' && facts?.dailyOperations?.notableExceptions?.length) {
    for (const exception of facts.dailyOperations.notableExceptions.slice(0, 3)) {
      operatingBullets.push(`${exception.title}: ${exception.detail}.`);
    }
  }
  if (customers.topCustomers?.length) {
    const topCustomer = customers.topCustomers[0];
    const share = topCustomer.booksRevenueShare ?? topCustomer.revenueShare;
    const shareLabel = customers.alignedToBooksWindow ? 'books revenue' : 'identified customer sales';
    operatingBullets.push(
      `${topCustomer.name} is the largest recent customer exposure at ${formatMoney(topCustomer.recentRevenue)} (${formatPercent(share)} of ${shareLabel}).`
    );
  }
  if (products.topMarginWatch?.length) {
    const topProduct = products.topMarginWatch[0];
    operatingBullets.push(
      `${topProduct.name} has the largest product/service margin watch item, with gross profit moving ${formatMoney(topProduct.grossProfitDelta)} and margin moving ${formatPercentPoints(topProduct.marginPctDelta)}; likely driver is ${topProduct.likelyDriver}.`
    );
  }
  if (operatingBullets.length) {
    sections.push({ title: 'Operating Watch Items', bullets: operatingBullets });
  }

  if (facts?.dataCoverage) {
    sections.push({
      title: 'Data Coverage',
      bullets: [
        `Mock briefing uses available financial, cash, AR, AP, customer sales, product/service sales, and benchmark data for ${facts.company?.name || 'this company'}.`,
      ],
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    period,
    asOfDate,
    aiGenerated: false,
    sections: sections.length
      ? sections
      : [
          {
            title: 'No Material Exceptions',
            bullets: ['No material exceptions were identified in the available mock financial and sector operating data for today.'],
          },
        ],
    sourceNotes,
  };
}

function isStoredArApAlert(alert: any): boolean {
  const text = `${alert?.source || ''} ${alert?.bucket || ''} ${alert?.title || ''} ${alert?.detail || ''}`;
  return /\b(AR|AP|accounts receivable|accounts payable|receivable|payable)\b/i.test(text);
}

function jsonStable(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (v instanceof Date) return v.toISOString();
    return v;
  });
}

function cacheExpiryDate(): Date {
  return addUtcDays(new Date(), PERSISTED_CACHE_TTL_DAYS);
}

async function ensurePulseCacheTables(): Promise<void> {
  if (!pulseCacheTablesPromise) {
    pulseCacheTablesPromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PulseExecBriefingCache" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "cacheDate" TEXT NOT NULL,
          "dataVersion" TEXT NOT NULL,
          "response" JSONB NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "expiresAt" TIMESTAMP NOT NULL,
          CONSTRAINT "PulseExecBriefingCache_company_date_key" UNIQUE ("companyId", "cacheDate")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "PulseExecBriefingCache_company_version_idx"
        ON "PulseExecBriefingCache"("companyId", "cacheDate", "dataVersion")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "PulseExecBriefingCache_expires_idx"
        ON "PulseExecBriefingCache"("expiresAt")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PulseDailySummary" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "summaryDate" TEXT NOT NULL,
          "dataVersion" TEXT NOT NULL,
          "facts" JSONB NOT NULL,
          "sourceNotes" JSONB NOT NULL,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "expiresAt" TIMESTAMP NOT NULL,
          CONSTRAINT "PulseDailySummary_company_date_key" UNIQUE ("companyId", "summaryDate")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "PulseDailySummary_company_version_idx"
        ON "PulseDailySummary"("companyId", "summaryDate", "dataVersion")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "PulseDailySummary_expires_idx"
        ON "PulseDailySummary"("expiresAt")
      `);
    })().catch((error) => {
      pulseCacheTablesPromise = null;
      throw error;
    });
  }
  await pulseCacheTablesPromise;
}

async function safeVersionPart(label: string, sql: string, ...params: unknown[]) {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(sql, ...params);
    return { label, rows };
  } catch (error: any) {
    return { label, unavailable: true, error: String(error?.message || error).slice(0, 120) };
  }
}

async function buildPulseDataVersion(companyId: string, startDate: Date, monthlyStartDate: Date, moduleProfile: ReturnType<typeof getExecBriefingModuleProfile>): Promise<string> {
  const optionalParts = [
    moduleProfile.genericSnapshots.customers
      ? safeVersionPart(
          'customerSalesSnapshot',
          `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
           FROM "CustomerSalesSnapshot"
           WHERE "companyId" = $1 AND "snapshotDate" >= $2`,
          companyId,
          startDate
        )
      : Promise.resolve({ label: 'customerSalesSnapshot', skipped: true }),
    moduleProfile.genericSnapshots.products
      ? safeVersionPart(
          'productSalesSnapshot',
          `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
           FROM "ProductSalesSnapshot"
           WHERE "companyId" = $1 AND "snapshotDate" >= $2`,
          companyId,
          startDate
        )
      : Promise.resolve({ label: 'productSalesSnapshot', skipped: true }),
    moduleProfile.genericSnapshots.inventory
      ? safeVersionPart(
          'inventorySnapshot',
          `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
           FROM "InventorySnapshot"
           WHERE "companyId" = $1 AND "snapshotDate" >= $2`,
          companyId,
          startDate
        )
      : Promise.resolve({ label: 'inventorySnapshot', skipped: true }),
    Promise.resolve({
      label: 'briefingModuleProfile',
      sectorCategory: moduleProfile.sectorCategory,
      modules: moduleProfile.moduleKeys,
      dataTypes: moduleProfile.dataTypes,
    }),
    Promise.resolve({
      label: 'execBriefingLogic',
      version: EXEC_BRIEFING_LOGIC_VERSION,
    }),
  ];

  const parts = await Promise.all([
    safeVersionPart(
      'company',
      `SELECT "updatedAt" FROM "Company" WHERE "id" = $1`,
      companyId
    ),
    safeVersionPart(
      'monthlyFinancial',
      `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("monthDate") AS "maxMonthDate"
       FROM "MonthlyFinancial"
       WHERE "companyId" = $1 AND "monthDate" >= $2`,
      companyId,
      monthlyStartDate
    ),
    safeVersionPart(
      'dailyFinancialSnapshot',
      `SELECT COUNT(*)::text AS count, MAX("updatedAt") AS "maxUpdatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
       FROM "DailyFinancialSnapshot"
       WHERE "companyId" = $1 AND "snapshotDate" >= $2`,
      companyId,
      startDate
    ),
    safeVersionPart(
      'dailyFinancialMappedLine',
      `SELECT COUNT(*)::text AS count, MAX("updatedAt") AS "maxUpdatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
       FROM "DailyFinancialMappedLine"
       WHERE "companyId" = $1 AND "snapshotDate" >= $2`,
      companyId,
      startDate
    ),
    safeVersionPart(
      'cashSnapshot',
      `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
       FROM "CashSnapshot"
       WHERE "companyId" = $1 AND "snapshotDate" >= $2`,
      companyId,
      startDate
    ),
    safeVersionPart(
      'arAgingSnapshot',
      `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
       FROM "ARAgingSnapshot"
       WHERE "companyId" = $1 AND "snapshotDate" >= $2`,
      companyId,
      startDate
    ),
    safeVersionPart(
      'apAgingSnapshot',
      `SELECT COUNT(*)::text AS count, MAX("createdAt") AS "maxCreatedAt", MAX("snapshotDate") AS "maxSnapshotDate"
       FROM "APAgingSnapshot"
       WHERE "companyId" = $1 AND "snapshotDate" >= $2`,
      companyId,
      startDate
    ),
    ...optionalParts,
    safeVersionPart(
      'loan',
      `SELECT COUNT(*)::text AS count, MAX("updatedAt") AS "maxUpdatedAt"
       FROM "Loan"
       WHERE "companyId" = $1 AND "status" IN ('ACTIVE', 'MATURING')`,
      companyId
    ),
    safeVersionPart(
      'performanceFinding',
      `SELECT COUNT(*)::text AS count, MAX("updatedAt") AS "maxUpdatedAt"
       FROM "PerformanceFinding"
       WHERE "companyId" = $1`,
      companyId
    ),
    Promise.resolve({ label: 'pulseAlert', skipped: true }),
  ]);
  return createHash('sha256').update(jsonStable(parts)).digest('hex');
}

async function readBriefingCache(companyId: string, cacheDate: string, dataVersion: string): Promise<BriefingResponse | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ response: BriefingResponse }>>(
    `SELECT "response"
     FROM "PulseExecBriefingCache"
     WHERE "companyId" = $1
       AND "cacheDate" = $2
       AND "dataVersion" = $3
       AND "expiresAt" > CURRENT_TIMESTAMP
     LIMIT 1`,
    companyId,
    cacheDate,
    dataVersion
  );
  return rows[0]?.response || null;
}

async function writeBriefingCache(companyId: string, cacheDate: string, dataVersion: string, response: BriefingResponse): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PulseExecBriefingCache" ("id", "companyId", "cacheDate", "dataVersion", "response", "updatedAt", "expiresAt")
     VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP, $6)
     ON CONFLICT ("companyId", "cacheDate")
     DO UPDATE SET
       "dataVersion" = EXCLUDED."dataVersion",
       "response" = EXCLUDED."response",
       "updatedAt" = CURRENT_TIMESTAMP,
       "expiresAt" = EXCLUDED."expiresAt"`,
    `peb_${companyId}_${cacheDate}`,
    companyId,
    cacheDate,
    dataVersion,
    JSON.stringify(response),
    cacheExpiryDate()
  );
}

async function readDailySummary(companyId: string, summaryDate: string, dataVersion: string): Promise<{ facts: any; sourceNotes: string[] } | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ facts: any; sourceNotes: unknown }>>(
    `SELECT "facts", "sourceNotes"
     FROM "PulseDailySummary"
     WHERE "companyId" = $1
       AND "summaryDate" = $2
       AND "dataVersion" = $3
       AND "expiresAt" > CURRENT_TIMESTAMP
     LIMIT 1`,
    companyId,
    summaryDate,
    dataVersion
  );
  if (!rows[0]) return null;
  return {
    facts: rows[0].facts,
    sourceNotes: Array.isArray(rows[0].sourceNotes) ? rows[0].sourceNotes.map(String) : [],
  };
}

async function writeDailySummary(companyId: string, summaryDate: string, dataVersion: string, facts: any, sourceNotes: string[]): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PulseDailySummary" ("id", "companyId", "summaryDate", "dataVersion", "facts", "sourceNotes", "updatedAt", "expiresAt")
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, CURRENT_TIMESTAMP, $7)
     ON CONFLICT ("companyId", "summaryDate")
     DO UPDATE SET
       "dataVersion" = EXCLUDED."dataVersion",
       "facts" = EXCLUDED."facts",
       "sourceNotes" = EXCLUDED."sourceNotes",
       "updatedAt" = CURRENT_TIMESTAMP,
       "expiresAt" = EXCLUDED."expiresAt"`,
    `pds_${companyId}_${summaryDate}`,
    companyId,
    summaryDate,
    dataVersion,
    JSON.stringify(facts),
    JSON.stringify(sourceNotes),
    cacheExpiryDate()
  );
}

export async function GET(request: NextRequest) {
  try {
    const authorizedByCron = isCronAuthorized(request);
    if (!authorizedByCron) {
      await requireAuth();
    }

    const companyId = request.nextUrl.searchParams.get('companyId') || '';
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    const forceRefresh = request.nextUrl.searchParams.get('force') === 'true';
    const period = normalizeBriefingPeriod(request.nextUrl.searchParams.get('period'));

    if (!authorizedByCron) {
      const hasAccess = await validateCompanyAccess(companyId);
      if (!hasAccess) {
        await auditForbiddenAccess('Company', companyId, 'PULSE_EXEC_BRIEFING_READ');
        return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
      }
    }

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - DAILY_BRIEFING_LOOKBACK_DAYS * MS_IN_DAY);
    const monthlyStartDate = new Date();
    monthlyStartDate.setMonth(monthlyStartDate.getMonth() - MONTHLY_BRIEFING_LOOKBACK_MONTHS);
    const baseCacheKey = todayCacheKey(companyId);
    const cacheDate = baseCacheKey.split(':').pop() || formatEstDate();
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        accountingSystem: true,
        industrySector: true,
        industrySectorCategory: true,
        forceOperationalMockData: true,
        baseCurrency: true,
        reportingCurrency: true,
        locale: true,
      },
    } as any);
    const shouldUseGeneSolutionsMockBriefing =
      companyId === GENE_SOLUTIONS_COMPANY_ID && company?.forceOperationalMockData === true;
    briefingMoneyCurrency = resolveDisplayCurrency({
      baseCurrency: company?.baseCurrency,
      reportingCurrency: company?.reportingCurrency,
    });
    await ensurePulseCacheTables();
    const isQuickBooksCompany = ['QUICKBOOKS', 'QUICKBOOKS_DESKTOP', 'QUICKBOOKS_ENTERPRISE', 'QUICKBOOKS_ONLINE', 'QBO'].includes(
      String(company?.accountingSystem || '').trim().toUpperCase()
    );
    const dailyCapability = await resolveDailyBriefingCapability(companyId, {
      accountingSystem: company?.accountingSystem,
    });
    // Non-QBO companies historically always offered Daily; keep attempting the full path
    // when capability is none. QBO requires explicit daily books or daily ops feeds.
    const effectiveDailyMode: DailyBriefingMode =
      period !== 'daily'
        ? 'none'
        : dailyCapability.mode !== 'none'
          ? dailyCapability.mode
          : dailyCapability.isQuickBooksOnline
            ? 'none'
            : 'full';
    const cacheKey = `${baseCacheKey}:${period}:${period === 'daily' ? effectiveDailyMode : 'n/a'}`;
    const persistedCacheDate =
      period === 'daily'
        ? `${periodCacheDate(cacheDate, period)}:${effectiveDailyMode}`
        : periodCacheDate(cacheDate, period);

    if (period === 'daily' && dailyCapability.isQuickBooksOnline && effectiveDailyMode === 'none') {
      const response = {
        generatedAt: new Date().toISOString(),
        period,
        asOfDate: cacheDate,
        aiGenerated: false,
        dailyMode: 'none' as DailyBriefingMode,
        sections: [
          {
            title: 'Daily Briefing Not Available',
            bullets: [
              'This QuickBooks Online company does not have fresh daily operational data sources synced yet.',
              'Weekly, Monthly, Quarterly, and Annual briefings remain available from processed QuickBooks books.',
              'Daily unlocks automatically when a non-Excel operational API source syncs daily snapshots (sales, customers, cash, AR/AP, or inventory).',
            ],
          },
        ],
        sourceNotes: [dailyCapability.reason],
      } satisfies BriefingResponse;
      return NextResponse.json(response, { headers: PRIVATE_DAILY_CACHE_HEADERS });
    }

    if (isQuickBooksCompany) {
      const processedRows = await prisma.monthlyFinancial.count({ where: { companyId } });
      if (processedRows === 0) {
        await prisma.$executeRawUnsafe(`DELETE FROM "PulseDailySummary" WHERE "companyId" = $1`, companyId).catch(() => {});
        await prisma.$executeRawUnsafe(`DELETE FROM "PulseExecBriefingCache" WHERE "companyId" = $1`, companyId).catch(() => {});
        const response = {
          generatedAt: new Date().toISOString(),
          period,
          asOfDate: cacheDate,
          aiGenerated: false,
          dailyMode: effectiveDailyMode === 'none' ? undefined : effectiveDailyMode,
          sections: [
            {
              title: 'Financial Master Not Processed',
              bullets: ['QuickBooks data has been loaded, but it has not been processed into the financial master yet. Executive Briefing is paused until processed financial data is available.'],
            },
          ],
          sourceNotes: ['QuickBooks loaded data is not used for briefing until MonthlyFinancial master rows exist.'],
        } satisfies BriefingResponse;
        return NextResponse.json(response, { headers: PRIVATE_DAILY_CACHE_HEADERS });
      }
    }
    const sectorCategory = resolveCompanyIndustrySectorCategory(company);
    const moduleProfile = getExecBriefingModuleProfile(sectorCategory);
    const dataVersion = await buildPulseDataVersion(companyId, startDate, monthlyStartDate, moduleProfile);
    const versionedCacheKey = `${cacheKey}:${dataVersion.slice(0, 12)}`;

    if (!forceRefresh && !shouldUseGeneSolutionsMockBriefing) {
      const cached = dailyBriefingCache.get(versionedCacheKey);
      if (cached) return NextResponse.json(cached, { headers: PRIVATE_DAILY_CACHE_HEADERS });
      const persistedCached = await readBriefingCache(companyId, persistedCacheDate, dataVersion);
      if (persistedCached) {
        dailyBriefingCache.set(versionedCacheKey, persistedCached);
        return NextResponse.json(persistedCached, { headers: PRIVATE_DAILY_CACHE_HEADERS });
      }
    }

    let facts: any;
    let sourceNotes: string[];
    const cachedSummary = !forceRefresh ? await readDailySummary(companyId, persistedCacheDate, dataVersion) : null;
    if (cachedSummary) {
      facts = cachedSummary.facts;
      sourceNotes = cachedSummary.sourceNotes;
    } else {

    const industryGroupId = company?.industrySector ? String(company.industrySector) : null;
    const benchmarks = industryGroupId
      ? await prisma.industryBenchmark.findMany({
          where: { industryId: industryGroupId },
          select: { metricName: true, fiveYearValue: true, industryName: true, assetSizeCategory: true },
          take: 250,
        })
      : [];

    const usePublishedMonthlyBooks = period === 'monthly' || period === 'quarterly' || period === 'annual' || isQuickBooksCompany;
    const loadRollingSalesSnapshots = period === 'daily' || period === 'weekly';
    const dfsMonthly = usePublishedMonthlyBooks
      ? null
      : await loadMonthlyFromDfs(companyId, monthlyStartDate, endDate);
    const latestFinancialRecord = dfsMonthly
      ? null
      : await prisma.financialRecord.findFirst({ where: { companyId }, select: { id: true }, orderBy: { createdAt: 'desc' } });
    const monthlyWhere: any = { companyId, monthDate: { gte: monthlyStartDate, lte: endDate } };
    if (latestFinancialRecord?.id) monthlyWhere.financialRecordId = latestFinancialRecord.id;

    const [
      monthlyFinancialsRaw,
      dailyFinancials,
      dailyFinancialMappedLines,
      cashSnapshots,
      arSnapshots,
      apSnapshots,
      customerSnapshots,
      productSnapshots,
      inventorySnapshots,
      loans,
      expenseGoals,
      operationalGoals,
      findings,
      pulseAlerts,
    ] = await Promise.all([
      dfsMonthly ? Promise.resolve([]) : prisma.monthlyFinancial.findMany({ where: monthlyWhere, orderBy: { monthDate: 'asc' }, take: MONTHLY_FINANCIAL_ROW_CAP }),
      prisma.dailyFinancialSnapshot.findMany({ where: { companyId, frequency: 'daily', snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: DAILY_FINANCIAL_ROW_CAP }),
      (prisma as any).dailyFinancialMappedLine?.findMany
        ? (prisma as any).dailyFinancialMappedLine.findMany({
            where: {
              companyId,
              frequency: 'daily',
              snapshotDate: { gte: startDate, lte: endDate },
            },
            select: {
              snapshotDate: true,
              targetField: true,
              amount: true,
            },
            orderBy: [{ snapshotDate: 'asc' }],
            take: 5000,
          })
        : Promise.resolve([]),
      prisma.cashSnapshot.findMany({ where: { companyId, snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: CORE_SNAPSHOT_ROW_CAP }),
      prisma.aRAgingSnapshot.findMany({ where: { companyId, snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: CORE_SNAPSHOT_ROW_CAP }),
      prisma.aPAgingSnapshot.findMany({ where: { companyId, snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: CORE_SNAPSHOT_ROW_CAP }),
      loadRollingSalesSnapshots && moduleProfile.genericSnapshots.customers
        ? prisma.customerSalesSnapshot.findMany({ where: { companyId, snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: DETAIL_SNAPSHOT_ROW_CAP })
        : Promise.resolve([]),
      loadRollingSalesSnapshots && moduleProfile.genericSnapshots.products
        ? prisma.productSalesSnapshot.findMany({ where: { companyId, snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: DETAIL_SNAPSHOT_ROW_CAP })
        : Promise.resolve([]),
      moduleProfile.genericSnapshots.inventory
        ? prisma.inventorySnapshot.findMany({ where: { companyId, snapshotDate: { gte: startDate, lte: endDate } }, orderBy: { snapshotDate: 'asc' }, take: DETAIL_SNAPSHOT_ROW_CAP })
        : Promise.resolve([]),
      prisma.loan.findMany({ where: { companyId, status: { in: ['ACTIVE', 'MATURING'] as any } }, include: { covenants: true }, take: 50 } as any),
      loadGoals('ExpenseGoal', companyId),
      loadGoals('OperationalGoal', companyId),
      prisma
        .$queryRawUnsafe<any[]>(
          `SELECT "type", "metric", "severity", "confidence", "payload", "updatedAt"
           FROM "PerformanceFinding"
           WHERE "companyId" = $1
           ORDER BY "updatedAt" DESC
           LIMIT 50`,
          companyId
        )
        .catch(() => []),
      Promise.resolve([]),
    ]);
    const constructionOperations = moduleProfile.hasConstructionNativeModules
      ? buildConstructionBriefingFacts(companyId)
      : null;

    const monthlyFinancials = sortByDate(dfsMonthly ? dfsMonthly.rows : monthlyFinancialsRaw);
    const completeMonthlyFinancials = monthlyFinancials.filter(isCompleteMonthlyPeriod);
    const latestFinancial = last(completeMonthlyFinancials) || last(monthlyFinancials);
    const dailyFinancialsWithMappedIncome = applyMappedIncomeTotalsToDailyRows(dailyFinancials, dailyFinancialMappedLines);
    const sortedDailyFinancials = sortByDate(dailyFinancialsWithMappedIncome.filter((row: any) => !isWeekendZeroIncomeActivityRow(row)));
    const latestDailyFinancial = last(sortedDailyFinancials);
    const weeklyPair = period === 'weekly' ? completedIsoWeekPairUtc() : null;
    const preferDailySnapshots = period === 'daily' || period === 'weekly';
    const productSnapshotsPreferred = preferDailyFrequencyRows(productSnapshots as any[], preferDailySnapshots);
    const customerSnapshotsPreferred = preferDailyFrequencyRows(customerSnapshots as any[], preferDailySnapshots);
    const productSnapshotsForPeriod = weeklyPair
      ? [
          ...rowsInUtcDateRange(productSnapshotsPreferred, weeklyPair.current.start, weeklyPair.current.end),
          ...rowsInUtcDateRange(productSnapshotsPreferred, weeklyPair.prior.start, weeklyPair.prior.end),
        ]
      : productSnapshotsPreferred;
    const customerSnapshotsForPeriod = weeklyPair
      ? [
          ...rowsInUtcDateRange(customerSnapshotsPreferred, weeklyPair.current.start, weeklyPair.current.end),
          ...rowsInUtcDateRange(customerSnapshotsPreferred, weeklyPair.prior.start, weeklyPair.prior.end),
        ]
      : customerSnapshotsPreferred;
    const financialComparisons =
      period === 'daily' && effectiveDailyMode === 'ops-only'
        ? []
        : buildFinancialComparisonsForPeriod({
            period,
            sortedDailyFinancials,
            completeMonthlyFinancials,
          });
    const primaryFinancialComparison = financialComparisons[0] || null;
    const latestCashSnapshot = last(sortByDate(cashSnapshots));
    const latestArSnapshot = last(sortByDate(arSnapshots));
    const latestApSnapshot = last(sortByDate(apSnapshots));
    const opsAsOfDate =
      period === 'daily'
        ? latestSnapshotDateKey([
            ...productSnapshotsForPeriod,
            ...customerSnapshotsForPeriod,
            ...cashSnapshots,
            ...arSnapshots,
            ...apSnapshots,
          ]) || dailyCapability.latestDailyOpsDate || ''
        : '';
    const weeklyAsOfDate = weeklyPair ? weeklyPair.current.end.toISOString().slice(0, 10) : '';
    const asOfDate =
      (period === 'weekly'
        ? weeklyAsOfDate || latestDateKey(latestDailyFinancial?.snapshotDate, latestFinancial?.monthDate) || cacheDate
        : period === 'daily' && effectiveDailyMode === 'ops-only'
        ? opsAsOfDate || latestDateKey(latestFinancial?.monthDate) || cacheDate
        : latestDateKey(latestDailyFinancial?.snapshotDate, latestFinancial?.monthDate) || cacheDate) || cacheDate;

    const recentRevenue = asNumber(primaryFinancialComparison?.current?.revenue);
    const priorRevenue = asNumber(primaryFinancialComparison?.prior?.revenue);
    const recentGrossProfit = asNumber(primaryFinancialComparison?.current?.grossProfit);
    const priorGrossProfit = asNumber(primaryFinancialComparison?.prior?.grossProfit);
    const recentEbitda = asNumber(primaryFinancialComparison?.current?.ebitda);
    const priorEbitda = asNumber(primaryFinancialComparison?.prior?.ebitda);
    const latestRevenue = asNumber(latestFinancial?.revenue);
    const latestEbitdaMargin = pct(ebitda(latestFinancial), latestRevenue);
    const latestCash = asNumber(latestDailyFinancial?.cash || latestFinancial?.cash || latestCashSnapshot?.cashBalance);
    const latestLoc = asNumber(latestDailyFinancial?.loc || latestFinancial?.loc);
    const latestBalanceSheetAR = asNullableNumber(latestDailyFinancial?.ar ?? latestFinancial?.ar);
    const latestBalanceSheetAP = asNullableNumber(latestDailyFinancial?.ap ?? latestFinancial?.ap);
    const latestARAgingRaw = agingSummary(latestArSnapshot, 'totalAR');
    const latestAPAgingRaw = agingSummary(latestApSnapshot, 'totalAP');
    const latestARAging = isQuickBooksCompany && !agingTotalReconcilesToBalanceSheet(latestARAgingRaw, latestBalanceSheetAR)
      ? null
      : latestARAgingRaw;
    const latestAPAging = isQuickBooksCompany && !agingTotalReconcilesToBalanceSheet(latestAPAgingRaw, latestBalanceSheetAP)
      ? null
      : latestAPAgingRaw;

    const salesWindow =
      period === 'monthly' || period === 'quarterly' || period === 'annual'
        ? salesWindowFromCompleteMonths(period, completeMonthlyFinancials)
        : { current: null, prior: null };
    const useBooksSalesWindows = Boolean(salesWindow.current);
    let productAgg: any[] = [];
    let customerAgg: any[] = [];
    if (useBooksSalesWindows) {
      const [groupedProducts, groupedCustomers] = await Promise.all([
        moduleProfile.genericSnapshots.products
          ? loadSalesGroupByPeriod({
              table: 'productSalesSnapshot',
              nameField: 'itemName',
              companyId,
              currentRange: salesWindow.current!,
              priorRange: salesWindow.prior,
            })
          : Promise.resolve([]),
        moduleProfile.genericSnapshots.customers
          ? loadSalesGroupByPeriod({
              table: 'customerSalesSnapshot',
              nameField: 'customerName',
              companyId,
              currentRange: salesWindow.current!,
              priorRange: salesWindow.prior,
            })
          : Promise.resolve([]),
      ]);
      productAgg = groupedProducts.sort((a, b) => b.recentRevenue - a.recentRevenue);
      customerAgg = groupedCustomers.sort((a, b) => b.recentRevenue - a.recentRevenue);
    } else {
      productAgg = aggregateSales(productSnapshotsForPeriod, 'itemName').sort((a, b) => b.recentRevenue - a.recentRevenue);
      customerAgg = aggregateSales(customerSnapshotsForPeriod, 'customerName').sort((a, b) => b.recentRevenue - a.recentRevenue);
    }
    if (useBooksSalesWindows && recentRevenue > MATERIAL_AMOUNT) {
      const maxCustomerOrProductRevenue = recentRevenue * 1.05;
      productAgg = productAgg.filter((row) => row.recentRevenue <= maxCustomerOrProductRevenue);
      customerAgg = customerAgg.filter((row) => row.recentRevenue <= maxCustomerOrProductRevenue);
    }
    const totalRecentCustomerRevenue = customerAgg.reduce((sum, row) => sum + row.recentRevenue, 0);
    const topCustomers = customerAgg
      .filter((row) => row.recentRevenue > MATERIAL_AMOUNT || Math.abs(row.recentGrossProfit) > MATERIAL_AMOUNT)
      .slice(0, 5)
      .map((row) => ({
        ...row,
        revenueShare: pct(row.recentRevenue, totalRecentCustomerRevenue),
        booksRevenueShare: pct(row.recentRevenue, recentRevenue),
      }));
    const top3Revenue = topCustomers.slice(0, 3).reduce((sum, row) => sum + row.recentRevenue, 0);
    const top3Share = pct(top3Revenue, totalRecentCustomerRevenue);
    const top3ShareOfBooks = pct(top3Revenue, recentRevenue);
    const topMarginWatch = productAgg
      .filter((row) => row.recentRevenue > MATERIAL_AMOUNT)
      .slice(0, 15)
      .filter((row) => {
        const materialGrossProfitMove = Math.abs(row.grossProfitDelta) > MATERIAL_AMOUNT;
        const materialMarginMove = Math.abs(row.marginPctDelta ?? 0) >= MATERIAL_PCT;
        const revenueUpProfitDown = row.revenueDelta > MATERIAL_AMOUNT && row.grossProfitDelta < -MATERIAL_AMOUNT;
        return materialGrossProfitMove || materialMarginMove || revenueUpProfitDown;
      })
      .sort((a, b) => Math.abs(b.grossProfitDelta) - Math.abs(a.grossProfitDelta))
      .slice(0, 6)
      .map((row) => ({ ...row, likelyDriver: likelyMarginDriver(row) }));
    const rawGoalText = JSON.stringify({
      expense: expenseGoals[0]?.goals || {},
      operational: operationalGoals[0]?.goals || {},
    }).toLowerCase();
    const rawFindingText = JSON.stringify(findings || []).toLowerCase();
    const allowMarketingLanguage =
      /marketing|campaign|paid search|ad spend|advertising|customer acquisition|cost per acquisition|channel roi|social media|email campaign/.test(
        `${rawGoalText} ${rawFindingText}`
      );

    const covenantWatchlist = (loans as any[])
      .flatMap((loan: any) =>
        (loan.covenants || [])
          .filter((covenant: any) => covenant.isApplicable !== false)
          .map((covenant: any) => {
            const threshold = asNumber(covenant.threshold);
            const current = asNumber(covenant.currentValue);
            let bufferPct: number | null = null;
            if (threshold) {
              if (String(covenant.covenantType) === 'MAXIMUM') bufferPct = (threshold - current) / Math.abs(threshold);
              if (String(covenant.covenantType) === 'MINIMUM') bufferPct = (current - threshold) / Math.abs(threshold);
            }
            return { loanName: loan.loanName, lenderName: loan.lenderName, name: covenant.covenantName, type: String(covenant.covenantType || ''), status: String(covenant.status || ''), threshold, current, bufferPct, updatedAt: covenant.updatedAt };
          })
      )
      .filter((row: any) => row.current || row.threshold || row.status === 'WARNING' || row.status === 'BREACHED')
      .sort((a: any, b: any) => (a.bufferPct ?? 999) - (b.bufferPct ?? 999))
      .slice(0, 6);

    const grossMarginBenchmark = findBenchmark(benchmarks, [/gross\s*margin/i]);
    const ebitdaBenchmark = findBenchmark(benchmarks, [/ebitda/i, /operating\s*margin/i]);
    const dsoBenchmark = findBenchmark(benchmarks, [/dso/i, /days\s*sales/i]);
    const latestGrossMarginPct = pct(asNumber(latestFinancial?.revenue) - asNumber(latestFinancial?.cogsTotal), asNumber(latestFinancial?.revenue));
    const benchmarkComparisons = [
      grossMarginBenchmark && latestGrossMarginPct != null ? { metric: grossMarginBenchmark.metricName, actual: latestGrossMarginPct, benchmark: asNumber(grossMarginBenchmark.fiveYearValue), variance: latestGrossMarginPct - asNumber(grossMarginBenchmark.fiveYearValue) } : null,
      ebitdaBenchmark && latestEbitdaMargin != null ? { metric: ebitdaBenchmark.metricName, actual: latestEbitdaMargin, benchmark: asNumber(ebitdaBenchmark.fiveYearValue), variance: latestEbitdaMargin - asNumber(ebitdaBenchmark.fiveYearValue) } : null,
      dsoBenchmark && latestArSnapshot ? { metric: dsoBenchmark.metricName, actual: asNumber((latestArSnapshot as any).dso), benchmark: asNumber(dsoBenchmark.fiveYearValue), variance: asNumber((latestArSnapshot as any).dso) - asNumber(dsoBenchmark.fiveYearValue) } : null,
    ].filter(Boolean);
    const briefingPulseAlerts = (pulseAlerts || []).filter((alert: any) => !isStoredArApAlert(alert));
    const includeOperatingDetailInBriefing = period !== 'daily';
    const dailyOpsCurrentDate =
      period === 'daily'
        ? dateKey(latestDailyFinancial?.snapshotDate) ||
          opsAsOfDate ||
          dateKey(primaryFinancialComparison?.currentPeriod) ||
          asOfDate
        : '';
    const dailyOpsPriorDate =
      period === 'daily'
        ? dateKey(sortedDailyFinancials.slice(-2, -1)[0]?.snapshotDate) ||
          priorSnapshotDateKey(
            [...productSnapshotsForPeriod, ...customerSnapshotsForPeriod],
            dailyOpsCurrentDate
          ) ||
          (typeof primaryFinancialComparison?.priorPeriod === 'string' &&
          !String(primaryFinancialComparison.priorPeriod).includes(' to ')
            ? String(primaryFinancialComparison.priorPeriod)
            : '')
        : '';
    const dailyOperations =
      period === 'daily'
        ? buildDailyOperationsFacts({
            sectorKey: moduleProfile.sectorKey,
            currentDate: dailyOpsCurrentDate,
            priorDate: dailyOpsPriorDate || null,
            dayRevenue: recentRevenue,
            productRows: productSnapshotsForPeriod,
            customerRows: customerSnapshotsForPeriod,
            includeProducts: moduleProfile.genericSnapshots.products,
            includeCustomers: moduleProfile.genericSnapshots.customers,
          })
        : null;

    facts = {
      company: { name: company?.name || 'Company', industryGroupId, industryName: benchmarks[0]?.industryName || null, industrySectorCategory: sectorCategory },
      briefing: {
        period,
        periodLabel: periodDisplayName(period),
        asOfDate,
        dailyMode: effectiveDailyMode,
        booksCadence:
          effectiveDailyMode === 'ops-only' || (dailyCapability.isQuickBooksOnline && effectiveDailyMode !== 'full')
            ? 'monthly'
            : effectiveDailyMode === 'full'
              ? 'daily'
              : period === 'daily' || period === 'weekly'
                ? 'daily'
                : 'monthly',
        hasComparableFinancialWindow: financialComparisons.length > 0,
        dailyOpsFeeds: dailyCapability.dailyOpsFeeds,
        dailyApiSources: dailyCapability.dailyApiSources.map((source) => source.sourceCode),
      },
      operationalModules: {
        sectorCategory: moduleProfile.sectorCategory,
        sectorKey: moduleProfile.sectorKey,
        enabledModules: moduleProfile.moduleKeys,
        enabledModuleLabels: moduleProfile.moduleLabels,
        genericSnapshotsLoaded: moduleProfile.genericSnapshots,
        promptRules: moduleProfile.promptRules,
      },
      financials: {
        monthsLoaded: monthlyFinancials.length,
        completeMonthsLoaded: completeMonthlyFinancials.length,
        comparisons: financialComparisons,
        windowNote: trailingWindowNote(period),
        revenueTrend: primaryFinancialComparison ? (recentRevenue >= priorRevenue ? 'increasing' : 'declining') : null,
        recentRevenue,
        priorRevenue,
        revenueDelta: recentRevenue - priorRevenue,
        revenueDeltaPct: pct(recentRevenue - priorRevenue, priorRevenue),
        recentGrossProfit,
        priorGrossProfit,
        grossProfitDelta: recentGrossProfit - priorGrossProfit,
        grossProfitDeltaPct: pct(recentGrossProfit - priorGrossProfit, priorGrossProfit),
        grossMarginPct: pct(recentGrossProfit, recentRevenue),
        priorGrossMarginPct: pct(priorGrossProfit, priorRevenue),
        grossMarginDeltaPct: pct(recentGrossProfit, recentRevenue) != null && pct(priorGrossProfit, priorRevenue) != null ? (pct(recentGrossProfit, recentRevenue) || 0) - (pct(priorGrossProfit, priorRevenue) || 0) : null,
        ebitdaMargin: pct(recentEbitda, recentRevenue),
        priorEbitdaMargin: pct(priorEbitda, priorRevenue),
        ebitdaDelta: recentEbitda - priorEbitda,
        latestCash,
        latestLoc,
        balanceSheetAR: latestBalanceSheetAR,
        balanceSheetAP: latestBalanceSheetAP,
        arAging: latestARAging,
        apAging: latestAPAging,
        materiality: {
          revenueMoveIsMaterial: isMaterialPct(pct(recentRevenue - priorRevenue, priorRevenue)),
          grossProfitMoveIsMaterial: isMaterialAmount(recentGrossProfit - priorGrossProfit, priorGrossProfit),
          grossMarginMoveIsMaterial: isMaterialPct(
            pct(recentGrossProfit, recentRevenue) != null && pct(priorGrossProfit, priorRevenue) != null
              ? (pct(recentGrossProfit, recentRevenue) || 0) - (pct(priorGrossProfit, priorRevenue) || 0)
              : null
          ),
          thresholds: {
            materialFinancialPct: MATERIAL_FINANCIAL_PCT,
            materialAmount: MATERIAL_AMOUNT,
          },
        },
      },
      workingCapital: {
        latestCash,
        balanceSheetAR: latestBalanceSheetAR,
        balanceSheetAP: latestBalanceSheetAP,
        arAging: latestARAging,
        apAging: latestAPAging,
        inventoryDataAvailable: moduleProfile.genericSnapshots.inventory && inventorySnapshots.length > 0,
      },
      covenants: { activeLoans: (loans as any[]).length, watchlist: covenantWatchlist },
      customers: includeOperatingDetailInBriefing && moduleProfile.genericSnapshots.customers
        ? {
            currentPeriod: primaryFinancialComparison?.currentPeriod || null,
            priorPeriod: primaryFinancialComparison?.priorPeriod || null,
            windowNote: trailingWindowNote(period),
            alignedToBooksWindow: useBooksSalesWindows,
            booksRevenue: recentRevenue,
            totalRecentRevenue: totalRecentCustomerRevenue,
            top3Share,
            top3ShareOfBooks,
            topCustomers,
          }
        : null,
      products: includeOperatingDetailInBriefing && moduleProfile.genericSnapshots.products
        ? {
            currentPeriod: primaryFinancialComparison?.currentPeriod || null,
            priorPeriod: primaryFinancialComparison?.priorPeriod || null,
            windowNote: trailingWindowNote(period),
            topMarginWatch,
          }
        : null,
      dailyOperations,
      constructionOperations,
      benchmarks: {
        loaded: includeOperatingDetailInBriefing ? benchmarks.length : 0,
        comparisons: includeOperatingDetailInBriefing ? benchmarkComparisons : [],
        sample: includeOperatingDetailInBriefing ? benchmarks.slice(0, 25) : [],
      },
      goals: { expense: expenseGoals[0]?.goals || {}, operational: operationalGoals[0]?.goals || {} },
      unsupportedTopicRules: {
        marketingChannelsAllowed: allowMarketingLanguage,
        allowedOperationalTopics: moduleProfile.promptRules.allowedOperationalTopics,
        blockedOperationalTopics: moduleProfile.promptRules.blockedOperationalTopics,
        sectorRule: moduleProfile.promptRules.sectorGuidance,
        marketingRule:
          'Do not mention Marketing, paid search, referrals, email campaigns, events, social media, channel return, customer acquisition cost, lifetime value, cost per acquisition, pilot budgets, campaigns, or advertising unless marketingChannelsAllowed is true and the exact supporting data is present in the facts.',
      },
      siteTrackedIssues: { pulseAlerts: briefingPulseAlerts.slice(0, 20), performanceFindings: (findings || []).slice(0, 50) },
      dataCoverage: {
        financialStatementsAvailable: monthlyFinancials.length > 0 || dailyFinancials.length > 0,
        cashDataAvailable: cashSnapshots.length > 0,
        arAgingAvailable: arSnapshots.length > 0,
        apAgingAvailable: apSnapshots.length > 0,
        customerSalesAvailable: includeOperatingDetailInBriefing && moduleProfile.genericSnapshots.customers && customerAgg.length > 0,
        productServiceSalesAvailable: includeOperatingDetailInBriefing && moduleProfile.genericSnapshots.products && productAgg.length > 0,
        dailyOperationsAvailable: Boolean(dailyOperations),
        dailyOperationsNotableCount: dailyOperations?.notableExceptions?.length || 0,
        inventoryDataAvailable: moduleProfile.genericSnapshots.inventory && inventorySnapshots.length > 0,
        constructionOperationsAvailable: Boolean(constructionOperations),
        benchmarkDataAvailable: benchmarks.length > 0,
        dailyMode: effectiveDailyMode,
      },
      alerts: briefingPulseAlerts.slice(0, 12),
      findings: (findings || []).slice(0, 20),
    };

    sourceNotes = [
      effectiveDailyMode === 'ops-only'
        ? 'Daily mode: operations (books remain monthly from QuickBooks / accounting master)'
        : '',
      effectiveDailyMode === 'ops-only' && dailyCapability.dailyOpsFeeds.length
        ? `Daily operational feeds: ${dailyCapability.dailyOpsFeeds.join(', ')}`
        : '',
      effectiveDailyMode === 'ops-only' && dailyCapability.dailyApiSources.length
        ? `Daily API sources: ${dailyCapability.dailyApiSources.map((s) => s.sourceCode).join(', ')}`
        : '',
      sourceNote('Financial statement data', monthlyFinancials.length + dailyFinancials.length),
      sourceNote('Cash data', cashSnapshots.length),
      sourceNote('Accounts receivable aging data', arSnapshots.length),
      sourceNote('Accounts payable aging data', apSnapshots.length),
      includeOperatingDetailInBriefing && moduleProfile.genericSnapshots.customers
        ? sourceNote('Customer sales data', useBooksSalesWindows ? customerAgg.length : customerSnapshotsForPeriod.length)
        : '',
      includeOperatingDetailInBriefing && moduleProfile.genericSnapshots.products
        ? sourceNote('Product/service sales data', useBooksSalesWindows ? productAgg.length : productSnapshotsForPeriod.length)
        : '',
      dailyOperations ? sourceNote('Same-day operational sales data', dailyOperations.notableExceptions.length || 1) : '',
      moduleProfile.genericSnapshots.inventory ? sourceNote('Inventory data', inventorySnapshots.length) : '',
      constructionOperations ? sourceNote('Construction job cost control data', constructionOperations.jobCostControl?.summary?.jobCount || 1) : '',
      constructionOperations ? sourceNote('Construction project portfolio data', constructionOperations.projectPortfolio?.summary?.jobCount || 1) : '',
      constructionOperations ? sourceNote('Construction commitments and forecast data', constructionOperations.commitmentsForecast?.summary?.jobCount || 1) : '',
      constructionOperations ? sourceNote('Construction billing and cash data', constructionOperations.billingCash?.summary?.jobCount || 1) : '',
      sourceNote('Industry benchmark data', benchmarks.length),
      sourceNote('Covenant data', covenantWatchlist.length),
    ].filter(Boolean);
    await writeDailySummary(companyId, persistedCacheDate, dataVersion, facts, sourceNotes).catch((summaryError) => {
      console.warn('Pulse daily summary cache write failed:', summaryError);
    });
    }

    if (facts && typeof facts === 'object') {
      const companyCurrency = await getCompanyCurrencySettings(companyId);
      const presentedFacts = await applyReportingCurrencyIfNeeded(facts as Record<string, unknown>, {
        companyCurrency,
        requestedCurrency: briefingMoneyCurrency,
      });
      const { fx: _fx, ...factsWithoutMeta } = presentedFacts;
      facts = factsWithoutMeta;
    }

    const responseAsOfDate = String(facts?.briefing?.asOfDate || cacheDate);

    if (shouldUseGeneSolutionsMockBriefing) {
      const response = buildMockExecBriefingResponse(facts, sourceNotes, period, responseAsOfDate);
      dailyBriefingCache.set(`${cacheKey}:latest`, response);
      dailyBriefingCache.set(versionedCacheKey, response);
      await writeBriefingCache(companyId, persistedCacheDate, dataVersion, response).catch((cacheError) => {
        console.warn('Pulse mock exec briefing cache write failed:', cacheError);
      });
      return NextResponse.json(response, { headers: PRIVATE_DAILY_CACHE_HEADERS });
    }

    if (getAiTransport() === 'unconfigured') {
      return NextResponse.json(
        { error: 'AI is not configured for executive briefing generation' },
        { status: 503 }
      );
    }

    const model = process.env.OPENAI_MODEL_EXEC_BRIEFING || process.env.OPENAI_MODEL_ASK || process.env.OPENAI_MODEL || 'gpt-4o';
    const prompt = `Create a ${periodDisplayName(period)} Exec Briefing for ${facts.company.name}.

Write like a practical CFO/operator briefing the leadership team. Use concise bullet narrative, not technical jargon. Be forward-looking and action-oriented.

Use plain language. Avoid consultant, investor, or SaaS jargon such as "logos", "motion", "levers", "runway" without explanation, "unlock", "optimize", "right-size", "deep dive", or "synergy". Say "customers", "new customers", "cash remaining", "actions", "reduce", "increase", or "analyze" instead.

Write every currency value in the company's display currency (${briefingMoneyCurrency}) with commas (for example ${formatMoney(1234567)}). Never abbreviate currency as K, M, MM, million, or thousand.

Use only the facts below. Never invent facts, channels, activity, owners, budgets, customer behavior, causes, or recommendations. If the company does not use, track, or report a topic, do not mention that topic. Do not include "no data" bullets. Only mention a data gap when the site has an active alert/finding saying the data gap itself is a leadership issue.

Do not describe internal record counts or database rows to leadership. Do not say things like "1,200 inventory rows." Say "inventory data" or mention a specific inventory metric only when the actual metric is provided and material.

Do not invent go-to-market, sales, or marketing activity. Do not mention Marketing, paid search, referrals, email campaigns, events, social media, channel return, customer acquisition cost, lifetime value, cost per acquisition, pilot budgets, campaigns, ad spend, or advertising unless those exact data elements are present in the facts and unsupportedTopicRules.marketingChannelsAllowed is true.

This is an exception-based leadership briefing. Only include analysis if it matters. Do not report normal, expected, immaterial, or stable trends just because data exists. Do not mention revenue, gross profit, margin, customers, products, covenants, accounts, or risks where the measured movement/exposure is zero, immaterial, normal, or not decision-useful.

Do not turn a normal or favorable metric into commentary. For example, do not mention low accounts receivable or no overdue balances unless there is a material related issue in cash, revenue, collections, or a Pulse alert. Do not infer future cash inflow from the accounts receivable balance alone.

Analyze the full company picture using only the sector-appropriate operating modules listed in facts.operationalModules. ${
      effectiveDailyMode === 'ops-only'
        ? 'For this ops-only Daily briefing, prioritize same-day operational exceptions, Pulse alerts, and daily liquidity/AR/AP when those feeds exist. Do not force a full P&L narrative from monthly books.'
        : 'Always include financial performance, gross profit dollars, margin rate, liquidity, working capital, AR, AP, LOC/debt, covenants, benchmarks, Pulse alerts, performance findings, goals/watchlists, and data coverage when material.'
    } Only mention inventory, customer sales, product/service sales, job cost control, project portfolio, commitments/forecast, billing/cash by job, or other operating topics when those topics are included in facts.operationalModules.promptRules.allowedOperationalTopics and supported by facts. For the Daily tab, operational sales commentary must come from facts.dailyOperations (same-day windows only), not from multi-day customers/products aggregates.

Sector operating guidance: ${facts.operationalModules.promptRules.sectorGuidance}

Blocked operating topics for this company: ${facts.operationalModules.promptRules.blockedOperationalTopics.join(', ') || 'none'}.

For total accounts receivable and total accounts payable balances, use financials.balanceSheetAR and financials.balanceSheetAP. Do not use financials.arAging.total, financials.apAging.total, workingCapital.arAging.total, or workingCapital.apAging.total as the company's total balance sheet AR/AP if those differ; aging snapshots are only for aging mix, overdue percentages, and days sales outstanding.

Only compare like-for-like periods. Do not compare days to weeks, weeks to months, or a partial current month to completed months. This is a ${periodDisplayName(period).toLowerCase()} briefing; use only the comparison windows in facts.financials.comparisons. ${
      effectiveDailyMode === 'ops-only'
        ? `IMPORTANT: facts.briefing.dailyMode is ops-only. Books/accounting are monthly (QuickBooks or equivalent). Do NOT invent day-over-day P&L, revenue, gross profit, EBITDA, or MTD financial statement movement. facts.financials.comparisons is empty by design. Lead with facts.dailyOperations (same-day sales/customer/SKU/volume), Pulse alerts, and liquidity/AR/AP only when those daily feeds are present. You may mention the latest closed month from books as static context only—never as a day-over-day financial trend.`
        : `For the Daily tab, discuss material latest-day vs prior-day movement and current month-to-date vs the same elapsed days last month when available; never fall back to month-over-month analysis in the Daily tab. For Daily comparisons, state the actual dates from currentPeriod and priorPeriod; do not say "yesterday", "today", or "latest day" as a substitute for dates.`
    } In the Daily tab, use facts.dailyOperations only for operational commentary, and only when notableExceptions are present or a listed top product/customer/volume move is material for that same asOfDate vs priorDate. Allowed Daily ops topics: top revenue product/SKU for the day, largest customer/order for the day, and day volume (sales closed / units sold / contracts) with day-over-day deltas when provided. Do not use multi-day customer concentration, multi-day product margin watchlists, or benchmarks in the Daily tab. For the Weekly tab, use only the latest completed Monday–Sunday week versus the prior completed week from facts.financials.comparisons; never fall back to day-over-day or month-over-month analysis, and do not use a partial current week. For the Quarterly tab, write income-statement movement like: For the trailing 3 months ended July 31, 2026, revenue increased $72,357 (5.2%) from the previous 3 months. Use currentPeriod as that trailing window and priorPeriod as "the previous 3 months." Use the same sentence pattern for customer revenue, margin, and EBITDA. Do not list both date ranges or say only "this quarter." For the Annual tab, write income-statement movement like: For the trailing 12 months ended July 31, 2026, revenue increased $1,240,000 (9.1%) from the previous 12 months. Use currentPeriod as that trailing window and priorPeriod as "the previous 12 months." Use the same sentence pattern for customer revenue, margin, and EBITDA. Do not list both date ranges or say only "this year." For the Monthly tab, write income-statement movement like: In July 2026, revenue increased $22,100 (4.1%) from June 2026. Do not say trailing. Use the same pattern for customer revenue, margin, and EBITDA. Use completed months only. Customer and product dollars, deltas versus prior, and concentration MUST come from facts.customers / facts.products for the SAME currentPeriod/priorPeriod as facts.financials.comparisons. When stating a customer's share of total revenue, use booksRevenueShare and top3ShareOfBooks (customer dollars divided by financials.recentRevenue). Customer and product recentRevenue values are month-collapsed books-window totals, not a sum of every daily snapshot. For Quarterly, say "the trailing 3 months ended [last day] ... from the previous 3 months." For Annual, say "the trailing 12 months ended [last day] ... from the previous 12 months." For Monthly, say "In [Month Year] ... from [prior Month Year]" and do not say trailing. If a Daily or Weekly window overlaps, revenueDelta is only the unique days. Do not call revenueShare "share of total revenue"—that is only the mix of identified customer-sales rows. Never mix a P&L total from one window with customer dollars from another window. If a customer dollar amount is larger than financials.recentRevenue, omit that customer dollar movement; it is not usable. State the window used when a financial or daily-ops movement is material. If no comparable window supports an issue, do not draw a trend conclusion.

When revenue and margin rate move in different directions, explicitly state the end result to gross profit dollars only if the movement is material or decision-useful. Example: if revenue is declining but gross margin rate is improving, say whether gross profit dollars increased or decreased and by how much; if both are normal/immaterial, omit the topic entirely.

For product/service margin, do the diagnosis yourself only when product/service sales is an allowed and populated module for this company. Only report top-seller margin analysis if there is a measurable issue. Do not tell leadership to "check pricing, discounting, unit cost, and customer mix." Instead, use average price change, unit-cost change, revenue change, margin-rate change, and gross-profit dollar change to say which driver is most likely and what measurable action follows.

Recommendations must be specific and measurable. Include the actual metric, customer/product/covenant/account name, dollar amount, percentage, threshold, time window, or target from the facts whenever available. Do not write generic recommendations like "review covenant headroom", "pull margin detail", "assign owners", "monitor closely", "review performance", "improve margins", or "watch cash" unless the same bullet discusses the underlying values driving the issue and the measurable next action.

Choose 3-8 separate titled sections (not one mega-section). Always start with "Top Takeaway", then add distinct topic sections such as "Cash and Liquidity", "Revenue and Customer Concentration", "Gross Margin", "EBITDA and Expense Control", or other material themes supported by the facts. Do not put every issue only under Top Takeaway—split material topics into their own sections with 2-5 bullets each, including specific measurable Actions. Include a topic only when it is material, abnormal, worsening, tied to a Pulse alert/performance finding/goal/benchmark gap, or directly decision-useful. If there are truly no material exceptions, return one short section titled "No Material Exceptions".

Return JSON only in this shape (example shows multiple sections—follow that pattern whenever more than one topic is material):
{
  "sections": [
    { "title": "Top Takeaway", "bullets": ["...", "..."] },
    { "title": "Cash and Liquidity", "bullets": ["...", "Actions: ..."] },
    { "title": "Revenue and Customer Concentration", "bullets": ["...", "Actions: ..."] }
  ]
}

Facts:
${JSON.stringify(facts, null, 2)}`;

    const ai = await createModelText({
      openai: getOpenAiClient(),
      model,
      temperature: 0.2,
      maxTokens: 4500,
      messages: [
        {
          role: 'system',
          content:
            'You produce concise executive operating briefings from financial and operational data. Identify the highest-priority issues yourself. Always evaluate gross profit dollars, not just revenue or margin rate. Recommendations must be specific, measurable, and tied to observed facts. Use bullets. Keep language plain and board-ready. Return multiple titled sections whenever more than one material topic exists—never collapse an entire briefing into a single Top Takeaway section.',
        },
        { role: 'user', content: prompt },
      ],
    });
    const parsedBriefing = safeJsonParse(ai.text);
    let sections = normalizeSections(parsedBriefing, {
      allowMarketingLanguage: Boolean(facts?.unsupportedTopicRules?.marketingChannelsAllowed),
    });

    const isCollapsedTopTakeawayOnly =
      sections.length === 1 &&
      /^top takeaway$/i.test(sections[0].title) &&
      sections[0].bullets.length >= 3;

    if (!sections.length || isCollapsedTopTakeawayOnly) {
      console.warn('Pulse exec briefing AI response needs multi-section formatter', {
        companyId,
        model,
        api: ai.api,
        finishReason: ai.finishReason,
        sectionCount: sections.length,
        collapsedTopTakeaway: isCollapsedTopTakeawayOnly,
        responsePreview: ai.text.slice(0, 500),
      });

      const retry = await createModelText({
        openai: getOpenAiClient(),
        model,
        temperature: 0,
        maxTokens: 4000,
        messages: [
          {
            role: 'system',
            content:
              'You convert an executive briefing draft into strict JSON with multiple titled sections. Return only valid JSON. Prefer 3-8 sections. Never collapse material cash, revenue, margin, EBITDA, concentration, or covenant issues into a single Top Takeaway section.',
          },
          {
            role: 'user',
            content: `Rewrite this briefing into JSON with this shape:
{"sections":[{"title":"Top Takeaway","bullets":["..."]},{"title":"Cash and Liquidity","bullets":["...","Actions: ..."]},{"title":"Revenue and Customer Concentration","bullets":["...","Actions: ..."]}]}

Rules:
- Keep every material fact and dollar/percent figure from the draft.
- Use 3-8 sections whenever the draft covers more than one topic.
- Top Takeaway is a short synthesis only (2-4 bullets). Put detail and Actions in topic sections.
- Each section needs a title and 1-6 bullet strings.
- If the draft is empty or unusable, return {"sections":[{"title":"No Material Exceptions","bullets":["No material exceptions were identified in the available financial and sector operating data for today."]}]}.

Draft:
${ai.text.slice(0, 12000)}`,
          },
        ],
      });

      sections = normalizeSections(safeJsonParse(retry.text), {
        allowMarketingLanguage: Boolean(facts?.unsupportedTopicRules?.marketingChannelsAllowed),
      });

      if (!sections.length) {
        sections = [
          {
            title: 'No Material Exceptions',
            bullets: ['No material exceptions were identified in the available financial and sector operating data for today.'],
          },
        ];
      }
    }

    const response = {
      generatedAt: new Date().toISOString(),
      period,
      asOfDate: responseAsOfDate,
      model,
      aiGenerated: true,
      dailyMode: period === 'daily' ? effectiveDailyMode : undefined,
      sections,
      sourceNotes,
      currency: {
        baseCurrency: String(company?.baseCurrency || DEFAULT_BASE_CURRENCY).toUpperCase(),
        reportingCurrency: company?.reportingCurrency
          ? String(company.reportingCurrency).toUpperCase()
          : null,
        displayCurrency: briefingMoneyCurrency,
      },
    } satisfies BriefingResponse;
    dailyBriefingCache.set(`${cacheKey}:latest`, response);
    dailyBriefingCache.set(versionedCacheKey, response);
    await writeBriefingCache(companyId, persistedCacheDate, dataVersion, response).catch((cacheError) => {
      console.warn('Pulse exec briefing cache write failed:', cacheError);
    });
    return NextResponse.json(response, { headers: PRIVATE_DAILY_CACHE_HEADERS });
  } catch (error: any) {
    console.error('Pulse exec briefing error:', error);
    return NextResponse.json({ error: 'Failed to generate executive briefing', details: String(error?.message || error) }, { status: 500 });
  }
}
