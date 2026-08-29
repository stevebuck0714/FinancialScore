'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FORECAST_MONTH_FULL_LABELS,
  FORECAST_MONTHS,
  PRODUCTION_TYPE_OPTIONS,
  STATUS_FLAG_OPTIONS,
  typedAdjustedMonthQty,
  emptyMonthQtyMap,
  forecastMonthIsEditable,
  monthQty,
  monthQtyTotal,
  parseProductRevenueForecastWorkbook,
  pctVsPlan,
  readProductOperationsWorkbook,
  remainingForecastQty,
  workbookImportErrorMessage,
  type ForecastMonth,
  type MonthQtyMap,
  type ProductRevenueForecastLineInput,
} from '@/lib/operations/product-revenue-forecast';
import { parseGoalDashboardFromWorkbook } from '@/lib/operations/product-goal-update';
import { estMonthIndex, estYear } from '@/lib/time/eastern';

type CustomerOption = {
  customerId: string;
  customerName: string;
  key: string;
  label: string;
  lineCount?: number;
};

type ForecastLine = ProductRevenueForecastLineInput & { id: string };

type ProductRevenueForecastReportProps = {
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
  key: 'itemSku' | 'customerPartNumber' | 'customerGroup' | 'team' | 'csr';
  label: string;
  widthCh: number;
  compact?: boolean;
  sortable?: boolean;
}> = [
  { key: 'itemSku', label: 'APR P/N', widthCh: 12, sortable: true },
  { key: 'customerPartNumber', label: 'Customer P/N', widthCh: 12, sortable: true },
  { key: 'customerGroup', label: 'Group', widthCh: 8 },
  { key: 'team', label: 'TEAM', widthCh: 5, compact: true },
  { key: 'csr', label: 'CSR', widthCh: 3, compact: true },
];

const CHAR_PX = 8;
const IDENTITY_CELL_PAD_X = 6;
const IDENTITY_CELL_EXTRA_PX = 28;
const MONTH_COL_HEADER_BG = '#e0e7ff';
const MONTH_COL_CELL_BG = '#eef2ff';
const MONTH_METRIC_COL_PX = 68;
const MONTH_METRIC_COL_COUNT = 10;
const PLANNED_COL_CH = 6;
const STATUS_COL_CH = 5;

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
const TABLE_MIN_WIDTH_PX =
  IDENTITY_COLUMNS_WIDTH_PX +
  columnWidthPx(PLANNED_COL_CH) +
  columnWidthPx(STATUS_COL_CH) +
  MONTH_METRIC_COL_COUNT * MONTH_METRIC_COL_PX;

function columnWidth(widthCh: number): string {
  return `${columnWidthPx(widthCh)}px`;
}

function stickyIdentityStyle(index: number, header: boolean): React.CSSProperties {
  const column = IDENTITY_COLUMNS[index];
  const isLast = index === IDENTITY_COLUMNS.length - 1;
  const width = columnWidth(column.widthCh);
  const inputPadX = column.compact ? 4 : 7;
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
    paddingLeft: header ? IDENTITY_CELL_PAD_X + inputPadX + 1 : IDENTITY_CELL_PAD_X,
    paddingRight: IDENTITY_CELL_PAD_X,
  };
}

const identityInputStyle: React.CSSProperties = {
  ...inputStyle,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'left',
};

const qtyInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: '100%',
  minWidth: 0,
  textAlign: 'right',
  padding: '5px 2px',
};

function currentYear(): number {
  return estYear();
}

function currentMonth(): ForecastMonth {
  return (estMonthIndex() + 1) as ForecastMonth;
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

function comparePn(a: string, b: string): number {
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function fmtPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function qtyValue(map: MonthQtyMap, month: ForecastMonth): number {
  return monthQty(map, month);
}

export default function ProductRevenueForecastReport({
  selectedCompanyId,
  onOpenInfo,
}: ProductRevenueForecastReportProps) {
  const [year, setYear] = useState(currentYear());
  const [catalogSourceYear, setCatalogSourceYear] = useState<number | null>(null);
  const [dataThru, setDataThru] = useState('');
  const [customerKey, setCustomerKey] = useState('');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [lines, setLines] = useState<ForecastLine[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<ForecastMonth>(currentMonth());
  const [sortKey, setSortKey] = useState<'itemSku' | 'customerPartNumber'>('itemSku');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const customersRequestSeq = useRef(0);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.key === customerKey) || null,
    [customers, customerKey]
  );

  const monthName = FORECAST_MONTH_FULL_LABELS[selectedMonth];
  const previousMonth = (selectedMonth === 1 ? 12 : selectedMonth - 1) as ForecastMonth;
  const previousMonthName = FORECAST_MONTH_FULL_LABELS[previousMonth];
  const canEditSelectedMonth = forecastMonthIsEditable(year, selectedMonth);

  const sortedLines = useMemo(() => {
    const next = [...lines];
    next.sort((a, b) => {
      const cmp = comparePn(a[sortKey], b[sortKey]);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return next;
  }, [lines, sortDir, sortKey]);

  const toggleSort = (key: 'itemSku' | 'customerPartNumber') => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const mergeCustomers = useCallback((csi: CustomerOption[], forecast: CustomerOption[]) => {
    const byKey = new Map<string, CustomerOption>();
    [...csi, ...forecast].forEach((customer) => {
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

  const loadCsiCustomers = useCallback(async (seq: number) => {
    if (!selectedCompanyId) return;
    try {
      const csiRes = await fetch(
        `/api/operational-data/product-raw?companyId=${encodeURIComponent(selectedCompanyId)}&view=customers`
      );
      const csiJson = await csiRes.json().catch(() => ({}));
      if (seq !== customersRequestSeq.current || !csiRes.ok) return;
      setCustomers((prev) => mergeCustomers(csiJson.customers || [], prev));
    } catch {
      // CSI names are optional; forecast customers are enough to use the page.
    }
  }, [mergeCustomers, selectedCompanyId]);

  const loadCustomers = useCallback(async (nextYear = year) => {
    if (!selectedCompanyId) return;
    const seq = ++customersRequestSeq.current;
    setLoadingCustomers(true);
    setError(null);
    try {
      const forecastRes = await fetch(
        `/api/operational-data/product-forecast?companyId=${encodeURIComponent(selectedCompanyId)}&year=${nextYear}`
      );
      const forecastJson = await forecastRes.json().catch(() => ({}));
      if (seq !== customersRequestSeq.current) return;
      if (!forecastRes.ok) throw new Error(forecastJson.error || 'Failed to load customers');
      setCustomers(mergeCustomers([], forecastJson.customers || []));
      setCatalogSourceYear(Number(forecastJson.catalogSourceYear) || null);
      if (forecastJson.dataThru) setDataThru(String(forecastJson.dataThru).slice(0, 10));
      void loadCsiCustomers(seq);
    } catch (err: any) {
      if (seq !== customersRequestSeq.current) return;
      setError(err?.message || 'Failed to load customers');
    } finally {
      if (seq === customersRequestSeq.current) setLoadingCustomers(false);
    }
  }, [loadCsiCustomers, mergeCustomers, selectedCompanyId, year]);

  const loadLines = useCallback(async (customer: CustomerOption, nextYear = year, options?: { keepDirty?: boolean }) => {
    if (!selectedCompanyId || !customer) return;
    setLoadingLines(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        year: String(nextYear),
        customerId: customer.customerId,
        customerName: customer.customerName,
      });
      const response = await fetch(`/api/operational-data/product-forecast?${params.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load forecast rows');
      const nextLines = Array.isArray(payload.lines) ? payload.lines : [];
      setLines(nextLines);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
      if (!options?.keepDirty) setDirty(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to load forecast rows');
      setLines([]);
    } finally {
      setLoadingLines(false);
    }
  }, [selectedCompanyId, year]);

  useEffect(() => {
    setCustomerKey('');
    setLines([]);
    setDirty(false);
  }, [selectedCompanyId]);

  useEffect(() => {
    setLines([]);
    setDirty(false);
    void loadCustomers();
  }, [selectedCompanyId, year, loadCustomers]);

  useEffect(() => {
    if (!selectedCustomer) {
      setLines([]);
      setDirty(false);
      return;
    }
    void loadLines(selectedCustomer);
  }, [selectedCustomer?.key, loadLines]);

  const markDirty = () => {
    setDirty(true);
    setNotice(null);
  };

  const updateLine = (id: string, patch: Partial<ForecastLine>) => {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
    markDirty();
  };

  const updateMonthQty = (
    id: string,
    field: 'forecastQty' | 'adjustedQty',
    month: ForecastMonth,
    raw: string
  ) => {
    if (!forecastMonthIsEditable(year, month)) return;
    const parsed = raw === '' ? 0 : Number(raw);
    const value = Number.isFinite(parsed) ? parsed : 0;
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        const current =
          field === 'adjustedQty'
            ? line.adjustedQty || line.forecastQty || emptyMonthQtyMap()
            : line.forecastQty || emptyMonthQtyMap();
        return { ...line, [field]: { ...current, [String(month)]: value } };
      })
    );
    markDirty();
  };

  const handleCustomerChange = (nextKey: string) => {
    if (dirty && !window.confirm('You have unsaved changes. Switch customer without saving?')) return;
    setCustomerKey(nextKey);
  };

  const handleYearChange = (nextYear: number) => {
    if (dirty && !window.confirm('You have unsaved changes. Switch year without saving?')) return;
    setYear(nextYear);
  };

  const handleSave = async () => {
    if (!selectedCompanyId || !selectedCustomer) return;
    if (lines.some((line) => !String(line.itemSku || '').trim())) {
      setError('Every row needs an APR P/N before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/operational-data/product-forecast', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          year,
          dataThru: dataThru || null,
          customerId: selectedCustomer.customerId,
          customerName: selectedCustomer.customerName,
          lines: lines.map((line) => ({
            ...line,
            customerName: selectedCustomer.customerName,
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to save');
      setLines(Array.isArray(payload.lines) ? payload.lines : lines);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
      setDirty(false);
      const savedCount = Array.isArray(payload.lines) ? payload.lines.length : lines.length;
      setNotice(`Saved ${savedCount} rows for ${selectedCustomer.label}.`);
      setCustomers((prev) =>
        prev.map((customer) =>
          customer.key === selectedCustomer.key ? { ...customer, lineCount: savedCount } : customer
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
    if (dirty && !window.confirm('Import will merge workbook rows and may overwrite matching part/customer lines. Continue?')) {
      return;
    }
    setImporting(true);
    setError(null);
    setNotice('Reading workbook…');
    try {
      const workbook = readProductOperationsWorkbook(await file.arrayBuffer(), 'all');
      const forecast = parseProductRevenueForecastWorkbook(workbook, year);
      const goals = parseGoalDashboardFromWorkbook(workbook);
      setNotice(`Saving ${forecast.rows.length.toLocaleString()} forecast rows…`);
      const response = await fetch('/api/operational-data/product-forecast/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          year: forecast.year || year,
          parsed: {
            year: forecast.year,
            dataThru: forecast.dataThru,
            rows: [],
            prices: [],
            forecast,
            goalUpdate: goals.goalUpdate,
            pyramid: goals.pyramid,
          },
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          payload.error || payload.message || `Failed to import workbook (${response.status})`
        );
      }
      const importedYear = Number(payload.year) || year;
      setYear(importedYear);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
      setDirty(false);
      const forecastCount = Number(payload.forecastRowCount || payload.rowCount || 0);
      const priceCount = Number(payload.priceCount || 0);
      setNotice(
        priceCount > 0
          ? `Imported ${forecastCount} forecast rows and ${priceCount} prices.`
          : `Imported ${forecastCount} forecast rows.`
      );
      await loadCustomers(importedYear);
      if (selectedCustomer) await loadLines(selectedCustomer, importedYear);
    } catch (err: unknown) {
      console.error('Monthly Forecast import failed', err);
      setNotice(null);
      setError(workbookImportErrorMessage(err, 'Failed to import workbook'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const totals = useMemo(() => {
    const ytdMonths = FORECAST_MONTHS.filter((month) => month <= selectedMonth);
    const thru = dataThru || null;
    return lines.reduce(
      (acc, line) => {
        acc.remaining += remainingForecastQty(line.forecastQty, thru);
        acc.monthForecast += qtyValue(line.forecastQty, selectedMonth);
        acc.monthAdjusted += typedAdjustedMonthQty(line.forecastQty, selectedMonth, line.adjustedQty);
        acc.monthActual += qtyValue(line.actualQty, selectedMonth);
        acc.ytdForecast += monthQtyTotal(line.forecastQty, ytdMonths);
        acc.ytdAdjusted += ytdMonths.reduce(
          (sum, month) => sum + typedAdjustedMonthQty(line.forecastQty, month, line.adjustedQty),
          0
        );
        acc.ytdActual += monthQtyTotal(line.actualQty, ytdMonths);
        return acc;
      },
      {
        remaining: 0,
        monthForecast: 0,
        monthAdjusted: 0,
        monthActual: 0,
        ytdForecast: 0,
        ytdAdjusted: 0,
        ytdActual: 0,
      }
    );
  }, [dataThru, lines, selectedMonth]);

  const monthHeaderStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '8px 2px',
    color: '#3730a3',
    background: MONTH_COL_HEADER_BG,
    whiteSpace: 'normal',
    lineHeight: 1.15,
    width: MONTH_METRIC_COL_PX,
    minWidth: MONTH_METRIC_COL_PX,
    maxWidth: MONTH_METRIC_COL_PX,
    boxSizing: 'border-box',
    fontSize: 11,
    fontWeight: 700,
    verticalAlign: 'bottom',
  };
  const monthCellStyle: React.CSSProperties = {
    padding: '6px 2px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderTop: '1px solid #c7d2fe',
    background: MONTH_COL_CELL_BG,
    color: '#312e81',
    width: MONTH_METRIC_COL_PX,
    minWidth: MONTH_METRIC_COL_PX,
    maxWidth: MONTH_METRIC_COL_PX,
    boxSizing: 'border-box',
  };
  const monthInputCellStyle: React.CSSProperties = {
    padding: 2,
    borderTop: '1px solid #c7d2fe',
    background: MONTH_COL_CELL_BG,
    width: MONTH_METRIC_COL_PX,
    minWidth: MONTH_METRIC_COL_PX,
    maxWidth: MONTH_METRIC_COL_PX,
    boxSizing: 'border-box',
  };
  const monthQtyInputStyle: React.CSSProperties = {
    ...qtyInputStyle,
    background: '#f5f7ff',
    borderColor: '#c7d2fe',
  };
  const priorHeaderStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '8px 2px',
    color: '#475569',
    background: '#f8fafc',
    whiteSpace: 'normal',
    lineHeight: 1.15,
    width: MONTH_METRIC_COL_PX,
    minWidth: MONTH_METRIC_COL_PX,
    maxWidth: MONTH_METRIC_COL_PX,
    boxSizing: 'border-box',
    fontSize: 11,
    fontWeight: 700,
    verticalAlign: 'bottom',
  };
  const priorCellStyle: React.CSSProperties = {
    padding: '6px 2px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    borderTop: '1px solid #e2e8f0',
    background: '#ffffff',
    color: '#475569',
    width: MONTH_METRIC_COL_PX,
    minWidth: MONTH_METRIC_COL_PX,
    maxWidth: MONTH_METRIC_COL_PX,
    boxSizing: 'border-box',
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
      <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 13, lineHeight: 1.5, whiteSpace: 'nowrap' }}>
        Monthly unit forecast vs actual by APR P/N and customer. Select a customer, fill Group / TEAM / CSR on each row, enter Planned or MTO and monthly quantities, then save this page.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Customer
          <select
            value={customerKey}
            onChange={(event) => handleCustomerChange(event.target.value)}
            disabled={loadingCustomers && customers.length === 0}
            style={{ ...inputStyle, minWidth: 280 }}
          >
            <option value="">
              {loadingCustomers && customers.length === 0 ? 'Loading customers…' : 'Select a customer'}
            </option>
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
          disabled={!selectedCustomer || saving || !dirty}
          style={{
            border: '1px solid #4338ca',
            borderRadius: 8,
            padding: '8px 14px',
            background: !selectedCustomer || saving || !dirty ? '#c7d2fe' : '#4f46e5',
            color: '#ffffff',
            fontWeight: 700,
            cursor: !selectedCustomer || saving || !dirty ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          {saving ? 'Saving…' : dirty ? 'Save page' : 'Saved'}
        </button>
      </div>

      {loadingCustomers && customers.length === 0 && (
        <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>Loading customers…</div>
      )}
      {catalogSourceYear && catalogSourceYear !== year && (
        <div style={{ color: '#1e3a8a', fontSize: 13, marginBottom: 8 }}>
          {`Showing ${catalogSourceYear} items for ${year}. Monthly quantities start blank so you can enter this year’s projections.`}
        </div>
      )}
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {notice && <div style={{ color: '#166534', fontSize: 13, marginBottom: 8 }}>{notice}</div>}

      {!selectedCustomer ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>
          Select a customer first. You can then type Group / TEAM / CSR on each row, enter
          Planned or MTO and monthly quantities, and save. Import the workbook once to load all customers.
        </div>
      ) : loadingLines ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>Loading forecast rows…</div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontSize: 13,
              color: '#334155',
              marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 800, color: '#0f172a' }}>{monthName} YTD DATA</span>
              <span><strong>Forecasted YTD:</strong> {fmtQty(totals.ytdForecast)}</span>
              <span><strong>Forecast - Adjusted YTD:</strong> {fmtQty(totals.ytdAdjusted)}</span>
              <span><strong>Actual YTD:</strong> {fmtQty(totals.ytdActual)}</span>
              <span>
                <strong>Actual YTD vs. Forecasted YTD:</strong>{' '}
                {fmtPct(pctVsPlan(totals.ytdActual, totals.ytdForecast))}
              </span>
              <span>
                <strong>Actual YTD vs Forecast - Adjusted YTD:</strong>{' '}
                {fmtPct(pctVsPlan(totals.ytdActual, totals.ytdAdjusted))}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 800, color: '#0f172a' }}>{monthName}</span>
              <span><strong>Forecasted {monthName}:</strong> {fmtQty(totals.monthForecast)}</span>
              <span><strong>{monthName} Forecast - ADJUSTED:</strong> {fmtQty(totals.monthAdjusted)}</span>
              <span><strong>{monthName} Actual:</strong> {fmtQty(totals.monthActual)}</span>
              <span>
                <strong>% {monthName} Actual vs. Forecasted:</strong>{' '}
                {fmtPct(pctVsPlan(totals.monthActual, totals.monthForecast))}
              </span>
              <span>
                <strong>% {monthName} Actual vs Adj. Forecast:</strong>{' '}
                {fmtPct(pctVsPlan(totals.monthActual, totals.monthAdjusted))}
              </span>
              <span><strong>Remaining-year forecast:</strong> {fmtQty(totals.remaining)}</span>
            </div>
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
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: TABLE_MIN_WIDTH_PX, minWidth: TABLE_MIN_WIDTH_PX, fontSize: 12, tableLayout: 'fixed' }}>
              <colgroup>
                {IDENTITY_COLUMNS.map((column) => (
                  <col key={column.key} style={{ width: columnWidth(column.widthCh) }} />
                ))}
                <col style={{ width: columnWidth(PLANNED_COL_CH) }} />
                <col style={{ width: columnWidth(STATUS_COL_CH) }} />
                {Array.from({ length: MONTH_METRIC_COL_COUNT }, (_, index) => (
                  <col key={`metric-${index}`} style={{ width: MONTH_METRIC_COL_PX }} />
                ))}
              </colgroup>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {IDENTITY_COLUMNS.map((column, index) => (
                    <th
                      key={column.key}
                      title={column.sortable ? `Sort by ${column.label}` : column.label}
                      align="left"
                      onClick={column.sortable ? () => toggleSort(column.key as 'itemSku' | 'customerPartNumber') : undefined}
                      style={{
                        ...stickyIdentityStyle(index, true),
                        textAlign: 'left',
                        paddingTop: 8,
                        paddingBottom: 8,
                        color: '#334155',
                        cursor: column.sortable ? 'pointer' : undefined,
                        userSelect: column.sortable ? 'none' : undefined,
                      }}
                    >
                      {column.label}
                      {column.sortable && sortKey === column.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                  {[
                    { key: 'planned', label: <>Planned<br />MTO</>, widthCh: 6 },
                    {
                      key: 'status',
                      label: <>LOST / OBS<br />NEW</>,
                      widthCh: 5,
                    },
                  ].map((column) => (
                    <th
                      key={column.key}
                      style={{
                        textAlign: 'right',
                        padding: '8px 4px',
                        whiteSpace: 'normal',
                        lineHeight: 1.2,
                        width: column.widthCh ? columnWidth(column.widthCh) : undefined,
                        minWidth: column.widthCh ? columnWidth(column.widthCh) : 64,
                        maxWidth: column.widthCh ? columnWidth(column.widthCh) : 76,
                        color: '#334155',
                        background: '#f8fafc',
                        verticalAlign: 'bottom',
                        fontSize: 11,
                        fontWeight: 700,
                        boxSizing: 'border-box',
                      }}
                    >
                      {column.label}
                    </th>
                  ))}
                  <th style={{ ...priorHeaderStyle, borderLeft: '1px solid #e2e8f0' }}>Forecasted<br />{previousMonthName}<br />&nbsp;</th>
                  <th style={priorHeaderStyle}>{previousMonthName}<br />Forecast -<br />ADJUSTED</th>
                  <th style={priorHeaderStyle}>{previousMonthName}<br />Actual<br />&nbsp;</th>
                  <th style={priorHeaderStyle}>% {previousMonthName} Actual<br />vs<br />Forecasted</th>
                  <th style={priorHeaderStyle}>% {previousMonthName} Actual<br />vs Adj.<br />Forecast</th>
                  <th style={{ ...monthHeaderStyle, borderLeft: '2px solid #c7d2fe' }}>Forecasted<br />{monthName}<br />&nbsp;</th>
                  <th style={monthHeaderStyle}>{monthName}<br />Forecast -<br />ADJUSTED</th>
                  <th style={monthHeaderStyle}>{monthName}<br />Actual<br />&nbsp;</th>
                  <th style={monthHeaderStyle}>% {monthName} Actual<br />vs<br />Forecasted</th>
                  <th style={monthHeaderStyle}>% {monthName} Actual<br />vs Adj.<br />Forecast</th>
                </tr>
              </thead>
              <tbody>
                {sortedLines.map((line) => {
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
                          <input
                            value={line[column.key]}
                            title={line[column.key] || undefined}
                            onChange={(event) => updateLine(line.id, { [column.key]: event.target.value })}
                            style={{
                              ...identityInputStyle,
                              padding: column.compact ? '5px 4px' : identityInputStyle.padding,
                            }}
                          />
                        </td>
                      ))}
                      <td
                        style={{
                          padding: 4,
                          borderTop: '1px solid #e2e8f0',
                          width: columnWidth(6),
                          minWidth: columnWidth(6),
                          maxWidth: columnWidth(6),
                          boxSizing: 'border-box',
                        }}
                      >
                        <select
                          value={line.productionType}
                          onChange={(event) => updateLine(line.id, { productionType: event.target.value })}
                          style={{ ...inputStyle, padding: '5px 2px' }}
                        >
                          <option value="" />
                          {PRODUCTION_TYPE_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                      <td
                        style={{
                          padding: 4,
                          borderTop: '1px solid #e2e8f0',
                          width: columnWidth(5),
                          minWidth: columnWidth(5),
                          maxWidth: columnWidth(5),
                          boxSizing: 'border-box',
                          textAlign: 'right',
                        }}
                      >
                        <select
                          value={line.statusFlag}
                          onChange={(event) => updateLine(line.id, { statusFlag: event.target.value })}
                          style={{ ...inputStyle, padding: '5px 2px', textAlign: 'right' }}
                        >
                          <option value="" />
                          {STATUS_FLAG_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ ...priorCellStyle, borderLeft: '1px solid #e2e8f0' }}>
                        {fmtQty(qtyValue(line.forecastQty, previousMonth))}
                      </td>
                      <td style={priorCellStyle}>
                        {fmtQty(typedAdjustedMonthQty(line.forecastQty, previousMonth, line.adjustedQty))}
                      </td>
                      <td style={priorCellStyle}>
                        {fmtQty(qtyValue(line.actualQty, previousMonth))}
                      </td>
                      <td style={priorCellStyle}>
                        {fmtPct(pctVsPlan(
                          qtyValue(line.actualQty, previousMonth),
                          qtyValue(line.forecastQty, previousMonth)
                        ))}
                      </td>
                      <td style={priorCellStyle}>
                        {fmtPct(pctVsPlan(
                          qtyValue(line.actualQty, previousMonth),
                          typedAdjustedMonthQty(line.forecastQty, previousMonth, line.adjustedQty)
                        ))}
                      </td>
                      {canEditSelectedMonth ? (
                        <td style={{ ...monthInputCellStyle, borderLeft: '2px solid #c7d2fe' }}>
                          <input
                            type="number"
                            value={qtyValue(line.forecastQty, selectedMonth)}
                            onChange={(event) => updateMonthQty(line.id, 'forecastQty', selectedMonth, event.target.value)}
                            style={monthQtyInputStyle}
                            aria-label={`Forecasted ${monthName}`}
                          />
                        </td>
                      ) : (
                        <td style={{ ...monthCellStyle, borderLeft: '2px solid #c7d2fe' }}>
                          {fmtQty(qtyValue(line.forecastQty, selectedMonth))}
                        </td>
                      )}
                      {canEditSelectedMonth ? (
                        <td style={monthInputCellStyle}>
                          <input
                            type="number"
                            value={qtyValue(line.adjustedQty || line.forecastQty, selectedMonth)}
                            onChange={(event) => updateMonthQty(line.id, 'adjustedQty', selectedMonth, event.target.value)}
                            style={monthQtyInputStyle}
                            aria-label={`${monthName} Forecast - ADJUSTED`}
                          />
                        </td>
                      ) : (
                        <td style={monthCellStyle}>
                          {fmtQty(typedAdjustedMonthQty(line.forecastQty, selectedMonth, line.adjustedQty))}
                        </td>
                      )}
                      <td style={monthCellStyle}>
                        {fmtQty(qtyValue(line.actualQty, selectedMonth))}
                      </td>
                      <td style={monthCellStyle}>
                        {fmtPct(pctVsPlan(
                          qtyValue(line.actualQty, selectedMonth),
                          qtyValue(line.forecastQty, selectedMonth)
                        ))}
                      </td>
                      <td style={monthCellStyle}>
                        {fmtPct(pctVsPlan(
                          qtyValue(line.actualQty, selectedMonth),
                          typedAdjustedMonthQty(line.forecastQty, selectedMonth, line.adjustedQty)
                        ))}
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={17} style={{ padding: 16, color: '#64748b' }}>
                      No forecast rows for this customer yet. Import the workbook to load customers and parts, then save.
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
