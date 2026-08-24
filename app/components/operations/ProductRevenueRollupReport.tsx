'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FORECAST_MONTH_LABELS,
  FORECAST_QUARTERS,
  closedMonths,
  type ForecastQuarter,
  type MonthQtyMap,
} from '@/lib/operations/product-revenue-forecast';
import {
  pctDaysShippedQuarter,
  pctDaysShippedYear,
  pctRevenueShipped,
  quarterActualRevenue,
  quarterAdjustedEstimatedDollars,
  quarterEstimatedDollars,
  revenueDifference,
  workbookUpdatedDate,
  type RevenueTotals,
  type ShippingDay,
} from '@/lib/operations/product-revenue-actual';

type CustomerOption = {
  customerId: string;
  customerName: string;
  key: string;
  label: string;
  lineCount?: number;
};

type RevenueLine = {
  id: string;
  customerId: string;
  customerName: string;
  customerGroup: string;
  customerPartNumber: string;
  itemSku: string;
  actualRevenue: MonthQtyMap;
  actualQty: MonthQtyMap;
  adjustedQty: MonthQtyMap;
  estimated: MonthQtyMap;
  forecastQty: MonthQtyMap;
  contractPrice: number | null;
  sgpEstimated: number;
  annualEstimated: number;
  annualAdjusted: number;
  annualYtd: number;
};

type ProductRevenueRollupReportProps = {
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

const IDENTITY_COLUMNS: Array<{
  key: 'itemSku' | 'customerPartNumber' | 'customerGroup';
  label: string;
  widthCh: number;
}> = [
  { key: 'itemSku', label: 'APR P/N', widthCh: 12 },
  { key: 'customerPartNumber', label: 'Customer P/N', widthCh: 12 },
  { key: 'customerGroup', label: 'Group', widthCh: 15 },
];

const CHAR_PX = 8;
const IDENTITY_CELL_PAD_X = 6;
const IDENTITY_CELL_EXTRA_PX = 28;
const ANNUAL_COL_HEADER_BG = '#fde68a';
const ANNUAL_COL_CELL_BG = '#fffbeb';
const ANNUAL_COL_BORDER = '#f59e0b';

const QUARTER_SHADES: Record<ForecastQuarter, {
  headerBg: string;
  cellBg: string;
  border: string;
  headerColor: string;
  cellColor: string;
}> = {
  1: { headerBg: '#a7f3d0', cellBg: '#ecfdf5', border: '#34d399', headerColor: '#065f46', cellColor: '#064e3b' },
  2: { headerBg: '#bae6fd', cellBg: '#f0f9ff', border: '#38bdf8', headerColor: '#075985', cellColor: '#0c4a6e' },
  3: { headerBg: '#ddd6fe', cellBg: '#f5f3ff', border: '#a78bfa', headerColor: '#5b21b6', cellColor: '#4c1d95' },
  4: { headerBg: '#fecdd3', cellBg: '#fff1f2', border: '#fb7185', headerColor: '#9f1239', cellColor: '#881337' },
};

const QUARTER_METRIC_HEADERS = [
  'Forecasted',
  'Forecast - ADJ',
  'YTD',
  '% YTD vs Forecasted',
  '% YTD vs Forecast - Adj',
] as const;
const QUARTER_SUMMARY_METRICS = [
  'Forecasted',
  'Forecast-ADJ',
  'YTD',
  '% vs Fcst',
  '% vs Adj',
  'Diff',
  'Days',
] as const;

function quarterSummaryColWidth(label: (typeof QUARTER_SUMMARY_METRICS)[number]): string {
  return label === '% vs Fcst' || label === '% vs Adj' || label === 'Days' ? '2.47%' : '4.4%';
}

function columnWidthPx(widthCh: number): number {
  return widthCh * CHAR_PX + IDENTITY_CELL_EXTRA_PX;
}

const IDENTITY_COLUMN_LEFT_PX = IDENTITY_COLUMNS.reduce<number[]>((offsets, column, index) => {
  offsets.push(index === 0 ? 0 : offsets[index - 1] + columnWidthPx(IDENTITY_COLUMNS[index - 1].widthCh));
  return offsets;
}, []);

const IDENTITY_COLUMNS_WIDTH_PX = IDENTITY_COLUMNS.reduce(
  (sum, column) => sum + columnWidthPx(column.widthCh),
  0
);

function columnWidth(widthCh: number): string {
  return `${columnWidthPx(widthCh)}px`;
}

function stickyIdentityStyle(index: number, header: boolean): React.CSSProperties {
  const isLast = index === IDENTITY_COLUMNS.length - 1;
  const width = columnWidth(IDENTITY_COLUMNS[index].widthCh);
  return {
    position: 'sticky',
    left: IDENTITY_COLUMN_LEFT_PX[index],
    width,
    minWidth: width,
    maxWidth: width,
    boxSizing: 'border-box',
    zIndex: header ? 4 : 3,
    background: header ? '#f8fafc' : '#ffffff',
    boxShadow: isLast ? '2px 0 0 #e2e8f0' : undefined,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: 'left',
    paddingLeft: header ? IDENTITY_CELL_PAD_X + 8 : IDENTITY_CELL_PAD_X,
    paddingRight: IDENTITY_CELL_PAD_X,
  };
}

function currentYear(): number {
  return new Date().getFullYear();
}

function yearOptions(): number[] {
  const year = currentYear();
  const end = 2030 + Math.max(0, year - 2026);
  return Array.from({ length: end - year + 1 }, (_, index) => year + index);
}

function fmtMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function fmtPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function quarterLabel(quarter: ForecastQuarter): string {
  return `${quarter}Q`;
}

function emptyTotals(): RevenueTotals {
  return {
    lineCount: 0,
    sgpEstimated: 0,
    annualEstimated: 0,
    annualAdjusted: 0,
    annualYtd: 0,
    months: {
      1: { estimated: 0, adjusted: 0, ytd: 0 }, 2: { estimated: 0, adjusted: 0, ytd: 0 }, 3: { estimated: 0, adjusted: 0, ytd: 0 },
      4: { estimated: 0, adjusted: 0, ytd: 0 }, 5: { estimated: 0, adjusted: 0, ytd: 0 }, 6: { estimated: 0, adjusted: 0, ytd: 0 },
      7: { estimated: 0, adjusted: 0, ytd: 0 }, 8: { estimated: 0, adjusted: 0, ytd: 0 }, 9: { estimated: 0, adjusted: 0, ytd: 0 },
      10: { estimated: 0, adjusted: 0, ytd: 0 }, 11: { estimated: 0, adjusted: 0, ytd: 0 }, 12: { estimated: 0, adjusted: 0, ytd: 0 },
    },
    quarters: { 1: { estimated: 0, adjusted: 0, ytd: 0 }, 2: { estimated: 0, adjusted: 0, ytd: 0 }, 3: { estimated: 0, adjusted: 0, ytd: 0 }, 4: { estimated: 0, adjusted: 0, ytd: 0 } },
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <strong>{label}:</strong> {value}
    </span>
  );
}

export default function ProductRevenueRollupReport({
  selectedCompanyId,
  onOpenInfo,
}: ProductRevenueRollupReportProps) {
  const [year, setYear] = useState(currentYear());
  const [dataThru, setDataThru] = useState('');
  const [customerKey, setCustomerKey] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [lines, setLines] = useState<RevenueLine[]>([]);
  const [totals, setTotals] = useState<RevenueTotals>(emptyTotals());
  const [shippingDays, setShippingDays] = useState<ShippingDay[]>([]);
  const [companyLineCount, setCompanyLineCount] = useState(0);
  const [priceCount, setPriceCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.key === customerKey) || null,
    [customers, customerKey]
  );
  const closed = useMemo(() => closedMonths(dataThru || null), [dataThru]);
  const updated = workbookUpdatedDate(dataThru || null);

  const mergeCustomers = useCallback((csi: CustomerOption[], revenue: CustomerOption[]) => {
    const byKey = new Map<string, CustomerOption>();
    [...csi, ...revenue].forEach((customer) => {
      const key = customer.key || `${customer.customerId}||${customer.customerName}`;
      const prior = byKey.get(key);
      byKey.set(key, {
        ...prior,
        ...customer,
        key,
        label: customer.label || customer.customerName || customer.customerId || 'Unknown customer',
        lineCount: customer.lineCount ?? prior?.lineCount,
      });
    });
    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const loadDataset = useCallback(async (nextYear = year, customer?: CustomerOption | null) => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const [csiRes, revenueRes] = await Promise.all([
        fetch(`/api/operational-data/product-raw?companyId=${encodeURIComponent(selectedCompanyId)}&view=customers`),
        fetch((() => {
          const params = new URLSearchParams({
            companyId: selectedCompanyId,
            year: String(nextYear),
          });
          if (customer) {
            params.set('customerId', customer.customerId);
            params.set('customerName', customer.customerName);
          }
          return `/api/operational-data/product-revenue?${params.toString()}`;
        })()),
      ]);
      const csiJson = await csiRes.json().catch(() => ({}));
      const revenueJson = await revenueRes.json().catch(() => ({}));
      if (!revenueRes.ok) throw new Error(revenueJson.error || 'Failed to load revenue rollup');
      setCustomers(mergeCustomers(csiJson.customers || [], revenueJson.customers || []));
      if (revenueJson.dataThru) setDataThru(String(revenueJson.dataThru).slice(0, 10));
      if (revenueJson.totals) setTotals(revenueJson.totals);
      if (typeof revenueJson.companyLineCount === 'number') setCompanyLineCount(revenueJson.companyLineCount);
      if (typeof revenueJson.priceCount === 'number') setPriceCount(revenueJson.priceCount);
      if (Array.isArray(revenueJson.shippingDays)) setShippingDays(revenueJson.shippingDays);
      setLines(Array.isArray(revenueJson.lines) ? revenueJson.lines : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load revenue rollup');
      setLines([]);
      setTotals(emptyTotals());
    } finally {
      setLoading(false);
    }
  }, [mergeCustomers, selectedCompanyId]);

  useEffect(() => {
    setCustomerKey('');
    setLines([]);
  }, [selectedCompanyId]);

  useEffect(() => {
    void loadDataset(year, selectedCustomer);
  }, [selectedCompanyId, year, selectedCustomer?.key, loadDataset]);

  const scopeLabel = selectedCustomer ? selectedCustomer.label : 'Company';
  const skuCount = selectedCustomer ? totals.lineCount : companyLineCount || totals.lineCount;

  const quarterGroupHeaderStyle = (quarter: ForecastQuarter): React.CSSProperties => {
    const shade = QUARTER_SHADES[quarter];
    return {
      textAlign: 'center',
      padding: '6px 6px',
      color: shade.headerColor,
      background: shade.headerBg,
      whiteSpace: 'nowrap',
      fontSize: 12,
      fontWeight: 800,
      letterSpacing: 0.2,
      borderLeft: `2px solid ${shade.border}`,
      borderBottom: `1px solid ${shade.border}`,
    };
  };
  const quarterMetricHeaderStyle = (quarter: ForecastQuarter, first: boolean): React.CSSProperties => {
    const shade = QUARTER_SHADES[quarter];
    return {
      textAlign: 'right',
      padding: '8px 6px',
      color: shade.headerColor,
      background: shade.headerBg,
      whiteSpace: 'normal',
      lineHeight: 1.25,
      minWidth: 72,
      fontSize: 11,
      fontWeight: 700,
      verticalAlign: 'bottom',
      borderLeft: first ? `2px solid ${shade.border}` : undefined,
    };
  };
  const quarterCellStyle = (quarter: ForecastQuarter, first: boolean): React.CSSProperties => {
    const shade = QUARTER_SHADES[quarter];
    return {
      padding: 6,
      textAlign: 'right',
      whiteSpace: 'nowrap',
      borderTop: `1px solid ${shade.border}`,
      borderLeft: first ? `2px solid ${shade.border}` : undefined,
      background: shade.cellBg,
      color: shade.cellColor,
    };
  };
  const annualHeaderStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '8px 6px',
    color: '#92400e',
    background: ANNUAL_COL_HEADER_BG,
    whiteSpace: 'normal',
    lineHeight: 1.25,
    minWidth: 72,
    fontSize: 11,
    fontWeight: 700,
    verticalAlign: 'bottom',
  };
  const annualCellStyle: React.CSSProperties = {
    padding: 6,
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderTop: `1px solid ${ANNUAL_COL_BORDER}`,
    background: ANNUAL_COL_CELL_BG,
    color: '#78350f',
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Revenue Rollup</h3>
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
      <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 13, lineHeight: 1.5, whiteSpace: 'nowrap' }}>
        Quarterly and annual revenue $ from the same Monthly Forecasted and Forecast - ADJ dollars. YTD is booked actual $. Leave Customer blank for company totals.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Customer
          <select
            value={customerKey}
            onChange={(event) => setCustomerKey(event.target.value)}
            style={{ ...inputStyle, minWidth: 280 }}
          >
            <option value="">All customers (company totals)</option>
            {customers.map((customer) => (
              <option key={customer.key} value={customer.key}>
                {customer.label}{customer.lineCount ? ` (${customer.lineCount})` : ''}
              </option>
            ))}
          </select>
        </label>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Data thru
          <div style={{ ...inputStyle, width: 150, background: '#f8fafc', color: dataThru ? '#0f172a' : '#94a3b8' }}>
            {dataThru || '—'}
          </div>
        </div>
      </div>

      {loading && <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>Loading revenue rollup…</div>}
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {!loading && skuCount > 0 && priceCount === 0 && (
        <div style={{ color: '#b45309', fontSize: 13, marginBottom: 8 }}>
          Forecasted $ is $0 because Jan-1 contract prices are not in the saved price list yet.
        </div>
      )}

      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          background: '#ffffff',
          padding: '12px 14px',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#334155', marginBottom: 8 }}>
          <Metric label="Scope" value={scopeLabel} />
          <Metric label="SKUs" value={skuCount.toLocaleString()} />
          <Metric label="Updated" value={updated || '—'} />
          <Metric label="Data thru" value={dataThru || '—'} />
          {closed.length ? <Metric label="Closed through" value={FORECAST_MONTH_LABELS[closed[closed.length - 1]]} /> : null}
          <Metric label="% Days Shipped" value={fmtPct(pctDaysShippedYear(shippingDays, year, dataThru || null))} />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#0f172a', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', letterSpacing: 0.4 }}>ANNUAL</div>
          <Metric label="Forecasted" value={fmtMoney(totals.annualEstimated)} />
          <Metric label="Forecast - ADJ" value={fmtMoney(totals.annualAdjusted)} />
          <Metric label="YTD" value={fmtMoney(totals.annualYtd)} />
          <Metric label="% YTD vs Forecasted" value={fmtPct(pctRevenueShipped(totals.annualYtd, totals.annualEstimated))} />
          <Metric label="% YTD vs Forecast - Adj" value={fmtPct(pctRevenueShipped(totals.annualYtd, totals.annualAdjusted))} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              borderCollapse: 'separate',
              borderSpacing: 0,
              width: '100%',
              tableLayout: 'fixed',
              fontSize: 12,
            }}
          >
            <colgroup>
              {FORECAST_QUARTERS.flatMap((quarter) =>
                QUARTER_SUMMARY_METRICS.map((label) => (
                  <col
                    key={`${quarter}-${label}`}
                    style={{ width: quarterSummaryColWidth(label) }}
                  />
                ))
              )}
            </colgroup>
            <thead>
              <tr>
                {FORECAST_QUARTERS.map((quarter) => (
                  <th key={quarter} colSpan={QUARTER_SUMMARY_METRICS.length} style={quarterGroupHeaderStyle(quarter)}>
                    {quarterLabel(quarter)}
                  </th>
                ))}
              </tr>
              <tr>
                {FORECAST_QUARTERS.map((quarter) => (
                  <React.Fragment key={quarter}>
                    {QUARTER_SUMMARY_METRICS.map((label, index) => (
                      <th
                        key={label}
                        style={{
                          ...quarterMetricHeaderStyle(quarter, index === 0),
                          minWidth: 0,
                          padding: '4px 6px',
                          fontSize: 10,
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </th>
                    ))}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {FORECAST_QUARTERS.map((quarter) => {
                  const q = totals.quarters[quarter] || { estimated: 0, adjusted: 0, ytd: 0 };
                  const values = [
                    fmtMoney(q.estimated),
                    fmtMoney(q.adjusted),
                    fmtMoney(q.ytd),
                    fmtPct(pctRevenueShipped(q.ytd, q.estimated)),
                    fmtPct(pctRevenueShipped(q.ytd, q.adjusted)),
                    fmtMoney(revenueDifference(q.ytd, q.estimated)),
                    fmtPct(pctDaysShippedQuarter(shippingDays, year, quarter, dataThru || null)),
                  ];
                  return (
                    <React.Fragment key={quarter}>
                      {values.map((value, index) => (
                        <td
                          key={QUARTER_SUMMARY_METRICS[index]}
                          style={{
                            ...quarterCellStyle(quarter, index === 0),
                            padding: '6px',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {value}
                        </td>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {!selectedCustomer ? (
        <div style={{ padding: '8px 0 24px', color: '#64748b', fontSize: 13 }}>
          Company totals above cover every SKU for these dates. Select a customer to see the part rollup.
        </div>
      ) : loading ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>Loading revenue rows…</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              padding: '10px 12px',
              borderBottom: '1px solid #e2e8f0',
              background: '#f8fafc',
              position: 'sticky',
              left: 0,
              zIndex: 5,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Customer</div>
            <div
              title={selectedCustomer.label}
              style={{
                fontSize: 13,
                color: '#0f172a',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedCustomer.label}
            </div>
          </div>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: IDENTITY_COLUMNS_WIDTH_PX + 1480, fontSize: 12, tableLayout: 'fixed' }}>
            <colgroup>
              {IDENTITY_COLUMNS.map((column) => (
                <col key={column.key} style={{ width: columnWidth(column.widthCh) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {IDENTITY_COLUMNS.map((column, index) => (
                  <th
                    key={column.key}
                    rowSpan={2}
                    title={column.label}
                    align="left"
                    style={{
                      ...stickyIdentityStyle(index, true),
                      textAlign: 'left',
                      paddingTop: 8,
                      paddingBottom: 8,
                      color: '#334155',
                      verticalAlign: 'bottom',
                    }}
                  >
                    {column.label}
                  </th>
                ))}
                {FORECAST_QUARTERS.map((quarter) => (
                  <th key={quarter} colSpan={5} style={quarterGroupHeaderStyle(quarter)}>
                    {quarterLabel(quarter)}
                  </th>
                ))}
                <th
                  colSpan={5}
                  style={{
                    textAlign: 'center',
                    padding: '6px 6px',
                    color: '#92400e',
                    background: ANNUAL_COL_HEADER_BG,
                    whiteSpace: 'nowrap',
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 0.2,
                    borderLeft: `2px solid ${ANNUAL_COL_BORDER}`,
                    borderBottom: `1px solid ${ANNUAL_COL_BORDER}`,
                  }}
                >
                  Annual {year}
                </th>
              </tr>
              <tr>
                {FORECAST_QUARTERS.map((quarter) => (
                  <React.Fragment key={quarter}>
                    {QUARTER_METRIC_HEADERS.map((label, index) => (
                      <th key={label} style={quarterMetricHeaderStyle(quarter, index === 0)}>
                        {label}
                      </th>
                    ))}
                  </React.Fragment>
                ))}
                <th style={{ ...annualHeaderStyle, borderLeft: `2px solid ${ANNUAL_COL_BORDER}` }}>
                  FORECASTED
                </th>
                <th style={annualHeaderStyle}>FORECAST -<br />ADJ</th>
                <th style={annualHeaderStyle}>YTD</th>
                <th style={annualHeaderStyle}>% YTD vs<br />Forecasted</th>
                <th style={annualHeaderStyle}>% YTD vs<br />Forecast - Adj</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  {IDENTITY_COLUMNS.map((column, index) => (
                    <td
                      key={column.key}
                      title={line[column.key] || undefined}
                      style={{
                        ...stickyIdentityStyle(index, false),
                        paddingTop: 6,
                        paddingBottom: 6,
                        borderTop: '1px solid #e2e8f0',
                      }}
                    >
                      {line[column.key] || '—'}
                    </td>
                  ))}
                  {FORECAST_QUARTERS.map((quarter) => {
                    const estimated = quarterEstimatedDollars(line.forecastQty, line.contractPrice, quarter);
                    const adjusted = quarterAdjustedEstimatedDollars(
                      line.forecastQty,
                      line.actualQty || {},
                      dataThru || null,
                      line.contractPrice,
                      quarter,
                      line.adjustedQty || {}
                    );
                    const ytd = quarterActualRevenue(line.actualRevenue, quarter);
                    return (
                      <React.Fragment key={quarter}>
                        <td style={quarterCellStyle(quarter, true)}>{fmtMoney(estimated)}</td>
                        <td style={quarterCellStyle(quarter, false)}>{fmtMoney(adjusted)}</td>
                        <td style={quarterCellStyle(quarter, false)}>{fmtMoney(ytd)}</td>
                        <td style={quarterCellStyle(quarter, false)}>{fmtPct(pctRevenueShipped(ytd, estimated))}</td>
                        <td style={quarterCellStyle(quarter, false)}>{fmtPct(pctRevenueShipped(ytd, adjusted))}</td>
                      </React.Fragment>
                    );
                  })}
                  <td style={{ ...annualCellStyle, borderLeft: `2px solid ${ANNUAL_COL_BORDER}` }}>
                    {fmtMoney(line.annualEstimated)}
                  </td>
                  <td style={annualCellStyle}>{fmtMoney(line.annualAdjusted)}</td>
                  <td style={annualCellStyle}>{fmtMoney(line.annualYtd)}</td>
                  <td style={annualCellStyle}>{fmtPct(pctRevenueShipped(line.annualYtd, line.annualEstimated))}</td>
                  <td style={annualCellStyle}>{fmtPct(pctRevenueShipped(line.annualYtd, line.annualAdjusted))}</td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={28} style={{ padding: 16, color: '#64748b' }}>
                    No revenue rows for this customer yet. Save Monthly Forecast and Monthly Revenue for this customer, then return here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
