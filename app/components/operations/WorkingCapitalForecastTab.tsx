'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useCompanyMoneyFormatter } from '@/app/hooks/useCompanyMoneyFormatter';

type ForecastInputs = {
  inventoryTurns: number;
  minCashBuffer: number;
  locLimit: number;
  locAprPct: number;
  creditSalesPct: number;
  historicalSalesLookbackWeeks: number;
  historicalSalesCollectionLagWeeks: number;
  arCurrentCollectPct: number;
  ar30To60CollectPct: number;
  ar60To90CollectPct: number;
  ar90PlusCollectPct: number;
  arWeek1WeightPct: number;
  arWeek2WeightPct: number;
  arWeek3WeightPct: number;
  arWeek4WeightPct: number;
  apCurrentPayPct: number;
  ap30To60PayPct: number;
  ap60To90PayPct: number;
  ap90PlusPayPct: number;
  apWeek1WeightPct: number;
  apWeek2WeightPct: number;
  apWeek3WeightPct: number;
  apWeek4WeightPct: number;
};

type WeeklyDriver = {
  sales: number;
  opex: number;
  grossMarginPct: number;
};

type OpexPaymentTreatment = 'paid-in-full' | 'ap-schedule';

type ExpenseTimingRule = 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly' | 'monthly-eom';

type ScheduledExpenseRule = {
  key: string;
  label: string;
  monthlyAmount: number;
  timing: ExpenseTimingRule;
  weekday: number; // 0=Sun ... 6=Sat (used for biweekly)
  dayOfMonth: number; // 1..28 (used for monthly)
};

type HistoricalFlowProfile = {
  arRunoffRate: number;
  apRunoffRate: number;
  inventoryToSalesRatio: number;
};

type AgingBuckets = {
  current: number;
  bucket30to60: number;
  bucket60to90: number;
  bucket90plus: number;
};

type MonthlyBaseRef = {
  year: number;
  month: number; // 0-based
};
type StartingBalances = { cash: number; ar: number; ap: number; inventory: number; loc: number };

type ForecastRow = {
  week: number;
  beginningCash: number;
  sales: number;
  receipts: number;
  cogs: number;
  targetInventory: number;
  purchases: number;
  apPayments: number;
  opex: number;
  cashOpex: number;
  locInterest: number;
  locDraw: number;
  locRepay: number;
  unleveredEndingCash: number;
  endingCash: number;
  endingLoc: number;
  endingAr: number;
  endingAp: number;
  endingInventory: number;
};

const ACCRUAL_OPEX_LINE_ITEMS: Array<{ key: string; label: string }> = [
  { key: 'autoTravel', label: 'Auto Travel' },
  { key: 'benefits', label: 'Benefits' },
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'interestExpense', label: 'Interest Expense' },
  { key: 'mealsEntertainment', label: 'Meals Entertainment' },
  { key: 'otherExpense', label: 'Other Expense' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'phoneComm', label: 'Phone Comm' },
  { key: 'professionalFees', label: 'Professional Fees' },
  { key: 'rent', label: 'Rent' },
  { key: 'salesExpense', label: 'Sales Expense' },
  { key: 'subcontractors', label: 'Subcontractors' },
  { key: 'taxLicense', label: 'Tax License' },
];
const DEFAULT_ACCRUAL_OPEX_PAYMENT_TREATMENT_BY_KEY: Record<string, OpexPaymentTreatment> = ACCRUAL_OPEX_LINE_ITEMS
  .reduce((acc, item) => {
    acc[item.key] = 'paid-in-full';
    return acc;
  }, {} as Record<string, OpexPaymentTreatment>);

const DEFAULT_INPUTS: ForecastInputs = {
  inventoryTurns: 8,
  minCashBuffer: 25000,
  locLimit: 150000,
  locAprPct: 9,
  creditSalesPct: 90,
  historicalSalesLookbackWeeks: 12,
  historicalSalesCollectionLagWeeks: 2,
  arCurrentCollectPct: 80,
  ar30To60CollectPct: 60,
  ar60To90CollectPct: 30,
  ar90PlusCollectPct: 10,
  arWeek1WeightPct: 35,
  arWeek2WeightPct: 30,
  arWeek3WeightPct: 20,
  arWeek4WeightPct: 15,
  apCurrentPayPct: 80,
  ap30To60PayPct: 60,
  ap60To90PayPct: 30,
  ap90PlusPayPct: 10,
  apWeek1WeightPct: 35,
  apWeek2WeightPct: 30,
  apWeek3WeightPct: 20,
  apWeek4WeightPct: 15,
};
const DEFAULT_WEEKLY_DRIVER: WeeklyDriver = {
  sales: 50000,
  opex: 18000,
  grossMarginPct: 35,
};
const EMPTY_INPUTS: ForecastInputs = {
  inventoryTurns: 0,
  minCashBuffer: 0,
  locLimit: 0,
  locAprPct: 0,
  creditSalesPct: 0,
  historicalSalesLookbackWeeks: 0,
  historicalSalesCollectionLagWeeks: 0,
  arCurrentCollectPct: 0,
  ar30To60CollectPct: 0,
  ar60To90CollectPct: 0,
  ar90PlusCollectPct: 0,
  arWeek1WeightPct: 0,
  arWeek2WeightPct: 0,
  arWeek3WeightPct: 0,
  arWeek4WeightPct: 0,
  apCurrentPayPct: 0,
  ap30To60PayPct: 0,
  ap60To90PayPct: 0,
  ap90PlusPayPct: 0,
  apWeek1WeightPct: 0,
  apWeek2WeightPct: 0,
  apWeek3WeightPct: 0,
  apWeek4WeightPct: 0,
};
const EMPTY_WEEKLY_DRIVER: WeeklyDriver = {
  sales: 0,
  opex: 0,
  grossMarginPct: 35,
};
const DEFAULT_SCHEDULED_EXPENSE_RULES: ScheduledExpenseRule[] = [
  { key: 'payroll', label: 'Payroll', monthlyAmount: 72000, timing: 'semi-monthly', weekday: 5, dayOfMonth: 1 },
  { key: 'rent', label: 'Rent', monthlyAmount: 25000, timing: 'monthly', weekday: 1, dayOfMonth: 1 },
  { key: 'taxes', label: 'Taxes', monthlyAmount: 18000, timing: 'semi-monthly', weekday: 1, dayOfMonth: 15 },
  { key: 'other-opex', label: 'Other Operating Expenses', monthlyAmount: 28000, timing: 'weekly', weekday: 1, dayOfMonth: 1 },
];
const FORECAST_WEEKS = 13;
const DEFAULT_STARTING_BALANCES: StartingBalances = { cash: 0, ar: 0, ap: 0, inventory: 0, loc: 0 };
const DEFAULT_FLOW_PROFILE: HistoricalFlowProfile = { arRunoffRate: 0.12, apRunoffRate: 0.12, inventoryToSalesRatio: 0.3 };
const DEFAULT_AGING_BUCKETS: AgingBuckets = { current: 0, bucket30to60: 0, bucket60to90: 0, bucket90plus: 0 };
const hasAnyPositiveValue = (values: Array<unknown>): boolean =>
  values.some((value) => Number.isFinite(Number(value)) && Number(value) > 0);

const clampNumber = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const formatPercentIdle = (value: number): string => {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
};
const sanitizePercentDraft = (rawValue: string): string => {
  const cleaned = String(rawValue || '').replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  return parts.length <= 1 ? parts[0] : `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
};
const parsePercentDraft = (rawValue: string): number | null => {
  const normalized = sanitizePercentDraft(rawValue);
  if (!normalized || normalized === '.') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
};
function PercentInput({
  value,
  onValueChange,
  min = 0,
  max = 100,
  style,
}: {
  value: number;
  onValueChange: (next: number) => void;
  min?: number;
  max?: number;
  style?: React.CSSProperties;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const wrapperStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    width: style?.width || '70%',
  };
  const fieldStyle: React.CSSProperties = { ...style, width: '100%' };
  return (
    <div style={wrapperStyle}>
      <input
        type="text"
        inputMode="decimal"
        value={draft !== null ? draft : formatPercentIdle(value)}
        onFocus={(event) => {
          setDraft(formatPercentIdle(value));
          requestAnimationFrame(() => event.currentTarget.select());
        }}
        onChange={(event) => {
          const nextDraft = sanitizePercentDraft(event.target.value);
          setDraft(nextDraft);
          const parsed = parsePercentDraft(nextDraft);
          if (parsed !== null) onValueChange(clampNumber(parsed, min, max));
        }}
        onBlur={() => {
          const parsed = parsePercentDraft(draft ?? '');
          if (parsed !== null) onValueChange(clampNumber(parsed, min, max));
          else if (draft === '' || draft === '.') onValueChange(min);
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        style={fieldStyle}
      />
      <span style={{ color: '#64748b', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>%</span>
    </div>
  );
}
const parseCurrencyInput = (rawValue: string): number => {
  const normalized = String(rawValue || '').replace(/[^0-9-]/g, '');
  if (!normalized || normalized === '-') return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const inputStyle: React.CSSProperties = {
  width: '70%',
  padding: '9px 10px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '13px',
  color: '#111827',
  background: '#fff',
};
const compactTableInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '6px 8px',
  fontSize: '12px',
};
const compactPercentInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: '6px 7px',
  fontSize: '11px',
};

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '14px',
};

interface WorkingCapitalForecastTabProps {
  selectedCompanyId: string;
  basisMode?: 'cash' | 'accrual';
  viewMode?: 'full' | 'inputs-only';
}

const toRoundedCurrency = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};
const toRoundedPercent = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : fallback;
};
const toRoundedInteger = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};
const toRoundedTurns = (value: unknown, fallback = 8): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : fallback;
};
const normalizeWeeklyDriver = (raw: any, fallback: WeeklyDriver): WeeklyDriver => ({
  sales: Math.max(0, toRoundedCurrency(raw?.sales, fallback.sales)),
  opex: Math.max(0, toRoundedCurrency(raw?.opex, fallback.opex)),
  grossMarginPct: clampNumber(toRoundedPercent(raw?.grossMarginPct, fallback.grossMarginPct), 1, 99),
});
const normalizeWeeklyDriverList = (raw: any, fallback: WeeklyDriver): WeeklyDriver[] => {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: FORECAST_WEEKS }, (_, idx) => normalizeWeeklyDriver(list[idx], fallback));
};
const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const getWeekendAnchorDate = (baseDate: Date): Date => {
  const anchor = new Date(baseDate);
  anchor.setHours(0, 0, 0, 0);
  const day = anchor.getDay(); // 0=Sun ... 6=Sat
  if (day === 6) return anchor; // Saturday
  if (day === 0) return addDays(anchor, -1); // Sunday -> prior Saturday
  return addDays(anchor, -(day + 1)); // Mon-Fri -> prior Saturday
};
const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate();
const normalizeMonthRefs = (rawMonthRefs: any, fallbackLength: number): MonthlyBaseRef[] => {
  if (Array.isArray(rawMonthRefs) && rawMonthRefs.length >= fallbackLength) {
    return rawMonthRefs.slice(0, fallbackLength).map((item: any, idx: number) => {
      const year = Number(item?.year);
      const month = Number(item?.month);
      if (Number.isFinite(year) && Number.isFinite(month)) {
        return { year, month };
      }
      const dt = new Date();
      dt.setMonth(dt.getMonth() + idx);
      return { year: dt.getFullYear(), month: dt.getMonth() };
    });
  }
  const today = new Date();
  return Array.from({ length: fallbackLength }, (_, idx) => {
    const dt = new Date(today.getFullYear(), today.getMonth() + idx, 1);
    return { year: dt.getFullYear(), month: dt.getMonth() };
  });
};
const resolveMonthIndexForDate = (date: Date, monthRefs: MonthlyBaseRef[]): number => {
  const y = date.getFullYear();
  const m = date.getMonth();
  const exactIdx = monthRefs.findIndex((ref) => ref.year === y && ref.month === m);
  if (exactIdx >= 0) return exactIdx;
  const dateKey = y * 12 + m;
  const firstKey = monthRefs[0].year * 12 + monthRefs[0].month;
  const lastRef = monthRefs[monthRefs.length - 1];
  const lastKey = lastRef.year * 12 + lastRef.month;
  if (dateKey < firstKey) return 0;
  if (dateKey > lastKey) return monthRefs.length - 1;
  return 0;
};
const allocateMonthlyAmountsToWeeks = (
  monthAmounts: number[],
  monthRefs: MonthlyBaseRef[],
  weekStarts: Date[],
  timing: 'calendar' | 'payroll-semi-monthly' = 'calendar',
): number[] => {
  const weekly = Array.from({ length: weekStarts.length }, () => 0);
  if (!Array.isArray(monthAmounts) || monthAmounts.length === 0 || !weekStarts.length) return weekly;
  const refs = normalizeMonthRefs(monthRefs, monthAmounts.length);
  const postEventToWeek = (eventDate: Date, amount: number) => {
    const event = startOfDay(eventDate).getTime();
    for (let i = 0; i < weekStarts.length; i += 1) {
      const weekStart = startOfDay(weekStarts[i]).getTime();
      const weekEnd = startOfDay(addDays(weekStarts[i], 6)).getTime();
      if (event >= weekStart && event <= weekEnd) {
        weekly[i] += Math.max(0, amount);
        return;
      }
    }
  };

  if (timing === 'payroll-semi-monthly') {
    refs.forEach((ref, idx) => {
      const monthlyAmount = Math.max(0, Number(monthAmounts[idx] || 0));
      if (monthlyAmount <= 0) return;
      postEventToWeek(new Date(ref.year, ref.month, 1), monthlyAmount / 2);
      postEventToWeek(new Date(ref.year, ref.month, 15), monthlyAmount / 2);
    });
    return weekly.map((value) => Math.max(0, Math.round(value)));
  }

  for (let idx = 0; idx < weekStarts.length; idx += 1) {
    const weekStart = weekStarts[idx];
    let total = 0;
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const dayDate = addDays(weekStart, dayOffset);
      const monthIdx = resolveMonthIndexForDate(dayDate, refs);
      const ref = refs[monthIdx];
      const dim = Math.max(1, daysInMonth(ref.year, ref.month));
      total += (Number(monthAmounts[monthIdx]) || 0) / dim;
    }
    weekly[idx] = Math.max(0, Math.round(total));
  }
  return weekly;
};
const buildWeekMonthLabels = (monthRefs: MonthlyBaseRef[]): string[] => {
  const refs = normalizeMonthRefs(monthRefs, 3);
  void refs;
  const anchor = getWeekendAnchorDate(new Date());
  return Array.from({ length: FORECAST_WEEKS }, (_, idx) => {
    const weekStart = addDays(anchor, idx * 7);
    const midWeekDate = addDays(weekStart, 3);
    const monthYear = new Date(midWeekDate.getFullYear(), midWeekDate.getMonth(), 1);
    const firstWeekStartForMonth = getWeekendAnchorDate(monthYear);
    const weekOfMonth =
      Math.floor((weekStart.getTime() - firstWeekStartForMonth.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    const monthName = midWeekDate.toLocaleDateString('en-US', { month: 'long' });
    return `Wk ${weekOfMonth} ${monthName}`;
  });
};
const safeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toOptionalRoundedCurrency = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
};
const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const dateKeyUtc = (date: Date): string => startOfUtcDay(date).toISOString().slice(0, 10);
const mostRecentFridayUtc = (reference: Date): Date => {
  const d = startOfUtcDay(reference);
  // 0=Sun ... 5=Fri ... 6=Sat
  const day = d.getUTCDay();
  const diff = (day - 5 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
};
const pickLatestRecordAtOrBeforeDay = (records: any[], dayUtc: Date): any | null => {
  const list = Array.isArray(records) ? records : [];
  if (list.length === 0) return null;
  const cutoff = startOfUtcDay(dayUtc).getTime();
  let best: any | null = null;
  let bestTs = Number.NEGATIVE_INFINITY;
  for (const row of list) {
    const raw = row?.snapshotDate;
    if (!raw) continue;
    const ts = startOfUtcDay(new Date(raw)).getTime();
    if (!Number.isFinite(ts) || ts > cutoff) continue;
    if (ts >= bestTs) {
      bestTs = ts;
      best = row;
    }
  }
  return best;
};
const pickLatestRecordDay = (records: any[]): Date | null => {
  const list = Array.isArray(records) ? records : [];
  let bestTs = Number.NEGATIVE_INFINITY;
  let bestDate: Date | null = null;
  for (const row of list) {
    const raw = row?.snapshotDate;
    if (!raw) continue;
    const ts = startOfUtcDay(new Date(raw)).getTime();
    if (!Number.isFinite(ts)) continue;
    if (ts >= bestTs) {
      bestTs = ts;
      bestDate = new Date(raw);
    }
  }
  return bestDate;
};

const toWeeklyWeights = (w1: number, w2: number, w3: number, w4: number): number[] => {
  const raw = [w1, w2, w3, w4].map((value) => Math.max(0, Number(value) || 0));
  const sum = raw.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return [0.25, 0.25, 0.25, 0.25];
  return raw.map((value) => value / sum);
};

const mapSnapshotToBuckets = (snapshot: any, totalFallback: number): AgingBuckets => {
  if (!snapshot || typeof snapshot !== 'object') {
    return { ...DEFAULT_AGING_BUCKETS, current: Math.max(0, totalFallback || 0) };
  }
  const current = Math.max(0, Number(snapshot.current || 0));
  const bucket30to60 = Math.max(0, Number(snapshot.days1to30 || 0));
  const bucket60to90 = Math.max(0, Number(snapshot.days31to60 || 0));
  const bucket90plus = Math.max(0, Number(snapshot.days61to90 || 0) + Number(snapshot.days90plus || 0));
  const mappedTotal = current + bucket30to60 + bucket60to90 + bucket90plus;
  if (mappedTotal > 0) {
    return { current, bucket30to60, bucket60to90, bucket90plus };
  }
  return { ...DEFAULT_AGING_BUCKETS, current: Math.max(0, totalFallback || 0) };
};
const reconcileAgingBucketsToTotal = (buckets: AgingBuckets, total: number): AgingBuckets => {
  const target = Math.max(0, Number(total) || 0);
  const current = Math.max(0, Number(buckets?.current) || 0);
  const bucket30to60 = Math.max(0, Number(buckets?.bucket30to60) || 0);
  const bucket60to90 = Math.max(0, Number(buckets?.bucket60to90) || 0);
  const bucket90plus = Math.max(0, Number(buckets?.bucket90plus) || 0);
  const mapped = current + bucket30to60 + bucket60to90 + bucket90plus;
  if (target <= 0) return { ...DEFAULT_AGING_BUCKETS };
  if (mapped <= 0) return { ...DEFAULT_AGING_BUCKETS, current: target };
  if (mapped > target) {
    const scale = target / mapped;
    return {
      current: current * scale,
      bucket30to60: bucket30to60 * scale,
      bucket60to90: bucket60to90 * scale,
      bucket90plus: bucket90plus * scale,
    };
  }
  return {
    current: current + (target - mapped),
    bucket30to60,
    bucket60to90,
    bucket90plus,
  };
};
const normalizeScheduledExpenseRule = (raw: any, fallback: ScheduledExpenseRule): ScheduledExpenseRule => {
  const allowed: ExpenseTimingRule[] = ['weekly', 'biweekly', 'semi-monthly', 'monthly', 'monthly-eom'];
  const timing = allowed.includes(raw?.timing) ? raw.timing : fallback.timing;
  return {
    key: String(raw?.key || fallback.key),
    label: String(raw?.label || fallback.label),
    monthlyAmount: Math.max(0, toRoundedCurrency(raw?.monthlyAmount, fallback.monthlyAmount)),
    timing,
    weekday: clampNumber(toRoundedInteger(raw?.weekday, fallback.weekday), 0, 6),
    dayOfMonth: clampNumber(toRoundedInteger(raw?.dayOfMonth, fallback.dayOfMonth), 1, 28),
  };
};
const normalizeScheduledExpenseRules = (raw: any): ScheduledExpenseRule[] => {
  const rows = Array.isArray(raw) ? raw : [];
  return DEFAULT_SCHEDULED_EXPENSE_RULES.map((fallback, idx) =>
    normalizeScheduledExpenseRule(rows[idx], fallback)
  );
};
const buildScheduledOpexByWeek = (
  weekStarts: Date[],
  rules: ScheduledExpenseRule[],
): number[] => {
  const scheduled = Array.from({ length: weekStarts.length }, () => 0);
  if (!weekStarts.length) return scheduled;
  const horizonStart = startOfDay(weekStarts[0]);
  const horizonEnd = startOfDay(addDays(weekStarts[weekStarts.length - 1], 6));
  const monthlySet = new Set<string>();
  for (let dt = new Date(horizonStart); dt <= horizonEnd; dt = addDays(dt, 1)) {
    monthlySet.add(`${dt.getFullYear()}-${dt.getMonth()}`);
  }
  const months = Array.from(monthlySet).map((key) => {
    const [year, month] = key.split('-').map((v) => Number(v));
    return { year, month };
  });

  const postEventToWeek = (eventDate: Date, amount: number) => {
    const event = startOfDay(eventDate).getTime();
    for (let i = 0; i < weekStarts.length; i += 1) {
      const weekStart = startOfDay(weekStarts[i]).getTime();
      const weekEnd = startOfDay(addDays(weekStarts[i], 6)).getTime();
      if (event >= weekStart && event <= weekEnd) {
        scheduled[i] += Math.max(0, amount);
        return;
      }
    }
  };

  rules.forEach((rule) => {
    const monthlyAmount = Math.max(0, Number(rule.monthlyAmount || 0));
    if (monthlyAmount <= 0) return;

    if (rule.timing === 'weekly') {
      const perWeek = (monthlyAmount * 12) / 52;
      for (let i = 0; i < weekStarts.length; i += 1) {
        const weekStart = weekStarts[i];
        const weekdayOffset = (Number(rule.weekday || 0) - weekStart.getDay() + 7) % 7;
        const eventDate = addDays(weekStart, weekdayOffset);
        postEventToWeek(eventDate, perWeek);
      }
      return;
    }

    if (rule.timing === 'biweekly') {
      const perPay = (monthlyAmount * 12) / 26;
      let firstPayDate = startOfDay(horizonStart);
      const firstOffset = (Number(rule.weekday || 0) - firstPayDate.getDay() + 7) % 7;
      firstPayDate = addDays(firstPayDate, firstOffset);
      for (let d = new Date(firstPayDate); d <= horizonEnd; d = addDays(d, 14)) {
        postEventToWeek(d, perPay);
      }
      return;
    }

    months.forEach(({ year, month }) => {
      if (rule.timing === 'semi-monthly') {
        postEventToWeek(new Date(year, month, 1), monthlyAmount / 2);
        postEventToWeek(new Date(year, month, 15), monthlyAmount / 2);
        return;
      }
      if (rule.timing === 'monthly') {
        postEventToWeek(new Date(year, month, rule.dayOfMonth), monthlyAmount);
        return;
      }
      if (rule.timing === 'monthly-eom') {
        postEventToWeek(new Date(year, month + 1, 0), monthlyAmount);
      }
    });
  });

  return scheduled.map((value) => Math.max(0, Math.round(value)));
};
const normalizeAccrualOpexPaymentTreatmentByKey = (
  raw: any,
  fallback: Record<string, OpexPaymentTreatment>,
): Record<string, OpexPaymentTreatment> => {
  const next: Record<string, OpexPaymentTreatment> = { ...fallback };
  const source = raw && typeof raw === 'object' ? raw : {};
  ACCRUAL_OPEX_LINE_ITEMS.forEach(({ key }) => {
    const value = source[key];
    next[key] = value === 'ap-schedule' ? 'ap-schedule' : 'paid-in-full';
  });
  return next;
};
const normalizeInputs = (raw: any, fallback: ForecastInputs): ForecastInputs => ({
  inventoryTurns: clampNumber(toRoundedTurns(raw?.inventoryTurns, fallback.inventoryTurns), 0.5, 30),
  minCashBuffer: Math.max(0, toRoundedCurrency(raw?.minCashBuffer, fallback.minCashBuffer)),
  locLimit: Math.max(0, toRoundedCurrency(raw?.locLimit, fallback.locLimit)),
  locAprPct: clampNumber(toRoundedPercent(raw?.locAprPct, fallback.locAprPct), 0, 100),
  creditSalesPct: clampNumber(toRoundedPercent(raw?.creditSalesPct, fallback.creditSalesPct), 0, 100),
  historicalSalesLookbackWeeks: clampNumber(toRoundedInteger(raw?.historicalSalesLookbackWeeks, fallback.historicalSalesLookbackWeeks), 1, 52),
  historicalSalesCollectionLagWeeks: clampNumber(toRoundedInteger(raw?.historicalSalesCollectionLagWeeks, fallback.historicalSalesCollectionLagWeeks), 0, 12),
  arCurrentCollectPct: clampNumber(toRoundedPercent(raw?.arCurrentCollectPct, fallback.arCurrentCollectPct), 0, 100),
  ar30To60CollectPct: clampNumber(toRoundedPercent(raw?.ar30To60CollectPct, fallback.ar30To60CollectPct), 0, 100),
  ar60To90CollectPct: clampNumber(toRoundedPercent(raw?.ar60To90CollectPct, fallback.ar60To90CollectPct), 0, 100),
  ar90PlusCollectPct: clampNumber(toRoundedPercent(raw?.ar90PlusCollectPct, fallback.ar90PlusCollectPct), 0, 100),
  arWeek1WeightPct: clampNumber(toRoundedPercent(raw?.arWeek1WeightPct, fallback.arWeek1WeightPct), 0, 100),
  arWeek2WeightPct: clampNumber(toRoundedPercent(raw?.arWeek2WeightPct, fallback.arWeek2WeightPct), 0, 100),
  arWeek3WeightPct: clampNumber(toRoundedPercent(raw?.arWeek3WeightPct, fallback.arWeek3WeightPct), 0, 100),
  arWeek4WeightPct: clampNumber(toRoundedPercent(raw?.arWeek4WeightPct, fallback.arWeek4WeightPct), 0, 100),
  apCurrentPayPct: clampNumber(toRoundedPercent(raw?.apCurrentPayPct, fallback.apCurrentPayPct), 0, 100),
  ap30To60PayPct: clampNumber(toRoundedPercent(raw?.ap30To60PayPct, fallback.ap30To60PayPct), 0, 100),
  ap60To90PayPct: clampNumber(toRoundedPercent(raw?.ap60To90PayPct, fallback.ap60To90PayPct), 0, 100),
  ap90PlusPayPct: clampNumber(toRoundedPercent(raw?.ap90PlusPayPct, fallback.ap90PlusPayPct), 0, 100),
  apWeek1WeightPct: clampNumber(toRoundedPercent(raw?.apWeek1WeightPct, fallback.apWeek1WeightPct), 0, 100),
  apWeek2WeightPct: clampNumber(toRoundedPercent(raw?.apWeek2WeightPct, fallback.apWeek2WeightPct), 0, 100),
  apWeek3WeightPct: clampNumber(toRoundedPercent(raw?.apWeek3WeightPct, fallback.apWeek3WeightPct), 0, 100),
  apWeek4WeightPct: clampNumber(toRoundedPercent(raw?.apWeek4WeightPct, fallback.apWeek4WeightPct), 0, 100),
});

export default function WorkingCapitalForecastTab({ selectedCompanyId, basisMode = 'cash', viewMode = 'full' }: WorkingCapitalForecastTabProps) {
  const money = useCompanyMoneyFormatter(selectedCompanyId);
  const formatCurrency = (value: number) => money.fmt(Number(value || 0), 0);
  const formatCurrencyInput = (value: number): string => money.fmt(Number(value || 0), 0);
  const isInputsOnly = viewMode === 'inputs-only';
  const isAccrualFullCashForecast = basisMode === 'accrual' && !isInputsOnly;
  const [inputs, setInputs] = useState<ForecastInputs>(EMPTY_INPUTS);
  const [historicalAverages, setHistoricalAverages] = useState<WeeklyDriver>(EMPTY_WEEKLY_DRIVER);
  const [historicalSalesByWeek, setHistoricalSalesByWeek] = useState<number[]>([]);
  const [accrualOpexAmountByRow, setAccrualOpexAmountByRow] = useState<Record<string, number[]>>({});
  const [accrualOpexPctByRow, setAccrualOpexPctByRow] = useState<Record<string, number[]>>({});
  const [accrualOpexPaymentTreatmentByKey, setAccrualOpexPaymentTreatmentByKey] = useState<Record<string, OpexPaymentTreatment>>(
    { ...DEFAULT_ACCRUAL_OPEX_PAYMENT_TREATMENT_BY_KEY },
  );
  const [weeklyDrivers, setWeeklyDrivers] = useState<WeeklyDriver[]>(
    Array.from({ length: FORECAST_WEEKS }, () => ({ ...EMPTY_WEEKLY_DRIVER }))
  );
  const [forecastMonthRefs, setForecastMonthRefs] = useState<MonthlyBaseRef[]>([]);
  const [weekMonthLabels, setWeekMonthLabels] = useState<string[]>(Array.from({ length: FORECAST_WEEKS }, () => ''));
  const [startingBalances, setStartingBalances] = useState<StartingBalances>(DEFAULT_STARTING_BALANCES);
  const [locBalanceFromImportedData, setLocBalanceFromImportedData] = useState<boolean>(false);
  const [inventoryBalanceFromImportedData, setInventoryBalanceFromImportedData] = useState<boolean>(false);
  const [startingArBuckets, setStartingArBuckets] = useState<AgingBuckets>(DEFAULT_AGING_BUCKETS);
  const [startingApBuckets, setStartingApBuckets] = useState<AgingBuckets>(DEFAULT_AGING_BUCKETS);
  const [flowProfile, setFlowProfile] = useState<HistoricalFlowProfile>(DEFAULT_FLOW_PROFILE);
  const [loadingBalances, setLoadingBalances] = useState<boolean>(false);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadStartingBalances = async () => {
      setLoadingBalances(true);
      setBalancesError(null);
      try {
        type Frequency = 'daily' | 'weekly' | 'monthly';
        const annualPeriods: Record<Frequency, number> = { daily: 365, weekly: 52, monthly: 12 };
        const bootstrapResponse = await fetch(
          `/api/working-capital-forecast/bootstrap?companyId=${encodeURIComponent(selectedCompanyId)}&basisMode=${basisMode}`,
          { cache: 'no-store' },
        );
        if (!bootstrapResponse.ok) {
          const err = await bootstrapResponse.json().catch(() => ({}));
          throw new Error(err?.error || 'Unable to load cash forecast inputs');
        }
        const bootstrap = await bootstrapResponse.json();

        const savedPayload = bootstrap?.savedSettings || null;
        const financialForecastPayload = bootstrap?.financialForecastInputs || null;
        const loansPayload = bootstrap?.loans || null;
        const dailyFinancial = bootstrap?.operational?.dailyFinancials || null;
        const cashResult = bootstrap?.operational?.cashResult || null;
        const arResult = bootstrap?.operational?.arAgingResult || null;
        const apResult = bootstrap?.operational?.apAgingResult || null;
        const inventoryHistory = bootstrap?.operational?.inventoryHistory || null;
        const productHistory = bootstrap?.operational?.productHistory || null;
        const productMarginHistory = bootstrap?.operational?.productMarginHistory || null;
        const loadedOpexAmountByRow =
          financialForecastPayload?.settings?.opexPctByRow?.__amountByRow &&
          typeof financialForecastPayload.settings.opexPctByRow.__amountByRow === 'object'
            ? financialForecastPayload.settings.opexPctByRow.__amountByRow
            : {};
        const loadedOpexPctByRow =
          financialForecastPayload?.settings?.opexPctByRow &&
          typeof financialForecastPayload.settings.opexPctByRow === 'object'
            ? financialForecastPayload.settings.opexPctByRow
            : {};
        const loadedOpexPaymentTreatmentByKey = normalizeAccrualOpexPaymentTreatmentByKey(
          financialForecastPayload?.settings?.opexPctByRow?.__paymentTreatmentByKey,
          DEFAULT_ACCRUAL_OPEX_PAYMENT_TREATMENT_BY_KEY,
        );
        const savedSettings = savedPayload?.settings || null;
        const loans = Array.isArray(loansPayload?.loans) ? loansPayload.loans : [];
        const locLoanAmount = loans
          .filter((loan: any) => String(loan?.loanType || '').toUpperCase() === 'LINE_OF_CREDIT')
          .filter((loan: any) => {
            const status = String(loan?.status || '').toUpperCase();
            return !status || status === 'ACTIVE' || status === 'MATURING';
          })
          .reduce((sum: number, loan: any) => sum + Math.max(0, Number(loan?.loanAmount || 0)), 0);

        const fetchLatestDailyFinancialCash = async (): Promise<number> => {
          const summaryCash = Number(dailyFinancial?.summary?.latestCash || 0);
          if (summaryCash !== 0) return summaryCash;
          if (Array.isArray(dailyFinancial?.records) && dailyFinancial.records.length > 0) {
            const latest = dailyFinancial.records[0];
            const recordCash = Number(latest?.cash || 0);
            if (recordCash !== 0) return recordCash;
          }
          return 0;
        };

        const fetchLatestDailyFinancialSnapshot = async (): Promise<{
          asOfDay: string;
          cash: number;
          ar: number;
          ap: number;
          inventory: number | null;
          loc: number | null;
        } | null> => {
          if (!Array.isArray(dailyFinancial?.records) || dailyFinancial.records.length === 0) return null;
          const latestDate = pickLatestRecordDay(dailyFinancial.records);
          const asOfFriday = latestDate ? mostRecentFridayUtc(latestDate) : null;
          const asOfRow = asOfFriday ? pickLatestRecordAtOrBeforeDay(dailyFinancial.records, asOfFriday) : null;
          if (!asOfRow || !asOfFriday) return null;
          return {
            asOfDay: dateKeyUtc(asOfFriday),
            cash: Number(asOfRow?.cash || 0),
            ar: Number(asOfRow?.ar || 0),
            ap: Number(asOfRow?.ap || 0),
            inventory: toOptionalRoundedCurrency(asOfRow?.inventory),
            loc: toOptionalRoundedCurrency(asOfRow?.loc),
          };
        };

        const latestDailySnapshot = await fetchLatestDailyFinancialSnapshot();
        // Starting balances should be the most recent closed week-end (Friday),
        // not "latest imported day" (e.g. Monday). For example, if the newest
        // daily financial record is 2026-08-10, we use 2026-08-07.
        const asOfDay = latestDailySnapshot?.asOfDay || null;
        let latestCash = Number(latestDailySnapshot?.cash || 0);
        if (!latestCash) latestCash = Number(cashResult?.data?.summary?.totalCash || 0);
        if (!latestCash) latestCash = await fetchLatestDailyFinancialCash();
        const latestAr = Number(latestDailySnapshot?.ar || 0);
        const latestAp = Number(latestDailySnapshot?.ap || 0);
        let latestInventory = latestDailySnapshot?.inventory ?? null;
        let hasImportedInventoryBalance = latestInventory !== null && latestInventory > 0;
        const latestLocBalance = latestDailySnapshot?.loc ?? null;
        const hasImportedLocBalance = latestLocBalance !== null;
        const asOfDate = asOfDay ? new Date(`${asOfDay}T00:00:00.000Z`) : null;
        const latestArSnapshot =
          asOfDate && Array.isArray(arResult?.data?.records)
            ? pickLatestRecordAtOrBeforeDay(arResult.data.records, asOfDate)
            : (Array.isArray(arResult?.data?.records) ? arResult.data.records?.[0] : null);
        const latestApSnapshot =
          asOfDate && Array.isArray(apResult?.data?.records)
            ? pickLatestRecordAtOrBeforeDay(apResult.data.records, asOfDate)
            : (Array.isArray(apResult?.data?.records) ? apResult.data.records?.[0] : null);
        const derivedArBuckets = mapSnapshotToBuckets(latestArSnapshot, latestAr);
        const derivedApBuckets = mapSnapshotToBuckets(latestApSnapshot, latestAp);

        if ((!hasImportedInventoryBalance || latestInventory === null) && inventoryHistory?.data?.records) {
          const latestInventorySnapshot = inventoryHistory.data.records[0];
          const importedInventory = toOptionalRoundedCurrency(latestInventorySnapshot?.assetValue);
          if (importedInventory !== null && importedInventory > 0) {
            latestInventory = importedInventory;
            hasImportedInventoryBalance = true;
          }
        }
        let suggestedInventoryTurns = 0;
        if (inventoryHistory?.data?.records && productHistory?.data?.records) {
          const inventoryByDate = new Map<string, number>();
          for (const row of inventoryHistory.data.records) {
            const dateKey = String(row?.snapshotDate || '').split('T')[0];
            if (!dateKey) continue;
            inventoryByDate.set(dateKey, (inventoryByDate.get(dateKey) || 0) + Number(row?.assetValue || 0));
          }
          const inventoryValues = Array.from(inventoryByDate.values()).filter((v) => Number.isFinite(v) && v > 0);
          const averageInventory =
            inventoryValues.length > 0
              ? inventoryValues.reduce((sum, value) => sum + value, 0) / inventoryValues.length
              : 0;

          const cogsByDate = new Map<string, number>();
          for (const row of productHistory.data.records) {
            const dateKey = String(row?.snapshotDate || '').split('T')[0];
            if (!dateKey) continue;
            cogsByDate.set(dateKey, (cogsByDate.get(dateKey) || 0) + Number(row?.cogs || 0));
          }
          const cogsValues = Array.from(cogsByDate.values()).filter((v) => Number.isFinite(v) && v >= 0);
          const periods = cogsValues.length;
          const totalCogs = cogsValues.reduce((sum, value) => sum + value, 0);
          const annualizedCogs =
            periods > 0 ? (totalCogs / periods) * annualPeriods[productHistory.frequency] : 0;
          suggestedInventoryTurns =
            averageInventory > 0 && annualizedCogs > 0 ? annualizedCogs / averageInventory : 0;
        }

        let avgWeeklySales = DEFAULT_WEEKLY_DRIVER.sales;
        let avgWeeklyGrossMargin = DEFAULT_WEEKLY_DRIVER.grossMarginPct;
        if (productMarginHistory?.data?.records) {
          const totalsByPeriod = new Map<string, { revenue: number; cogs: number }>();
          for (const row of productMarginHistory.data.records) {
            const dateKey = String(row?.snapshotDate || '').split('T')[0];
            if (!dateKey) continue;
            if (!totalsByPeriod.has(dateKey)) totalsByPeriod.set(dateKey, { revenue: 0, cogs: 0 });
            const bucket = totalsByPeriod.get(dateKey)!;
            bucket.revenue += Number(row?.revenue || 0);
            bucket.cogs += Number(row?.cogs || 0);
          }
          const periods = Array.from(totalsByPeriod.entries())
            .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
            .slice(0, FORECAST_WEEKS)
            .map(([, totals]) => totals);
          if (periods.length > 0) {
            const margins = periods
              .filter((p) => p.revenue > 0)
              .map((p) => ((p.revenue - p.cogs) / p.revenue) * 100);
            if (margins.length > 0) {
              avgWeeklyGrossMargin = margins.reduce((sum, m) => sum + m, 0) / margins.length;
            }
          }
        }

        let avgWeeklyOpex = DEFAULT_WEEKLY_DRIVER.opex;
        let inventoryToSalesRatio = DEFAULT_FLOW_PROFILE.inventoryToSalesRatio;
        let arRunoffRate = DEFAULT_FLOW_PROFILE.arRunoffRate;
        let apRunoffRate = DEFAULT_FLOW_PROFILE.apRunoffRate;
        let recentHistoricalSales: number[] = [];
        let hasImportedDailyFinancialValues = false;
        if (Array.isArray(dailyFinancial?.records) && dailyFinancial.records.length > 0) {
            const weekly = new Map<string, { revenue: number; expense: number; ar: number; ap: number; latestTs: number }>();
            const inventoryRatioSamples: number[] = [];
            for (const row of dailyFinancial.records) {
              if (
                hasAnyPositiveValue([
                  row?.cash,
                  row?.ar,
                  row?.ap,
                  row?.inventory,
                  row?.loc,
                  row?.revenue,
                  row?.expense,
                ])
              ) {
                hasImportedDailyFinancialValues = true;
              }
              const snapshot = row?.snapshotDate ? new Date(row.snapshotDate) : null;
              if (!snapshot || Number.isNaN(snapshot.getTime())) continue;
              const day = snapshot.getUTCDay();
              const diffToMonday = day === 0 ? -6 : 1 - day;
              const monday = new Date(snapshot);
              monday.setUTCDate(snapshot.getUTCDate() + diffToMonday);
              monday.setUTCHours(0, 0, 0, 0);
              const weekKey = monday.toISOString().split('T')[0];
              if (!weekly.has(weekKey)) weekly.set(weekKey, { revenue: 0, expense: 0, ar: 0, ap: 0, latestTs: 0 });
              const bucket = weekly.get(weekKey)!;
              bucket.revenue += Number(row?.revenue || 0);
              bucket.expense += Number(row?.expense || 0);
              const revenue = Number(row?.revenue || 0);
              const inventory = Number(row?.inventory || 0);
              if (revenue > 0 && inventory >= 0) {
                inventoryRatioSamples.push(inventory / revenue);
              }
              const snapshotTs = snapshot.getTime();
              if (snapshotTs >= bucket.latestTs) {
                bucket.latestTs = snapshotTs;
                bucket.ar = Number(row?.ar || 0);
                bucket.ap = Number(row?.ap || 0);
              }
            }
            const lastWeeks = Array.from(weekly.entries())
              .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
              .slice(0, FORECAST_WEEKS)
              .map(([, totals]) => totals);
            recentHistoricalSales = Array.from(weekly.entries())
              .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
              .slice(0, 52)
              .map(([, totals]) => Math.max(0, Math.round(Number(totals.revenue || 0))));
            if (lastWeeks.length > 0) {
              avgWeeklySales = lastWeeks.reduce((sum, value) => sum + value.revenue, 0) / lastWeeks.length;
              avgWeeklyOpex = lastWeeks.reduce((sum, value) => sum + value.expense, 0) / lastWeeks.length;
            }

            const chronoWeeks = Array.from(weekly.entries())
              .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
              .slice(-FORECAST_WEEKS)
              .map(([, totals]) => totals);
            const arRunoffSamples: number[] = [];
            const apRunoffSamples: number[] = [];
            for (let i = 1; i < chronoWeeks.length; i += 1) {
              const prev = chronoWeeks[i - 1];
              const curr = chronoWeeks[i];
              const prevAr = Number(prev.ar || 0);
              const currAr = Number(curr.ar || 0);
              const prevAp = Number(prev.ap || 0);
              const currAp = Number(curr.ap || 0);
              if (prevAr > 0) {
                arRunoffSamples.push(clampNumber((prevAr - currAr) / prevAr, 0, 1));
              }
              if (prevAp > 0) {
                apRunoffSamples.push(clampNumber((prevAp - currAp) / prevAp, 0, 1));
              }
            }
            if (arRunoffSamples.length > 0) {
              arRunoffRate = clampNumber(
                arRunoffSamples.reduce((sum, value) => sum + value, 0) / arRunoffSamples.length,
                0.01,
                1
              );
            }
            if (apRunoffSamples.length > 0) {
              apRunoffRate = clampNumber(
                apRunoffSamples.reduce((sum, value) => sum + value, 0) / apRunoffSamples.length,
                0.01,
                1
              );
            }
            if (inventoryRatioSamples.length > 0) {
              inventoryToSalesRatio = clampNumber(
                inventoryRatioSamples.reduce((sum, value) => sum + value, 0) / inventoryRatioSamples.length,
                0.05,
                3
              );
            }
        }

        if (!cancelled) {
          setAccrualOpexAmountByRow(loadedOpexAmountByRow);
          setAccrualOpexPctByRow(loadedOpexPctByRow);
          setAccrualOpexPaymentTreatmentByKey(loadedOpexPaymentTreatmentByKey);
          const derivedStartingBalances = {
            cash: latestCash,
            ar: latestAr,
            ap: latestAp,
            inventory: Math.max(0, Math.round(latestInventory ?? 0)),
            loc: Math.max(0, Math.round(latestLocBalance ?? 0)),
          };
          setStartingBalances(derivedStartingBalances);
          setStartingArBuckets(derivedArBuckets);
          setStartingApBuckets(derivedApBuckets);
          const derivedInputs: ForecastInputs = {
            ...DEFAULT_INPUTS,
            inventoryTurns:
              suggestedInventoryTurns > 0
                ? Math.max(0.5, Math.min(30, Math.round(suggestedInventoryTurns * 100) / 100))
                : DEFAULT_INPUTS.inventoryTurns,
            minCashBuffer: DEFAULT_INPUTS.minCashBuffer,
            locLimit: locLoanAmount > 0 ? locLoanAmount : DEFAULT_INPUTS.locLimit,
            locAprPct: DEFAULT_INPUTS.locAprPct,
          };
          const resolvedAverages: WeeklyDriver = {
            sales: Math.max(0, Math.round(avgWeeklySales)),
            opex: Math.max(0, Math.round(avgWeeklyOpex)),
            grossMarginPct: Math.max(1, Math.min(99, Math.round(avgWeeklyGrossMargin * 100) / 100)),
          };
          let monthRefsBase: MonthlyBaseRef[] = [];
          try {
            const scopedBaseKey = `financialForecastRevenueMonthlyBase_${basisMode}_${selectedCompanyId}`;
            const legacyCashBaseKey = `financialForecastRevenueMonthlyBase_${selectedCompanyId}`;
            const rawBase =
              localStorage.getItem(scopedBaseKey) ||
              (basisMode === 'cash' ? localStorage.getItem(legacyCashBaseKey) : null);
            const parsedBase = rawBase ? JSON.parse(rawBase) : null;
            monthRefsBase = Array.isArray(parsedBase?.monthRefs)
              ? parsedBase.monthRefs.map((row: any) => ({
                  year: Number(row?.year),
                  month: Number(row?.month),
                }))
              : [];
          } catch {
            monthRefsBase = [];
          }
          const hasAccrualForecastInputs =
            Object.values(loadedOpexAmountByRow).some((values) => Array.isArray(values) && hasAnyPositiveValue(values));
          const hasImportedStartingBalances = hasAnyPositiveValue(Object.values(derivedStartingBalances));
          const hasAgingBalances = hasAnyPositiveValue([
            ...Object.values(derivedArBuckets),
            ...Object.values(derivedApBuckets),
          ]);
          const hasForecastSourceData =
            hasImportedStartingBalances ||
            hasAgingBalances ||
            hasImportedDailyFinancialValues ||
            hasAnyPositiveValue(recentHistoricalSales) ||
            hasAccrualForecastInputs ||
            locLoanAmount > 0 ||
            suggestedInventoryTurns > 0;
          const seedInputs = hasForecastSourceData ? derivedInputs : EMPTY_INPUTS;
          const seedAverages = hasForecastSourceData ? resolvedAverages : EMPTY_WEEKLY_DRIVER;
          setHistoricalSalesByWeek(recentHistoricalSales);
          setForecastMonthRefs(monthRefsBase);
          setWeekMonthLabels(buildWeekMonthLabels(monthRefsBase));

          if (savedSettings) {
            const mergedInputs = normalizeInputs(savedSettings.inputs, seedInputs);
            const resolvedInputs =
              locLoanAmount > 0
                ? { ...mergedInputs, locLimit: locLoanAmount }
                : mergedInputs;
            const shouldUseImportedWeekEndingBalances = Boolean(asOfDay);
            const savedStartingBalances: StartingBalances = {
              ...derivedStartingBalances,
              ...(savedSettings?.startingBalances && typeof savedSettings.startingBalances === 'object'
                ? {
                    cash: shouldUseImportedWeekEndingBalances
                      ? derivedStartingBalances.cash
                      : Math.max(0, toRoundedCurrency((savedSettings.startingBalances as any).cash, derivedStartingBalances.cash)),
                    ar: shouldUseImportedWeekEndingBalances
                      ? derivedStartingBalances.ar
                      : Math.max(0, toRoundedCurrency((savedSettings.startingBalances as any).ar, derivedStartingBalances.ar)),
                    ap: shouldUseImportedWeekEndingBalances
                      ? derivedStartingBalances.ap
                      : Math.max(0, toRoundedCurrency((savedSettings.startingBalances as any).ap, derivedStartingBalances.ap)),
                    inventory: Math.max(0, toRoundedCurrency((savedSettings.startingBalances as any).inventory, derivedStartingBalances.inventory)),
                    loc: Math.max(0, toRoundedCurrency((savedSettings.startingBalances as any).loc, derivedStartingBalances.loc)),
                  }
                : {}),
            };
            const resolvedStartingBalances: StartingBalances = {
              ...savedStartingBalances,
              inventory: hasImportedInventoryBalance
                ? Math.max(0, Math.round(latestInventory || 0))
                : savedStartingBalances.inventory,
              loc: hasImportedLocBalance
                ? Math.max(0, Math.round(latestLocBalance || 0))
                : savedStartingBalances.loc,
            };
            const mergedAverages = normalizeWeeklyDriver(savedSettings.historicalAverages, seedAverages);
            const historicalWeeklySales = Math.max(0, Number(mergedAverages.sales || seedAverages.sales || 0));
            const historicalWeeklyOpex = Math.max(0, Number(mergedAverages.opex || seedAverages.opex || 0));
            const mergedWeekly = normalizeWeeklyDriverList(savedSettings.weeklyDrivers, mergedAverages)
              .map((driver) => ({
                ...driver,
                sales: driver.sales > historicalWeeklySales * 0.25 || historicalWeeklySales <= 0 ? driver.sales : historicalWeeklySales,
                opex: driver.opex > 0 || historicalWeeklyOpex <= 0 ? driver.opex : historicalWeeklyOpex,
              }));
            setInputs(resolvedInputs);
            setHistoricalAverages(mergedAverages);
            setWeeklyDrivers(mergedWeekly);
            setStartingBalances(resolvedStartingBalances);
            setLastSavedAt(savedSettings.updatedAt ? String(savedSettings.updatedAt) : null);
          } else {
            setInputs(seedInputs);
            setHistoricalAverages(seedAverages);
            const defaults = Array.from({ length: FORECAST_WEEKS }, () => ({ ...seedAverages }));
            setWeeklyDrivers(defaults);
            setStartingBalances(derivedStartingBalances);
            setLastSavedAt(null);
          }
          setInventoryBalanceFromImportedData(hasImportedInventoryBalance);
          setLocBalanceFromImportedData(hasImportedLocBalance);

          setFlowProfile({
            arRunoffRate,
            apRunoffRate,
            inventoryToSalesRatio,
          });
          setSaveMessage(null);
        }
      } catch (error: any) {
        if (!cancelled) {
          setBalancesError(error?.message || 'Unable to load latest operational balances');
          setStartingBalances(DEFAULT_STARTING_BALANCES);
          setInventoryBalanceFromImportedData(false);
          setLocBalanceFromImportedData(false);
          setStartingArBuckets(DEFAULT_AGING_BUCKETS);
          setStartingApBuckets(DEFAULT_AGING_BUCKETS);
          setForecastMonthRefs([]);
          setWeekMonthLabels(Array.from({ length: FORECAST_WEEKS }, () => ''));
        }
      } finally {
        if (!cancelled) {
          setLoadingBalances(false);
        }
      }
    };

    loadStartingBalances();
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId, basisMode]);

  const rows = useMemo<ForecastRow[]>(() => {
    const result: ForecastRow[] = [];
    const weeks = FORECAST_WEEKS;
    const isAccrualBasis = basisMode === 'accrual';
    const inventoryWeeksOnHand = Math.max(0.25, 52 / Math.max(0.5, inputs.inventoryTurns));
    const historicalInventoryToSales = flowProfile.inventoryToSalesRatio > 0 ? flowProfile.inventoryToSalesRatio : DEFAULT_FLOW_PROFILE.inventoryToSalesRatio;
    const creditSalesRate = clampNumber(inputs.creditSalesPct / 100, 0, 1);
    const historicalLookbackWeeks = clampNumber(Math.round(inputs.historicalSalesLookbackWeeks || 0), 1, 52);
    const historicalCollectionLagWeeks = clampNumber(Math.round(inputs.historicalSalesCollectionLagWeeks || 0), 0, 12);
    const arCurrentRate = clampNumber(inputs.arCurrentCollectPct / 100, 0, 1);
    const ar30to60Rate = clampNumber(inputs.ar30To60CollectPct / 100, 0, 1);
    const ar60to90Rate = clampNumber(inputs.ar60To90CollectPct / 100, 0, 1);
    const ar90plusRate = clampNumber(inputs.ar90PlusCollectPct / 100, 0, 1);
    const apCurrentRate = clampNumber(inputs.apCurrentPayPct / 100, 0, 1);
    const ap30to60Rate = clampNumber(inputs.ap30To60PayPct / 100, 0, 1);
    const ap60to90Rate = clampNumber(inputs.ap60To90PayPct / 100, 0, 1);
    const ap90plusRate = clampNumber(inputs.ap90PlusPayPct / 100, 0, 1);
    const arWeeklyWeights = toWeeklyWeights(
      inputs.arWeek1WeightPct,
      inputs.arWeek2WeightPct,
      inputs.arWeek3WeightPct,
      inputs.arWeek4WeightPct
    );
    const apWeeklyWeights = toWeeklyWeights(
      inputs.apWeek1WeightPct,
      inputs.apWeek2WeightPct,
      inputs.apWeek3WeightPct,
      inputs.apWeek4WeightPct
    );
    type Cohort = { remaining: number; ageWeeks: number };
    const getPhaseRate = (
      ageWeeks: number,
      currentRate: number,
      bucket30to60Rate: number,
      bucket60to90Rate: number,
      bucket90plusRate: number
    ) => {
      if (ageWeeks < 4) return currentRate;
      if (ageWeeks < 8) return bucket30to60Rate;
      if (ageWeeks < 12) return bucket60to90Rate;
      return bucket90plusRate;
    };
    const processCohorts = (
      cohorts: Cohort[],
      currentRate: number,
      bucket30to60Rate: number,
      bucket60to90Rate: number,
      bucket90plusRate: number,
      weeklyWeights: number[]
    ): number => {
      let total = 0;
      for (const cohort of cohorts) {
        if (cohort.remaining <= 0) continue;
        const phaseRate = getPhaseRate(
          cohort.ageWeeks,
          currentRate,
          bucket30to60Rate,
          bucket60to90Rate,
          bucket90plusRate
        );
        const weekWeight = weeklyWeights[cohort.ageWeeks % 4] || 0;
        const scheduled = cohort.remaining * phaseRate * weekWeight;
        const realized = Math.min(cohort.remaining, Math.max(0, safeNumber(scheduled, 0)));
        cohort.remaining = Math.max(0, cohort.remaining - realized);
        total += realized;
      }
      return total;
    };
    const defaultArCohorts: Cohort[] = [
      { remaining: Math.max(0, startingArBuckets.current), ageWeeks: 0 },
      { remaining: Math.max(0, startingArBuckets.bucket30to60), ageWeeks: 4 },
      { remaining: Math.max(0, startingArBuckets.bucket60to90), ageWeeks: 8 },
      { remaining: Math.max(0, startingArBuckets.bucket90plus), ageWeeks: 12 },
    ];
    let arCohorts: Cohort[] = defaultArCohorts;
    if (isAccrualBasis && historicalSalesByWeek.length > 0 && Math.max(0, Number(startingBalances.ar || 0)) > 0) {
      const seededSales = historicalSalesByWeek
        .slice(0, historicalLookbackWeeks)
        .map((sales) => Math.max(0, Number(sales || 0) * creditSalesRate));
      const seededTotal = seededSales.reduce((sum, value) => sum + value, 0);
      if (seededTotal > 0) {
        const scaleToCurrentAr = Math.max(0, Number(startingBalances.ar || 0)) / seededTotal;
        arCohorts = seededSales.map((value, idx) => ({
          remaining: Math.max(0, safeNumber(value * scaleToCurrentAr, 0)),
          ageWeeks: historicalCollectionLagWeeks + idx,
        }));
      }
    }
    const apBuckets = reconcileAgingBucketsToTotal(startingApBuckets, startingBalances.ap);
    const apCohorts: Cohort[] = [
      { remaining: Math.max(0, apBuckets.current), ageWeeks: 0 },
      { remaining: Math.max(0, apBuckets.bucket30to60), ageWeeks: 4 },
      { remaining: Math.max(0, apBuckets.bucket60to90), ageWeeks: 8 },
      { remaining: Math.max(0, apBuckets.bucket90plus), ageWeeks: 12 },
    ];

    const salesByWeek: number[] = Array.from({ length: weeks }, (_, idx) => Math.max(0, weeklyDrivers[idx]?.sales || 0));
    const opexByWeek: number[] = Array.from({ length: weeks }, (_, idx) => Math.max(0, weeklyDrivers[idx]?.opex || 0));
    const opexPaidInFullByWeek = Array.from({ length: weeks }, () => 0);
    const opexViaApByWeek = Array.from({ length: weeks }, () => 0);
    const weekStarts = Array.from({ length: weeks }, (_, idx) => addDays(getWeekendAnchorDate(new Date()), idx * 7));
    ACCRUAL_OPEX_LINE_ITEMS.forEach(({ key }) => {
      const treatment = accrualOpexPaymentTreatmentByKey?.[key] === 'ap-schedule' ? 'ap-schedule' : 'paid-in-full';
      const amounts = Array.isArray(accrualOpexAmountByRow[key]) ? accrualOpexAmountByRow[key] : [];
      const pcts = Array.isArray(accrualOpexPctByRow[key]) ? accrualOpexPctByRow[key] : [];
      const weeklyExplicitAmounts = amounts.some((value) => Number(value || 0) > 0)
        ? allocateMonthlyAmountsToWeeks(
            amounts.map((value) => Math.max(0, Number(value || 0))),
            forecastMonthRefs,
            weekStarts,
            key === 'payroll' ? 'payroll-semi-monthly' : 'calendar',
          )
        : [];
      for (let i = 0; i < weeks; i += 1) {
        const explicitAmount = Number(weeklyExplicitAmounts[i] || 0);
        const pct = Number(pcts[i] || 0);
        const pctDerivedAmount = Math.max(0, safeNumber(salesByWeek[i] * (pct / 100), 0));
        const amount = Number.isFinite(explicitAmount) && explicitAmount > 0
          ? Math.max(0, explicitAmount)
          : pctDerivedAmount;
        if (treatment === 'ap-schedule') {
          opexViaApByWeek[i] += amount;
        } else {
          opexPaidInFullByWeek[i] += amount;
        }
      }
    });
    const hasAccrualLineAmounts =
      opexPaidInFullByWeek.some((value) => value > 0) || opexViaApByWeek.some((value) => value > 0);
    const grossMarginByWeek: number[] = Array.from({ length: weeks }, (_, idx) =>
      Math.min(0.99, Math.max(0.01, Number(weeklyDrivers[idx]?.grossMarginPct || 0) / 100))
    );
    let cash = Number(startingBalances.cash || 0);
    let ar = Math.max(0, startingBalances.ar);
    let ap = Math.max(0, startingBalances.ap);
    let inventory = Math.max(0, startingBalances.inventory);
    let loc = Math.max(0, startingBalances.loc);

    for (let i = 0; i < weeks; i += 1) {
      const beginningCash = safeNumber(cash, 0);
      const sales = Math.max(0, safeNumber(salesByWeek[i], 0));
      const cogs = Math.max(0, safeNumber(sales * (1 - grossMarginByWeek[i]), 0));
      const directPaidOpex = isAccrualBasis && hasAccrualLineAmounts
        ? Math.max(0, safeNumber(opexPaidInFullByWeek[i], 0))
        : 0;
      const apScheduledOpex = isAccrualBasis && hasAccrualLineAmounts
        ? Math.max(0, safeNumber(opexViaApByWeek[i], 0))
        : 0;
      const cashOpex = isAccrualBasis && hasAccrualLineAmounts
        ? directPaidOpex
        : Math.max(0, safeNumber(opexByWeek[i], 0));
      const opex = isAccrualBasis && hasAccrualLineAmounts
        ? directPaidOpex + apScheduledOpex
        : cashOpex;
      const turnsTargetInventory = safeNumber(cogs * inventoryWeeksOnHand, 0);
      const historicalTargetInventory = safeNumber(sales * historicalInventoryToSales, 0);
      const targetInventory = (turnsTargetInventory + historicalTargetInventory) / 2;

      const postSalesInventory = Math.max(0, safeNumber(inventory - cogs, 0));
      const purchaseForTarget = Math.max(0, safeNumber(targetInventory - postSalesInventory, 0));
      const purchases = safeNumber(purchaseForTarget, 0);
      let cashSalesReceipts = 0;
      if (isAccrualBasis) {
        const creditSales = Math.max(0, safeNumber(sales * creditSalesRate, 0));
        cashSalesReceipts = Math.max(0, safeNumber(sales - creditSales, 0));
        arCohorts.push({ remaining: creditSales, ageWeeks: 0 });
      } else {
        arCohorts.push({ remaining: Math.max(0, sales), ageWeeks: 0 });
      }

      const scheduledArReceipts = processCohorts(
        arCohorts,
        arCurrentRate,
        ar30to60Rate,
        ar60to90Rate,
        ar90plusRate,
        arWeeklyWeights
      );
      const apPayments = processCohorts(
        apCohorts,
        apCurrentRate,
        ap30to60Rate,
        ap60to90Rate,
        ap90plusRate,
        apWeeklyWeights
      );
      // Add this week's new AP after payout processing so newly incurred AP
      // starts paying in following weeks rather than being paid immediately.
      apCohorts.push({ remaining: Math.max(0, purchases + apScheduledOpex), ageWeeks: 0 });
      const receipts = Math.max(0, safeNumber(scheduledArReceipts + cashSalesReceipts, 0));

      const locInterest = safeNumber(loc * (Math.max(0, inputs.locAprPct) / 100) / 52, 0);
      const baseEndingCash = safeNumber(beginningCash + receipts - apPayments - cashOpex - locInterest, beginningCash);
      const unleveredEndingCash = baseEndingCash;

      let locDraw = 0;
      let locRepay = 0;
      if (baseEndingCash < Math.max(0, inputs.minCashBuffer)) {
        const gap = Math.max(0, inputs.minCashBuffer - baseEndingCash);
        const availableToDraw = Math.max(0, Math.max(0, inputs.locLimit) - loc);
        locDraw = Math.min(gap, availableToDraw);
      } else if (baseEndingCash > Math.max(0, inputs.minCashBuffer) && loc > 0) {
        const excess = baseEndingCash - Math.max(0, inputs.minCashBuffer);
        locRepay = Math.min(excess, loc);
      }

      const endingCashRaw = safeNumber(baseEndingCash + locDraw - locRepay, beginningCash);
      const endingCash = Number.isFinite(endingCashRaw) ? endingCashRaw : beginningCash;
      const endingLoc = Math.max(0, safeNumber(loc + locDraw - locRepay, loc));
      const endingAr = Math.max(
        0,
        safeNumber(
          arCohorts.reduce((sum, cohort) => sum + Math.max(0, cohort.remaining), 0),
          ar
        )
      );
      const endingAp = Math.max(
        0,
        safeNumber(
          apCohorts.reduce((sum, cohort) => sum + Math.max(0, cohort.remaining), 0),
          ap
        )
      );
      const endingInventory = Math.max(0, safeNumber(postSalesInventory + purchases, inventory));

      result.push({
        week: i + 1,
        beginningCash,
        sales,
        receipts,
        cogs,
        targetInventory,
        purchases,
        apPayments,
        opex,
        cashOpex,
        locInterest,
        locDraw,
        locRepay,
        unleveredEndingCash,
        endingCash,
        endingLoc,
        endingAr,
        endingAp,
        endingInventory,
      });

      cash = endingCash;
      loc = endingLoc;
      ar = endingAr;
      ap = endingAp;
      inventory = endingInventory;
      for (const cohort of arCohorts) cohort.ageWeeks += 1;
      for (const cohort of apCohorts) cohort.ageWeeks += 1;
    }

    return result;
  }, [inputs, startingBalances, startingArBuckets, startingApBuckets, weeklyDrivers, flowProfile, basisMode, historicalSalesByWeek, accrualOpexAmountByRow, accrualOpexPctByRow, accrualOpexPaymentTreatmentByKey, forecastMonthRefs]);

  const totals = useMemo(() => {
    const minCash = rows.reduce((acc, row) => Math.min(acc, row.endingCash), Number.POSITIVE_INFINITY);
    const peakLoc = rows.reduce((acc, row) => Math.max(acc, row.endingLoc), 0);
    const totalDraw = rows.reduce((acc, row) => acc + row.locDraw, 0);
    const totalRepay = rows.reduce((acc, row) => acc + row.locRepay, 0);
    const week13Cash = rows.length ? rows[rows.length - 1].endingCash : 0;
    return {
      minCash: Number.isFinite(minCash) ? minCash : 0,
      peakLoc,
      totalDraw,
      totalRepay,
      week13Cash,
    };
  }, [rows]);

  useEffect(() => {
    if (!selectedCompanyId || typeof window === 'undefined') return;
    const graphRows = rows.slice(0, FORECAST_WEEKS).map((row) => {
      const availableLoc = Math.max(0, Number(inputs.locLimit || 0) - Number(row.endingLoc || 0));
      return {
        week: row.week,
        unleveredEndingCash: Number(row.unleveredEndingCash || 0),
        endingCash: Number(row.endingCash || 0),
        endingLoc: Number(row.endingLoc || 0),
        availableLoc,
      };
    });
    const payload = {
      locLimit: Math.max(0, Number(inputs.locLimit || 0)),
      rows: graphRows,
      updatedAt: new Date().toISOString(),
    };
    const scopedGraphKey = `cashForecastGraphData_${basisMode}_${selectedCompanyId}`;
    localStorage.setItem(scopedGraphKey, JSON.stringify(payload));
    if (basisMode === 'cash') {
      localStorage.setItem(`cashForecastGraphData_${selectedCompanyId}`, JSON.stringify(payload));
    }
  }, [rows, inputs.locLimit, selectedCompanyId, basisMode]);

  const updateNumberInput = (key: keyof ForecastInputs, value: string) => {
    const parsed = Number(value);
    setInputs((prev) => ({ ...prev, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  };
  const updatePercentField = (key: keyof ForecastInputs, next: number) => {
    setInputs((prev) => ({ ...prev, [key]: next }));
  };
  const updateCurrencyInput = (key: keyof ForecastInputs, value: string) => {
    const parsed = parseCurrencyInput(value);
    setInputs((prev) => ({ ...prev, [key]: parsed }));
  };
  const updateStartingBalanceCurrency = (key: keyof StartingBalances, value: string) => {
    const parsed = Math.max(0, parseCurrencyInput(value));
    setStartingBalances((prev) => ({ ...prev, [key]: parsed }));
  };
  const updateWeeklyCurrencyDriver = (weekIdx: number, key: 'sales' | 'opex', value: string) => {
    const parsed = parseCurrencyInput(value);
    setWeeklyDrivers((prev) =>
      prev.map((week, idx) => (idx === weekIdx ? { ...week, [key]: parsed } : week))
    );
  };
  const updateWeeklyPercentDriver = (weekIdx: number, next: number) => {
    setWeeklyDrivers((prev) =>
      prev.map((week, idx) => (idx === weekIdx ? { ...week, grossMarginPct: next } : week))
    );
  };
  const saveSettings = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const response = await fetch('/api/working-capital-forecast/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          basisMode,
          inputs,
          historicalAverages,
          weeklyDrivers,
          startingBalances,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save working capital forecast settings');
      }
      setLastSavedAt(String(data?.updatedAt || new Date().toISOString()));
      setSaveMessage('Saved');
    } catch (error: any) {
      setSaveMessage(`Save failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const forecastHeaders = [
    'Week',
    'Beginning Cash',
    'Receipts',
    'AP Payments',
    'Cash Opex',
    'LOC Interest',
    'LOC Draw',
    'LOC Repay',
    'Unlevered Cash',
    'Ending Cash (Post LOC)',
    'Ending LOC',
    'Available LOC',
    'Available Liquidity',
    'Ending AR',
    'Ending AP',
    'Ending Inventory',
    'Target Inventory',
  ];
  const weekDesignationLabels = useMemo(() => {
    const anchor = getWeekendAnchorDate(new Date());
    return Array.from({ length: FORECAST_WEEKS }, (_, idx) => {
      const weekEnding = addDays(anchor, idx * 7 + 6);
      return weekEnding.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
  }, []);

  return (
    <div style={{ padding: '18px 24px 24px' }}>
      <div style={{ ...cardStyle, marginBottom: '14px', borderColor: '#cbd5e1', background: '#f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
              {isInputsOnly
                ? 'Accrual Weekly Inputs (13 Weeks)'
                : basisMode === 'accrual'
                  ? 'Cash Forecast - 13 Weeks'
                  : 'Cash Forecast (Cash Basis, 13 Weeks)'}
            </div>
            <div style={{ color: '#334155', fontSize: '13px' }}>
              Starting balances are sourced from last imported operational data. AR/AP days and inventory turns are auto-seeded from recent history and remain editable.
            </div>
            {lastSavedAt && (
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                Last saved: {new Date(lastSavedAt).toLocaleString()}
              </div>
            )}
            {saveMessage && (
              <div style={{ marginTop: '6px', fontSize: '12px', color: saveMessage.startsWith('Save failed') ? '#b91c1c' : '#166534' }}>
                {saveMessage}
              </div>
            )}
          </div>
          <button
            onClick={saveSettings}
            disabled={isSaving}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid #2751d0',
              background: isSaving ? '#e2e8f0' : '#2751d0',
              color: isSaving ? '#475569' : '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              minWidth: '120px',
            }}
          >
            {isSaving ? 'Saving...' : 'Save Inputs'}
          </button>
        </div>
      </div>

      {!isInputsOnly && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '12px', marginBottom: '14px' }}>
          <div style={{ ...cardStyle, gridColumn: 'span 2' }}>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Beginning Cash (Last Imported)</div>
            <div style={{ fontSize: '28px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
              {loadingBalances ? 'Loading...' : formatCurrency(startingBalances.cash)}
            </div>
            {balancesError && <div style={{ marginTop: '6px', fontSize: '12px', color: '#b91c1c' }}>{balancesError}</div>}
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Minimum Cash</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#0369a1' }}>{formatCurrency(totals.minCash)}</div>
          </div>
          <div style={cardStyle}>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Peak LOC</div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: '#7c3aed' }}>{formatCurrency(totals.peakLoc)}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isAccrualFullCashForecast ? '1fr' : 'minmax(0, 2fr) minmax(0, 1fr)', gap: '12px', marginBottom: '14px' }}>
        {!isAccrualFullCashForecast && (
        <div style={{ ...cardStyle, marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{`Inputs (Weeks 1-${FORECAST_WEEKS})`}</div>
            {balancesError && <div style={{ fontSize: '12px', color: '#b91c1c' }}>{balancesError}</div>}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
            Values are from Income Statement Forecast; user can override and save any field.
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '10px' }}>
            Weekly seeds are calendar-aligned from the first forecast month and weighted by day overlap across months.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '16%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '28%' }} />
                <col style={{ width: '28%' }} />
              </colgroup>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#334155' }}>Week</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#334155' }}>Sales</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#334155' }}>Operating Expense</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', color: '#334155' }}>Gross Margin %</th>
                </tr>
              </thead>
              <tbody>
                {weeklyDrivers.map((week, idx) => (
                  <tr key={`driver-week-${idx + 1}`}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '11px', color: '#0f172a', fontWeight: 700 }}>
                      Week {idx + 1}{weekMonthLabels[idx] ? ` (${weekMonthLabels[idx]})` : ''}
                    </td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #f1f5f9' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatCurrencyInput(week.sales)}
                        onChange={(e) => updateWeeklyCurrencyDriver(idx, 'sales', e.target.value)}
                        style={compactTableInputStyle}
                      />
                    </td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #f1f5f9' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatCurrencyInput(week.opex)}
                        onChange={(e) => updateWeeklyCurrencyDriver(idx, 'opex', e.target.value)}
                        style={compactTableInputStyle}
                      />
                    </td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #f1f5f9' }}>
                      <PercentInput
                        value={week.grossMarginPct}
                        min={1}
                        max={99}
                        onValueChange={(next) => updateWeeklyPercentDriver(idx, next)}
                        style={compactTableInputStyle}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        )}

        <div style={cardStyle}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>Inputs</div>
          <div style={{ display: 'grid', gridTemplateColumns: isAccrualFullCashForecast ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
            {basisMode === 'accrual' && (
              <div
                style={{
                  gridColumn: isAccrualFullCashForecast ? '3 / 4' : '1 / -1',
                  gridRow: isAccrualFullCashForecast ? '1' : undefined,
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '8px',
                  background: '#f8fafc',
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Historical Sales to Collections</div>
                <div style={{ fontSize: '11px', color: '#334155', marginBottom: '8px' }}>
                  Historical weekly sales seed the opening AR collection mix so near-term cash reflects actual sales cohorts.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>Credit Sales %</label>
                    <PercentInput value={inputs.creditSalesPct} onValueChange={(next) => updatePercentField('creditSalesPct', next)} style={compactPercentInputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>Lookback Weeks</label>
                    <input type="number" value={inputs.historicalSalesLookbackWeeks} onChange={(e) => updateNumberInput('historicalSalesLookbackWeeks', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>Collection Lag (Weeks)</label>
                    <input type="number" value={inputs.historicalSalesCollectionLagWeeks} onChange={(e) => updateNumberInput('historicalSalesCollectionLagWeeks', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                  </div>
                </div>
                <div style={{ marginTop: '8px', fontSize: '11px', color: '#475569' }}>
                  Avg historical weekly sales:{' '}
                  <strong style={{ color: '#0f172a' }}>
                    {historicalSalesByWeek.length > 0
                      ? formatCurrency(Math.round(historicalSalesByWeek.reduce((sum, value) => sum + Number(value || 0), 0) / historicalSalesByWeek.length))
                      : 'N/A'}
                  </strong>
                </div>
                <div style={{ height: '8px' }} />
                <div style={{ borderTop: '1px solid #e2e8f0', marginTop: '4px', paddingTop: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Cash & LOC Inputs</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Inventory Turns (Annual)</label>
                      <input type="number" value={inputs.inventoryTurns} onChange={(e) => updateNumberInput('inventoryTurns', e.target.value)} style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Minimum Cash Buffer</label>
                      <input type="text" inputMode="numeric" value={formatCurrencyInput(inputs.minCashBuffer)} onChange={(e) => updateCurrencyInput('minCashBuffer', e.target.value)} style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>LOC Limit</label>
                      <input type="text" inputMode="numeric" value={formatCurrencyInput(inputs.locLimit)} onChange={(e) => updateCurrencyInput('locLimit', e.target.value)} style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>LOC APR (%)</label>
                      <PercentInput value={inputs.locAprPct} onValueChange={(next) => updatePercentField('locAprPct', next)} style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }} />
                    </div>
                    {inventoryBalanceFromImportedData ? (
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Starting Inventory (Last Imported)</label>
                        <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>{formatCurrency(startingBalances.inventory)}</div>
                      </div>
                    ) : (
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Starting Inventory (Manual)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatCurrencyInput(startingBalances.inventory)}
                          onChange={(e) => updateStartingBalanceCurrency('inventory', e.target.value)}
                          style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }}
                        />
                      </div>
                    )}
                    {locBalanceFromImportedData ? (
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Starting LOC Balance (Last Imported)</label>
                        <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>{formatCurrency(startingBalances.loc)}</div>
                      </div>
                    ) : (
                      <div>
                        <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Starting LOC Balance (Manual)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatCurrencyInput(startingBalances.loc)}
                          onChange={(e) => updateStartingBalanceCurrency('loc', e.target.value)}
                          style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', gridColumn: isAccrualFullCashForecast ? '1 / 2' : undefined, gridRow: isAccrualFullCashForecast ? '1' : undefined }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>AR Inputs</div>
              <div style={{ fontSize: '11px', color: '#334155', fontWeight: 600, marginBottom: '4px' }}>AR Aging Buckets (% collected next 4 weeks)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>Current</label>
                  <PercentInput value={inputs.arCurrentCollectPct} onValueChange={(next) => updatePercentField('arCurrentCollectPct', next)} style={compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>30-60</label>
                  <PercentInput value={inputs.ar30To60CollectPct} onValueChange={(next) => updatePercentField('ar30To60CollectPct', next)} style={compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>60-90</label>
                  <PercentInput value={inputs.ar60To90CollectPct} onValueChange={(next) => updatePercentField('ar60To90CollectPct', next)} style={compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>90+</label>
                  <PercentInput value={inputs.ar90PlusCollectPct} onValueChange={(next) => updatePercentField('ar90PlusCollectPct', next)} style={compactPercentInputStyle} />
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#334155', fontWeight: 600, marginBottom: '4px' }}>AR Weekly Distribution Weights</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W1</label>
                  <PercentInput value={inputs.arWeek1WeightPct} onValueChange={(next) => updatePercentField('arWeek1WeightPct', next)} style={compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W2</label>
                  <PercentInput value={inputs.arWeek2WeightPct} onValueChange={(next) => updatePercentField('arWeek2WeightPct', next)} style={compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W3</label>
                  <PercentInput value={inputs.arWeek3WeightPct} onValueChange={(next) => updatePercentField('arWeek3WeightPct', next)} style={compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W4</label>
                  <PercentInput value={inputs.arWeek4WeightPct} onValueChange={(next) => updatePercentField('arWeek4WeightPct', next)} style={compactPercentInputStyle} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Starting AR (Last Imported)</label>
                <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>{formatCurrency(startingBalances.ar)}</div>
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', gridColumn: isAccrualFullCashForecast ? '2 / 3' : undefined, gridRow: isAccrualFullCashForecast ? '1' : undefined }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>AP Inputs</div>
              <div style={{ fontSize: '11px', color: '#334155', fontWeight: 600, marginBottom: '4px' }}>AP Aging Buckets (% paid next 4 weeks)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>Current</label>
                  <PercentInput value={inputs.apCurrentPayPct} onValueChange={(next) => updatePercentField('apCurrentPayPct', next)} style={compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>30-60</label>
                  <PercentInput value={inputs.ap30To60PayPct} onValueChange={(next) => updatePercentField('ap30To60PayPct', next)} style={compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>60-90</label>
                  <PercentInput value={inputs.ap60To90PayPct} onValueChange={(next) => updatePercentField('ap60To90PayPct', next)} style={compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>90+</label>
                  <PercentInput value={inputs.ap90PlusPayPct} onValueChange={(next) => updatePercentField('ap90PlusPayPct', next)} style={compactPercentInputStyle} />
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#334155', fontWeight: 600, marginBottom: '4px' }}>AP Weekly Distribution Weights</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W1</label>
                  <PercentInput value={inputs.apWeek1WeightPct} onValueChange={(next) => updatePercentField('apWeek1WeightPct', next)} style={compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W2</label>
                  <PercentInput value={inputs.apWeek2WeightPct} onValueChange={(next) => updatePercentField('apWeek2WeightPct', next)} style={compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W3</label>
                  <PercentInput value={inputs.apWeek3WeightPct} onValueChange={(next) => updatePercentField('apWeek3WeightPct', next)} style={compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W4</label>
                  <PercentInput value={inputs.apWeek4WeightPct} onValueChange={(next) => updatePercentField('apWeek4WeightPct', next)} style={compactPercentInputStyle} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Starting AP (Last Imported)</label>
                <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>{formatCurrency(startingBalances.ap)}</div>
              </div>
            </div>
            {basisMode !== 'accrual' && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Cash & LOC Inputs</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Inventory Turns (Annual)</label>
                  <input type="number" value={inputs.inventoryTurns} onChange={(e) => updateNumberInput('inventoryTurns', e.target.value)} style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Minimum Cash Buffer</label>
                  <input type="text" inputMode="numeric" value={formatCurrencyInput(inputs.minCashBuffer)} onChange={(e) => updateCurrencyInput('minCashBuffer', e.target.value)} style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>LOC Limit</label>
                  <input type="text" inputMode="numeric" value={formatCurrencyInput(inputs.locLimit)} onChange={(e) => updateCurrencyInput('locLimit', e.target.value)} style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>LOC APR (%)</label>
                  <PercentInput value={inputs.locAprPct} onValueChange={(next) => updatePercentField('locAprPct', next)} style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }} />
                </div>
                {inventoryBalanceFromImportedData ? (
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Starting Inventory (Last Imported)</label>
                    <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>{formatCurrency(startingBalances.inventory)}</div>
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Starting Inventory (Manual)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(startingBalances.inventory)}
                      onChange={(e) => updateStartingBalanceCurrency('inventory', e.target.value)}
                      style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }}
                    />
                  </div>
                )}
                {locBalanceFromImportedData ? (
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Starting LOC Balance (Last Imported)</label>
                    <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>{formatCurrency(startingBalances.loc)}</div>
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Starting LOC Balance (Manual)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(startingBalances.loc)}
                      onChange={(e) => updateStartingBalanceCurrency('loc', e.target.value)}
                      style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }}
                    />
                  </div>
                )}
              </div>
            </div>
            )}

          </div>
        </div>
      </div>

      {!isInputsOnly && (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{`${FORECAST_WEEKS}-Week Forecast`}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Week 13 Cash: <strong style={{ color: '#0f172a' }}>{formatCurrency(totals.week13Cash)}</strong>
            {' | '}
            Total Draws: <strong style={{ color: '#0f172a' }}>{formatCurrency(totals.totalDraw)}</strong>
            {' | '}
            Total Repayments: <strong style={{ color: '#0f172a' }}>{formatCurrency(totals.totalRepay)}</strong>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '1400px', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                {forecastHeaders.map((header) => (
                  <th
                    key={header}
                    style={{
                      textAlign: header === 'Week' ? 'left' : 'right',
                      borderBottom: '1px solid #e2e8f0',
                      padding: '8px',
                      color: '#334155',
                      fontSize: '12px',
                    }}
                  >
                    {header === 'Ending Cash (Post LOC)' ? (
                      <>
                        <span style={{ display: 'block', whiteSpace: 'nowrap' }}>Ending Cash</span>
                        <span style={{ display: 'block', whiteSpace: 'nowrap' }}>(Post LOC)</span>
                      </>
                    ) : (
                      header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, FORECAST_WEEKS).map((row) => (
                (() => {
                  const availableLoc = Math.max(0, Number(inputs.locLimit || 0) - Number(row.endingLoc || 0));
                  const totalAvailableLiquidity = Number(row.endingCash || 0) + availableLoc;
                  return (
                <tr key={row.week}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#0f172a', fontWeight: 600 }}>
                    {`Week Ending ${weekDesignationLabels[row.week - 1] || `W${row.week}`}`}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.beginningCash)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.receipts)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.apPayments)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.cashOpex)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.locInterest)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: row.locDraw > 0 ? '#7c3aed' : '#64748b' }}>{formatCurrency(row.locDraw)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: row.locRepay > 0 ? '#0284c7' : '#64748b' }}>{formatCurrency(row.locRepay)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: row.unleveredEndingCash < 0 ? '#dc2626' : '#111827', fontWeight: 600 }}>
                    {formatCurrency(row.unleveredEndingCash)}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: row.endingCash < 0 ? '#dc2626' : '#111827', fontWeight: 700 }}>
                    {formatCurrency(row.endingCash)}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.endingLoc)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(availableLoc)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px', fontWeight: 700, color: totalAvailableLiquidity < 0 ? '#dc2626' : '#111827' }}>
                    {formatCurrency(totalAvailableLiquidity)}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.endingAr)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.endingAp)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.endingInventory)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.targetInventory)}</td>
                </tr>
                  );
                })()
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}
