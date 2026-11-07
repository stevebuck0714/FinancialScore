'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SuggestInput, { fetchSuggestions, labeledSuggestionsFor } from './SuggestInput';
import {
  FORECAST_MONTH_FULL_LABELS,
  FORECAST_MONTH_LABELS,
  FORECAST_MONTHS,
  PRODUCTION_TYPE_OPTIONS,
  closedMonths,
  monthQty,
  pctVsPlan,
  remainingForecastQty,
  type ForecastMonth,
  type MonthQtyMap,
} from '@/lib/operations/product-revenue-forecast';
import {
  isVendorForecastMonthEditable,
  type VendorMonthlyForecastLineInput,
} from '@/lib/operations/vendor-monthly-forecast';
import { estMonthIndex, estYear } from '@/lib/time/eastern';
import ReportSummaryCards from './ReportSummaryCards';
import { useAprVendorLookup } from './useAprVendorLookup';

type VendorOption = {
  vendorId: string;
  vendorName: string;
  key: string;
  label: string;
  lineCount?: number;
};

type ForecastLine = VendorMonthlyForecastLineInput & {
  id: string;
  inforForecastQty?: MonthQtyMap;
  forecastOverrideQty?: MonthQtyMap;
};

function lineEditSignature(line: ForecastLine): string {
  return line.productionType || '';
}

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
type VendorForecastSortKey =
  | IdentitySortKey
  | 'productionType'
  | 'previousEstimated'
  | 'previousActual'
  | 'previousPct'
  | 'selectedEstimated'
  | 'selectedActual'
  | 'selectedPct';

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
  const loadAprSuggestions = useCallback(
    (query: string, signal: AbortSignal) =>
      fetchSuggestions('/api/operational-data/vendor-forecast', { companyId: selectedCompanyId, year: String(year), itemSuggest: query }, signal),
    [selectedCompanyId, year]
  );
  const [dataThru, setDataThru] = useState('');
  const [vendorIdSearch, setVendorIdSearch] = useState('');
  const [vendorKey, setVendorKey] = useState('');
  const [aprSearch, setAprSearch] = useState('');
  const [aprVendorKey, setAprVendorKey] = useState('');
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const vendorIdSuggestions = useMemo(
    () => labeledSuggestionsFor(vendors.map((vendor) => ({ value: vendor.vendorId, label: vendor.vendorName || vendor.label }))),
    [vendors]
  );
  const [lines, setLines] = useState<ForecastLine[]>([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [inforSourceDate, setInforSourceDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<ForecastMonth>(currentMonth());
  const [sortKey, setSortKey] = useState<VendorForecastSortKey>('itemSku');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const savedSignatures = useRef(new Map<string, string>());
  const vendorsRequestSeq = useRef(0);

  const applyLoadedLines = useCallback((next: ForecastLine[]) => {
    savedSignatures.current = new Map(next.map((line) => [line.id, lineEditSignature(line)]));
    setLines(next);
  }, []);

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
      setInforSourceDate(payload.inforSourceDate ? String(payload.inforSourceDate).slice(0, 10) : '');
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
      applyLoadedLines(Array.isArray(payload.lines) ? payload.lines : []);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
      setInforSourceDate(payload.inforSourceDate ? String(payload.inforSourceDate).slice(0, 10) : '');
      setDirty(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to load forecast rows');
      applyLoadedLines([]);
    } finally {
      setLoadingLines(false);
    }
  }, [applyLoadedLines, selectedCompanyId, year]);

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

  const handleVendorChange = (nextKey: string) => {
    if (dirty && !window.confirm('You have unsaved changes. Switch vendor without saving?')) return;
    setVendorKey(nextKey);
  };

  const handleVendorIdSearchChange = (nextVendorId: string) => {
    setVendorIdSearch(nextVendorId);
    const matchingVendor = vendors.find(
      (vendor) => vendor.vendorId.trim().toLowerCase() === nextVendorId.trim().toLowerCase()
    );
    if (matchingVendor && matchingVendor.key !== vendorKey) {
      handleVendorChange(matchingVendor.key);
    }
  };

  useEffect(() => {
    if (dirty) return;
    const matchingVendor = vendors.find(
      (vendor) => vendor.vendorId.trim().toLowerCase() === vendorIdSearch.trim().toLowerCase()
    );
    if (vendorIdSearch.trim() && matchingVendor && matchingVendor.key !== vendorKey) {
      setVendorKey(matchingVendor.key);
    }
  }, [dirty, vendorIdSearch, vendorKey, vendors]);

  const hasSearch = Boolean(vendorIdSearch.trim() || vendorKey || aprSearch.trim());

  const handleReset = () => {
    if (dirty && !window.confirm('You have unsaved changes. Reset search without saving?')) return;
    setVendorIdSearch('');
    setVendorKey('');
    setAprSearch('');
    setAprVendorKey('');
    setNotice(null);
  };

  const handleYearChange = (nextYear: number) => {
    if (dirty && !window.confirm('You have unsaved changes. Switch year without saving?')) return;
    setYear(nextYear);
  };

  const handleSave = async () => {
    if (!selectedCompanyId || !selectedVendor) return;
    const changed = lines.filter((line) => savedSignatures.current.get(line.id) !== lineEditSignature(line));
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
          lines: changed.map((line) => ({
            id: line.id,
            productionType: line.productionType || '',
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to save');
      applyLoadedLines(Array.isArray(payload.lines) ? payload.lines : lines);
      if (payload.dataThru) setDataThru(String(payload.dataThru).slice(0, 10));
      setDirty(false);
      setNotice(`Saved ${changed.length.toLocaleString()} changed rows for ${selectedVendor.label}.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to save monthly forecast');
    } finally {
      setSaving(false);
    }
  };

  const filteredLines = useMemo(() => {
    const query = aprSearch.trim().toLowerCase();
    if (!query) return lines;
    return lines.filter((line) => String(line.itemSku || '').toLowerCase().includes(query));
  }, [aprSearch, lines]);

  const aprLookup = useAprVendorLookup({
    companyId: selectedCompanyId,
    year,
    aprSearch,
    needsLookup: !selectedVendor || (vendorKey === aprVendorKey && !loadingLines && filteredLines.length === 0),
    onSingleVendor: (key) => {
      if (key === vendorKey) return;
      if (dirty && !window.confirm('You have unsaved changes. Switch vendor without saving?')) return;
      setVendorIdSearch('');
      setVendorKey(key);
      setAprVendorKey(key);
    },
  });
  const vendorChoices = aprLookup?.status === 'multiple'
    ? vendors.filter((vendor) => aprLookup.vendorKeys.includes(vendor.key) || vendor.key === vendorKey)
    : vendors;

  const totals = useMemo(() => {
    return filteredLines.reduce(
      (acc, line) => {
        acc.remaining += remainingForecastQty(line.forecastQty, dataThru || null);
        acc.monthEstimated += qtyValue(line.forecastQty, selectedMonth);
        acc.monthActual += qtyValue(line.actualQty, selectedMonth);
        acc.annualEstimated += FORECAST_MONTHS.reduce((sum, month) => sum + qtyValue(line.forecastQty, month), 0);
        return acc;
      },
      { remaining: 0, monthEstimated: 0, monthActual: 0, annualEstimated: 0 }
    );
  }, [dataThru, filteredLines, selectedMonth]);

  const sortedLines = useMemo(() => {
    const next = [...filteredLines];
    const direction = sortDir === 'asc' ? 1 : -1;
    const valueFor = (line: ForecastLine): string | number => {
      switch (sortKey) {
        case 'productionType':
          return line.productionType || '';
        case 'previousEstimated':
          return qtyValue(line.forecastQty, previousMonth);
        case 'previousActual':
          return qtyValue(line.actualQty, previousMonth);
        case 'previousPct':
          return pctVsPlan(qtyValue(line.actualQty, previousMonth), qtyValue(line.forecastQty, previousMonth)) ?? -Infinity;
        case 'selectedEstimated':
          return qtyValue(line.forecastQty, selectedMonth);
        case 'selectedActual':
          return qtyValue(line.actualQty, selectedMonth);
        case 'selectedPct':
          return pctVsPlan(qtyValue(line.actualQty, selectedMonth), qtyValue(line.forecastQty, selectedMonth)) ?? -Infinity;
        default:
          return line[sortKey] || '';
      }
    };
    next.sort((a, b) => {
      const left = valueFor(a);
      const right = valueFor(b);
      const primary =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : compareIdentity(String(left), String(right));
      if (primary !== 0) return primary * direction;
      return (
        compareIdentity(a.itemSku, b.itemSku) ||
        compareIdentity(a.customerName, b.customerName) ||
        compareIdentity(a.customerPartNumber, b.customerPartNumber)
      );
    });
    return next;
  }, [filteredLines, sortDir, sortKey]);

  const handleSort = (key: VendorForecastSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const sortLabel = (key: VendorForecastSortKey) =>
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
        <button
          type="button"
          onClick={handleReset}
          disabled={!hasSearch || saving}
          style={{
            marginLeft: 'auto',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '8px 14px',
            background: '#ffffff',
            color: !hasSearch || saving ? '#94a3b8' : '#334155',
            fontWeight: 700,
            cursor: !hasSearch || saving ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          Reset
        </button>
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
      <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 13, lineHeight: 1.5 }}>
        Monthly estimated units vs actual shipped units by APR P/N and vendor. Rows, vendor, and estimated units come from the Infor order book
        (open order lines at ordered quantity, filled lines at shipped quantity, by due month); past months keep the estimate they closed with.
        Actuals come from Infor shipments.
        {inforSourceDate ? ` Infor orders as of ${inforSourceDate}.` : ''}
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'nowrap', alignItems: 'end', marginBottom: 12, overflowX: 'auto' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Vendor ID
          <SuggestInput
            value={vendorIdSearch}
            onChange={handleVendorIdSearchChange}
            suggestions={vendorIdSuggestions}
            placeholder="Search vendor ID"
            style={{ ...inputStyle, width: 180 }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          Vendor Name
          <select
            value={vendorKey}
            onChange={(event) => handleVendorChange(event.target.value)}
            disabled={loadingVendors && vendors.length === 0}
            style={{ ...inputStyle, minWidth: 280 }}
          >
            <option value="">
              {loadingVendors && vendors.length === 0 ? 'Loading vendors…' : 'Select a vendor'}
            </option>
            {vendorChoices.map((vendor) => (
              <option key={vendor.key} value={vendor.key}>
                {vendor.label}{vendor.lineCount ? ` (${vendor.lineCount})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#334155', fontWeight: 600 }}>
          APR P/N
          <SuggestInput
            value={aprSearch}
            onChange={setAprSearch}
            loadSuggestions={loadAprSuggestions}
            placeholder="Search APR P/N"
            style={{ ...inputStyle, width: 160 }}
          />
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
      </div>

      {loadingVendors && vendors.length === 0 && (
        <div style={{ color: '#64748b', fontSize: 13, marginBottom: 8 }}>Loading vendors…</div>
      )}
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {notice && <div style={{ color: '#166534', fontSize: 13, marginBottom: 8 }}>{notice}</div>}

      {aprLookup?.status === 'multiple' && (
        <div style={{ color: '#92400e', fontSize: 13, marginBottom: 8 }}>
          APR P/N &quot;{aprSearch.trim()}&quot; matches {aprLookup.vendorKeys.length} vendors. Pick one in Vendor Name.
        </div>
      )}

      {!selectedVendor ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>
          {aprLookup?.status === 'loading'
            ? `Finding the vendor for APR P/N "${aprSearch.trim()}"…`
            : aprLookup?.status === 'none'
              ? `No vendor has APR P/N "${aprSearch.trim()}" in ${year}.`
              : 'Select a vendor or search an APR P/N to see its Infor forecast rows.'}
        </div>
      ) : loadingLines ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>Loading forecast rows…</div>
      ) : (
        <>
          <ReportSummaryCards
            groups={[
              {
                key: 'year',
                title: String(year),
                tone: 'annual',
                cards: [
                  { label: 'Annual estimated', value: fmtQty(totals.annualEstimated) },
                  { label: 'Remaining-year estimated', value: fmtQty(totals.remaining) },
                ],
              },
              {
                key: 'month',
                title: monthName,
                tone: 'month',
                cards: [
                  { label: 'Estimated', value: fmtQty(totals.monthEstimated) },
                  { label: 'Actual', value: fmtQty(totals.monthActual) },
                  { label: '% Actual vs Estimated', value: fmtPct(pctVsPlan(totals.monthActual, totals.monthEstimated)) },
                ],
              },
              {
                key: 'context',
                title: 'Scope',
                cards: [
                  { label: 'Rows', value: filteredLines.length.toLocaleString() },
                  ...(closed.length
                    ? [{ label: 'Closed through', value: FORECAST_MONTH_LABELS[closed[closed.length - 1]] }]
                    : []),
                ],
              },
            ]}
          />
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
              {selectedVendor.vendorId && selectedVendor.vendorId !== selectedVendor.label ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', marginLeft: 8 }}>Vendor ID</div>
                  <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {selectedVendor.vendorId}
                  </div>
                </>
              ) : null}
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
                      onClick={() => handleSort(column.key)}
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
                      {column.label}{sortLabel(column.key)}
                    </th>
                  ))}
                  <th
                    title="Sort by Planned / MTO"
                    onClick={() => handleSort('productionType')}
                    aria-sort={sortKey === 'productionType' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
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
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Planned<br />MTO{sortLabel('productionType')}
                  </th>
                  <th title={`Sort by Estimated ${previousMonthName}`} onClick={() => handleSort('previousEstimated')} aria-sort={sortKey === 'previousEstimated' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...priorHeaderStyle, borderLeft: '1px solid #e2e8f0', cursor: 'pointer', userSelect: 'none' }}>{`Estimated ${previousMonthName}`}{sortLabel('previousEstimated')}</th>
                  <th title={`Sort by ${previousMonthName} Actual`} onClick={() => handleSort('previousActual')} aria-sort={sortKey === 'previousActual' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...priorHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>{`${previousMonthName} Actual`}{sortLabel('previousActual')}</th>
                  <th title={`Sort by ${previousMonthName} Actual vs Estimated`} onClick={() => handleSort('previousPct')} aria-sort={sortKey === 'previousPct' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...priorHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>{`% ${previousMonthName} Actual vs Estimated`}{sortLabel('previousPct')}</th>
                  <th title={`Sort by Estimated ${monthName}`} onClick={() => handleSort('selectedEstimated')} aria-sort={sortKey === 'selectedEstimated' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...monthHeaderStyle, borderLeft: '2px solid #c7d2fe', cursor: 'pointer', userSelect: 'none' }}>{`Estimated ${monthName}`}{sortLabel('selectedEstimated')}</th>
                  <th title={`Sort by ${monthName} Actual`} onClick={() => handleSort('selectedActual')} aria-sort={sortKey === 'selectedActual' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...monthHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>{`${monthName} Actual`}{sortLabel('selectedActual')}</th>
                  <th title={`Sort by ${monthName} Actual vs Estimated`} onClick={() => handleSort('selectedPct')} aria-sort={sortKey === 'selectedPct' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} style={{ ...monthHeaderStyle, cursor: 'pointer', userSelect: 'none' }}>{`% ${monthName} Actual vs Estimated`}{sortLabel('selectedPct')}</th>
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
                    <td
                      style={{ ...monthCellStyle, borderLeft: '2px solid #c7d2fe' }}
                      title={isVendorForecastMonthEditable(year, selectedMonth)
                        ? 'Infor order book'
                        : 'Estimate locked at month end'}
                    >
                      {fmtQty(qtyValue(line.forecastQty, selectedMonth))}
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
                      No forecast rows for this vendor. Rows appear for items with open Infor orders or shipments in the last 12 months.
                    </td>
                  </tr>
                )}
                {lines.length > 0 && filteredLines.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ padding: 16, color: '#64748b' }}>
                      No rows for this vendor match APR P/N &quot;{aprSearch.trim()}&quot;.
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
