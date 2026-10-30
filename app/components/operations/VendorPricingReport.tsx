'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  VENDOR_PRICING_APPROVAL_STATUSES,
  VENDOR_PRICING_EDIT_FIELDS,
  VENDOR_PRICING_MTO_OPTIONS,
  calculateVendorPricing,
  type VendorPricingEdits,
  type VendorPricingRow,
} from '@/lib/operations/vendor-pricing';

type VendorPricingReportProps = {
  selectedCompanyId: string;
  onOpenInfo?: () => void;
};

const MAX_VISIBLE_ROWS = 500;

const DATE_COLUMNS = [
  { field: 'startDate', label: 'Start Date' },
  { field: 'endDate', label: 'End Date' },
  { field: 'requiredLoadDate', label: 'Required Load Date' },
] as const;

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '4px 6px',
  fontSize: 12,
  color: '#0f172a',
  background: '#ffffff',
};

const overrideInputStyle: React.CSSProperties = {
  background: '#fef3c7',
  borderColor: '#f59e0b',
};

const headerStyle: React.CSSProperties = {
  padding: '8px 6px',
  fontSize: 11,
  fontWeight: 700,
  color: '#334155',
  background: '#f8fafc',
  whiteSpace: 'normal',
  lineHeight: 1.25,
  verticalAlign: 'bottom',
  borderBottom: '1px solid #e2e8f0',
};

const cellStyle: React.CSSProperties = {
  padding: '4px 6px',
  fontSize: 12,
  color: '#334155',
  whiteSpace: 'nowrap',
  borderTop: '1px solid #f1f5f9',
};

const calcCellStyle: React.CSSProperties = {
  ...cellStyle,
  textAlign: 'right',
  background: '#f8fafc',
};

function editSignature(row: VendorPricingRow): string {
  return JSON.stringify(VENDOR_PRICING_EDIT_FIELDS.map((field) => row[field] ?? null));
}

function rowKey(row: VendorPricingRow): string {
  return `${row.itemSku}||${row.vendorId}`;
}

function fmtNumber(value: number | null | undefined, maxDigits = 4, minDigits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits });
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

/** Stored dates are calendar days; format without shifting through a time zone. */
function fmtDay(value: string | null | undefined): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}/${match[1].slice(2)}` : '—';
}

function pctColor(value: number | null): string | undefined {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.00005) return undefined;
  return value > 0 ? '#b91c1c' : '#15803d';
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

type SortValue = string | number | null | undefined;
type SortDirection = 'asc' | 'desc';
type Calc = ReturnType<typeof calculateVendorPricing>;

const SORT_VALUES: Record<string, (row: VendorPricingRow, calc: Calc) => SortValue> = {
  itemSku: (row) => row.itemSku,
  vendorId: (row) => row.vendorId,
  vendorName: (row) => row.vendorName,
  subsupplier: (row) => row.subsupplier,
  mto: (row) => row.mtoOverride ?? row.inforMto,
  currentCostEffectiveDate: (row) => row.currentCostEffectiveDate,
  currentCost: (row) => row.currentCost,
  newCost: (row) => row.newCost,
  pctChange: (_row, calc) => calc.pctChange,
  approvalStatus: (row) => row.approvalStatus,
  forecastQty: (row) => row.forecastQty,
  material: (row) => row.material,
  currentMaterialCost: (row) => row.currentMaterialCost,
  newMaterialCost: (row) => row.newMaterialCost,
  pctChangeMaterial: (_row, calc) => calc.pctChangeMaterial,
  partWeightKg: (row) => row.partWeightKgOverride ?? row.inforPartWeightKg,
  priceChange: (_row, calc) => calc.priceChange,
  currentUsdPerKg: (_row, calc) => calc.currentUsdPerKg,
  newUsdPerKg: (_row, calc) => calc.newUsdPerKg,
  pctChangeUsdPerKg: (_row, calc) => calc.pctChangeUsdPerKg,
  startDate: (row) => row.startDate,
  endDate: (row) => row.endDate,
  requiredLoadDate: (row) => row.requiredLoadDate,
};

/** Blank values stay at the bottom in either direction. */
function compareSortValues(a: SortValue, b: SortValue, direction: SortDirection): number {
  const aBlank = a == null || a === '' || (typeof a === 'number' && !Number.isFinite(a));
  const bBlank = b == null || b === '' || (typeof b === 'number' && !Number.isFinite(b));
  if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
  const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : compareText(String(a), String(b));
  return direction === 'asc' ? comparison : -comparison;
}

function rankRows(rows: VendorPricingRow[], key: string, direction: SortDirection): Map<string, number> {
  const getValue = SORT_VALUES[key];
  const ranked = rows
    .map((row) => ({ key: rowKey(row), value: getValue(row, calculateVendorPricing(row)) }))
    .sort((a, b) => compareSortValues(a.value, b.value, direction));
  return new Map(ranked.map((entry, index) => [entry.key, index]));
}

export default function VendorPricingReport({ selectedCompanyId, onOpenInfo }: VendorPricingReportProps) {
  const [rows, setRows] = useState<VendorPricingRow[]>([]);
  const [forecastYear, setForecastYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [vendorIdSearch, setVendorIdSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  // The rank is captured on header click and after save, not on every edit, so rows stay put while typing.
  const [sort, setSort] = useState<{ key: string; direction: SortDirection; rank: Map<string, number> } | null>(null);
  const [savedSignatures, setSavedSignatures] = useState<Map<string, string>>(() => new Map());
  const applyRows = useCallback((next: VendorPricingRow[]) => {
    setSavedSignatures(new Map(next.map((row) => [rowKey(row), editSignature(row)])));
    setRows(next);
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    let cancelled = false;
    (async () => {
      const response = await fetch(`/api/operational-data/vendor-pricing?companyId=${encodeURIComponent(selectedCompanyId)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load vendor pricing');
      return payload;
    })()
      .then((payload) => {
        if (cancelled) return;
        setError(null);
        setSort(null);
        applyRows(Array.isArray(payload.rows) ? payload.rows : []);
        setForecastYear(Number(payload.forecastYear) || null);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load vendor pricing');
        applyRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyRows, selectedCompanyId]);

  const changedRows = useMemo(
    () => rows.filter((row) => savedSignatures.get(rowKey(row)) !== editSignature(row)),
    [rows, savedSignatures]
  );
  const changedKeys = useMemo(() => new Set(changedRows.map(rowKey)), [changedRows]);
  const dirty = changedRows.length > 0;

  const updateRow = (key: string, patch: Partial<VendorPricingEdits>) => {
    setNotice(null);
    setRows((prev) => prev.map((row) => (rowKey(row) === key ? { ...row, ...patch } : row)));
  };

  const updateNumber = (key: string, field: keyof VendorPricingEdits, raw: string) => {
    const parsed = Number(raw);
    updateRow(key, { [field]: raw.trim() === '' || !Number.isFinite(parsed) ? null : parsed });
  };

  const updateText = (key: string, field: keyof VendorPricingEdits, raw: string) => {
    updateRow(key, { [field]: raw === '' ? null : raw });
  };

  const handleSave = async () => {
    if (!selectedCompanyId || !dirty) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/operational-data/vendor-pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          rows: changedRows.map((row) => ({
            itemSku: row.itemSku,
            vendorId: row.vendorId,
            ...Object.fromEntries(VENDOR_PRICING_EDIT_FIELDS.map((field) => [field, row[field] ?? null])),
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to save');
      if (Array.isArray(payload.rows)) {
        applyRows(payload.rows);
        if (sort) setSort({ ...sort, rank: rankRows(payload.rows, sort.key, sort.direction) });
      }
      setNotice(`Saved ${changedRows.length.toLocaleString()} changed rows.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to save vendor pricing');
    } finally {
      setSaving(false);
    }
  };

  const vendorOptions = useMemo(() => {
    const byId = new Map<string, string>();
    rows.forEach((row) => byId.set(row.vendorId, row.vendorName || row.vendorId));
    return [...byId.entries()].sort((a, b) => compareText(a[1], b[1]));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = rows.filter((row) => {
      if (vendorFilter !== 'all' && row.vendorId !== vendorFilter) return false;
      if (statusFilter === 'none' && row.approvalStatus) return false;
      if (statusFilter !== 'all' && statusFilter !== 'none' && row.approvalStatus !== statusFilter) return false;
      if (!term) return true;
      return [row.itemSku, row.vendorId, row.vendorName, row.subsupplier, row.material]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
    if (!sort) return matches;
    return matches.sort((a, b) => (sort.rank.get(rowKey(a)) ?? 0) - (sort.rank.get(rowKey(b)) ?? 0));
  }, [rows, search, sort, statusFilter, vendorFilter]);

  const sortableHeader = (key: string, label: string, align: 'left' | 'right', style?: React.CSSProperties) => {
    const active = sort?.key === key;
    return (
      <th key={key} style={{ ...headerStyle, textAlign: align, ...style }} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}>
        <button
          type="button"
          onClick={() => {
            const direction: SortDirection = active && sort.direction === 'asc' ? 'desc' : 'asc';
            setSort({ key, direction, rank: rankRows(rows, key, direction) });
          }}
          style={{ padding: 0, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: active ? 800 : 700, textAlign: align, cursor: 'pointer' }}
        >
          {label}{active ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
        </button>
      </th>
    );
  };
  const visibleRows = filteredRows.slice(0, MAX_VISIBLE_ROWS);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      if (row.approvalStatus) counts.set(row.approvalStatus, (counts.get(row.approvalStatus) || 0) + 1);
    });
    return counts;
  }, [rows]);

  const fcstLabel = `${forecastYear ?? ''} SGP FCST`.trim();
  const selectedVendor = vendorFilter === 'all'
    ? null
    : { id: vendorFilter, name: vendorOptions.find(([id]) => id === vendorFilter)?.[1] || vendorFilter };
  const showVendorColumns = !selectedVendor;
  const columnCount = showVendorColumns ? 23 : 21;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Vendor Pricing</h3>
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
      <p style={{ margin: '0 0 12px', color: '#475569', fontSize: 13, lineHeight: 1.5 }}>
        Proposed vendor price changes by item and primary vendor. Current cost is the Infor contract in effect today; {fcstLabel} comes from the
        Monthly Forecast; part weight defaults from the Infor item weight. Type the new cost, approval status, material costs and dates, then Save.
        Approved new costs show as the Vendor Pricing Sheet price on Vendor Contracts.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input
          type="search"
          value={vendorIdSearch}
          onChange={(event) => {
            const nextVendorId = event.target.value;
            setVendorIdSearch(nextVendorId);
            const matchingVendor = vendorOptions.find(
              ([vendorId]) => vendorId.trim().toLowerCase() === nextVendorId.trim().toLowerCase()
            );
            if (matchingVendor) setVendorFilter(matchingVendor[0]);
          }}
          placeholder="Search Vendor ID"
          aria-label="Search Vendor ID"
          style={{ ...inputStyle, width: 180, padding: '7px 8px' }}
        />
        <select
          value={vendorFilter}
          onChange={(event) => setVendorFilter(event.target.value)}
          style={{ ...inputStyle, width: 260, padding: '7px 8px' }}
        >
          <option value="all">All vendors</option>
          {vendorOptions.map(([id, name]) => (
            <option key={id} value={id}>{name} ({id})</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          style={{ ...inputStyle, width: 170, padding: '7px 8px' }}
        >
          <option value="all">All approval statuses</option>
          <option value="none">No status</option>
          {VENDOR_PRICING_APPROVAL_STATUSES.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search item, vendor, material..."
          style={{ ...inputStyle, width: 240, padding: '7px 8px' }}
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
          {saving ? 'Saving…' : dirty ? `Save ${changedRows.length.toLocaleString()} rows` : 'Saved'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#334155', marginBottom: 10 }}>
        <span><strong>Rows:</strong> {rows.length.toLocaleString()}</span>
        <span><strong>Filtered:</strong> {filteredRows.length.toLocaleString()}</span>
        {VENDOR_PRICING_APPROVAL_STATUSES.map((status) => (
          <span key={status}><strong>{status}:</strong> {(statusCounts.get(status) || 0).toLocaleString()}</span>
        ))}
      </div>

      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div>}
      {notice && <div style={{ color: '#166534', fontSize: 13, marginBottom: 8 }}>{notice}</div>}
      {filteredRows.length > visibleRows.length && (
        <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 12 }}>
          Showing the first {MAX_VISIBLE_ROWS.toLocaleString()} of {filteredRows.length.toLocaleString()} rows. Filter by vendor or search to narrow the list.
        </div>
      )}

      {loading && rows.length === 0 ? (
        <div style={{ padding: '24px 0', color: '#64748b', fontSize: 13 }}>Loading vendor pricing…</div>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: '70vh', border: '1px solid #e2e8f0', borderRadius: 10, background: '#ffffff' }}>
          {selectedVendor && (
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
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: '#334155' }}>Vendor</div>
              <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>
                {selectedVendor.name} <span style={{ color: '#64748b', fontWeight: 500 }}>#{selectedVendor.id}</span>
              </div>
            </div>
          )}
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: showVendorColumns ? 2600 : 2300, fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                {sortableHeader('itemSku', 'Item', 'left', { position: 'sticky', left: 0, zIndex: 3, minWidth: 130 })}
                {showVendorColumns && (
                  <>
                    {sortableHeader('vendorId', 'Vendor #', 'left')}
                    {sortableHeader('vendorName', 'Vendor Name', 'left', { minWidth: 200 })}
                  </>
                )}
                {sortableHeader('subsupplier', 'Subsupplier', 'left', { minWidth: 140 })}
                {sortableHeader('mto', 'MTO or Not', 'left', { minWidth: 70 })}
                {sortableHeader('currentCostEffectiveDate', 'Current Cost Effective date', 'right')}
                {sortableHeader('currentCost', 'Current Cost', 'right')}
                {sortableHeader('newCost', 'New Cost', 'right', { minWidth: 90 })}
                {sortableHeader('pctChange', '% Change', 'right')}
                {sortableHeader('approvalStatus', 'Approval Status', 'left', { minWidth: 110 })}
                {sortableHeader('forecastQty', fcstLabel, 'right')}
                {sortableHeader('material', 'Material', 'left', { minWidth: 110 })}
                {sortableHeader('currentMaterialCost', 'Current Material Cost (USD/KG)', 'right', { minWidth: 90 })}
                {sortableHeader('newMaterialCost', 'New Material Cost (USD/KG)', 'right', { minWidth: 90 })}
                {sortableHeader('pctChangeMaterial', '% Change Material', 'right')}
                {sortableHeader('partWeightKg', 'Part Weight (kg)', 'right', { minWidth: 100 })}
                {sortableHeader('priceChange', 'Price change', 'right')}
                {sortableHeader('currentUsdPerKg', 'Current (USD/KG)', 'right')}
                {sortableHeader('newUsdPerKg', 'New (USD/KG)', 'right')}
                {sortableHeader('pctChangeUsdPerKg', '%Change', 'right')}
                {DATE_COLUMNS.map(({ field, label }) => sortableHeader(field, label, 'left', { minWidth: 130 }))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const key = rowKey(row);
                const calc = calculateVendorPricing(row);
                const changed = changedKeys.has(key);
                return (
                  <tr key={key} style={changed ? { background: '#eef2ff' } : undefined}>
                    <td style={{ ...cellStyle, position: 'sticky', left: 0, zIndex: 1, background: changed ? '#eef2ff' : '#ffffff', fontWeight: 600 }}>
                      {row.itemSku}
                    </td>
                    {showVendorColumns && (
                      <>
                        <td style={cellStyle}>{row.vendorId}</td>
                        <td style={{ ...cellStyle, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.vendorName}>
                          {row.vendorName || '—'}
                        </td>
                      </>
                    )}
                    <td style={cellStyle}>
                      <input
                        value={row.subsupplier ?? ''}
                        onChange={(event) => updateText(key, 'subsupplier', event.target.value)}
                        style={inputStyle}
                        aria-label={`Subsupplier for ${row.itemSku}`}
                      />
                    </td>
                    <td style={cellStyle}>
                      <select
                        value={row.mtoOverride ?? ''}
                        onChange={(event) => updateText(key, 'mtoOverride', event.target.value)}
                        style={row.mtoOverride ? { ...inputStyle, ...overrideInputStyle } : inputStyle}
                        title={row.inforMto ? `Monthly Forecast: ${row.inforMto}` : 'Not set on Monthly Forecast'}
                        aria-label={`MTO for ${row.itemSku}`}
                      >
                        <option value="">{row.inforMto || ''}</option>
                        {VENDOR_PRICING_MTO_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtDay(row.currentCostEffectiveDate)}</td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtNumber(row.currentCost, 4, 4)}</td>
                    <td style={cellStyle}>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={row.newCost ?? ''}
                        onChange={(event) => updateNumber(key, 'newCost', event.target.value)}
                        style={{ ...inputStyle, textAlign: 'right' }}
                        aria-label={`New cost for ${row.itemSku}`}
                      />
                    </td>
                    <td style={{ ...calcCellStyle, color: pctColor(calc.pctChange) }}>{fmtPct(calc.pctChange)}</td>
                    <td style={cellStyle}>
                      <select
                        value={row.approvalStatus ?? ''}
                        onChange={(event) => updateText(key, 'approvalStatus', event.target.value)}
                        style={inputStyle}
                        aria-label={`Approval status for ${row.itemSku}`}
                      >
                        <option value="" />
                        {VENDOR_PRICING_APPROVAL_STATUSES.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ ...cellStyle, textAlign: 'right' }}>{fmtNumber(row.forecastQty, 0)}</td>
                    <td style={cellStyle}>
                      <input
                        value={row.material ?? ''}
                        onChange={(event) => updateText(key, 'material', event.target.value)}
                        style={inputStyle}
                        aria-label={`Material for ${row.itemSku}`}
                      />
                    </td>
                    <td style={cellStyle}>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={row.currentMaterialCost ?? ''}
                        onChange={(event) => updateNumber(key, 'currentMaterialCost', event.target.value)}
                        style={{ ...inputStyle, textAlign: 'right' }}
                        aria-label={`Current material cost for ${row.itemSku}`}
                      />
                    </td>
                    <td style={cellStyle}>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={row.newMaterialCost ?? ''}
                        onChange={(event) => updateNumber(key, 'newMaterialCost', event.target.value)}
                        style={{ ...inputStyle, textAlign: 'right' }}
                        aria-label={`New material cost for ${row.itemSku}`}
                      />
                    </td>
                    <td style={{ ...calcCellStyle, color: pctColor(calc.pctChangeMaterial) }}>{fmtPct(calc.pctChangeMaterial)}</td>
                    <td style={cellStyle}>
                      <input
                        type="number"
                        step="any"
                        min={0}
                        value={row.partWeightKgOverride ?? ''}
                        placeholder={fmtNumber(row.inforPartWeightKg, 5)}
                        onChange={(event) => updateNumber(key, 'partWeightKgOverride', event.target.value)}
                        style={row.partWeightKgOverride != null
                          ? { ...inputStyle, ...overrideInputStyle, textAlign: 'right' }
                          : { ...inputStyle, textAlign: 'right' }}
                        title={row.inforPartWeightKg != null
                          ? `Infor: ${fmtNumber(row.inforPartWeightKg, 5)} kg. ${row.partWeightKgOverride != null ? 'Clear to use it.' : 'Type to override.'}`
                          : 'No Infor weight or order multiple. Type the part weight.'}
                        aria-label={`Part weight for ${row.itemSku}`}
                      />
                    </td>
                    <td style={{ ...calcCellStyle, color: pctColor(calc.priceChange) }}>{fmtNumber(calc.priceChange, 4)}</td>
                    <td style={calcCellStyle}>{fmtNumber(calc.currentUsdPerKg, 2, 2)}</td>
                    <td style={calcCellStyle}>{fmtNumber(calc.newUsdPerKg, 2, 2)}</td>
                    <td style={{ ...calcCellStyle, color: pctColor(calc.pctChangeUsdPerKg) }}>{fmtPct(calc.pctChangeUsdPerKg)}</td>
                    {DATE_COLUMNS.map(({ field, label }) => (
                      <td key={field} style={cellStyle}>
                        <input
                          type="date"
                          value={row[field] ?? ''}
                          onChange={(event) => updateText(key, field, event.target.value)}
                          style={inputStyle}
                          aria-label={`${label} for ${row.itemSku}`}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={columnCount} style={{ padding: 16, color: '#64748b', fontSize: 13 }}>
                    {rows.length === 0 ? 'No Infor items with a primary vendor were found.' : 'No rows match the selected filters.'}
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
