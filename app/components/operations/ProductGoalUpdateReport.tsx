'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  compactParsedRevenueWorkbook,
  parseProductOperationsFile,
} from '@/lib/operations/product-revenue-actual';
import { workbookImportErrorMessage } from '@/lib/operations/product-revenue-forecast';
import {
  emptyMonthlyRevenueGoals,
  fmtGoalDays,
  fmtGoalDollars,
  fmtGoalPct,
  fmtGoalUnits,
  hasGoalUpdateRows,
  hasMonthlyRevenueGoals,
  MONTH_GOAL_LABELS,
  monthNumberFromLabel,
  quarterMonths,
  sumMonthlyGoal,
  type GoalScenarioRow,
  type GoalUpdateSnapshot,
  type MonthlyRevenueGoalKey,
  type MonthlyRevenueGoalMonth,
  type PyramidBlock,
  type PyramidMetric,
  type PyramidPeriod,
  type PyramidSnapshot,
} from '@/lib/operations/product-goal-update';
import { estYear } from '@/lib/time/eastern';

type ProductGoalUpdateReportProps = {
  selectedCompanyId: string;
  onOpenInfo?: () => void;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '5px 7px',
  fontSize: 12,
  color: '#0f172a',
  background: '#ffffff',
};

const HEADER_BG = '#e0e7ff';
const CELL_BG = '#eef2ff';
const PERIODS = ['MTD', 'QTD', 'YTD'] as const;
const MONTHLY_GOAL_MONTH_COL_PX = 72;
const MONTHLY_GOAL_COL_PX = 92;
const MONTHLY_GOAL_TABLE_PX = MONTHLY_GOAL_MONTH_COL_PX + MONTHLY_GOAL_COL_PX * 3;
const MONTHLY_GOAL_YEARS = [2026, 2027, 2028, 2029, 2030] as const;

type GoalsByYear = Record<number, MonthlyRevenueGoalMonth[]>;

function emptyGoalsByYear(): GoalsByYear {
  return Object.fromEntries(MONTHLY_GOAL_YEARS.map((goalYear) => [goalYear, emptyMonthlyRevenueGoals()])) as GoalsByYear;
}

const SGP_2026_MONTHLY_REVENUE_GOALS: MonthlyRevenueGoalMonth[] = [
  { month: 1, baseline: 1264262, growth: 1264262, stretch: 1264262 },
  { month: 2, baseline: 1188736, growth: 1188736, stretch: 1188736 },
  { month: 3, baseline: 1436587, growth: 1436587, stretch: 1436587 },
  { month: 4, baseline: 1346628, growth: 1346737, stretch: 1346737 },
  { month: 5, baseline: 1375045, growth: 1375154, stretch: 1375154 },
  { month: 6, baseline: 1561592, growth: 1561702, stretch: 1561702 },
  { month: 7, baseline: 1395542, growth: 1593778, stretch: 2010971 },
  { month: 8, baseline: 1308441, growth: 1506677, stretch: 1923870 },
  { month: 9, baseline: 1285379, growth: 1483615, stretch: 1902729 },
  { month: 10, baseline: 1313817, growth: 1511715, stretch: 1928012 },
  { month: 11, baseline: 1046650, growth: 1244548, stretch: 1660845 },
  { month: 12, baseline: 988592, growth: 1186489, stretch: 1607395 },
];

function resolveMonthlyGoals(raw: unknown, nextYear: number): MonthlyRevenueGoalMonth[] {
  const incoming = Array.isArray(raw) ? (raw as MonthlyRevenueGoalMonth[]) : [];
  if (hasMonthlyRevenueGoals(incoming)) return incoming.map((row) => ({ ...row }));
  if (nextYear === 2026) return SGP_2026_MONTHLY_REVENUE_GOALS.map((row) => ({ ...row }));
  return emptyMonthlyRevenueGoals();
}

function currentYear(): number {
  return estYear();
}

function yearOptions(): number[] {
  const year = currentYear();
  const start = year - 1;
  const end = 2030 + Math.max(0, year - 2026);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: '1px solid #c7d2fe',
        background: '#eef2ff',
        borderRadius: 999,
        padding: '6px 12px',
        fontSize: 12,
        color: '#312e81',
        whiteSpace: 'nowrap',
      }}
    >
      <strong style={{ fontWeight: 700 }}>{label}:</strong> {value}
    </div>
  );
}

function goalCell(row: GoalScenarioRow, key: keyof GoalScenarioRow, kind: 'dollars' | 'pct'): string {
  const value = row[key];
  if (typeof value !== 'number') return '—';
  return kind === 'pct' ? fmtGoalPct(value) : fmtGoalDollars(value);
}

function metricValue(metric: PyramidMetric, key: keyof PyramidMetric, kind: 'dollars' | 'units' | 'pct'): string {
  const value = metric[key];
  if (kind === 'pct') return fmtGoalPct(value);
  if (kind === 'units') return fmtGoalUnits(value);
  return fmtGoalDollars(value);
}

function moneyInputText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return Math.round(Number(value)).toLocaleString('en-US');
}

function parseMoneyInput(value: string): number | null {
  const text = value.replace(/[$,\s]/g, '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function GoalMoneyInput({
  value,
  disabled,
  onCommit,
}: {
  value: number | null;
  disabled?: boolean;
  onCommit: (next: number | null) => void;
}) {
  const [text, setText] = useState(moneyInputText(value));
  useEffect(() => {
    setText(moneyInputText(value));
  }, [value]);
  return (
    <input
      value={text}
      disabled={disabled}
      inputMode="decimal"
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        const parsed = parseMoneyInput(text);
        setText(moneyInputText(parsed));
        onCommit(parsed);
      }}
      style={{
        ...inputStyle,
        textAlign: 'right',
        padding: '3px 4px',
        fontSize: 11,
        borderRadius: 4,
        background: disabled ? '#f8fafc' : '#ffffff',
      }}
    />
  );
}

export default function ProductGoalUpdateReport({
  selectedCompanyId,
  onOpenInfo,
}: ProductGoalUpdateReportProps) {
  const [year, setYear] = useState(currentYear());
  const [dataThru, setDataThru] = useState('');
  const [goalUpdate, setGoalUpdate] = useState<GoalUpdateSnapshot | null>(null);
  const [pyramid, setPyramid] = useState<PyramidSnapshot | null>(null);
  const [goalsByYear, setGoalsByYear] = useState<GoalsByYear>(emptyGoalsByYear);
  const [dirtyYears, setDirtyYears] = useState<number[]>([]);
  const [savingGoals, setSavingGoals] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const goalsByYearRef = useRef<GoalsByYear>(goalsByYear);
  const reloadMonthlyGoalsRef = useRef(true);

  const applyMonthlyGoalsByYear = useCallback((
    rawByYear: Record<string, unknown> | undefined,
    selectedYear: number,
    selectedYearRaw: unknown
  ) => {
    const next = emptyGoalsByYear();
    const nextDirty: number[] = [];
    for (const goalYear of MONTHLY_GOAL_YEARS) {
      const raw = rawByYear?.[String(goalYear)] ?? (goalYear === selectedYear ? selectedYearRaw : undefined);
      const persistedRaw = Array.isArray(raw) ? raw : undefined;
      const months = resolveMonthlyGoals(raw, goalYear);
      next[goalYear] = months;
      if (!hasMonthlyRevenueGoals(persistedRaw) && hasMonthlyRevenueGoals(months)) {
        nextDirty.push(goalYear);
      }
    }
    goalsByYearRef.current = next;
    setGoalsByYear(next);
    setDirtyYears(nextDirty);
  }, []);

  const loadSnapshot = useCallback(async (nextYear = year, options?: { reloadMonthlyGoals?: boolean }) => {
    if (!selectedCompanyId) return;
    const reloadMonthlyGoals = options?.reloadMonthlyGoals ?? false;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        year: String(nextYear),
      });
      if (reloadMonthlyGoals) {
        params.set('years', MONTHLY_GOAL_YEARS.join(','));
      }
      const response = await fetch(`/api/operational-data/product-goals?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load Goal Update');
      setGoalUpdate(payload.goalUpdate || null);
      setPyramid(payload.pyramid || null);
      if (reloadMonthlyGoals) {
        applyMonthlyGoalsByYear(
          payload.monthlyGoalsByYear,
          nextYear,
          payload.monthlyRevenueGoals || payload.goalUpdate?.monthlyRevenueGoals
        );
      }
      setDataThru(payload.dataThru ? String(payload.dataThru).slice(0, 10) : '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load Goal Update');
      setGoalUpdate(null);
      setPyramid(null);
      if (reloadMonthlyGoals) {
        const empty = emptyGoalsByYear();
        goalsByYearRef.current = empty;
        setGoalsByYear(empty);
        setDirtyYears([]);
      }
    } finally {
      setLoading(false);
    }
  }, [applyMonthlyGoalsByYear, selectedCompanyId, year]);

  useEffect(() => {
    setGoalUpdate(null);
    setPyramid(null);
    const empty = emptyGoalsByYear();
    goalsByYearRef.current = empty;
    setGoalsByYear(empty);
    setDirtyYears([]);
    setNotice(null);
    reloadMonthlyGoalsRef.current = true;
  }, [selectedCompanyId]);

  useEffect(() => {
    const reloadMonthlyGoals = reloadMonthlyGoalsRef.current;
    reloadMonthlyGoalsRef.current = false;
    void loadSnapshot(year, { reloadMonthlyGoals });
  }, [selectedCompanyId, year, loadSnapshot]);

  const handleImport = async (file: File) => {
    if (!selectedCompanyId) {
      setError('Select a company before importing.');
      return;
    }
    setImporting(true);
    setError(null);
    setNotice('Reading workbook…');
    try {
      const parsed = compactParsedRevenueWorkbook(await parseProductOperationsFile(file, year, { allowForecastOnly: true }));
      setNotice('Saving Goal Update and Pyramid…');
      const response = await fetch('/api/operational-data/product-revenue/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          year,
          parsed,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || payload.message || `Failed to import workbook (${response.status})`);
      }
      const importedYear = Number(payload.year) || year;
      setYear(importedYear);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
      reloadMonthlyGoalsRef.current = true;
      await loadSnapshot(importedYear, { reloadMonthlyGoals: true });
      setNotice(
        payload.hasGoalUpdate || payload.hasPyramid
          ? 'Imported Goal Update and Pyramid from the workbook.'
          : 'Workbook imported. Goal Update / Pyramid sheets were not found.'
      );
    } catch (err: unknown) {
      setNotice(null);
      setError(workbookImportErrorMessage(err, 'Failed to import workbook'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const saveMonthlyGoals = async () => {
    if (!selectedCompanyId) {
      setError('Select a company before saving.');
      setSaveStatus(null);
      return;
    }
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLInputElement) {
      document.activeElement.blur();
    }
    const yearsToSave: Record<number, MonthlyRevenueGoalMonth[]> = {};
    for (const goalYear of MONTHLY_GOAL_YEARS) {
      yearsToSave[goalYear] = goalsByYearRef.current[goalYear] || emptyMonthlyRevenueGoals();
    }
    setSavingGoals(true);
    setError(null);
    setSaveStatus('Saving…');
    try {
      const response = await fetch('/api/operational-data/product-goals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          year,
          years: yearsToSave,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to save revenue goals');
      setGoalUpdate(payload.goalUpdate || null);
      setPyramid(payload.pyramid || null);
      if (payload.monthlyGoalsByYear && typeof payload.monthlyGoalsByYear === 'object') {
        const savedByYear = payload.monthlyGoalsByYear as Record<string, unknown>;
        const next = { ...goalsByYearRef.current };
        for (const goalYear of MONTHLY_GOAL_YEARS) {
          const raw = savedByYear[String(goalYear)];
          if (Array.isArray(raw)) next[goalYear] = resolveMonthlyGoals(raw, goalYear);
        }
        goalsByYearRef.current = next;
        setGoalsByYear(next);
      }
      setNotice('Saved Baseline, Growth, and Stretch monthly revenue goals for 2026–2030.');
      setSaveStatus('Saved');
      setDirtyYears([]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save revenue goals';
      setNotice(null);
      setError(message);
      setSaveStatus(message);
    } finally {
      setSavingGoals(false);
    }
  };

  const commitMonthlyGoal = (goalYear: number, month: number, key: MonthlyRevenueGoalKey, value: number | null) => {
    const currentMonths = goalsByYearRef.current[goalYear] || emptyMonthlyRevenueGoals();
    const current = currentMonths.find((row) => row.month === month)?.[key] ?? null;
    if (current === value) return;
    const nextMonths = emptyMonthlyRevenueGoals().map((row) => {
      const existing = currentMonths.find((item) => item.month === row.month) || row;
      if (existing.month !== month) return existing;
      return { ...existing, [key]: value };
    });
    const next = { ...goalsByYearRef.current, [goalYear]: nextMonths };
    goalsByYearRef.current = next;
    setGoalsByYear(next);
    setDirtyYears((prev) => (prev.includes(goalYear) ? prev : [...prev, goalYear]));
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '8px 8px',
    color: '#3730a3',
    background: HEADER_BG,
    whiteSpace: 'normal',
    lineHeight: 1.25,
    fontSize: 11,
    fontWeight: 700,
    verticalAlign: 'bottom',
  };
  const tdStyle: React.CSSProperties = {
    padding: '8px 8px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderTop: '1px solid #c7d2fe',
    background: CELL_BG,
    color: '#312e81',
    fontSize: 12,
  };
  const labelCell: React.CSSProperties = {
    ...tdStyle,
    textAlign: 'left',
    fontWeight: 700,
    color: '#1e293b',
    background: '#f8fafc',
  };
  const monthlyGoalCell: React.CSSProperties = {
    ...tdStyle,
    padding: '3px 4px',
    fontSize: 11,
    background: '#ffffff',
  };
  const monthlyGoalLabel: React.CSSProperties = {
    ...labelCell,
    padding: '3px 6px',
    fontSize: 11,
  };

  const empty = !loading && !hasGoalUpdateRows(goalUpdate) && !pyramid;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Goal Update</h3>
        {onOpenInfo ? (
          <button
            type="button"
            onClick={onOpenInfo}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '0 2px',
              color: '#2563eb',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            What is this?
          </button>
        ) : null}
      </div>
      <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 13, lineHeight: 1.5 }}>
        Company-level SGP Goal Update and Pyramid MTD / QTD / YTD versus current forecasts and SGP. Monthly Baseline, Growth, and Stretch goals for 2026–2030 are at the bottom of the page.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Year
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            style={{ ...inputStyle, width: 108 }}
          >
            {yearOptions().map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Data thru
          <input type="date" value={dataThru} readOnly style={{ ...inputStyle, width: 150, background: '#f8fafc' }} />
        </label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing || !selectedCompanyId}
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '8px 12px',
            background: '#ffffff',
            color: '#334155',
            fontWeight: 700,
            cursor: importing ? 'wait' : 'pointer',
            fontSize: 12,
          }}
        >
          {importing ? 'Importing…' : 'Import workbook'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImport(file);
          }}
        />
      </div>

      {error ? (
        <div style={{ marginBottom: 12, color: '#b91c1c', fontSize: 13 }}>{error}</div>
      ) : null}
      {notice ? (
        <div style={{ marginBottom: 12, color: '#166534', fontSize: 13 }}>{notice}</div>
      ) : null}
      {loading ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>Loading Goal Update…</div>
      ) : null}
      {empty ? (
        <div style={{ padding: '8px 0 24px', color: '#64748b', fontSize: 13 }}>
          Import the revenue forecast workbook to load Goal Update and Pyramid. You can still enter monthly revenue goals at the bottom of the page.
        </div>
      ) : null}

      {goalUpdate && hasGoalUpdateRows(goalUpdate) ? (
        <section style={{ marginBottom: 28 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>SGP Goal Update</h4>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Chip label="Year" value={String(goalUpdate.year || year)} />
            <Chip label="Quarter" value={goalUpdate.quarter != null ? String(goalUpdate.quarter) : '—'} />
            <Chip label="Shipping days remaining YTD" value={fmtGoalDays(goalUpdate.shippingDaysRemainingYtd)} />
            <Chip label="Shipping days remaining QTD" value={fmtGoalDays(goalUpdate.shippingDaysRemainingQtd)} />
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #c7d2fe', borderRadius: 10, background: '#ffffff' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>SGP Goal</th>
                  <th style={thStyle}>Annual SGP Goal</th>
                  <th style={thStyle}>YTD Actual</th>
                  <th style={thStyle}>Goal vs Actual YTD</th>
                  <th style={thStyle}>% YTD vs Goal</th>
                  <th style={thStyle}>Qtr SGP Goal</th>
                  <th style={thStyle}>Quarter YTD</th>
                  <th style={thStyle}>Goal vs Actual QTD</th>
                  <th style={thStyle}>% QTD vs Goal</th>
                </tr>
              </thead>
              <tbody>
                {goalUpdate.rows.map((row) => (
                  <tr key={row.scenario}>
                    <td style={labelCell}>{row.scenario}</td>
                    <td style={tdStyle}>{goalCell(row, 'annualGoal', 'dollars')}</td>
                    <td style={tdStyle}>{goalCell(row, 'ytdActual', 'dollars')}</td>
                    <td style={tdStyle}>{goalCell(row, 'goalVsActualYtd', 'dollars')}</td>
                    <td style={tdStyle}>{goalCell(row, 'pctYtdVsGoal', 'pct')}</td>
                    <td style={tdStyle}>{goalCell(row, 'quarterGoal', 'dollars')}</td>
                    <td style={tdStyle}>{goalCell(row, 'quarterYtd', 'dollars')}</td>
                    <td style={tdStyle}>{goalCell(row, 'goalVsActualQtd', 'dollars')}</td>
                    <td style={tdStyle}>{goalCell(row, 'pctQtdVsGoal', 'pct')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {pyramid ? (
        <section style={{ marginBottom: 28 }}>
          <h4 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
            Pyramid{pyramid.monthLabel ? ` · ${pyramid.monthLabel}` : ''}
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
            }}
          >
            {pyramid.revenue ? (
              <PyramidCard block={pyramid.revenue} title="Revenue" unit="dollars" />
            ) : null}
            {pyramid.issues ? (
              <PyramidCard block={pyramid.issues} title="Issues" unit="units" />
            ) : null}
          </div>
        </section>
      ) : null}

      {!loading || MONTHLY_GOAL_YEARS.some((goalYear) => hasMonthlyRevenueGoals(goalsByYear[goalYear])) ? (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
              Monthly revenue goals
            </h4>
            <button
              type="button"
              onClick={() => void saveMonthlyGoals()}
              disabled={savingGoals || importing || !selectedCompanyId}
              style={{
                border: '1px solid #4338ca',
                borderRadius: 8,
                padding: '6px 12px',
                background: savingGoals ? '#c7d2fe' : '#4f46e5',
                color: '#ffffff',
                fontWeight: 700,
                cursor: savingGoals || importing || !selectedCompanyId ? 'wait' : 'pointer',
                fontSize: 12,
              }}
            >
              {savingGoals ? 'Saving…' : 'Save'}
            </button>
            {saveStatus ? (
              <span style={{ fontSize: 12, color: saveStatus === 'Saved' || saveStatus === 'Saving…' ? '#166534' : '#b91c1c' }}>
                {saveStatus}
              </span>
            ) : dirtyYears.length ? (
              <span style={{ fontSize: 12, color: '#b45309' }}>Unsaved changes</span>
            ) : null}
          </div>
          <p style={{ margin: '0 0 8px', color: '#475569', fontSize: 12, lineHeight: 1.45, maxWidth: 720 }}>
            Type Baseline, Growth, and Stretch for each month of 2026–2030. Quarter and year totals calculate from the months.
          </p>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8 }}>
            {MONTHLY_GOAL_YEARS.map((goalYear) => (
              <MonthlyGoalsYearTable
                key={goalYear}
                goalYear={goalYear}
                months={goalsByYear[goalYear] || emptyMonthlyRevenueGoals()}
                highlightMonth={goalYear === year ? monthNumberFromLabel(pyramid?.monthLabel) : null}
                disabled={importing}
                thStyle={thStyle}
                monthlyGoalCell={monthlyGoalCell}
                monthlyGoalLabel={monthlyGoalLabel}
                onCommit={commitMonthlyGoal}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PyramidCard({
  block,
  title,
  unit,
}: {
  block: PyramidBlock;
  title: string;
  unit: 'dollars' | 'units';
}) {
  const includeGoals = block.kind === 'revenue';
  const columns: Array<{ key: keyof PyramidMetric; vsKey: keyof PyramidMetric; pctKey: keyof PyramidMetric; label: string }> = [
    { key: 'actual', vsKey: 'actual', pctKey: 'actual', label: 'Actual' },
    { key: 'currentForecasts', vsKey: 'vsCurrentForecasts', pctKey: 'pctCurrentForecasts', label: 'Current Forecasts' },
    { key: 'sgpForecast', vsKey: 'vsSgpForecast', pctKey: 'pctSgpForecast', label: includeGoals ? 'Forecast SGP' : 'SGP Forecast' },
  ];
  if (includeGoals) {
    columns.push(
      { key: 'baselineGoal', vsKey: 'vsBaseline', pctKey: 'pctBaseline', label: 'Baseline' },
      { key: 'growthGoal', vsKey: 'vsGrowth', pctKey: 'pctGrowth', label: 'Growth' },
      { key: 'stretchGoal', vsKey: 'vsStretch', pctKey: 'pctStretch', label: 'Stretch' }
    );
  }

  const headerStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '7px 6px',
    color: '#3730a3',
    background: HEADER_BG,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1.25,
    whiteSpace: 'normal',
  };
  const cellStyle: React.CSSProperties = {
    padding: '7px 6px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderTop: '1px solid #c7d2fe',
    background: CELL_BG,
    color: '#312e81',
    fontSize: 12,
  };

  return (
    <div style={{ border: '1px solid #c7d2fe', borderRadius: 10, background: '#ffffff', overflow: 'hidden' }}>
      <div style={{ padding: '10px 12px', background: HEADER_BG, color: '#312e81', fontWeight: 800, fontSize: 13 }}>
        {title} {unit === 'dollars' ? '($)' : '(units)'}
        {block.monthLabel ? <span style={{ fontWeight: 600, marginLeft: 8 }}>{block.monthLabel}</span> : null}
      </div>
      {PERIODS.map((periodKey) => {
        const period = block[periodKey.toLowerCase() as 'mtd' | 'qtd' | 'ytd'] as PyramidPeriod | null;
        if (!period) return null;
        const extras = [
          period.quarter != null ? `Q${period.quarter}` : null,
          period.year != null ? String(period.year) : null,
          period.shippingDaysRemaining != null ? `${fmtGoalDays(period.shippingDaysRemaining)} days remaining` : null,
        ].filter(Boolean);
        return (
          <div key={periodKey} style={{ padding: '10px 12px 12px', borderTop: '1px solid #e0e7ff' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#3730a3' }}>{periodKey}</div>
              {extras.length ? <div style={{ fontSize: 11, color: '#64748b' }}>{extras.join(' · ')}</div> : null}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...headerStyle, textAlign: 'left' }} />
                    {columns.map((column) => (
                      <th key={column.key} style={headerStyle}>{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 700, background: '#f8fafc', color: '#1e293b' }}>
                      Amount
                    </td>
                    {columns.map((column) => (
                      <td key={column.key} style={cellStyle}>
                        {metricValue(period.values, column.key, unit)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 700, background: '#f8fafc', color: '#1e293b' }}>
                      vs plan
                    </td>
                    {columns.map((column) => (
                      <td key={column.key} style={cellStyle}>
                        {column.key === 'actual' ? '—' : metricValue(period.values, column.vsKey, unit)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ ...cellStyle, textAlign: 'left', fontWeight: 700, background: '#f8fafc', color: '#1e293b' }}>
                      vs plan %
                    </td>
                    {columns.map((column) => (
                      <td key={column.key} style={cellStyle}>
                        {column.key === 'actual' ? '—' : metricValue(period.values, column.pctKey, 'pct')}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthlyGoalsYearTable({
  goalYear,
  months,
  highlightMonth,
  disabled,
  thStyle,
  monthlyGoalCell,
  monthlyGoalLabel,
  onCommit,
}: {
  goalYear: number;
  months: MonthlyRevenueGoalMonth[];
  highlightMonth: number | null;
  disabled: boolean;
  thStyle: React.CSSProperties;
  monthlyGoalCell: React.CSSProperties;
  monthlyGoalLabel: React.CSSProperties;
  onCommit: (goalYear: number, month: number, key: MonthlyRevenueGoalKey, value: number | null) => void;
}) {
  return (
    <div style={{ flex: '0 0 auto' }}>
      <div
        style={{
          marginBottom: 6,
          fontSize: 13,
          fontWeight: 800,
          color: '#312e81',
        }}
      >
        {goalYear}
      </div>
      <div style={{ border: '1px solid #c7d2fe', borderRadius: 10, background: '#ffffff', width: 'fit-content' }}>
        <table
          style={{
            borderCollapse: 'separate',
            borderSpacing: 0,
            tableLayout: 'fixed',
            width: MONTHLY_GOAL_TABLE_PX,
            fontSize: 11,
          }}
        >
          <colgroup>
            <col style={{ width: MONTHLY_GOAL_MONTH_COL_PX }} />
            <col style={{ width: MONTHLY_GOAL_COL_PX }} />
            <col style={{ width: MONTHLY_GOAL_COL_PX }} />
            <col style={{ width: MONTHLY_GOAL_COL_PX }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', width: MONTHLY_GOAL_MONTH_COL_PX, padding: '6px 6px', fontSize: 10 }}>
                Month
              </th>
              <th style={{ ...thStyle, width: MONTHLY_GOAL_COL_PX, padding: '6px 4px', fontSize: 10, lineHeight: 1.2 }}>
                Baseline<br />Goal
              </th>
              <th style={{ ...thStyle, width: MONTHLY_GOAL_COL_PX, padding: '6px 4px', fontSize: 10, lineHeight: 1.2 }}>
                Growth<br />Goal
              </th>
              <th style={{ ...thStyle, width: MONTHLY_GOAL_COL_PX, padding: '6px 4px', fontSize: 10, lineHeight: 1.2 }}>
                Stretch<br />Goal
              </th>
            </tr>
          </thead>
          <tbody>
            {([1, 2, 3] as const).map((month) => (
              <MonthlyGoalRow
                key={month}
                month={month}
                highlight={highlightMonth === month}
                values={months[month - 1]}
                disabled={disabled}
                tdStyle={monthlyGoalCell}
                labelCell={monthlyGoalLabel}
                onCommit={(nextMonth, key, value) => onCommit(goalYear, nextMonth, key, value)}
              />
            ))}
            <MonthlyTotalRow
              label="Q1"
              tdStyle={monthlyGoalCell}
              labelCell={monthlyGoalLabel}
              baseline={sumMonthlyGoal(months, quarterMonths(1), 'baseline')}
              growth={sumMonthlyGoal(months, quarterMonths(1), 'growth')}
              stretch={sumMonthlyGoal(months, quarterMonths(1), 'stretch')}
            />
            {([4, 5, 6] as const).map((month) => (
              <MonthlyGoalRow
                key={month}
                month={month}
                highlight={highlightMonth === month}
                values={months[month - 1]}
                disabled={disabled}
                tdStyle={monthlyGoalCell}
                labelCell={monthlyGoalLabel}
                onCommit={(nextMonth, key, value) => onCommit(goalYear, nextMonth, key, value)}
              />
            ))}
            <MonthlyTotalRow
              label="Q2"
              tdStyle={monthlyGoalCell}
              labelCell={monthlyGoalLabel}
              baseline={sumMonthlyGoal(months, quarterMonths(2), 'baseline')}
              growth={sumMonthlyGoal(months, quarterMonths(2), 'growth')}
              stretch={sumMonthlyGoal(months, quarterMonths(2), 'stretch')}
            />
            {([7, 8, 9] as const).map((month) => (
              <MonthlyGoalRow
                key={month}
                month={month}
                highlight={highlightMonth === month}
                values={months[month - 1]}
                disabled={disabled}
                tdStyle={monthlyGoalCell}
                labelCell={monthlyGoalLabel}
                onCommit={(nextMonth, key, value) => onCommit(goalYear, nextMonth, key, value)}
              />
            ))}
            <MonthlyTotalRow
              label="Q3"
              tdStyle={monthlyGoalCell}
              labelCell={monthlyGoalLabel}
              baseline={sumMonthlyGoal(months, quarterMonths(3), 'baseline')}
              growth={sumMonthlyGoal(months, quarterMonths(3), 'growth')}
              stretch={sumMonthlyGoal(months, quarterMonths(3), 'stretch')}
            />
            {([10, 11, 12] as const).map((month) => (
              <MonthlyGoalRow
                key={month}
                month={month}
                highlight={highlightMonth === month}
                values={months[month - 1]}
                disabled={disabled}
                tdStyle={monthlyGoalCell}
                labelCell={monthlyGoalLabel}
                onCommit={(nextMonth, key, value) => onCommit(goalYear, nextMonth, key, value)}
              />
            ))}
            <MonthlyTotalRow
              label="Q4"
              tdStyle={monthlyGoalCell}
              labelCell={monthlyGoalLabel}
              baseline={sumMonthlyGoal(months, quarterMonths(4), 'baseline')}
              growth={sumMonthlyGoal(months, quarterMonths(4), 'growth')}
              stretch={sumMonthlyGoal(months, quarterMonths(4), 'stretch')}
            />
            <MonthlyTotalRow
              label="Year"
              tdStyle={monthlyGoalCell}
              labelCell={monthlyGoalLabel}
              baseline={sumMonthlyGoal(months, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'baseline')}
              growth={sumMonthlyGoal(months, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'growth')}
              stretch={sumMonthlyGoal(months, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'stretch')}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthlyGoalRow({
  month,
  highlight,
  values,
  disabled,
  tdStyle,
  labelCell,
  onCommit,
}: {
  month: number;
  highlight: boolean;
  values: MonthlyRevenueGoalMonth | undefined;
  disabled: boolean;
  tdStyle: React.CSSProperties;
  labelCell: React.CSSProperties;
  onCommit: (month: number, key: MonthlyRevenueGoalKey, value: number | null) => void;
}) {
  const highlightStyle = highlight ? { background: '#e0e7ff' } : undefined;
  return (
    <tr>
      <td style={{ ...labelCell, ...highlightStyle }}>{MONTH_GOAL_LABELS[month - 1]}</td>
      {(['baseline', 'growth', 'stretch'] as const).map((key) => (
        <td key={key} style={{ ...tdStyle, background: '#ffffff', ...highlightStyle }}>
          <GoalMoneyInput
            value={values?.[key] ?? null}
            disabled={disabled}
            onCommit={(next) => onCommit(month, key, next)}
          />
        </td>
      ))}
    </tr>
  );
}

function MonthlyTotalRow({
  label,
  baseline,
  growth,
  stretch,
  tdStyle,
  labelCell,
}: {
  label: string;
  baseline: number | null;
  growth: number | null;
  stretch: number | null;
  tdStyle: React.CSSProperties;
  labelCell: React.CSSProperties;
}) {
  const totalLabel: React.CSSProperties = { ...labelCell, background: '#eef2ff', fontWeight: 800 };
  const totalCell: React.CSSProperties = { ...tdStyle, background: '#eef2ff', fontWeight: 800 };
  return (
    <tr>
      <td style={totalLabel}>{label}</td>
      <td style={totalCell}>{fmtGoalDollars(baseline)}</td>
      <td style={totalCell}>{fmtGoalDollars(growth)}</td>
      <td style={totalCell}>{fmtGoalDollars(stretch)}</td>
    </tr>
  );
}
