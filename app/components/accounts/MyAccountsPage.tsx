'use client';

import React from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import { switchActiveCompany } from '@/lib/auth/company-switch';

type AccountSummary = {
  companyId: string;
  name: string;
  companyRole: 'admin' | 'user';
  owner: string;
  subscriptionStatus: string | null;
  accountingSystem: string | null;
  lastSyncAt: string | null;
};

type StatusFilter = 'all' | 'active' | 'paused' | 'cancelled';

const statusColors: Record<string, { background: string; color: string }> = {
  active: { background: '#dcfce7', color: '#166534' },
  paused: { background: '#fef9c3', color: '#854d0e' },
  cancelled: { background: '#fee2e2', color: '#991b1b' },
};

export default function MyAccountsPage() {
  const [accounts, setAccounts] = React.useState<AccountSummary[]>([]);
  const [activeCompanyId, setActiveCompanyId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [openingCompanyId, setOpeningCompanyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const response = await fetch('/api/me/accounts', { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to load your accounts');
        }
        if (cancelled) return;
        setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
        setActiveCompanyId(typeof data?.activeCompanyId === 'string' ? data.activeCompanyId : null);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Failed to load your accounts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleAccounts = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return accounts.filter((account) => {
      const status = String(account.subscriptionStatus || '').toLowerCase();
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!query) return true;
      return account.name.toLowerCase().includes(query) || account.owner.toLowerCase().includes(query);
    });
  }, [accounts, search, statusFilter]);

  const openAccount = async (companyId: string) => {
    setOpeningCompanyId(companyId);
    try {
      await switchActiveCompany(companyId);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to open this account');
      setOpeningCompanyId(null);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', margin: '0 0 6px 0' }}>My Accounts</h1>
        <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
          Companies assigned to you by a site administrator. Opening an account fully closes the one you are in.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <input
          type="search"
          placeholder="Search by company or consulting firm"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ flex: '1 1 280px', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>Loading your accounts...</div>
      ) : loadError ? (
        <div style={{ padding: '16px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '14px' }}>
          {loadError}
        </div>
      ) : accounts.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#64748b', margin: '0 0 6px 0' }}>No accounts assigned</h2>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>Ask a site administrator to assign companies to you in User Access.</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Company</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Consulting firm</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Your access</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '10px 16px', fontWeight: 600 }}>Last sync</th>
                <th style={{ padding: '10px 16px' }} />
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((account) => {
                const status = String(account.subscriptionStatus || '').toLowerCase();
                const statusStyle = statusColors[status] || { background: '#f1f5f9', color: '#475569' };
                const isActive = account.companyId === activeCompanyId;
                const isOpening = openingCompanyId === account.companyId;
                return (
                  <tr key={account.companyId} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1e293b' }}>
                      {account.name}
                      {isActive && (
                        <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 700, color: '#1F70C1' }}>CURRENT</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>{account.owner}</td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      {account.companyRole === 'admin' ? 'Company Admin' : 'Company User'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {status ? (
                        <span style={{ ...statusStyle, padding: '2px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, textTransform: 'capitalize' }}>
                          {status}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#475569' }}>
                      {account.lastSyncAt ? formatEstDateTime(account.lastSyncAt) : 'Never'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => openAccount(account.companyId)}
                        disabled={Boolean(openingCompanyId)}
                        style={{
                          padding: '6px 14px',
                          background: openingCompanyId ? '#94a3b8' : '#1F70C1',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: openingCompanyId ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isOpening ? 'Opening...' : 'Open'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {visibleAccounts.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                    No accounts match your search.
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
