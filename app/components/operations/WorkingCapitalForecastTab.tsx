'use client';
import { formatEstDateTime } from '@/lib/time/eastern';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCompanyMoneyFormatter } from '@/app/hooks/useCompanyMoneyFormatter';
import {
  DEFAULT_ACCRUAL_OPEX_PAYMENT_TREATMENT_BY_KEY,
  DEFAULT_AGING_BUCKETS,
  DEFAULT_FLOW_PROFILE,
  DEFAULT_STARTING_BALANCES,
  EMPTY_INPUTS,
  EMPTY_WEEKLY_DRIVER,
  FORECAST_WEEKS,
  addDays,
  allocateForecastSalesByWeek,
  applyAllocatedSalesToDrivers,
  clampNumber,
  deriveForecastStateFromBootstrap,
  getWeekendAnchorDate,
  parseMonthRevenueSeries,
  projectWorkingCapitalForecast,
  startOfDay,
  toRoundedCurrency,
  toRoundedInteger,
  type AgingBuckets,
  type ForecastInputs,
  type ForecastRow,
  type HistoricalFlowProfile,
  type HistoricalApPaymentProfile,
  type HistoricalArCollectionProfile,
  type HistoricalDebtServiceProfile,
  type MonthRevenueSeries,
  type MonthlyBaseRef,
  type OpexPaymentTreatment,
  type StartingBalances,
  type WeeklyDriver,
} from '@/lib/working-capital-forecast/engine';

type ExpenseTimingRule = 'weekly' | 'biweekly' | 'semi-monthly' | 'monthly' | 'monthly-eom';

type ScheduledExpenseRule = {
  key: string;
  label: string;
  monthlyAmount: number;
  timing: ExpenseTimingRule;
  weekday: number; // 0=Sun ... 6=Sat (used for biweekly)
  dayOfMonth: number; // 1..28 (used for monthly)
};

const DEFAULT_SCHEDULED_EXPENSE_RULES: ScheduledExpenseRule[] = [
  { key: 'payroll', label: 'Payroll', monthlyAmount: 72000, timing: 'semi-monthly', weekday: 5, dayOfMonth: 1 },
  { key: 'rent', label: 'Rent', monthlyAmount: 25000, timing: 'monthly', weekday: 1, dayOfMonth: 1 },
  { key: 'taxes', label: 'Taxes', monthlyAmount: 18000, timing: 'semi-monthly', weekday: 1, dayOfMonth: 15 },
  { key: 'other-opex', label: 'Other Operating Expenses', monthlyAmount: 28000, timing: 'weekly', weekday: 1, dayOfMonth: 1 },
];
const FINANCIAL_FORECAST_MONTHLY_BASE_EVENT = 'corelytics-financial-forecast-monthly-base';

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
  disabled = false,
}: {
  value: number;
  onValueChange: (next: number) => void;
  min?: number;
  max?: number;
  style?: React.CSSProperties;
  disabled?: boolean;
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
        disabled={disabled}
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
        style={{ ...fieldStyle, ...(disabled ? { background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' } : {}) }}
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
const parseSignedCurrencyInput = (rawValue: string): number => {
  const compact = String(rawValue || '').replace(/[^0-9-]/g, '');
  if (!compact || compact === '-') return 0;
  const negative = compact.startsWith('-');
  const digits = compact.replace(/-/g, '');
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.round(negative ? -parsed : parsed) : 0;
};
const isSignedCurrencyDraft = (rawValue: string): boolean => {
  const trimmed = String(rawValue || '').trim();
  return trimmed === '' || trimmed === '-' || trimmed === '-$';
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

const buildWeekMonthLabels = (_monthRefs: MonthlyBaseRef[]): string[] => {
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
  const [opexAdjDraftByWeek, setOpexAdjDraftByWeek] = useState<Record<number, string>>({});
  const [forecastMonthRefs, setForecastMonthRefs] = useState<MonthlyBaseRef[]>([]);
  const [forecastMonthTotals, setForecastMonthTotals] = useState<number[]>([]);
  const [forecastDirectLaborMonthTotals, setForecastDirectLaborMonthTotals] = useState<number[]>([]);
  const [forecastMaterialCogsMonthTotals, setForecastMaterialCogsMonthTotals] = useState<number[]>([]);
  const [forecastApCogsMonthTotals, setForecastApCogsMonthTotals] = useState<number[]>([]);
  const [historicalApPaymentProfile, setHistoricalApPaymentProfile] = useState<HistoricalApPaymentProfile | null>(null);
  const [historicalArCollectionProfile, setHistoricalArCollectionProfile] = useState<HistoricalArCollectionProfile | null>(null);
  const [historicalDebtServiceProfile, setHistoricalDebtServiceProfile] = useState<HistoricalDebtServiceProfile | null>(null);
  const liveMonthSeriesRef = useRef<MonthRevenueSeries | null>(null);
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
        const bootstrapResponse = await fetch(
          `/api/working-capital-forecast/bootstrap?companyId=${encodeURIComponent(selectedCompanyId)}&basisMode=${basisMode}`,
          { cache: 'no-store' },
        );
        if (!bootstrapResponse.ok) {
          const err = await bootstrapResponse.json().catch(() => ({}));
          throw new Error(err?.error || 'Unable to load cash forecast inputs');
        }
        const bootstrap = await bootstrapResponse.json();

        let storedMonthSeries: MonthRevenueSeries | null = null;
        try {
          const scopedBaseKey = `financialForecastRevenueMonthlyBase_${basisMode}_${selectedCompanyId}`;
          const legacyCashBaseKey = `financialForecastRevenueMonthlyBase_${selectedCompanyId}`;
          const rawBase =
            localStorage.getItem(scopedBaseKey) ||
            (basisMode === 'cash' ? localStorage.getItem(legacyCashBaseKey) : null);
          const parsedBase = rawBase ? JSON.parse(rawBase) : null;
          storedMonthSeries = parseMonthRevenueSeries(parsedBase);
        } catch {
          storedMonthSeries = null;
        }
        const derived = deriveForecastStateFromBootstrap(bootstrap, {
          basisMode,
          storedMonthSeries,
          liveMonthSeries: liveMonthSeriesRef.current,
        });

        if (!cancelled) {
          setAccrualOpexAmountByRow(derived.accrualOpexAmountByRow);
          setAccrualOpexPctByRow(derived.accrualOpexPctByRow);
          setAccrualOpexPaymentTreatmentByKey(derived.accrualOpexPaymentTreatmentByKey);
          setStartingArBuckets(derived.startingArBuckets);
          setStartingApBuckets(derived.startingApBuckets);
          if (derived.monthSeries) liveMonthSeriesRef.current = derived.monthSeries;
          setHistoricalSalesByWeek(derived.historicalSalesByWeek);
          setForecastMonthRefs(derived.forecastMonthRefs);
          setForecastMonthTotals(derived.forecastMonthTotals);
          setForecastDirectLaborMonthTotals(derived.monthSeries?.directLaborMonthTotals || []);
          setForecastMaterialCogsMonthTotals(derived.forecastMaterialCogsMonthTotals || []);
          setForecastApCogsMonthTotals(derived.forecastApCogsMonthTotals || []);
          setHistoricalApPaymentProfile(derived.historicalApPaymentProfile || null);
          setHistoricalArCollectionProfile(derived.historicalArCollectionProfile || null);
          setHistoricalDebtServiceProfile(derived.historicalDebtServiceProfile || null);
          setWeekMonthLabels(buildWeekMonthLabels(derived.forecastMonthRefs));
          setInputs(derived.inputs);
          setHistoricalAverages(derived.historicalAverages);
          setWeeklyDrivers(derived.weeklyDrivers);
          setOpexAdjDraftByWeek({});
          setStartingBalances(derived.startingBalances);
          setLastSavedAt(derived.lastSavedAt);
          setInventoryBalanceFromImportedData(derived.inventoryBalanceFromImportedData);
          setLocBalanceFromImportedData(derived.locBalanceFromImportedData);
          setFlowProfile(derived.flowProfile);
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
          setForecastMonthTotals([]);
          setForecastDirectLaborMonthTotals([]);
          setForecastMaterialCogsMonthTotals([]);
          setForecastApCogsMonthTotals([]);
          setHistoricalApPaymentProfile(null);
          setHistoricalArCollectionProfile(null);
          setHistoricalDebtServiceProfile(null);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMonthlyBase = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || String(detail.companyId || '') !== selectedCompanyId) return;
      if (detail.basisMode && String(detail.basisMode) !== basisMode) return;
      const series = parseMonthRevenueSeries(detail);
      if (!series) return;
      liveMonthSeriesRef.current = series;
      const allocatedSales = allocateForecastSalesByWeek(series);
      setForecastMonthRefs(series.monthRefs);
      setForecastMonthTotals(series.monthTotals);
      setForecastDirectLaborMonthTotals(series.directLaborMonthTotals || []);
      setForecastMaterialCogsMonthTotals(series.materialCogsMonthTotals || []);
      setForecastApCogsMonthTotals(series.apCogsMonthTotals || []);
      setWeekMonthLabels(buildWeekMonthLabels(series.monthRefs));
      setWeeklyDrivers((prev) => applyAllocatedSalesToDrivers(prev, allocatedSales));
    };
    window.addEventListener(FINANCIAL_FORECAST_MONTHLY_BASE_EVENT, onMonthlyBase as EventListener);
    return () => {
      window.removeEventListener(FINANCIAL_FORECAST_MONTHLY_BASE_EVENT, onMonthlyBase as EventListener);
    };
  }, [selectedCompanyId, basisMode]);

  const rows = useMemo<ForecastRow[]>(() => projectWorkingCapitalForecast({
    basisMode,
    inputs,
    startingBalances,
    startingArBuckets,
    startingApBuckets,
    weeklyDrivers,
    flowProfile,
    historicalSalesByWeek,
    accrualOpexAmountByRow,
    accrualOpexPctByRow,
    accrualOpexPaymentTreatmentByKey,
    forecastMonthRefs,
    forecastMonthTotals,
    forecastDirectLaborMonthTotals,
    forecastMaterialCogsMonthTotals,
    forecastApCogsMonthTotals,
    historicalApPaymentProfile,
    historicalArCollectionProfile,
    historicalDebtServiceProfile,
  }), [inputs, startingBalances, startingArBuckets, startingApBuckets, weeklyDrivers, flowProfile, basisMode, historicalSalesByWeek, accrualOpexAmountByRow, accrualOpexPctByRow, accrualOpexPaymentTreatmentByKey, forecastMonthRefs, forecastMonthTotals, forecastDirectLaborMonthTotals, forecastMaterialCogsMonthTotals, forecastApCogsMonthTotals, historicalApPaymentProfile, historicalArCollectionProfile, historicalDebtServiceProfile]);
  const historicalArTimingActive = Number(historicalArCollectionProfile?.weeklyCollectionAmount || 0) > 0;
  const historicalApTimingActive =
    Number(historicalApPaymentProfile?.weeklyPaymentAmount || 0) > 0 &&
    Number(historicalApPaymentProfile?.purchasePaymentLagWeeks || 0) >= 1;
  const historicalArCollectionLagWeeks = historicalArTimingActive
    ? clampNumber(
        Math.round(startingBalances.ar / Number(historicalArCollectionProfile?.weeklyCollectionAmount || 1)),
        1,
        FORECAST_WEEKS,
      )
    : null;
  const scheduledDebtPrincipalTotal = (historicalDebtServiceProfile?.scheduledPrincipalByWeek || [])
    .reduce((total, amount) => total + Math.max(0, Number(amount || 0)), 0);
  const renderDebtPrincipalField = () => (
    <div style={{ gridColumn: '1 / -1' }}>
      <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Scheduled Debt Principal (Long-Term Debt)</label>
      <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>
        {formatCurrency(scheduledDebtPrincipalTotal)}
      </div>
      <div style={{ fontSize: '10px', color: '#64748b', lineHeight: 1.35, marginTop: '4px' }}>
        {historicalDebtServiceProfile?.source === 'terms'
          ? 'Total due during this 13-week forecast. Each week uses the sum of scheduled principal from every active long-term debt loan.'
          : 'No scheduled long-term debt principal found. Complete the amortization terms on the Loans page.'}
      </div>
    </div>
  );
  const disabledForecastAssumptionStyle: React.CSSProperties = {
    ...compactPercentInputStyle,
    background: '#f1f5f9',
    color: '#64748b',
    cursor: 'not-allowed',
  };

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
  const updateWeeklyOpexAdj = (weekIdx: number, value: string) => {
    if (isSignedCurrencyDraft(value)) {
      setOpexAdjDraftByWeek((prev) => ({ ...prev, [weekIdx]: value }));
      setWeeklyDrivers((prev) =>
        prev.map((week, idx) => (idx === weekIdx ? { ...week, opexAdj: 0 } : week))
      );
      return;
    }
    setOpexAdjDraftByWeek((prev) => {
      if (!(weekIdx in prev)) return prev;
      const next = { ...prev };
      delete next[weekIdx];
      return next;
    });
    const parsed = parseSignedCurrencyInput(value);
    setWeeklyDrivers((prev) =>
      prev.map((week, idx) => (idx === weekIdx ? { ...week, opexAdj: parsed } : week))
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
    'Direct Labor',
    'Cash Opex',
    'Opex Adj',
    'LOC Interest',
    'Debt Principal',
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
    <div style={{ padding: '12px 8px 24px' }}>
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
            {forecastMonthTotals.some((value) => value > 0) && (
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#1e3a8a' }}>
                Sales forecast source: Income Statement Forecast. Projected monthly revenue is allocated across the 13 weeks by calendar days, then drives COGS, inventory, and cash collections. Opening AR is collected separately from the current books.
              </div>
            )}
            <details style={{ marginTop: '8px', maxWidth: '920px' }}>
              <summary style={{ cursor: 'pointer', color: '#2751d0', fontSize: '12px', fontWeight: 700 }}>
                How Income Statement Forecast sales affect this cash forecast
              </summary>
              <div style={{ marginTop: '8px', border: '1px solid #bfdbfe', borderRadius: '8px', background: '#ffffff', padding: '10px', color: '#334155', fontSize: '12px', lineHeight: 1.55 }}>
                <div>
                  1. Projected monthly revenue from the Income Statement Forecast is allocated to each of the 13 weeks according to the number of calendar days from that month in the week.
                </div>
                <div style={{ marginTop: '5px' }}>
                  2. Projected material COGS determines inventory purchases. Projected manufacturing overhead, other COGS, duties, and tariffs create AP without increasing inventory. Direct Production Labor is paid separately as direct labor cash.
                </div>
                <div style={{ marginTop: '5px' }}>
                  3. In an accrual forecast, the cash-sales portion is received in the week of sale. The credit-sales portion becomes A/R and is collected using the A/R collection percentages and weekly distribution weights. Opening A/R is a separate balance and follows the same collection schedule.
                </div>
                <div style={{ marginTop: '5px' }}>
                  4. Receipts from those sales, less AP payments (including inventory purchases), direct labor, operating expenses, adjustments, LOC interest, and long-term debt principal, determine weekly ending cash and any required LOC draw or repayment. Loan interest is already included in operating expenses, so Debt Principal deducts only the principal portion.
                </div>
              </div>
            </details>
            {lastSavedAt && (
              <div style={{ marginTop: '6px', fontSize: '12px', color: '#64748b' }}>
                Last saved: {formatEstDateTime(lastSavedAt)}
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
            Sales are sourced from the Income Statement Forecast. Operating expense and gross margin are editable weekly inputs.
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
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Projected Sales Collections</div>
                <div style={{ fontSize: '11px', color: '#334155', marginBottom: '8px' }}>
                  {historicalArTimingActive
                    ? 'Historical AR receipts set the collection timing for projected credit sales. The manual collection lag is retained as a fallback only.'
                    : 'Projected credit sales become AR and begin collecting after the selected lag. Opening AR follows the aging collection assumptions below.'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>Credit Sales %</label>
                    <PercentInput value={inputs.creditSalesPct} onValueChange={(next) => updatePercentField('creditSalesPct', next)} style={compactPercentInputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>Collection Lag (Weeks)</label>
                    <input type="number" disabled={historicalArTimingActive} value={inputs.historicalSalesCollectionLagWeeks} onChange={(e) => updateNumberInput('historicalSalesCollectionLagWeeks', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px', ...(historicalArTimingActive ? { background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' } : {}) }} />
                  </div>
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
                    {renderDebtPrincipalField()}
                  </div>
                </div>
              </div>
            )}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', gridColumn: isAccrualFullCashForecast ? '1 / 2' : undefined, gridRow: isAccrualFullCashForecast ? '1' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                AR Inputs
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', lineHeight: 1.35, marginBottom: '6px' }}>
                {historicalArTimingActive
                  ? 'Historical AR receipts drive projected collection timing. Opening AR uses invoice due dates when they form a usable schedule; otherwise it follows the recent receipt cadence.'
                  : 'Opening AR uses invoice due dates when they form a usable schedule. Otherwise, recent sales cohorts and a smooth remaining-AR cadence avoid artificial startup collection cliffs. The aging assumptions below are the fallback when neither history is available.'}
              </div>
              {historicalArCollectionProfile && (
                <div style={{ fontSize: '10px', color: '#1e3a8a', lineHeight: 1.35, marginBottom: '6px' }}>
                  {historicalArTimingActive
                    ? `Historical AR receipt timing is active: about ${formatCurrency(historicalArCollectionProfile.weeklyCollectionAmount)} collected per week with an estimated ${historicalArCollectionLagWeeks}-week collection lag${historicalArCollectionProfile.matchedPaymentCount > 0 ? `, based in part on ${historicalArCollectionProfile.matchedPaymentCount} matched invoice payments.` : '.'}`
                    : `Imported opening-invoice data is available${historicalArCollectionProfile.matchedPaymentCount > 0
                      ? ` with ${historicalArCollectionProfile.matchedPaymentCount} matched invoice payments.`
                      : '.'}`}
                </div>
              )}
              <div style={{ fontSize: '11px', color: historicalArTimingActive ? '#64748b' : '#334155', fontWeight: 600, marginBottom: '4px' }}>AR Aging Buckets (% collected next 4 weeks){historicalArTimingActive ? ' — Fallback assumptions' : ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>Current</label>
                  <PercentInput value={inputs.arCurrentCollectPct} onValueChange={(next) => updatePercentField('arCurrentCollectPct', next)} disabled={historicalArTimingActive} style={historicalArTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>30-60</label>
                  <PercentInput value={inputs.ar30To60CollectPct} onValueChange={(next) => updatePercentField('ar30To60CollectPct', next)} disabled={historicalArTimingActive} style={historicalArTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>60-90</label>
                  <PercentInput value={inputs.ar60To90CollectPct} onValueChange={(next) => updatePercentField('ar60To90CollectPct', next)} disabled={historicalArTimingActive} style={historicalArTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>90+</label>
                  <PercentInput value={inputs.ar90PlusCollectPct} onValueChange={(next) => updatePercentField('ar90PlusCollectPct', next)} disabled={historicalArTimingActive} style={historicalArTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
              </div>
              <div style={{ fontSize: '11px', color: historicalArTimingActive ? '#64748b' : '#334155', fontWeight: 600, marginBottom: '4px' }}>AR Weekly Distribution Weights{historicalArTimingActive ? ' — Fallback assumptions' : ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W1</label>
                  <PercentInput value={inputs.arWeek1WeightPct} onValueChange={(next) => updatePercentField('arWeek1WeightPct', next)} disabled={historicalArTimingActive} style={historicalArTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W2</label>
                  <PercentInput value={inputs.arWeek2WeightPct} onValueChange={(next) => updatePercentField('arWeek2WeightPct', next)} disabled={historicalArTimingActive} style={historicalArTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W3</label>
                  <PercentInput value={inputs.arWeek3WeightPct} onValueChange={(next) => updatePercentField('arWeek3WeightPct', next)} disabled={historicalArTimingActive} style={historicalArTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W4</label>
                  <PercentInput value={inputs.arWeek4WeightPct} onValueChange={(next) => updatePercentField('arWeek4WeightPct', next)} disabled={historicalArTimingActive} style={historicalArTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Starting AR (Last Imported)</label>
                <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>{formatCurrency(startingBalances.ar)}</div>
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', gridColumn: isAccrualFullCashForecast ? '2 / 3' : undefined, gridRow: isAccrualFullCashForecast ? '1' : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                AP Inputs
              </div>
              <div style={{ fontSize: '10px', color: '#64748b', lineHeight: 1.35, marginBottom: '6px' }}>
                {historicalApTimingActive
                  ? 'Historical AP payments determine forecast timing. The aging assumptions below are retained only when payment history is unavailable.'
                  : 'Set the share of each opening AP aging bucket expected to be paid over the next four weeks; the weekly weights allocate those expected payments across Weeks 1–4 and should total 100%.'}
              </div>
              {historicalApPaymentProfile && (
                <div style={{ fontSize: '10px', color: '#1e3a8a', lineHeight: 1.35, marginBottom: '6px' }}>
                  Forecast payment timing uses the last 13 weeks of imported AP payments: about {formatCurrency(historicalApPaymentProfile.weeklyPaymentAmount)} per week, with new supplier purchases paid after approximately {historicalApPaymentProfile.purchasePaymentLagWeeks} week{historicalApPaymentProfile.purchasePaymentLagWeeks === 1 ? '' : 's'}{historicalApPaymentProfile.matchedPaymentCount > 0 ? ` (based on ${historicalApPaymentProfile.matchedPaymentCount} matched bills).` : ' (four-week fallback because no bill/payment matches were available).'}
                </div>
              )}
              <div style={{ fontSize: '11px', color: historicalApTimingActive ? '#64748b' : '#334155', fontWeight: 600, marginBottom: '4px' }}>AP Aging Buckets (% paid next 4 weeks){historicalApTimingActive ? ' — Fallback assumptions' : ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>Current</label>
                  <PercentInput value={inputs.apCurrentPayPct} onValueChange={(next) => updatePercentField('apCurrentPayPct', next)} disabled={historicalApTimingActive} style={historicalApTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>30-60</label>
                  <PercentInput value={inputs.ap30To60PayPct} onValueChange={(next) => updatePercentField('ap30To60PayPct', next)} disabled={historicalApTimingActive} style={historicalApTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>60-90</label>
                  <PercentInput value={inputs.ap60To90PayPct} onValueChange={(next) => updatePercentField('ap60To90PayPct', next)} disabled={historicalApTimingActive} style={historicalApTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>90+</label>
                  <PercentInput value={inputs.ap90PlusPayPct} onValueChange={(next) => updatePercentField('ap90PlusPayPct', next)} disabled={historicalApTimingActive} style={historicalApTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
              </div>
              <div style={{ fontSize: '11px', color: historicalApTimingActive ? '#64748b' : '#334155', fontWeight: 600, marginBottom: '4px' }}>AP Weekly Distribution Weights{historicalApTimingActive ? ' — Fallback assumptions' : ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W1</label>
                  <PercentInput value={inputs.apWeek1WeightPct} onValueChange={(next) => updatePercentField('apWeek1WeightPct', next)} disabled={historicalApTimingActive} style={historicalApTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W2</label>
                  <PercentInput value={inputs.apWeek2WeightPct} onValueChange={(next) => updatePercentField('apWeek2WeightPct', next)} disabled={historicalApTimingActive} style={historicalApTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W3</label>
                  <PercentInput value={inputs.apWeek3WeightPct} onValueChange={(next) => updatePercentField('apWeek3WeightPct', next)} disabled={historicalApTimingActive} style={historicalApTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W4</label>
                  <PercentInput value={inputs.apWeek4WeightPct} onValueChange={(next) => updatePercentField('apWeek4WeightPct', next)} disabled={historicalApTimingActive} style={historicalApTimingActive ? disabledForecastAssumptionStyle : compactPercentInputStyle} />
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
                {renderDebtPrincipalField()}
              </div>
            </div>
            )}

          </div>
        </div>
      </div>

      {!isInputsOnly && (
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{`${FORECAST_WEEKS}-Week Forecast`}</div>
            {forecastMonthTotals.some((value) => value > 0) && (
              <div style={{ marginTop: '4px', fontSize: '12px', color: '#475569' }}>
                Receipts = collections on opening AR + this week’s allocated forecast sales (cash slice plus credit collections).
              </div>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            Week 13 Cash: <strong style={{ color: '#0f172a' }}>{formatCurrency(totals.week13Cash)}</strong>
            {' | '}
            Total Draws: <strong style={{ color: '#0f172a' }}>{formatCurrency(totals.totalDraw)}</strong>
            {' | '}
            Total Repayments: <strong style={{ color: '#0f172a' }}>{formatCurrency(totals.totalRepay)}</strong>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: '1520px', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f8fafc' }}>
              <tr>
                {forecastHeaders.map((header) => (
                  <th
                    key={header}
                    style={{
                      textAlign: header === 'Week' ? 'left' : 'right',
                      borderBottom: '1px solid #e2e8f0',
                      padding: header === 'Opex Adj' ? '8px 4px' : '8px',
                      color: '#334155',
                      fontSize: '12px',
                      ...(header === 'Opex Adj'
                        ? {
                            width: '12ch',
                            minWidth: '12ch',
                            maxWidth: '12ch',
                            whiteSpace: 'nowrap' as const,
                            boxSizing: 'content-box' as const,
                          }
                        : {}),
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
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.directLaborPayments)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.cashOpex)}</td>
                  <td style={{ padding: '4px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', width: '12ch', minWidth: '12ch', maxWidth: '12ch', boxSizing: 'content-box' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      size={12}
                      maxLength={12}
                      value={opexAdjDraftByWeek[row.week - 1] ?? formatCurrencyInput(row.opexAdj)}
                      onChange={(e) => updateWeeklyOpexAdj(row.week - 1, e.target.value)}
                      onBlur={() =>
                        setOpexAdjDraftByWeek((prev) => {
                          if (!((row.week - 1) in prev)) return prev;
                          const next = { ...prev };
                          delete next[row.week - 1];
                          return next;
                        })
                      }
                      aria-label={`Opex Adj week ${row.week}`}
                      style={{
                        ...compactTableInputStyle,
                        width: '12ch',
                        minWidth: '12ch',
                        maxWidth: '12ch',
                        boxSizing: 'content-box',
                        textAlign: 'right',
                        color: row.opexAdj < 0 ? '#166534' : row.opexAdj > 0 ? '#b45309' : '#111827',
                      }}
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.locInterest)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.debtPrincipal)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: row.locDraw > 0 ? '#7c3aed' : '#64748b' }}>{formatCurrency(row.locDraw)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: row.locRepay > 0 ? '#0284c7' : '#64748b' }}>{formatCurrency(row.locRepay)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: row.unleveredEndingCash < Math.max(0, Number(inputs.minCashBuffer || 0)) ? '#dc2626' : '#111827', fontWeight: 600 }}>
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
