'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { estYear } from '@/lib/time/eastern';
import type { SgpPriceChangeLine, SgpPriceChangesDataset } from '@/lib/operations/product-sgp-price-changes';

type ProductSgpPriceChangesReportProps = {
  selectedCompanyId: string;
  onOpenInfo?: () => void;
};

type SortKey = keyof Pick<
  SgpPriceChangeLine,
  'itemSku' | 'itemName' | 'customerPartNumber' | 'customerGroup' | 'sgpPrice' | 'contractPrice' | 'priceChange' | 'priceChangePct'
>;

const MIN_YEAR = 2018;

function yearOptions(): number[] {
  const year = estYear();
  const start = Math.max(MIN_YEAR, year - 4);
  const end = year + 2;
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function fmtPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtSignedPrice(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (value === 0) return '$0.00';
  return `${value > 0 ? '+' : '-'}${fmtPrice(Math.abs(value))}`;
}

function fmtSignedPct(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const pct = value * 100;
  if (Math.abs(pct) < 0.05) return '0.0%';
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function changeColor(value: number | null): string {
  if (value == null || value === 0) return '#475569';
  return value > 0 ? '#15803d' : '#b91c1c';
}

const th: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 800,
  color: '#334155',
  background: '#f1f5f9',
  borderBottom: '1px solid #cbd5e1',
  textAlign: 'right',
  whiteSpace: 'pre-line',
  position: 'sticky',
  top: 0,
  zIndex: 1,
  cursor: 'pointer',
  userSelect: 'none',
};

const td: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: 12,
  color: '#0f172a',
  borderBottom: '1px solid #e2e8f0',
  textAlign: 'right',
  whiteSpace: 'nowrap',
};

export default function ProductSgpPriceChangesReport({ selectedCompanyId, onOpenInfo }: ProductSgpPriceChangesReportProps) {
  const [year, setYear] = useState<number>(() => estYear());
  const [dataset, setDataset] = useState<SgpPriceChangesDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('itemSku');
  const [sortAsc, setSortAsc] = useState(true);

  const load = useCallback(
    async (refresh = false) => {
      if (!selectedCompanyId) {
        setDataset(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ companyId: selectedCompanyId, year: String(year) });
        if (refresh) params.set('refresh', '1');
        const response = await fetch(`/api/operational-data/product-sgp-price-changes?${params.toString()}`, {
          cache: 'no-store',
        });
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(json?.error || `HTTP ${response.status}`);
        setDataset(json as SgpPriceChangesDataset);
      } catch (err: any) {
        setError(err?.message || 'Failed to load price changes from SGP');
        setDataset(null);
      } finally {
        setLoading(false);
      }
    },
    [selectedCompanyId, year]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const term = search.trim().toUpperCase();
    const filtered = (dataset?.lines || []).filter(
      (line) =>
        !term ||
        line.itemSku.toUpperCase().includes(term) ||
        line.customerPartNumber.toUpperCase().includes(term) ||
        line.itemName.toUpperCase().includes(term)
    );
    return filtered.slice().sort((left, right) => {
      const a = left[sortKey];
      const b = right[sortKey];
      if (typeof a === 'number' || typeof b === 'number' || a == null || b == null) {
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        return ((a as number) - (b as number)) * (sortAsc ? 1 : -1);
      }
      return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * (sortAsc ? 1 : -1);
    });
  }, [dataset, search, sortAsc, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((prev) => !prev);
      return;
    }
    setSortKey(key);
    setSortAsc(key === 'itemSku' || key === 'itemName' || key === 'customerPartNumber' || key === 'customerGroup');
  };

  const sortHeader = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th style={{ ...th, textAlign: align }} onClick={() => toggleSort(key)} title={`Sort by ${label.replace('\n', ' ')}`}>
      {label}
      {sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ' ↕'}
    </th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Price Changes from SGP</h3>
          <div style={{ marginTop: 4, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
            SGP item price versus the current contract price from Infor, per item and customer P/N.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Item ID, name, or customer P/N"
            style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: '#0f172a', width: 240 }}
          />
          <label style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>Year</label>
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
            style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: 12, color: '#0f172a' }}
          >
            {yearOptions().map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading || !selectedCompanyId}
            style={{
              border: '1px solid #4338ca',
              borderRadius: 8,
              padding: '6px 12px',
              background: loading ? '#c7d2fe' : '#4f46e5',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: 12,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          {onOpenInfo ? (
            <button
              type="button"
              onClick={onOpenInfo}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#4f46e5',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              How this works
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div> : null}

      {loading && !dataset ? (
        <div style={{ padding: '28px 0', color: '#64748b', fontSize: 13 }}>Loading price changes from SGP…</div>
      ) : !dataset || dataset.lines.length === 0 ? (
        !loading ? (
          <div style={{ padding: '28px 0', color: '#64748b', fontSize: 13 }}>
            No SGP or contract prices found for {year}.
          </div>
        ) : null
      ) : (
        <div style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, maxHeight: 620 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 940 }}>
            <thead>
              <tr>
                {sortHeader('itemSku', 'Item ID', 'left')}
                {sortHeader('itemName', 'Item Name', 'left')}
                {sortHeader('customerPartNumber', 'Customer P/N', 'left')}
                {sortHeader('customerGroup', 'Group', 'left')}
                {sortHeader('sgpPrice', 'SGP Item\nPrice')}
                {sortHeader('contractPrice', 'Current Contract\nPrice')}
                {sortHeader('priceChange', 'Price\nChange')}
                {sortHeader('priceChangePct', 'Price\nChange %')}
              </tr>
            </thead>
            <tbody>
              {rows.map((line) => (
                <tr key={`${line.customerGroup}||${line.itemSku}||${line.customerPartNumber}`}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{line.itemSku}</td>
                  <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', minWidth: 200 }}>{line.itemName || '—'}</td>
                  <td style={{ ...td, textAlign: 'left' }}>{line.customerPartNumber || '—'}</td>
                  <td style={{ ...td, textAlign: 'left' }}>{line.customerGroup || '—'}</td>
                  <td style={td}>{fmtPrice(line.sgpPrice)}</td>
                  <td style={td}>{fmtPrice(line.contractPrice)}</td>
                  <td style={{ ...td, color: changeColor(line.priceChange), fontWeight: 700 }}>{fmtSignedPrice(line.priceChange)}</td>
                  <td style={{ ...td, color: changeColor(line.priceChange), fontWeight: 700 }}>{fmtSignedPct(line.priceChangePct)}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ ...td, textAlign: 'left', color: '#64748b' }}>
                    No items match {search.trim()}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
