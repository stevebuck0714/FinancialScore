'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { estYear } from '@/lib/time/eastern';
import type {
  YtdComparisonGroup,
  YtdComparisonLine,
  YtdGapDataset,
  YtdGapGroup,
  YtdGapLine,
} from '@/lib/operations/product-ytd-gap';

type ProductYtdGapReportProps = {
  selectedCompanyId: string;
  onOpenInfo?: () => void;
};

type AnalysisView = 'ytd' | 'annual' | 'comparison';
type SortKey =
  | 'label'
  | 'forecast'
  | 'adjusted'
  | 'actual'
  | 'gapForecast'
  | 'gapAdjusted'
  | 'annualForecast'
  | 'annualAdjusted'
  | 'projectedRevenue'
  | 'gapProjectedForecast'
  | 'gapProjectedAdjusted';

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

function lineLabel(line: Pick<YtdGapLine, 'itemSku' | 'customerPartNumber'>): string {
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
  const [analysisView, setAnalysisView] = useState<AnalysisView>('ytd');
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
        case 'annualForecast':
          return group.annualForecast;
        case 'annualAdjusted':
          return group.annualAdjusted;
        case 'projectedRevenue':
          return group.projectedRevenue;
        case 'gapProjectedForecast':
          return group.projectedRevenue - group.annualForecast;
        case 'gapProjectedAdjusted':
          return group.projectedRevenue - group.annualAdjusted;
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
  const goals = analysisView === 'ytd' ? totals?.goals || null : totals?.annualGoals || null;
  const comparison = dataset?.comparison || null;
  const windowLabel = dataset?.throughMonthLabel
    ? `January–${dataset.throughMonthLabel} ${dataset.year}`
    : `${dataset?.year ?? year}`;
  const projectedVariance = totals ? totals.projectedRevenue - totals.annualForecast : null;
  const projectedGapHint =
    projectedVariance == null || Math.round(projectedVariance) === 0
      ? 'On forecast'
      : projectedVariance > 0
      ? 'Above forecast'
      : 'Below forecast';
  const projectedRevenueHint = dataset?.throughMonthLabel
    ? `YTD Actuals + Forecast - ADJ after ${dataset.throughMonthLabel}`
    : 'YTD Actuals + Forecast - ADJ';

  const selectAnalysisView = (view: AnalysisView) => {
    setAnalysisView(view);
    setExpanded({});
    setSortKey(view === 'ytd' ? 'actual' : view === 'annual' ? 'projectedRevenue' : 'label');
    setSortAsc(false);
  };

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
          <div style={{ marginTop: 4, fontSize: 12, color: '#64748b', lineHeight: 1.5, whiteSpace: 'nowrap' }}>
            {analysisView === 'ytd'
              ? 'Year-to-date revenue dollars per line item, comparing the adjusted forecast against booked actuals through the last complete month.'
              : analysisView === 'annual'
              ? 'Projected full-year revenue: booked actuals through the last complete month plus Forecast - ADJ for the remaining months.'
              : 'Compare matching year-to-date actual revenue across the current year and the prior two years.'}
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

      <div
        role="tablist"
        aria-label="YTD gap analysis views"
        style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 8 }}
      >
        {([
          ['ytd', 'YTD Analysis'],
          ['annual', 'Annual Analysis'],
          ['comparison', 'YTD Comparison'],
        ] as const).map(([view, label]) => {
          const selected = analysisView === view;
          return (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectAnalysisView(view)}
              style={{
                border: '1px solid',
                borderColor: selected ? '#4f46e5' : '#cbd5e1',
                background: selected ? '#eef2ff' : '#ffffff',
                color: selected ? '#3730a3' : '#475569',
                borderRadius: 7,
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {dataset ? (
        <div style={{ fontSize: 12, color: '#334155' }}>
          {analysisView === 'ytd' || analysisView === 'comparison' ? 'YTD window: ' : 'Annual projection: '}
          <strong>{analysisView === 'ytd' || analysisView === 'comparison' ? windowLabel : dataset.year}</strong>
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

      {analysisView !== 'comparison' && totals && goals ? (
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
          {analysisView === 'ytd' ? (
            <>
              <Metric label="YTD Actuals" value={fmtMoney(totals.actual)} />
              <Metric label="YTD Forecasted" value={fmtMoney(totals.forecast)} />
              <Metric
                label="YTD vs Forecasted"
                value={fmtSignedMoney(totals.actual - totals.forecast)}
                hint={fmtAttainment(totals.actual, totals.forecast)}
                color={gapColor(totals.actual - totals.forecast)}
              />
              <Metric label="YTD Forecast - ADJ" value={fmtMoney(totals.adjusted)} />
              <Metric
                label="YTD vs Forecast - ADJ"
                value={fmtSignedMoney(totals.actual - totals.adjusted)}
                hint={fmtAttainment(totals.actual, totals.adjusted)}
                color={gapColor(totals.actual - totals.adjusted)}
              />
            </>
          ) : (
            <>
              <Metric label="Projected Year-End Revenue" value={fmtMoney(totals.projectedRevenue)} hint={projectedRevenueHint} />
              <Metric label="Full-Year Forecasted" value={fmtMoney(totals.annualForecast)} />
              <Metric
                label="vs Full-Year Forecasted"
                value={fmtSignedMoney(projectedVariance)}
                hint={`${projectedGapHint} · ${fmtAttainment(totals.projectedRevenue, totals.annualForecast)}`}
                color={gapColor(projectedVariance ?? 0)}
              />
            </>
          )}
          {(['baseline', 'growth', 'stretch'] as const).map((key) => {
            const goal = goals[key];
            const label = key === 'baseline' ? 'vs SGP Baseline' : key === 'growth' ? 'vs SGP Growth' : 'vs SGP Stretch';
            if (goal == null) return <Metric key={key} label={label} value="—" hint="no goal saved" />;
            const value = analysisView === 'ytd' ? totals.actual : totals.projectedRevenue;
            return (
              <Metric
                key={key}
                label={label}
                value={fmtSignedMoney(value - goal)}
                hint={fmtAttainment(value, goal)}
                color={gapColor(value - goal)}
              />
            );
          })}
        </div>
      ) : null}

      {analysisView === 'comparison' && comparison ? (
        <YtdComparisonTable comparison={comparison} expanded={expanded} setExpanded={setExpanded} />
      ) : null}

      {analysisView !== 'comparison' && (loading && !dataset ? (
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
                {analysisView === 'ytd' ? (
                  <>
                    {sortHeader('actual', 'YTD\nActuals')}
                    {sortHeader('forecast', 'YTD\nForecasted')}
                    {sortHeader('gapForecast', 'YTD Actuals -\nForecasted')}
                    <th style={th}>{'% of\nForecasted'}</th>
                    {sortHeader('adjusted', 'YTD\nForecast - ADJ')}
                    {sortHeader('gapAdjusted', 'YTD Actuals -\nForecast - ADJ')}
                    <th style={th}>{'% of\nForecast - ADJ'}</th>
                  </>
                ) : (
                  <>
                    {sortHeader('projectedRevenue', 'Projected\nYear-End Revenue')}
                    {sortHeader('annualForecast', 'Full-Year\nForecasted')}
                    {sortHeader('gapProjectedForecast', 'vs Full-Year\nForecasted')}
                    <th style={th}>{'% of Full-Year\nForecasted'}</th>
                    {sortHeader('annualAdjusted', 'Full-Year\nForecast - ADJ')}
                    {sortHeader('gapProjectedAdjusted', 'vs Full-Year\nForecast - ADJ')}
                    <th style={th}>{'% of Full-Year\nForecast - ADJ'}</th>
                  </>
                )}
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
                      {analysisView === 'ytd' ? (
                        <>
                          <td style={{ ...td, fontWeight: 700 }}>{fmtMoney(group.actual)}</td>
                          <td style={td}>{fmtMoney(group.forecast)}</td>
                          <td style={{ ...td, color: gapColor(group.actual - group.forecast), fontWeight: 700 }}>
                            {fmtSignedMoney(group.actual - group.forecast)}
                          </td>
                          <td style={td}>{fmtAttainment(group.actual, group.forecast)}</td>
                          <td style={td}>{fmtMoney(group.adjusted)}</td>
                          <td style={{ ...td, color: gapColor(group.actual - group.adjusted), fontWeight: 700 }}>
                            {fmtSignedMoney(group.actual - group.adjusted)}
                          </td>
                          <td style={td}>{fmtAttainment(group.actual, group.adjusted)}</td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...td, fontWeight: 700 }}>{fmtMoney(group.projectedRevenue)}</td>
                          <td style={td}>{fmtMoney(group.annualForecast)}</td>
                          <td style={{ ...td, color: gapColor(group.projectedRevenue - group.annualForecast), fontWeight: 700 }}>
                            {fmtSignedMoney(group.projectedRevenue - group.annualForecast)}
                          </td>
                          <td style={td}>{fmtAttainment(group.projectedRevenue, group.annualForecast)}</td>
                          <td style={td}>{fmtMoney(group.annualAdjusted)}</td>
                          <td style={{ ...td, color: gapColor(group.projectedRevenue - group.annualAdjusted), fontWeight: 700 }}>
                            {fmtSignedMoney(group.projectedRevenue - group.annualAdjusted)}
                          </td>
                          <td style={td}>{fmtAttainment(group.projectedRevenue, group.annualAdjusted)}</td>
                        </>
                      )}
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
                            {analysisView === 'ytd' ? (
                              <>
                                <td style={td}>{fmtMoney(line.actual)}</td>
                                <td style={td}>{fmtMoney(line.forecast)}</td>
                                <td style={{ ...td, color: gapColor(line.actual - line.forecast) }}>
                                  {fmtSignedMoney(line.actual - line.forecast)}
                                </td>
                                <td style={td}>{fmtAttainment(line.actual, line.forecast)}</td>
                                <td style={td}>{fmtMoney(line.adjusted)}</td>
                                <td style={{ ...td, color: gapColor(line.actual - line.adjusted) }}>
                                  {fmtSignedMoney(line.actual - line.adjusted)}
                                </td>
                                <td style={td}>{fmtAttainment(line.actual, line.adjusted)}</td>
                              </>
                            ) : (
                              <>
                                <td style={td}>{fmtMoney(line.projectedRevenue)}</td>
                                <td style={td}>{fmtMoney(line.annualForecast)}</td>
                                <td style={{ ...td, color: gapColor(line.projectedRevenue - line.annualForecast) }}>
                                  {fmtSignedMoney(line.projectedRevenue - line.annualForecast)}
                                </td>
                                <td style={td}>{fmtAttainment(line.projectedRevenue, line.annualForecast)}</td>
                                <td style={td}>{fmtMoney(line.annualAdjusted)}</td>
                                <td style={{ ...td, color: gapColor(line.projectedRevenue - line.annualAdjusted) }}>
                                  {fmtSignedMoney(line.projectedRevenue - line.annualAdjusted)}
                                </td>
                                <td style={td}>{fmtAttainment(line.projectedRevenue, line.annualAdjusted)}</td>
                              </>
                            )}
                          </tr>
                        ))
                      : null}
                  </React.Fragment>
                );
              })}
              {totals ? (
                <tr style={{ background: '#fffbeb', borderTop: '2px solid #f59e0b' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>Company total</td>
                  {analysisView === 'ytd' ? (
                    <>
                      <td style={{ ...td, fontWeight: 800 }}>{fmtMoney(totals.actual)}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{fmtMoney(totals.forecast)}</td>
                      <td style={{ ...td, fontWeight: 800, color: gapColor(totals.actual - totals.forecast) }}>
                        {fmtSignedMoney(totals.actual - totals.forecast)}
                      </td>
                      <td style={{ ...td, fontWeight: 800 }}>{fmtAttainment(totals.actual, totals.forecast)}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{fmtMoney(totals.adjusted)}</td>
                      <td style={{ ...td, fontWeight: 800, color: gapColor(totals.actual - totals.adjusted) }}>
                        {fmtSignedMoney(totals.actual - totals.adjusted)}
                      </td>
                      <td style={{ ...td, fontWeight: 800 }}>{fmtAttainment(totals.actual, totals.adjusted)}</td>
                    </>
                  ) : (
                    <>
                      <td style={{ ...td, fontWeight: 800 }}>{fmtMoney(totals.projectedRevenue)}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{fmtMoney(totals.annualForecast)}</td>
                      <td style={{ ...td, fontWeight: 800, color: gapColor(totals.projectedRevenue - totals.annualForecast) }}>
                        {fmtSignedMoney(totals.projectedRevenue - totals.annualForecast)}
                      </td>
                      <td style={{ ...td, fontWeight: 800 }}>{fmtAttainment(totals.projectedRevenue, totals.annualForecast)}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{fmtMoney(totals.annualAdjusted)}</td>
                      <td style={{ ...td, fontWeight: 800, color: gapColor(totals.projectedRevenue - totals.annualAdjusted) }}>
                        {fmtSignedMoney(totals.projectedRevenue - totals.annualAdjusted)}
                      </td>
                      <td style={{ ...td, fontWeight: 800 }}>{fmtAttainment(totals.projectedRevenue, totals.annualAdjusted)}</td>
                    </>
                  )}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ))}
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

function YtdComparisonTable({
  comparison,
  expanded,
  setExpanded,
}: {
  comparison: NonNullable<YtdGapDataset['comparison']>;
  expanded: Record<string, boolean>;
  setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const [oldestYear, priorYear, currentYear] = comparison.years;
  const actual = (row: YtdComparisonLine, year: number) => row.actualByYear[String(year)] || 0;
  const cells = (row: YtdComparisonLine, emphasize = false) => {
    const oldest = actual(row, oldestYear);
    const prior = actual(row, priorYear);
    const current = actual(row, currentYear);
    const gap = current - row.currentAdjusted;
    const style = emphasize ? { ...td, fontWeight: 800 } : td;
    return (
      <>
        <td style={style}>{fmtMoney(oldest)}</td>
        <td style={style}>{fmtMoney(prior)}</td>
        <td style={{ ...style, color: gapColor(prior - oldest) }}>{fmtSignedMoney(prior - oldest)}</td>
        <td style={style}>{fmtMoney(current)}</td>
        <td style={{ ...style, color: gapColor(current - prior) }}>{fmtSignedMoney(current - prior)}</td>
        <td style={style}>{fmtMoney(row.currentAdjusted)}</td>
        <td style={{ ...style, color: gapColor(gap) }}>{fmtSignedMoney(gap)}</td>
        <td style={style}>{fmtAttainment(current, row.currentAdjusted)}</td>
      </>
    );
  };

  return (
    <div style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, maxHeight: 620 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1180 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Group / Line item</th>
            <th style={th}>{`${oldestYear}\nYTD Actuals`}</th>
            <th style={th}>{`${priorYear}\nYTD Actuals`}</th>
            <th style={th}>{`$ Change\n${priorYear} vs ${oldestYear}`}</th>
            <th style={th}>{`${currentYear}\nYTD Actuals`}</th>
            <th style={th}>{`$ Change\n${currentYear} vs ${priorYear}`}</th>
            <th style={th}>{`${currentYear} YTD\nForecast - ADJ`}</th>
            <th style={th}>{`${currentYear} Actuals -\nForecast - ADJ`}</th>
            <th style={th}>{`% of Forecast - ADJ\n${currentYear} YTD`}</th>
          </tr>
        </thead>
        <tbody>
          {comparison.groups.map((group: YtdComparisonGroup) => {
            const isOpen = Boolean(expanded[group.key]);
            return (
              <React.Fragment key={group.key}>
                <tr style={{ background: '#ffffff' }}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>
                    <button
                      type="button"
                      onClick={() => setExpanded((previous) => ({ ...previous, [group.key]: !previous[group.key] }))}
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
                  {cells(group, true)}
                </tr>
                {isOpen
                  ? group.lines.map((line) => (
                      <tr key={line.key} style={{ background: '#f8fafc' }}>
                        <td style={{ ...td, textAlign: 'left', paddingLeft: 34, color: '#334155' }}>
                          <div style={{ fontWeight: 600 }}>{lineLabel(line)}</div>
                          {line.customerName ? <div style={{ fontSize: 11, color: '#64748b' }}>{line.customerName}</div> : null}
                        </td>
                        {cells(line)}
                      </tr>
                    ))
                  : null}
              </React.Fragment>
            );
          })}
          <tr style={{ background: '#fffbeb', borderTop: '2px solid #f59e0b' }}>
            <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>Company total</td>
            {cells(comparison.totals, true)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
