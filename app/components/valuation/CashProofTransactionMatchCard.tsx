'use client';

import { useMemo, useState } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import { SEVERITY_ORDER, TRANSACTION_EXCEPTION_TYPES, type TransactionExceptionSeverity } from '@/lib/cash-proof/transaction-match';
import type { CashProofTransactionExceptionView, TransactionExceptionStatus } from '@/lib/cash-proof/service';
import {
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  TRANSACTION_EXCEPTION_STATUS_LABELS,
  formatMonthLabel,
  type CashProofResponse,
} from './cashProofClient';
import { buttonStyle, cardStyle, inputStyle, tdStyle, thStyle } from './cashProofStyles';
import CashProofTransactionDrilldown from './CashProofTransactionDrilldown';

type Money = (value: number | null | undefined) => string;
type Run = (label: string, body: Record<string, unknown>) => Promise<boolean>;
type StatusFilter = TransactionExceptionStatus | 'ALL';

const pill = (c: { bg: string; fg: string; border: string }) => ({
  padding: '1px 8px',
  borderRadius: '999px',
  fontSize: '11px',
  fontWeight: 700,
  background: c.bg,
  color: c.fg,
  border: `1px solid ${c.border}`,
  whiteSpace: 'nowrap' as const,
});

const displayDate = (date: string | null) => (date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}/${date.slice(0, 4)}` : '—');

export default function CashProofTransactionMatchCard({
  data,
  money,
  canEdit,
  busy,
  run,
  view,
  onView,
}: {
  data: CashProofResponse;
  money: Money;
  canEdit: boolean;
  busy: string | null;
  run: Run;
  view: { accountId: string; month: string } | null;
  onView: (view: { accountId: string; month: string } | null) => void;
}) {
  const match = data.transactionMatch;
  const engagement = data.engagement;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN');
  const [severityFilter, setSeverityFilter] = useState<TransactionExceptionSeverity | ''>('');
  const [accountFilter, setAccountFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [bulkNote, setBulkNote] = useState('');

  const accountName = (id: string | null) => (id ? data.accounts.find((a) => a.id === id)?.accountName || '—' : 'Not in the books');
  const exceptions = data.transactionExceptions;
  const rows = useMemo(
    () =>
      exceptions.filter(
        (e) =>
          (statusFilter === 'ALL' || e.status === statusFilter) &&
          (!severityFilter || e.severity === severityFilter) &&
          (!accountFilter || (e.bankAccountId || '') === accountFilter),
      ),
    [exceptions, statusFilter, severityFilter, accountFilter],
  );
  if (!match || !engagement) return null;

  const open = exceptions.filter((e) => e.status === 'OPEN');
  const openBySeverity = new Map<TransactionExceptionSeverity, number>();
  for (const e of open) openBySeverity.set(e.severity, (openBySeverity.get(e.severity) || 0) + 1);
  const matchedPct = match.totals.bankDollars > 0 ? (match.totals.matchedBankDollars / match.totals.bankDollars) * 100 : null;
  const selectableIds = rows.filter((e) => e.status === 'OPEN').map((e) => e.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
  const accountsWithSummary = match.accounts.filter((a) => data.accounts.some((x) => x.id === a.bankAccountId && x.included));

  const saveException = async (e: CashProofTransactionExceptionView, clear?: boolean) => {
    await run(`tx-${e.id}`, {
      action: 'update-transaction-exception',
      engagementId: engagement.id,
      exceptionId: e.id,
      resolutionNote: notes[e.id] ?? e.resolutionNote ?? '',
      ...(clear === undefined ? {} : { clear }),
    });
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Book-to-Bank Matching</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', lineHeight: 1.5 }}>
            Matched {formatEstDateTime(match.runAt)}. {match.totals.matchedBankLines.toLocaleString()} of{' '}
            {match.totals.bankLines.toLocaleString()} bank transactions matched to the books
            {matchedPct !== null ? ` (${matchedPct.toFixed(1)}% of bank dollars)` : ''}. Line-level bank data covers{' '}
            {match.totals.lineLevelAccountMonths} account-month{match.totals.lineLevelAccountMonths === 1 ? '' : 's'}; statement totals were
            tested for {match.totals.totalsTestedAccountMonths} more.
            {match.totals.reconcilingItemsFilled > 0
              ? ` Filled in reconciling items on ${match.totals.reconcilingItemsFilled} sampled statement${match.totals.reconcilingItemsFilled === 1 ? '' : 's'}.`
              : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {SEVERITY_ORDER.filter((s) => openBySeverity.get(s)).map((s) => (
            <span key={s} style={pill(SEVERITY_COLORS[s])}>
              {SEVERITY_LABELS[s]} {openBySeverity.get(s)}
            </span>
          ))}
          {open.length === 0 && <span style={{ fontSize: '12px', color: '#047857', fontWeight: 600 }}>No open exceptions</span>}
        </div>
      </div>

      {accountsWithSummary.length > 0 && (
        <div style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '10px' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>Account</th>
                <th style={thStyle}>Months With Bank Detail</th>
                <th style={thStyle}>Bank Transactions</th>
                <th style={thStyle}>Matched</th>
                <th style={thStyle}>Bank Dollars Matched</th>
                <th style={thStyle}>Not Yet Cleared</th>
                <th style={thStyle}>Months Totals-Tested</th>
              </tr>
            </thead>
            <tbody>
              {accountsWithSummary.map((a) => (
                <tr key={a.bankAccountId}>
                  <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600 }}>{accountName(a.bankAccountId)}</td>
                  <td style={tdStyle}>{a.bankMonths.length}</td>
                  <td style={tdStyle}>{a.bankLines.toLocaleString()}</td>
                  <td style={tdStyle}>{a.matchedBankLines.toLocaleString()}</td>
                  <td style={tdStyle}>{a.bankDollars > 0 ? `${((a.matchedBankDollars / a.bankDollars) * 100).toFixed(1)}%` : '—'}</td>
                  <td style={tdStyle}>{a.outstandingBookLines.toLocaleString()}</td>
                  <td style={tdStyle}>{a.totalsTestedMonths}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginRight: '4px' }}>Transaction Exceptions</div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} style={{ ...inputStyle, width: 150 }}>
          {(['OPEN', 'CLEARED', 'AUTO_RESOLVED'] as const).map((s) => (
            <option key={s} value={s}>
              {TRANSACTION_EXCEPTION_STATUS_LABELS[s]} ({exceptions.filter((e) => e.status === s).length})
            </option>
          ))}
          <option value="ALL">All ({exceptions.length})</option>
        </select>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as TransactionExceptionSeverity | '')} style={{ ...inputStyle, width: 130 }}>
          <option value="">All severities</option>
          {SEVERITY_ORDER.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABELS[s]}
            </option>
          ))}
        </select>
        <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} style={{ ...inputStyle, width: 200 }}>
          <option value="">All accounts</option>
          {data.accounts
            .filter((a) => a.included)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.accountName}
              </option>
            ))}
        </select>
        {canEdit && selected.size > 0 && (
          <>
            <input
              value={bulkNote}
              onChange={(e) => setBulkNote(e.target.value)}
              placeholder={`Resolution note for ${selected.size} selected`}
              style={{ ...inputStyle, width: 280 }}
            />
            <button
              style={buttonStyle('primary', !bulkNote.trim() || !!busy)}
              disabled={!bulkNote.trim() || !!busy}
              onClick={async () => {
                const ok = await run('tx-bulk', {
                  action: 'clear-transaction-exceptions',
                  engagementId: engagement.id,
                  exceptionIds: [...selected],
                  resolutionNote: bulkNote,
                });
                if (ok) {
                  setSelected(new Set());
                  setBulkNote('');
                }
              }}
            >
              {busy === 'tx-bulk' ? 'Clearing…' : 'Clear Selected'}
            </button>
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#64748b', padding: '10px 0' }}>No exceptions match these filters.</div>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: 480, border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '8px' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                {canEdit && (
                  <th style={{ ...thStyle, textAlign: 'center', width: 28 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={selectableIds.length === 0}
                      onChange={(e) => setSelected(e.target.checked ? new Set(selectableIds) : new Set())}
                    />
                  </th>
                )}
                <th style={{ ...thStyle, textAlign: 'center' }}>Severity</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Exception</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Account</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Date</th>
                <th style={thStyle}>Amount</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Detail</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Resolution</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  {canEdit && (
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={selected.has(e.id)}
                        disabled={e.status !== 'OPEN'}
                        onChange={(ev) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (ev.target.checked) next.add(e.id);
                            else next.delete(e.id);
                            return next;
                          })
                        }
                      />
                    </td>
                  )}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{ ...pill(SEVERITY_COLORS[e.severity]), fontSize: '10px', padding: '1px 6px' }}>{SEVERITY_LABELS[e.severity]}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>{TRANSACTION_EXCEPTION_TYPES[e.type]?.label || e.type}</td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>{accountName(e.bankAccountId)}</td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>
                    {e.bankAccountId && e.month ? (
                      <button
                        onClick={() => onView({ accountId: e.bankAccountId!, month: e.month! })}
                        title="View this account-month's transactions"
                        style={{ background: 'none', border: 'none', padding: 0, color: '#2751d0', cursor: 'pointer', fontSize: '12px' }}
                      >
                        {e.type === 'TOTALS_MISMATCH' || e.type === 'BANK_FEES_INTEREST' || e.type === 'RECON_CONFLICT'
                          ? formatMonthLabel(e.month)
                          : displayDate(e.date)}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={tdStyle}>{e.type === 'UNDISCLOSED_BANK_ACCOUNT' ? '—' : money(e.amount)}</td>
                  <td style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'normal', minWidth: 320 }}>{e.description}</td>
                  <td style={{ ...tdStyle, textAlign: 'left', minWidth: 260 }}>
                    {e.status === 'AUTO_RESOLVED' ? (
                      <span style={{ color: '#64748b', whiteSpace: 'normal' }}>{e.resolutionNote || TRANSACTION_EXCEPTION_STATUS_LABELS.AUTO_RESOLVED}</span>
                    ) : canEdit ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <input
                          value={notes[e.id] ?? e.resolutionNote ?? ''}
                          onChange={(ev) => setNotes({ ...notes, [e.id]: ev.target.value })}
                          placeholder="Resolution note"
                          style={{ ...inputStyle, minWidth: 160 }}
                        />
                        {e.status === 'OPEN' ? (
                          <button
                            style={{ ...buttonStyle('secondary', !!busy || !(notes[e.id] ?? e.resolutionNote ?? '').trim()), padding: '4px 8px' }}
                            disabled={!!busy || !(notes[e.id] ?? e.resolutionNote ?? '').trim()}
                            onClick={() => saveException(e, true)}
                          >
                            Clear
                          </button>
                        ) : (
                          <button style={{ ...buttonStyle('secondary', !!busy), padding: '4px 8px' }} disabled={!!busy} onClick={() => saveException(e, false)}>
                            Reopen
                          </button>
                        )}
                      </div>
                    ) : (
                      <span style={{ whiteSpace: 'normal' }}>{e.status === 'CLEARED' ? e.resolutionNote : 'Open'}</span>
                    )}
                    {e.status === 'CLEARED' && e.resolvedAt && (
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>Cleared {formatEstDateTime(e.resolvedAt)}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CashProofTransactionDrilldown
        key={view ? `${view.accountId}|${view.month}` : 'none'}
        data={data}
        money={money}
        view={view}
        onView={onView}
      />
    </div>
  );
}
