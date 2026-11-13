'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEstDate, formatEstDateTime } from '@/lib/time/eastern';
import { SAMPLE_SELECTION_LABELS } from '@/lib/cash-proof/sampling';
import { SAMPLE_STATUS_LABELS } from '@/lib/cash-proof/tie-out';
import type { CashProofSampleView } from '@/lib/cash-proof/service';
import {
  STATUS_COLORS,
  fetchCashProof,
  formatMonthLabel,
  makeMoneyFormatter,
  postCashProof,
  type CashProofResponse,
} from './cashProofClient';
import { buttonStyle, cardStyle, inputStyle, stickyCol, tdStyle, thStyle } from './cashProofStyles';
import CashProofDepositsPanel from './CashProofDepositsPanel';
import CashProofStatementScanCard from './CashProofStatementScanCard';

const FISCAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type SampleDraft = {
  statementBeginning: string;
  statementDeposits: string;
  statementWithdrawals: string;
  statementEnding: string;
  reconcilingItems: string;
  dataRoomDocumentId: string;
  exceptionNote: string;
  resolutionNote: string;
};

const toDraftValue = (n: number | null) => (n === null || n === undefined ? '' : String(n));

function draftFromSample(s: CashProofSampleView): SampleDraft {
  return {
    statementBeginning: toDraftValue(s.statementBeginning),
    statementDeposits: toDraftValue(s.statementDeposits),
    statementWithdrawals: toDraftValue(s.statementWithdrawals),
    statementEnding: toDraftValue(s.statementEnding),
    reconcilingItems: toDraftValue(s.reconcilingItems),
    dataRoomDocumentId: s.dataRoomDocumentId || '',
    exceptionNote: s.exceptionNote || '',
    resolutionNote: s.resolutionNote || '',
  };
}

function StatusBadge({ status }: { status: CashProofSampleView['status'] }) {
  const c = STATUS_COLORS[status];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: 700,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
      }}
    >
      {SAMPLE_STATUS_LABELS[status]}
    </span>
  );
}

export default function CashProofWorkspace({ companyId }: { companyId: string | null }) {
  const [data, setData] = useState<CashProofResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(companyId));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fiscalYearEndMonth, setFiscalYearEndMonth] = useState(12);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SampleDraft | null>(null);
  const [editingBalance, setEditingBalance] = useState<{ accountId: string; month: string; value: string } | null>(null);
  const [newAccount, setNewAccount] = useState<{ accountName: string; bankName: string; accountLast4: string } | null>(null);
  const [addMonth, setAddMonth] = useState('');
  const samplePanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    fetchCashProof(companyId)
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const run = useCallback(
    async (label: string, body: Record<string, unknown>) => {
      if (!companyId) return false;
      setBusy(label);
      setError(null);
      try {
        setData(await postCashProof(companyId, body));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [companyId],
  );

  const money = useMemo(() => makeMoneyFormatter(data), [data]);
  const engagement = data?.engagement ?? null;
  const locked = engagement?.status === 'LOCKED';
  const canEdit = Boolean(data?.canEdit) && !locked;

  const samplesByCell = useMemo(() => {
    const map = new Map<string, CashProofSampleView>();
    for (const s of data?.samples || []) map.set(`${s.bankAccountId}|${s.month}`, s);
    return map;
  }, [data]);
  const sampledMonths = useMemo(() => new Set((data?.samples || []).map((s) => s.month)), [data]);
  const selectedSample = useMemo(
    () => (data?.samples || []).find((s) => s.id === selectedSampleId) || null,
    [data, selectedSampleId],
  );
  const selectedAccount = useMemo(
    () => (selectedSample ? data?.accounts.find((a) => a.id === selectedSample.bankAccountId) || null : null),
    [data, selectedSample],
  );

  const selectSample = (sample: CashProofSampleView | null) => {
    setSelectedSampleId(sample?.id ?? null);
    setDraft(sample ? draftFromSample(sample) : null);
  };

  const downloadRequestList = () => {
    if (!data) return;
    const rows = [['Bank', 'Account', 'Last 4', 'Statement Month', 'Used For', 'Status']];
    for (const account of data.accounts.filter((a) => a.included)) {
      for (const month of data.months) {
        const s = samplesByCell.get(`${account.id}|${month}`);
        rows.push([
          account.bankName || '',
          account.accountName,
          account.accountLast4 || '',
          formatMonthLabel(month),
          s ? `Balance tie-out (${SAMPLE_SELECTION_LABELS[s.selectionReason]}) and deposits` : 'Deposits',
          s ? SAMPLE_STATUS_LABELS[s.status] : account.deposits[month] ? 'Entered' : 'Requested',
        ]);
      }
    }
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bank Statement Request - ${formatEstDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveSample = async (extra: Record<string, unknown> = {}) => {
    if (!selectedSample || !draft || !engagement) return;
    await run('save-sample', {
      action: 'update-sample',
      engagementId: engagement.id,
      sampleId: selectedSample.id,
      ...draft,
      ...extra,
    });
  };

  if (!companyId) {
    return <div style={cardStyle}>Select a company to work on its cash proof.</div>;
  }

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1e293b', margin: 0 }}>Cash Proof</h2>
        <p style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0', lineHeight: 1.5 }}>
          SBA cash verification. Month-end book cash for each bank account comes from the accounting system, and a
          sample of months is tied to bank statements uploaded to the Data Room <strong>Bank Statements</strong> folder.
          Deposits from every statement are then reconciled to reported revenue. Read Statements fills in the figures from
          uploaded PDFs.
        </p>
      </div>
      {engagement && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            style={buttonStyle('secondary', !canEdit || !!busy)}
            disabled={!canEdit || !!busy}
            onClick={() => run('refresh', { action: 'refresh-book-balances', engagementId: engagement.id })}
          >
            {busy === 'refresh' ? 'Refreshing…' : 'Refresh Book Balances'}
          </button>
          <button
            style={buttonStyle('secondary', !canEdit || !!busy || !data?.bankStatementDocuments.length)}
            disabled={!canEdit || !!busy || !data?.bankStatementDocuments.length}
            title="Read every file in the Data Room Bank Statements folder and fill in figures that are still blank"
            onClick={() => run('scan', { action: 'scan-statements', engagementId: engagement.id })}
          >
            {busy === 'scan' ? `Reading ${data?.bankStatementDocuments.length ?? ''} statements…` : 'Read Statements'}
          </button>
          {data && data.samples.length === 0 ? (
            <button
              style={buttonStyle('primary', !canEdit || !!busy)}
              disabled={!canEdit || !!busy}
              onClick={() => run('sample', { action: 'generate-sample', engagementId: engagement.id })}
            >
              {busy === 'sample' ? 'Sampling…' : 'Generate Sample'}
            </button>
          ) : (
            <button
              style={buttonStyle('secondary', !canEdit || !!busy)}
              disabled={!canEdit || !!busy}
              onClick={() => run('expand', { action: 'expand-sample', engagementId: engagement.id })}
            >
              {busy === 'expand' ? 'Expanding…' : 'Expand Sample'}
            </button>
          )}
          <button
            style={buttonStyle('secondary', !data?.accounts.some((a) => a.included))}
            disabled={!data?.accounts.some((a) => a.included)}
            onClick={downloadRequestList}
          >
            Download Request List
          </button>
          {data?.canEdit && (
            <button
              style={buttonStyle(locked ? 'secondary' : 'primary', !!busy)}
              disabled={!!busy}
              onClick={() => run('lock', { action: locked ? 'unlock' : 'lock', engagementId: engagement.id })}
            >
              {locked ? 'Unlock' : 'Lock Cash Proof'}
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (loading && !data) {
    return (
      <div style={cardStyle}>
        {header}
        <div style={{ marginTop: '16px', fontSize: '13px', color: '#64748b' }}>Loading cash proof…</div>
      </div>
    );
  }

  if (!data && error) {
    return (
      <div style={cardStyle}>
        {header}
        <div style={{ marginTop: '12px', color: '#b91c1c', fontSize: '12px' }}>{error}</div>
      </div>
    );
  }

  if (!engagement) {
    return (
      <div style={cardStyle}>
        {header}
        {error && <div style={{ marginTop: '12px', color: '#b91c1c', fontSize: '12px' }}>{error}</div>}
        <div style={{ marginTop: '16px', padding: '16px', border: '1px dashed #cbd5e1', borderRadius: '8px', background: '#f8fafc' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b', marginBottom: '6px' }}>Start a cash proof</div>
          <div style={{ fontSize: '12px', color: '#475569', marginBottom: '12px', lineHeight: 1.5 }}>
            The review period covers the trailing 24 months
            {data?.latestFinancialMonth ? ` through ${formatMonthLabel(data.latestFinancialMonth)}` : ''}, extended to include
            the two most recent complete fiscal years. Accounts mapped to Cash are added automatically.
          </div>
          {data?.canEdit ? (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '12px', color: '#475569' }}>
                Fiscal year-end month
                <select
                  value={fiscalYearEndMonth}
                  onChange={(e) => setFiscalYearEndMonth(Number(e.target.value))}
                  style={{ ...inputStyle, marginTop: '4px', width: 160 }}
                >
                  {FISCAL_MONTHS.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                style={buttonStyle('primary', !!busy)}
                disabled={!!busy}
                onClick={() => run('create', { action: 'create', fiscalYearEndMonth })}
              >
                {busy === 'create' ? 'Pulling balances…' : 'Start Cash Proof'}
              </button>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#64748b' }}>Your consultant has not started the cash proof yet.</div>
          )}
        </div>
      </div>
    );
  }

  const months = data?.months || [];
  const accounts = data?.accounts || [];
  const summary = data!.summary;
  const outstanding = summary.requested + summary.received;
  const revenuePeriods = data?.revenueReconciliation?.periods || [];
  const docName = (id: string | null) =>
    (id && data?.bankStatementDocuments.find((d) => d.id === id)?.originalFileName) || null;

  const metricCards = [
    { label: 'Review Period', value: `${formatMonthLabel(engagement.periodStartMonth)} – ${formatMonthLabel(engagement.periodEndMonth)}` },
    { label: 'Bank Accounts', value: `${accounts.filter((a) => a.included).length} included` },
    { label: 'Sampled Months', value: `${summary.sampledMonths} (${summary.accountMonths} statements)` },
    { label: 'Tied / Cleared', value: `${summary.tied} / ${summary.cleared}` },
    { label: 'Exceptions', value: String(summary.exceptions), alert: summary.exceptions > 0 },
    { label: 'Outstanding', value: String(outstanding) },
    {
      label: 'Deposits to Revenue',
      value: `${revenuePeriods.filter((p) => p.status === 'RECONCILED' || p.status === 'EXPLAINED').length} of ${revenuePeriods.length} years`,
      alert: revenuePeriods.some((p) => p.status === 'VARIANCE'),
    },
  ];

  return (
    <>
      <div style={cardStyle}>
        {header}
        {error && <div style={{ marginTop: '12px', color: '#b91c1c', fontSize: '12px' }}>{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '10px', marginTop: '14px' }}>
          {metricCards.map((card) => (
            <div
              key={card.label}
              style={{
                border: `1px solid ${card.alert ? '#fca5a5' : '#e2e8f0'}`,
                background: card.alert ? '#fef2f2' : '#f8fafc',
                borderRadius: '8px',
                padding: '10px 12px',
              }}
            >
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>{card.label}</div>
              <div style={{ fontSize: '15px', color: card.alert ? '#b91c1c' : '#1e293b', fontWeight: 700, marginTop: '4px' }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '10px' }}>
          {engagement.sampledAt ? `Sample drawn ${formatEstDateTime(engagement.sampledAt)}. ` : 'No sample drawn yet. '}
          {locked && engagement.lockedAt ? `Locked ${formatEstDateTime(engagement.lockedAt)}. ` : ''}
          Tolerance {money(engagement.balanceTolerance)}. Fiscal year ends in {FISCAL_MONTHS[engagement.fiscalYearEndMonth - 1]}.
        </div>
      </div>

      <CashProofStatementScanCard data={data!} money={money} />

      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{ ...cardStyle, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Month-End Book Cash by Account</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              {canEdit && data!.samples.length > 0 && (
                <>
                  <select value={addMonth} onChange={(e) => setAddMonth(e.target.value)} style={{ ...inputStyle, width: 130 }}>
                    <option value="">Add month…</option>
                    {months
                      .filter((m) => !sampledMonths.has(m))
                      .map((m) => (
                        <option key={m} value={m}>
                          {formatMonthLabel(m)}
                        </option>
                      ))}
                  </select>
                  <button
                    style={buttonStyle('secondary', !addMonth || !!busy)}
                    disabled={!addMonth || !!busy}
                    onClick={async () => {
                      if (await run('add-month', { action: 'add-sample-month', engagementId: engagement.id, month: addMonth })) {
                        setAddMonth('');
                      }
                    }}
                  >
                    Add to Sample
                  </button>
                </>
              )}
              {canEdit && (
                <button style={buttonStyle()} onClick={() => setNewAccount({ accountName: '', bankName: '', accountLast4: '' })}>
                  Add Account
                </button>
              )}
            </div>
          </div>

          {newAccount && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '10px', flexWrap: 'wrap' }}>
              {(['accountName', 'bankName', 'accountLast4'] as const).map((field) => (
                <label key={field} style={{ fontSize: '11px', color: '#475569', flex: field === 'accountName' ? 2 : 1, minWidth: 120 }}>
                  {field === 'accountName' ? 'Account Name' : field === 'bankName' ? 'Bank' : 'Last 4'}
                  <input
                    value={newAccount[field]}
                    onChange={(e) => setNewAccount({ ...newAccount, [field]: e.target.value })}
                    style={{ ...inputStyle, marginTop: '4px' }}
                  />
                </label>
              ))}
              <button
                style={buttonStyle('primary', !newAccount.accountName.trim() || !!busy)}
                disabled={!newAccount.accountName.trim() || !!busy}
                onClick={async () => {
                  if (await run('add-account', { action: 'add-manual-account', engagementId: engagement.id, ...newAccount })) {
                    setNewAccount(null);
                  }
                }}
              >
                Save
              </button>
              <button style={buttonStyle()} onClick={() => setNewAccount(null)}>
                Cancel
              </button>
            </div>
          )}

          {accounts.length === 0 ? (
            <div style={{ fontSize: '12px', color: '#64748b', padding: '12px 0' }}>
              No accounts are mapped to Cash. Map the bank accounts to Cash in Account Mapping, then Refresh Book Balances, or
              add the accounts by hand.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, ...stickyCol(220), background: '#f8fafc' }}>Account</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Bank</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Last 4</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Include</th>
                    {months.map((m) => (
                      <th key={m} style={{ ...thStyle, color: sampledMonths.has(m) ? '#2751d0' : thStyle.color }}>
                        {formatMonthLabel(m)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} style={{ opacity: account.included ? 1 : 0.5 }}>
                      <td style={{ ...tdStyle, ...stickyCol(220), fontWeight: 600 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={account.accountName}>
                          {account.accountName}
                        </div>
                        {!account.included && account.exclusionReason && (
                          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 400, whiteSpace: 'normal' }}>
                            Excluded: {account.exclusionReason}
                          </div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>
                        <input
                          defaultValue={account.bankName || ''}
                          disabled={!canEdit}
                          placeholder="Bank"
                          onBlur={(e) => {
                            if ((e.target.value || '') !== (account.bankName || '')) {
                              void run('account', { action: 'update-account', engagementId: engagement.id, bankAccountId: account.id, bankName: e.target.value });
                            }
                          }}
                          style={{ ...inputStyle, width: 120 }}
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>
                        <input
                          defaultValue={account.accountLast4 || ''}
                          disabled={!canEdit}
                          placeholder="0000"
                          maxLength={4}
                          onBlur={(e) => {
                            if ((e.target.value || '') !== (account.accountLast4 || '')) {
                              void run('account', { action: 'update-account', engagementId: engagement.id, bankAccountId: account.id, accountLast4: e.target.value });
                            }
                          }}
                          style={{ ...inputStyle, width: 60 }}
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={account.included}
                          disabled={!canEdit || !!busy}
                          onChange={(e) => {
                            if (e.target.checked) {
                              void run('account', { action: 'update-account', engagementId: engagement.id, bankAccountId: account.id, included: true, exclusionReason: null });
                              return;
                            }
                            const reason = window.prompt('Why is this account excluded from the cash proof? (for example: closed, petty cash, clearing account)');
                            if (reason && reason.trim()) {
                              void run('account', { action: 'update-account', engagementId: engagement.id, bankAccountId: account.id, included: false, exclusionReason: reason });
                            }
                          }}
                        />
                      </td>
                      {months.map((m) => {
                        const balance = account.balances[m];
                        const sample = samplesByCell.get(`${account.id}|${m}`);
                        const isEditing = editingBalance?.accountId === account.id && editingBalance.month === m;
                        const isSelected = sample && sample.id === selectedSampleId;
                        return (
                          <td
                            key={m}
                            onClick={() => {
                              if (sample) selectSample(sample);
                            }}
                            onDoubleClick={() => {
                              if (canEdit) setEditingBalance({ accountId: account.id, month: m, value: balance ? String(balance.value) : '' });
                            }}
                            title={canEdit ? 'Double-click to enter the book balance by hand' : undefined}
                            style={{
                              ...tdStyle,
                              cursor: sample ? 'pointer' : canEdit ? 'text' : 'default',
                              background: sample ? STATUS_COLORS[sample.status].bg : undefined,
                              outline: isSelected ? '2px solid #2751d0' : undefined,
                              outlineOffset: '-2px',
                            }}
                          >
                            {isEditing ? (
                              <input
                                autoFocus
                                value={editingBalance.value}
                                onChange={(e) => setEditingBalance({ ...editingBalance, value: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') setEditingBalance(null);
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                }}
                                onBlur={async () => {
                                  const value = editingBalance.value.trim();
                                  setEditingBalance(null);
                                  if (value === (balance ? String(balance.value) : '')) return;
                                  await run('balance', {
                                    action: 'set-book-balance',
                                    engagementId: engagement.id,
                                    bankAccountId: account.id,
                                    month: m,
                                    endingBalance: value === '' ? null : value,
                                  });
                                }}
                                style={{ ...inputStyle, width: 100, textAlign: 'right' }}
                              />
                            ) : (
                              <>
                                <div style={{ fontStyle: balance?.source === 'manual' ? 'italic' : undefined }}>
                                  {balance ? money(balance.value) : '—'}
                                </div>
                                {sample && (
                                  <div style={{ marginTop: '2px' }}>
                                    <StatusBadge status={sample.status} />
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {[
                    { label: 'Total Book Cash', key: 'bookTotal' as const },
                    { label: 'Balance Sheet Cash', key: 'balanceSheetCash' as const },
                    { label: 'Difference', key: 'difference' as const },
                  ].map((row) => (
                    <tr key={row.key}>
                      <td
                        colSpan={4}
                        style={{ ...tdStyle, ...stickyCol(220), fontWeight: 700, background: '#f8fafc', borderTop: row.key === 'bookTotal' ? '2px solid #e2e8f0' : undefined }}
                      >
                        {row.label}
                      </td>
                      {months.map((m) => {
                        const value = data!.completeness[m]?.[row.key] ?? null;
                        const off = row.key === 'difference' && value !== null && Math.abs(value) > engagement.balanceTolerance;
                        return (
                          <td
                            key={m}
                            style={{
                              ...tdStyle,
                              fontWeight: 700,
                              background: '#f8fafc',
                              color: off ? '#b91c1c' : tdStyle.color,
                              borderTop: row.key === 'bookTotal' ? '2px solid #e2e8f0' : undefined,
                            }}
                          >
                            {money(value)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
            {(Object.keys(STATUS_COLORS) as Array<keyof typeof STATUS_COLORS>).map((status) => (
              <span key={status} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <StatusBadge status={status} />
              </span>
            ))}
            <span>Italic balances were entered by hand. Click a sampled month to tie it out.</span>
          </div>
        </div>

        {selectedSample && selectedAccount && draft && (
          <div ref={samplePanelRef} style={{ ...cardStyle, width: 340, flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{selectedAccount.accountName}</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  {formatMonthLabel(selectedSample.month)} · {SAMPLE_SELECTION_LABELS[selectedSample.selectionReason]}
                </div>
              </div>
              <button style={{ ...buttonStyle(), padding: '2px 8px' }} onClick={() => selectSample(null)} aria-label="Close">
                ×
              </button>
            </div>
            <div style={{ marginTop: '8px' }}>
              <StatusBadge status={selectedSample.status} />
            </div>

            <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginTop: '12px' }}>
              Bank statement (Data Room)
              <select
                value={draft.dataRoomDocumentId}
                disabled={!canEdit}
                onChange={(e) => setDraft({ ...draft, dataRoomDocumentId: e.target.value })}
                style={{ ...inputStyle, marginTop: '4px' }}
              >
                <option value="">Not linked</option>
                {data!.bankStatementDocuments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.originalFileName}
                  </option>
                ))}
              </select>
            </label>
            {data!.bankStatementDocuments.length === 0 && (
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                No files in the Data Room Bank Statements folder yet.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
              {(
                [
                  ['statementBeginning', 'Beginning Balance'],
                  ['statementDeposits', 'Deposits'],
                  ['statementWithdrawals', 'Withdrawals'],
                  ['statementEnding', 'Ending Balance'],
                  ['reconcilingItems', 'Reconciling Items'],
                ] as const
              ).map(([field, label]) => (
                <label key={field} style={{ fontSize: '11px', color: '#475569' }}>
                  {label}
                  <input
                    value={draft[field]}
                    disabled={!canEdit}
                    inputMode="decimal"
                    onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                    style={{ ...inputStyle, marginTop: '4px', textAlign: 'right' }}
                  />
                </label>
              ))}
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
              Reconciling items: outstanding checks as negative, deposits in transit as positive.
            </div>

            <div style={{ marginTop: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              {[
                ['Book balance', money(selectedSample.tieOut.bookBalance)],
                ['Adjusted bank balance', money(selectedSample.tieOut.adjustedBankBalance)],
                ['Difference', money(selectedSample.tieOut.difference)],
                [
                  'Statement foots',
                  selectedSample.tieOut.statementFoots === null
                    ? '—'
                    : selectedSample.tieOut.statementFoots
                      ? 'Yes'
                      : `No (off ${money(selectedSample.tieOut.footDifference)})`,
                ],
                [
                  'Continuity with prior month',
                  selectedSample.tieOut.continuityOk === null
                    ? 'Prior month not sampled'
                    : selectedSample.tieOut.continuityOk
                      ? 'Yes'
                      : `No (off ${money(selectedSample.tieOut.continuityDifference)})`,
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: '12px', borderBottom: '1px solid #f1f5f9' }}
                >
                  <span style={{ color: '#64748b' }}>{label}</span>
                  <span style={{ fontWeight: 600, color: '#1e293b' }}>{value}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px' }}>
              Saved values. Save to recalculate after editing.
            </div>

            <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginTop: '12px' }}>
              Exception note
              <textarea
                value={draft.exceptionNote}
                disabled={!canEdit}
                rows={2}
                onChange={(e) => setDraft({ ...draft, exceptionNote: e.target.value })}
                style={{ ...inputStyle, marginTop: '4px', resize: 'vertical' }}
              />
            </label>
            {(selectedSample.status === 'EXCEPTION' || selectedSample.status === 'CLEARED') && (
              <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginTop: '8px' }}>
                Resolution note
                <textarea
                  value={draft.resolutionNote}
                  disabled={!canEdit}
                  rows={2}
                  onChange={(e) => setDraft({ ...draft, resolutionNote: e.target.value })}
                  style={{ ...inputStyle, marginTop: '4px', resize: 'vertical' }}
                />
              </label>
            )}
            {selectedSample.resolvedAt && (
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                Cleared {formatEstDateTime(selectedSample.resolvedAt)}
              </div>
            )}
            {selectedSample.enteredAt && (
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                Statement entered {formatEstDateTime(selectedSample.enteredAt)}
              </div>
            )}

            {canEdit && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                <button style={buttonStyle('primary', !!busy)} disabled={!!busy} onClick={() => saveSample()}>
                  {busy === 'save-sample' ? 'Saving…' : 'Save'}
                </button>
                {selectedSample.status === 'EXCEPTION' && (
                  <button
                    style={buttonStyle('secondary', !!busy || !draft.resolutionNote.trim())}
                    disabled={!!busy || !draft.resolutionNote.trim()}
                    onClick={() => saveSample({ clear: true })}
                  >
                    Clear Exception
                  </button>
                )}
                {selectedSample.status === 'CLEARED' && (
                  <button style={buttonStyle('secondary', !!busy)} disabled={!!busy} onClick={() => saveSample({ clear: false })}>
                    Reopen Exception
                  </button>
                )}
              </div>
            )}
            {docName(selectedSample.dataRoomDocumentId) && (
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
                Linked: {docName(selectedSample.dataRoomDocumentId)}
              </div>
            )}
          </div>
        )}
      </div>

      <CashProofDepositsPanel
        data={data!}
        canEdit={canEdit}
        busy={busy}
        run={run}
        money={money}
        onSelectSample={(sample) => {
          selectSample(sample);
          requestAnimationFrame(() => samplePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        }}
      />
    </>
  );
}
