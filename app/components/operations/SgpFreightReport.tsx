'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CompanyItemFreightPatch, CompanyItemFreightRow } from '@/lib/operations/item-freight-overlay';
import {
  calcCbmFromInches,
  calcItemFreight,
  DEFAULT_SGP_FREIGHT_ASSUMPTIONS,
  futureDomesticRate,
  normalizeSgpFreightAssumptions,
  type SgpFreightAssumptions,
} from '@/lib/operational/sgp-freight-calc';

type SgpFreightReportProps = {
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

const UNASSIGNED_VENDOR_KEY = '__unassigned__';

type FreightSortKey =
  | 'itemSku'
  | 'item'
  | 'estimatedFreightCurrent'
  | 'estimatedFreightFuture'
  | 'percentOfContainer'
  | 'vendorCoo'
  | 'shipmentType'
  | 'revision'
  | 'qtyOnHand'
  | 'nonNettableStock'
  | 'safetyStock'
  | 'allocatedQty'
  | 'quantityOrdered'
  | 'orderMultiple'
  | 'heightIn'
  | 'widthIn'
  | 'orderMinimum'
  | 'lengthIn'
  | 'cbm'
  | 'unitWeight'
  | 'unitCost'
  | 'currentUnitCost'
  | 'htsCode'
  | 'countryOfOrigin'
  | 'productCode'
  | 'costType'
  | 'costMethod'
  | 'plannerCode'
  | 'ratePerDay'
  | 'leadTime'
  | 'materialStatus'
  | 'reason'
  | 'lastChange'
  | 'sheetUser';

const TEXT_SORT_KEYS = new Set<FreightSortKey>([
  'itemSku',
  'item',
  'vendorCoo',
  'shipmentType',
  'revision',
  'htsCode',
  'countryOfOrigin',
  'productCode',
  'costType',
  'costMethod',
  'plannerCode',
  'materialStatus',
  'reason',
  'lastChange',
  'sheetUser',
]);

const SORT_COLUMNS: Array<{
  key: FreightSortKey;
  label: string;
  align?: 'left' | 'right';
  editable?: boolean;
  title?: string;
  width?: number;
}> = [
  { key: 'itemSku', label: 'APR\nP/N', width: 88 },
  {
    key: 'estimatedFreightCurrent',
    label: 'Estimated\nFreight Cost\nper Part\n(CURRENT)',
    align: 'right',
    width: 76,
  },
  {
    key: 'estimatedFreightFuture',
    label: 'Estimated\nFreight Cost\nper Part\n(FUTURE)',
    align: 'right',
    width: 76,
  },
  { key: 'percentOfContainer', label: '% of\nContainer', align: 'right', title: 'CBM ÷ order multiple ÷ CBMs', width: 68 },
  { key: 'vendorCoo', label: 'Current\nVendor\nCOO', width: 72 },
  { key: 'shipmentType', label: 'Shipment\nType', width: 72 },
  { key: 'item', label: 'Item', width: 88 },
  { key: 'revision', label: 'Rev', width: 40 },
  { key: 'qtyOnHand', label: 'Quantity\nOn Hand', align: 'right', width: 72 },
  { key: 'nonNettableStock', label: 'Non-Nettable\nStock', align: 'right', width: 84 },
  { key: 'safetyStock', label: 'Safety\nStock', align: 'right', width: 64 },
  { key: 'allocatedQty', label: 'Allocated To\nCustomer\nOrders', align: 'right', width: 80 },
  { key: 'quantityOrdered', label: 'Quantity\nOrdered', align: 'right', editable: true, width: 72 },
  { key: 'orderMultiple', label: 'Order\nMultiple', align: 'right', editable: true, width: 72 },
  { key: 'heightIn', label: 'Height\n(in)', align: 'right', editable: true, width: 60 },
  { key: 'widthIn', label: 'Width\n(in)', align: 'right', editable: true, width: 60 },
  { key: 'orderMinimum', label: 'Order\nMinimum', align: 'right', editable: true, width: 72 },
  { key: 'lengthIn', label: 'Length\n(in)', align: 'right', editable: true, width: 60 },
  { key: 'cbm', label: 'CBM', align: 'right', editable: true, title: 'Defaults from H × W × L ÷ 61,023.744. Typing CBM locks it until dimensions change.', width: 64 },
  { key: 'unitWeight', label: 'Unit\nWeight', align: 'right', editable: true, width: 64 },
  { key: 'unitCost', label: 'Unit\nCost', align: 'right', editable: true, width: 64 },
  { key: 'currentUnitCost', label: 'Current\nUnit Cost', align: 'right', editable: true, width: 72 },
  { key: 'htsCode', label: 'HTS\nCode', width: 88 },
  { key: 'countryOfOrigin', label: 'Country\nOf Origin', width: 72 },
  { key: 'productCode', label: 'Product\nCode', width: 64 },
  { key: 'costType', label: 'Cost\nType', width: 60 },
  { key: 'costMethod', label: 'Cost\nMethod', width: 64 },
  { key: 'plannerCode', label: 'Planner\nCode', width: 64 },
  { key: 'ratePerDay', label: 'Rate/\nDay', align: 'right', width: 52 },
  { key: 'leadTime', label: 'Lead\nTime', align: 'right', width: 52 },
  { key: 'materialStatus', label: 'Material\nStatus', width: 68 },
  { key: 'reason', label: 'Reason', width: 64 },
  { key: 'lastChange', label: 'Last\nChange', width: 64 },
  { key: 'sheetUser', label: 'User', width: 52 },
];

function moneyText(value: number | null | undefined, digits = 4): string {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return Number(value).toFixed(digits);
}

function commaText(value: number | null | undefined, fractionDigits = 0): string {
  if (value == null || !Number.isFinite(Number(value))) return '';
  const numeric = Number(value);
  const digits = Number.isInteger(numeric) ? 0 : fractionDigits;
  return numeric.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

const COUNT_KEYS = new Set<FreightSortKey>([
  'qtyOnHand',
  'nonNettableStock',
  'safetyStock',
  'allocatedQty',
  'quantityOrdered',
  'orderMultiple',
  'orderMinimum',
]);

function parseNumber(value: string): number | null {
  const text = value.replace(/[$,%\s,]/g, '').trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function pctText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return `${(Number(value) * 100).toFixed(5)}%`;
}

function rowVendorKey(row: CompanyItemFreightRow): string {
  const vendorId = String(row.vendorId || '').trim();
  const vendorName = String(row.vendorName || '').trim();
  if (vendorId) return `id:${vendorId}`;
  if (vendorName) return `name:${vendorName}`;
  return UNASSIGNED_VENDOR_KEY;
}

function rowVendorLabel(row: CompanyItemFreightRow): string {
  return String(row.vendorName || '').trim() || 'Unassigned';
}

function sortValue(row: CompanyItemFreightRow, key: FreightSortKey): string | number {
  if (key === 'itemSku' || key === 'item') return String(row.itemSku || '').trim().toLowerCase();
  if (TEXT_SORT_KEYS.has(key)) return String(row[key as keyof CompanyItemFreightRow] || '').trim().toLowerCase();
  const numeric = row[key as keyof CompanyItemFreightRow];
  return numeric == null || !Number.isFinite(Number(numeric)) ? Number.NEGATIVE_INFINITY : Number(numeric);
}

export default function SgpFreightReport({ selectedCompanyId, onOpenInfo }: SgpFreightReportProps) {
  const [items, setItems] = useState<CompanyItemFreightRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, setSpreadsheetItems] = useState(0);
  const [vendorFilter, setVendorFilter] = useState('');
  const [sortKey, setSortKey] = useState<FreightSortKey>('itemSku');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [edits, setEdits] = useState<Record<string, CompanyItemFreightPatch>>({});
  const [assumptions, setAssumptions] = useState<SgpFreightAssumptions>(DEFAULT_SGP_FREIGHT_ASSUMPTIONS);
  const [assumptionsDirty, setAssumptionsDirty] = useState(false);

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operational-data/sgp-freight?companyId=${encodeURIComponent(selectedCompanyId)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'Failed to load SGP Freight');
      }
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setAssumptions(normalizeSgpFreightAssumptions(payload.assumptions || DEFAULT_SGP_FREIGHT_ASSUMPTIONS));
      setAssumptionsDirty(false);
      setSpreadsheetItems(Number(payload.spreadsheetItems || 0));
      setEdits({});
      setDirty(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load SGP Freight');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    void load();
  }, [load]);

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
    return Array.from(byKey.values()).sort((left, right) => {
      if (left.key === UNASSIGNED_VENDOR_KEY) return 1;
      if (right.key === UNASSIGNED_VENDOR_KEY) return -1;
      return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [items]);

  useEffect(() => {
    if (!vendorOptions.length) {
      if (vendorFilter) setVendorFilter('');
      return;
    }
    if (!vendorOptions.some((vendor) => vendor.key === vendorFilter)) {
      setVendorFilter(vendorOptions[0].key);
    }
  }, [vendorOptions, vendorFilter]);

  const selectedVendorKey = vendorOptions.some((vendor) => vendor.key === vendorFilter)
    ? vendorFilter
    : vendorOptions[0]?.key || '';

  const selectedVendor = vendorOptions.find((vendor) => vendor.key === selectedVendorKey) || null;

  const visibleItems = useMemo(
    () => items.filter((row) => selectedVendorKey && rowVendorKey(row) === selectedVendorKey),
    [items, selectedVendorKey]
  );

  const sortedItems = useMemo(() => {
    return [...visibleItems].sort((left, right) => {
      const a = sortValue(left, sortKey);
      const b = sortValue(right, sortKey);
      const leftEmpty = a === '' || a === Number.NEGATIVE_INFINITY;
      const rightEmpty = b === '' || b === Number.NEGATIVE_INFINITY;
      if (leftEmpty !== rightEmpty) return leftEmpty ? 1 : -1;
      let result = 0;
      if (typeof a === 'number' && typeof b === 'number') result = a - b;
      else result = String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
      if (result === 0) result = String(left.itemSku).localeCompare(String(right.itemSku), undefined, { numeric: true });
      return sortDir === 'asc' ? result : -result;
    });
  }, [visibleItems, sortKey, sortDir]);

  const displayRow = (row: CompanyItemFreightRow): CompanyItemFreightRow => {
    const edit = edits[row.id];
    const next = edit ? { ...row, ...edit } : { ...row };
    if (edit?.cbm === undefined && (edit?.heightIn !== undefined || edit?.widthIn !== undefined || edit?.lengthIn !== undefined)) {
      next.cbm = calcCbmFromInches(next.heightIn, next.widthIn, next.lengthIn) ?? next.cbm;
      next.cbmIsManual = false;
    }
    const calculated = calcItemFreight({
      cbm: next.cbm,
      shipmentType: next.shipmentType,
      unitCost: next.unitCost,
      currentUnitCost: next.currentUnitCost,
      orderMultiple: next.orderMultiple,
      assumptions,
    });
    return { ...next, ...calculated };
  };

  const updateAssumption = (key: keyof SgpFreightAssumptions, value: string, kind: 'rate' | 'money' | 'qty') => {
    const parsed = parseNumber(value);
    if (parsed == null) return;
    const nextValue = kind === 'rate' ? parsed / 100 : parsed;
    setAssumptions((current) => ({ ...current, [key]: nextValue }));
    setAssumptionsDirty(true);
    setDirty(true);
    setNotice(null);
  };

  const updateField = (row: CompanyItemFreightRow, key: keyof CompanyItemFreightPatch, value: string) => {
    const parsed = parseNumber(value);
    setEdits((prev) => ({
      ...prev,
      [row.id]: {
        ...(prev[row.id] || { id: row.id, itemSku: row.itemSku }),
        id: row.id,
        itemSku: row.itemSku,
        [key]: parsed,
      },
    }));
    setDirty(true);
    setNotice(null);
  };

  const save = async () => {
    const patches = Object.values(edits);
    if (!patches.length && !assumptionsDirty) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/operational-data/sgp-freight', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          items: patches,
          assumptions: assumptionsDirty ? assumptions : undefined,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.error || 'Failed to save SGP Freight');
      }
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setAssumptions(normalizeSgpFreightAssumptions(payload.assumptions || assumptions));
      setAssumptionsDirty(false);
      setEdits({});
      setDirty(false);
      const parts = [
        patches.length ? `${patches.length} item${patches.length === 1 ? '' : 's'}` : null,
        assumptionsDirty ? 'rate assumptions' : null,
      ].filter(Boolean);
      setNotice(`Saved ${parts.join(' and ')}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save SGP Freight');
    } finally {
      setSaving(false);
    }
  };

  const toggleSort = (key: FreightSortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir(TEXT_SORT_KEYS.has(key) ? 'asc' : 'desc');
  };

  const renderValue = (row: CompanyItemFreightRow, column: (typeof SORT_COLUMNS)[number]) => {
    const current = displayRow(row);
    if (column.editable) {
      const raw = current[column.key as keyof CompanyItemFreightRow];
      const isCount = COUNT_KEYS.has(column.key);
      const digits = column.key === 'unitCost' || column.key === 'currentUnitCost' || column.key === 'cbm' ? 4 : 2;
      return (
        <input
          value={
            raw == null || !Number.isFinite(Number(raw))
              ? ''
              : isCount
                ? commaText(Number(raw), 2)
                : String(Number(Number(raw).toFixed(digits)))
          }
          onChange={(event) => updateField(row, column.key as keyof CompanyItemFreightPatch, event.target.value)}
          inputMode="decimal"
          style={{ ...inputStyle, textAlign: 'right' }}
        />
      );
    }
    if (column.key === 'itemSku' || column.key === 'item') return current.itemSku || '';
    if (column.key === 'percentOfContainer') return pctText(current.percentOfContainer);
    if (column.key === 'estimatedFreightCurrent' || column.key === 'estimatedFreightFuture') {
      return moneyText(current[column.key], 5);
    }
    if (TEXT_SORT_KEYS.has(column.key)) {
      return String(current[column.key as keyof CompanyItemFreightRow] || '');
    }
    const numeric = current[column.key as keyof CompanyItemFreightRow];
    if (numeric == null || !Number.isFinite(Number(numeric))) return '';
    if (COUNT_KEYS.has(column.key)) return commaText(Number(numeric), 2);
    return String(numeric);
  };

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>
          Values and formulas come from the SGP Freight sheet. Change the rate and shipment assumptions above the table to recalculate % of container and estimated freight.
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {onOpenInfo ? (
            <button type="button" onClick={onOpenInfo} style={{ ...inputStyle, width: 'auto', cursor: 'pointer', fontWeight: 700 }}>
              How this works
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
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
          <select
            value={selectedVendorKey}
            onChange={(event) => setVendorFilter(event.target.value)}
            style={{ ...inputStyle, width: 280 }}
          >
            {vendorOptions.map((vendor) => (
              <option key={vendor.key} value={vendor.key}>
                {vendor.label} ({vendor.count})
              </option>
            ))}
          </select>
          {selectedVendor?.vendorId ? (
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap' }}>
              {selectedVendor.vendorId}
            </span>
          ) : null}
        </div>
      </div>
      {error ? <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8 }}>{error}</div> : null}
      {notice ? <div style={{ color: '#166534', fontSize: 13, marginBottom: 8 }}>{notice}</div> : null}
      <div
        style={{
          display: 'flex',
          flexWrap: 'nowrap',
          gap: 10,
          marginBottom: 12,
          padding: '10px 12px',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          background: '#ffffff',
          overflowX: 'auto',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 0', minWidth: 118 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', lineHeight: 1.2, minHeight: 26 }}>
            Estimated Domestic Rate (CURRENT)
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              value={Number((assumptions.domesticRateCurrent * 100).toFixed(2))}
              onChange={(event) => updateAssumption('domesticRateCurrent', event.target.value, 'rate')}
              inputMode="decimal"
              style={{ ...inputStyle, fontWeight: 700, textAlign: 'right' }}
            />
            <span style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>%</span>
          </div>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 0', minWidth: 128 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', lineHeight: 1.2, minHeight: 26 }} title="Average Shipment Cost based on Current Data">
            Average Shipment Cost based on Current Data
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>$</span>
            <input
              value={Number(assumptions.averageShipmentCost.toFixed(2))}
              onChange={(event) => updateAssumption('averageShipmentCost', event.target.value, 'money')}
              inputMode="decimal"
              style={{ ...inputStyle, fontWeight: 700, textAlign: 'right' }}
            />
          </div>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 0', minWidth: 118 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', lineHeight: 1.2, minHeight: 26 }}>
            Estimated Freight Cost
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>$</span>
            <input
              value={Number(assumptions.estimatedFreightCost.toFixed(2))}
              onChange={(event) => updateAssumption('estimatedFreightCost', event.target.value, 'money')}
              inputMode="decimal"
              style={{ ...inputStyle, fontWeight: 700, textAlign: 'right' }}
            />
          </div>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 1 90px', minWidth: 72 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', lineHeight: 1.2, minHeight: 26 }}>
            CBMs
          </span>
          <input
            value={Number(assumptions.containerCbm.toFixed(2))}
            onChange={(event) => updateAssumption('containerCbm', event.target.value, 'qty')}
            inputMode="decimal"
            style={{ ...inputStyle, fontWeight: 700, textAlign: 'right' }}
          />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 0', minWidth: 108 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', lineHeight: 1.2, minHeight: 26 }}>
            Estimated Increase
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              value={Number((assumptions.domesticRateIncrease * 100).toFixed(2))}
              onChange={(event) => updateAssumption('domesticRateIncrease', event.target.value, 'rate')}
              inputMode="decimal"
              style={{ ...inputStyle, fontWeight: 700, textAlign: 'right' }}
            />
            <span style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>%</span>
          </div>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 0', minWidth: 108 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', lineHeight: 1.2, minHeight: 26 }}>
            Estimated Increase
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              value={Number((assumptions.freightCostIncrease * 100).toFixed(2))}
              onChange={(event) => updateAssumption('freightCostIncrease', event.target.value, 'rate')}
              inputMode="decimal"
              style={{ ...inputStyle, fontWeight: 700, textAlign: 'right' }}
            />
            <span style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>%</span>
          </div>
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 1 110px', minWidth: 96 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', lineHeight: 1.2, minHeight: 26 }}>
            Future Domestic Rate
          </span>
          <div style={{ ...inputStyle, fontWeight: 700, textAlign: 'right', background: '#f8fafc' }}>
            {`${(futureDomesticRate(assumptions) * 100).toFixed(2)}%`}
          </div>
        </div>
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, background: '#ffffff' }}>
        <table style={{ width: 'max-content', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              {SORT_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  title={column.title}
                  onClick={() => toggleSort(column.key)}
                  style={{
                    textAlign: column.align || 'left',
                    padding: '6px 4px',
                    fontSize: 10,
                    color: '#334155',
                    whiteSpace: 'pre-line',
                    lineHeight: 1.15,
                    cursor: 'pointer',
                    borderBottom: '1px solid #e2e8f0',
                    verticalAlign: 'bottom',
                    boxSizing: 'border-box',
                    width: column.width,
                    maxWidth: column.width,
                    minWidth: column.width,
                    overflow: 'hidden',
                  }}
                >
                  {column.label}
                  {sortKey === column.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((row) => (
              <tr key={row.id}>
                {SORT_COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    style={{
                      padding: column.editable ? '4px 4px' : '6px 4px',
                      fontSize: 12,
                      textAlign: column.align || 'left',
                      borderBottom: '1px solid #f1f5f9',
                      whiteSpace: 'nowrap',
                      boxSizing: 'border-box',
                      width: column.width,
                      maxWidth: column.width,
                      minWidth: column.width,
                      overflow: 'hidden',
                    }}
                  >
                    {renderValue(row, column)}
                  </td>
                ))}
              </tr>
            ))}
            {sortedItems.length === 0 && (
              <tr>
                <td colSpan={SORT_COLUMNS.length} style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                  {loading ? 'Loading…' : 'No SGP Freight rows yet. Upload the GMPA workbook that includes the SGP Freight sheet, then Reload.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
