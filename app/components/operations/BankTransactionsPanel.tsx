'use client';

import React, { useEffect, useState } from 'react';
import { ALL_BANK_ACCOUNTS, type BankRegister } from '@/lib/financial/bank-register-types';

type Props = {
  companyId: string;
  startDate: string;
  endDate: string;
  currency: string;
};

/** "2026-10-31" -> "10/31/2026" without shifting the calendar day. */
function formatDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-');
  return year && month && day ? `${Number(month)}/${Number(day)}/${year}` : dateKey;
}

function csvCell(value: string | number) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function BankTransactionsPanel({ companyId, startDate, endDate, currency }: Props) {
  const [accountKey, setAccountKey] = useState<string>(ALL_BANK_ACCOUNTS);
  const [register, setRegister] = useState<BankRegister | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !startDate || !endDate) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ companyId, startDate, endDate, account: accountKey });
    fetch(`/api/operational-data/bank-register?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || 'Failed to load bank transactions');
        setRegister(data?.register || null);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setRegister(null);
        setError(err?.message || 'Failed to load bank transactions');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [companyId, startDate, endDate, accountKey]);

  const money = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const showAccountColumn = register?.accountKey === ALL_BANK_ACCOUNTS && register.accounts.length > 1;
  const ledgerDifference =
    register && register.ledgerEndingBalance != null ? Math.round((register.ledgerEndingBalance - register.endingBalance) * 100) / 100 : 0;

  const exportCsv = () => {
    if (!register) return;
    const header = ['Date', ...(showAccountColumn ? ['Account'] : []), 'Type', 'Num', 'Name / Memo', 'Deposit', 'Withdrawal', 'Balance'];
    const blankLead = showAccountColumn ? ['', ''] : [''];
    const lines = [
      header,
      [...blankLead, '', '', 'Beginning balance', '', '', register.beginningBalance.toFixed(2)],
      ...register.transactions.map((txn) => [
        txn.date,
        ...(showAccountColumn ? [txn.accountName] : []),
        txn.type,
        txn.num,
        txn.description,
        txn.amount >= 0 ? txn.amount.toFixed(2) : '',
        txn.amount < 0 ? (-txn.amount).toFixed(2) : '',
        txn.balance.toFixed(2),
      ]),
      [...blankLead, '', '', 'Totals / ending balance', register.totalDeposits.toFixed(2), register.totalWithdrawals.toFixed(2), register.endingBalance.toFixed(2)],
    ];
    const csv = lines.map((row) => row.map(csvCell).join(',')).join('\n');
    const accountLabel =
      register.accountKey === ALL_BANK_ACCOUNTS
        ? 'all-bank-accounts'
        : (register.accounts.find((account) => account.key === register.accountKey)?.name || 'account').replace(/[^A-Za-z0-9]+/g, '-');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `bank-transactions-${accountLabel}-${register.startDate}-to-${register.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const card = (label: string, value: number, color: string) => (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px' }}>
      <div style={{ color, fontSize: '12px' }}>{label}</div>
      <div style={{ color: '#0f172a', fontSize: '20px', fontWeight: 700 }}>{money(value)}</div>
    </div>
  );
  const th = (label: string, align: 'left' | 'right' = 'left') => (
    <th key={label} style={{ textAlign: align, padding: '10px', fontSize: '12px', color: '#334155', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{label}</th>
  );
  const td: React.CSSProperties = { padding: '10px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', color: '#334155' };
  const tdRight: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' };
  const leadColumns = showAccountColumn ? 5 : 4;

  return (
    <div style={{ padding: '12px 24px 24px' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Bank Account:</label>
        <select
          value={register?.accountKey || accountKey}
          onChange={(event) => setAccountKey(event.target.value)}
          disabled={!register?.accounts.length}
          style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', color: '#1e293b', background: 'white', minWidth: '260px' }}
        >
          <option value={ALL_BANK_ACCOUNTS}>All bank accounts</option>
          {(register?.accounts || []).map((account) => (
            <option key={account.key} value={account.key}>{account.name}</option>
          ))}
        </select>
        <span style={{ fontSize: '12px', color: '#64748b' }}>
          {formatDateKey(startDate)} to {formatDateKey(endDate)} (EST) · Currency: {currency}
        </span>
        <button
          onClick={exportCsv}
          disabled={!register}
          style={{ marginLeft: 'auto', padding: '6px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', fontWeight: 500, color: '#475569', cursor: register ? 'pointer' : 'not-allowed' }}
        >
          Export CSV
        </button>
      </div>

      {loading && <div style={{ color: '#64748b', fontSize: '13px', padding: '12px 0' }}>Loading bank transactions…</div>}
      {!loading && error && <div style={{ color: '#b91c1c', fontSize: '13px', padding: '12px 0' }}>{error}</div>}
      {!loading && !error && !register && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '24px', color: '#64748b', fontSize: '13px' }}>
          No bank accounts with General Ledger detail are available for this company yet. Run a QuickBooks sync to load them.
        </div>
      )}

      {!loading && !error && register && (
        <>
          <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginBottom: '12px' }}>
            {card('Beginning Balance', register.beginningBalance, '#3b82f6')}
            {card('Total Deposits', register.totalDeposits, '#16a34a')}
            {card('Total Withdrawals', register.totalWithdrawals, '#dc2626')}
            {card('Ending Balance', register.endingBalance, '#3b82f6')}
          </div>
          {Math.abs(ledgerDifference) >= 0.01 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', marginBottom: '12px' }}>
              The books show {money(register.ledgerEndingBalance || 0)} on {formatDateKey(register.endDate)}, {money(ledgerDifference)} different from this register's ending balance. Some General Ledger detail for the period is missing; re-sync QuickBooks.
            </div>
          )}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  {th('Date')}
                  {showAccountColumn && th('Account')}
                  {th('Type')}
                  {th('Num')}
                  {th('Name / Memo')}
                  {th('Deposit', 'right')}
                  {th('Withdrawal', 'right')}
                  {th('Balance', 'right')}
                </tr>
              </thead>
              <tbody>
                <tr style={{ background: '#f8fafc' }}>
                  <td colSpan={leadColumns} style={{ ...td, fontWeight: 600, color: '#1e293b' }}>Beginning balance</td>
                  <td style={tdRight} />
                  <td style={tdRight} />
                  <td style={{ ...tdRight, fontWeight: 600, color: '#1e293b' }}>{money(register.beginningBalance)}</td>
                </tr>
                {register.transactions.length === 0 && (
                  <tr>
                    <td colSpan={leadColumns + 3} style={{ ...td, color: '#64748b' }}>No transactions in this period.</td>
                  </tr>
                )}
                {register.transactions.map((txn, index) => (
                  <tr key={`${txn.date}-${index}`}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{formatDateKey(txn.date)}</td>
                    {showAccountColumn && <td style={td}>{txn.accountName}</td>}
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{txn.type}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{txn.num}</td>
                    <td style={td}>{txn.description}</td>
                    <td style={tdRight}>{txn.amount >= 0 ? money(txn.amount) : ''}</td>
                    <td style={tdRight}>{txn.amount < 0 ? money(-txn.amount) : ''}</td>
                    <td style={tdRight}>{money(txn.balance)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#dbeafe' }}>
                  <td colSpan={leadColumns} style={{ ...td, fontWeight: 700, color: '#1e40af' }}>Totals / ending balance</td>
                  <td style={{ ...tdRight, fontWeight: 700, color: '#1e40af' }}>{money(register.totalDeposits)}</td>
                  <td style={{ ...tdRight, fontWeight: 700, color: '#1e40af' }}>{money(register.totalWithdrawals)}</td>
                  <td style={{ ...tdRight, fontWeight: 700, color: '#1e40af' }}>{money(register.endingBalance)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#64748b' }}>
            Every General Ledger posting to the selected bank account(s) on its actual transaction date. The ending balance is the balance at the close of {formatDateKey(register.endDate)}.
          </div>
        </>
      )}
    </div>
  );
}
