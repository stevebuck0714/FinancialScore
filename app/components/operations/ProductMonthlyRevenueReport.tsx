'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FORECAST_MONTH_FULL_LABELS,
  FORECAST_MONTHS,
  STATUS_FLAG_OPTIONS,
  PRODUCTION_TYPE_OPTIONS,
  closedMonths,
  monthQty,
  type ForecastMonth,
  type MonthQtyMap,
} from '@/lib/operations/product-revenue-forecast';
import {
  compactParsedRevenueWorkbook,
  parseProductOperationsFile,
  pctDaysShippedMonth,
  pctDaysShippedYear,
  pctRevenueShipped,
  revenueDifference,
  workbookUpdatedDate,
  type RevenueTotals,
  type ShippingDay,
} from '@/lib/operations/product-revenue-actual';
import { workbookImportErrorMessage } from '@/lib/operations/product-revenue-forecast';

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
  team: string;
  csr: string;
  productionType: string;
  statusFlag: string;
  actualRevenue: MonthQtyMap;
  estimated: MonthQtyMap;
  estimatedAdjusted: MonthQtyMap;
  forecastQty: MonthQtyMap;
  contractPrice: number | null;
  sgpPrice: number | null;
  annualBaseQty: number | null;
  sgpEstimated: number;
  annualEstimated: number;
  annualYtd: number;
};

type ProductMonthlyRevenueReportProps = {
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
    paddingLeft: header ? IDENTITY_CELL_PAD_X + (column.compact ? 5 : 8) : IDENTITY_CELL_PAD_X,
    paddingRight: IDENTITY_CELL_PAD_X,
  };
}

const qtyInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: '100%',
  minWidth: 0,
  textAlign: 'right',
  padding: '5px 2px',
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

function comparePn(a: string, b: string): number {
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
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

function qtyValue(map: MonthQtyMap | undefined, month: ForecastMonth): number {
  return monthQty(map || {}, month);
}

function fmtPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function emptyTotals(): RevenueTotals {
  return {
    lineCount: 0,
    sgpEstimated: 0,
    annualEstimated: 0,
    annualAdjusted: 0,
    annualYtd: 0,
    months: FORECAST_MONTHS.reduce((acc, month) => {
      acc[month] = { estimated: 0, adjusted: 0, ytd: 0 };
      return acc;
    }, {} as RevenueTotals['months']),
    quarters: { 1: { estimated: 0, adjusted: 0, ytd: 0 }, 2: { estimated: 0, adjusted: 0, ytd: 0 }, 3: { estimated: 0, adjusted: 0, ytd: 0 }, 4: { estimated: 0, adjusted: 0, ytd: 0 } },
  };
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      <strong>{label}:</strong>{' '}
      <span style={{ fontWeight: strong ? 700 : 500 }}>{value}</span>
    </span>
  );
}

export default function ProductMonthlyRevenueReport({
  selectedCompanyId,
  onOpenInfo,
}: ProductMonthlyRevenueReportProps) {
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
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<ForecastMonth>(currentMonth());
  const [sortKey, setSortKey] = useState<'itemSku' | 'customerPartNumber'>('itemSku');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.key === customerKey) || null,
    [customers, customerKey]
  );

  const closed = useMemo(() => closedMonths(dataThru || null), [dataThru]);
  const monthName = FORECAST_MONTH_FULL_LABELS[selectedMonth];
  const previousMonth = (selectedMonth === 1 ? 12 : selectedMonth - 1) as ForecastMonth;
  const previousMonthName = FORECAST_MONTH_FULL_LABELS[previousMonth];
  const updated = workbookUpdatedDate(dataThru || null);

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

  const applyPayload = useCallback((payload: any, options?: { keepDirty?: boolean }) => {
    if (payload?.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
    if (Array.isArray(payload?.customers)) {
      setCustomers((prev) => mergeCustomers(prev, payload.customers));
    }
    if (payload?.totals) setTotals(payload.totals);
    if (typeof payload?.companyLineCount === 'number') setCompanyLineCount(payload.companyLineCount);
    if (typeof payload?.priceCount === 'number') setPriceCount(payload.priceCount);
    if (Array.isArray(payload?.shippingDays)) setShippingDays(payload.shippingDays);
    setLines(Array.isArray(payload?.lines) ? payload.lines : []);
    if (!options?.keepDirty) setDirty(false);
  }, [mergeCustomers]);

  const loadDataset = useCallback(async (nextYear = year, customer?: CustomerOption | null) => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        companyId: selectedCompanyId,
        year: String(nextYear),
      });
      if (customer) {
        params.set('customerId', customer.customerId);
        params.set('customerName', customer.customerName);
      }
      const revenueRes = await fetch(`/api/operational-data/product-revenue?${params.toString()}`);
      const revenueJson = await revenueRes.json().catch(() => ({}));
      if (!revenueRes.ok) throw new Error(revenueJson.error || 'Failed to load monthly revenue');
      setCustomers((prev) => mergeCustomers(customer ? prev : [], revenueJson.customers || []));
      applyPayload(revenueJson);
      void fetch(`/api/operational-data/product-raw?companyId=${encodeURIComponent(selectedCompanyId)}&view=customers`)
        .then(async (csiRes) => {
          const csiJson = await csiRes.json().catch(() => ({}));
          if (!csiRes.ok) return;
          setCustomers((prev) => mergeCustomers(prev, csiJson.customers || []));
        })
        .catch(() => {
          // CSI names are optional; revenue customers are enough to use the page.
        });
    } catch (err: any) {
      setError(err?.message || 'Failed to load monthly revenue');
      setLines([]);
      setTotals(emptyTotals());
    } finally {
      setLoading(false);
    }
  }, [applyPayload, mergeCustomers, selectedCompanyId]);

  useEffect(() => {
    setCustomerKey('');
    setLines([]);
    setDirty(false);
  }, [selectedCompanyId]);

  useEffect(() => {
    void loadDataset(year, selectedCustomer);
  }, [selectedCompanyId, year, selectedCustomer?.key, loadDataset]);

  const markDirty = () => {
    setDirty(true);
    setNotice(null);
  };

  const updateMonthRevenue = (id: string, month: ForecastMonth, raw: string) => {
    const parsed = raw === '' ? 0 : Math.round(Number(raw));
    const value = Number.isFinite(parsed) ? parsed : 0;
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        return { ...line, actualRevenue: { ...line.actualRevenue, [String(month)]: value } };
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
    if (!selectedCompanyId) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/operational-data/product-revenue', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          year,
          dataThru: dataThru || null,
          customerId: selectedCustomer?.customerId || '',
          customerName: selectedCustomer?.customerName || '',
          lines: selectedCustomer
            ? lines.map((line) => ({
                ...line,
                customerName: selectedCustomer.customerName,
              }))
            : [],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to save');
      applyPayload(payload);
      setNotice(
        selectedCustomer
          ? `Saved ${Array.isArray(payload.lines) ? payload.lines.length : lines.length} rows for ${selectedCustomer.label}.`
          : 'Saved Data thru.'
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to save monthly revenue');
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
      const parsed = compactParsedRevenueWorkbook(await parseProductOperationsFile(file, year));
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
        throw new Error(
          payload.error || payload.message || `Failed to import workbook (${response.status})`
        );
      }
      const importedYear = Number(payload.year) || year;
      setYear(importedYear);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
      setDirty(false);
      await loadDataset(importedYear, selectedCustomer);
      setNotice(
        `Imported ${payload.rowCount || 0} revenue rows and ${payload.priceCount || 0} prices.`
      );
    } catch (err: unknown) {
      setError(workbookImportErrorMessage(err, 'Failed to import workbook'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const monthTotals = totals.months[selectedMonth] || { estimated: 0, adjusted: 0, ytd: 0 };
  const priorTotals = totals.months[previousMonth] || { estimated: 0, adjusted: 0, ytd: 0 };
  const scopeLabel = selectedCustomer ? selectedCustomer.label : 'Company';
  const skuCount = selectedCustomer ? totals.lineCount : companyLineCount || totals.lineCount;

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
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Monthly Revenue</h3>
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
        Monthly forecasted $ vs actual booked $ by APR P/N. Forecasted is Monthly Forecast units × Jan-1 contract price. Leave Customer blank for company totals.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginBottom: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Customer
          <select
            value={customerKey}
            onChange={(event) => handleCustomerChange(event.target.value)}
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
          disabled={saving || !dirty}
          style={{
            border: '1px solid #4338ca',
            borderRadius: 8,
            padding: '8px 14px',
            background: saving || !dirty ? '#c7d2fe' : '#4f46e5',
            color: '#ffffff',
            fontWeight: 700,
            cursor: saving || !dirty ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          {saving ? 'Saving…' : dirty ? 'Save page' : 'Saved'}
        </button>
      </div>

      {loading && <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>Loading monthly revenue…</div>}
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {notice && <div style={{ color: '#166534', fontSize: 13, marginBottom: 8 }}>{notice}</div>}
      {!loading && skuCount > 0 && priceCount === 0 && (
        <div style={{ color: '#b45309', fontSize: 13, marginBottom: 8 }}>
          Part rows loaded from Monthly Forecast, but forecasted $ needs the Jan-1 price list and Actual $ needs Revenue Current Year. Import the same workbook on this page.
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
          <Metric label="Scope" value={scopeLabel} strong />
          <Metric label="SKUs" value={skuCount.toLocaleString()} />
          <Metric label="Updated" value={updated || '—'} />
          <Metric label="Data thru" value={dataThru || '—'} />
          {closed.length ? <Metric label="Closed through" value={FORECAST_MONTH_FULL_LABELS[closed[closed.length - 1]]} /> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#0f172a', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', letterSpacing: 0.4 }}>ANNUAL</div>
          <Metric label={`Forecasted $ ${year}`} value={fmtMoney(totals.annualEstimated)} />
          <Metric label={`Forecast - Adj $ ${year}`} value={fmtMoney(totals.annualAdjusted)} />
          <Metric label={`YTD $ ${year}`} value={fmtMoney(totals.annualYtd)} />
          <Metric label="% YTD vs Forecasted" value={fmtPct(pctRevenueShipped(totals.annualYtd, totals.annualEstimated))} />
          <Metric label="% YTD vs Forecast - Adj" value={fmtPct(pctRevenueShipped(totals.annualYtd, totals.annualAdjusted))} />
          <Metric label="% Days Shipped" value={fmtPct(pctDaysShippedYear(shippingDays, year, dataThru || null))} />
        </div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13, color: '#334155' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>{previousMonthName}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Metric label="Forecasted" value={fmtMoney(priorTotals.estimated)} />
              <Metric label="Forecast - Adj" value={fmtMoney(priorTotals.adjusted)} />
              <Metric label="Actual" value={fmtMoney(priorTotals.ytd)} />
              <Metric label="% Actual vs Forecasted" value={fmtPct(pctRevenueShipped(priorTotals.ytd, priorTotals.estimated))} />
              <Metric label="% Actual vs Forecast - Adj" value={fmtPct(pctRevenueShipped(priorTotals.ytd, priorTotals.adjusted))} />
              <Metric label="Difference" value={fmtMoney(revenueDifference(priorTotals.ytd, priorTotals.estimated))} />
              <Metric label="% Days Shipped" value={fmtPct(pctDaysShippedMonth(shippingDays, year, previousMonth, dataThru || null))} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#3730a3', marginBottom: 4 }}>{monthName}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: '#312e81' }}>
              <Metric label="Forecasted" value={fmtMoney(monthTotals.estimated)} />
              <Metric label="Forecast - Adj" value={fmtMoney(monthTotals.adjusted)} />
              <Metric label="Actual" value={fmtMoney(monthTotals.ytd)} />
              <Metric label="% Actual vs Forecasted" value={fmtPct(pctRevenueShipped(monthTotals.ytd, monthTotals.estimated))} />
              <Metric label="% Actual vs Forecast - Adj" value={fmtPct(pctRevenueShipped(monthTotals.ytd, monthTotals.adjusted))} />
              <Metric label="Difference" value={fmtMoney(revenueDifference(monthTotals.ytd, monthTotals.estimated))} />
              <Metric label="% Days Shipped" value={fmtPct(pctDaysShippedMonth(shippingDays, year, selectedMonth, dataThru || null))} />
            </div>
          </div>
        </div>
      </div>

      {!selectedCustomer ? (
        <div style={{ padding: '8px 0 24px', color: '#64748b', fontSize: 13 }}>
          Company totals above cover every SKU for these dates. Select a customer to enter monthly Actual $ by part.
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
                <th style={{ textAlign: 'right', padding: '8px 2px', color: '#334155', background: '#f8fafc', fontSize: 11, fontWeight: 700, verticalAlign: 'bottom', width: columnWidth(6), minWidth: columnWidth(6), maxWidth: columnWidth(6), boxSizing: 'border-box', whiteSpace: 'normal', lineHeight: 1.2 }}>
                  Planned<br />MTO
                </th>
                <th style={{ textAlign: 'right', padding: '8px 2px', color: '#334155', background: '#f8fafc', fontSize: 11, fontWeight: 700, verticalAlign: 'bottom', width: columnWidth(5), minWidth: columnWidth(5), maxWidth: columnWidth(5), boxSizing: 'border-box', whiteSpace: 'normal', lineHeight: 1.2 }}>
                  LOST / OBS<br />NEW
                </th>
                <th style={{ ...priorHeaderStyle, borderLeft: '1px solid #e2e8f0' }}>Forecasted<br />{previousMonthName}<br />&nbsp;</th>
                <th style={priorHeaderStyle}>{previousMonthName}<br />Forecast -<br />ADJ</th>
                <th style={priorHeaderStyle}>{previousMonthName}<br />Actual<br />&nbsp;</th>
                <th style={priorHeaderStyle}>% {previousMonthName} Actual<br />vs<br />Forecasted</th>
                <th style={priorHeaderStyle}>% {previousMonthName} Actual<br />vs Forecast -<br />Adj</th>
                <th style={{ ...monthHeaderStyle, borderLeft: '2px solid #c7d2fe' }}>Forecasted<br />{monthName}<br />&nbsp;</th>
                <th style={monthHeaderStyle}>{monthName}<br />Forecast -<br />ADJ</th>
                <th style={monthHeaderStyle}>{monthName}<br />Actual<br />&nbsp;</th>
                <th style={monthHeaderStyle}>% {monthName} Actual<br />vs<br />Forecasted</th>
                <th style={monthHeaderStyle}>% {monthName} Actual<br />vs Forecast -<br />Adj</th>
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
                  <td style={{ padding: 4, borderTop: '1px solid #e2e8f0', width: columnWidth(6), minWidth: columnWidth(6), maxWidth: columnWidth(6), boxSizing: 'border-box' }}>
                    {PRODUCTION_TYPE_OPTIONS.includes(line.productionType as any) || line.productionType
                      ? line.productionType || '—'
                      : '—'}
                  </td>
                  <td style={{ padding: 4, borderTop: '1px solid #e2e8f0', textAlign: 'right', width: columnWidth(5), minWidth: columnWidth(5), maxWidth: columnWidth(5), boxSizing: 'border-box' }}>
                    {STATUS_FLAG_OPTIONS.includes(line.statusFlag as any) || line.statusFlag
                      ? line.statusFlag || '—'
                      : '—'}
                  </td>
                  <td style={{ ...priorCellStyle, borderLeft: '1px solid #e2e8f0' }}>
                    {fmtMoney(monthQty(line.estimated, previousMonth))}
                  </td>
                  <td style={priorCellStyle}>
                    {fmtMoney(qtyValue(line.estimatedAdjusted, previousMonth))}
                  </td>
                  <td style={priorCellStyle}>{fmtMoney(monthQty(line.actualRevenue, previousMonth))}</td>
                  <td style={priorCellStyle}>
                    {fmtPct(pctRevenueShipped(
                      monthQty(line.actualRevenue, previousMonth),
                      monthQty(line.estimated, previousMonth)
                    ))}
                  </td>
                  <td style={priorCellStyle}>
                    {fmtPct(pctRevenueShipped(
                      monthQty(line.actualRevenue, previousMonth),
                      qtyValue(line.estimatedAdjusted, previousMonth)
                    ))}
                  </td>
                  <td style={{ ...monthCellStyle, borderLeft: '2px solid #c7d2fe' }}>
                    {fmtMoney(monthQty(line.estimated, selectedMonth))}
                  </td>
                  <td style={monthCellStyle}>
                    {fmtMoney(qtyValue(line.estimatedAdjusted, selectedMonth))}
                  </td>
                  <td style={monthInputCellStyle}>
                    <input
                      type="number"
                      step="1"
                      value={Math.round(monthQty(line.actualRevenue, selectedMonth)) || 0}
                      onChange={(event) => updateMonthRevenue(line.id, selectedMonth, event.target.value)}
                      style={monthQtyInputStyle}
                      aria-label={`${monthName} Actual`}
                    />
                  </td>
                  <td style={monthCellStyle}>
                    {fmtPct(pctRevenueShipped(
                      monthQty(line.actualRevenue, selectedMonth),
                      monthQty(line.estimated, selectedMonth)
                    ))}
                  </td>
                  <td style={monthCellStyle}>
                    {fmtPct(pctRevenueShipped(
                      monthQty(line.actualRevenue, selectedMonth),
                      qtyValue(line.estimatedAdjusted, selectedMonth)
                    ))}
                  </td>
                </tr>
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={17} style={{ padding: 16, color: '#64748b' }}>
                    No revenue rows for this customer yet. Import the workbook, or add the part on Monthly Forecast first.
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
