'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExportPreviewResponse } from '@/lib/bank-statements/export-review';
import type { ColumnRole, TransactionFileMapping } from '@/lib/bank-statements/transaction-file';
import { formatMonthLabel } from '../valuation/cashProofClient';
import { buttonStyle, inputStyle, tdStyle, thStyle } from '../valuation/cashProofStyles';

type CashProofAccount = { id: string; accountName: string; bankName: string | null; accountLast4: string | null };
type AccountEntry = { bankAccountId: string; bankName: string; last4: string };

const ROLE_LABELS: Record<ColumnRole, string> = {
  date: 'Date',
  description: 'Description',
  amount: 'Amount',
  debit: 'Withdrawals (Debit)',
  credit: 'Deposits (Credit)',
  checkNumber: 'Check Number',
  account: 'Account',
  balance: 'Balance',
};
const ROLES: ColumnRole[] = ['date', 'description', 'amount', 'debit', 'credit', 'checkNumber', 'account', 'balance'];

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

async function postPreview(companyId: string, documentId: string, body: { sheet?: string | null; mapping?: TransactionFileMapping | null }) {
  const res = await fetch(`/api/bank-statements/exports/${documentId}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Could not read the file (${res.status})`);
  return json as ExportPreviewResponse;
}

function defaultAccounts(preview: ExportPreviewResponse, cashProofAccounts: CashProofAccount[]): Record<string, AccountEntry> {
  const saved = new Map((preview.saved?.accounts ?? []).map((a) => [a.value, a]));
  return Object.fromEntries(
    preview.accounts.map((a) => {
      const prior = saved.get(a.value);
      const last4 = prior?.last4 ?? a.suggestedLast4 ?? preview.detectedLast4 ?? '';
      const match = last4 ? cashProofAccounts.filter((c) => c.accountLast4 === last4) : [];
      const account = cashProofAccounts.find((c) => c.id === prior?.bankAccountId) ?? (match.length === 1 ? match[0] : null);
      return [a.value, { bankAccountId: account?.id ?? '', bankName: prior?.bankName ?? account?.bankName ?? '', last4 }];
    }),
  );
}

function defaultRange(preview: ExportPreviewResponse): { from: string; to: string } {
  if (preview.saved?.fromMonth || preview.saved?.toMonth) return { from: preview.saved.fromMonth ?? '', to: preview.saved.toMonth ?? '' };
  const full = preview.months.filter((m) => !m.partial).map((m) => m.month).sort();
  return { from: full[0] ?? '', to: full[full.length - 1] ?? '' };
}

/** Corelytics team review of a client CSV / Excel transaction file: confirm columns and accounts, then accept or reject. */
export default function ExportReviewPanel({
  companyId,
  documentId,
  cashProofAccounts,
  onDone,
  onClose,
}: {
  companyId: string;
  documentId: string;
  cashProofAccounts: CashProofAccount[];
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<ExportPreviewResponse | null>(null);
  const [accounts, setAccounts] = useState<Record<string, AccountEntry>>({});
  const [range, setRange] = useState({ from: '', to: '' });
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const apply = (next: ExportPreviewResponse, resetDefaults: boolean) => {
    setPreview(next);
    setAccounts((prev) => {
      const defaults = defaultAccounts(next, cashProofAccounts);
      return resetDefaults ? defaults : Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, prev[k] ?? v]));
    });
    if (resetDefaults) setRange(defaultRange(next));
  };

  useEffect(() => {
    let cancelled = false;
    postPreview(companyId, documentId, {})
      .then((next) => {
        if (cancelled) return;
        setPreview(next);
        setAccounts(defaultAccounts(next, cashProofAccounts));
        setRange(defaultRange(next));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, documentId]);

  const chosenAccount = (entry: AccountEntry) => cashProofAccounts.find((c) => c.id === entry.bankAccountId) ?? null;
  /** Why an account entry cannot be accepted, or null when it can. */
  const entryProblem = (entry: AccountEntry): string | null => {
    if (!/^\d{4}$/.test(entry.last4.trim())) return 'Last 4 must be four digits.';
    if (!entry.bankName.trim()) return 'Enter the bank.';
    const chosen = chosenAccount(entry);
    if (chosen?.accountLast4 && chosen.accountLast4 !== entry.last4.trim()) {
      return `${chosen.accountName} is set to last 4 ${chosen.accountLast4}.`;
    }
    return null;
  };

  const refresh = async (body: { sheet?: string | null; mapping?: TransactionFileMapping | null }, resetDefaults = false) => {
    setBusy(true);
    try {
      apply(await postPreview(companyId, documentId, body), resetDefaults);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const setColumn = (role: ColumnRole, value: string) => {
    if (!preview) return;
    const columns = { ...preview.mapping.columns };
    if (value === '') delete columns[role];
    else columns[role] = Number(value);
    if (role === 'amount' && value !== '') {
      delete columns.debit;
      delete columns.credit;
    }
    if ((role === 'debit' || role === 'credit') && value !== '') delete columns.amount;
    void refresh({ mapping: { ...preview.mapping, columns } });
  };

  const monthOptions = useMemo(() => [...new Set((preview?.months ?? []).map((m) => m.month))].sort(), [preview]);
  const keptAccounts = Object.entries(accounts).filter(([, a]) => a.last4.trim());
  const accountProblems = keptAccounts.some(([, a]) => entryProblem(a) !== null);
  const acceptBlocker = !preview
    ? null
    : preview.issues.length > 0
      ? 'Fix the column issues above first.'
      : keptAccounts.length === 0
        ? 'Choose the Cash Proof account and enter the bank and last 4 under Bank Account above.'
        : accountProblems
          ? 'Enter the bank and a four-digit last 4 for each account.'
          : null;
  const canAccept = Boolean(preview) && !busy && !acceptBlocker;

  const submit = async (action: 'accept' | 'reject') => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/bank-statements/exports/${documentId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'reject'
            ? { companyId, action, note }
            : {
                companyId,
                action,
                mapping: preview.mapping,
                accounts: keptAccounts.map(([value, a]) => ({
                  value,
                  last4: a.last4.trim(),
                  bankName: a.bankName.trim(),
                  name: chosenAccount(a)?.accountName ?? null,
                  bankAccountId: a.bankAccountId || null,
                })),
                fromMonth: range.from || null,
                toMonth: range.to || null,
              },
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `The review could not be saved (${res.status})`);
      onDone(
        action === 'reject'
          ? `Returned ${preview.fileName} to the client.`
          : `Accepted ${preview.fileName}: ${Number(json.transactions).toLocaleString('en-US')} transactions, ${json.accountMonths} account-months.${
              json.readStatements ? ' Read Statements and Match Transactions ran on the Cash Proof.' : ''
            }`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (!preview) {
    return (
      <div
        ref={panelRef}
        style={{
          marginTop: '10px',
          border: `1px solid ${error ? '#fca5a5' : '#e2e8f0'}`,
          background: error ? '#fef2f2' : '#f8fafc',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '13px',
          color: error ? '#b91c1c' : '#475569',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span>{error ? `Could not open the review: ${error}` : 'Reading the file… a full year of transactions can take a minute.'}</span>
        <button style={buttonStyle()} onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  const label = { fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '2px' } as const;
  const headerOptions = preview.headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }));
  const hasAccountColumn = preview.mapping.columns.account !== undefined;

  return (
    <div ref={panelRef} style={{ marginTop: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>
          Review {preview.fileName}
          {preview.rememberedLayout && (
            <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 400, color: '#047857' }}>
              Columns filled from an earlier file with the same layout.
            </span>
          )}
        </div>
        <button style={buttonStyle()} onClick={onClose} disabled={busy}>
          Close
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
        {preview.sheets.length > 1 && (
          <div>
            <div style={label}>Sheet</div>
            <select style={inputStyle} value={preview.sheet ?? ''} disabled={busy} onChange={(e) => void refresh({ sheet: e.target.value }, true)}>
              {preview.sheets.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <div style={label}>Header Row</div>
          <input
            type="number"
            min={1}
            style={inputStyle}
            defaultValue={preview.mapping.headerRow + 1}
            key={`${preview.sheet}-${preview.mapping.headerRow}`}
            disabled={busy}
            onBlur={(e) => {
              const row = Math.max(1, Math.floor(Number(e.target.value) || 1)) - 1;
              if (row !== preview.mapping.headerRow) void refresh({ mapping: { ...preview.mapping, headerRow: row, columns: {} } });
            }}
          />
        </div>
        {ROLES.map((role) => (
          <div key={role}>
            <div style={label}>{ROLE_LABELS[role]}</div>
            <select
              style={inputStyle}
              value={preview.mapping.columns[role] === undefined ? '' : String(preview.mapping.columns[role])}
              disabled={busy}
              onChange={(e) => setColumn(role, e.target.value)}
            >
              <option value="">—</option>
              {headerOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        {preview.mapping.columns.amount !== undefined && (
          <div>
            <div style={label}>Amount Sign</div>
            <select
              style={inputStyle}
              value={preview.mapping.depositsPositive ? 'deposits' : 'withdrawals'}
              disabled={busy}
              onChange={(e) => void refresh({ mapping: { ...preview.mapping, depositsPositive: e.target.value === 'deposits' } })}
            >
              <option value="deposits">Deposits are positive</option>
              <option value="withdrawals">Withdrawals are positive</option>
            </select>
          </div>
        )}
      </div>

      {preview.issues.length > 0 && <div style={{ fontSize: '12px', color: '#b91c1c' }}>{preview.issues.join(' ')}</div>}

      {preview.transactions.length > 0 && (
        <div>
          <div style={{ ...label, marginBottom: '4px' }}>
            First transactions as read ({preview.totals.transactions.toLocaleString('en-US')} total
            {preview.totals.skippedRows > 0 ? `; ${preview.totals.skippedRows} rows without a date or amount skipped` : ''})
          </div>
          <div style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Date</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Description</th>
                  {hasAccountColumn && <th style={{ ...thStyle, textAlign: 'left' }}>Account</th>}
                  <th style={thStyle}>Deposit</th>
                  <th style={thStyle}>Withdrawal</th>
                </tr>
              </thead>
              <tbody>
                {preview.transactions.map((t) => (
                  <tr key={t.rowIndex}>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>{t.date}</td>
                    <td style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'normal' }}>{t.description || '—'}</td>
                    {hasAccountColumn && <td style={{ ...tdStyle, textAlign: 'left' }}>{t.account || '—'}</td>}
                    <td style={tdStyle}>{t.amount > 0 ? money(t.amount) : ''}</td>
                    <td style={tdStyle}>{t.amount < 0 ? money(-t.amount) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {preview.accounts.length > 0 && (
        <div>
          <div style={{ ...label, marginBottom: '4px' }}>
            Bank Account{preview.accounts.length > 1 ? 's (leave Last 4 blank to skip an account)' : ''}
          </div>
          <div style={{ display: 'grid', gap: '6px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(180px, 1.5fr) minmax(140px, 1fr) 80px', gap: '8px' }}>
              <div style={label}>In File</div>
              <div style={label}>Cash Proof Account</div>
              <div style={label}>Bank</div>
              <div style={label}>Last 4</div>
            </div>
            {preview.accounts.map((a) => {
              const entry = accounts[a.value] ?? { bankAccountId: '', bankName: '', last4: '' };
              const update = (patch: Partial<AccountEntry>) => setAccounts((prev) => ({ ...prev, [a.value]: { ...entry, ...patch } }));
              const chosen = chosenAccount(entry);
              const problem = entry.last4.trim() ? entryProblem(entry) : null;
              return (
                <div key={a.value}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) minmax(180px, 1.5fr) minmax(140px, 1fr) 80px', gap: '8px', alignItems: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#334155' }}>
                      {a.value || 'All rows'} <span style={{ color: '#64748b' }}>({a.count.toLocaleString('en-US')})</span>
                    </div>
                    <select
                      style={inputStyle}
                      value={entry.bankAccountId}
                      onChange={(e) => {
                        const next = cashProofAccounts.find((c) => c.id === e.target.value);
                        update({
                          bankAccountId: e.target.value,
                          ...(next?.bankName ? { bankName: next.bankName } : {}),
                          ...(next?.accountLast4 ? { last4: next.accountLast4 } : {}),
                        });
                      }}
                    >
                      <option value="">Not in the Cash Proof</option>
                      {cashProofAccounts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.accountName}
                          {c.accountLast4 ? ` · x${c.accountLast4}` : ''}
                        </option>
                      ))}
                    </select>
                    <input style={inputStyle} placeholder="Bank" value={entry.bankName} onChange={(e) => update({ bankName: e.target.value })} />
                    <input
                      style={inputStyle}
                      placeholder="Last 4"
                      maxLength={4}
                      value={entry.last4}
                      onChange={(e) => update({ last4: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
                  <div style={{ fontSize: '10px', color: problem ? '#b45309' : '#047857', marginTop: '2px' }}>
                    {problem ??
                      (chosen && !chosen.accountLast4 && entry.last4.length === 4
                        ? `${chosen.accountName} will be set to ${entry.bankName.trim()} x${entry.last4} in the Cash Proof.`
                        : chosen
                          ? `Feeds ${chosen.accountName} in the Cash Proof.`
                          : entry.last4.length === 4
                            ? cashProofAccounts.some((c) => c.accountLast4 === entry.last4)
                              ? `Feeds ${cashProofAccounts.find((c) => c.accountLast4 === entry.last4)!.accountName} by last 4.`
                              : 'No Cash Proof account has this last 4; it will be listed as statements for an account not in the cash proof.'
                            : '')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {preview.months.length > 0 && (
        <div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '6px' }}>
            <div style={{ ...label, marginBottom: 0, flex: '1 1 200px' }}>
              Monthly totals. Partial months may be missing transactions at the start or end of the file.
            </div>
            <div>
              <div style={label}>From</div>
              <select style={inputStyle} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}>
                <option value="">First month</option>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={label}>To</div>
              <select style={inputStyle} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}>
                <option value="">Last month</option>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ overflow: 'auto', maxHeight: 280, border: '1px solid #e2e8f0', borderRadius: '6px' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr>
                  {hasAccountColumn && <th style={{ ...thStyle, textAlign: 'left' }}>Account</th>}
                  <th style={{ ...thStyle, textAlign: 'left' }}>Month</th>
                  <th style={thStyle}>Transactions</th>
                  <th style={thStyle}>Deposits</th>
                  <th style={thStyle}>Withdrawals</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {preview.months.map((m) => {
                  const included =
                    Boolean(accounts[m.account]?.last4.trim()) && (!range.from || m.month >= range.from) && (!range.to || m.month <= range.to);
                  return (
                    <tr key={`${m.account}|${m.month}`} style={{ opacity: included ? 1 : 0.45 }}>
                      {hasAccountColumn && <td style={{ ...tdStyle, textAlign: 'left' }}>{m.account || '—'}</td>}
                      <td style={{ ...tdStyle, textAlign: 'left' }}>{formatMonthLabel(m.month)}</td>
                      <td style={tdStyle}>{m.count.toLocaleString('en-US')}</td>
                      <td style={tdStyle}>{money(m.deposits)}</td>
                      <td style={tdStyle}>{money(m.withdrawals)}</td>
                      <td style={{ ...tdStyle, textAlign: 'left', color: '#b45309' }}>
                        {!included ? 'Not imported' : m.partial ? 'Partial month' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '13px', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '8px 10px' }}>
          Not saved: {error}
        </div>
      )}

      {rejecting ? (
        <div style={{ display: 'grid', gap: '6px' }}>
          <div style={label}>Tell the client what to upload instead</div>
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={note} onChange={(e) => setNote(e.target.value)} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={buttonStyle('primary', busy || !note.trim())} disabled={busy || !note.trim()} onClick={() => void submit('reject')}>
              Reject File
            </button>
            <button style={buttonStyle()} disabled={busy} onClick={() => setRejecting(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={buttonStyle('primary', !canAccept)} disabled={!canAccept} onClick={() => void submit('accept')}>
            {busy ? 'Saving…' : 'Accept and Import'}
          </button>
          <button style={buttonStyle()} disabled={busy} onClick={() => setRejecting(true)}>
            Reject
          </button>
          {busy && !rejecting ? (
            <span style={{ fontSize: '12px', color: '#475569' }}>
              Importing {preview.totals.transactions.toLocaleString('en-US')} transactions, then running Read Statements and Match
              Transactions. This can take a couple of minutes; keep this page open.
            </span>
          ) : (
            acceptBlocker && <span style={{ fontSize: '11px', color: '#b91c1c' }}>{acceptBlocker}</span>
          )}
        </div>
      )}
    </div>
  );
}
