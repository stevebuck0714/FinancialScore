'use client';

import React, { useEffect, useMemo, useState } from 'react';

type ForecastInputs = {
  inventoryTurns: number;
  minCashBuffer: number;
  locLimit: number;
  locAprPct: number;
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
  locInterest: number;
  locDraw: number;
  locRepay: number;
  endingCash: number;
  endingLoc: number;
  endingAr: number;
  endingAp: number;
  endingInventory: number;
};

const DEFAULT_INPUTS: ForecastInputs = {
  inventoryTurns: 8,
  minCashBuffer: 25000,
  locLimit: 150000,
  locAprPct: 9,
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
const FORECAST_WEEKS = 13;
const DEFAULT_STARTING_BALANCES = { cash: 0, ar: 0, ap: 0, inventory: 0, loc: 0 };
const DEFAULT_FLOW_PROFILE: HistoricalFlowProfile = { arRunoffRate: 0.12, apRunoffRate: 0.12, inventoryToSalesRatio: 0.3 };
const DEFAULT_AGING_BUCKETS: AgingBuckets = { current: 0, bucket30to60: 0, bucket60to90: 0, bucket90plus: 0 };

const formatCurrency = (value: number): string =>
  `$${Math.round(Number(value || 0)).toLocaleString('en-US')}`;
const formatCurrencyInput = (value: number): string =>
  `$${Math.round(Number(value || 0)).toLocaleString('en-US')}`;
const formatPercentInput = (value: number): string => `${Number(value || 0).toFixed(2)}%`;
const parseCurrencyInput = (rawValue: string): number => {
  const normalized = String(rawValue || '').replace(/[^0-9-]/g, '');
  if (!normalized || normalized === '-') return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};
const parsePercentInput = (rawValue: string): number => {
  const normalized = String(rawValue || '').replace(/[^0-9.-]/g, '');
  if (!normalized || normalized === '-' || normalized === '.') return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
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

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '14px',
};

interface WorkingCapitalForecastTabProps {
  selectedCompanyId: string;
}

const clampNumber = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
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
const applyRevenueMonthlyBaseToWeeklySales = (drivers: WeeklyDriver[], monthTotals: number[]): WeeklyDriver[] => {
  if (!Array.isArray(monthTotals) || monthTotals.length < 3) return drivers;
  const next = drivers.map((driver) => ({ ...driver }));
  const month1Weekly = Math.max(0, Math.round((Number(monthTotals[0]) || 0) / 4));
  const month2Weekly = Math.max(0, Math.round((Number(monthTotals[1]) || 0) / 4));
  const month3Weekly = Math.max(0, Math.round((Number(monthTotals[2]) || 0) / 4));
  for (let idx = 0; idx < FORECAST_WEEKS; idx += 1) {
    if (idx <= 3) next[idx].sales = month1Weekly;
    else if (idx <= 7) next[idx].sales = month2Weekly;
    else if (idx <= 11) next[idx].sales = month3Weekly;
  }
  return next;
};
const applyOpexMonthlyBaseToWeeklyOpex = (drivers: WeeklyDriver[], monthTotals: number[]): WeeklyDriver[] => {
  if (!Array.isArray(monthTotals) || monthTotals.length < 3) return drivers;
  const next = drivers.map((driver) => ({ ...driver }));
  const month1Weekly = Math.max(0, Math.round((Number(monthTotals[0]) || 0) / 4));
  const month2Weekly = Math.max(0, Math.round((Number(monthTotals[1]) || 0) / 4));
  const month3Weekly = Math.max(0, Math.round((Number(monthTotals[2]) || 0) / 4));
  for (let idx = 0; idx < FORECAST_WEEKS; idx += 1) {
    if (idx <= 3) next[idx].opex = month1Weekly;
    else if (idx <= 7) next[idx].opex = month2Weekly;
    else if (idx <= 11) next[idx].opex = month3Weekly;
  }
  return next;
};
const applyMarginMonthlyBaseToWeeklyMargin = (drivers: WeeklyDriver[], monthPcts: number[]): WeeklyDriver[] => {
  if (!Array.isArray(monthPcts) || monthPcts.length < 3) return drivers;
  const next = drivers.map((driver) => ({ ...driver }));
  const month1Pct = clampNumber(Number(monthPcts[0]) || 0, 1, 99);
  const month2Pct = clampNumber(Number(monthPcts[1]) || 0, 1, 99);
  const month3Pct = clampNumber(Number(monthPcts[2]) || 0, 1, 99);
  for (let idx = 0; idx < FORECAST_WEEKS; idx += 1) {
    if (idx <= 3) next[idx].grossMarginPct = month1Pct;
    else if (idx <= 7) next[idx].grossMarginPct = month2Pct;
    else if (idx <= 11) next[idx].grossMarginPct = month3Pct;
  }
  return next;
};
const safeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
const normalizeInputs = (raw: any, fallback: ForecastInputs): ForecastInputs => ({
  inventoryTurns: clampNumber(toRoundedTurns(raw?.inventoryTurns, fallback.inventoryTurns), 0.5, 30),
  minCashBuffer: Math.max(0, toRoundedCurrency(raw?.minCashBuffer, fallback.minCashBuffer)),
  locLimit: Math.max(0, toRoundedCurrency(raw?.locLimit, fallback.locLimit)),
  locAprPct: clampNumber(toRoundedPercent(raw?.locAprPct, fallback.locAprPct), 0, 100),
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

export default function WorkingCapitalForecastTab({ selectedCompanyId }: WorkingCapitalForecastTabProps) {
  const [inputs, setInputs] = useState<ForecastInputs>(DEFAULT_INPUTS);
  const [historicalAverages, setHistoricalAverages] = useState<WeeklyDriver>(DEFAULT_WEEKLY_DRIVER);
  const [weeklyDrivers, setWeeklyDrivers] = useState<WeeklyDriver[]>(
    Array.from({ length: FORECAST_WEEKS }, () => ({ ...DEFAULT_WEEKLY_DRIVER }))
  );
  const [startingBalances, setStartingBalances] = useState<{ cash: number; ar: number; ap: number; inventory: number; loc: number }>(DEFAULT_STARTING_BALANCES);
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
        const buildUrl = (type: string, frequency: Frequency, limit = 30) => {
          const params = new URLSearchParams({
            companyId: selectedCompanyId,
            type,
            frequency,
            limit: String(limit),
          });
          return `/api/operational-data?${params.toString()}`;
        };

        const fetchLatestForType = async (type: 'cash' | 'ar-aging' | 'ap-aging' | 'inventory') => {
          const frequencies: Frequency[] = ['daily', 'weekly', 'monthly'];
          for (const frequency of frequencies) {
            const response = await fetch(buildUrl(type, frequency));
            if (!response.ok) continue;
            const data = await response.json();
            if (Array.isArray(data?.records) && data.records.length > 0) {
              return { data, frequency };
            }
          }
          return null;
        };

        const fetchHistoryForType = async (
          type: 'inventory' | 'products',
          preferredOrder: Frequency[] = ['monthly', 'weekly', 'daily']
        ) => {
          for (const frequency of preferredOrder) {
            const response = await fetch(buildUrl(type, frequency, 180));
            if (!response.ok) continue;
            const data = await response.json();
            if (Array.isArray(data?.records) && data.records.length > 0) {
              return { data, frequency };
            }
          }
          return null;
        };

        const [savedSettingsResponse, cashResult, arResult, apResult, loansResponse] = await Promise.all([
          fetch(`/api/working-capital-forecast/settings?companyId=${encodeURIComponent(selectedCompanyId)}`),
          fetchLatestForType('cash'),
          fetchLatestForType('ar-aging'),
          fetchLatestForType('ap-aging'),
          fetch(`/api/loans?companyId=${encodeURIComponent(selectedCompanyId)}`),
        ]);
        const savedPayload = savedSettingsResponse.ok ? await savedSettingsResponse.json() : null;
        const savedSettings = savedPayload?.settings || null;
        const loansPayload = loansResponse.ok ? await loansResponse.json() : null;
        const loans = Array.isArray(loansPayload?.loans) ? loansPayload.loans : [];
        const activeLocLoan =
          loans.find((loan: any) => loan?.loanType === 'LINE_OF_CREDIT' && loan?.status === 'ACTIVE') ||
          loans.find((loan: any) => loan?.loanType === 'LINE_OF_CREDIT') ||
          null;
        const locLoanAmount = Math.max(0, Math.round(Number(activeLocLoan?.loanAmount || 0)));

        const fetchLatestDailyFinancialCash = async (): Promise<number> => {
          const frequencies: Frequency[] = ['daily', 'weekly', 'monthly'];
          for (const frequency of frequencies) {
            const response = await fetch(buildUrl('daily-financials', frequency, 30));
            if (!response.ok) continue;
            const data = await response.json();
            const summaryCash = Number(data?.summary?.latestCash || 0);
            if (summaryCash !== 0) return summaryCash;
            if (Array.isArray(data?.records) && data.records.length > 0) {
              const latest = data.records[0];
              const recordCash = Number(latest?.cash || 0);
              if (recordCash !== 0) return recordCash;
            }
          }
          return 0;
        };

        const fetchLatestDailyFinancialSnapshot = async (): Promise<{
          cash: number;
          ar: number;
          ap: number;
          inventory: number;
          loc: number;
        } | null> => {
          const response = await fetch(buildUrl('daily-financials', 'daily', 60));
          if (!response.ok) return null;
          const data = await response.json();
          if (!Array.isArray(data?.records) || data.records.length === 0) return null;
          let latest: any = null;
          let latestTs = Number.NEGATIVE_INFINITY;
          for (const row of data.records) {
            const ts = row?.snapshotDate ? new Date(row.snapshotDate).getTime() : Number.NEGATIVE_INFINITY;
            if (Number.isFinite(ts) && ts >= latestTs) {
              latestTs = ts;
              latest = row;
            }
          }
          if (!latest) return null;
          return {
            cash: Number(latest?.cash || 0),
            ar: Number(latest?.ar || 0),
            ap: Number(latest?.ap || 0),
            inventory: Number(latest?.inventory || 0),
            loc: Number(latest?.loc || 0),
          };
        };

        let latestCash = Number(cashResult?.data?.summary?.totalCash || 0);
        const latestDailySnapshot = await fetchLatestDailyFinancialSnapshot();
        if (!latestCash) {
          latestCash = latestDailySnapshot?.cash || (await fetchLatestDailyFinancialCash());
        }
        const latestAr = Number(latestDailySnapshot?.ar || 0);
        const latestAp = Number(latestDailySnapshot?.ap || 0);
        const latestInventory = Number(latestDailySnapshot?.inventory || 0);
        const latestLocBalance = Number(latestDailySnapshot?.loc || 0);
        const latestArSnapshot = Array.isArray(arResult?.data?.records) ? arResult?.data?.records?.[0] : null;
        const latestApSnapshot = Array.isArray(apResult?.data?.records) ? apResult?.data?.records?.[0] : null;
        const derivedArBuckets = mapSnapshotToBuckets(latestArSnapshot, latestAr);
        const derivedApBuckets = mapSnapshotToBuckets(latestApSnapshot, latestAp);

        const inventoryHistory = await fetchHistoryForType('inventory', ['monthly', 'weekly', 'daily']);
        const productHistory = inventoryHistory
          ? await fetchHistoryForType('products', [inventoryHistory.frequency, 'monthly', 'weekly', 'daily'])
          : await fetchHistoryForType('products', ['monthly', 'weekly', 'daily']);

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
        const productMarginHistory = await fetchHistoryForType('products', ['weekly', 'monthly', 'daily']);
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

        const dailyFinancialResponse = await fetch(buildUrl('daily-financials', 'daily', 140));
        let avgWeeklyOpex = DEFAULT_WEEKLY_DRIVER.opex;
        let inventoryToSalesRatio = DEFAULT_FLOW_PROFILE.inventoryToSalesRatio;
        let arRunoffRate = DEFAULT_FLOW_PROFILE.arRunoffRate;
        let apRunoffRate = DEFAULT_FLOW_PROFILE.apRunoffRate;
        if (dailyFinancialResponse.ok) {
          const dailyFinancial = await dailyFinancialResponse.json();
          if (Array.isArray(dailyFinancial?.records) && dailyFinancial.records.length > 0) {
            const weekly = new Map<string, { revenue: number; expense: number; ar: number; ap: number; latestTs: number }>();
            const inventoryRatioSamples: number[] = [];
            for (const row of dailyFinancial.records) {
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
        }

        if (!cancelled) {
          const derivedStartingBalances = {
            cash: latestCash,
            ar: latestAr,
            ap: latestAp,
            inventory: latestInventory,
            loc: Math.max(0, Math.round(latestLocBalance)),
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
          let revenueMonthlyBase: number[] = [];
          let opexMonthlyBase: number[] = [];
          let marginMonthlyBase: number[] = [];
          try {
            const rawBase = localStorage.getItem(`financialForecastRevenueMonthlyBase_${selectedCompanyId}`);
            const parsedBase = rawBase ? JSON.parse(rawBase) : null;
            revenueMonthlyBase = Array.isArray(parsedBase?.monthTotals)
              ? parsedBase.monthTotals.map((value: unknown) => Number(value) || 0)
              : [];
            opexMonthlyBase = Array.isArray(parsedBase?.opexMonthTotals)
              ? parsedBase.opexMonthTotals.map((value: unknown) => Number(value) || 0)
              : [];
            marginMonthlyBase = Array.isArray(parsedBase?.grossMarginMonthPcts)
              ? parsedBase.grossMarginMonthPcts.map((value: unknown) => Number(value) || 0)
              : [];
          } catch {
            revenueMonthlyBase = [];
            opexMonthlyBase = [];
            marginMonthlyBase = [];
          }

          if (savedSettings) {
            const mergedInputs = normalizeInputs(savedSettings.inputs, derivedInputs);
            const resolvedInputs =
              locLoanAmount > 0
                ? { ...mergedInputs, locLimit: locLoanAmount }
                : mergedInputs;
            const mergedAverages = normalizeWeeklyDriver(savedSettings.historicalAverages, resolvedAverages);
            const mergedWeekly = normalizeWeeklyDriverList(savedSettings.weeklyDrivers, mergedAverages);
            const seededSales = applyRevenueMonthlyBaseToWeeklySales(mergedWeekly, revenueMonthlyBase);
            const seededOpex = applyOpexMonthlyBaseToWeeklyOpex(seededSales, opexMonthlyBase);
            const seededWeekly = applyMarginMonthlyBaseToWeeklyMargin(seededOpex, marginMonthlyBase);
            setInputs(resolvedInputs);
            setHistoricalAverages(mergedAverages);
            setWeeklyDrivers(seededWeekly);
            setLastSavedAt(savedSettings.updatedAt ? String(savedSettings.updatedAt) : null);
          } else {
            setInputs(derivedInputs);
            setHistoricalAverages(resolvedAverages);
            const defaults = Array.from({ length: FORECAST_WEEKS }, () => ({ ...resolvedAverages }));
            const seededSales = applyRevenueMonthlyBaseToWeeklySales(defaults, revenueMonthlyBase);
            const seededOpex = applyOpexMonthlyBaseToWeeklyOpex(seededSales, opexMonthlyBase);
            setWeeklyDrivers(applyMarginMonthlyBaseToWeeklyMargin(seededOpex, marginMonthlyBase));
            setLastSavedAt(null);
          }

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
          setStartingArBuckets(DEFAULT_AGING_BUCKETS);
          setStartingApBuckets(DEFAULT_AGING_BUCKETS);
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
  }, [selectedCompanyId]);

  const rows = useMemo<ForecastRow[]>(() => {
    const result: ForecastRow[] = [];
    const weeks = FORECAST_WEEKS;
    const inventoryWeeksOnHand = Math.max(0.25, 52 / Math.max(0.5, inputs.inventoryTurns));
    const historicalInventoryToSales = flowProfile.inventoryToSalesRatio > 0 ? flowProfile.inventoryToSalesRatio : DEFAULT_FLOW_PROFILE.inventoryToSalesRatio;
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
    const arCohorts: Cohort[] = [
      { remaining: Math.max(0, startingArBuckets.current), ageWeeks: 0 },
      { remaining: Math.max(0, startingArBuckets.bucket30to60), ageWeeks: 4 },
      { remaining: Math.max(0, startingArBuckets.bucket60to90), ageWeeks: 8 },
      { remaining: Math.max(0, startingArBuckets.bucket90plus), ageWeeks: 12 },
    ];
    const apCohorts: Cohort[] = [
      { remaining: Math.max(0, startingApBuckets.current), ageWeeks: 0 },
      { remaining: Math.max(0, startingApBuckets.bucket30to60), ageWeeks: 4 },
      { remaining: Math.max(0, startingApBuckets.bucket60to90), ageWeeks: 8 },
      { remaining: Math.max(0, startingApBuckets.bucket90plus), ageWeeks: 12 },
    ];

    const salesByWeek: number[] = Array.from({ length: weeks }, (_, idx) => Math.max(0, weeklyDrivers[idx]?.sales || 0));
    const opexByWeek: number[] = Array.from({ length: weeks }, (_, idx) => Math.max(0, weeklyDrivers[idx]?.opex || 0));
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
      const opex = Math.max(0, safeNumber(opexByWeek[i], 0));
      const turnsTargetInventory = safeNumber(cogs * inventoryWeeksOnHand, 0);
      const historicalTargetInventory = safeNumber(sales * historicalInventoryToSales, 0);
      const targetInventory = (turnsTargetInventory + historicalTargetInventory) / 2;

      const postSalesInventory = Math.max(0, safeNumber(inventory - cogs, 0));
      const purchaseForTarget = Math.max(0, safeNumber(targetInventory - postSalesInventory, 0));
      const purchases = safeNumber(purchaseForTarget, 0);
      arCohorts.push({ remaining: Math.max(0, sales), ageWeeks: 0 });
      apCohorts.push({ remaining: Math.max(0, purchases), ageWeeks: 0 });

      const receipts = processCohorts(
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

      const locInterest = safeNumber(loc * (Math.max(0, inputs.locAprPct) / 100) / 52, 0);
      const baseEndingCash = safeNumber(beginningCash + receipts - apPayments - opex - locInterest, beginningCash);

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
        locInterest,
        locDraw,
        locRepay,
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
  }, [inputs, startingBalances, startingArBuckets, startingApBuckets, weeklyDrivers, flowProfile]);

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

  const updateNumberInput = (key: keyof ForecastInputs, value: string) => {
    const parsed = Number(value);
    setInputs((prev) => ({ ...prev, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  };
  const updateCurrencyInput = (key: keyof ForecastInputs, value: string) => {
    const parsed = parseCurrencyInput(value);
    setInputs((prev) => ({ ...prev, [key]: parsed }));
  };
  const updatePercentInput = (key: keyof ForecastInputs, value: string) => {
    const parsed = parsePercentInput(value);
    setInputs((prev) => ({ ...prev, [key]: parsed }));
  };
  const updateWeeklyCurrencyDriver = (weekIdx: number, key: 'sales' | 'opex', value: string) => {
    const parsed = parseCurrencyInput(value);
    setWeeklyDrivers((prev) =>
      prev.map((week, idx) => (idx === weekIdx ? { ...week, [key]: parsed } : week))
    );
  };
  const updateWeeklyPercentDriver = (weekIdx: number, value: string) => {
    const parsed = Math.max(1, Math.min(99, parsePercentInput(value)));
    setWeeklyDrivers((prev) =>
      prev.map((week, idx) => (idx === weekIdx ? { ...week, grossMarginPct: parsed } : week))
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
          inputs,
          historicalAverages,
          weeklyDrivers,
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

  return (
    <div style={{ padding: '18px 24px 24px' }}>
      <div style={{ ...cardStyle, marginBottom: '14px', borderColor: '#cbd5e1', background: '#f8fafc' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Cash Forecast (12 Weeks)</div>
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
              border: '1px solid #c7d2fe',
              background: isSaving ? '#e2e8f0' : '#667eea',
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '12px', marginBottom: '14px' }}>
        <div style={{ ...cardStyle, marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Inputs (Weeks 1-12)</div>
            {balancesError && <div style={{ fontSize: '12px', color: '#b91c1c' }}>{balancesError}</div>}
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>
            Values are from Income Statement Forecast; user can override and save any field.
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
                      Week {idx + 1}
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
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatPercentInput(week.grossMarginPct)}
                        onChange={(e) => updateWeeklyPercentDriver(idx, e.target.value)}
                        style={compactTableInputStyle}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>Inputs</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>AR Inputs</div>
              <div style={{ fontSize: '11px', color: '#334155', fontWeight: 600, marginBottom: '4px' }}>AR Aging Buckets (% collected next 4 weeks)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>Current</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.arCurrentCollectPct)} onChange={(e) => updatePercentInput('arCurrentCollectPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>30-60</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.ar30To60CollectPct)} onChange={(e) => updatePercentInput('ar30To60CollectPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>60-90</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.ar60To90CollectPct)} onChange={(e) => updatePercentInput('ar60To90CollectPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>90+</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.ar90PlusCollectPct)} onChange={(e) => updatePercentInput('ar90PlusCollectPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#334155', fontWeight: 600, marginBottom: '4px' }}>AR Weekly Distribution Weights</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W1</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.arWeek1WeightPct)} onChange={(e) => updatePercentInput('arWeek1WeightPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W2</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.arWeek2WeightPct)} onChange={(e) => updatePercentInput('arWeek2WeightPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W3</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.arWeek3WeightPct)} onChange={(e) => updatePercentInput('arWeek3WeightPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W4</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.arWeek4WeightPct)} onChange={(e) => updatePercentInput('arWeek4WeightPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Starting AR (Last Imported)</label>
                <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>{formatCurrency(startingBalances.ar)}</div>
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>AP Inputs</div>
              <div style={{ fontSize: '11px', color: '#334155', fontWeight: 600, marginBottom: '4px' }}>AP Aging Buckets (% paid next 4 weeks)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>Current</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.apCurrentPayPct)} onChange={(e) => updatePercentInput('apCurrentPayPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>30-60</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.ap30To60PayPct)} onChange={(e) => updatePercentInput('ap30To60PayPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>60-90</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.ap60To90PayPct)} onChange={(e) => updatePercentInput('ap60To90PayPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>90+</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.ap90PlusPayPct)} onChange={(e) => updatePercentInput('ap90PlusPayPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#334155', fontWeight: 600, marginBottom: '4px' }}>AP Weekly Distribution Weights</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px', marginBottom: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W1</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.apWeek1WeightPct)} onChange={(e) => updatePercentInput('apWeek1WeightPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W2</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.apWeek2WeightPct)} onChange={(e) => updatePercentInput('apWeek2WeightPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W3</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.apWeek3WeightPct)} onChange={(e) => updatePercentInput('apWeek3WeightPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '10px', color: '#475569', marginBottom: '3px' }}>W4</label>
                  <input type="text" inputMode="decimal" value={formatPercentInput(inputs.apWeek4WeightPct)} onChange={(e) => updatePercentInput('apWeek4WeightPct', e.target.value)} style={{ ...inputStyle, padding: '6px 7px', fontSize: '11px' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Starting AP (Last Imported)</label>
                <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>{formatCurrency(startingBalances.ap)}</div>
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px' }}>
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
                <input type="text" inputMode="decimal" value={formatPercentInput(inputs.locAprPct)} onChange={(e) => updatePercentInput('locAprPct', e.target.value)} style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Starting Inventory (Last Imported)</label>
                <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>{formatCurrency(startingBalances.inventory)}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Starting LOC Balance (Last Imported)</label>
                <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>{formatCurrency(startingBalances.loc)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>12-Week Forecast</div>
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
                {[
                  'Week',
                  'Beginning Cash',
                  'Receipts',
                  'AP Payments',
                  'Opex',
                  'LOC Interest',
                  'LOC Draw',
                  'LOC Repay',
                  'Ending Cash',
                  'Ending LOC',
                  'Ending AR',
                  'Ending AP',
                  'Ending Inventory',
                  'Target Inventory',
                ].map((header) => (
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
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.week}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#0f172a', fontWeight: 600 }}>
                    W{row.week}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.beginningCash)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.receipts)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.apPayments)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.opex)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.locInterest)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: row.locDraw > 0 ? '#7c3aed' : '#64748b' }}>{formatCurrency(row.locDraw)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: row.locRepay > 0 ? '#0284c7' : '#64748b' }}>{formatCurrency(row.locRepay)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: row.endingCash < 0 ? '#dc2626' : '#111827', fontWeight: 700 }}>
                    {formatCurrency(row.endingCash)}
                  </td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.endingLoc)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.endingAr)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.endingAp)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.endingInventory)}</td>
                  <td style={{ padding: '8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}>{formatCurrency(row.targetInventory)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
