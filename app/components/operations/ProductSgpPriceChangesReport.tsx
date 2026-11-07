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
  'itemSku' | 'itemName' | 'customerName' | 'customerPartNumber' | 'customerGroup' | 'sgpPrice' | 'contractPrice' | 'priceChange' | 'priceChangePct'
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

function customerKeyFor(line: SgpPriceChangeLine): string {
  return `${line.customerId || ''}||${line.customerName || ''}`;
}

const filterLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: '#334155',
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 12,
  color: '#0f172a',
  background: '#ffffff',
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
  const [customerIdSearch, setCustomerIdSearch] = useState('');
  const [customerKey, setCustomerKey] = useState('');
  const [aprSearch, setAprSearch] = useState('');
  const [customerGroup, setCustomerGroup] = useState('');
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

  const customerOptions = useMemo(() => {
    const byKey = new Map<string, { key: string; customerId: string; label: string }>();
    for (const line of dataset?.lines || []) {
      const key = customerKeyFor(line);
      if (!byKey.has(key)) byKey.set(key, { key, customerId: line.customerId || '', label: line.customerName || line.customerId || 'Unknown customer' });
    }
    return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [dataset]);

  const groupOptions = useMemo(
    () =>
      Array.from(new Set((dataset?.lines || []).map((line) => line.customerGroup).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      ),
    [dataset]
  );

  const handleCustomerIdSearchChange = (value: string) => {
    setCustomerIdSearch(value);
    const match = customerOptions.find((option) => option.customerId.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      setCustomerKey(match.key);
      setCustomerGroup('');
    }
  };

  const hasSearch = Boolean(customerIdSearch.trim() || customerKey || aprSearch.trim() || customerGroup);

  const handleReset = () => {
    setCustomerIdSearch('');
    setCustomerKey('');
    setAprSearch('');
    setCustomerGroup('');
  };

  const rows = useMemo(() => {
    const idTerm = customerIdSearch.trim().toUpperCase();
    const aprTerm = aprSearch.trim().toUpperCase();
    const filtered = (dataset?.lines || []).filter(
      (line) =>
        (!customerKey || customerKeyFor(line) === customerKey) &&
        (customerKey || !idTerm || String(line.customerId || '').toUpperCase().includes(idTerm)) &&
        (!aprTerm || line.itemSku.toUpperCase().includes(aprTerm)) &&
        (!customerGroup || line.customerGroup === customerGroup)
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
  }, [aprSearch, customerGroup, customerIdSearch, customerKey, dataset, sortAsc, sortKey]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc((prev) => !prev);
      return;
    }
    setSortKey(key);
    setSortAsc(key === 'itemSku' || key === 'itemName' || key === 'customerName' || key === 'customerPartNumber' || key === 'customerGroup');
  };

  const sortHeader = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th style={{ ...th, textAlign: align }} onClick={() => toggleSort(key)} title={`Sort by ${label.replace('\n', ' ')}`}>
      {label}
      {sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : ' ↕'}
    </th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Price Changes from SGP</h3>
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
              onClick={() => void load(true)}
              disabled={loading || !selectedCompanyId}
              style={{
                marginLeft: 'auto',
                border: '1px solid #4338ca',
                borderRadius: 8,
                padding: '8px 14px',
                background: loading ? '#c7d2fe' : '#4f46e5',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 12,
                cursor: loading ? 'default' : 'pointer',
              }}
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!hasSearch}
              style={{
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                padding: '8px 14px',
                background: '#ffffff',
                color: !hasSearch ? '#94a3b8' : '#334155',
                fontWeight: 700,
                cursor: !hasSearch ? 'not-allowed' : 'pointer',
                fontSize: 12,
              }}
            >
              Reset
            </button>
          </div>
          <p style={{ margin: '8px 0 0', color: '#475569', fontSize: 13, lineHeight: 1.5 }}>
            SGP item price versus the current contract price from Infor, per item and customer P/N.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginTop: 16 }}>
          <label style={filterLabelStyle}>
            Customer ID
            <input
              type="search"
              value={customerIdSearch}
              onChange={(event) => handleCustomerIdSearchChange(event.target.value)}
              placeholder="Search customer ID"
              style={{ ...inputStyle, width: 180 }}
            />
          </label>
          <label style={filterLabelStyle}>
            Customer Name
            <select
              value={customerKey}
              onChange={(event) => {
                setCustomerKey(event.target.value);
                if (event.target.value) setCustomerGroup('');
              }}
              style={{ ...inputStyle, minWidth: 280 }}
            >
              <option value="">All customers</option>
              {customerOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={filterLabelStyle}>
            APR P/N
            <input
              type="search"
              value={aprSearch}
              onChange={(event) => setAprSearch(event.target.value)}
              placeholder="Search APR P/N"
              style={{ ...inputStyle, width: 180 }}
            />
          </label>
          <label style={filterLabelStyle}>
            Group Name
            <select
              value={customerGroup}
              onChange={(event) => {
                setCustomerGroup(event.target.value);
                if (event.target.value) {
                  setCustomerKey('');
                  setCustomerIdSearch('');
                }
              }}
              style={{ ...inputStyle, minWidth: 220 }}
            >
              <option value="">All groups</option>
              {groupOptions.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>
          <label style={filterLabelStyle}>
            Year
            <select value={year} onChange={(event) => setYear(Number(event.target.value))} style={{ ...inputStyle, width: 108 }}>
              {yearOptions().map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
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
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1080 }}>
            <thead>
              <tr>
                {sortHeader('itemSku', 'APR P/N', 'left')}
                {sortHeader('itemName', 'Item Name', 'left')}
                {sortHeader('customerName', 'Customer Name', 'left')}
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
                <tr key={`${line.customerName}||${line.customerGroup}||${line.itemSku}||${line.customerPartNumber}`}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{line.itemSku}</td>
                  <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', minWidth: 200 }}>{line.itemName || '—'}</td>
                  <td style={{ ...td, textAlign: 'left' }}>{line.customerName || '—'}</td>
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
                  <td colSpan={9} style={{ ...td, textAlign: 'left', color: '#64748b' }}>
                    No items match these filters.
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
