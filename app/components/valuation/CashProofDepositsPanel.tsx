'use client';

import { Fragment, useMemo, useState, type CSSProperties } from 'react';
import {
  REVENUE_ADJUSTMENT_CATEGORIES,
  REVENUE_ADJUSTMENT_CATEGORY_ORDER,
  REVENUE_STATUS_LABELS,
  type RevenueAdjustmentCategory,
  type RevenueReconciliationPeriod,
} from '@/lib/cash-proof/revenue-reconciliation';
import type { CashProofSampleView } from '@/lib/cash-proof/service';
import {
  REVENUE_STATUS_COLORS,
  formatMonthLabel,
  formatPercent,
  reconciliationRows,
  type CashProofResponse,
} from './cashProofClient';
import { buttonStyle, cardStyle, cardTitleStyle, inputStyle, stickyCol, tdStyle, thStyle } from './cashProofStyles';

type Money = (value: number | null | undefined) => string;
type Run = (label: string, body: Record<string, unknown>) => Promise<boolean>;

function RevenueStatusBadge({ status }: { status: RevenueReconciliationPeriod['status'] }) {
  const c = REVENUE_STATUS_COLORS[status];
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
      {REVENUE_STATUS_LABELS[status]}
    </span>
  );
}

const sectionHeading: CSSProperties = cardTitleStyle;
const NON_REVENUE_CATEGORIES = REVENUE_ADJUSTMENT_CATEGORY_ORDER.filter((c) => REVENUE_ADJUSTMENT_CATEGORIES[c].sign < 0);
const emptyAdjustment = { month: '', bankAccountId: '', category: '' as RevenueAdjustmentCategory | '', amount: '', description: '' };

export default function CashProofDepositsPanel({
  data,
  canEdit,
  busy,
  run,
  money,
  onSelectSample,
}: {
  data: CashProofResponse;
  canEdit: boolean;
  busy: string | null;
  run: Run;
  money: Money;
  onSelectSample: (sample: CashProofSampleView) => void;
}) {
  const engagement = data.engagement!;
  const recon = data.revenueReconciliation;
  const months = useMemo(() => [...data.months].reverse(), [data.months]);
  const accounts = useMemo(() => data.accounts.filter((a) => a.included), [data]);
  const accountLabel = (id: string | null) => {
    const a = id ? data.accounts.find((x) => x.id === id) : null;
    return a ? a.accountName : 'All accounts';
  };
  const docName = (id: string) => data.bankStatementDocuments.find((d) => d.id === id)?.originalFileName;
  const samplesByCell = useMemo(() => {
    const map = new Map<string, CashProofSampleView>();
    for (const s of data.samples) map.set(`${s.bankAccountId}|${s.month}`, s);
    return map;
  }, [data]);

  const [editing, setEditing] = useState<{ accountId: string; month: string; value: string } | null>(null);
  const [adjustment, setAdjustment] = useState(emptyAdjustment);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [openBookKey, setOpenBookKey] = useState<string | null>(null);

  if (!recon) return null;
  const monthLines = months.map((m) => recon.months[m]);
  const monthHasDeposits = months.map((m) => accounts.some((a) => a.deposits[m]));
  const rows = reconciliationRows([...monthLines, ...recon.periods, recon.total]);
  const notePeriods = recon.periods.filter(
    (p) => p.status === 'VARIANCE' || p.status === 'EXPLAINED' || (p.status === 'INCOMPLETE' && p.missingDeposits === 0),
  );
  const canAddAdjustment =
    canEdit && adjustment.month && adjustment.category && Number(adjustment.amount.replace(/[$,\s]/g, '')) > 0 && !busy;

  return (
    <>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={sectionHeading}>Deposits to Revenue</div>
            <p style={{ fontSize: '12px', color: '#475569', margin: '6px 0 0', lineHeight: 1.5, maxWidth: 820 }}>
              Do the bank deposits support the revenue in the books? Each account&apos;s monthly deposits come from its statements.
              Deposits that are not customer payments (transfers between company accounts, loans, owner money) are removed in
              Non-Revenue Deposits and Adjustments below. A fiscal year passes when the remaining customer receipts, adjusted for
              receivables, are within {recon.tolerancePct}% of reported revenue.
            </p>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '8px', fontSize: '12px', color: '#334155' }}>
              {recon.periods.map((p) => (
                <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <strong>{p.label}</strong>
                  <RevenueStatusBadge status={p.status} />
                  <span style={{ color: '#64748b' }}>
                    {p.missingDeposits > 0
                      ? `${p.missingDeposits} statement(s) missing`
                      : p.variancePct !== null
                        ? `${formatPercent(p.variancePct)} difference`
                        : ''}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
            Tolerance {recon.tolerancePct}% of reported revenue per fiscal year.
            {data.summary.depositMonthsMissing > 0 ? ` ${data.summary.depositMonthsMissing} statement(s) still missing deposits.` : ''}
          </div>
        </div>

        <div style={{ ...sectionHeading, fontSize: '13px', marginTop: '14px', marginBottom: '8px' }}>Statement Deposits by Account</div>
        {accounts.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b' }}>No bank accounts are included in the cash proof.</div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, ...stickyCol(260), background: '#f8fafc' }}>Account</th>
                  {months.map((m) => (
                    <th key={m} style={thStyle}>
                      {formatMonthLabel(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.id}>
                    <td style={{ ...tdStyle, ...stickyCol(260), fontWeight: 600 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={account.accountName}>
                        {account.accountName}
                      </div>
                      {Object.keys(account.deposits).length === 0 && (
                        <div style={{ fontSize: '10px', fontWeight: 400, color: '#b45309', whiteSpace: 'normal', marginTop: '2px' }}>
                          {account.accountLast4
                            ? `No statement figures for x${account.accountLast4} yet.`
                            : 'No bank statements for this account. If it is cash on hand, exclude it in Month-End Book Cash by Account.'}
                        </div>
                      )}
                      <div style={{ fontSize: '10px', fontWeight: 400, color: '#64748b', marginTop: '4px' }}>Deposits in this account are:</div>
                      <select
                        value={account.depositsCategory || ''}
                        disabled={!canEdit || !!busy}
                        title="Use a non-revenue category for accounts that never receive customer payments, such as payroll clearing or trust accounts"
                        onChange={(e) =>
                          run('deposits-category', {
                            action: 'update-account',
                            engagementId: engagement.id,
                            bankAccountId: account.id,
                            depositsCategory: e.target.value || null,
                          })
                        }
                        style={{ ...inputStyle, marginTop: '2px', padding: '3px 6px', fontSize: '11px', fontWeight: 400 }}
                      >
                        <option value="">Customer receipts (remove exceptions below)</option>
                        {NON_REVENUE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            All non-revenue: {REVENUE_ADJUSTMENT_CATEGORIES[c].label}
                          </option>
                        ))}
                      </select>
                    </td>
                    {months.map((m) => {
                      const deposit = account.deposits[m];
                      const sample = samplesByCell.get(`${account.id}|${m}`);
                      const isEditing = editing?.accountId === account.id && editing.month === m;
                      return (
                        <td
                          key={m}
                          onClick={() => {
                            if (sample) onSelectSample(sample);
                          }}
                          onDoubleClick={() => {
                            if (canEdit && !sample) setEditing({ accountId: account.id, month: m, value: deposit ? String(deposit.value) : '' });
                          }}
                          title={[
                            sample
                              ? 'Sampled month: deposits come from the sampled statement. Click to open it.'
                              : canEdit
                                ? 'Double-click to enter total deposits from the statement.'
                                : '',
                            deposit?.documentId ? `Statement: ${docName(deposit.documentId) || 'linked'}` : '',
                          ]
                            .filter(Boolean)
                            .join('\n')}
                          style={{
                            ...tdStyle,
                            cursor: sample ? 'pointer' : canEdit ? 'text' : 'default',
                            background: sample ? '#eff6ff' : undefined,
                            color: deposit ? tdStyle.color : '#94a3b8',
                          }}
                        >
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editing.value}
                              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') setEditing(null);
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                              onBlur={async () => {
                                const value = editing.value.trim();
                                setEditing(null);
                                if (value === (deposit ? String(deposit.value) : '')) return;
                                await run('deposit', {
                                  action: 'set-deposit',
                                  engagementId: engagement.id,
                                  bankAccountId: account.id,
                                  month: m,
                                  totalDeposits: value === '' ? null : value,
                                });
                              }}
                              style={{ ...inputStyle, width: 110, textAlign: 'right' }}
                            />
                          ) : deposit ? (
                            money(deposit.value)
                          ) : (
                            '—'
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td
                      style={{
                        ...tdStyle,
                        ...stickyCol(260),
                        fontWeight: row.emphasis ? 700 : 600,
                        background: '#f8fafc',
                        borderTop: row.topBorder ? '2px solid #e2e8f0' : undefined,
                      }}
                    >
                      {row.label}
                    </td>
                    {monthLines.map((line, i) => (
                      <td
                        key={months[i]}
                        style={{
                          ...tdStyle,
                          fontWeight: row.emphasis ? 700 : 400,
                          background: '#f8fafc',
                          borderTop: row.topBorder ? '2px solid #e2e8f0' : undefined,
                        }}
                      >
                        {!monthHasDeposits[i] ? (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        ) : row.key === 'bankDeposits' && line.missingDeposits > 0 ? (
                          <span style={{ color: '#b45309' }} title={`${line.missingDeposits} statement(s) missing`}>
                            {money(line.bankDeposits)}*
                          </span>
                        ) : (
                          money(row.value(line))
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
          Blue cells are sampled months. Double-click any other month to enter total deposits from its statement. Accounts
          set to &quot;All non-revenue&quot; have every deposit removed automatically, with no adjustment rows needed. An asterisk
          marks a month with statements still missing. Monthly differences are usually timing; the fiscal year totals below are
          what the proof is judged on.
        </div>
      </div>

      <div style={cardStyle}>
        <div style={sectionHeading}>Non-Revenue Deposits and Adjustments</div>
        <p style={{ fontSize: '12px', color: '#475569', margin: '6px 0 10px', lineHeight: 1.5, maxWidth: 820 }}>
          {data.bookDeposits.supported
            ? 'Every deposit into these accounts is traced in the books to the account it was posted against. Transfers between company accounts, loans, owner money, sales tax, and other non-revenue deposits are removed automatically, and card fees netted from deposits are added back. Enter something by hand only when the books do not show it, such as cash sales kept in the safe.'
            : 'These books do not show the other side of each deposit, so record every deposit that is not a customer payment (transfers, loans, owner money, client funds, sales tax) and any customer receipts that never reached the tested accounts.'}
        </p>

        {data.bookDeposits.supported && (
          <>
            <div style={{ ...sectionHeading, fontSize: '13px', marginBottom: '6px' }}>Calculated from the Books</div>
            {data.bookDeposits.adjustments.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                No transfers, loans, owner money, or other non-revenue deposits were found in the books for these accounts.
              </div>
            ) : (
              <div style={{ overflow: 'auto', maxHeight: 420, border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '14px' }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ ...thStyle, textAlign: 'left' }}>Month</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>Account</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>Category</th>
                      <th style={thStyle}>Amount</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>Transactions</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.bookDeposits.adjustments].reverse().map((adj) => {
                      const def = REVENUE_ADJUSTMENT_CATEGORIES[adj.category];
                      const key = `${adj.bankAccountId}|${adj.month}|${adj.category}`;
                      const open = openBookKey === key;
                      return (
                        <Fragment key={key}>
                          <tr style={{ opacity: adj.applied ? 1 : 0.55 }}>
                            <td style={{ ...tdStyle, textAlign: 'left' }}>{formatMonthLabel(adj.month)}</td>
                            <td style={{ ...tdStyle, textAlign: 'left' }}>{accountLabel(adj.bankAccountId)}</td>
                            <td style={{ ...tdStyle, textAlign: 'left' }}>{def.label}</td>
                            <td style={tdStyle}>{money(def.sign < 0 ? -adj.amount : adj.amount)}</td>
                            <td style={{ ...tdStyle, textAlign: 'left' }}>
                              <button
                                style={{ background: 'none', border: 'none', padding: 0, color: '#2751d0', cursor: 'pointer', fontSize: '12px' }}
                                onClick={() => setOpenBookKey(open ? null : key)}
                              >
                                {open ? '▾' : '▸'} {adj.transactions.length} transaction{adj.transactions.length === 1 ? '' : 's'}
                              </button>
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'left', color: adj.applied ? '#047857' : '#64748b' }}>
                              {adj.applied ? 'Applied' : 'Applies once this month’s statement is in'}
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={6} style={{ padding: '6px 12px 10px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ ...thStyle, textAlign: 'left' }}>Date</th>
                                      <th style={{ ...thStyle, textAlign: 'left' }}>Type</th>
                                      <th style={{ ...thStyle, textAlign: 'left' }}>Posted Against</th>
                                      <th style={{ ...thStyle, textAlign: 'left' }}>Name / Memo</th>
                                      <th style={thStyle}>Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {adj.transactions.map((t, i) => (
                                      <tr key={`${t.date}-${i}`}>
                                        <td style={{ ...tdStyle, textAlign: 'left' }}>{`${Number(t.date.slice(5, 7))}/${Number(t.date.slice(8, 10))}/${t.date.slice(0, 4)}`}</td>
                                        <td style={{ ...tdStyle, textAlign: 'left' }}>{t.type || '—'}</td>
                                        <td style={{ ...tdStyle, textAlign: 'left' }}>{t.offsetAccount}</td>
                                        <td style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'normal', minWidth: 260 }}>{t.description || '—'}</td>
                                        <td style={tdStyle}>{money(t.amount)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ ...sectionHeading, fontSize: '13px', marginBottom: '6px' }}>Entered by Hand</div>
          </>
        )}
        {canEdit && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '10px' }}>
            <label style={{ fontSize: '11px', color: '#475569', width: 120 }}>
              Month
              <select
                value={adjustment.month}
                onChange={(e) => setAdjustment({ ...adjustment, month: e.target.value })}
                style={{ ...inputStyle, marginTop: '4px' }}
              >
                <option value="">Select…</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: '11px', color: '#475569', width: 200 }}>
              Account
              <select
                value={adjustment.bankAccountId}
                onChange={(e) => setAdjustment({ ...adjustment, bankAccountId: e.target.value })}
                style={{ ...inputStyle, marginTop: '4px' }}
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountName}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: '11px', color: '#475569', width: 300 }}>
              Category
              <select
                value={adjustment.category}
                onChange={(e) => setAdjustment({ ...adjustment, category: e.target.value as RevenueAdjustmentCategory })}
                style={{ ...inputStyle, marginTop: '4px' }}
                title={adjustment.category ? REVENUE_ADJUSTMENT_CATEGORIES[adjustment.category].help : undefined}
              >
                <option value="">Select…</option>
                {REVENUE_ADJUSTMENT_CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {REVENUE_ADJUSTMENT_CATEGORIES[c].sign < 0 ? 'Less: ' : 'Add: '}
                    {REVENUE_ADJUSTMENT_CATEGORIES[c].label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: '11px', color: '#475569', width: 120 }}>
              Amount
              <input
                value={adjustment.amount}
                inputMode="decimal"
                onChange={(e) => setAdjustment({ ...adjustment, amount: e.target.value })}
                style={{ ...inputStyle, marginTop: '4px', textAlign: 'right' }}
              />
            </label>
            <label style={{ fontSize: '11px', color: '#475569', flex: 1, minWidth: 180 }}>
              Description
              <input
                value={adjustment.description}
                onChange={(e) => setAdjustment({ ...adjustment, description: e.target.value })}
                style={{ ...inputStyle, marginTop: '4px' }}
              />
            </label>
            <button
              style={buttonStyle('primary', !canAddAdjustment)}
              disabled={!canAddAdjustment}
              onClick={async () => {
                const ok = await run('add-adjustment', {
                  action: 'add-revenue-adjustment',
                  engagementId: engagement.id,
                  ...adjustment,
                  bankAccountId: adjustment.bankAccountId || null,
                });
                if (ok) setAdjustment({ ...emptyAdjustment, month: adjustment.month, bankAccountId: adjustment.bankAccountId });
              }}
            >
              {busy === 'add-adjustment' ? 'Adding…' : 'Add'}
            </button>
          </div>
        )}
        {data.revenueAdjustments.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#64748b' }}>Nothing entered by hand.</div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Month</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Account</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Category</th>
                  <th style={thStyle}>Amount</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Description</th>
                  {canEdit && <th style={thStyle} />}
                </tr>
              </thead>
              <tbody>
                {data.revenueAdjustments.map((adj) => {
                  const def = REVENUE_ADJUSTMENT_CATEGORIES[adj.category];
                  return (
                    <tr key={adj.id}>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>{formatMonthLabel(adj.month)}</td>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>{accountLabel(adj.bankAccountId)}</td>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>{def?.label || adj.category}</td>
                      <td style={tdStyle}>{money(def && def.sign < 0 ? -adj.amount : adj.amount)}</td>
                      <td style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'normal' }}>{adj.description || '—'}</td>
                      {canEdit && (
                        <td style={tdStyle}>
                          <button
                            style={{ ...buttonStyle('secondary', !!busy), padding: '2px 8px' }}
                            disabled={!!busy}
                            onClick={() =>
                              run('delete-adjustment', {
                                action: 'delete-revenue-adjustment',
                                engagementId: engagement.id,
                                adjustmentId: adj.id,
                              })
                            }
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <div style={sectionHeading}>Reconciliation by Fiscal Year</div>
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '10px' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, ...stickyCol(260), background: '#f8fafc' }} />
                {[...recon.periods, recon.total].map((p) => (
                  <th key={p.key} style={thStyle}>
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td
                    style={{
                      ...tdStyle,
                      ...stickyCol(260),
                      fontWeight: row.emphasis ? 700 : 600,
                      borderTop: row.topBorder && row.key !== 'bankDeposits' ? '2px solid #e2e8f0' : undefined,
                    }}
                  >
                    {row.label}
                  </td>
                  {[...recon.periods, recon.total].map((p) => (
                    <td
                      key={p.key}
                      style={{
                        ...tdStyle,
                        fontWeight: row.emphasis ? 700 : 400,
                        borderTop: row.topBorder && row.key !== 'bankDeposits' ? '2px solid #e2e8f0' : undefined,
                      }}
                    >
                      {money(row.value(p))}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td style={{ ...tdStyle, ...stickyCol(260), fontWeight: 600 }}>Variance</td>
                {[...recon.periods, recon.total].map((p) => (
                  <td key={p.key} style={tdStyle}>
                    {formatPercent(p.variancePct)}
                  </td>
                ))}
              </tr>
              <tr>
                <td style={{ ...tdStyle, ...stickyCol(260), fontWeight: 600 }}>Status</td>
                {[...recon.periods, recon.total].map((p) => (
                  <td key={p.key} style={tdStyle}>
                    <RevenueStatusBadge status={p.status} />
                    {p.missingDeposits > 0 && (
                      <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{p.missingDeposits} statement(s) missing</div>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
          A fiscal year reconciles when the difference is within {recon.tolerancePct}% of reported revenue. A larger difference
          needs a written explanation before the cash proof can be locked.
        </div>

        {notePeriods.length > 0 && (
          <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
            {notePeriods.map((p) => {
              const draft = noteDrafts[p.key] ?? p.note ?? '';
              return (
                <div key={p.key} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                    {p.label} <RevenueStatusBadge status={p.status} />
                    <span style={{ fontWeight: 400, color: '#64748b' }}>
                      {p.difference === null
                        ? 'Reported revenue or opening balances are missing from the books.'
                        : `Difference ${money(p.difference)} (${formatPercent(p.variancePct)})`}
                    </span>
                  </div>
                  <textarea
                    value={draft}
                    disabled={!canEdit}
                    rows={2}
                    placeholder="Explain the difference (for example: cash sales deposited to an account outside this proof, revenue recognized on a different basis)."
                    onChange={(e) => setNoteDrafts({ ...noteDrafts, [p.key]: e.target.value })}
                    style={{ ...inputStyle, marginTop: '6px', resize: 'vertical' }}
                  />
                  {canEdit && draft !== (p.note ?? '') && (
                    <button
                      style={{ ...buttonStyle('primary', !!busy), marginTop: '6px' }}
                      disabled={!!busy}
                      onClick={async () => {
                        const ok = await run('period-note', {
                          action: 'set-revenue-period-note',
                          engagementId: engagement.id,
                          periodKey: p.key,
                          note: draft,
                        });
                        if (ok) {
                          setNoteDrafts((current) => {
                            const next = { ...current };
                            delete next[p.key];
                            return next;
                          });
                        }
                      }}
                    >
                      {busy === 'period-note' ? 'Saving…' : 'Save Explanation'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
