'use client';

import { useEffect, useState } from 'react';
import { MATCH_RULE_LABELS, OUTSTANDING_RULE, TRANSACTION_EXCEPTION_TYPES } from '@/lib/cash-proof/transaction-match';
import {
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  TRANSACTION_EXCEPTION_STATUS_LABELS,
  fetchTransactionMatchDetail,
  formatMonthLabel,
  type CashProofResponse,
  type TransactionMatchDetail,
} from './cashProofClient';
import { buttonStyle, inputStyle, tdStyle, thStyle } from './cashProofStyles';

type Money = (value: number | null | undefined) => string;
type Tab = 'matched' | 'reconciling' | 'exceptions';

const displayDate = (date: string | null | undefined) =>
  date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}/${date.slice(0, 4)}` : '';

export default function CashProofTransactionDrilldown({
  data,
  money,
  months,
  view,
  onView,
}: {
  data: CashProofResponse;
  money: Money;
  /** Months offered in the month picker (the exceptions list's From/To range). */
  months: string[];
  view: { accountId: string; month: string } | null;
  onView: (view: { accountId: string; month: string } | null) => void;
}) {
  const included = data.accounts.filter((a) => a.included);
  const [accountId, setAccountId] = useState(view?.accountId || included[0]?.id || '');
  const [month, setMonth] = useState(view?.month || months[months.length - 1] || '');
  const monthOptions = month && !months.includes(month) ? [...months, month].sort() : months;
  const [tab, setTab] = useState<Tab>('matched');
  const [result, setResult] = useState<{ key: string; detail?: TransactionMatchDetail; error?: string } | null>(null);
  const runAt = data.transactionMatch?.runAt;
  const requestKey = view ? `${view.accountId}|${view.month}|${runAt}` : null;
  const current = result && result.key === requestKey ? result : null;
  const detail = current?.detail ?? null;
  const error = current?.error ?? null;
  const loading = Boolean(requestKey) && !current;

  useEffect(() => {
    if (!view || !requestKey) return;
    let cancelled = false;
    fetchTransactionMatchDetail(data.companyId, view.accountId, view.month)
      .then((json) => {
        if (!cancelled) setResult({ key: requestKey, detail: json });
      })
      .catch((e) => {
        if (!cancelled) setResult({ key: requestKey, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [data.companyId, view, requestKey]);

  const matches = detail?.matches || [];
  const matched = matches.filter((m) => !m.isReconcilingItem);
  const reconciling = matches.filter((m) => m.isReconcilingItem);
  const exceptions = view
    ? data.transactionExceptions.filter((e) => e.bankAccountId === view.accountId && e.month === view.month)
    : [];
  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'matched', label: 'Matched', count: matched.length },
    { key: 'reconciling', label: 'Reconciling Items', count: reconciling.length },
    { key: 'exceptions', label: 'Exceptions', count: exceptions.length },
  ];
  const stack = (values: Array<string | number>) => (
    <div style={{ display: 'grid', gap: '2px' }}>
      {values.map((v, i) => (
        <div key={i}>{v === '' ? '\u00a0' : v}</div>
      ))}
    </div>
  );

  return (
    <div style={{ marginTop: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginRight: '4px' }}>Account-Month Transactions</div>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ ...inputStyle, width: 220 }}>
          {included.map((a) => (
            <option key={a.id} value={a.id}>
              {a.accountName}
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={{ ...inputStyle, width: 130 }}>
          {[...monthOptions].reverse().map((m) => (
            <option key={m} value={m}>
              {formatMonthLabel(m)}
            </option>
          ))}
        </select>
        <button style={buttonStyle('secondary', !accountId || !month)} disabled={!accountId || !month} onClick={() => onView({ accountId, month })}>
          View Transactions
        </button>
        {view && (
          <button style={buttonStyle()} onClick={() => onView(null)}>
            Close
          </button>
        )}
      </div>

      {view && (
        <>
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                style={{
                  ...buttonStyle(tab === t.key ? 'primary' : 'secondary'),
                  padding: '4px 10px',
                }}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>
          {loading && <div style={{ fontSize: '12px', color: '#64748b', padding: '10px 0' }}>Loading transactions…</div>}
          {error && <div style={{ fontSize: '12px', color: '#b91c1c', padding: '10px 0' }}>{error}</div>}

          {!loading && !error && tab !== 'exceptions' && (
            <div style={{ overflow: 'auto', maxHeight: 480, border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '8px' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Date</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Type</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Num</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Name / Memo</th>
                    <th style={thStyle}>Book Amount</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Bank Date</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Bank Description</th>
                    <th style={thStyle}>Bank Amount</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Matched By</th>
                  </tr>
                </thead>
                <tbody>
                  {(tab === 'matched' ? matched : reconciling).length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ ...tdStyle, textAlign: 'left', color: '#64748b' }}>
                        {tab === 'matched' ? 'No matched transactions in this month.' : 'No reconciling items in this month.'}
                      </td>
                    </tr>
                  )}
                  {(tab === 'matched' ? matched : reconciling).map((m) => (
                    <tr key={m.id} style={{ verticalAlign: 'top' }}>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>{stack(m.book.map((b) => displayDate(b.date)))}</td>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>{stack(m.book.map((b) => b.type))}</td>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>{stack(m.book.map((b) => b.num))}</td>
                      <td style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'normal', minWidth: 200 }}>{stack(m.book.map((b) => b.name))}</td>
                      <td style={tdStyle}>{stack(m.book.map((b) => money(b.amount)))}</td>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>{m.bank.length ? stack(m.bank.map((b) => displayDate(b.date))) : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'normal', minWidth: 200 }}>
                        {m.bank.length ? stack(m.bank.map((b) => b.description)) : 'Not cleared yet'}
                      </td>
                      <td style={tdStyle}>{m.bank.length ? stack(m.bank.map((b) => money(b.amount))) : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>
                        {MATCH_RULE_LABELS[m.rule as keyof typeof MATCH_RULE_LABELS] || m.rule}
                        {m.rule !== OUTSTANDING_RULE && m.dayGap > 0 && (
                          <div style={{ fontSize: '10px', color: '#64748b' }}>
                            {m.dayGap} day{m.dayGap === 1 ? '' : 's'} apart
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && tab === 'exceptions' && (
            <div style={{ overflow: 'auto', maxHeight: 480, border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '8px' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Severity</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Exception</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Date</th>
                    <th style={thStyle}>Amount</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Detail</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ ...tdStyle, textAlign: 'left', color: '#64748b' }}>
                        No exceptions in this month.
                      </td>
                    </tr>
                  )}
                  {exceptions.map((e) => (
                    <tr key={e.id}>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '1px 6px',
                            borderRadius: '999px',
                            fontSize: '10px',
                            fontWeight: 700,
                            background: SEVERITY_COLORS[e.severity].bg,
                            color: SEVERITY_COLORS[e.severity].fg,
                            border: `1px solid ${SEVERITY_COLORS[e.severity].border}`,
                          }}
                        >
                          {SEVERITY_LABELS[e.severity]}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>{TRANSACTION_EXCEPTION_TYPES[e.type]?.label || e.type}</td>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>{displayDate(e.date) || '—'}</td>
                      <td style={tdStyle}>{money(e.amount)}</td>
                      <td style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'normal', minWidth: 320 }}>{e.description}</td>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>{TRANSACTION_EXCEPTION_STATUS_LABELS[e.status]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
