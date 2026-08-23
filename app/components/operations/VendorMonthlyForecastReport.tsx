'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FORECAST_MONTH_FULL_LABELS,
  FORECAST_MONTH_LABELS,
  FORECAST_MONTHS,
  PRODUCTION_TYPE_OPTIONS,
  closedMonths,
  monthQty,
  pctVsPlan,
  remainingForecastQty,
  readProductOperationsWorkbook,
  workbookImportErrorMessage,
  type ForecastMonth,
  type MonthQtyMap,
} from '@/lib/operations/product-revenue-forecast';
import {
  parseVendorMonthlyForecastWorkbook,
  type VendorMonthlyForecastLineInput,
} from '@/lib/operations/vendor-monthly-forecast';

type VendorOption = {
  vendorId: string;
  vendorName: string;
  key: string;
  label: string;
  lineCount?: number;
};

type ForecastLine = VendorMonthlyForecastLineInput & { id: string };

type VendorMonthlyForecastReportProps = {
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

type IdentitySortKey = 'itemSku' | 'customerName' | 'customerPartNumber' | 'customerGroup';

const IDENTITY_COLUMNS: Array<{
  key: IdentitySortKey;
  label: string;
  widthCh: number;
}> = [
  { key: 'itemSku', label: 'APR P/N', widthCh: 12 },
  { key: 'customerName', label: 'Customer', widthCh: 18 },
  { key: 'customerPartNumber', label: 'Customer P/N', widthCh: 12 },
  { key: 'customerGroup', label: 'Group', widthCh: 12 },
];

const CHAR_PX = 8;
const IDENTITY_CELL_PAD_X = 6;
const IDENTITY_CELL_EXTRA_PX = 28;
const MONTH_COL_HEADER_BG = '#e0e7ff';
const MONTH_COL_CELL_BG = '#eef2ff';

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

const qtyInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: 68,
  minWidth: 68,
  textAlign: 'right',
  padding: '5px 4px',
};

function currentYear(): number {
  return new Date().getFullYear();
}

function currentMonth(): ForecastMonth {
  return (new Date().getMonth() + 1) as ForecastMonth;
}

function yearOptions(): number[] {
  const year = currentYear();
  const start = year - 1;
  const end = 2030 + Math.max(0, year - 2026);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function fmtQty(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function fmtPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function qtyValue(map: MonthQtyMap, month: ForecastMonth): number {
  return monthQty(map, month);
}

function compareIdentity(a: string, b: string): number {
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

export default function VendorMonthlyForecastReport({
  selectedCompanyId,
  onOpenInfo,
}: VendorMonthlyForecastReportProps) {
  const [year, setYear] = useState(currentYear());
  const [dataThru, setDataThru] = useState('');
  const [vendorKey, setVendorKey] = useState('');
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [lines, setLines] = useState<ForecastLine[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<ForecastMonth>(currentMonth());
  const [sortKey, setSortKey] = useState<IdentitySortKey>('itemSku');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const vendorsRequestSeq = useRef(0);

  const selectedVendor = useMemo(
    () => vendors.find((vendor) => vendor.key === vendorKey) || null,
    [vendors, vendorKey]
  );

  const closed = useMemo(() => closedMonths(dataThru || null), [dataThru]);
  const monthName = FORECAST_MONTH_FULL_LABELS[selectedMonth];
  const previousMonth = (selectedMonth === 1 ? 12 : selectedMonth - 1) as ForecastMonth;
  const previousMonthName = FORECAST_MONTH_FULL_LABELS[previousMonth];

  const loadVendors = useCallback(async (nextYear = year): Promise<VendorOption[]> => {
    if (!selectedCompanyId) return [];
    const seq = ++vendorsRequestSeq.current;
    setLoadingVendors(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/operational-data/vendor-forecast?companyId=${encodeURIComponent(selectedCompanyId)}&year=${nextYear}`
      );
      const payload = await response.json().catch(() => ({}));
      if (seq !== vendorsRequestSeq.current) return [];
      if (!response.ok) throw new Error(payload.error || 'Failed to load vendors');
      const nextVendors = Array.isArray(payload.vendors) ? payload.vendors : [];
      setVendors(nextVendors);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
      return nextVendors;
    } catch (err: any) {
      if (seq !== vendorsRequestSeq.current) return [];
      setError(err?.message || 'Failed to load vendors');
      return [];
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
      setDirty(false);
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
    setDirty(false);
  }, [selectedCompanyId]);

  useEffect(() => {
    setLines([]);
    setDirty(false);
    void loadVendors();
  }, [selectedCompanyId, year, loadVendors]);

  useEffect(() => {
    if (!selectedVendor) {
      setLines([]);
      setDirty(false);
      return;
    }
    void loadLines(selectedVendor);
  }, [selectedVendor?.key, loadLines]);

  const markDirty = () => {
    setDirty(true);
    setNotice(null);
  };

  const updateLine = (id: string, patch: Partial<ForecastLine>) => {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
    markDirty();
  };

  const updateMonthQty = (id: string, month: ForecastMonth, raw: string) => {
    const parsed = raw === '' ? 0 : Number(raw);
    const value = Number.isFinite(parsed) ? parsed : 0;
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        return { ...line, forecastQty: { ...line.forecastQty, [String(month)]: value } };
      })
    );
    markDirty();
  };

  const handleVendorChange = (nextKey: string) => {
    if (dirty && !window.confirm('You have unsaved changes. Switch vendor without saving?')) return;
    setVendorKey(nextKey);
  };

  const handleYearChange = (nextYear: number) => {
    if (dirty && !window.confirm('You have unsaved changes. Switch year without saving?')) return;
    setYear(nextYear);
  };

  const handleSave = async () => {
    if (!selectedCompanyId || !selectedVendor) return;
    if (lines.some((line) => !String(line.itemSku || '').trim())) {
      setError('Every row needs an APR P/N before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/operational-data/vendor-forecast', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          year,
          dataThru: dataThru || null,
          vendorId: selectedVendor.vendorId,
          vendorName: selectedVendor.vendorName,
          lines: lines.map((line) => ({
            ...line,
            vendorName: selectedVendor.vendorName,
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to save');
      setLines(Array.isArray(payload.lines) ? payload.lines : lines);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
      setDirty(false);
      const savedCount = Array.isArray(payload.lines) ? payload.lines.length : lines.length;
      setNotice(`Saved ${savedCount} rows for ${selectedVendor.label}.`);
      setVendors((prev) =>
        prev.map((vendor) =>
          vendor.key === selectedVendor.key ? { ...vendor, lineCount: savedCount } : vendor
        )
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to save monthly forecast');
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (file: File) => {
    if (!selectedCompanyId) {
      setError('Select a company before importing.');
      return;
    }
    if (dirty && !window.confirm('Import will replace matching vendor rows from the workbook. Continue?')) {
      return;
    }
    setImporting(true);
    setError(null);
    setNotice('Reading workbook…');
    try {
      const workbook = readProductOperationsWorkbook(await file.arrayBuffer());
      const parsed = parseVendorMonthlyForecastWorkbook(workbook, year);
      setNotice(`Saving ${parsed.rows.length.toLocaleString()} monthly forecast rows…`);
      const response = await fetch('/api/operational-data/vendor-forecast/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          year: parsed.year || year,
          parsed,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error || payload.message || `Failed to import workbook (${response.status})`
        );
      }
      const importedYear = Number(payload.year) || year;
      if (importedYear !== year) setYear(importedYear);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
      setDirty(false);
      const vendorCount = Number(payload.vendorCount || 0);
      setNotice(
        `Imported ${Number(payload.rowCount || 0).toLocaleString()} monthly forecast rows` +
          (vendorCount ? ` across ${vendorCount.toLocaleString()} vendors.` : '.')
      );
      const nextVendors = await loadVendors(importedYear);
      const preferred = nextVendors.find((vendor) => vendor.key === vendorKey) || nextVendors[0] || null;
      if (preferred) {
        setVendorKey(preferred.key);
        await loadLines(preferred, importedYear);
      }
    } catch (err: unknown) {
      console.error('Vendor monthly forecast import failed', err);
      setNotice(null);
      setError(workbookImportErrorMessage(err, 'Failed to import workbook'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        acc.remaining += remainingForecastQty(line.forecastQty, dataThru || null);
        acc.monthEstimated += qtyValue(line.forecastQty, selectedMonth);
        acc.monthYtd += qtyValue(line.actualQty, selectedMonth);
        acc.sgpEstimated += Number(line.annualBaseQty) || 0;
        return acc;
      },
      { remaining: 0, monthEstimated: 0, monthYtd: 0, sgpEstimated: 0 }
    );
  }, [dataThru, lines, selectedMonth]);

  const sortedLines = useMemo(() => {
    const next = [...lines];
    const direction = sortDir === 'asc' ? 1 : -1;
    next.sort((a, b) => {
      const primary = compareIdentity(a[sortKey] || '', b[sortKey] || '');
      if (primary !== 0) return primary * direction;
      return (
        compareIdentity(a.itemSku, b.itemSku) ||
        compareIdentity(a.customerName, b.customerName) ||
        compareIdentity(a.customerPartNumber, b.customerPartNumber)
      );
    });
    return next;
  }, [lines, sortDir, sortKey]);

  const handleIdentitySort = (key: IdentitySortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const identitySortLabel = (key: IdentitySortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ↕';

  const monthHeaderStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '8px 6px',
    color: '#3730a3',
    background: MONTH_COL_HEADER_BG,
    whiteSpace: 'normal',
    lineHeight: 1.25,
    minWidth: 96,
    fontSize: 11,
    fontWeight: 700,
    verticalAlign: 'bottom',
  };
  const monthCellStyle: React.CSSProperties = {
    padding: 6,
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderTop: '1px solid #c7d2fe',
    background: MONTH_COL_CELL_BG,
    color: '#312e81',
  };
  const monthInputCellStyle: React.CSSProperties = {
    padding: 4,
    borderTop: '1px solid #c7d2fe',
    background: MONTH_COL_CELL_BG,
  };
  const monthQtyInputStyle: React.CSSProperties = {
    ...qtyInputStyle,
    background: '#f5f7ff',
    borderColor: '#c7d2fe',
  };
  const priorHeaderStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '8px 6px',
    color: '#475569',
    background: '#f8fafc',
    whiteSpace: 'normal',
    lineHeight: 1.25,
    minWidth: 96,
    fontSize: 11,
    fontWeight: 700,
    verticalAlign: 'bottom',
  };
  const priorCellStyle: React.CSSProperties = {
    padding: 6,
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderTop: '1px solid #e2e8f0',
    background: '#ffffff',
    color: '#475569',
  };

  const shiftMonth = (delta: number) => {
    const next = ((((selectedMonth - 1 + delta) % 12) + 12) % 12) + 1;
    setSelectedMonth(next as ForecastMonth);
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Monthly Forecast</h3>
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
        Monthly SGP estimated units vs YTD actual by APR P/N and vendor. Estimated months are typed; YTD and percents come from operations data.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Vendor
          <select
            value={vendorKey}
            onChange={(event) => handleVendorChange(event.target.value)}
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
            onChange={(event) => handleYearChange(Number(event.target.value))}
            style={{ ...inputStyle, width: 108 }}
          >
            {yearOptions().map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Data thru
          <input
            type="date"
            value={dataThru}
            onChange={(event) => {
              setDataThru(event.target.value);
              markDirty();
            }}
            style={{ ...inputStyle, width: 150 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Month
          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                width: 28,
                height: 30,
                background: '#ffffff',
                cursor: 'pointer',
                fontWeight: 700,
                color: '#334155',
              }}
              aria-label="Previous month"
            >
              ‹
            </button>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(Number(event.target.value) as ForecastMonth)}
              style={{ ...inputStyle, width: 132 }}
            >
              {FORECAST_MONTHS.map((month) => (
                <option key={month} value={month}>{FORECAST_MONTH_FULL_LABELS[month]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                width: 28,
                height: 30,
                background: '#ffffff',
                cursor: 'pointer',
                fontWeight: 700,
                color: '#334155',
              }}
              aria-label="Next month"
            >
              ›
            </button>
          </span>
        </label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
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
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImport(file);
          }}
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!selectedVendor || saving || !dirty}
          style={{
            border: '1px solid #4338ca',
            borderRadius: 8,
            padding: '8px 14px',
            background: !selectedVendor || saving || !dirty ? '#c7d2fe' : '#4f46e5',
            color: '#ffffff',
            fontWeight: 700,
            cursor: !selectedVendor || saving || !dirty ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          {saving ? 'Saving…' : dirty ? 'Save page' : 'Saved'}
        </button>
      </div>

      {loadingVendors && vendors.length === 0 && (
        <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>Loading vendors…</div>
      )}
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {notice && <div style={{ color: '#166534', fontSize: 13, marginBottom: 8 }}>{notice}</div>}

      {!selectedVendor ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>
          Select a vendor, or import the Revenue Forecasts workbook (sheet SGP Forecasts Current / Forecasts 2026 SGP) to load estimated quantities. The annual GMPA workbook will not import here.
        </div>
      ) : loadingLines ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>Loading forecast rows…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#334155', marginBottom: 10 }}>
            <span><strong>Rows:</strong> {lines.length.toLocaleString()}</span>
            <span><strong>SGP estimated:</strong> {fmtQty(totals.sgpEstimated)}</span>
            <span><strong>Estimated {monthName}:</strong> {fmtQty(totals.monthEstimated)}</span>
            <span><strong>{monthName} YTD:</strong> {fmtQty(totals.monthYtd)}</span>
            <span><strong>% {monthName} YTD vs estimated:</strong> {fmtPct(pctVsPlan(totals.monthYtd, totals.monthEstimated))}</span>
            <span><strong>Remaining-year estimated:</strong> {fmtQty(totals.remaining)}</span>
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
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: IDENTITY_COLUMNS_WIDTH_PX + 720, fontSize: 12, tableLayout: 'fixed' }}>
              <colgroup>
                {IDENTITY_COLUMNS.map((column) => (
                  <col key={column.key} style={{ width: columnWidth(column.widthCh) }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {IDENTITY_COLUMNS.map((column, index) => (
                    <th
                      key={column.key}
                      title={`Sort by ${column.label}`}
                      align="left"
                      onClick={() => handleIdentitySort(column.key)}
                      aria-sort={sortKey === column.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      style={{
                        ...stickyIdentityStyle(index, true),
                        textAlign: 'left',
                        paddingTop: 8,
                        paddingBottom: 8,
                        color: '#334155',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      {column.label}{identitySortLabel(column.key)}
                    </th>
                  ))}
                  <th
                    style={{
                      textAlign: 'right',
                      padding: '8px 4px',
                      whiteSpace: 'normal',
                      lineHeight: 1.2,
                      minWidth: 64,
                      color: '#334155',
                      background: '#f8fafc',
                      verticalAlign: 'bottom',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    Planned<br />MTO
                  </th>
                  <th style={{ ...priorHeaderStyle, borderLeft: '1px solid #e2e8f0' }}>{`Estimated ${previousMonthName}`}</th>
                  <th style={priorHeaderStyle}>{`${previousMonthName} YTD`}</th>
                  <th style={priorHeaderStyle}>{`% ${previousMonthName} YTD vs Estimated`}</th>
                  <th style={{ ...monthHeaderStyle, borderLeft: '2px solid #c7d2fe' }}>{`Estimated ${monthName}`}</th>
                  <th style={monthHeaderStyle}>{`${monthName} YTD`}</th>
                  <th style={monthHeaderStyle}>{`% ${monthName} YTD vs Estimated`}</th>
                </tr>
              </thead>
              <tbody>
                {sortedLines.map((line) => (
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
                    <td style={{ padding: 6, borderTop: '1px solid #e2e8f0' }}>
                      <select
                        value={line.productionType}
                        onChange={(event) => updateLine(line.id, { productionType: event.target.value })}
                        style={inputStyle}
                      >
                        <option value="" />
                        {PRODUCTION_TYPE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ ...priorCellStyle, borderLeft: '1px solid #e2e8f0' }}>
                      {fmtQty(qtyValue(line.forecastQty, previousMonth))}
                    </td>
                    <td style={priorCellStyle}>{fmtQty(qtyValue(line.actualQty, previousMonth))}</td>
                    <td style={priorCellStyle}>
                      {fmtPct(pctVsPlan(
                        qtyValue(line.actualQty, previousMonth),
                        qtyValue(line.forecastQty, previousMonth)
                      ))}
                    </td>
                    <td style={{ ...monthInputCellStyle, borderLeft: '2px solid #c7d2fe' }}>
                      <input
                        type="number"
                        value={qtyValue(line.forecastQty, selectedMonth)}
                        onChange={(event) => updateMonthQty(line.id, selectedMonth, event.target.value)}
                        style={monthQtyInputStyle}
                        aria-label={`Estimated ${monthName}`}
                      />
                    </td>
                    <td style={monthCellStyle}>{fmtQty(qtyValue(line.actualQty, selectedMonth))}</td>
                    <td style={monthCellStyle}>
                      {fmtPct(pctVsPlan(
                        qtyValue(line.actualQty, selectedMonth),
                        qtyValue(line.forecastQty, selectedMonth)
                      ))}
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ padding: 16, color: '#64748b' }}>
                      No forecast rows for this vendor yet. Import the Forecasts 2026 SGP sheet, then save.
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
