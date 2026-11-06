'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEstDate, formatEstDateLabel } from '@/lib/time/eastern';
import type { CompanyItemDutyPatch, CompanyItemDutyRow } from '@/lib/hts/item-duty-overlay';

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

const filterLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: '#334155',
  fontWeight: 600,
};

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '8px 14px',
  background: '#ffffff',
  fontWeight: 700,
  fontSize: 12,
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
  | 'primaryCustomer'
  | 'tradeProgram'
  | 'qtyUnit'
  | 'dutyCode'
  | 'itemDescription'
  | 'enteredValuePerPiece'
  | 'totalTariffRatePct'
  | 'dutyRatePct'
  | 'specialRatePct'
  | 'section301RatePct'
  | 'section232RatePct'
  | 'ieepaRatePct'
  | 'additionalRatePct'
  | 'updatedAt';

const SORT_COLUMNS: Array<{ key: DutySortKey; label: string; align?: 'left' | 'right'; title?: string; width?: number }> = [
  { key: 'itemSku', label: 'Item' },
  {
    key: 'countryOfOrigin',
    label: 'Origin',
    title: 'Defaults to the vendor address country in Infor. Enter a code to override it (shared with SGP Freight vendor COO); clear it to go back to Infor.',
  },
  { key: 'primaryCustomer', label: 'Primary Customer', width: 160, title: 'Customer with the most shipped revenue for this item in the last 12 months (all time if none), from Infor shipments.' },
  { key: 'tradeProgram', label: 'Program' },
  { key: 'qtyUnit', label: 'Unit' },
  { key: 'dutyCode', label: 'Duty Code', width: 88, title: 'User-maintained duty code. Existing values were imported from the SGP Duty & Tariffs sheet.' },
  { key: 'itemDescription', label: 'Description', width: 220, title: 'Item description from Infor. Enter text to override it; clear it to go back to Infor. Hover an HTS code for its official HTS description.' },
  { key: 'enteredValuePerPiece', label: 'Value $', align: 'right', title: 'Customs entered value per unit. Defaults to the Infor unit cost; enter a value to override it, clear it to go back to Infor. Duty and tariff dollars = this value × the % rates.' },
  { key: 'totalTariffRatePct', label: 'Total Tariff %', align: 'right', title: '301 % + 232 % + IEEPA % + Other %, matching Total Tariff $ in the Monthly Tariff Summary. Excludes Duty % and Special %.' },
  { key: 'dutyRatePct', label: 'Duty %', align: 'right' },
  { key: 'specialRatePct', label: 'Special %', align: 'right' },
  { key: 'section301RatePct', label: '301 %', align: 'right' },
  { key: 'section232RatePct', label: '232 %', align: 'right' },
  { key: 'ieepaRatePct', label: 'IEEPA %', align: 'right' },
  { key: 'additionalRatePct', label: 'Other %', align: 'right' },
  { key: 'updatedAt', label: 'Updated' },
];

function totalTariffRatePct(row: CompanyItemDutyRow): number | null {
  const parts = [row.section301RatePct, row.section232RatePct, row.ieepaRatePct, row.additionalRatePct].filter(
    (value): value is number => value != null && Number.isFinite(Number(value))
  );
  return parts.length ? parts.reduce((sum, value) => sum + Number(value), 0) : null;
}

const DIFF_FIELDS = [
  'htsCode',
  'specialHtsCode',
  'section301HtsCode',
  'section232HtsCode',
  'ieepaHtsCode',
  'additionalHtsCode',
  'countryOfOrigin',
  'tradeProgram',
  'qtyUnit',
  'dutyCode',
  'itemDescription',
  'enteredValuePerPiece',
] as const;

const overrideInputStyle: React.CSSProperties = { background: '#fef3c7', borderColor: '#f59e0b' };

function sortValue(row: CompanyItemDutyRow, key: DutySortKey): string | number {
  if (key === 'itemSku') return String(row.itemSku || '').trim().toLowerCase();
  if (key === 'htsCode') return String(row.htsCode || '').trim().toLowerCase();
  if (key === 'countryOfOrigin') return String(row.countryOfOrigin || '').trim().toLowerCase();
  if (key === 'primaryCustomer') return String(row.primaryCustomer || '').trim().toLowerCase();
  if (key === 'itemDescription') return String(row.itemDescription || '').trim().toLowerCase();
  if (key === 'totalTariffRatePct') return totalTariffRatePct(row) ?? Number.NEGATIVE_INFINITY;
  if (key === 'tradeProgram') return PROGRAM_LABELS[row.tradeProgram] || row.tradeProgram || '';
  if (key === 'qtyUnit') return UNIT_LABELS[row.qtyUnit] || row.qtyUnit || '';
  if (key === 'dutyCode') return String(row.dutyCode || '').trim().toLowerCase();
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

function vendorKeysForApr(items: CompanyItemDutyRow[], query: string): string[] {
  const exact = new Set<string>();
  const partial = new Set<string>();
  for (const row of items) {
    const sku = String(row.itemSku || '').trim().toLowerCase();
    if (!sku.includes(query)) continue;
    partial.add(rowVendorKey(row));
    if (sku === query) exact.add(rowVendorKey(row));
  }
  return Array.from(exact.size ? exact : partial);
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
  const [originalById, setOriginalById] = useState<Record<string, CompanyItemDutyRow>>({});
  const [includeInactive, setIncludeInactive] = useState(false);
  const [missingHtsCount, setMissingHtsCount] = useState(0);
  const [sortKey, setSortKey] = useState<DutySortKey>('itemSku');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [vendorIdSearch, setVendorIdSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState(ALL_VENDORS_KEY);
  const [aprSearch, setAprSearch] = useState('');
  const [asOfDate, setAsOfDate] = useState(formatEstDate);
  const [refreshing, setRefreshing] = useState(false);
  const [monthlyCogs, setMonthlyCogs] = useState<MonthlyCogsRow[]>([]);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
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
      const loaded: CompanyItemDutyRow[] = Array.isArray(payload.items) ? payload.items : [];
      setItems(loaded);
      setOriginalById(Object.fromEntries(loaded.map((row) => [row.id, row])));
      setOffshoreVendors(Array.isArray(payload.vendorOptions) ? payload.vendorOptions : []);
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
    // Only changed fields are sent: description, origin and value are overrides, so re-sending
    // an Infor value would pin it.
    const patches: CompanyItemDutyPatch[] = [];
    for (const row of items) {
      const original = originalById[row.id];
      const patch: Record<string, unknown> = { id: row.id, itemSku: row.itemSku };
      let changed = false;
      for (const field of DIFF_FIELDS) {
        const next = row[field] ?? null;
        if (original && (original[field] ?? null) === next) continue;
        patch[field] = next === '' ? null : next;
        changed = true;
      }
      if (changed) patches.push(patch as CompanyItemDutyPatch);
    }
    if (!patches.length) {
      setDirty(false);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/operational-data/duties-tariffs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompanyId, items: patches }),
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

  const editedOverride = <K extends 'countryOfOrigin' | 'itemDescription' | 'enteredValuePerPiece'>(
    row: CompanyItemDutyRow,
    field: K,
    inforValue: CompanyItemDutyRow[K] | null,
    savedFlag: boolean
  ): boolean => {
    const original = originalById[row.id];
    const value = row[field] ?? null;
    if (original && (original[field] ?? null) !== value) return value != null && value !== '' && value !== inforValue;
    return savedFlag;
  };
  const isOriginOverride = (row: CompanyItemDutyRow) =>
    editedOverride(row, 'countryOfOrigin', row.inforOrigin, row.originOverridden);
  const isDescriptionOverride = (row: CompanyItemDutyRow) =>
    editedOverride(row, 'itemDescription', row.inforDescription, row.descriptionOverridden);
  const isValueOverride = (row: CompanyItemDutyRow) =>
    editedOverride(row, 'enteredValuePerPiece', row.inforValuePerPiece, row.valueOverridden);

  const scopedItems = useMemo(
    () => (includeInactive ? items : items.filter((row) => !row.inactive)),
    [items, includeInactive]
  );

  const counts = useMemo(() => {
    const missing = scopedItems.filter((row) => row.needsHtsInput).length;
    return { total: scopedItems.length, missing, inactive: items.filter((row) => row.inactive).length };
  }, [items, scopedItems]);

  const vendorOptions = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; vendorId: string; count: number }>();
    for (const row of scopedItems) {
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
  }, [scopedItems, offshoreVendors]);

  const effectiveVendorFilter =
    vendorFilter === ALL_VENDORS_KEY || vendorOptions.some((vendor) => vendor.key === vendorFilter)
      ? vendorFilter
      : ALL_VENDORS_KEY;

  const selectedVendor = effectiveVendorFilter === ALL_VENDORS_KEY
    ? null
    : vendorOptions.find((vendor) => vendor.key === effectiveVendorFilter) || null;

  const aprQuery = aprSearch.trim().toLowerCase();

  const aprVendorKeys = useMemo(
    () => (aprQuery ? vendorKeysForApr(scopedItems, aprQuery) : []),
    [scopedItems, aprQuery]
  );
  const vendorChoices = aprVendorKeys.length > 1
    ? vendorOptions.filter((vendor) => aprVendorKeys.includes(vendor.key) || vendor.key === effectiveVendorFilter)
    : vendorOptions;

  const handleAprSearchChange = (nextSearch: string) => {
    setAprSearch(nextSearch);
    const query = nextSearch.trim().toLowerCase();
    if (!query || effectiveVendorFilter === ALL_VENDORS_KEY) return;
    const keys = vendorKeysForApr(scopedItems, query);
    if (keys.includes(effectiveVendorFilter)) return;
    setVendorIdSearch('');
    setVendorFilter(keys.length === 1 ? keys[0] : ALL_VENDORS_KEY);
  };

  const hasSearch = Boolean(vendorIdSearch.trim() || aprSearch.trim() || effectiveVendorFilter !== ALL_VENDORS_KEY);

  const handleReset = () => {
    setVendorIdSearch('');
    setAprSearch('');
    setVendorFilter(ALL_VENDORS_KEY);
  };

  const visibleItems = useMemo(
    () =>
      scopedItems.filter(
        (row) =>
          (effectiveVendorFilter === ALL_VENDORS_KEY || rowVendorKey(row) === effectiveVendorFilter) &&
          (!aprQuery || String(row.itemSku || '').toLowerCase().includes(aprQuery))
      ),
    [scopedItems, effectiveVendorFilter, aprQuery]
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
      setOriginalById(Object.fromEntries(nextItems.map((row) => [row.id, row])));
      if (lookedUp > 0) {
        setFilter('all');
        setItems(nextItems);
        setMissingHtsCount(nextItems.filter((row) => row.needsHtsInput).length);
      } else {
        setItems(filter === 'needs_hts' ? nextItems.filter((row) => row.needsHtsInput) : nextItems);
      }
      const releaseLabel = payload.releaseTitle || payload.releaseName || 'USITC HTS';
      if (lookedUp === 0) {
        setError(
          'No saved HTS-10 codes to look up on USITC. Enter HTS-10, click Save, then Refresh rates. Rates appear on All items, not on Needs HTS input.'
        );
      } else {
        setNotice(
          `USITC rates as of ${payload.asOfDate || asOfDate} (${releaseLabel}): updated ${updatedCount}, reused ${Number(payload.reused || 0)}, fetched ${Number(payload.fetched || 0)}${Number(payload.cleared || 0) ? `, old rates removed from ${Number(payload.cleared)}` : ''}${failedCount ? `, ${failedCount} HTS failed` : ''}.`
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Duties &amp; Tariffs</h3>
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
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', fontWeight: 700 }}>
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
            border: '1px solid #1d4ed8',
            borderRadius: 8,
            padding: '8px 14px',
            background: loading || saving || refreshing ? '#bfdbfe' : '#1d4ed8',
            color: '#ffffff',
            fontWeight: 700,
            cursor: loading || saving || refreshing ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          {refreshing ? 'Refreshing…' : 'Refresh rates'}
        </button>
        <button
          type="button"
          onClick={() => void load(filter)}
          disabled={loading || saving}
          style={{
            ...secondaryButtonStyle,
            color: loading || saving ? '#94a3b8' : '#334155',
            cursor: loading || saving ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Loading…' : 'Reload'}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={!hasSearch}
          style={{
            ...secondaryButtonStyle,
            color: !hasSearch ? '#94a3b8' : '#334155',
            cursor: !hasSearch ? 'not-allowed' : 'pointer',
          }}
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || loading || saving}
          style={{
            border: '1px solid #4338ca',
            borderRadius: 8,
            padding: '8px 14px',
            background: !dirty || loading || saving ? '#c7d2fe' : '#4f46e5',
            color: '#ffffff',
            fontWeight: 700,
            cursor: !dirty || loading || saving ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          {saving ? 'Saving…' : dirty ? 'Save page' : 'Saved'}
        </button>
      </div>
      <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 13, lineHeight: 1.5 }}>
        Inactive items: {counts.inactive}{includeInactive ? ' (shown)' : ' (hidden)'}. Missing HTS: {filter === 'all' ? counts.missing : missingHtsCount}.
        Showing {sortedItems.length} of {counts.total} item{counts.total === 1 ? '' : 's'}.
        {lastRateAsOfDate
          ? ` Rates as of ${formatEstDateLabel(lastRateAsOfDate)}${lastRateReleaseName ? ` (${lastRateReleaseName})` : ''}.`
          : ' Switch to All items after saving HTS-10, then Refresh rates to fill Duty % and tariff % from USITC.'}
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'nowrap', alignItems: 'end', marginBottom: 12, overflowX: 'auto' }}>
        <label style={filterLabelStyle}>
          Vendor ID
          <input
            type="search"
            value={vendorIdSearch}
            onChange={(event) => {
              const nextVendorId = event.target.value;
              setVendorIdSearch(nextVendorId);
              const matchingVendor = vendorOptions.find(
                (vendor) => vendor.vendorId.trim().toLowerCase() === nextVendorId.trim().toLowerCase()
              );
              if (matchingVendor) setVendorFilter(matchingVendor.key);
            }}
            placeholder="Search vendor ID"
            style={{ ...inputStyle, width: 180 }}
          />
        </label>
        <label style={filterLabelStyle}>
          Vendor Name
          <select
            value={effectiveVendorFilter}
            onChange={(event) => setVendorFilter(event.target.value)}
            style={{ ...inputStyle, minWidth: 280 }}
          >
            <option value={ALL_VENDORS_KEY}>All vendors ({vendorOptions.length})</option>
            {vendorChoices.map((vendor) => (
              <option key={vendor.key} value={vendor.key}>
                {vendor.label} ({vendor.count})
              </option>
            ))}
          </select>
        </label>
        <label style={filterLabelStyle}>
          APR P/N
          <input
            type="search"
            value={aprSearch}
            onChange={(event) => handleAprSearchChange(event.target.value)}
            placeholder="Search APR P/N"
            style={{ ...inputStyle, width: 160 }}
          />
        </label>
        <label style={filterLabelStyle}>
          Items
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as 'all' | 'needs_hts')}
            style={{ ...inputStyle, width: 160 }}
          >
            <option value="needs_hts">Needs HTS input</option>
            <option value="all">All items</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', whiteSpace: 'nowrap', paddingBottom: 6 }}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => setIncludeInactive(event.target.checked)}
          />
          Show inactive items
        </label>
        <button
          type="button"
          onClick={() => setSummaryOpen(true)}
          disabled={loading || saving || refreshing}
          style={{
            ...secondaryButtonStyle,
            padding: '5px 10px',
            whiteSpace: 'nowrap',
            color: loading || saving || refreshing ? '#94a3b8' : '#334155',
            cursor: loading || saving || refreshing ? 'not-allowed' : 'pointer',
          }}
        >
          Monthly Tariff Summary
        </button>
      </div>
      {aprVendorKeys.length > 1 && selectedVendor && !aprVendorKeys.includes(effectiveVendorFilter) ? (
        <div style={{ color: '#92400e', fontSize: 13, marginBottom: 8 }}>
          APR P/N &quot;{aprSearch.trim()}&quot; matches {aprVendorKeys.length} vendors. Pick one in Vendor Name or choose All vendors.
        </div>
      ) : null}

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
                  {aprQuery
                    ? filter === 'needs_hts'
                      ? `No items matching APR P/N "${aprSearch.trim()}" need HTS input. Switch to All items.`
                      : `No items match APR P/N "${aprSearch.trim()}".`
                    : filter === 'needs_hts'
                    ? effectiveVendorFilter === ALL_VENDORS_KEY
                      ? 'No items need HTS input. Switch to All items, or wait for new Infor items to load.'
                      : 'No items for this vendor need HTS input. Switch to All items or All vendors.'
                    : effectiveVendorFilter === ALL_VENDORS_KEY
                    ? 'No Infor items with a primary vendor were found. Open this page after Infor has synced.'
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
                    onChange={(event) => updateRow(row.id, { countryOfOrigin: event.target.value.toUpperCase() || null })}
                    placeholder={row.inforOrigin || 'Origin'}
                    title={isOriginOverride(row) ? `Override. Infor vendor address: ${row.inforOrigin || 'blank'}` : undefined}
                    size={7}
                    style={{
                      ...inputStyle,
                      width: '7ch',
                      minWidth: '7ch',
                      maxWidth: '7ch',
                      boxSizing: 'content-box',
                      ...(isOriginOverride(row) ? overrideInputStyle : {}),
                    }}
                  />
                </td>
                <td
                  title={row.primaryCustomer || undefined}
                  style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', width: 160, minWidth: 120, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {row.primaryCustomer || '—'}
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
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9', width: 220, minWidth: 180, maxWidth: 280 }}>
                  <input
                    value={row.itemDescription || ''}
                    onChange={(event) => updateRow(row.id, { itemDescription: event.target.value || null })}
                    placeholder={row.inforDescription || 'Description'}
                    title={
                      isDescriptionOverride(row)
                        ? `Override. Infor: ${row.inforDescription || 'blank'}`
                        : row.itemDescription || undefined
                    }
                    style={{ ...inputStyle, ...(isDescriptionOverride(row) ? overrideInputStyle : {}) }}
                  />
                </td>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid #f1f5f9' }}>
                  <input
                    value={moneyText(row.enteredValuePerPiece)}
                    onChange={(event) => updateRow(row.id, { enteredValuePerPiece: parseMoney(event.target.value) })}
                    placeholder={moneyText(row.inforValuePerPiece)}
                    title={isValueOverride(row) ? `Override. Infor unit cost: ${moneyText(row.inforValuePerPiece) || 'blank'}` : undefined}
                    style={{ ...inputStyle, textAlign: 'right', ...(isValueOverride(row) ? overrideInputStyle : {}) }}
                  />
                </td>
                <td style={{ padding: '6px 10px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}>
                  {pctText(totalTariffRatePct(row))}
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
                        title={field === 'htsCode' ? row.dutyDescription || undefined : undefined}
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
