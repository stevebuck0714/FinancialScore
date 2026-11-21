'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

type CustomerGroupRow = {
  customerId: string;
  customerName: string;
  customerGroup: string;
  csr: string;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 150,
  boxSizing: 'border-box',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '7px 8px',
  fontSize: 13,
  color: '#0f172a',
  background: '#ffffff',
};

export default function GroupManagement({ selectedCompanyId }: { selectedCompanyId: string }) {
  const [customers, setCustomers] = useState<CustomerGroupRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Pick<CustomerGroupRow, 'customerGroup' | 'csr'>>>({});
  const [loading, setLoading] = useState(false);
  const [savingCustomerId, setSavingCustomerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: 'customerId' | 'customerName' | 'customerGroup' | 'csr'; direction: 'asc' | 'desc' }>({
    key: 'customerName',
    direction: 'asc',
  });

  const load = useCallback(async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/operational-data/customer-groups?${new URLSearchParams({ companyId: selectedCompanyId })}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to load group management');
      const rows = Array.isArray(payload.customers) ? payload.customers : [];
      setCustomers(rows);
      setDrafts(Object.fromEntries(rows.map((row: CustomerGroupRow) => [
        row.customerId,
        { customerGroup: row.customerGroup || '', csr: row.csr || '' },
      ])));
    } catch (loadError) {
      setCustomers([]);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load group management');
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? customers.filter((row) =>
          [row.customerId, row.customerName, drafts[row.customerId]?.customerGroup, drafts[row.customerId]?.csr]
            .some((value) => String(value || '').toLowerCase().includes(query)),
        )
      : customers;
    return filtered.sort((left, right) => {
      const leftValue = String(sort.key === 'customerGroup' || sort.key === 'csr'
        ? drafts[left.customerId]?.[sort.key] || ''
        : left[sort.key] || '');
      const rightValue = String(sort.key === 'customerGroup' || sort.key === 'csr'
        ? drafts[right.customerId]?.[sort.key] || ''
        : right[sort.key] || '');
      const comparison = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: 'base' });
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [customers, drafts, search, sort]);

  const toggleSort = (key: typeof sort.key) => {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const updateDraft = (customerId: string, field: 'customerGroup' | 'csr', value: string) => {
    setDrafts((current) => ({
      ...current,
      [customerId]: { customerGroup: current[customerId]?.customerGroup || '', csr: current[customerId]?.csr || '', [field]: value },
    }));
  };

  const save = async (customer: CustomerGroupRow) => {
    const draft = drafts[customer.customerId] || { customerGroup: '', csr: '' };
    setSavingCustomerId(customer.customerId);
    setError(null);
    try {
      const response = await fetch('/api/operational-data/customer-groups', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          customerId: customer.customerId,
          customerName: customer.customerName,
          customerGroup: draft.customerGroup,
          csr: draft.csr,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Failed to save customer assignment');
      setCustomers((current) => current.map((row) =>
        row.customerId === customer.customerId
          ? { ...row, customerGroup: payload.customerGroup || '', csr: payload.csr || '' }
          : row,
      ));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save customer assignment');
    } finally {
      setSavingCustomerId(null);
    }
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Group Management</h3>
      <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 13, lineHeight: 1.5 }}>
        Assign a customer group and CSR for each customer. These assignments are shared across the Group operational reports.
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search customer ID, customer, group, or CSR"
          style={{ ...inputStyle, maxWidth: 380 }}
        />
        <button type="button" onClick={() => void load()} disabled={loading} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 12px', background: '#ffffff', color: '#334155', fontSize: 13, fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error && <div style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
        <table style={{ width: '100%', minWidth: 850, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {([
                { key: 'customerId' as const, label: 'Customer ID' },
                { key: 'customerName' as const, label: 'Customer Name' },
                { key: 'customerGroup' as const, label: 'Customer Group' },
                { key: 'csr' as const, label: 'CSR Assigned to Group' },
              ]).map((column) => (
                <th key={column.key} style={{ padding: '10px 12px', textAlign: 'left', color: '#475569', fontSize: 12, fontWeight: 800 }}>
                  <button
                    type="button"
                    onClick={() => toggleSort(column.key)}
                    style={{ border: 'none', background: 'transparent', padding: 0, color: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', cursor: 'pointer' }}
                  >
                    {column.label}{sort.key === column.key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
              <th style={{ padding: '10px 12px', textAlign: 'left' }} />
            </tr>
          </thead>
          <tbody>
            {!loading && visibleCustomers.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 13 }}>No customers are available from the company’s product forecast or revenue records.</td></tr>
            )}
            {visibleCustomers.map((customer) => {
              const draft = drafts[customer.customerId] || { customerGroup: customer.customerGroup || '', csr: customer.csr || '' };
              const changed = draft.customerGroup !== (customer.customerGroup || '') || draft.csr !== (customer.csr || '');
              return (
                <tr key={customer.customerId} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', color: '#334155', fontSize: 13, whiteSpace: 'nowrap' }}>{customer.customerId}</td>
                  <td style={{ padding: '10px 12px', color: '#1e293b', fontSize: 13, fontWeight: 600 }}>{customer.customerName}</td>
                  <td style={{ padding: '7px 12px' }}><input value={draft.customerGroup} onChange={(event) => updateDraft(customer.customerId, 'customerGroup', event.target.value)} placeholder="Unassigned" style={inputStyle} /></td>
                  <td style={{ padding: '7px 12px' }}><input value={draft.csr} onChange={(event) => updateDraft(customer.customerId, 'csr', event.target.value)} placeholder="Unassigned" style={inputStyle} /></td>
                  <td style={{ padding: '7px 12px', textAlign: 'right' }}>
                    <button type="button" onClick={() => void save(customer)} disabled={!changed || savingCustomerId === customer.customerId} style={{ border: 'none', borderRadius: 6, padding: '8px 12px', background: changed ? '#2563eb' : '#e2e8f0', color: changed ? '#ffffff' : '#64748b', fontWeight: 700, cursor: changed ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                      {savingCustomerId === customer.customerId ? 'Saving…' : 'Save'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
