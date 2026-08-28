'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FORECAST_MONTH_FULL_LABELS,
  FORECAST_MONTHS,
  FORECAST_QUARTERS,
  closedMonths,
  monthQty,
  type ForecastMonth,
  type ForecastQuarter,
} from '@/lib/operations/product-revenue-forecast';
import {
  pctDaysShippedQuarter,
  pctDaysShippedYear,
  pctRevenueShipped,
  pctVsPlan,
  revenueDifference,
  type ProductGroupDataset,
  type ProductGroupRow,
} from '@/lib/operations/product-group-reports';

export type GroupReportView =
  | 'marginAnalysis'
  | 'monthlyForecast'
  | 'forecastRollup'
  | 'monthlyRevenue'
  | 'revenueRollup';

type ProductGroupReportsProps = {
  selectedCompanyId: string;
  enabledViews: Partial<Record<GroupReportView, boolean>>;
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

const ANNUAL_COL_HEADER_BG = '#fde68a';
const ANNUAL_COL_CELL_BG = '#fffbeb';
const ANNUAL_COL_BORDER = '#f59e0b';
const QUARTER_SHADES: Record<ForecastQuarter, { headerBg: string; cellBg: string; border: string; headerColor: string; cellColor: string }> = {
  1: { headerBg: '#a7f3d0', cellBg: '#ecfdf5', border: '#34d399', headerColor: '#065f46', cellColor: '#064e3b' },
  2: { headerBg: '#bae6fd', cellBg: '#f0f9ff', border: '#38bdf8', headerColor: '#075985', cellColor: '#0c4a6e' },
  3: { headerBg: '#ddd6fe', cellBg: '#f5f3ff', border: '#a78bfa', headerColor: '#5b21b6', cellColor: '#4c1d95' },
  4: { headerBg: '#fecdd3', cellBg: '#fff1f2', border: '#fb7185', headerColor: '#9f1239', cellColor: '#881337' },
};

const VIEW_ORDER: Array<{ key: GroupReportView; label: string }> = [
  { key: 'marginAnalysis', label: 'Group Margin Analysis' },
  { key: 'monthlyForecast', label: 'Monthly Forecast' },
  { key: 'forecastRollup', label: 'Forecast Rollup' },
  { key: 'monthlyRevenue', label: 'Monthly Revenue' },
  { key: 'revenueRollup', label: 'Revenue Rollup' },
];

function currentYear(): number {
  return new Date().getFullYear();
}

function yearOptions(): number[] {
  const year = currentYear();
  const end = 2030 + Math.max(0, year - 2026);
  return Array.from({ length: end - year + 1 }, (_, index) => year + index);
}

function currentMonth(): ForecastMonth {
  return ((new Date().getMonth() + 1) as ForecastMonth);
}

function fmtMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtQty(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('en-US');
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function fmtUnit(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function gmPct(revenue: number, costOfSales: number | null): number | null {
  if (!revenue || costOfSales == null) return null;
  return (revenue - costOfSales * 0) && revenue ? (revenue - (costOfSales || 0)) / revenue : null;
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <strong>{label}:</strong> {value}
    </span>
  );
}

export default function ProductGroupReports({ selectedCompanyId, enabledViews }: ProductGroupReportsProps) {
  const availableViews = VIEW_ORDER.filter((view) => enabledViews[view.key] !== false);
  const [view, setView] = useState<GroupReportView>(availableViews[0]?.key || 'marginAnalysis');
  const [year, setYear] = useState(currentYear());
  const [groupKey, setGroupKey] = useState('');
  const [month, setMonth] = useState<ForecastMonth>(currentMonth());
  const [dataset, setDataset] = useState<ProductGroupDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!availableViews.some((item) => item.key === view) && availableViews[0]) {
      setView(availableViews[0].key);
    }
  }, [availableViews, view]);

  const load = useCallback(async (nextYear = year) => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ companyId: selectedCompanyId, year: String(nextYear) });
      const response = await fetch(`/api/operational-data/product-groups?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load group reports');
      setDataset(payload as ProductGroupDataset);
    } catch (err: unknown) {
      setDataset(null);
      setError(err instanceof Error ? err.message : 'Failed to load group reports');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, year]);

  useEffect(() => {
    setGroupKey('');
    setDataset(null);
  }, [selectedCompanyId]);

  useEffect(() => {
    void load(year);
  }, [selectedCompanyId, year, load]);

  const rows = useMemo(() => {
    const all = dataset?.rows || [];
    return groupKey ? all.filter((row) => row.key === groupKey) : all;
  }, [dataset, groupKey]);

  const dataThru = dataset?.dataThru || '';
  const closed = closedMonths(dataThru || null);
  const shippingDays = dataset?.shippingDays || [];

  const th: React.CSSProperties = {
    textAlign: 'right',
    padding: '8px 8px',
    color: '#334155',
    background: '#f8fafc',
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    verticalAlign: 'bottom',
  };
  const td: React.CSSProperties = {
    padding: '8px 8px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderTop: '1px solid #e2e8f0',
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
  };
  const sticky: React.CSSProperties = {
    position: 'sticky',
    left: 0,
    zIndex: 3,
    textAlign: 'left',
    background: '#ffffff',
    boxShadow: '2px 0 0 #e2e8f0',
    fontWeight: 700,
    color: '#1e293b',
  };

  const quarterHeader = (quarter: ForecastQuarter): React.CSSProperties => {
    const shade = QUARTER_SHADES[quarter];
    return {
      textAlign: 'center',
      padding: '6px 6px',
      color: shade.headerColor,
      background: shade.headerBg,
      fontSize: 12,
      fontWeight: 800,
      borderLeft: `2px solid ${shade.border}`,
      borderBottom: `1px solid ${shade.border}`,
    };
  };
  const quarterMetric = (quarter: ForecastQuarter, first: boolean): React.CSSProperties => {
    const shade = QUARTER_SHADES[quarter];
    return {
      ...th,
      color: shade.headerColor,
      background: shade.headerBg,
      borderLeft: first ? `2px solid ${shade.border}` : undefined,
    };
  };
  const quarterCell = (quarter: ForecastQuarter, first: boolean): React.CSSProperties => {
    const shade = QUARTER_SHADES[quarter];
    return {
      ...td,
      background: shade.cellBg,
      color: shade.cellColor,
      borderLeft: first ? `2px solid ${shade.border}` : undefined,
    };
  };

  const copy: Record<GroupReportView, { title: string; body: string }> = {
    marginAnalysis: {
      title: 'Group Margin Analysis',
      body: 'SGP vs projected economics rolled up to Customer Group from Infor CSI, saved product forecast/price tables, Duties & Tariffs, and Freight. Per-piece fields are volume-weighted. Annual dollars sum from Products. Leave Group blank for every group.',
    },
    monthlyForecast: {
      title: 'Monthly Forecast',
      body: 'Monthly forecast units by Customer Group. Forecast - ADJ uses shipped qty for closed months. Leave Group blank for every group.',
    },
    forecastRollup: {
      title: 'Forecast Rollup',
      body: 'Quarterly and annual unit rollup of Monthly Forecast by Customer Group.',
    },
    monthlyRevenue: {
      title: 'Monthly Revenue',
      body: 'Monthly forecasted $ vs booked $ by Customer Group. Forecasted is group forecast units × Jan-1 contract price.',
    },
    revenueRollup: {
      title: 'Revenue Rollup',
      body: 'Quarterly and annual revenue $ by Customer Group, using the same Forecasted and Forecast - ADJ dollars as Monthly Revenue.',
    },
  };

  const shiftMonth = (delta: number) => {
    setMonth(((((month - 1 + delta) % 12) + 12) % 12) + 1 as ForecastMonth);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {availableViews.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setView(item.key)}
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 999,
              padding: '8px 12px',
              background: view === item.key ? '#e0e7ff' : '#ffffff',
              color: view === item.key ? '#3730a3' : '#334155',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{copy[view].title}</h3>
      <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 13, lineHeight: 1.5 }}>{copy[view].body}</p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Group
          <select value={groupKey} onChange={(event) => setGroupKey(event.target.value)} style={{ ...inputStyle, minWidth: 240 }}>
            <option value="">All groups</option>
            {(dataset?.groups || []).map((group) => (
              <option key={group.key} value={group.key}>{group.label} ({group.skuCount})</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Year
          <select value={year} onChange={(event) => setYear(Number(event.target.value))} style={{ ...inputStyle, width: 108 }}>
            {yearOptions().map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Data thru
          <div style={{ ...inputStyle, width: 150, background: '#f8fafc', color: dataThru ? '#0f172a' : '#94a3b8' }}>
            {dataThru || '—'}
          </div>
        </label>
        {(view === 'monthlyForecast' || view === 'monthlyRevenue') ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
            Month
            <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <button type="button" onClick={() => shiftMonth(-1)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, width: 28, height: 30, background: '#ffffff', cursor: 'pointer', fontWeight: 700 }}>‹</button>
              <select value={month} onChange={(event) => setMonth(Number(event.target.value) as ForecastMonth)} style={{ ...inputStyle, width: 132 }}>
                {FORECAST_MONTHS.map((item) => (
                  <option key={item} value={item}>{FORECAST_MONTH_FULL_LABELS[item]}</option>
                ))}
              </select>
              <button type="button" onClick={() => shiftMonth(1)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, width: 28, height: 30, background: '#ffffff', cursor: 'pointer', fontWeight: 700 }}>›</button>
            </span>
          </label>
        ) : null}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#334155', marginBottom: 12 }}>
        <Chip label="Scope" value={groupKey || 'All groups'} />
        <Chip label="SKUs" value={fmtQty(rows.reduce((sum, row) => sum + row.skuCount, 0))} />
        <Chip label="Updated" value={dataset?.workbookUpdated || '—'} />
        <Chip label="Data thru" value={dataThru || '—'} />
        {closed.length ? <Chip label="Closed through" value={FORECAST_MONTH_FULL_LABELS[closed[closed.length - 1]]} /> : null}
        <Chip label="% Days Shipped" value={fmtPct(pctDaysShippedYear(shippingDays, year, dataThru || null))} />
      </div>

      {error ? <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div> : null}
      {loading ? <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>Loading group reports…</div> : null}
      {!loading && !rows.length ? (
        <div style={{ color: '#64748b', fontSize: 13 }}>No group rows yet. Save Products Monthly Forecast and Monthly Revenue, then return here.</div>
      ) : null}

      {!loading && rows.length && view === 'marginAnalysis' ? (
        <MarginTables rows={rows} year={year} th={th} td={td} sticky={sticky} />
      ) : null}
      {!loading && rows.length && view === 'monthlyForecast' ? (
        <MonthlyForecastTable rows={rows} month={month} th={th} td={td} sticky={sticky} />
      ) : null}
      {!loading && rows.length && view === 'forecastRollup' ? (
        <ForecastRollupTable rows={rows} year={year} th={th} td={td} sticky={sticky} quarterHeader={quarterHeader} quarterMetric={quarterMetric} quarterCell={quarterCell} />
      ) : null}
      {!loading && rows.length && view === 'monthlyRevenue' ? (
        <MonthlyRevenueTable rows={rows} month={month} shippingDays={shippingDays} year={year} dataThru={dataThru} th={th} td={td} sticky={sticky} />
      ) : null}
      {!loading && rows.length && view === 'revenueRollup' ? (
        <RevenueRollupTable rows={rows} year={year} shippingDays={shippingDays} dataThru={dataThru} th={th} td={td} sticky={sticky} quarterHeader={quarterHeader} quarterMetric={quarterMetric} quarterCell={quarterCell} />
      ) : null}
    </div>
  );
}

function IdentityCells({
  row,
  sticky,
  td,
}: {
  row: ProductGroupRow;
  sticky: React.CSSProperties;
  td: React.CSSProperties;
}) {
  return (
    <>
      <td style={{ ...td, ...sticky }}>{row.customerGroup}</td>
      <td style={{ ...td, textAlign: 'left' }}>{row.skuCount.toLocaleString()}</td>
    </>
  );
}

function MarginTables({
  rows,
  year,
  th,
  td,
  sticky,
}: {
  rows: ProductGroupRow[];
  year: number;
  th: React.CSSProperties;
  td: React.CSSProperties;
  sticky: React.CSSProperties;
}) {
  const sgpCos = (row: ProductGroupRow) => (row.sgpCostOfSales != null ? row.sgpCostOfSales * row.sgpUsage : null);
  const projCos = (row: ProductGroupRow) => (row.projectedCostOfSales != null ? row.projectedCostOfSales * row.projectedUsageAdj : null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Group</th>
              <th style={{ ...th, textAlign: 'left' }}>SKUs</th>
              <th style={th}>SGP Price</th>
              <th style={th}>SGP Material</th>
              <th style={th}>SGP Tariff/pc</th>
              <th style={th}>SGP Duty/pc</th>
              <th style={th}>SGP Freight/pc</th>
              <th style={th}>SGP COS</th>
              <th style={th}>SGP OpEx</th>
              <th style={th}>SGP Fully loaded</th>
              <th style={th}>SGP NP</th>
              <th style={th}>Current price</th>
              <th style={th}>Updated material</th>
              <th style={th}>Proj tariff/pc</th>
              <th style={th}>Proj duty/pc</th>
              <th style={th}>Proj freight/pc</th>
              <th style={th}>Proj COS</th>
              <th style={th}>Proj OpEx</th>
              <th style={th}>Proj fully loaded</th>
              <th style={th}>Proj NP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <IdentityCells row={row} sticky={sticky} td={td} />
                <td style={td}>{fmtUnit(row.sgpPrice)}</td>
                <td style={td}>{fmtUnit(row.sgpMaterial)}</td>
                <td style={td}>{fmtUnit(row.sgpTariff)}</td>
                <td style={td}>{fmtUnit(row.sgpDuty)}</td>
                <td style={td}>{fmtUnit(row.sgpFreight)}</td>
                <td style={td}>{fmtUnit(row.sgpCostOfSales)}</td>
                <td style={td}>{fmtUnit(row.sgpOpex)}</td>
                <td style={td}>{fmtUnit(row.sgpFullyLoaded)}</td>
                <td style={td}>{fmtUnit(row.sgpNetProfit)}</td>
                <td style={td}>{fmtUnit(row.projectedPrice)}</td>
                <td style={td}>{fmtUnit(row.projectedMaterial)}</td>
                <td style={td}>{fmtUnit(row.projectedTariff)}</td>
                <td style={td}>{fmtUnit(row.projectedDuty)}</td>
                <td style={td}>{fmtUnit(row.projectedFreight)}</td>
                <td style={td}>{fmtUnit(row.projectedCostOfSales)}</td>
                <td style={td}>{fmtUnit(row.projectedOpex)}</td>
                <td style={td}>{fmtUnit(row.projectedFullyLoaded)}</td>
                <td style={td}>{fmtUnit(row.projectedNetProfit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', background: ANNUAL_COL_HEADER_BG }} rowSpan={2}>Group</th>
              <th style={{ ...th, textAlign: 'left', background: ANNUAL_COL_HEADER_BG }} rowSpan={2}>SKUs</th>
              <th colSpan={6} style={{ ...th, textAlign: 'center', background: ANNUAL_COL_HEADER_BG, color: '#92400e', borderLeft: `2px solid ${ANNUAL_COL_BORDER}` }}>
                SGP {year}
              </th>
              <th colSpan={6} style={{ ...th, textAlign: 'center', background: '#bae6fd', color: '#075985' }}>
                Projected {year}
              </th>
            </tr>
            <tr>
              {['Usage', 'Revenue', 'COS $', 'GM %', 'NP $', 'NP %'].map((label) => (
                <th key={`s-${label}`} style={{ ...th, background: ANNUAL_COL_HEADER_BG, color: '#92400e' }}>{label}</th>
              ))}
              {['Usage-ADJ', 'Revenue', 'COS $', 'GM %', 'YTD $', '% YTD'].map((label) => (
                <th key={`p-${label}`} style={{ ...th, background: '#e0f2fe', color: '#075985' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const sgpCost = sgpCos(row);
              const projCost = projCos(row);
              return (
                <tr key={row.key}>
                  <IdentityCells row={row} sticky={{ ...sticky, background: ANNUAL_COL_CELL_BG }} td={{ ...td, background: ANNUAL_COL_CELL_BG }} />
                  <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtQty(row.sgpUsage)}</td>
                  <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtMoney(row.sgpRevenue)}</td>
                  <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtMoney(sgpCost)}</td>
                  <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtPct(gmPct(row.sgpRevenue, sgpCost))}</td>
                  <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtMoney(row.sgpNetProfit != null ? row.sgpNetProfit * row.sgpUsage : null)}</td>
                  <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtPct(row.sgpRevenue ? (row.sgpNetProfit != null ? (row.sgpNetProfit * row.sgpUsage) / row.sgpRevenue : null) : null)}</td>
                  <td style={{ ...td, background: '#f0f9ff' }}>{fmtQty(row.projectedUsageAdj)}</td>
                  <td style={{ ...td, background: '#f0f9ff' }}>{fmtMoney(row.projectedRevenueAdj)}</td>
                  <td style={{ ...td, background: '#f0f9ff' }}>{fmtMoney(projCost)}</td>
                  <td style={{ ...td, background: '#f0f9ff' }}>{fmtPct(gmPct(row.projectedRevenueAdj, projCost))}</td>
                  <td style={{ ...td, background: '#f0f9ff' }}>{fmtMoney(row.ytdRevenue)}</td>
                  <td style={{ ...td, background: '#f0f9ff' }}>{fmtPct(pctRevenueShipped(row.ytdRevenue, row.projectedRevenueAdj))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MonthlyForecastTable({
  rows,
  month,
  th,
  td,
  sticky,
}: {
  rows: ProductGroupRow[];
  month: ForecastMonth;
  th: React.CSSProperties;
  td: React.CSSProperties;
  sticky: React.CSSProperties;
}) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Group</th>
            <th style={{ ...th, textAlign: 'left' }}>SKUs</th>
            <th style={th}>Planned</th>
            <th style={th}>MTO</th>
            <th style={th}>Forecasted</th>
            <th style={th}>Forecast - ADJ</th>
            <th style={th}>Actual</th>
            <th style={th}>% vs Forecasted</th>
            <th style={th}>% vs Adj</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const forecasted = monthQty(row.forecastQty, month);
            const adjusted = monthQty(row.adjustedQty, month);
            const actual = monthQty(row.actualQty, month);
            return (
              <tr key={row.key}>
                <IdentityCells row={row} sticky={sticky} td={td} />
                <td style={td}>{row.plannedCount}</td>
                <td style={td}>{row.mtoCount}</td>
                <td style={td}>{fmtQty(forecasted)}</td>
                <td style={td}>{fmtQty(adjusted)}</td>
                <td style={td}>{fmtQty(actual)}</td>
                <td style={td}>{fmtPct(pctVsPlan(actual, forecasted))}</td>
                <td style={td}>{fmtPct(pctVsPlan(actual, adjusted))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ForecastRollupTable({
  rows,
  year,
  th,
  td,
  sticky,
  quarterHeader,
  quarterMetric,
  quarterCell,
}: {
  rows: ProductGroupRow[];
  year: number;
  th: React.CSSProperties;
  td: React.CSSProperties;
  sticky: React.CSSProperties;
  quarterHeader: (quarter: ForecastQuarter) => React.CSSProperties;
  quarterMetric: (quarter: ForecastQuarter, first: boolean) => React.CSSProperties;
  quarterCell: (quarter: ForecastQuarter, first: boolean) => React.CSSProperties;
}) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }} rowSpan={2}>Group</th>
            <th style={{ ...th, textAlign: 'left' }} rowSpan={2}>SKUs</th>
            {FORECAST_QUARTERS.map((quarter) => (
              <th key={quarter} colSpan={4} style={quarterHeader(quarter)}>{quarter}Q</th>
            ))}
            <th colSpan={5} style={{ ...th, textAlign: 'center', background: ANNUAL_COL_HEADER_BG, color: '#92400e', borderLeft: `2px solid ${ANNUAL_COL_BORDER}` }}>
              Annual {year}
            </th>
          </tr>
          <tr>
            {FORECAST_QUARTERS.map((quarter) => (
              <React.Fragment key={quarter}>
                <th style={quarterMetric(quarter, true)}>Forecasted</th>
                <th style={quarterMetric(quarter, false)}>Forecast - ADJ</th>
                <th style={quarterMetric(quarter, false)}>YTD</th>
                <th style={quarterMetric(quarter, false)}>% YTD vs Forecasted</th>
              </React.Fragment>
            ))}
            <th style={{ ...th, background: ANNUAL_COL_HEADER_BG, color: '#92400e' }}>SGP ESTIMATED</th>
            <th style={{ ...th, background: ANNUAL_COL_HEADER_BG, color: '#92400e' }}>FORECASTED</th>
            <th style={{ ...th, background: ANNUAL_COL_HEADER_BG, color: '#92400e' }}>FORECAST - ADJ</th>
            <th style={{ ...th, background: ANNUAL_COL_HEADER_BG, color: '#92400e' }}>YTD</th>
            <th style={{ ...th, background: ANNUAL_COL_HEADER_BG, color: '#92400e' }}>% YTD vs Forecasted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <IdentityCells row={row} sticky={sticky} td={td} />
              {FORECAST_QUARTERS.map((quarter) => {
                const q = row.quarters[quarter];
                return (
                  <React.Fragment key={quarter}>
                    <td style={quarterCell(quarter, true)}>{fmtQty(q.forecastQty)}</td>
                    <td style={quarterCell(quarter, false)}>{fmtQty(q.adjustedQty)}</td>
                    <td style={quarterCell(quarter, false)}>{fmtQty(q.ytdQty)}</td>
                    <td style={quarterCell(quarter, false)}>{fmtPct(pctVsPlan(q.ytdQty, q.forecastQty))}</td>
                  </React.Fragment>
                );
              })}
              <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtQty(row.sgpUsage)}</td>
              <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtQty(row.projectedUsage)}</td>
              <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtQty(row.projectedUsageAdj)}</td>
              <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtQty(row.ytdQty)}</td>
              <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtPct(pctVsPlan(row.ytdQty, row.projectedUsage))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyRevenueTable({
  rows,
  month,
  shippingDays,
  year,
  dataThru,
  th,
  td,
  sticky,
}: {
  rows: ProductGroupRow[];
  month: ForecastMonth;
  shippingDays: ProductGroupDataset['shippingDays'];
  year: number;
  dataThru: string;
  th: React.CSSProperties;
  td: React.CSSProperties;
  sticky: React.CSSProperties;
}) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Group</th>
            <th style={{ ...th, textAlign: 'left' }}>SKUs</th>
            <th style={th}>Forecasted $</th>
            <th style={th}>Forecast - ADJ $</th>
            <th style={th}>Actual $</th>
            <th style={th}>% vs Forecasted</th>
            <th style={th}>% vs Adj</th>
            <th style={th}>Difference</th>
            <th style={th}>% Days Shipped</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const estimated = monthQty(row.estimated, month);
            const adjusted = monthQty(row.estimatedAdjusted, month);
            const actual = monthQty(row.actualRevenue, month);
            return (
              <tr key={row.key}>
                <IdentityCells row={row} sticky={sticky} td={td} />
                <td style={td}>{fmtMoney(estimated)}</td>
                <td style={td}>{fmtMoney(adjusted)}</td>
                <td style={td}>{fmtMoney(actual)}</td>
                <td style={td}>{fmtPct(pctRevenueShipped(actual, estimated))}</td>
                <td style={td}>{fmtPct(pctRevenueShipped(actual, adjusted))}</td>
                <td style={td}>{fmtMoney(revenueDifference(actual, estimated))}</td>
                <td style={td}>{fmtPct(pctDaysShippedYear(shippingDays, year, dataThru || null))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RevenueRollupTable({
  rows,
  year,
  shippingDays,
  dataThru,
  th,
  td,
  sticky,
  quarterHeader,
  quarterMetric,
  quarterCell,
}: {
  rows: ProductGroupRow[];
  year: number;
  shippingDays: ProductGroupDataset['shippingDays'];
  dataThru: string;
  th: React.CSSProperties;
  td: React.CSSProperties;
  sticky: React.CSSProperties;
  quarterHeader: (quarter: ForecastQuarter) => React.CSSProperties;
  quarterMetric: (quarter: ForecastQuarter, first: boolean) => React.CSSProperties;
  quarterCell: (quarter: ForecastQuarter, first: boolean) => React.CSSProperties;
}) {
  const annualEstimated = rows.reduce((sum, row) => sum + row.projectedRevenue, 0);
  const annualAdjusted = rows.reduce((sum, row) => sum + row.projectedRevenueAdj, 0);
  const annualYtd = rows.reduce((sum, row) => sum + row.ytdRevenue, 0);
  return (
    <div>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff', padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#0f172a' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', letterSpacing: 0.4 }}>ANNUAL</div>
          <Chip label="Forecasted" value={fmtMoney(annualEstimated)} />
          <Chip label="Forecast - ADJ" value={fmtMoney(annualAdjusted)} />
          <Chip label="YTD" value={fmtMoney(annualYtd)} />
          <Chip label="% YTD vs Forecasted" value={fmtPct(pctRevenueShipped(annualYtd, annualEstimated))} />
          <Chip label="% YTD vs Forecast - Adj" value={fmtPct(pctRevenueShipped(annualYtd, annualAdjusted))} />
        </div>
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }} rowSpan={2}>Group</th>
              <th style={{ ...th, textAlign: 'left' }} rowSpan={2}>SKUs</th>
              {FORECAST_QUARTERS.map((quarter) => (
                <th key={quarter} colSpan={5} style={quarterHeader(quarter)}>{quarter}Q</th>
              ))}
              <th colSpan={5} style={{ ...th, textAlign: 'center', background: ANNUAL_COL_HEADER_BG, color: '#92400e', borderLeft: `2px solid ${ANNUAL_COL_BORDER}` }}>
                Annual {year}
              </th>
            </tr>
            <tr>
              {FORECAST_QUARTERS.map((quarter) => (
                <React.Fragment key={quarter}>
                  <th style={quarterMetric(quarter, true)}>Forecasted</th>
                  <th style={quarterMetric(quarter, false)}>Forecast - ADJ</th>
                  <th style={quarterMetric(quarter, false)}>YTD</th>
                  <th style={quarterMetric(quarter, false)}>% vs Fcst</th>
                  <th style={quarterMetric(quarter, false)}>% vs Adj</th>
                </React.Fragment>
              ))}
              <th style={{ ...th, background: ANNUAL_COL_HEADER_BG, color: '#92400e' }}>Forecasted</th>
              <th style={{ ...th, background: ANNUAL_COL_HEADER_BG, color: '#92400e' }}>Forecast - ADJ</th>
              <th style={{ ...th, background: ANNUAL_COL_HEADER_BG, color: '#92400e' }}>YTD</th>
              <th style={{ ...th, background: ANNUAL_COL_HEADER_BG, color: '#92400e' }}>% vs Fcst</th>
              <th style={{ ...th, background: ANNUAL_COL_HEADER_BG, color: '#92400e' }}>% vs Adj</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <IdentityCells row={row} sticky={sticky} td={td} />
                {FORECAST_QUARTERS.map((quarter) => {
                  const q = row.quarters[quarter];
                  return (
                    <React.Fragment key={quarter}>
                      <td style={quarterCell(quarter, true)}>{fmtMoney(q.estimated)}</td>
                      <td style={quarterCell(quarter, false)}>{fmtMoney(q.adjusted)}</td>
                      <td style={quarterCell(quarter, false)}>{fmtMoney(q.ytd)}</td>
                      <td style={quarterCell(quarter, false)}>{fmtPct(pctRevenueShipped(q.ytd, q.estimated))}</td>
                      <td style={quarterCell(quarter, false)}>{fmtPct(pctRevenueShipped(q.ytd, q.adjusted))}</td>
                    </React.Fragment>
                  );
                })}
                <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtMoney(row.projectedRevenue)}</td>
                <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtMoney(row.projectedRevenueAdj)}</td>
                <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtMoney(row.ytdRevenue)}</td>
                <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtPct(pctRevenueShipped(row.ytdRevenue, row.projectedRevenue))}</td>
                <td style={{ ...td, background: ANNUAL_COL_CELL_BG }}>{fmtPct(pctRevenueShipped(row.ytdRevenue, row.projectedRevenueAdj))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
