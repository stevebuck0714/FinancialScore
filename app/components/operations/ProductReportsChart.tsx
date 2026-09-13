'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FORECAST_MONTHS, FORECAST_MONTH_LABELS, type ForecastMonth } from '@/lib/operations/product-revenue-forecast';
import { estMonthIndex, estYear } from '@/lib/time/eastern';

type SeriesKey = 'sgpBaseline' | 'sgpGrowth' | 'sgpStretch' | 'forecastAdj' | 'actual';

type ChartRow = {
  monthKey: string;
  label: string;
  sgpBaseline: number | null;
  sgpGrowth: number | null;
  sgpStretch: number | null;
  forecastAdj: number | null;
  actual: number | null;
};

type MonthlyGoal = { month: number; baseline: number | null; growth: number | null; stretch: number | null };

const SERIES: Array<{ key: SeriesKey; label: string; color: string }> = [
  { key: 'sgpBaseline', label: 'SGP Baseline', color: '#0ea5e9' },
  { key: 'sgpGrowth', label: 'SGP Growth', color: '#f59e0b' },
  { key: 'sgpStretch', label: 'SGP Stretch', color: '#ef4444' },
  { key: 'forecastAdj', label: 'Forecasted Adj.', color: '#7c3aed' },
  { key: 'actual', label: 'Actuals', color: '#16a34a' },
];

const MIN_YEAR = 2018;
const MAX_YEAR = 2035;

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function parseMonthKey(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function monthKeysInRange(start: string, end: string): string[] {
  const from = parseMonthKey(start);
  const to = parseMonthKey(end);
  if (!from || !to) return [];
  const keys: string[] = [];
  let year = from.year;
  let month = from.month;
  // Bounded by the year clamp above, so this cannot run away.
  while (year < to.year || (year === to.year && month <= to.month)) {
    keys.push(monthKey(year, month));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatAxisMoney(value: number): string {
  const numeric = Number(value || 0);
  const abs = Math.abs(numeric);
  if (abs >= 1_000_000) return `$${(numeric / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(numeric / 1_000)}K`;
  return `$${Math.round(numeric)}`;
}

function monthLabel(key: string): string {
  const parsed = parseMonthKey(key);
  if (!parsed) return key;
  return `${FORECAST_MONTH_LABELS[parsed.month as ForecastMonth]} ${parsed.year}`;
}

function goalValue(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

type ProductReportsChartProps = {
  selectedCompanyId: string;
  onOpenInfo?: () => void;
};

export default function ProductReportsChart({ selectedCompanyId, onOpenInfo }: ProductReportsChartProps) {
  const currentYear = estYear();
  const [startMonth, setStartMonth] = useState<string>(() => monthKey(currentYear, 1));
  const [endMonth, setEndMonth] = useState<string>(() => monthKey(currentYear, 12));
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    sgpBaseline: true,
    sgpGrowth: true,
    sgpStretch: true,
    forecastAdj: true,
    actual: true,
  });
  const [rows, setRows] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeMonthKeys = useMemo(() => monthKeysInRange(startMonth, endMonth), [startMonth, endMonth]);
  const years = useMemo(() => {
    const unique = new Set<number>();
    for (const key of rangeMonthKeys) {
      const parsed = parseMonthKey(key);
      if (parsed) unique.add(parsed.year);
    }
    return Array.from(unique).sort((left, right) => left - right);
  }, [rangeMonthKeys]);

  const loadChart = useCallback(async () => {
    if (!selectedCompanyId || years.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const goalParams = new URLSearchParams({
        companyId: selectedCompanyId,
        year: String(years[0]),
        years: years.join(','),
      });
      const [goalsJson, revenueByYear] = await Promise.all([
        fetch(`/api/operational-data/product-goals?${goalParams.toString()}`)
          .then(async (response) => {
            const json = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(json?.error || 'Failed to load SGP goals');
            return json;
          }),
        Promise.all(
          years.map(async (year) => {
            const params = new URLSearchParams({ companyId: selectedCompanyId, year: String(year) });
            const response = await fetch(`/api/operational-data/product-revenue?${params.toString()}`);
            const json = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(json?.error || 'Failed to load monthly revenue');
            return { year, json };
          })
        ),
      ]);

      const goalsByYear = (goalsJson?.monthlyGoalsByYear || {}) as Record<string, MonthlyGoal[]>;
      // A single-year request answers with the flat monthlyRevenueGoals array instead.
      const fallbackGoals = Array.isArray(goalsJson?.monthlyRevenueGoals)
        ? (goalsJson.monthlyRevenueGoals as MonthlyGoal[])
        : [];

      const revenueMonths = new Map<string, { adjusted: number; actual: number }>();
      const actualThroughByYear = new Map<number, number>();
      for (const entry of revenueByYear) {
        const months = (entry.json?.totals?.months || {}) as Record<string, { adjusted?: number; ytd?: number }>;
        for (const month of FORECAST_MONTHS) {
          const bucket = months[String(month)] || {};
          revenueMonths.set(monthKey(entry.year, month), {
            adjusted: Number(bucket.adjusted || 0),
            actual: Number(bucket.ytd || 0),
          });
        }
        // dataThru marks the last month with complete shipped revenue. Without it,
        // fall back to the last completed Eastern month so an in-progress month is
        // not drawn as a collapse in actuals.
        const dataThru = String(entry.json?.dataThru || '').slice(0, 10);
        const parsedThru = /^\d{4}-\d{2}-\d{2}$/.test(dataThru) ? Number(dataThru.slice(5, 7)) : null;
        const thruMonth = parsedThru && dataThru.slice(0, 4) === String(entry.year)
          ? parsedThru
          : entry.year < currentYear
          ? 12
          : entry.year > currentYear
          ? 0
          : estMonthIndex();
        actualThroughByYear.set(entry.year, thruMonth);
      }

      const nextRows: ChartRow[] = rangeMonthKeys.map((key) => {
        const parsed = parseMonthKey(key);
        const year = parsed?.year ?? 0;
        const month = parsed?.month ?? 0;
        const goalRows = goalsByYear[String(year)] || (years.length === 1 ? fallbackGoals : []);
        const goal = goalRows.find((row) => Number(row?.month) === month) || null;
        const revenue = revenueMonths.get(key) || null;
        const actualThrough = actualThroughByYear.get(year) ?? 0;
        return {
          monthKey: key,
          label: monthLabel(key),
          sgpBaseline: goalValue(goal?.baseline),
          sgpGrowth: goalValue(goal?.growth),
          sgpStretch: goalValue(goal?.stretch),
          forecastAdj: revenue ? revenue.adjusted : null,
          actual: revenue && month <= actualThrough ? revenue.actual : null,
        };
      });
      setRows(nextRows);
    } catch (err: any) {
      setError(err?.message || 'Failed to load report data');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, years, rangeMonthKeys, currentYear]);

  useEffect(() => {
    void loadChart();
  }, [loadChart]);

  const toggleSeries = (key: SeriesKey) => {
    setVisible((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const rangeIsValid = rangeMonthKeys.length > 0;
  const hasAnyValue = rows.some((row) =>
    SERIES.some(({ key }) => row[key] != null && Number(row[key]) !== 0)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
            SGP Goals vs Forecast and Actuals
          </h3>
          <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
            Monthly revenue in dollars. SGP Baseline, Growth, and Stretch come from the Goal Update monthly goals.
            Forecasted Adj. and Actuals come from Monthly Revenue for each year in the range.
          </div>
        </div>
        {onOpenInfo ? (
          <button
            type="button"
            onClick={onOpenInfo}
            style={{
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 12,
              fontWeight: 700,
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            How this works
          </button>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }} htmlFor="product-reports-start">
          From
        </label>
        <input
          id="product-reports-start"
          type="month"
          value={startMonth}
          min={monthKey(MIN_YEAR, 1)}
          max={monthKey(MAX_YEAR, 12)}
          onChange={(event) => setStartMonth(event.target.value)}
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            padding: '6px 9px',
            fontSize: 12,
            color: '#0f172a',
            background: '#ffffff',
          }}
        />
        <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }} htmlFor="product-reports-end">
          To
        </label>
        <input
          id="product-reports-end"
          type="month"
          value={endMonth}
          min={startMonth}
          max={monthKey(MAX_YEAR, 12)}
          onChange={(event) => setEndMonth(event.target.value)}
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            padding: '6px 9px',
            fontSize: 12,
            color: '#0f172a',
            background: '#ffffff',
          }}
        />
        <button
          type="button"
          onClick={() => {
            setStartMonth(monthKey(currentYear, 1));
            setEndMonth(monthKey(currentYear, 12));
          }}
          style={{
            border: '1px solid #cbd5e1',
            background: '#f1f5f9',
            borderRadius: 999,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            color: '#475569',
            cursor: 'pointer',
          }}
        >
          This Year
        </button>
        <button
          type="button"
          onClick={() => void loadChart()}
          disabled={loading}
          style={{
            border: '1px solid #cbd5e1',
            background: '#ffffff',
            borderRadius: 999,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: 700,
            color: '#334155',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {SERIES.map((series) => {
          const isOn = visible[series.key];
          return (
            <button
              key={series.key}
              type="button"
              onClick={() => toggleSeries(series.key)}
              aria-pressed={isOn}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                border: `1px solid ${isOn ? series.color : '#cbd5e1'}`,
                background: isOn ? '#ffffff' : '#f8fafc',
                borderRadius: 999,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                color: isOn ? '#0f172a' : '#94a3b8',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 3,
                  borderRadius: 2,
                  background: isOn ? series.color : '#cbd5e1',
                }}
              />
              {series.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div
          style={{
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#b91c1c',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      ) : null}

      {!rangeIsValid ? (
        <div style={{ padding: '28px 0', color: '#64748b', fontSize: 13 }}>
          Choose a From month that is not after the To month.
        </div>
      ) : loading ? (
        <div style={{ padding: '28px 0', color: '#64748b', fontSize: 13 }}>Loading monthly report…</div>
      ) : rows.length === 0 || !hasAnyValue ? (
        <div style={{ padding: '28px 0', color: '#64748b', fontSize: 13 }}>
          No monthly revenue or SGP goals found for this range.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={420}>
          <LineChart data={rows} margin={{ top: 12, right: 24, left: 12, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" stroke="#64748b" style={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis stroke="#64748b" style={{ fontSize: 11 }} tickFormatter={(value) => formatAxisMoney(Number(value || 0))} />
            <Tooltip
              formatter={(value: any, name: any) => {
                if (value == null || !Number.isFinite(Number(value))) return null;
                return [formatMoney(Number(value)), String(name)];
              }}
              contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8 }}
            />
            <Legend />
            {SERIES.filter((series) => visible[series.key]).map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                stroke={series.color}
                strokeWidth={2.5}
                dot={{ r: 2.5 }}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
