'use client';

import React, { useMemo, useState } from 'react';
import { getFieldDisplayName } from '@/lib/constants/field-display-names';
import { getTargetFieldOptions } from '@/lib/constants/sector-target-fields';

interface FinancialForecastTabProps {
  selectedCompanyId: string;
  companyName: string;
  industrySectorCategory?: string | null;
  prefetchedMonthlyData?: any[];
}

type ForecastTab = 'inputs' | 'income-statement' | 'graphs';

type QuarterMeta = {
  key: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  label: string;
};

const OPEX_FIELDS: Array<{ key: string; label: string }> = [
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

const LEGACY_COGS_KEYS = ['cogsPayroll', 'cogsOwnerPay', 'cogsContractors', 'cogsMaterials', 'cogsCommissions', 'cogsOther'];
const INCOME_TAX_PCT_KEY = 'incomeTaxesTotal';
const STACKED_BAR_COLORS = [
  '#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
  '#84cc16', '#f97316', '#ec4899', '#0ea5e9', '#22c55e', '#a855f7',
  '#64748b', '#0f766e', '#a16207',
];

function parseMonthDate(row: any): Date | null {
  const dateLike = row?.date ?? row?.monthDate;
  if (dateLike) {
    const parsed = new Date(String(dateLike));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const rawMonth = row?.month;
  if (!rawMonth) return null;
  const monthText = String(rawMonth).trim();

  // Handle common app format "MM/YYYY" reliably across browsers.
  const mmYyyyMatch = monthText.match(/^(\d{1,2})\/(\d{4})$/);
  if (mmYyyyMatch) {
    const monthNum = Number(mmYyyyMatch[1]);
    const yearNum = Number(mmYyyyMatch[2]);
    if (monthNum >= 1 && monthNum <= 12) {
      return new Date(yearNum, monthNum - 1, 1);
    }
  }

  const parsed = new Date(monthText);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getQuarterInfo(date: Date) {
  const month = date.getMonth();
  const quarter = (Math.floor(month / 3) + 1) as 1 | 2 | 3 | 4;
  const year = date.getFullYear();
  return { year, quarter, key: `${year}-Q${quarter}` };
}

function getQuarterEndLabel(year: number, quarter: number): string {
  const monthIndex = quarter * 3 - 1;
  const endDate = new Date(year, monthIndex, 1);
  return endDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function shiftQuarter(year: number, quarter: number, offset: number): { year: number; quarter: 1 | 2 | 3 | 4 } {
  let q = quarter + offset;
  let y = year;
  while (q > 4) {
    q -= 4;
    y += 1;
  }
  while (q < 1) {
    q += 4;
    y -= 1;
  }
  return { year: y, quarter: q as 1 | 2 | 3 | 4 };
}

function annualGrowthToQuarterlyPct(annualPct: number): number {
  const annualFactor = 1 + annualPct / 100;
  if (annualFactor <= 0) return -100;
  return (Math.pow(annualFactor, 1 / 4) - 1) * 100;
}

function quarterlyPctsToAnnualGrowthPct(quarterlyPcts: number[]): number {
  if (!quarterlyPcts.length) return 0;
  const annualFactor = quarterlyPcts.reduce((factor, pct) => factor * (1 + (Number(pct) || 0) / 100), 1);
  return (annualFactor - 1) * 100;
}

export default function FinancialForecastTab({
  selectedCompanyId,
  companyName,
  industrySectorCategory,
  prefetchedMonthlyData,
}: FinancialForecastTabProps) {
  const [activeTab, setActiveTab] = useState<ForecastTab>('inputs');
  const [annualExpanded, setAnnualExpanded] = useState(false);
  const [isSavingInputs, setIsSavingInputs] = useState(false);
  const [isLoadingInputs, setIsLoadingInputs] = useState(false);
  const [isInputsDirty, setIsInputsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isArchivingBudget, setIsArchivingBudget] = useState(false);
  const [lastBudgetArchiveAt, setLastBudgetArchiveAt] = useState<string | null>(null);
  const [incomeStatementExpandLast2Years, setIncomeStatementExpandLast2Years] = useState(false);
  const [annualRevenueDrafts, setAnnualRevenueDrafts] = useState<Record<string, string>>({});
  const monthly = Array.isArray(prefetchedMonthlyData) ? prefetchedMonthlyData : [];
  const sectorFieldOptions = useMemo(
    () => getTargetFieldOptions(industrySectorCategory || undefined),
    [industrySectorCategory],
  );
  const sectorRevenueKeys = useMemo(
    () => new Set<string>((sectorFieldOptions.revenue || []).map((opt) => String(opt.value))),
    [sectorFieldOptions.revenue],
  );
  const sectorCogsKeys = useMemo(() => {
    const keys = new Set<string>((sectorFieldOptions.cogs || []).map((opt) => String(opt.value)));
    // Only fall back to legacy COGS keys when a sector has no explicit COGS definitions.
    if (keys.size === 0) {
      LEGACY_COGS_KEYS.forEach((k) => keys.add(k));
    }
    return keys;
  }, [sectorFieldOptions.cogs]);

  const quarterActuals = useMemo(() => {
    const grouped = new Map<string, any>();
    const addValue = (target: Record<string, number>, field: string, rawValue: unknown) => {
      const value = Number(rawValue) || 0;
      if (value === 0) return;
      target[field] = (Number(target[field]) || 0) + value;
    };

    monthly.forEach((row) => {
      const date = parseMonthDate(row);
      if (!date) return;
      const { year, quarter, key } = getQuarterInfo(date);
      if (!grouped.has(key)) {
        grouped.set(key, {
          year,
          quarter,
          key,
          label: getQuarterEndLabel(year, quarter),
          revenue: 0,
          revenueDetails: {} as Record<string, number>,
          cogsDetails: {} as Record<string, number>,
          opexDetails: {} as Record<string, number>,
          incomeTaxes: 0,
        });
      }
      const bucket = grouped.get(key);
      bucket.revenue += Number(row?.revenue) || 0;

      // Use one source path per row to prevent duplicate counting:
      // 1) breakdown objects if present; 2) flattened/prefixed fields.
      if (row?.revenueBreakdown && typeof row.revenueBreakdown === 'object') {
        Object.entries(row.revenueBreakdown).forEach(([field, rawValue]) => {
          if (!String(field).startsWith('rev_') && !sectorRevenueKeys.has(String(field))) return;
          addValue(bucket.revenueDetails, String(field), rawValue);
        });
      } else {
        Object.entries(row || {}).forEach(([field, rawValue]) => {
          if (field.startsWith('rev_') || sectorRevenueKeys.has(field)) {
            addValue(bucket.revenueDetails, field, rawValue);
          }
        });
      }

      if (row?.cogsBreakdown && typeof row.cogsBreakdown === 'object') {
        Object.entries(row.cogsBreakdown).forEach(([field, rawValue]) => {
          const f = String(field);
          if ((!f.startsWith('cogs_') || f === 'cogs_total') && !sectorCogsKeys.has(f)) return;
          addValue(bucket.cogsDetails, f, rawValue);
        });
      } else {
        Object.entries(row || {}).forEach(([field, rawValue]) => {
          if ((field.startsWith('cogs_') && field !== 'cogs_total') || sectorCogsKeys.has(field)) {
            addValue(bucket.cogsDetails, field, rawValue);
          }
        });
      }

      OPEX_FIELDS.forEach(({ key: field }) => {
        const value = Number(row?.[field]) || 0;
        if (value !== 0) {
          bucket.opexDetails[field] = (Number(bucket.opexDetails[field]) || 0) + value;
        }
      });
      bucket.incomeTaxes += (Number(row?.stateIncomeTaxes) || 0) + (Number(row?.federalIncomeTaxes) || 0);
    });

    return Array.from(grouped.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.quarter - b.quarter;
    });
  }, [monthly, sectorRevenueKeys, sectorCogsKeys]);

  const actualQuarters = useMemo(() => quarterActuals.slice(-3), [quarterActuals]);
  const displayedActualQuarters = useMemo(() => {
    const cols: Array<{
      key: string;
      label: string;
      revenue: number;
      revenueDetails: Record<string, number>;
      cogsDetails: Record<string, number>;
      opexDetails: Record<string, number>;
      incomeTaxes: number;
    }> = [...actualQuarters];
    while (cols.length < 3) {
      cols.unshift({
        key: `placeholder-${cols.length}`,
        label: '-',
        revenue: 0,
        revenueDetails: {},
        cogsDetails: {},
        opexDetails: {},
        incomeTaxes: 0,
      });
    }
    return cols;
  }, [actualQuarters]);
  const latestActualQuarter = useMemo(() => quarterActuals[quarterActuals.length - 1] || null, [quarterActuals]);

  const futureQuarters = useMemo<QuarterMeta[]>(() => {
    const startYear = latestActualQuarter?.year || new Date().getFullYear();
    const startQuarter = latestActualQuarter?.quarter || ((Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4);
    const results: QuarterMeta[] = [];
    for (let i = 1; i <= 20; i++) {
      const shifted = shiftQuarter(startYear, startQuarter, i);
      results.push({
        key: `${shifted.year}-Q${shifted.quarter}`,
        year: shifted.year,
        quarter: shifted.quarter,
        label: getQuarterEndLabel(shifted.year, shifted.quarter),
      });
    }
    return results;
  }, [latestActualQuarter]);
  const currentForecastYear = useMemo(
    () => futureQuarters[0]?.year || new Date().getFullYear(),
    [futureQuarters],
  );
  const quarterlyForecastQuarters = useMemo(
    () => futureQuarters.filter((q) => q.year === currentForecastYear),
    [futureQuarters, currentForecastYear],
  );
  const visibleFutureQuarters = useMemo(
    () => futureQuarters.slice(0, quarterlyForecastQuarters.length + 12),
    [futureQuarters, quarterlyForecastQuarters.length],
  );
  const annualForecastQuarters = useMemo(
    () => visibleFutureQuarters.slice(quarterlyForecastQuarters.length),
    [visibleFutureQuarters, quarterlyForecastQuarters.length],
  );

  const revenueRowKeys = useMemo(() => {
    const keys = new Set<string>((sectorFieldOptions.revenue || []).map((opt) => String(opt.value)));
    quarterActuals.forEach((q) => Object.keys(q.revenueDetails || {}).forEach((k) => keys.add(k)));
    return Array.from(keys).sort((a, b) => getFieldDisplayName(a).localeCompare(getFieldDisplayName(b)));
  }, [quarterActuals, sectorFieldOptions.revenue]);

  const cogsRowKeys = useMemo(() => {
    const sectorKeys = new Set<string>((sectorFieldOptions.cogs || []).map((opt) => String(opt.value)));
    const useSectorDefinedKeys = sectorKeys.size > 0;
    const keys = new Set<string>(useSectorDefinedKeys ? Array.from(sectorKeys) : []);

    quarterActuals.forEach((q) => {
      Object.keys(q.cogsDetails || {}).forEach((k) => {
        if (!useSectorDefinedKeys || sectorKeys.has(k)) {
          keys.add(k);
        }
      });
    });

    if (!useSectorDefinedKeys) {
      LEGACY_COGS_KEYS.forEach((k) => keys.add(k));
    }

    return Array.from(keys).sort((a, b) => getFieldDisplayName(a).localeCompare(getFieldDisplayName(b)));
  }, [quarterActuals, sectorFieldOptions.cogs]);

  const computeDefaultPct = (rowKey: string, source: 'cogs' | 'opex'): number => {
    const last = actualQuarters[actualQuarters.length - 1];
    const revenue = Number(last?.revenue) || 0;
    if (revenue === 0) return 0;
    const raw = source === 'cogs'
      ? Number(last?.cogsDetails?.[rowKey]) || 0
      : Number(last?.opexDetails?.[rowKey]) || 0;
    return (raw / revenue) * 100;
  };
  const computeDefaultIncomeTaxPct = (): number => {
    const last = actualQuarters[actualQuarters.length - 1];
    const revenue = Number(last?.revenue) || 0;
    const totalCogs = Object.values(last?.cogsDetails || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
    const totalOpex = Object.values(last?.opexDetails || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
    const operatingIncome = revenue - totalCogs - totalOpex;
    if (operatingIncome === 0) return 0;
    const incomeTaxes = Number(last?.incomeTaxes) || 0;
    return (incomeTaxes / operatingIncome) * 100;
  };

  const [revenueGrowthByRow, setRevenueGrowthByRow] = useState<Record<string, number[]>>({});
  const [cogsGrowthByRow, setCogsGrowthByRow] = useState<Record<string, number[]>>({});
  const [opexPctByRow, setOpexPctByRow] = useState<Record<string, number[]>>({});

  React.useEffect(() => {
    let isCancelled = false;
    const loadSavedInputs = async () => {
      if (!selectedCompanyId) return;
      setIsLoadingInputs(true);
      try {
        const response = await fetch(`/api/financial-forecast/inputs?companyId=${selectedCompanyId}`);
        const data = await response.json();
        if (!response.ok || isCancelled) return;

        const settings = data?.settings;
        setRevenueGrowthByRow(
          settings?.revenueGrowthByRow && typeof settings.revenueGrowthByRow === 'object'
            ? settings.revenueGrowthByRow
            : {},
        );
        setCogsGrowthByRow(
          settings?.cogsPctByRow && typeof settings.cogsPctByRow === 'object'
            ? settings.cogsPctByRow
            : {},
        );
        setOpexPctByRow(
          settings?.opexPctByRow && typeof settings.opexPctByRow === 'object'
            ? settings.opexPctByRow
            : {},
        );
        setLastSavedAt(settings?.updatedAt ? String(settings.updatedAt) : null);
        setIsInputsDirty(false);
      } catch {
        if (!isCancelled) {
          setLastSavedAt(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingInputs(false);
        }
      }
    };
    loadSavedInputs();
    return () => {
      isCancelled = true;
    };
  }, [selectedCompanyId]);

  React.useEffect(() => {
    let isCancelled = false;
    const loadLatestBudgetArchive = async () => {
      if (!selectedCompanyId) return;
      try {
        const response = await fetch(`/api/financial-forecast/budget-archives?companyId=${selectedCompanyId}`);
        const data = await response.json();
        if (!response.ok || isCancelled) return;
        setLastBudgetArchiveAt(data?.latestArchiveAt ? String(data.latestArchiveAt) : null);
      } catch {
        if (!isCancelled) {
          setLastBudgetArchiveAt(null);
        }
      }
    };
    loadLatestBudgetArchive();
    return () => {
      isCancelled = true;
    };
  }, [selectedCompanyId]);

  React.useEffect(() => {
    if (!visibleFutureQuarters.length) return;
    const len = visibleFutureQuarters.length;
    const normalizeToLength = (arr: unknown, defaultValue: number) => {
      const existing = Array.isArray(arr) ? arr.map((n) => Number(n) || 0) : [];
      const next = existing.slice(0, len);
      while (next.length < len) next.push(defaultValue);
      return next.map((n) => Number(n.toFixed(2)));
    };

    setRevenueGrowthByRow((prev) => {
      const next = { ...prev };
      revenueRowKeys.forEach((key) => {
        next[key] = normalizeToLength(next[key], 0);
      });
      return next;
    });
    setCogsGrowthByRow((prev) => {
      const next = { ...prev };
      cogsRowKeys.forEach((key) => {
        const seed = Number(computeDefaultPct(key, 'cogs').toFixed(2));
        next[key] = normalizeToLength(next[key], seed);
      });
      return next;
    });
    setOpexPctByRow((prev) => {
      const next = { ...prev };
      OPEX_FIELDS.forEach(({ key }) => {
        const seed = Number(computeDefaultPct(key, 'opex').toFixed(2));
        next[key] = normalizeToLength(next[key], seed);
      });
      const incomeTaxSeed = Number(computeDefaultIncomeTaxPct().toFixed(2));
      next[INCOME_TAX_PCT_KEY] = normalizeToLength(next[INCOME_TAX_PCT_KEY], incomeTaxSeed);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenueRowKeys.join('|'), cogsRowKeys.join('|'), visibleFutureQuarters.length, selectedCompanyId]);

  const updateForwardFill = (
    setter: React.Dispatch<React.SetStateAction<Record<string, number[]>>>,
    rowKey: string,
    startIndex: number,
    value: number,
  ) => {
    setIsInputsDirty(true);
    setter((prev) => {
      const current = Array.isArray(prev[rowKey]) ? [...prev[rowKey]] : Array.from({ length: visibleFutureQuarters.length }, () => 0);
      for (let i = startIndex; i < current.length; i++) current[i] = value;
      return { ...prev, [rowKey]: current };
    });
  };

  const handleSaveInputs = async () => {
    if (!selectedCompanyId || isSavingInputs) return;
    setIsSavingInputs(true);
    try {
      const response = await fetch('/api/financial-forecast/inputs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          revenueGrowthByRow,
          cogsPctByRow: cogsGrowthByRow,
          opexPctByRow,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save inputs');
      }
      setLastSavedAt(data?.updatedAt ? String(data.updatedAt) : new Date().toISOString());
      setIsInputsDirty(false);
    } catch (error: any) {
      alert(`Failed to save forecast inputs: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsSavingInputs(false);
    }
  };

  const handleArchiveBudget = async () => {
    if (!selectedCompanyId || isArchivingBudget) return;
    setIsArchivingBudget(true);
    try {
      const label = `Budget Snapshot ${new Date().toLocaleDateString('en-US')}`;
      const response = await fetch('/api/financial-forecast/budget-archives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          label,
          snapshot: {
            companyId: selectedCompanyId,
            companyName,
            createdAt: new Date().toISOString(),
            forecastRows,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to archive budget');
      }
      setLastBudgetArchiveAt(data?.createdAt ? String(data.createdAt) : new Date().toISOString());
    } catch (error: any) {
      alert(`Failed to archive budget: ${error?.message || 'Unknown error'}`);
    } finally {
      setIsArchivingBudget(false);
    }
  };

  const annualYearColumns = useMemo(() => {
    const start = quarterlyForecastQuarters.length;
    const years = Array.from(new Set(annualForecastQuarters.map((q) => q.year))).slice(0, 3);
    return years.map((year, idx) => ({ year, startIndex: start + idx * 4 }));
  }, [annualForecastQuarters, quarterlyForecastQuarters.length]);

  const forecastRows = useMemo(() => {
    if (!latestActualQuarter) return [];
    const revenueCarry: Record<string, number> = {};
    revenueRowKeys.forEach((k) => {
      revenueCarry[k] = Number(latestActualQuarter?.revenueDetails?.[k]) || 0;
    });

    return visibleFutureQuarters.map((q, idx) => {
      const revenueDetails: Record<string, number> = {};
      revenueRowKeys.forEach((k) => {
        const growthPct = Number(revenueGrowthByRow[k]?.[idx]) || 0;
        const nextVal = revenueCarry[k] * (1 + growthPct / 100);
        revenueCarry[k] = nextVal;
        revenueDetails[k] = nextVal;
      });
      const totalRevenue = Object.values(revenueDetails).reduce((sum, v) => sum + v, 0);

      const cogsDetails: Record<string, number> = {};
      cogsRowKeys.forEach((k) => {
        const pct = Number(cogsGrowthByRow[k]?.[idx]) || 0;
        cogsDetails[k] = totalRevenue * (pct / 100);
      });
      const totalCogs = Object.values(cogsDetails).reduce((sum, v) => sum + v, 0);

      const opexDetails: Record<string, number> = {};
      OPEX_FIELDS.forEach(({ key }) => {
        const pct = Number(opexPctByRow[key]?.[idx]) || 0;
        opexDetails[key] = totalRevenue * (pct / 100);
      });
      const totalOpex = Object.values(opexDetails).reduce((sum, v) => sum + v, 0);
      const grossProfit = totalRevenue - totalCogs;
      const operatingIncome = grossProfit - totalOpex;
      const incomeTaxPct = Number(opexPctByRow[INCOME_TAX_PCT_KEY]?.[idx]) || 0;
      const taxableIncome = Math.max(operatingIncome, 0);
      const totalIncomeTaxes = taxableIncome * (incomeTaxPct / 100);
      const netIncome = operatingIncome - totalIncomeTaxes;

      return {
        ...q,
        revenueDetails,
        cogsDetails,
        opexDetails,
        incomeTaxPct,
        totalIncomeTaxes,
        totalRevenue,
        totalCogs,
        grossProfit,
        totalOpex,
        operatingIncome,
        netIncome,
      };
    });
  }, [visibleFutureQuarters, latestActualQuarter, revenueRowKeys, revenueGrowthByRow, cogsRowKeys, cogsGrowthByRow, opexPctByRow]);

  const latestMonthLabel = useMemo(() => {
    const last = monthly[monthly.length - 1];
    const raw = last?.month || last?.date || '';
    if (!raw) return 'N/A';
    const parsed = new Date(String(raw));
    if (Number.isNaN(parsed.getTime())) return String(raw);
    return parsed.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }, [monthly]);

  const incomeStatementColumns = useMemo(() => {
    const base = forecastRows.map((row, idx) => ({
      key: row.key,
      label: row.label,
      rowIndices: [idx],
      isAnnual: false,
      year: row.year,
    }));
    if (incomeStatementExpandLast2Years || forecastRows.length === 0) return base;

    const years = Array.from(new Set(forecastRows.map((r) => r.year))).sort((a, b) => a - b);
    const lastTwoYears = new Set(years.slice(-2));
    if (!lastTwoYears.size) return base;

    const yearToIndices = new Map<number, number[]>();
    forecastRows.forEach((row, idx) => {
      if (!yearToIndices.has(row.year)) yearToIndices.set(row.year, []);
      yearToIndices.get(row.year)!.push(idx);
    });

    const collapsed: Array<{ key: string; label: string; rowIndices: number[]; isAnnual: boolean; year: number }> = [];
    const addedYears = new Set<number>();
    forecastRows.forEach((row, idx) => {
      if (!lastTwoYears.has(row.year)) {
        collapsed.push({
          key: row.key,
          label: row.label,
          rowIndices: [idx],
          isAnnual: false,
          year: row.year,
        });
        return;
      }
      if (addedYears.has(row.year)) return;
      addedYears.add(row.year);
      collapsed.push({
        key: `yr-${row.year}`,
        label: String(row.year),
        rowIndices: yearToIndices.get(row.year) || [idx],
        isAnnual: true,
        year: row.year,
      });
    });

    return collapsed;
  }, [forecastRows, incomeStatementExpandLast2Years]);

  const revenueGraphPoints = useMemo(() => {
    const actual = actualQuarters.slice(-3).map((q) => ({
      label: q.label,
      values: revenueRowKeys.map((key) => Number(q.revenueDetails?.[key]) || 0),
      isActual: true,
    }));
    const forecast = forecastRows.slice(0, 12).map((row) => ({
      label: row.label,
      values: revenueRowKeys.map((key) => Number(row.revenueDetails?.[key]) || 0),
      isActual: false,
    }));
    return [...actual, ...forecast].map((p) => ({
      ...p,
      total: p.values.reduce((sum, v) => sum + v, 0),
    }));
  }, [actualQuarters, forecastRows, revenueRowKeys]);

  const cogsGraphPoints = useMemo(() => {
    const actual = actualQuarters.slice(-3).map((q) => ({
      label: q.label,
      values: cogsRowKeys.map((key) => Number(q.cogsDetails?.[key]) || 0),
      isActual: true,
    }));
    const forecast = forecastRows.slice(0, 12).map((row) => ({
      label: row.label,
      values: cogsRowKeys.map((key) => Number(row.cogsDetails?.[key]) || 0),
      isActual: false,
    }));
    return [...actual, ...forecast].map((p) => ({
      ...p,
      total: p.values.reduce((sum, v) => sum + v, 0),
    }));
  }, [actualQuarters, forecastRows, cogsRowKeys]);

  const totalsLineGraphPoints = useMemo(() => {
    const actual = actualQuarters.slice(-3).map((q) => {
      const totalRevenue = Number(q.revenue) || 0;
      const totalCogs = Object.values(q.cogsDetails || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
      const totalOpex = Object.values(q.opexDetails || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
        const grossProfit = totalRevenue - totalCogs;
      return {
        label: q.label,
        isActual: true,
        totalRevenue,
        totalCogs,
          grossProfit,
        totalOpex,
      };
    });
    const forecast = forecastRows.slice(0, 12).map((row) => ({
      label: row.label,
      isActual: false,
      totalRevenue: Number(row.totalRevenue) || 0,
      totalCogs: Number(row.totalCogs) || 0,
        grossProfit: Number(row.grossProfit) || 0,
      totalOpex: Number(row.totalOpex) || 0,
    }));
    return [...actual, ...forecast];
  }, [actualQuarters, forecastRows]);

  const renderStackedBarChart = (
    title: string,
    rowKeys: string[],
    points: Array<{ label: string; values: number[]; total: number; isActual: boolean }>,
  ) => {
    if (!points.length || !rowKeys.length) {
      return (
        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>{title}</h4>
          <div style={{ fontSize: '13px', color: '#64748b' }}>No data available.</div>
        </div>
      );
    }

    const width = 760;
    const height = 340;
    const padding = { top: 20, right: 12, bottom: 70, left: 58 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxTotal = Math.max(1, ...points.map((p) => p.total));
    const yMax = maxTotal * 1.1;
    const yRange = Math.max(1, yMax);
    const barSlot = chartWidth / points.length;
    const barWidth = Math.max(8, barSlot * 0.72);
    const colorByKey = new Map<string, string>(rowKeys.map((k, idx) => [k, STACKED_BAR_COLORS[idx % STACKED_BAR_COLORS.length]]));
    const yTicks = Array.from({ length: 5 }, (_, i) => (yMax * i) / 4);

    return (
      <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#1e293b', fontSize: '15px', fontWeight: 700 }}>{title}</h4>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto' }}>
          {yTicks.map((tick, idx) => {
            const y = padding.top + chartHeight - (tick / yRange) * chartHeight;
            return (
              <g key={`yt-${idx}`}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                  ${(tick / 1000).toFixed(0)}K
                </text>
              </g>
            );
          })}
          <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
          <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
          {points.map((point, pointIdx) => {
            const x = padding.left + pointIdx * barSlot + (barSlot - barWidth) / 2;
            let cumulative = 0;
            return (
              <g key={`bar-${point.label}-${pointIdx}`}>
                {point.isActual && (
                  <rect
                    x={x - 2}
                    y={padding.top}
                    width={barWidth + 4}
                    height={chartHeight}
                    fill="#e2e8f0"
                    opacity={0.22}
                  />
                )}
                {point.values.map((segmentValue, segIdx) => {
                  if (segmentValue <= 0) return null;
                  const segHeight = (segmentValue / yRange) * chartHeight;
                  const y = padding.top + chartHeight - ((cumulative + segmentValue) / yRange) * chartHeight;
                  cumulative += segmentValue;
                  const rowKey = rowKeys[segIdx];
                  const fill = colorByKey.get(rowKey) || '#94a3b8';
                  return (
                    <rect key={`seg-${pointIdx}-${rowKey}`} x={x} y={y} width={barWidth} height={segHeight} fill={fill}>
                      <title>{`${point.label} • ${getFieldDisplayName(rowKey)}: $${segmentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}</title>
                    </rect>
                  );
                })}
              </g>
            );
          })}
          {points.map((point, idx) => {
            const x = padding.left + idx * barSlot + barSlot / 2;
            const show = idx === 0 || idx === points.length - 1 || idx % 2 === 0;
            if (!show) return null;
            return (
              <text key={`xl-${point.label}-${idx}`} x={x} y={height - padding.bottom + 18} textAnchor="middle" fontSize="11" fill="#64748b">
                {point.label}
              </text>
            );
          })}
          {points.length > 3 && (
            <line
              x1={padding.left + 3 * barSlot}
              y1={padding.top}
              x2={padding.left + 3 * barSlot}
              y2={height - padding.bottom}
              stroke="#94a3b8"
              strokeDasharray="4,4"
              strokeWidth="1"
            />
          )}
        </svg>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
          Shaded bars = actual quarters (3), then forecast quarters (12).
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 12px', marginTop: '10px' }}>
          {rowKeys.map((rowKey) => (
            <div key={`lg-${title}-${rowKey}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#334155' }}>
              <span style={{ width: '10px', height: '10px', background: colorByKey.get(rowKey), borderRadius: '2px', display: 'inline-block' }} />
              <span>{getFieldDisplayName(rowKey)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderTotalsLineChart = (
    title: string,
    points: Array<{
      label: string;
      isActual: boolean;
      totalRevenue: number;
      totalCogs: number;
      grossProfit: number;
      totalOpex: number;
    }>,
  ) => {
    if (!points.length) {
      return (
        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>{title}</h4>
          <div style={{ fontSize: '13px', color: '#64748b' }}>No data available.</div>
        </div>
      );
    }

    const series = [
      { key: 'totalRevenue', label: 'Total Revenue', color: '#2563eb' },
      { key: 'totalCogs', label: 'Total COGS', color: '#f59e0b' },
      { key: 'grossProfit', label: 'Gross Profit', color: '#16a34a' },
      { key: 'totalOpex', label: 'Total Operating Expenses', color: '#8b5cf6' },
    ] as const;

    const width = 760;
    const height = 360;
    const padding = { top: 20, right: 18, bottom: 70, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const allValues = points.flatMap((p) => [p.totalRevenue, p.totalCogs, p.grossProfit, p.totalOpex]);
    const minValue = Math.min(0, ...allValues);
    const maxValue = Math.max(1, ...allValues);
    const yPad = Math.max((maxValue - minValue) * 0.08, 1);
    const yMin = minValue - yPad;
    const yMax = maxValue + yPad;
    const yRange = Math.max(1, yMax - yMin);
    const xCount = Math.max(points.length, 1);

    const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yRange * i) / 4);
    const toX = (idx: number) => padding.left + (xCount <= 1 ? 0 : (idx / (xCount - 1)) * chartWidth);
    const toY = (val: number) => padding.top + chartHeight - ((val - yMin) / yRange) * chartHeight;

    return (
      <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#1e293b', fontSize: '15px', fontWeight: 700 }}>{title}</h4>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto' }}>
          {yTicks.map((tick, idx) => {
            const y = toY(tick);
            return (
              <g key={`yt-line-${idx}`}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#64748b">
                  ${(tick / 1000).toFixed(0)}K
                </text>
              </g>
            );
          })}
          <line x1={padding.left} y1={toY(0)} x2={width - padding.right} y2={toY(0)} stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3,3" />
          <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
          <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
          {points.map((p, idx) => {
            if (!p.isActual) return null;
            const x = toX(idx);
            const slotWidth = chartWidth / xCount;
            return (
              <rect
                key={`actual-bg-${p.label}-${idx}`}
                x={x - slotWidth / 2}
                y={padding.top}
                width={slotWidth}
                height={chartHeight}
                fill="#e2e8f0"
                opacity={0.16}
              />
            );
          })}
          {series.map((s) => {
            const path = points
              .map((p, idx) => {
                const x = toX(idx);
                const y = toY(Number(p[s.key]) || 0);
                return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`;
              })
              .join(' ');
            return (
              <g key={`line-${s.key}`}>
                <path d={path} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                {points.map((p, idx) => (
                  <circle key={`pt-${s.key}-${idx}`} cx={toX(idx)} cy={toY(Number(p[s.key]) || 0)} r={3.2} fill={s.color}>
                    <title>{`${p.label} • ${s.label}: $${(Number(p[s.key]) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
          {points.map((p, idx) => {
            const show = idx === 0 || idx === points.length - 1 || idx % 2 === 0;
            if (!show) return null;
            return (
              <text key={`xl-line-${p.label}-${idx}`} x={toX(idx)} y={height - padding.bottom + 18} textAnchor="middle" fontSize="11" fill="#64748b">
                {p.label}
              </text>
            );
          })}
          {points.length > 3 && (
            <line
              x1={toX(2) + (toX(3) - toX(2)) / 2}
              y1={padding.top}
              x2={toX(2) + (toX(3) - toX(2)) / 2}
              y2={height - padding.bottom}
              stroke="#94a3b8"
              strokeDasharray="4,4"
              strokeWidth="1"
            />
          )}
        </svg>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
          Shaded background = actual quarters (3), then projected quarters (12).
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginTop: '10px' }}>
          {series.map((s) => (
            <div key={`lg-line-${s.key}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#334155' }}>
              <span style={{ width: '12px', height: '3px', background: s.color, borderRadius: '2px', display: 'inline-block' }} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };


  const tabButtonStyle = (tab: ForecastTab): React.CSSProperties => ({
    padding: '10px 16px',
    borderRadius: '8px',
    border: activeTab === tab ? '2px solid #1f70c1' : '1px solid #cbd5e1',
    background: activeTab === tab ? '#e0f2fe' : '#ffffff',
    color: activeTab === tab ? '#0c4a6e' : '#334155',
    fontWeight: 600,
    cursor: 'pointer',
  });

  return (
    <div style={{ maxWidth: '2200px', margin: '0 auto', padding: '24px' }}>
      <style>{`
        .forecast-grid {
          font-size: 12px;
          table-layout: fixed;
        }
        .forecast-grid th,
        .forecast-grid td {
          padding: 6px 8px !important;
          line-height: 1.2;
        }
        .forecast-grid th:first-child,
        .forecast-grid td:first-child {
          white-space: nowrap;
        }
        .forecast-income-table th:first-child,
        .forecast-income-table td:first-child {
          min-width: 210px;
          width: 210px;
          max-width: 210px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .forecast-grid .name-col {
          width: 180px;
          max-width: 180px;
          min-width: 180px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .forecast-grid .period-col {
          width: 84px;
          min-width: 84px;
          max-width: 84px;
        }
        .forecast-grid input {
          width: 64px !important;
          padding: 3px 4px !important;
          font-size: 12px !important;
          line-height: 1.1 !important;
        }
        .forecast-grid input[type="number"]::-webkit-outer-spin-button,
        .forecast-grid input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .forecast-grid input[type="number"] {
          -moz-appearance: textfield;
          appearance: textfield;
        }
      `}</style>
      <div style={{ marginBottom: '6px' }} />

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button style={tabButtonStyle('inputs')} onClick={() => setActiveTab('inputs')}>Inputs</button>
        <button style={tabButtonStyle('income-statement')} onClick={() => setActiveTab('income-statement')}>Income Statement Forecast</button>
        <button style={tabButtonStyle('graphs')} onClick={() => setActiveTab('graphs')}>Graphs</button>
      </div>

      {activeTab === 'inputs' && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: '#0f172a' }}>Forecast Inputs</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                {isLoadingInputs
                  ? 'Loading saved inputs...'
                  : lastSavedAt
                    ? `Last saved ${new Date(lastSavedAt).toLocaleString()}`
                    : 'Not saved yet'}
              </div>
              <button
                onClick={handleSaveInputs}
                disabled={isSavingInputs || isLoadingInputs || !isInputsDirty}
                style={{
                  border: '1px solid #cbd5e1',
                  background: isSavingInputs ? '#f1f5f9' : '#ffffff',
                  color: '#0f172a',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isSavingInputs || isLoadingInputs || !isInputsDirty ? 'not-allowed' : 'pointer',
                  opacity: isSavingInputs || isLoadingInputs || !isInputsDirty ? 0.7 : 1,
                }}
              >
                {isSavingInputs ? 'Saving...' : isInputsDirty ? 'Save Inputs' : 'Saved'}
              </button>
              <button
                onClick={() => setAnnualExpanded((prev) => !prev)}
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {annualExpanded ? 'Collapse Annual to Years' : 'Expand Annual to Quarters'}
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table className="forecast-grid" style={{ width: 'max-content', minWidth: '1280px', borderCollapse: 'collapse', fontSize: '12px' }}>
              <colgroup>
                <col className="name-col" />
                {Array.from({ length: 3 + quarterlyForecastQuarters.length + (annualExpanded ? annualForecastQuarters.length : annualYearColumns.length) }).map((_, idx) => (
                  <col key={`rev-col-${idx}`} className="period-col" />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Revenue</th>
                  <th colSpan={3} style={{ borderBottom: '1px solid #e2e8f0' }}>Actual (Last 3 Quarters)</th>
                  <th colSpan={quarterlyForecastQuarters.length} style={{ borderBottom: '1px solid #e2e8f0' }}>Forecast Quarterly (% Growth)</th>
                  <th colSpan={annualExpanded ? annualForecastQuarters.length : annualYearColumns.length} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    Annual Forecast
                  </th>
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Account</th>
                  {displayedActualQuarters.map((q) => (
                    <th key={`act-${q.key}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{q.label}</th>
                  ))}
                  {quarterlyForecastQuarters.map((q) => (
                    <th key={`f-${q.key}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{q.label}</th>
                  ))}
                  {annualExpanded
                    ? annualForecastQuarters.map((q) => (
                        <th key={`aq-${q.key}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{q.label}</th>
                      ))
                    : annualYearColumns.map((y) => (
                        <th key={`y-${y.year}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{y.year}</th>
                      ))}
                </tr>
              </thead>
              <tbody>
                {revenueRowKeys.map((rowKey) => (
                  <tr key={rowKey}>
                    <td className="name-col" style={{ borderBottom: '1px solid #f1f5f9', color: '#334155' }}>{getFieldDisplayName(rowKey)}</td>
                    {displayedActualQuarters.map((q) => (
                      <td key={`${rowKey}-a-${q.key}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                        ${(Number(q.revenueDetails?.[rowKey]) || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    ))}
                    {quarterlyForecastQuarters.map((q, idx) => (
                      <td key={`${rowKey}-f-${q.key}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={(Number(revenueGrowthByRow[rowKey]?.[idx]) || 0).toFixed(1)}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            if (!/^-?\d*\.?\d*$/.test(raw)) return;
                            if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
                            updateForwardFill(setRevenueGrowthByRow, rowKey, idx, Number((Number(raw) || 0).toFixed(1)));
                          }}
                          style={{ width: '62px', textAlign: 'right', padding: '4px' }}
                        />%
                      </td>
                    ))}
                    {annualExpanded
                      ? annualForecastQuarters.map((q, idx) => (
                          <td key={`${rowKey}-aq-${q.key}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={(Number(revenueGrowthByRow[rowKey]?.[idx + quarterlyForecastQuarters.length]) || 0).toFixed(1)}
                              onChange={(e) => {
                                const raw = e.target.value.trim();
                                if (!/^-?\d*\.?\d*$/.test(raw)) return;
                                if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
                                updateForwardFill(setRevenueGrowthByRow, rowKey, idx + quarterlyForecastQuarters.length, Number((Number(raw) || 0).toFixed(1)));
                              }}
                              style={{ width: '62px', textAlign: 'right', padding: '4px' }}
                            />%
                          </td>
                        ))
                      : annualYearColumns.map((yearCol) => {
                          const values = (revenueGrowthByRow[rowKey] || []).slice(yearCol.startIndex, yearCol.startIndex + 4);
                          const annualGrowthPct = quarterlyPctsToAnnualGrowthPct(values);
                          const draftKey = `${rowKey}-${yearCol.year}`;
                          const isDrafting = Object.prototype.hasOwnProperty.call(annualRevenueDrafts, draftKey);
                          const displayValue = isDrafting
                            ? annualRevenueDrafts[draftKey]
                            : annualGrowthPct.toFixed(1);
                          return (
                            <td key={`${rowKey}-y-${yearCol.year}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={displayValue}
                                onFocus={() => {
                                  setAnnualRevenueDrafts((prev) => ({
                                    ...prev,
                                    [draftKey]: annualGrowthPct.toFixed(1),
                                  }));
                                }}
                                onChange={(e) => {
                                  const raw = e.target.value.trim();
                                  if (!/^-?\d*\.?\d*$/.test(raw)) return;
                                  setAnnualRevenueDrafts((prev) => ({
                                    ...prev,
                                    [draftKey]: raw,
                                  }));
                                }}
                                onBlur={(e) => {
                                  const annualPct = Number(e.target.value) || 0;
                                  const quarterlyPct = Number(annualGrowthToQuarterlyPct(annualPct).toFixed(1));
                                  updateForwardFill(setRevenueGrowthByRow, rowKey, yearCol.startIndex, quarterlyPct);
                                  setAnnualRevenueDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[draftKey];
                                    return next;
                                  });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    (e.currentTarget as HTMLInputElement).blur();
                                  }
                                }}
                                style={{ width: '62px', textAlign: 'right', padding: '4px' }}
                              />%
                            </td>
                          );
                        })}
                  </tr>
                ))}
                <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                  <td style={{ padding: '6px 8px' }}>Total Revenue</td>
                  {displayedActualQuarters.map((q) => (
                    <td key={`tot-rev-a-${q.key}`} style={{ padding: '6px 8px', textAlign: 'right' }}>
                      ${Number(q.revenue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  ))}
                  <td colSpan={quarterlyForecastQuarters.length + (annualExpanded ? annualForecastQuarters.length : annualYearColumns.length)} style={{ padding: '6px 8px' }} />
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ height: '12px' }} />

          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table className="forecast-grid" style={{ width: 'max-content', minWidth: '1280px', borderCollapse: 'collapse', fontSize: '12px' }}>
              <colgroup>
                <col className="name-col" />
                {Array.from({ length: 3 + quarterlyForecastQuarters.length + (annualExpanded ? annualForecastQuarters.length : annualYearColumns.length) }).map((_, idx) => (
                  <col key={`cogs-col-${idx}`} className="period-col" />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>COGS</th>
                  <th colSpan={3} style={{ borderBottom: '1px solid #e2e8f0' }}>Actual (Last 3 Quarters, % of Revenue)</th>
                  <th colSpan={quarterlyForecastQuarters.length} style={{ borderBottom: '1px solid #e2e8f0' }}>Forecast Quarterly (% of Revenue)</th>
                  <th colSpan={annualExpanded ? annualForecastQuarters.length : annualYearColumns.length} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    Annual Forecast
                  </th>
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Account</th>
                  {displayedActualQuarters.map((q) => (
                    <th key={`ca-${q.key}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{q.label}</th>
                  ))}
                  {quarterlyForecastQuarters.map((q) => (
                    <th key={`cf-${q.key}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{q.label}</th>
                  ))}
                  {annualExpanded
                    ? annualForecastQuarters.map((q) => (
                        <th key={`caq-${q.key}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{q.label}</th>
                      ))
                    : annualYearColumns.map((y) => (
                        <th key={`cy-${y.year}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{y.year}</th>
                      ))}
                </tr>
              </thead>
              <tbody>
                {cogsRowKeys.map((rowKey) => (
                  <tr key={rowKey}>
                    <td className="name-col" style={{ borderBottom: '1px solid #f1f5f9', color: '#334155' }}>{getFieldDisplayName(rowKey)}</td>
                    {displayedActualQuarters.map((q) => {
                      const revenue = Number(q.revenue) || 0;
                      const cogsValue = Number(q.cogsDetails?.[rowKey]) || 0;
                      const pct = revenue > 0 ? (cogsValue / revenue) * 100 : 0;
                      return (
                        <td key={`${rowKey}-ca-${q.key}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                          {pct.toFixed(2)}%
                        </td>
                      );
                    })}
                    {quarterlyForecastQuarters.map((q, idx) => (
                      <td key={`${rowKey}-cf-${q.key}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                        <input
                          type="number"
                          value={Number((Number(cogsGrowthByRow[rowKey]?.[idx]) || 0).toFixed(2))}
                          onChange={(e) => updateForwardFill(setCogsGrowthByRow, rowKey, idx, Number((Number(e.target.value) || 0).toFixed(2)))}
                          style={{ width: '62px', textAlign: 'right', padding: '4px' }}
                        />%
                      </td>
                    ))}
                    {annualExpanded
                      ? annualForecastQuarters.map((q, idx) => (
                          <td key={`${rowKey}-caq-${q.key}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                            <input
                              type="number"
                              value={Number((Number(cogsGrowthByRow[rowKey]?.[idx + quarterlyForecastQuarters.length]) || 0).toFixed(2))}
                              onChange={(e) => updateForwardFill(setCogsGrowthByRow, rowKey, idx + quarterlyForecastQuarters.length, Number((Number(e.target.value) || 0).toFixed(2)))}
                              style={{ width: '62px', textAlign: 'right', padding: '4px' }}
                            />%
                          </td>
                        ))
                      : annualYearColumns.map((yearCol) => {
                          const values = (cogsGrowthByRow[rowKey] || []).slice(yearCol.startIndex, yearCol.startIndex + 4);
                          const avg = values.length ? values.reduce((s, v) => s + Number(v || 0), 0) / values.length : 0;
                          return (
                            <td key={`${rowKey}-cy-${yearCol.year}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                              <input
                                type="number"
                                value={Number(avg.toFixed(2))}
                                onChange={(e) => updateForwardFill(setCogsGrowthByRow, rowKey, yearCol.startIndex, Number(e.target.value) || 0)}
                                style={{ width: '62px', textAlign: 'right', padding: '4px' }}
                              />%
                            </td>
                          );
                        })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ height: '12px' }} />

          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table className="forecast-grid" style={{ width: 'max-content', minWidth: '1280px', borderCollapse: 'collapse', fontSize: '12px' }}>
              <colgroup>
                <col className="name-col" />
                {Array.from({ length: 3 + quarterlyForecastQuarters.length + (annualExpanded ? annualForecastQuarters.length : annualYearColumns.length) }).map((_, idx) => (
                  <col key={`opex-col-${idx}`} className="period-col" />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Operating Expenses (% of Revenue)</th>
                  <th colSpan={3} style={{ borderBottom: '1px solid #e2e8f0' }}>Actual (Last 3 Quarters)</th>
                  <th colSpan={quarterlyForecastQuarters.length} style={{ borderBottom: '1px solid #e2e8f0' }}>Forecast Quarterly</th>
                  <th colSpan={annualExpanded ? annualForecastQuarters.length : annualYearColumns.length} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    Annual Forecast
                  </th>
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Account</th>
                  {displayedActualQuarters.map((q) => (
                    <th key={`oa-${q.key}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{q.label}</th>
                  ))}
                  {quarterlyForecastQuarters.map((q) => (
                    <th key={`of-${q.key}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{q.label}</th>
                  ))}
                  {annualExpanded
                    ? annualForecastQuarters.map((q) => (
                        <th key={`oaq-${q.key}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{q.label}</th>
                      ))
                    : annualYearColumns.map((y) => (
                        <th key={`oy-${y.year}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{y.year}</th>
                      ))}
                </tr>
              </thead>
              <tbody>
                {OPEX_FIELDS.map(({ key, label }) => (
                  <tr key={key}>
                    <td className="name-col" style={{ borderBottom: '1px solid #f1f5f9', color: '#334155' }}>{label}</td>
                    {displayedActualQuarters.map((q) => {
                      const pct = q.revenue > 0 ? ((Number(q.opexDetails?.[key]) || 0) / q.revenue) * 100 : 0;
                      return (
                        <td key={`${key}-oa-${q.key}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                          {pct.toFixed(2)}%
                        </td>
                      );
                    })}
                    {quarterlyForecastQuarters.map((q, idx) => (
                      <td key={`${key}-of-${q.key}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                        <input
                          type="number"
                          value={Number(opexPctByRow[key]?.[idx] || 0)}
                          onChange={(e) => updateForwardFill(setOpexPctByRow, key, idx, Number(e.target.value) || 0)}
                          style={{ width: '62px', textAlign: 'right', padding: '4px' }}
                        />%
                      </td>
                    ))}
                    {annualExpanded
                      ? annualForecastQuarters.map((q, idx) => (
                          <td key={`${key}-oaq-${q.key}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                            <input
                              type="number"
                              value={Number(opexPctByRow[key]?.[idx + quarterlyForecastQuarters.length] || 0)}
                              onChange={(e) => updateForwardFill(setOpexPctByRow, key, idx + quarterlyForecastQuarters.length, Number(e.target.value) || 0)}
                              style={{ width: '62px', textAlign: 'right', padding: '4px' }}
                            />%
                          </td>
                        ))
                      : annualYearColumns.map((yearCol) => {
                          const values = (opexPctByRow[key] || []).slice(yearCol.startIndex, yearCol.startIndex + 4);
                          const avg = values.length ? values.reduce((s, v) => s + Number(v || 0), 0) / values.length : 0;
                          return (
                            <td key={`${key}-oy-${yearCol.year}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                              <input
                                type="number"
                                value={Number(avg.toFixed(2))}
                                onChange={(e) => updateForwardFill(setOpexPctByRow, key, yearCol.startIndex, Number(e.target.value) || 0)}
                                style={{ width: '62px', textAlign: 'right', padding: '4px' }}
                              />%
                            </td>
                          );
                        })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ height: '12px' }} />

          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table className="forecast-grid" style={{ width: 'max-content', minWidth: '1280px', borderCollapse: 'collapse', fontSize: '12px' }}>
              <colgroup>
                <col className="name-col" />
                {Array.from({ length: 3 + quarterlyForecastQuarters.length + (annualExpanded ? annualForecastQuarters.length : annualYearColumns.length) }).map((_, idx) => (
                  <col key={`tax-col-${idx}`} className="period-col" />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Income Taxes (Tax Rate on Operating Income)</th>
                  <th colSpan={3} style={{ borderBottom: '1px solid #e2e8f0' }}>Actual (Last 3 Quarters)</th>
                  <th colSpan={quarterlyForecastQuarters.length} style={{ borderBottom: '1px solid #e2e8f0' }}>Forecast Quarterly</th>
                  <th colSpan={annualExpanded ? annualForecastQuarters.length : annualYearColumns.length} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    Annual Forecast
                  </th>
                </tr>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>Account</th>
                  {displayedActualQuarters.map((q) => (
                    <th key={`ta-${q.key}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{q.label}</th>
                  ))}
                  {quarterlyForecastQuarters.map((q) => (
                    <th key={`tf-${q.key}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{q.label}</th>
                  ))}
                  {annualExpanded
                    ? annualForecastQuarters.map((q) => (
                        <th key={`taq-${q.key}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{q.label}</th>
                      ))
                    : annualYearColumns.map((y) => (
                        <th key={`ty-${y.year}`} style={{ borderBottom: '1px solid #e2e8f0' }}>{y.year}</th>
                      ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="name-col" style={{ borderBottom: '1px solid #f1f5f9', color: '#334155' }}>Income Taxes</td>
                  {displayedActualQuarters.map((q) => {
                    const totalCogs = Object.values(q.cogsDetails || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
                    const totalOpex = Object.values(q.opexDetails || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
                    const operatingIncome = (Number(q.revenue) || 0) - totalCogs - totalOpex;
                    const pct = operatingIncome > 0 ? ((Number(q.incomeTaxes) || 0) / operatingIncome) * 100 : 0;
                    return (
                      <td key={`tax-a-${q.key}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                        {pct.toFixed(2)}%
                      </td>
                    );
                  })}
                  {quarterlyForecastQuarters.map((q, idx) => (
                    <td key={`tax-f-${q.key}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                      <input
                        type="number"
                        value={Number(opexPctByRow[INCOME_TAX_PCT_KEY]?.[idx] || 0)}
                        onChange={(e) => updateForwardFill(setOpexPctByRow, INCOME_TAX_PCT_KEY, idx, Number(e.target.value) || 0)}
                        style={{ width: '62px', textAlign: 'right', padding: '4px' }}
                      />%
                    </td>
                  ))}
                  {annualExpanded
                    ? annualForecastQuarters.map((q, idx) => (
                        <td key={`tax-aq-${q.key}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                          <input
                            type="number"
                            value={Number(opexPctByRow[INCOME_TAX_PCT_KEY]?.[idx + quarterlyForecastQuarters.length] || 0)}
                            onChange={(e) => updateForwardFill(setOpexPctByRow, INCOME_TAX_PCT_KEY, idx + quarterlyForecastQuarters.length, Number(e.target.value) || 0)}
                            style={{ width: '62px', textAlign: 'right', padding: '4px' }}
                          />%
                        </td>
                      ))
                    : annualYearColumns.map((yearCol) => {
                        const values = (opexPctByRow[INCOME_TAX_PCT_KEY] || []).slice(yearCol.startIndex, yearCol.startIndex + 4);
                        const avg = values.length ? values.reduce((s, v) => s + Number(v || 0), 0) / values.length : 0;
                        return (
                          <td key={`tax-y-${yearCol.year}`} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                            <input
                              type="number"
                              value={Number(avg.toFixed(2))}
                              onChange={(e) => updateForwardFill(setOpexPctByRow, INCOME_TAX_PCT_KEY, yearCol.startIndex, Number(e.target.value) || 0)}
                              style={{ width: '62px', textAlign: 'right', padding: '4px' }}
                            />%
                          </td>
                        );
                      })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'income-statement' && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: '#0f172a' }}>Income Statement</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setIncomeStatementExpandLast2Years((prev) => !prev)}
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {incomeStatementExpandLast2Years ? 'Collapse Last 2 Years to Years' : 'Expand Last 2 Years to Quarters'}
              </button>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                {lastBudgetArchiveAt ? `Last budget archive ${new Date(lastBudgetArchiveAt).toLocaleString()}` : 'No budget archive yet'}
              </div>
              <button
                onClick={handleArchiveBudget}
                disabled={isArchivingBudget || forecastRows.length === 0}
                style={{
                  border: '1px solid #cbd5e1',
                  background: isArchivingBudget ? '#f1f5f9' : '#ffffff',
                  color: '#0f172a',
                  borderRadius: '8px',
                  padding: '8px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: isArchivingBudget || forecastRows.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: isArchivingBudget || forecastRows.length === 0 ? 0.7 : 1,
                }}
              >
                {isArchivingBudget ? 'Archiving...' : 'Archive Budget'}
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="forecast-grid forecast-income-table" style={{ width: 'max-content', minWidth: '1500px', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>Line Item</th>
                  {incomeStatementColumns.map((col) => (
                    <th key={col.key} style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '8px', fontWeight: 700, background: '#f8fafc' }}>Revenue Detail</td>
                  {incomeStatementColumns.map((col) => (
                    <td key={`rev-detail-hdr-${col.key}`} style={{ padding: '8px', background: '#f8fafc' }} />
                  ))}
                </tr>
                {revenueRowKeys.map((rowKey) => (
                  <tr key={`rev-detail-${rowKey}`}>
                    <td style={{ padding: '8px', color: '#334155' }}>{getFieldDisplayName(rowKey)}</td>
                    {incomeStatementColumns.map((col) => (
                      <td key={`rev-detail-${rowKey}-${col.key}`} style={{ textAlign: 'right', padding: '8px' }}>
                        ${Number(col.rowIndices.reduce((sum, idx) => sum + (Number(forecastRows[idx]?.revenueDetails?.[rowKey]) || 0), 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '8px', fontWeight: 700, background: '#eff6ff' }}>Total Revenue</td>
                  {incomeStatementColumns.map((col) => (
                    <td key={`rev-${col.key}`} style={{ textAlign: 'right', padding: '8px', fontWeight: 700, background: '#eff6ff' }}>
                      ${Number(col.rowIndices.reduce((sum, idx) => sum + (Number(forecastRows[idx]?.totalRevenue) || 0), 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '8px', fontWeight: 700, background: '#f8fafc' }}>COGS Detail</td>
                  {incomeStatementColumns.map((col) => (
                    <td key={`cogs-detail-hdr-${col.key}`} style={{ padding: '8px', background: '#f8fafc' }} />
                  ))}
                </tr>
                {cogsRowKeys.map((rowKey) => (
                  <tr key={`cogs-detail-${rowKey}`}>
                    <td style={{ padding: '8px', color: '#334155' }}>{getFieldDisplayName(rowKey)}</td>
                    {incomeStatementColumns.map((col) => (
                      <td key={`cogs-detail-${rowKey}-${col.key}`} style={{ textAlign: 'right', padding: '8px' }}>
                        ${Number(col.rowIndices.reduce((sum, idx) => sum + (Number(forecastRows[idx]?.cogsDetails?.[rowKey]) || 0), 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '8px', fontWeight: 700, background: '#fef3c7' }}>Total COGS</td>
                  {incomeStatementColumns.map((col) => (
                    <td key={`cogs-${col.key}`} style={{ textAlign: 'right', padding: '8px', fontWeight: 700, background: '#fef3c7' }}>
                      ${Number(col.rowIndices.reduce((sum, idx) => sum + (Number(forecastRows[idx]?.totalCogs) || 0), 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '8px', fontWeight: 700, background: '#dbeafe' }}>Gross Profit</td>
                  {incomeStatementColumns.map((col) => (
                    <td key={`gp-${col.key}`} style={{ textAlign: 'right', padding: '8px', background: '#dbeafe', fontWeight: 700 }}>
                      ${Number(col.rowIndices.reduce((sum, idx) => sum + (Number(forecastRows[idx]?.grossProfit) || 0), 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '8px', fontWeight: 700, background: '#f8fafc' }}>Operating Expense Detail</td>
                  {incomeStatementColumns.map((col) => (
                    <td key={`opex-detail-hdr-${col.key}`} style={{ padding: '8px', background: '#f8fafc' }} />
                  ))}
                </tr>
                {OPEX_FIELDS.map(({ key, label }) => (
                  <tr key={`opex-detail-${key}`}>
                    <td style={{ padding: '8px', color: '#334155' }}>{label}</td>
                    {incomeStatementColumns.map((col) => (
                      <td key={`opex-detail-${key}-${col.key}`} style={{ textAlign: 'right', padding: '8px' }}>
                        ${Number(col.rowIndices.reduce((sum, idx) => sum + (Number(forecastRows[idx]?.opexDetails?.[key]) || 0), 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '8px', fontWeight: 700, background: '#fde68a' }}>Total Operating Expenses</td>
                  {incomeStatementColumns.map((col) => (
                    <td key={`opex-${col.key}`} style={{ textAlign: 'right', padding: '8px', fontWeight: 700, background: '#fde68a' }}>
                      ${Number(col.rowIndices.reduce((sum, idx) => sum + (Number(forecastRows[idx]?.totalOpex) || 0), 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '8px', fontWeight: 700, background: '#dcfce7' }}>Operating Income</td>
                  {incomeStatementColumns.map((col) => (
                    <td key={`oi-${col.key}`} style={{ textAlign: 'right', padding: '8px', background: '#dcfce7', fontWeight: 700 }}>
                      ${Number(col.rowIndices.reduce((sum, idx) => sum + (Number(forecastRows[idx]?.operatingIncome) || 0), 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '8px', fontWeight: 600 }}>Income Taxes</td>
                  {incomeStatementColumns.map((col) => (
                    <td key={`tax-${col.key}`} style={{ textAlign: 'right', padding: '8px' }}>
                      ${Number(col.rowIndices.reduce((sum, idx) => sum + (Number(forecastRows[idx]?.totalIncomeTaxes) || 0), 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '8px', fontWeight: 700, background: '#f1f5f9' }}>Net Income</td>
                  {incomeStatementColumns.map((col) => (
                    <td key={`ni-${col.key}`} style={{ textAlign: 'right', padding: '8px', background: '#f1f5f9', fontWeight: 700 }}>
                      ${Number(col.rowIndices.reduce((sum, idx) => sum + (Number(forecastRows[idx]?.netIncome) || 0), 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'graphs' && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ marginTop: 0, color: '#0f172a' }}>Graphs</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px' }}>
            {renderStackedBarChart('Revenue Detail (3Q Actual + 12Q Forecast)', revenueRowKeys, revenueGraphPoints)}
            {renderStackedBarChart('COGS Detail (3Q Actual + 12Q Forecast)', cogsRowKeys, cogsGraphPoints)}
            {renderTotalsLineChart('Totals Trend (3Q Actual + 12Q Projection)', totalsLineGraphPoints)}
          </div>
        </div>
      )}

    </div>
  );
}

