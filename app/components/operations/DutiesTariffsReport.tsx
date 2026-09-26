'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEstDate, formatEstDateLabel } from '@/lib/time/eastern';
import type { CompanyItemDutyRow } from '@/lib/hts/item-duty-overlay';

type MonthlyCogsRow = {
  monthKey: string;
  dutyAmount: number;
  specialAmount: number;
  section301Amount: number;
  section232Amount: number;
  ieepaAmount: number;
  additionalAmount: number;
  tariffAmount: number;
  quantity: number;
  skuCount: number;
};

type DutiesTariffsReportProps = {
  selectedCompanyId: string;
  onOpenInfo?: () => void;
};

type OffshoreVendorOption = {
  vendorId: string;
  vendorName: string;
  country: string | null;
};

type TariffImportPreview = {
  sheetName: string;
  totalRows: number;
  matched: number;
  unchanged: number;
  unmatched: Array<{ rowNumber: number; itemSku: string }>;
  ambiguous: Array<{ rowNumber: number; itemSku: string; matches: string[] }>;
  duplicates: Array<{ itemSku: string; rowNumbers: number[] }>;
  invalid: Array<{ rowNumber: number; itemSku: string; message: string }>;
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

function moneyText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return Number(value).toFixed(4);
}

function parseMoney(value: string): number | null {
  const text = value.replace(/[$,\s]/g, '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function usdText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value));
}

function pctText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(2)}%`;
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const PROGRAM_LABELS: Record<string, string> = { none: 'None', usmca: 'USMCA', other: 'Other' };
const UNIT_LABELS: Record<string, string> = { piece: 'Piece', kg: 'kg', lb: 'lb', other: 'Other' };

type DutySortKey =
  | 'itemSku'
  | 'htsCode'
  | 'countryOfOrigin'
  | 'tradeProgram'
  | 'qtyUnit'
  | 'dutyCode'
  | 'dutyDescription'
  | 'enteredValuePerPiece'
  | 'dutyRatePct'
  | 'specialRatePct'
  | 'section301RatePct'
  | 'section232RatePct'
  | 'ieepaRatePct'
  | 'additionalRatePct'
  | 'updatedAt';

const SORT_COLUMNS: Array<{ key: DutySortKey; label: string; align?: 'left' | 'right'; title?: string; width?: number }> = [
  { key: 'itemSku', label: 'Item' },
  { key: 'countryOfOrigin', label: 'Origin' },
  { key: 'tradeProgram', label: 'Program' },
  { key: 'qtyUnit', label: 'Unit' },
  { key: 'dutyCode', label: 'Duty Code', width: 88, title: 'User-maintained duty code. Existing values were imported from the SGP Duty & Tariffs sheet.' },
  { key: 'dutyDescription', label: 'Description', width: 220, title: 'Official description from the HTS rate source.' },
  { key: 'enteredValuePerPiece', label: 'Value $', align: 'right', title: 'Customs entered value per unit. Seeded from SGP material cost. Duty and tariff dollars = this value × the % rates.' },
  { key: 'dutyRatePct', label: 'Duty %', align: 'right' },
  { key: 'specialRatePct', label: 'Special %', align: 'right' },
  { key: 'section301RatePct', label: '301 %', align: 'right' },
  { key: 'section232RatePct', label: '232 %', align: 'right' },
  { key: 'ieepaRatePct', label: 'IEEPA %', align: 'right' },
  { key: 'additionalRatePct', label: 'Other %', align: 'right' },
  { key: 'updatedAt', label: 'Updated' },
];

function sortValue(row: CompanyItemDutyRow, key: DutySortKey): string | number {
  if (key === 'itemSku') return String(row.itemSku || '').trim().toLowerCase();
  if (key === 'htsCode') return String(row.htsCode || '').trim().toLowerCase();
  if (key === 'countryOfOrigin') return String(row.countryOfOrigin || '').trim().toLowerCase();
  if (key === 'tradeProgram') return PROGRAM_LABELS[row.tradeProgram] || row.tradeProgram || '';
  if (key === 'qtyUnit') return UNIT_LABELS[row.qtyUnit] || row.qtyUnit || '';
  if (key === 'dutyCode') return String(row.dutyCode || '').trim().toLowerCase();
  if (key === 'dutyDescription') return String(row.dutyDescription || '').trim().toLowerCase();
  if (key === 'updatedAt') return row.userEditedAt || row.lastSpreadsheetSeedAt || row.updatedAt || '';
  const numeric = row[key];
  return numeric == null || !Number.isFinite(Number(numeric)) ? Number.NEGATIVE_INFINITY : Number(numeric);
}

function compareDutyRows(a: CompanyItemDutyRow, b: CompanyItemDutyRow, key: DutySortKey, dir: 'asc' | 'desc'): number {
  const left = sortValue(a, key);
  const right = sortValue(b, key);
  const leftEmpty = left === '' || left === Number.NEGATIVE_INFINITY;
  const rightEmpty = right === '' || right === Number.NEGATIVE_INFINITY;
  if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;
  let result = 0;
  if (typeof left === 'number' && typeof right === 'number') result = left - right;
  else result = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
  if (result === 0 && key !== 'itemSku') {
    result = String(a.itemSku || '').localeCompare(String(b.itemSku || ''), undefined, { numeric: true, sensitivity: 'base' });
  }
  return dir === 'asc' ? result : -result;
}

const ALL_VENDORS_KEY = 'all';
const UNASSIGNED_VENDOR_KEY = '__unassigned__';

function rowVendorKey(row: CompanyItemDutyRow): string {
  const vendorId = String(row.vendorId || '').trim();
  const vendorName = String(row.vendorName || '').trim();
  if (vendorId) return `id:${vendorId}`;
  if (vendorName) return `name:${vendorName}`;
  return UNASSIGNED_VENDOR_KEY;
}

function rowVendorLabel(row: CompanyItemDutyRow): string {
  return String(row.vendorName || '').trim() || 'Unassigned';
}

export default function DutiesTariffsReport({ selectedCompanyId, onOpenInfo }: DutiesTariffsReportProps) {
  const [items, setItems] = useState<CompanyItemDutyRow[]>([]);
  const [offshoreVendors, setOffshoreVendors] = useState<OffshoreVendorOption[]>([]);
  const [filter, setFilter] = useState<'all' | 'needs_hts'>('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [spreadsheetItems, setSpreadsheetItems] = useState(0);
  const [missingHtsCount, setMissingHtsCount] = useState(0);
  const [sortKey, setSortKey] = useState<DutySortKey>('itemSku');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [vendorFilter, setVendorFilter] = useState(ALL_VENDORS_KEY);
  const [asOfDate, setAsOfDate] = useState(formatEstDate);
  const [refreshing, setRefreshing] = useState(false);
  const [monthlyCogs, setMonthlyCogs] = useState<MonthlyCogsRow[]>([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [tariffImportFile, setTariffImportFile] = useState<File | null>(null);
  const [tariffImportPreview, setTariffImportPreview] = useState<TariffImportPreview | null>(null);
  const [tariffImportCanConfirm, setTariffImportCanConfirm] = useState(false);
  const [tariffImporting, setTariffImporting] = useState(false);

  const load = useCallback(async (nextFilter: 'all' | 'needs_hts') => {
    if (!selectedCompanyId) return;
    await Promise.resolve();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/operational-data/duties-tariffs?companyId=${encodeURIComponent(selectedCompanyId)}&filter=${nextFilter}`
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'Failed to load duties overlay');
      }
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setOffshoreVendors(Array.isArray(payload.vendorOptions) ? payload.vendorOptions : []);
      setSpreadsheetItems(Number(payload.spreadsheetItems || 0));
      setMissingHtsCount(Number(payload.missingHtsCount || 0));
      setDirty(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load duties overlay');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(filter);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [filter, load]);

  const updateRow = (id: string, patch: Partial<CompanyItemDutyRow>) => {
    setItems((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch, needsHtsInput: !(patch.htsCode ?? row.htsCode) } : row))
    );
    setDirty(true);
    setNotice(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/operational-data/duties-tariffs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          items: items.map((row) => ({
            id: row.id,
            itemSku: row.itemSku,
            htsCode: row.htsCode,
            specialHtsCode: row.specialHtsCode,
            section301HtsCode: row.section301HtsCode,
            section232HtsCode: row.section232HtsCode,
            ieepaHtsCode: row.ieepaHtsCode,
            additionalHtsCode: row.additionalHtsCode,
            countryOfOrigin: row.countryOfOrigin,
            tradeProgram: row.tradeProgram,
            qtyUnit: row.qtyUnit,
            dutyCode: row.dutyCode,
            enteredValuePerPiece: row.enteredValuePerPiece,
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'Failed to save');
      }
      setNotice(`Saved ${Number(payload.updated || 0)} item${Number(payload.updated || 0) === 1 ? '' : 's'}.`);
      await load(filter);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const counts = useMemo(() => {
    const missing = items.filter((row) => row.needsHtsInput).length;
    return { total: items.length, missing };
  }, [items]);

  const vendorOptions = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; vendorId: string; count: number }>();
    for (const row of items) {
      const key = rowVendorKey(row);
      const existing = byKey.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.vendorId) existing.vendorId = String(row.vendorId || '').trim();
        continue;
      }
      byKey.set(key, {
        key,
        label: rowVendorLabel(row),
        vendorId: String(row.vendorId || '').trim(),
        count: 1,
      });
    }
    const dutyVendors = Array.from(byKey.values()).sort((left, right) => {
      if (left.key === UNASSIGNED_VENDOR_KEY) return 1;
      if (right.key === UNASSIGNED_VENDOR_KEY) return -1;
      return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' });
    });
    if (!offshoreVendors.length) return dutyVendors;
    return offshoreVendors
      .map((vendor) => {
        const vendorId = String(vendor.vendorId || '').trim();
        const vendorName = String(vendor.vendorName || '').trim();
        const match = dutyVendors.find((option) =>
          (vendorId && option.vendorId === vendorId) ||
          (!vendorId && vendorName && option.label.toLowerCase() === vendorName.toLowerCase())
        );
        return {
          key: vendorId ? `id:${vendorId}` : `name:${vendorName}`,
          label: vendorName || vendorId,
          vendorId,
          count: match?.count || 0,
        };
      })
      .filter((vendor) => Boolean(vendor.label));
  }, [items, offshoreVendors]);

  const effectiveVendorFilter =
    vendorFilter === ALL_VENDORS_KEY || vendorOptions.some((vendor) => vendor.key === vendorFilter)
      ? vendorFilter
      : ALL_VENDORS_KEY;

  const selectedVendor = effectiveVendorFilter === ALL_VENDORS_KEY
    ? null
    : vendorOptions.find((vendor) => vendor.key === effectiveVendorFilter) || null;

  const visibleItems = useMemo(
    () => (effectiveVendorFilter === ALL_VENDORS_KEY ? items : items.filter((row) => rowVendorKey(row) === effectiveVendorFilter)),
    [items, effectiveVendorFilter]
  );

  const loadMonthlySummary = useCallback(async () => {
    if (!selectedCompanyId) return;
    await Promise.resolve();
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const vendorPayload =
        effectiveVendorFilter === ALL_VENDORS_KEY
          ? {}
          : effectiveVendorFilter === UNASSIGNED_VENDOR_KEY
            ? { unassigned: true }
            : effectiveVendorFilter.startsWith('id:')
              ? { vendorId: effectiveVendorFilter.slice(3) }
              : { vendorName: effectiveVendorFilter.slice(5) };
      const response = await fetch('/api/operational-data/duties-tariffs/monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          ...vendorPayload,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'Failed to load monthly tariff summary');
      }
      setMonthlyCogs(Array.isArray(payload.monthlyCogs) ? (payload.monthlyCogs as MonthlyCogsRow[]) : []);
    } catch (loadError) {
      setSummaryError(loadError instanceof Error ? loadError.message : 'Failed to load monthly tariff summary');
      setMonthlyCogs([]);
    } finally {
      setSummaryLoading(false);
    }
  }, [selectedCompanyId, effectiveVendorFilter]);

  useEffect(() => {
    if (!summaryOpen) return;
    const timer = window.setTimeout(() => {
      void loadMonthlySummary();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [summaryOpen, loadMonthlySummary]);

  const summaryScopeLabel =
    effectiveVendorFilter === ALL_VENDORS_KEY
      ? 'All vendors'
      : vendorOptions.find((vendor) => vendor.key === effectiveVendorFilter)?.label || 'Selected vendor';

  const summaryTotals = useMemo(
    () =>
      monthlyCogs.reduce(
        (acc, row) => ({
          dutyAmount: acc.dutyAmount + Number(row.dutyAmount || 0),
          specialAmount: acc.specialAmount + Number(row.specialAmount || 0),
          section301Amount: acc.section301Amount + Number(row.section301Amount || 0),
          section232Amount: acc.section232Amount + Number(row.section232Amount || 0),
          ieepaAmount: acc.ieepaAmount + Number(row.ieepaAmount || 0),
          additionalAmount: acc.additionalAmount + Number(row.additionalAmount || 0),
          tariffAmount: acc.tariffAmount + Number(row.tariffAmount || 0),
          skuCount: acc.skuCount + Number(row.skuCount || 0),
        }),
        {
          dutyAmount: 0,
          specialAmount: 0,
          section301Amount: 0,
          section232Amount: 0,
          ieepaAmount: 0,
          additionalAmount: 0,
          tariffAmount: 0,
          skuCount: 0,
        }
      ),
    [monthlyCogs]
  );

  const sortedItems = useMemo(
    () => [...visibleItems].sort((left, right) => compareDutyRows(left, right, sortKey, sortDir)),
    [visibleItems, sortKey, sortDir]
  );

  const lastRateAsOfDate = useMemo(() => {
    const dates = items.map((row) => String(row.lastRateAsOfDate || '').slice(0, 10)).filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
    dates.sort();
    return dates[dates.length - 1] || null;
  }, [items]);

  const lastRateReleaseName = useMemo(() => {
    const named = items.find((row) => row.lastRateReleaseName);
    return named?.lastRateReleaseName || null;
  }, [items]);

  const refreshRates = async () => {
    if (dirty) {
      setError('Save item edits before refreshing rates.');
      return;
    }
    setRefreshing(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/operational-data/duties-tariffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId, asOfDate }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'Failed to refresh rates');
      }
      const nextItems = Array.isArray(payload.items) ? (payload.items as CompanyItemDutyRow[]) : [];
      const updatedCount = Number(payload.updated || 0);
      const lookedUp = Number(payload.lookedUp || 0);
      const failedCount = Array.isArray(payload.failed) ? payload.failed.length : 0;
      if (lookedUp > 0) {
        setFilter('all');
        setItems(nextItems);
        setMissingHtsCount(nextItems.filter((row) => row.needsHtsInput).length);
      } else {
        setItems(filter === 'needs_hts' ? nextItems.filter((row) => row.needsHtsInput) : nextItems);
      }
      const releaseLabel = payload.releaseTitle || payload.releaseName || 'USITC HTS';
      const appliedDuty = Number(payload.applied?.dutyAmount || 0);
      const appliedTariff = Number(payload.applied?.tariffAmount || 0);
      const appliedRows = Number(payload.applied?.rows || 0);
      if (lookedUp === 0) {
        setError(
          'No saved HTS-10 codes to look up on USITC. Enter HTS-10, click Save, then Refresh rates. Rates appear on All items, not on Needs HTS input.'
        );
      } else {
        const appliedNote =
          appliedRows > 0
            ? ` Applied to sales dates: ${usdText(appliedDuty)} duty, ${usdText(appliedTariff)} tariffs.`
            : ' No sales dollars applied. Items need Value $ and a matching sales history.';
        setNotice(
          `USITC rates as of ${payload.asOfDate || asOfDate} (${releaseLabel}): updated ${updatedCount}, reused ${Number(payload.reused || 0)}, fetched ${Number(payload.fetched || 0)}${failedCount ? `, ${failedCount} HTS failed` : ''}.${appliedNote}`
        );
      }
      if (failedCount && Array.isArray(payload.failed)) {
        const sample = payload.failed
          .slice(0, 3)
          .map((row: { htsCode?: string; error?: string }) => row.htsCode || row.error)
          .join(', ');
        setError(`Some HTS codes could not be fetched from USITC: ${sample}.`);
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh rates');
    } finally {
      setRefreshing(false);
    }
  };

  const previewTariffImport = async () => {
    if (!tariffImportFile) {
      setError('Choose the tariff spreadsheet first.');
      return;
    }
    if (dirty) {
      setError('Save item edits before importing the tariff spreadsheet.');
      return;
    }
    setTariffImporting(true);
    setError(null);
    setNotice(null);
    setTariffImportPreview(null);
    try {
      const form = new FormData();
      form.set('action', 'preview-tariff-import');
      form.set('companyId', selectedCompanyId);
      form.set('file', tariffImportFile);
      const response = await fetch('/api/operational-data/duties-tariffs', { method: 'POST', body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'Failed to read tariff spreadsheet');
      setTariffImportPreview(payload.preview as TariffImportPreview);
      setTariffImportCanConfirm(Boolean(payload.canImport));
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Failed to read tariff spreadsheet');
    } finally {
      setTariffImporting(false);
    }
  };

  const confirmTariffImport = async () => {
    if (!tariffImportFile || !tariffImportCanConfirm) return;
    setTariffImporting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('action', 'confirm-tariff-import');
      form.set('companyId', selectedCompanyId);
      form.set('file', tariffImportFile);
      const response = await fetch('/api/operational-data/duties-tariffs', { method: 'POST', body: form });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'Failed to import tariff spreadsheet');
      const nextItems = Array.isArray(payload.items) ? (payload.items as CompanyItemDutyRow[]) : [];
      setItems(filter === 'needs_hts' ? nextItems.filter((row) => row.needsHtsInput) : nextItems);
      setMonthlyCogs(Array.isArray(payload.monthlyCogs) ? (payload.monthlyCogs as MonthlyCogsRow[]) : []);
      setMissingHtsCount(nextItems.filter((row) => row.needsHtsInput).length);
      setTariffImportPreview(null);
      setTariffImportFile(null);
      setTariffImportCanConfirm(false);
      setNotice(`Imported tariff fields for ${Number(payload.imported || 0).toLocaleString('en-US')} item${Number(payload.imported || 0) === 1 ? '' : 's'}.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Failed to import tariff spreadsheet');
    } finally {
      setTariffImporting(false);
    }
  };

  const toggleSort = (key: DutySortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, color: '#475569' }}>
            Seeded from the uploaded SGP workbook: HTS-10 and origin come from the Duty & Tariffs sheet, Value $ from SGP material cost.
            New SKUs without a spreadsheet HTS stay blank for you to fill, then Save.
            Refresh rates fills Duty % from USITC Column 1, Section 301 from the China 8-digit lists, and IEEPA from origin-based Chapter 99 headings. Then it applies that snapshot to sales dates for product cost and P&L Duties / Tariffs. Value $ is required for dollar amounts.
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Spreadsheet items: {spreadsheetItems}. Missing HTS: {filter === 'all' ? counts.missing : missingHtsCount}.
            Showing {sortedItems.length} of {counts.total} item{counts.total === 1 ? '' : 's'}.
            {lastRateAsOfDate
              ? ` Rates as of ${formatEstDateLabel(lastRateAsOfDate)}${lastRateReleaseName ? ` (${lastRateReleaseName})` : ''}.`
              : ' Switch to All items after saving HTS-10, then Refresh rates to fill Duty % and tariff % from USITC.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {onOpenInfo ? (
            <button type="button" onClick={onOpenInfo} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700 }}>
              How this works
            </button>
          ) : null}
          <select
            value={effectiveVendorFilter}
            onChange={(event) => setVendorFilter(event.target.value)}
            style={{ ...inputStyle, width: 280 }}
          >
            <option value={ALL_VENDORS_KEY}>All vendors ({vendorOptions.length})</option>
            {vendorOptions.map((vendor) => (
              <option key={vendor.key} value={vendor.key}>
                {vendor.label} ({vendor.count})
              </option>
            ))}
          </select>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as 'all' | 'needs_hts')}
            style={{ ...inputStyle, width: 180 }}
          >
            <option value="needs_hts">Needs HTS input</option>
            <option value="all">All items</option>
          </select>
          <button
            type="button"
            onClick={() => void load(filter)}
            disabled={loading || saving}
            style={{ ...inputStyle, width: 'auto', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700 }}
          >
            {loading ? 'Loading…' : 'Reload'}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!dirty || loading || saving}
            style={{
              ...inputStyle,
              width: 'auto',
              cursor: !dirty || loading || saving ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              background: dirty ? '#0f766e' : '#e2e8f0',
              color: dirty ? '#ffffff' : '#64748b',
              borderColor: dirty ? '#0f766e' : '#cbd5e1',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <label style={{ ...inputStyle, width: 'auto', cursor: tariffImporting ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
            {tariffImporting ? 'Reading…' : 'Choose tariff file'}
            <input
              type="file"
              accept=".xlsx"
              disabled={tariffImporting || loading || saving}
              onChange={(event) => {
                setTariffImportFile(event.target.files?.[0] || null);
                setTariffImportPreview(null);
                setTariffImportCanConfirm(false);
                setError(null);
              }}
              style={{ display: 'none' }}
            />
          </label>
          <button
            type="button"
            onClick={() => void previewTariffImport()}
            disabled={!tariffImportFile || tariffImporting || loading || saving}
            style={{ ...inputStyle, width: 'auto', cursor: !tariffImportFile || tariffImporting ? 'not-allowed' : 'pointer', fontWeight: 700 }}
          >
            Preview import
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', fontWeight: 700 }}>
            As of
            <input
              type="date"
              value={asOfDate}
              onChange={(event) => setAsOfDate(event.target.value)}
              style={{ ...inputStyle, width: 150, fontWeight: 500 }}
            />
          </label>
          <button
            type="button"
            onClick={() => void refreshRates()}
            disabled={loading || saving || refreshing}
            title="Fetch USITC rates for the selected customs entry date. Prior dates keep their stored quotes."
            style={{
              ...inputStyle,
              width: 'auto',
              cursor: loading || saving || refreshing ? 'not-allowed' : 'pointer',
              fontWeight: 700,
              background: refreshing ? '#e2e8f0' : '#1d4ed8',
              color: refreshing ? '#64748b' : '#ffffff',
              borderColor: refreshing ? '#cbd5e1' : '#1d4ed8',
            }}
          >
            {refreshing ? 'Refreshing…' : 'Refresh rates'}
          </button>
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            disabled={loading || saving || refreshing}
            style={{ ...inputStyle, width: 'auto', cursor: loading || saving || refreshing ? 'not-allowed' : 'pointer', fontWeight: 700 }}
          >
            Monthly Tariff Summary
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 8, background: '#ecfdf5', color: '#166534', fontSize: 13 }}>
          {notice}
        </div>
      ) : null}
      {tariffImportPreview ? (
        <div style={{ marginBottom: 12, padding: 12, borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e3a8a', fontSize: 13 }}>
          <div style={{ fontWeight: 800 }}>Tariff import preview: {tariffImportPreview.sheetName}</div>
          <div style={{ marginTop: 4 }}>
            {tariffImportPreview.totalRows.toLocaleString('en-US')} spreadsheet rows; {tariffImportPreview.matched.toLocaleString('en-US')} items will update; {tariffImportPreview.unchanged.toLocaleString('en-US')} already match; {tariffImportPreview.unmatched.length.toLocaleString('en-US')} not found.
          </div>
          {tariffImportPreview.ambiguous.length || tariffImportPreview.duplicates.length || tariffImportPreview.invalid.length ? (
            <div style={{ marginTop: 6, color: '#991b1b' }}>
              Cannot import: {tariffImportPreview.ambiguous.length} ambiguous, {tariffImportPreview.duplicates.length} conflicting duplicate, and {tariffImportPreview.invalid.length} invalid row{tariffImportPreview.invalid.length === 1 ? '' : 's'}.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => void confirmTariffImport()}
                disabled={!tariffImportCanConfirm || tariffImporting}
                style={{ ...inputStyle, width: 'auto', cursor: tariffImporting ? 'not-allowed' : 'pointer', fontWeight: 800, color: '#fff', background: '#0f766e', borderColor: '#0f766e' }}
              >
                {tariffImporting ? 'Importing…' : 'Confirm one-time import'}
              </button>
              <span>This writes only matched spreadsheet values. Future changes are manual.</span>
            </div>
          )}
        </div>
      ) : null}

      <div style={{ overflow: 'hidden', border: '1px solid #e2e8f0', borderRadius: 12, background: '#ffffff' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            padding: '10px 14px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
            {selectedVendor ? selectedVendor.label : 'All vendors'}
          </div>
          {selectedVendor ? (
            <div style={{ fontSize: 13, color: '#334155' }}>
              <span style={{ fontWeight: 700, color: '#64748b', marginRight: 8 }}>Vendor ID</span>
              <span style={{ fontWeight: 800 }}>{selectedVendor.vendorId || '—'}</span>
            </div>
          ) : null}
        </div>
        <div style={{ overflowX: 'auto' }}>
        <table style={{ minWidth: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {SORT_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  onClick={() => toggleSort(column.key)}
                  title={column.title}
                  style={{
                    textAlign: column.align || 'left',
                    padding: '8px 10px',
                    borderBottom: '1px solid #e2e8f0',
                    whiteSpace: 'nowrap',
                    color: '#334155',
                    fontWeight: 700,
                    cursor: 'pointer',
                    userSelect: 'none',
                    ...(column.width ? { width: column.width, minWidth: column.width, maxWidth: column.width } : {}),
                  }}
                >
                  {column.label}
                  {sortKey === column.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedItems.length === 0 && !loading ? (
              <tr>
                <td colSpan={SORT_COLUMNS.length} style={{ padding: 24, color: '#64748b' }}>
                  {filter === 'needs_hts'
                    ? effectiveVendorFilter === ALL_VENDORS_KEY
                      ? 'No items need HTS input. Switch to All items, or upload the SGP workbook / wait for new SKUs to load.'
                      : 'No items for this vendor need HTS input. Switch to All items or All vendors.'
                    : effectiveVendorFilter === ALL_VENDORS_KEY
                    ? 'No items yet. Upload the SGP workbook or open this page after products have synced.'
                    : 'No items for this vendor. Switch to All vendors.'}
                </td>
              </tr>
            ) : null}
            {sortedItems.map((row) => (
              <tr key={row.id} style={{ background: row.needsHtsInput ? '#fffbeb' : '#ffffff' }}>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {row.itemSku}
                </td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' }}>
                  <input
                    value={row.countryOfOrigin || ''}
                    onChange={(event) => updateRow(row.id, { countryOfOrigin: event.target.value || null })}
                    placeholder="Origin"
                    size={7}
                    style={{ ...inputStyle, width: '7ch', minWidth: '7ch', maxWidth: '7ch', boxSizing: 'content-box' }}
                  />
                </td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', minWidth: 120, width: 120 }}>
                  <select
                    value={row.tradeProgram || 'none'}
                    onChange={(event) => updateRow(row.id, { tradeProgram: event.target.value as CompanyItemDutyRow['tradeProgram'] })}
                    style={{ ...inputStyle, minWidth: 108, width: 108 }}
                  >
                    <option value="none">None</option>
                    <option value="usmca">USMCA</option>
                    <option value="other">Other</option>
                  </select>
                </td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', minWidth: 88, width: 88 }}>
                  <select
                    value={row.qtyUnit || 'piece'}
                    onChange={(event) => updateRow(row.id, { qtyUnit: event.target.value as CompanyItemDutyRow['qtyUnit'] })}
                    style={{ ...inputStyle, minWidth: 76, width: 76 }}
                  >
                    <option value="piece">Piece</option>
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                    <option value="other">Other</option>
                  </select>
                </td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', width: 88, minWidth: 88 }}>
                  <input
                    value={row.dutyCode || ''}
                    onChange={(event) => updateRow(row.id, { dutyCode: event.target.value.toUpperCase() || null })}
                    placeholder="Duty code"
                    style={{ ...inputStyle, fontWeight: 700 }}
                  />
                </td>
                <td
                  title={row.dutyDescription || undefined}
                  style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', width: 220, minWidth: 180, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {row.dutyDescription || '—'}
                </td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                  <input
                    value={moneyText(row.enteredValuePerPiece)}
                    onChange={(event) => updateRow(row.id, { enteredValuePerPiece: parseMoney(event.target.value) })}
                    style={{ ...inputStyle, textAlign: 'right' }}
                  />
                </td>
                {([
                  ['htsCode', row.dutyRatePct],
                  ['specialHtsCode', row.specialRatePct],
                  ['section301HtsCode', row.section301RatePct],
                  ['section232HtsCode', row.section232RatePct],
                  ['ieepaHtsCode', row.ieepaRatePct],
                  ['additionalHtsCode', row.additionalRatePct],
                ] as const).map(([field, rate]) => (
                  <td key={field} style={{ padding: '4px 6px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', whiteSpace: 'nowrap', minWidth: 108 }}>
                    <div style={{ position: 'relative', height: 27 }}>
                      <input
                        value={row[field] || ''}
                        onChange={(event) => updateRow(row.id, { [field]: event.target.value || null })}
                        placeholder="HTS-10"
                        aria-label={`${field} HTS code`}
                        style={{
                          ...inputStyle,
                          position: 'absolute',
                          right: 0,
                          width: '15ch',
                          minWidth: '15ch',
                          fontSize: 11,
                          zIndex: 1,
                        }}
                      />
                    </div>
                    <div>{pctText(rate)}</div>
                  </td>
                ))}
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', color: '#64748b', whiteSpace: 'nowrap' }}>
                  {formatEstDateLabel(row.userEditedAt || row.lastSpreadsheetSeedAt || row.updatedAt) || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
      {summaryOpen ? (
        <div
          onClick={() => setSummaryOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.35)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(1100px, 100%)',
              maxHeight: '80vh',
              overflow: 'auto',
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 20,
              boxShadow: '0 12px 32px rgba(15,23,42,0.18)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Monthly Tariff Summary</h3>
                <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
                  {summaryScopeLabel}. Duty $ is Column 1 general. Total Tariff $ is 301 + 232 + IEEPA + Other.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSummaryOpen(false)}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '6px 10px',
                  background: '#fff',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Close
              </button>
            </div>
            {summaryLoading ? (
              <div style={{ padding: '16px 0', color: '#64748b', fontSize: 13 }}>Loading monthly dollars…</div>
            ) : summaryError ? (
              <div style={{ padding: '12px 0', color: '#991b1b', fontSize: 13 }}>{summaryError}</div>
            ) : monthlyCogs.length === 0 ? (
              <div style={{ padding: '12px 0', color: '#475569', fontSize: 13 }}>
                No monthly duty/tariff dollars yet. Refresh rates after items have Value $; sales dates then pick up the stored quote.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>Applied month</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>Duty $</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>Special $</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>301 $</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>232 $</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>IEEPA $</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>Other $</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#334155', fontWeight: 800 }}>Total Tariff $</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', color: '#334155' }}>SKUs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyCogs.map((row) => (
                      <tr key={row.monthKey}>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>{monthLabel(row.monthKey)}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{usdText(row.dutyAmount)}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{usdText(row.specialAmount)}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{usdText(row.section301Amount)}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{usdText(row.section232Amount)}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{usdText(row.ieepaAmount)}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', whiteSpace: 'nowrap' }}>{usdText(row.additionalAmount)}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>{usdText(row.tariffAmount)}</td>
                        <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right' }}>{Number(row.skuCount || 0).toLocaleString('en-US')}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f8fafc' }}>
                      <td style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0', fontWeight: 800 }}>Total</td>
                      <td style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{usdText(summaryTotals.dutyAmount)}</td>
                      <td style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{usdText(summaryTotals.specialAmount)}</td>
                      <td style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{usdText(summaryTotals.section301Amount)}</td>
                      <td style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{usdText(summaryTotals.section232Amount)}</td>
                      <td style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{usdText(summaryTotals.ieepaAmount)}</td>
                      <td style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{usdText(summaryTotals.additionalAmount)}</td>
                      <td style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{usdText(summaryTotals.tariffAmount)}</td>
                      <td style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 800 }}>{monthlyCogs.length.toLocaleString('en-US')} mo</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
