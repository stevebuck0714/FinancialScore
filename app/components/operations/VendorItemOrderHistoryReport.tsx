'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { formatMoney } from '@/lib/format/currency';
import { formatEstDateTime } from '@/lib/time/eastern';
import OperationalReportPanel from './OperationalReportPanel';

type Order = { poNumber: string; line: string; orderDate: string | null; quantity: number | null; receivedQty: number | null; unitPrice: number | null; dueDate: string | null; customer: string; status: string };
type Item = { itemSku: string; description: string; orderCount: number; totalQty: number; latestOrderDate: string | null; orders: Order[] };
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
  const normalizedVendorSearch = vendorSearch.trim().toLowerCase();
  const visibleVendors = payload?.vendors.filter((vendor) =>
    !normalizedVendorSearch ||
    vendor.vendorId === vendorId ||
    `${vendor.vendorName} ${vendor.vendorId}`.toLowerCase().includes(normalizedVendorSearch)
  ) || [];
  const normalizedItemSearch = itemSearch.trim().toLowerCase();
  const visibleItems = (payload?.items || []).flatMap((item) => {
    const matchesSearch = !normalizedItemSearch ||
      `${item.itemSku} ${item.description} ${item.orders.map((order) => order.poNumber).join(' ')}`.toLowerCase().includes(normalizedItemSearch);
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
  });
  return (
    <OperationalReportPanel reportKey="vendorsItemOrderHistory" canReorder={canReorder} isSaving={isSaving} onMove={onMove} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, ...panelStyle }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 5px', color: '#1e293b', fontSize: 24 }}>Item order history by vendor</h2>
        <div style={{ color: '#64748b', fontSize: 12 }}>
          Select a vendor, then expand an item to review its purchase-order history.
          {payload?.syncedAt ? ` Last refreshed ${formatEstDateTime(payload.syncedAt)}.` : ''}
        </div>
      </div>
      {error ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div> : !payload ? <div style={{ color: '#64748b', fontSize: 13 }}>Loading order history…</div> : !payload.hasData ? <div style={{ color: '#64748b', fontSize: 13 }}>No imported purchase-order data is available yet.</div> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 440px) minmax(260px, 440px)', gap: 12, marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#334155', fontWeight: 700 }}>
            Search vendor
            <input value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} placeholder="Vendor name or ID" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, fontSize: 13 }} />
          </label>
          <label style={{ display: 'block', fontSize: 12, color: '#334155', fontWeight: 700 }}>
            Search items or PO number
            <input value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Item ID, description, or PO number" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, fontSize: 13 }} />
          </label>
          <label style={{ display: 'block', fontSize: 12, color: '#334155', fontWeight: 700 }}>
            Order date from
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, fontSize: 13 }} />
          </label>
          <label style={{ display: 'block', fontSize: 12, color: '#334155', fontWeight: 700 }}>
            Order date to
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 5, border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, fontSize: 13 }} />
          </label>
          <label style={{ display: 'block', gridColumn: '1 / -1', maxWidth: 440, fontSize: 12, color: '#334155', fontWeight: 700 }}>
            Vendor
            <select value={vendorId} onChange={(event) => { setExpanded(new Set()); load(event.target.value); }} style={{ display: 'block', width: '100%', marginTop: 5, border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, background: 'white', fontSize: 13 }}>
              {visibleVendors.map((vendor) => <option key={vendor.vendorId} value={vendor.vendorId}>{vendor.vendorName} ({vendor.vendorId}) · {vendor.orderCount.toLocaleString()} POs</option>)}
            </select>
          </label>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
            <thead><tr>{['Item', 'POs', 'Ordered qty', 'Latest order', ''].map((label) => <th key={label || 'expand'} style={{ padding: '9px 10px', background: '#f8fafc', color: '#475569', textAlign: label === 'POs' || label === 'Ordered qty' ? 'right' : 'left', fontSize: 11, textTransform: 'uppercase' as const }}>{label}</th>)}</tr></thead>
            <tbody>{visibleItems.map((item) => <ItemRows key={item.itemSku} item={item} expanded={expanded.has(item.itemSku)} onToggle={() => setExpanded((current) => { const next = new Set(current); next.has(item.itemSku) ? next.delete(item.itemSku) : next.add(item.itemSku); return next; })} cell={cell} right={right} money={money} />)}</tbody>
          </table>
          {visibleItems.length === 0 && <div style={{ padding: 20, color: '#64748b', fontSize: 13 }}>{payload.items.length === 0 ? 'No PO line items were matched to this vendor.' : 'No items or purchase orders match the search.'}</div>}
        </div>
      </>}
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
