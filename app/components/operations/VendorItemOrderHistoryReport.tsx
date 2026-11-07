'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { formatMoney } from '@/lib/format/currency';
import { formatEstDateTime } from '@/lib/time/eastern';
import OperationalReportPanel from './OperationalReportPanel';
import SuggestInput, { labeledSuggestionsFor } from './SuggestInput';

type Order = { poNumber: string; line: string; orderDate: string | null; quantity: number | null; receivedQty: number | null; unitPrice: number | null; dueDate: string | null; customer: string; status: string };
type Item = { itemSku: string; description: string; orderCount: number; totalQty: number; latestOrderDate: string | null; orders: Order[] };
type ItemSortKey = 'itemSku' | 'orderCount' | 'totalQty' | 'latestOrderDate';
const headerStyle: CSSProperties = { padding: '9px 10px', background: '#f8fafc', color: '#475569', textAlign: 'left', fontSize: 11, textTransform: 'uppercase' };
type Payload = { hasData: boolean; syncedAt?: string; vendors: Array<{ vendorId: string; vendorName: string; orderCount: number }>; selectedVendorId: string; items: Item[] };

export default function VendorItemOrderHistoryReport({ companyId, currency, locale, canReorder, isSaving, onMove, panelStyle }: {
  companyId: string; currency: string; locale: string; canReorder: boolean; isSaving: boolean;
  onMove: (sourceReportKey: string, targetReportKey: string) => void; panelStyle?: CSSProperties;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [vendorId, setVendorId] = useState('');
  const [vendorSearch, setVendorSearch] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ key: ItemSortKey; direction: 'asc' | 'desc' }>({ key: 'totalQty', direction: 'desc' });
  const [error, setError] = useState('');
  const load = (selectedVendorId = '') => {
    setError('');
    const params = new URLSearchParams({ companyId });
    if (selectedVendorId) params.set('vendorId', selectedVendorId);
    void fetch(`/api/operational-data/vendor-item-order-history?${params}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Failed to load vendor item order history');
        setPayload(body);
        setVendorId(body.selectedVendorId || '');
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Failed to load vendor item order history'));
  };
  useEffect(() => { load(); }, [companyId]);
  const money = (value: number | null) => value == null ? '—' : formatMoney(value, { currency, locale, decimals: 4 });
  const cell = { padding: '9px 10px', borderTop: '1px solid #e2e8f0', fontSize: 13, color: '#1e293b' };
  const right = { ...cell, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' };
  const hasData = Boolean(payload?.hasData);
  const inputStyle: CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, fontSize: 13, background: hasData ? 'white' : '#f1f5f9' };
  const hasSearch = Boolean(vendorSearch.trim() || vendorId || itemSearch.trim() || startDate || endDate);
  const handleReset = () => {
    setVendorSearch('');
    setItemSearch('');
    setStartDate('');
    setEndDate('');
    setExpanded(new Set());
    setVendorId('');
    setPayload((current) => (current ? { ...current, selectedVendorId: '', items: [] } : current));
  };
  const normalizedVendorSearch = vendorSearch.trim().toLowerCase();
  const visibleVendors = payload?.vendors.filter((vendor) =>
    !normalizedVendorSearch ||
    vendor.vendorId === vendorId ||
    vendor.vendorId.toLowerCase().includes(normalizedVendorSearch)
  ) || [];
  const vendorIdSuggestions = labeledSuggestionsFor(
    (payload?.vendors || []).map((vendor) => ({ value: vendor.vendorId, label: vendor.vendorName }))
  );
  const aprSuggestions = labeledSuggestionsFor(
    (payload?.items || []).map((item) => ({ value: item.itemSku, label: item.description }))
  );
  const handleVendorIdSearchChange = (nextVendorId: string) => {
    setVendorSearch(nextVendorId);
    const match = payload?.vendors.find(
      (vendor) => vendor.vendorId.trim().toLowerCase() === nextVendorId.trim().toLowerCase()
    );
    if (match && match.vendorId !== vendorId) {
      setExpanded(new Set());
      load(match.vendorId);
    }
  };
  const normalizedItemSearch = itemSearch.trim().toLowerCase();
  const visibleItems = (payload?.items || []).flatMap((item) => {
    const matchesSearch = !normalizedItemSearch || item.itemSku.toLowerCase().includes(normalizedItemSearch);
    if (!matchesSearch) return [];
    const orders = item.orders.filter((order) =>
      (!startDate || Boolean(order.orderDate && order.orderDate >= startDate)) &&
      (!endDate || Boolean(order.orderDate && order.orderDate <= endDate))
    );
    if (orders.length === 0) return [];
    return [{
      ...item,
      orders,
      orderCount: orders.length,
      totalQty: orders.reduce((sum, order) => sum + (order.quantity || 0), 0),
      latestOrderDate: orders[0]?.orderDate || null,
    }];
  }).sort((left, right) => {
    const leftValue = left[sort.key] ?? '';
    const rightValue = right[sort.key] ?? '';
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue));
    return sort.direction === 'asc' ? comparison : -comparison;
  });
  const sortableHeader = (key: ItemSortKey, label: string, align: 'left' | 'right' = 'left') => {
    const active = sort.key === key;
    return (
      <th key={key} style={{ ...headerStyle, textAlign: align }}>
        <button
          type="button"
          onClick={() => setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })}
          style={{ padding: 0, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: active ? 800 : 700, cursor: 'pointer', textTransform: 'inherit' }}
        >
          {label}{active ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
        </button>
      </th>
    );
  };
  return (
    <OperationalReportPanel reportKey="vendorsItemOrderHistory" canReorder={canReorder} isSaving={isSaving} onMove={onMove} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, ...panelStyle }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <h2 style={{ margin: 0, color: '#1e293b', fontSize: 24 }}>Order History</h2>
          <button
            type="button"
            onClick={handleReset}
            disabled={!hasSearch}
            style={{
              marginLeft: 'auto',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '8px 14px',
              background: '#ffffff',
              color: hasSearch ? '#334155' : '#94a3b8',
              fontWeight: 700,
              fontSize: 12,
              cursor: hasSearch ? 'pointer' : 'not-allowed',
            }}
          >
            Reset
          </button>
        </div>
        {payload?.syncedAt ? (
          <div style={{ color: '#64748b', fontSize: 12 }}>Last refreshed {formatEstDateTime(payload.syncedAt)}.</div>
        ) : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(220px, 1.4fr) minmax(180px, 1.2fr) minmax(140px, 0.8fr) minmax(140px, 0.8fr)', gap: 12, marginBottom: 16, alignItems: 'end' }}>
        <label style={{ display: 'block', fontSize: 12, color: '#334155', fontWeight: 700 }}>
          Vendor ID
          <SuggestInput
            value={vendorSearch}
            disabled={!hasData}
            suggestions={vendorIdSuggestions}
            onChange={handleVendorIdSearchChange}
            placeholder="Search vendor ID"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'block', fontSize: 12, color: '#334155', fontWeight: 700 }}>
          Vendor
          <select
            value={vendorId}
            disabled={!hasData}
            onChange={(event) => {
              setExpanded(new Set());
              if (event.target.value) {
                load(event.target.value);
              } else {
                setVendorId('');
                setPayload((current) => (current ? { ...current, selectedVendorId: '', items: [] } : current));
              }
            }}
            style={inputStyle}
          >
            <option value="">{hasData ? 'Select a vendor' : 'No vendors available'}</option>
            {visibleVendors.map((vendor) => <option key={vendor.vendorId} value={vendor.vendorId}>{vendor.vendorName} · {vendor.orderCount.toLocaleString()} purchase orders</option>)}
          </select>
        </label>
        <label style={{ display: 'block', fontSize: 12, color: '#334155', fontWeight: 700 }}>
          APR P/N
          <SuggestInput
            value={itemSearch}
            disabled={!hasData}
            suggestions={aprSuggestions}
            onChange={setItemSearch}
            placeholder="Search APR P/N"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'block', fontSize: 12, color: '#334155', fontWeight: 700 }}>
          Order date from
          <input type="date" value={startDate} disabled={!hasData} onChange={(event) => setStartDate(event.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'block', fontSize: 12, color: '#334155', fontWeight: 700 }}>
          Order date to
          <input type="date" value={endDate} disabled={!hasData} onChange={(event) => setEndDate(event.target.value)} style={inputStyle} />
        </label>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
          <thead><tr>
            {sortableHeader('itemSku', 'Item')}
            {sortableHeader('orderCount', 'Purchase Order Lines', 'right')}
            {sortableHeader('totalQty', 'Ordered qty', 'right')}
            {sortableHeader('latestOrderDate', 'Latest order')}
            <th style={headerStyle} />
          </tr></thead>
          <tbody>{visibleItems.map((item) => <ItemRows key={item.itemSku} item={item} expanded={expanded.has(item.itemSku)} onToggle={() => setExpanded((current) => { const next = new Set(current); next.has(item.itemSku) ? next.delete(item.itemSku) : next.add(item.itemSku); return next; })} cell={cell} right={right} money={money} />)}</tbody>
        </table>
        {visibleItems.length === 0 && (
          <div style={{ padding: 20, color: error ? '#b91c1c' : '#64748b', fontSize: 13 }}>
            {error
              ? error
              : !payload
                ? 'Loading order history…'
                : !hasData
                  ? 'No imported purchase-order data is available yet.'
                  : !vendorId
                    ? 'Select a vendor to view order history.'
                  : payload.items.length === 0
                    ? 'No PO line items were matched to this vendor.'
                    : 'No items match the APR P/N or dates.'}
          </div>
        )}
      </div>
    </OperationalReportPanel>
  );
}

function ItemRows({ item, expanded, onToggle, cell, right, money }: { item: Item; expanded: boolean; onToggle: () => void; cell: CSSProperties; right: CSSProperties; money: (value: number | null) => string }) {
  return <><tr>
    <td style={cell}><strong>{item.itemSku}</strong>{item.description && <div style={{ color: '#64748b', fontSize: 11 }}>{item.description}</div>}</td>
    <td style={right}>{item.orderCount.toLocaleString()}</td><td style={right}>{item.totalQty.toLocaleString()}</td><td style={cell}>{item.latestOrderDate || '—'}</td>
    <td style={cell}><button type="button" onClick={onToggle} style={{ border: '1px solid #cbd5e1', background: 'white', borderRadius: 5, padding: '4px 8px', cursor: 'pointer', fontSize: 12 }}>{expanded ? 'Hide orders' : 'View orders'}</button></td>
  </tr>{expanded && <tr><td colSpan={5} style={{ padding: '0 10px 12px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}><table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}><thead><tr>{['PO', 'Line', 'Order date', 'Qty', 'Received', 'Unit price', 'Due date', 'Customer', 'Status'].map((label) => <th key={label} style={{ padding: '7px 8px', textAlign: ['Qty', 'Received', 'Unit price'].includes(label) ? 'right' : 'left', color: '#64748b', fontSize: 10, textTransform: 'uppercase' as const }}>{label}</th>)}</tr></thead><tbody>{item.orders.map((order, index) => <tr key={`${order.poNumber}-${order.line}-${index}`}><td style={cell}>{order.poNumber}</td><td style={cell}>{order.line || '—'}</td><td style={cell}>{order.orderDate || '—'}</td><td style={right}>{order.quantity?.toLocaleString() ?? '—'}</td><td style={right}>{order.receivedQty?.toLocaleString() ?? '—'}</td><td style={right}>{money(order.unitPrice)}</td><td style={cell}>{order.dueDate || '—'}</td><td style={cell}>{order.customer || '—'}</td><td style={cell}>{order.status || '—'}</td></tr>)}</tbody></table></td></tr>}</>;
}
