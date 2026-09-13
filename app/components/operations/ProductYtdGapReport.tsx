'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { estYear } from '@/lib/time/eastern';
import type { YtdGapDataset, YtdGapGroup, YtdGapLine } from '@/lib/operations/product-ytd-gap';

type ProductYtdGapReportProps = {
  selectedCompanyId: string;
  onOpenInfo?: () => void;
};

type SortKey = 'label' | 'forecast' | 'adjusted' | 'actual' | 'gapForecast' | 'gapAdjusted';

const MIN_YEAR = 2018;

function fmtMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtSignedMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const rounded = Math.round(value);
  if (rounded === 0) return '$0';
  return `${rounded > 0 ? '+' : '-'}${fmtMoney(Math.abs(rounded))}`;
}

function fmtAttainment(actual: number, plan: number): string {
  if (!Number.isFinite(plan) || plan === 0) return '—';
  return `${((actual / plan) * 100).toFixed(1)}%`;
}

function gapColor(value: number): string {
  if (Math.round(value) === 0) return '#475569';
  return value > 0 ? '#15803d' : '#b91c1c';
}

function yearOptions(): number[] {
  const year = estYear();
  const start = Math.max(MIN_YEAR, year - 4);
  const end = year + 2;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function lineLabel(line: YtdGapLine): string {
  const sku = String(line.itemSku || '').trim();
  const pn = String(line.customerPartNumber || '').trim();
  if (sku && pn && sku.toUpperCase() !== pn.toUpperCase()) return `${sku} · ${pn}`;
  return sku || pn || '—';
}

const th: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 800,
  color: '#334155',
  background: '#f1f5f9',
  borderBottom: '1px solid #cbd5e1',
  textAlign: 'right',
  whiteSpace: 'pre-line',
  position: 'sticky',
  top: 0,
  zIndex: 1,
};

const td: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: 12,
  color: '#0f172a',
  borderBottom: '1px solid #e2e8f0',
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

export default function ProductYtdGapReport({ selectedCompanyId, onOpenInfo }: ProductYtdGapReportProps) {
  const [year, setYear] = useState<number>(() => estYear());
  const [dataset, setDataset] = useState<YtdGapDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey>('actual');
  const [sortAsc, setSortAsc] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (!selectedCompanyId) {
        setDataset(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ companyId: selectedCompanyId, year: String(year) });
        if (refresh) params.set('refresh', '1');
        const response = await fetch(`/api/operational-data/product-ytd-gap?${params.toString()}`, {
          cache: 'no-store',
        });
        const text = await response.text();
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        if (!response.ok) {
          throw new Error(json?.error || `HTTP ${response.status}`);
        }
        setDataset(json as YtdGapDataset);
      } catch (err: any) {
        setError(err?.message || 'Failed to load YTD gap analysis');
        setDataset(null);
      } finally {
        setLoading(false);
      }
    },
    [selectedCompanyId, year]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const sortedGroups = useMemo(() => {
    const groups = dataset?.groups ? dataset.groups.slice() : [];
    const value = (group: YtdGapGroup): number | string => {
      switch (sortKey) {
        case 'label':
          return group.label.toLowerCase();
        case 'forecast':
          return group.forecast;
        case 'adjusted':
          return group.adjusted;
        case 'gapForecast':
          return group.actual - group.forecast;
        case 'gapAdjusted':
          return group.actual - group.adjusted;
        default:
          return group.actual;
      }
    };
    groups.sort((left, right) => {
      const a = value(left);
      const b = value(right);
      if (typeof a === 'string' || typeof b === 'string') {
        return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }) * (sortAsc ? 1 : -1);
      }
      return (a - b) * (sortAsc ? 1 : -1);
    });
    return groups;
  }, [dataset, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((prev) => !prev);
      return;
    }
    setSortKey(key);
    setSortAsc(key === 'label');
  };

  const totals = dataset?.totals || null;
  const goals = totals?.goals || null;
  const windowLabel = dataset?.throughMonthLabel
    ? `January–${dataset.throughMonthLabel} ${dataset.year}`
    : `${dataset?.year ?? year}`;

  const sortHeader = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th
      style={{ ...th, textAlign: align, cursor: 'pointer', ...(align === 'left' ? { textAlign: 'left' } : {}) }}
      onClick={() => toggleSort(key)}
      title="Sort"
    >
      {label}
      {sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>YTD Gap Analysis</h3>
          <div style={{ marginTop: 4, fontSize: 12, color: '#64748b', maxWidth: 760, lineHeight: 1.5 }}>
            Year-to-date revenue dollars per line item, comparing the original forecast and the adjusted forecast
            against booked actuals. Every column covers the same months so the gap is like-for-like.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>Year</label>
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: '#0f172a' }}
          >
            {yearOptions().map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading || !selectedCompanyId}
            style={{
              border: '1px solid #4338ca',
              borderRadius: 8,
              padding: '6px 12px',
              background: loading ? '#c7d2fe' : '#4f46e5',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 12,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          {onOpenInfo ? (
            <button
              type="button"
              onClick={onOpenInfo}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#4f46e5',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              How this works
            </button>
          ) : null}
        </div>
      </div>

      {dataset ? (
        <div style={{ fontSize: 12, color: '#334155' }}>
          YTD window: <strong>{windowLabel}</strong>
          {dataset.dataThru ? ` · Data thru ${dataset.dataThru}` : ''}
          {` · ${dataset.groups.length} groups · ${dataset.groups.reduce((sum, group) => sum + group.lines.length, 0)} line items`}
        </div>
      ) : null}

      {error ? (
        <div style={{ padding: '10px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      {dataset && dataset.priceCount === 0 ? (
        <div style={{ color: '#b45309', fontSize: 13 }}>
          Forecasted $ is $0 because Jan-1 contract prices are not in the saved price list yet.
        </div>
      ) : null}

      {totals && goals ? (
        <div
          style={{
            display: 'flex',
            gap: 18,
            flexWrap: 'wrap',
            padding: '12px 14px',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            background: '#f8fafc',
          }}
        >
          <Metric label="YTD Actuals" value={fmtMoney(totals.actual)} />
          <Metric
            label="vs Forecasted"
            value={fmtSignedMoney(totals.actual - totals.forecast)}
            hint={fmtAttainment(totals.actual, totals.forecast)}
            color={gapColor(totals.actual - totals.forecast)}
          />
          <Metric
            label="vs Forecast - ADJ"
            value={fmtSignedMoney(totals.actual - totals.adjusted)}
            hint={fmtAttainment(totals.actual, totals.adjusted)}
            color={gapColor(totals.actual - totals.adjusted)}
          />
          {(['baseline', 'growth', 'stretch'] as const).map((key) => {
            const goal = goals[key];
            const label = key === 'baseline' ? 'vs SGP Baseline' : key === 'growth' ? 'vs SGP Growth' : 'vs SGP Stretch';
            if (goal == null) return <Metric key={key} label={label} value="—" hint="no goal saved" />;
            return (
              <Metric
                key={key}
                label={label}
                value={fmtSignedMoney(totals.actual - goal)}
                hint={fmtAttainment(totals.actual, goal)}
                color={gapColor(totals.actual - goal)}
              />
            );
          })}
        </div>
      ) : null}

      {loading && !dataset ? (
        <div style={{ padding: '28px 0', color: '#64748b', fontSize: 13 }}>Loading YTD gap analysis…</div>
      ) : !dataset || dataset.groups.length === 0 ? (
        !loading ? (
          <div style={{ padding: '28px 0', color: '#64748b', fontSize: 13 }}>
            No forecast or revenue line items found for {year}.
          </div>
        ) : null
      ) : (
        <div style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, maxHeight: 620 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 940 }}>
            <thead>
              <tr>
                {sortHeader('label', 'Group / Line item', 'left')}
                {sortHeader('forecast', 'YTD\nForecasted')}
                {sortHeader('adjusted', 'YTD\nForecast - ADJ')}
                {sortHeader('actual', 'YTD\nActuals')}
                {sortHeader('gapForecast', 'Gap vs\nForecasted')}
                <th style={th}>{'% of\nForecasted'}</th>
                {sortHeader('gapAdjusted', 'Gap vs\nForecast - ADJ')}
                <th style={th}>{'% of\nForecast - ADJ'}</th>
              </tr>
            </thead>
            <tbody>
              {sortedGroups.map((group) => {
                const isOpen = Boolean(expanded[group.key]);
                return (
                  <React.Fragment key={group.key}>
                    <tr style={{ background: '#ffffff' }}>
                      <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>
                        <button
                          type="button"
                          onClick={() => setExpanded((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            font: 'inherit',
                            color: '#0f172a',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: 0,
                          }}
                          aria-expanded={isOpen}
                        >
                          <span style={{ color: '#64748b', fontSize: 11, width: 10 }}>{isOpen ? '▼' : '▶'}</span>
                          {group.label}
                          <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: 11 }}>
                            {group.lines.length} {group.lines.length === 1 ? 'line' : 'lines'}
                          </span>
                        </button>
                      </td>
                      <td style={td}>{fmtMoney(group.forecast)}</td>
                      <td style={td}>{fmtMoney(group.adjusted)}</td>
                      <td style={{ ...td, fontWeight: 700 }}>{fmtMoney(group.actual)}</td>
                      <td style={{ ...td, color: gapColor(group.actual - group.forecast), fontWeight: 700 }}>
                        {fmtSignedMoney(group.actual - group.forecast)}
                      </td>
                      <td style={td}>{fmtAttainment(group.actual, group.forecast)}</td>
                      <td style={{ ...td, color: gapColor(group.actual - group.adjusted), fontWeight: 700 }}>
                        {fmtSignedMoney(group.actual - group.adjusted)}
                      </td>
                      <td style={td}>{fmtAttainment(group.actual, group.adjusted)}</td>
                    </tr>
                    {isOpen
                      ? group.lines.map((line) => (
                          <tr key={`${group.key}:${line.key}`} style={{ background: '#f8fafc' }}>
                            <td style={{ ...td, textAlign: 'left', paddingLeft: 34, color: '#334155' }}>
                              <div style={{ fontWeight: 600 }}>{lineLabel(line)}</div>
                              {line.customerName ? (
                                <div style={{ fontSize: 11, color: '#64748b' }}>{line.customerName}</div>
                              ) : null}
                            </td>
                            <td style={td}>{fmtMoney(line.forecast)}</td>
                            <td style={td}>{fmtMoney(line.adjusted)}</td>
                            <td style={td}>{fmtMoney(line.actual)}</td>
                            <td style={{ ...td, color: gapColor(line.actual - line.forecast) }}>
                              {fmtSignedMoney(line.actual - line.forecast)}
                            </td>
                            <td style={td}>{fmtAttainment(line.actual, line.forecast)}</td>
                            <td style={{ ...td, color: gapColor(line.actual - line.adjusted) }}>
                              {fmtSignedMoney(line.actual - line.adjusted)}
                            </td>
                            <td style={td}>{fmtAttainment(line.actual, line.adjusted)}</td>
                          </tr>
                        ))
                      : null}
                  </React.Fragment>
                );
              })}
              {totals ? (
                <tr style={{ background: '#fffbeb', borderTop: '2px solid #f59e0b' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>Company total</td>
                  <td style={{ ...td, fontWeight: 800 }}>{fmtMoney(totals.forecast)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{fmtMoney(totals.adjusted)}</td>
                  <td style={{ ...td, fontWeight: 800 }}>{fmtMoney(totals.actual)}</td>
                  <td style={{ ...td, fontWeight: 800, color: gapColor(totals.actual - totals.forecast) }}>
                    {fmtSignedMoney(totals.actual - totals.forecast)}
                  </td>
                  <td style={{ ...td, fontWeight: 800 }}>{fmtAttainment(totals.actual, totals.forecast)}</td>
                  <td style={{ ...td, fontWeight: 800, color: gapColor(totals.actual - totals.adjusted) }}>
                    {fmtSignedMoney(totals.actual - totals.adjusted)}
                  </td>
                  <td style={{ ...td, fontWeight: 800 }}>{fmtAttainment(totals.actual, totals.adjusted)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: string;
}) {
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: color || '#0f172a' }}>{value}</div>
      {hint ? <div style={{ fontSize: 11, color: '#94a3b8' }}>{hint}</div> : null}
    </div>
  );
}
