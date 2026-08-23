'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  compactParsedRevenueWorkbook,
  parseProductOperationsFile,
} from '@/lib/operations/product-revenue-actual';
import { workbookImportErrorMessage } from '@/lib/operations/product-revenue-forecast';
import {
  fmtGoalDays,
  fmtGoalDollars,
  fmtGoalPct,
  fmtGoalUnits,
  type GoalScenarioRow,
  type GoalUpdateSnapshot,
  type PyramidBlock,
  type PyramidMetric,
  type PyramidPeriod,
  type PyramidSnapshot,
} from '@/lib/operations/product-goal-update';

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

function currentYear(): number {
  return new Date().getFullYear();
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

export default function ProductGoalUpdateReport({
  selectedCompanyId,
  onOpenInfo,
}: ProductGoalUpdateReportProps) {
  const [year, setYear] = useState(currentYear());
  const [dataThru, setDataThru] = useState('');
  const [goalUpdate, setGoalUpdate] = useState<GoalUpdateSnapshot | null>(null);
  const [pyramid, setPyramid] = useState<PyramidSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadSnapshot = useCallback(async (nextYear = year) => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        year: String(nextYear),
      });
      const response = await fetch(`/api/operational-data/product-goals?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load Goal Update');
      setGoalUpdate(payload.goalUpdate || null);
      setPyramid(payload.pyramid || null);
      setDataThru(payload.dataThru ? String(payload.dataThru).slice(0, 10) : '');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load Goal Update');
      setGoalUpdate(null);
      setPyramid(null);
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, year]);

  useEffect(() => {
    setGoalUpdate(null);
    setPyramid(null);
    setNotice(null);
  }, [selectedCompanyId]);

  useEffect(() => {
    void loadSnapshot(year);
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
      await loadSnapshot(importedYear);
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

  const empty = !loading && !goalUpdate && !pyramid;

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
        Company-level SGP Goal Update and Pyramid MTD / QTD / YTD versus current forecasts and SGP. Baseline, Growth, and Stretch stay blank until those goals are in the workbook.
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
          Import the revenue forecast workbook to load Goal Update and Pyramid.
        </div>
      ) : null}

      {goalUpdate ? (
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
        <section>
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
