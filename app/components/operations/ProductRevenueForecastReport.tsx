'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FORECAST_MONTH_FULL_LABELS,
  FORECAST_MONTH_LABELS,
  FORECAST_MONTHS,
  PRODUCTION_TYPE_OPTIONS,
  STATUS_FLAG_OPTIONS,
  adjustedMonthQty,
  closedMonths,
  emptyMonthQtyMap,
  monthQty,
  pctVsPlan,
  remainingForecastQty,
  type ForecastMonth,
  type MonthQtyMap,
  type ProductRevenueForecastLineInput,
} from '@/lib/operations/product-revenue-forecast';

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
}> = [
  { key: 'itemSku', label: 'APR P/N', widthCh: 12 },
  { key: 'customerPartNumber', label: 'Customer P/N', widthCh: 12 },
  { key: 'customerGroup', label: 'Group', widthCh: 15 },
  { key: 'team', label: 'TEAM', widthCh: 8, compact: true },
  { key: 'csr', label: 'CSR', widthCh: 4, compact: true },
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

function newLine(customer: CustomerOption, sortOrder: number): ForecastLine {
  return {
    id: `tmp-${Date.now()}-${sortOrder}`,
    customerId: customer.customerId,
    customerName: customer.customerName,
    customerGroup: '',
    customerPartNumber: '',
    itemSku: '',
    team: '',
    csr: '',
    productionType: '',
    statusFlag: '',
    annualBaseQty: null,
    forecastQty: emptyMonthQtyMap(),
    actualQty: emptyMonthQtyMap(),
    sortOrder,
  };
}

export default function ProductRevenueForecastReport({
  selectedCompanyId,
  onOpenInfo,
}: ProductRevenueForecastReportProps) {
  const [year, setYear] = useState(currentYear());
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.key === customerKey) || null,
    [customers, customerKey]
  );

  const closed = useMemo(() => closedMonths(dataThru || null), [dataThru]);
  const monthName = FORECAST_MONTH_FULL_LABELS[selectedMonth];
  const previousMonth = (selectedMonth === 1 ? 12 : selectedMonth - 1) as ForecastMonth;
  const previousMonthName = FORECAST_MONTH_FULL_LABELS[previousMonth];

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

  const loadCustomers = useCallback(async (nextYear = year) => {
    if (!selectedCompanyId) return;
    setLoadingCustomers(true);
    setError(null);
    try {
      const [csiRes, forecastRes] = await Promise.all([
        fetch(`/api/operational-data/product-raw?companyId=${encodeURIComponent(selectedCompanyId)}&view=customers`),
        fetch(`/api/operational-data/product-forecast?companyId=${encodeURIComponent(selectedCompanyId)}&year=${nextYear}`),
      ]);
      const csiJson = await csiRes.json().catch(() => ({}));
      const forecastJson = await forecastRes.json().catch(() => ({}));
      if (!csiRes.ok && !forecastRes.ok) {
        throw new Error(forecastJson.error || csiJson.error || 'Failed to load customers');
      }
      const merged = mergeCustomers(csiJson.customers || [], forecastJson.customers || []);
      setCustomers(merged);
      if (forecastJson.dataThru) setDataThru(String(forecastJson.dataThru).slice(0, 10));
    } catch (err: any) {
      setError(err?.message || 'Failed to load customers');
    } finally {
      setLoadingCustomers(false);
    }
  }, [mergeCustomers, selectedCompanyId, year]);

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

  const updateMonthQty = (id: string, field: 'forecastQty' | 'actualQty', month: ForecastMonth, raw: string) => {
    const parsed = raw === '' ? 0 : Number(raw);
    const value = Number.isFinite(parsed) ? parsed : 0;
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        return { ...line, [field]: { ...line[field], [String(month)]: value } };
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
      setNotice(`Saved ${Array.isArray(payload.lines) ? payload.lines.length : lines.length} rows for ${selectedCustomer.label}.`);
      void loadCustomers(year);
    } catch (err: any) {
      setError(err?.message || 'Failed to save monthly forecast');
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async (file: File) => {
    if (!selectedCompanyId) return;
    if (dirty && !window.confirm('Import will merge workbook rows and may overwrite matching part/customer lines. Continue?')) {
      return;
    }
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set('companyId', selectedCompanyId);
      form.set('year', String(year));
      form.set('file', file);
      const response = await fetch('/api/operational-data/product-forecast/import', {
        method: 'POST',
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to import workbook');
      const importedYear = Number(payload.year) || year;
      setYear(importedYear);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
      setDirty(false);
      await loadCustomers(importedYear);
      if (selectedCustomer) await loadLines(selectedCustomer, importedYear);
    } catch (err: any) {
      setError(err?.message || 'Failed to import workbook');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const totals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        acc.remaining += remainingForecastQty(line.forecastQty, dataThru || null);
        acc.monthForecast += qtyValue(line.forecastQty, selectedMonth);
        acc.monthAdjusted += adjustedMonthQty(line.forecastQty, line.actualQty, selectedMonth, dataThru || null);
        acc.monthYtd += qtyValue(line.actualQty, selectedMonth);
        return acc;
      },
      { remaining: 0, monthForecast: 0, monthAdjusted: 0, monthYtd: 0 }
    );
  }, [dataThru, lines, selectedMonth]);

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
      <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 13, lineHeight: 1.5, whiteSpace: 'nowrap' }}>
        Monthly unit forecast vs actual by APR P/N and customer. Select a customer, fill Group / TEAM / CSR on each row, enter Planned or MTO and monthly quantities, then save this page.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Customer
          <select
            value={customerKey}
            onChange={(event) => handleCustomerChange(event.target.value)}
            style={{ ...inputStyle, minWidth: 280 }}
          >
            <option value="">Select a customer</option>
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
          disabled={!selectedCustomer}
          onClick={() => {
            if (!selectedCustomer) return;
            setLines((prev) => [...prev, newLine(selectedCustomer, prev.length)]);
            markDirty();
          }}
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '8px 12px',
            background: selectedCustomer ? '#ffffff' : '#f8fafc',
            color: '#334155',
            fontWeight: 700,
            cursor: selectedCustomer ? 'pointer' : 'not-allowed',
            fontSize: 12,
          }}
        >
          Add row
        </button>
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

      {loadingCustomers && <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>Loading customers…</div>}
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {notice && <div style={{ color: '#166534', fontSize: 13, marginBottom: 8 }}>{notice}</div>}

      {!selectedCustomer ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>
          Select a customer first. You can then add rows, type Group / TEAM / CSR on each row, enter
          Planned or MTO and monthly quantities, and save. Import the workbook once to load all customers.
        </div>
      ) : loadingLines ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>Loading forecast rows…</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#334155', marginBottom: 10 }}>
            <span><strong>Rows:</strong> {lines.length.toLocaleString()}</span>
            <span><strong>Forecasted {monthName}:</strong> {fmtQty(totals.monthForecast)}</span>
            <span><strong>{monthName} forecast - adjusted:</strong> {fmtQty(totals.monthAdjusted)}</span>
            <span><strong>{monthName} YTD:</strong> {fmtQty(totals.monthYtd)}</span>
            <span><strong>% {monthName} YTD vs forecasted:</strong> {fmtPct(pctVsPlan(totals.monthYtd, totals.monthForecast))}</span>
            <span><strong>Remaining-year forecast:</strong> {fmtQty(totals.remaining)}</span>
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
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: IDENTITY_COLUMNS_WIDTH_PX + 820, fontSize: 12, tableLayout: 'fixed' }}>
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
                      title={column.label}
                      align="left"
                      style={{
                        ...stickyIdentityStyle(index, true),
                        textAlign: 'left',
                        paddingTop: 8,
                        paddingBottom: 8,
                        color: '#334155',
                      }}
                    >
                      {column.label}
                    </th>
                  ))}
                  {[
                    { key: 'planned', label: <>Planned<br />MTO</> },
                    {
                      key: 'status',
                      label: <>LOST<br />or<br />OBS or<br />NEW</>,
                      widthCh: 6,
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
                  <th style={{ ...priorHeaderStyle, borderLeft: '1px solid #e2e8f0' }}>{`Forecasted ${previousMonthName}`}</th>
                  <th style={priorHeaderStyle}>{`${previousMonthName} Forecast - ADJUSTED`}</th>
                  <th style={priorHeaderStyle}>{`${previousMonthName} YTD`}</th>
                  <th style={priorHeaderStyle}>{`% ${previousMonthName} YTD vs Forecasted`}</th>
                  <th style={{ ...monthHeaderStyle, borderLeft: '2px solid #c7d2fe' }}>{`Forecasted ${monthName}`}</th>
                  <th style={monthHeaderStyle}>{`${monthName} Forecast - ADJUSTED`}</th>
                  <th style={monthHeaderStyle}>{`${monthName} YTD`}</th>
                  <th style={monthHeaderStyle}>{`% ${monthName} YTD vs Forecasted`}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
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
                      <td
                        style={{
                          padding: 4,
                          borderTop: '1px solid #e2e8f0',
                          width: columnWidth(6),
                          minWidth: columnWidth(6),
                          maxWidth: columnWidth(6),
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
                        {fmtQty(adjustedMonthQty(line.forecastQty, line.actualQty, previousMonth, dataThru || null))}
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
                      <td style={{ ...monthInputCellStyle, borderLeft: '2px solid #c7d2fe' }}>
                        <input
                          type="number"
                          value={qtyValue(line.forecastQty, selectedMonth)}
                          onChange={(event) => updateMonthQty(line.id, 'forecastQty', selectedMonth, event.target.value)}
                          style={monthQtyInputStyle}
                          aria-label={`Forecasted ${monthName}`}
                        />
                      </td>
                      <td style={monthCellStyle}>
                        {fmtQty(adjustedMonthQty(line.forecastQty, line.actualQty, selectedMonth, dataThru || null))}
                      </td>
                      <td style={monthInputCellStyle}>
                        <input
                          type="number"
                          value={qtyValue(line.actualQty, selectedMonth)}
                          onChange={(event) => updateMonthQty(line.id, 'actualQty', selectedMonth, event.target.value)}
                          style={monthQtyInputStyle}
                          aria-label={`${monthName} YTD`}
                        />
                      </td>
                      <td style={monthCellStyle}>
                        {fmtPct(pctVsPlan(
                          qtyValue(line.actualQty, selectedMonth),
                          qtyValue(line.forecastQty, selectedMonth)
                        ))}
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={15} style={{ padding: 16, color: '#64748b' }}>
                      No forecast rows for this customer yet. Add a row or import the workbook, then save.
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
