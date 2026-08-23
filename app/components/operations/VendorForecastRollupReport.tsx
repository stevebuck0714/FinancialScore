'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FORECAST_MONTH_LABELS,
  FORECAST_QUARTERS,
  annualAdjustedQty,
  closedMonths,
  monthQtyTotal,
  pctVsPlan,
  quarterAdjustedQty,
  quarterActualQty,
  quarterForecastQty,
  ytdActualQty,
  type ForecastQuarter,
} from '@/lib/operations/product-revenue-forecast';
import { type VendorMonthlyForecastLineInput } from '@/lib/operations/vendor-monthly-forecast';

type VendorOption = {
  vendorId: string;
  vendorName: string;
  key: string;
  label: string;
  lineCount?: number;
};

type ForecastLine = VendorMonthlyForecastLineInput & { id: string };

type VendorForecastRollupReportProps = {
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
  key: 'itemSku' | 'customerName' | 'customerPartNumber';
  label: string;
  widthCh: number;
}> = [
  { key: 'itemSku', label: 'APR P/N', widthCh: 12 },
  { key: 'customerName', label: 'Customer', widthCh: 18 },
  { key: 'customerPartNumber', label: 'Customer P/N', widthCh: 12 },
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
  'Estimated',
  'Estimated - ADJ',
  'YTD',
  '% YTD vs Estimated',
] as const;

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

function fmtQty(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function fmtPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function quarterLabel(quarter: ForecastQuarter): string {
  return `${quarter}Q`;
}

export default function VendorForecastRollupReport({
  selectedCompanyId,
  onOpenInfo,
}: VendorForecastRollupReportProps) {
  const [year, setYear] = useState(currentYear());
  const [dataThru, setDataThru] = useState('');
  const [vendorKey, setVendorKey] = useState('');
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [lines, setLines] = useState<ForecastLine[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vendorsRequestSeq = useRef(0);

  const selectedVendor = useMemo(
    () => vendors.find((vendor) => vendor.key === vendorKey) || null,
    [vendors, vendorKey]
  );

  const closed = useMemo(() => closedMonths(dataThru || null), [dataThru]);

  const loadVendors = useCallback(async (nextYear = year) => {
    if (!selectedCompanyId) return;
    const seq = ++vendorsRequestSeq.current;
    setLoadingVendors(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/operational-data/vendor-forecast?companyId=${encodeURIComponent(selectedCompanyId)}&year=${nextYear}`
      );
      const payload = await response.json().catch(() => ({}));
      if (seq !== vendorsRequestSeq.current) return;
      if (!response.ok) throw new Error(payload.error || 'Failed to load vendors');
      setVendors(payload.vendors || []);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
    } catch (err: any) {
      if (seq !== vendorsRequestSeq.current) return;
      setError(err?.message || 'Failed to load vendors');
    } finally {
      if (seq === vendorsRequestSeq.current) setLoadingVendors(false);
    }
  }, [selectedCompanyId, year]);

  const loadLines = useCallback(async (vendor: VendorOption, nextYear = year) => {
    if (!selectedCompanyId || !vendor) return;
    setLoadingLines(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        year: String(nextYear),
        vendorId: vendor.vendorId,
        vendorName: vendor.vendorName,
      });
      const response = await fetch(`/api/operational-data/vendor-forecast?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load forecast rows');
      setLines(Array.isArray(payload.lines) ? payload.lines : []);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
    } catch (err: any) {
      setError(err?.message || 'Failed to load forecast rows');
      setLines([]);
    } finally {
      setLoadingLines(false);
    }
  }, [selectedCompanyId, year]);

  useEffect(() => {
    setVendorKey('');
    setLines([]);
  }, [selectedCompanyId]);

  useEffect(() => {
    setLines([]);
    void loadVendors();
  }, [selectedCompanyId, year, loadVendors]);

  useEffect(() => {
    if (!selectedVendor) {
      setLines([]);
      return;
    }
    void loadLines(selectedVendor);
  }, [selectedVendor?.key, loadLines]);

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        acc.sgpEstimated += Number(line.annualBaseQty) || 0;
        acc.annualForecast += monthQtyTotal(line.forecastQty);
        acc.annualAdjusted += annualAdjustedQty(line.forecastQty, line.actualQty, dataThru || null);
        acc.ytdActual += ytdActualQty(line.actualQty, dataThru || null);
        FORECAST_QUARTERS.forEach((quarter) => {
          acc.quarterForecast[quarter] += quarterForecastQty(line.forecastQty, quarter);
          acc.quarterAdjusted[quarter] += quarterAdjustedQty(line.forecastQty, line.actualQty, dataThru || null, quarter);
          acc.quarterYtd[quarter] += quarterActualQty(line.actualQty, quarter);
        });
        return acc;
      },
      {
        sgpEstimated: 0,
        annualForecast: 0,
        annualAdjusted: 0,
        ytdActual: 0,
        quarterForecast: { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<ForecastQuarter, number>,
        quarterAdjusted: { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<ForecastQuarter, number>,
        quarterYtd: { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<ForecastQuarter, number>,
      }
    );
  }, [dataThru, lines]);

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
      minWidth: 88,
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
    minWidth: 88,
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
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Forecast Rollup</h3>
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
        Quarterly and annual totals built from the vendor monthly SGP forecast. Select a vendor to review the rollup.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Vendor
          <select
            value={vendorKey}
            onChange={(event) => setVendorKey(event.target.value)}
            disabled={loadingVendors && vendors.length === 0}
            style={{ ...inputStyle, minWidth: 280 }}
          >
            <option value="">
              {loadingVendors && vendors.length === 0 ? 'Loading vendors…' : 'Select a vendor'}
            </option>
            {vendors.map((vendor) => (
              <option key={vendor.key} value={vendor.key}>
                {vendor.label}{vendor.lineCount ? ` (${vendor.lineCount})` : ''}
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

      {loadingVendors && vendors.length === 0 && (
        <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>Loading vendors…</div>
      )}
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div>}

      {!selectedVendor ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>
          Select a vendor first. Quarter and annual columns are calculated from Monthly Forecast.
        </div>
      ) : loadingLines ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>Loading forecast rows…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#334155', marginBottom: 10 }}>
            <span><strong>Rows:</strong> {lines.length.toLocaleString()}</span>
            <span><strong>SGP estimated:</strong> {fmtQty(totals.sgpEstimated)}</span>
            <span><strong>Estimated {year}:</strong> {fmtQty(totals.annualForecast)}</span>
            <span><strong>Estimated - adjusted:</strong> {fmtQty(totals.annualAdjusted)}</span>
            <span><strong>YTD {year}:</strong> {fmtQty(totals.ytdActual)}</span>
            <span><strong>% YTD vs estimated:</strong> {fmtPct(pctVsPlan(totals.ytdActual, totals.annualForecast))}</span>
            {closed.length ? (
              <span><strong>Closed through:</strong> {FORECAST_MONTH_LABELS[closed[closed.length - 1]]}</span>
            ) : null}
          </div>
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
              <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Vendor</div>
              <div
                title={selectedVendor.label}
                style={{
                  fontSize: 13,
                  color: '#0f172a',
                  fontWeight: 600,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {selectedVendor.label}
              </div>
            </div>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: IDENTITY_COLUMNS_WIDTH_PX + 1680, fontSize: 12, tableLayout: 'fixed' }}>
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
                    <th key={quarter} colSpan={4} style={quarterGroupHeaderStyle(quarter)}>
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
                    SGP ESTIMATED
                  </th>
                  <th style={annualHeaderStyle}>ESTIMATED</th>
                  <th style={annualHeaderStyle}>ESTIMATED -<br />ADJUSTED</th>
                  <th style={annualHeaderStyle}>YTD</th>
                  <th style={annualHeaderStyle}>% YTD vs<br />Estimated</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const annualForecast = monthQtyTotal(line.forecastQty);
                  const annualAdjusted = annualAdjustedQty(line.forecastQty, line.actualQty, dataThru || null);
                  const ytdActual = ytdActualQty(line.actualQty, dataThru || null);
                  return (
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
                        const estimated = quarterForecastQty(line.forecastQty, quarter);
                        const adjusted = quarterAdjustedQty(line.forecastQty, line.actualQty, dataThru || null, quarter);
                        const ytd = quarterActualQty(line.actualQty, quarter);
                        return (
                          <React.Fragment key={quarter}>
                            <td style={quarterCellStyle(quarter, true)}>{fmtQty(estimated)}</td>
                            <td style={quarterCellStyle(quarter, false)}>{fmtQty(adjusted)}</td>
                            <td style={quarterCellStyle(quarter, false)}>{fmtQty(ytd)}</td>
                            <td style={quarterCellStyle(quarter, false)}>{fmtPct(pctVsPlan(ytd, estimated))}</td>
                          </React.Fragment>
                        );
                      })}
                      <td style={{ ...annualCellStyle, borderLeft: `2px solid ${ANNUAL_COL_BORDER}` }}>
                        {line.annualBaseQty == null ? '—' : fmtQty(Number(line.annualBaseQty))}
                      </td>
                      <td style={annualCellStyle}>{fmtQty(annualForecast)}</td>
                      <td style={annualCellStyle}>{fmtQty(annualAdjusted)}</td>
                      <td style={annualCellStyle}>{fmtQty(ytdActual)}</td>
                      <td style={annualCellStyle}>{fmtPct(pctVsPlan(ytdActual, annualForecast))}</td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={24} style={{ padding: 16, color: '#64748b' }}>
                      No forecast rows for this vendor yet. Import the workbook on Monthly Forecast, then return here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
