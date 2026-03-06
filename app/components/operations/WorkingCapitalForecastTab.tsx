'use client';

import React, { useEffect, useMemo, useState } from 'react';

type ForecastInputs = {
  arDays: number;
  apDays: number;
  inventoryTurns: number;
  minCashBuffer: number;
  locLimit: number;
  locAprPct: number;
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
  arDays: 35,
  apDays: 30,
  inventoryTurns: 8,
  minCashBuffer: 25000,
  locLimit: 150000,
  locAprPct: 9,
};
const DEFAULT_WEEKLY_DRIVER: WeeklyDriver = {
  sales: 50000,
  opex: 18000,
  grossMarginPct: 35,
};
const FORECAST_WEEKS = 13;
const DEFAULT_STARTING_BALANCES = { cash: 0, ar: 0, ap: 0, inventory: 0, loc: 0 };
const DEFAULT_FLOW_PROFILE: HistoricalFlowProfile = { arRunoffRate: 0.12, apRunoffRate: 0.12, inventoryToSalesRatio: 0.3 };

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
const safeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const normalizeInputs = (raw: any, fallback: ForecastInputs): ForecastInputs => ({
  arDays: Math.max(0, toRoundedInteger(raw?.arDays, fallback.arDays)),
  apDays: Math.max(0, toRoundedInteger(raw?.apDays, fallback.apDays)),
  inventoryTurns: clampNumber(toRoundedTurns(raw?.inventoryTurns, fallback.inventoryTurns), 0.5, 30),
  minCashBuffer: Math.max(0, toRoundedCurrency(raw?.minCashBuffer, fallback.minCashBuffer)),
  locLimit: Math.max(0, toRoundedCurrency(raw?.locLimit, fallback.locLimit)),
  locAprPct: clampNumber(toRoundedPercent(raw?.locAprPct, fallback.locAprPct), 0, 100),
});

export default function WorkingCapitalForecastTab({ selectedCompanyId }: WorkingCapitalForecastTabProps) {
  const [inputs, setInputs] = useState<ForecastInputs>(DEFAULT_INPUTS);
  const [historicalAverages, setHistoricalAverages] = useState<WeeklyDriver>(DEFAULT_WEEKLY_DRIVER);
  const [weeklyDrivers, setWeeklyDrivers] = useState<WeeklyDriver[]>(
    Array.from({ length: FORECAST_WEEKS }, () => ({ ...DEFAULT_WEEKLY_DRIVER }))
  );
  const [startingBalances, setStartingBalances] = useState<{ cash: number; ar: number; ap: number; inventory: number; loc: number }>(DEFAULT_STARTING_BALANCES);
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

        const [savedSettingsResponse, cashResult, arResult, apResult, inventoryResult] = await Promise.all([
          fetch(`/api/working-capital-forecast/settings?companyId=${encodeURIComponent(selectedCompanyId)}`),
          fetchLatestForType('cash'),
          fetchLatestForType('ar-aging'),
          fetchLatestForType('ap-aging'),
          fetchLatestForType('inventory'),
        ]);
        const savedPayload = savedSettingsResponse.ok ? await savedSettingsResponse.json() : null;
        const savedSettings = savedPayload?.settings || null;

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

        let latestCash = Number(cashResult?.data?.summary?.totalCash || 0);
        if (!latestCash) {
          latestCash = await fetchLatestDailyFinancialCash();
        }
        const latestAr = Number(arResult?.data?.summary?.totalAR || 0);
        const latestAp = Number(apResult?.data?.summary?.totalAP || 0);
        const latestInventory = Number(inventoryResult?.data?.summary?.totalValue || 0);

        const suggestedArDays = Number(arResult?.data?.summary?.dso || 0);
        const suggestedApDays = Number(apResult?.data?.summary?.dpo || 0);

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
        let latestLocBalance = 0;
        let inventoryToSalesRatio = DEFAULT_FLOW_PROFILE.inventoryToSalesRatio;
        let arRunoffRate = Math.max(0.01, Math.min(1, 1 / Math.max(1, Math.round((suggestedArDays || DEFAULT_INPUTS.arDays) / 7))));
        let apRunoffRate = Math.max(0.01, Math.min(1, 1 / Math.max(1, Math.round((suggestedApDays || DEFAULT_INPUTS.apDays) / 7))));
        if (dailyFinancialResponse.ok) {
          const dailyFinancial = await dailyFinancialResponse.json();
          if (Array.isArray(dailyFinancial?.records) && dailyFinancial.records.length > 0) {
            const weekly = new Map<string, { revenue: number; expense: number; ar: number; ap: number; latestTs: number }>();
            const inventoryRatioSamples: number[] = [];
            let newestSnapshotTs = 0;
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
              if (snapshotTs >= newestSnapshotTs) {
                newestSnapshotTs = snapshotTs;
                latestLocBalance = Number(row?.loc || 0);
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
          const derivedInputs: ForecastInputs = {
            ...DEFAULT_INPUTS,
            arDays: suggestedArDays > 0 ? Math.round(suggestedArDays) : DEFAULT_INPUTS.arDays,
            apDays: suggestedApDays > 0 ? Math.round(suggestedApDays) : DEFAULT_INPUTS.apDays,
            inventoryTurns:
              suggestedInventoryTurns > 0
                ? Math.max(0.5, Math.min(30, Math.round(suggestedInventoryTurns * 100) / 100))
                : DEFAULT_INPUTS.inventoryTurns,
            minCashBuffer: DEFAULT_INPUTS.minCashBuffer,
            locLimit: DEFAULT_INPUTS.locLimit,
            locAprPct: DEFAULT_INPUTS.locAprPct,
          };
          const resolvedAverages: WeeklyDriver = {
            sales: Math.max(0, Math.round(avgWeeklySales)),
            opex: Math.max(0, Math.round(avgWeeklyOpex)),
            grossMarginPct: Math.max(1, Math.min(99, Math.round(avgWeeklyGrossMargin * 100) / 100)),
          };

          if (savedSettings) {
            const mergedInputs = normalizeInputs(savedSettings.inputs, derivedInputs);
            const mergedAverages = normalizeWeeklyDriver(savedSettings.historicalAverages, resolvedAverages);
            const mergedWeekly = normalizeWeeklyDriverList(savedSettings.weeklyDrivers, mergedAverages);
            setInputs(mergedInputs);
            setHistoricalAverages(mergedAverages);
            setWeeklyDrivers(mergedWeekly);
            setLastSavedAt(savedSettings.updatedAt ? String(savedSettings.updatedAt) : null);
          } else {
            setInputs(derivedInputs);
            setHistoricalAverages(resolvedAverages);
            setWeeklyDrivers(Array.from({ length: FORECAST_WEEKS }, () => ({ ...resolvedAverages })));
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
    const fallbackArRunoff = Math.max(0.01, Math.min(1, 1 / Math.max(1, Math.round(inputs.arDays / 7))));
    const fallbackApRunoff = Math.max(0.01, Math.min(1, 1 / Math.max(1, Math.round(inputs.apDays / 7))));
    const arRunoffRate = flowProfile.arRunoffRate > 0 ? flowProfile.arRunoffRate : fallbackArRunoff;
    const apRunoffRate = flowProfile.apRunoffRate > 0 ? flowProfile.apRunoffRate : fallbackApRunoff;
    const inventoryWeeksOnHand = Math.max(0.25, 52 / Math.max(0.5, inputs.inventoryTurns));
    const historicalInventoryToSales = flowProfile.inventoryToSalesRatio > 0 ? flowProfile.inventoryToSalesRatio : DEFAULT_FLOW_PROFILE.inventoryToSalesRatio;

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

      // Historical runoff model: collections are a share of opening AR + this week's sales booked on AR.
      const receivablePool = Math.max(0, ar + sales);
      const receipts = Math.min(receivablePool, Math.max(0, safeNumber(receivablePool * arRunoffRate, 0)));

      const postSalesInventory = Math.max(0, safeNumber(inventory - cogs, 0));
      const purchaseForTarget = Math.max(0, safeNumber(targetInventory - postSalesInventory, 0));
      const purchases = safeNumber(purchaseForTarget, 0);
      // Historical runoff model: payments are a share of opening AP + this week's purchases booked to AP.
      const payablePool = Math.max(0, ap + purchases);
      const apPayments = Math.min(payablePool, Math.max(0, safeNumber(payablePool * apRunoffRate, 0)));

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
      const endingAr = Math.max(0, safeNumber(ar + sales - receipts, ar));
      const endingAp = Math.max(0, safeNumber(ap + purchases - apPayments, ap));
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
    }

    return result;
  }, [inputs, startingBalances, weeklyDrivers, flowProfile]);

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
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>Working Capital Forecast (13 Weeks)</div>
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
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Weekly Overrides (1-13)</div>
            {balancesError && <div style={{ fontSize: '12px', color: '#b91c1c' }}>{balancesError}</div>}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', gap: '6px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>AR Collection Days</label>
              <input type="number" value={inputs.arDays} onChange={(e) => updateNumberInput('arDays', e.target.value)} style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>AP Days</label>
              <input type="number" value={inputs.apDays} onChange={(e) => updateNumberInput('apDays', e.target.value)} style={{ ...inputStyle, padding: '7px 8px', fontSize: '12px' }} />
            </div>
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
              <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Starting AR (Last Imported)</label>
              <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>{formatCurrency(startingBalances.ar)}</div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>Starting AP (Last Imported)</label>
              <div style={{ ...inputStyle, background: '#f8fafc', color: '#0f172a', fontWeight: 600, padding: '7px 8px', fontSize: '12px' }}>{formatCurrency(startingBalances.ap)}</div>
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

      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>13-Week Forecast</div>
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
