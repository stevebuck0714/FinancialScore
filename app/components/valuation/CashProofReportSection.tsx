'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { APP_TIME_ZONE, formatEstDateTime } from '@/lib/time/eastern';
import { SAMPLE_SELECTION_LABELS } from '@/lib/cash-proof/sampling';
import { SAMPLE_STATUS_LABELS } from '@/lib/cash-proof/tie-out';
import {
  REVENUE_ADJUSTMENT_CATEGORIES,
  REVENUE_ADJUSTMENT_CATEGORY_ORDER,
  REVENUE_STATUS_LABELS,
} from '@/lib/cash-proof/revenue-reconciliation';
import { TRANSACTION_EXCEPTION_ORDER, TRANSACTION_EXCEPTION_TYPES } from '@/lib/cash-proof/transaction-match';
import {
  REVENUE_STATUS_COLORS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  STATUS_COLORS,
  fetchCashProof,
  formatMonthLabel,
  formatPercent,
  makeMoneyFormatter,
  reconciliationRows,
  type CashProofResponse,
} from './cashProofClient';

type Selections = {
  summary: boolean;
  tieOutDetail: boolean;
  exceptions: boolean;
  depositsToRevenue: boolean;
  methodology: boolean;
};

const badge = (c: { bg: string; fg: string; border: string }): CSSProperties => ({
  padding: '1px 6px',
  borderRadius: '999px',
  fontSize: '10px',
  fontWeight: 700,
  background: c.bg,
  color: c.fg,
  border: `1px solid ${c.border}`,
  whiteSpace: 'nowrap',
});

const sectionTitle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 800,
  color: '#1e293b',
  margin: '0 0 8px 0',
  borderBottom: '1px solid #e2e8f0',
  paddingBottom: '6px',
};
const th: CSSProperties = {
  padding: '6px 8px',
  fontSize: '11px',
  fontWeight: 700,
  color: '#475569',
  background: '#f8fafc',
  borderBottom: '2px solid #e2e8f0',
  textAlign: 'right',
  whiteSpace: 'nowrap',
};
const td: CSSProperties = {
  padding: '5px 8px',
  fontSize: '11px',
  color: '#1e293b',
  borderBottom: '1px solid #f1f5f9',
  textAlign: 'right',
};
const FISCAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CashProofReportSection({
  companyId,
  companyName,
  reportTitle,
  selections,
}: {
  companyId: string | null;
  companyName: string;
  reportTitle: string;
  selections: Selections;
}) {
  const [result, setResult] = useState<{ companyId: string; data?: CashProofResponse; error?: string } | null>(null);
  const current = result && result.companyId === companyId ? result : null;
  const data = current?.data ?? null;
  const error = current?.error ?? null;

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    fetchCashProof(companyId)
      .then((json) => {
        if (!cancelled) setResult({ companyId, data: json });
      })
      .catch((e) => {
        if (!cancelled) setResult({ companyId, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const money = useMemo(() => makeMoneyFormatter(data), [data]);
  const engagement = data?.engagement ?? null;
  const includedAccounts = useMemo(() => (data?.accounts || []).filter((a) => a.included), [data]);
  const accountName = (id: string) => {
    const a = data?.accounts.find((x) => x.id === id);
    if (!a) return '';
    return [a.bankName, a.accountName, a.accountLast4 ? `x${a.accountLast4}` : null].filter(Boolean).join(' · ');
  };
  const reportedSamples = useMemo(
    () => (data?.samples || []).filter((s) => includedAccounts.some((a) => a.id === s.bankAccountId)),
    [data, includedAccounts],
  );
  const exceptions = reportedSamples.filter((s) => s.status === 'EXCEPTION' || s.status === 'CLEARED');
  const excludedAccounts = (data?.accounts || []).filter((a) => !a.included);
  const transactionMatch = data?.transactionMatch ?? null;
  const transactionExceptions = (data?.transactionExceptions || []).filter((e) => e.status !== 'AUTO_RESOLVED');
  const openTransactionExceptions = transactionExceptions.filter((e) => e.status === 'OPEN');
  const transactionTypeTotals = TRANSACTION_EXCEPTION_ORDER.map((type) => {
    const ofType = transactionExceptions.filter((e) => e.type === type);
    return {
      type,
      count: ofType.length,
      open: ofType.filter((e) => e.status === 'OPEN').length,
      dollars: Math.round(ofType.reduce((sum, e) => sum + Math.abs(e.amount), 0) * 100) / 100,
    };
  }).filter((t) => t.count > 0);
  const transactionConclusion = (() => {
    if (!transactionMatch) return '';
    const t = transactionMatch.totals;
    const pct = t.bankDollars > 0 ? `${((t.matchedBankDollars / t.bankDollars) * 100).toFixed(1)}%` : null;
    const coverage = `Every book entry to the bank accounts was matched to the client's bank transactions for ${t.lineLevelAccountMonths} account-month${t.lineLevelAccountMonths === 1 ? '' : 's'}${pct ? `; ${pct} of bank dollars agree to the books` : ''}${t.totalsTestedAccountMonths ? `, and monthly totals were compared for ${t.totalsTestedAccountMonths} more account-month${t.totalsTestedAccountMonths === 1 ? '' : 's'} with statements only` : ''}.`;
    if (openTransactionExceptions.length > 0) {
      const critical = openTransactionExceptions.filter((e) => e.severity === 'CRITICAL').length;
      return `${coverage} ${openTransactionExceptions.length} transaction exception${openTransactionExceptions.length === 1 ? ' remains' : 's remain'} open${critical ? `, ${critical} of them critical` : ''}.`;
    }
    return `${coverage} ${transactionExceptions.length ? `All ${transactionExceptions.length} transaction exceptions were cleared with documented explanations.` : 'No transaction exceptions were found.'}`;
  })();

  const conclusion = (() => {
    if (!engagement || !data) return '';
    const s = data.summary;
    const done = s.tied + s.cleared;
    if (s.accountMonths === 0) return 'No months have been sampled yet.';
    if (s.exceptions > 0) {
      return `${s.exceptions} of ${s.accountMonths} sampled account-months have unresolved differences between book cash and the bank statement. Cash cannot be considered verified until these are resolved.`;
    }
    if (s.requested + s.received > 0) {
      return `${done} of ${s.accountMonths} sampled account-months are tied or cleared; ${s.requested + s.received} are still awaiting statements or entry.`;
    }
    return `All ${s.accountMonths} sampled account-months across ${includedAccounts.length} bank account${includedAccounts.length === 1 ? '' : 's'} agree to bank statements${s.cleared ? ` (${s.cleared} after documented reconciling explanations)` : ''}. Book cash reported in the accounting system is supported by bank records for the review period.`;
  })();

  const recon = data?.revenueReconciliation ?? null;
  const reconColumns = recon ? [...recon.periods, recon.total] : [];
  const reconRows = recon ? reconciliationRows(reconColumns) : [];
  const usedCategories = REVENUE_ADJUSTMENT_CATEGORY_ORDER.filter((c) => reconColumns.some((p) => (p.byCategory[c] || 0) !== 0));
  const revenueConclusion = (() => {
    if (!recon || recon.periods.length === 0) return '';
    const missing = recon.total.missingDeposits;
    if (missing > 0) {
      return `Deposits have not yet been entered for ${missing} bank statement${missing === 1 ? '' : 's'} in the review period, so the deposits-to-revenue proof is incomplete.`;
    }
    const variances = recon.periods.filter((p) => p.status === 'VARIANCE');
    const explained = recon.periods.filter((p) => p.status === 'EXPLAINED');
    const incomplete = recon.periods.filter((p) => p.status === 'INCOMPLETE');
    if (variances.length > 0) {
      return `Reported revenue differs from bank deposits by more than ${recon.tolerancePct}% in ${variances.map((p) => p.label).join(', ')} with no explanation. Revenue cannot be considered supported by bank records for ${variances.length === 1 ? 'that period' : 'those periods'}.`;
    }
    if (incomplete.length > 0) {
      return `${incomplete.map((p) => p.label).join(', ')} could not be reconciled because reported revenue or opening balances are missing from the books.`;
    }
    return `Bank deposits, after removing non-revenue deposits and adjusting for the change in receivables, support reported revenue within ${recon.tolerancePct}% for every fiscal period reviewed${explained.length ? ` (${explained.map((p) => p.label).join(', ')} after documented explanations)` : ''}. Across the review period, implied revenue of ${money(recon.total.impliedRevenue)} compares with reported revenue of ${money(recon.total.reportedRevenue)}.`;
  })();

  const isLoading = Boolean(companyId) && !data && !error;

  return (
    <div className="cash-proof-report" style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
      <style>{`
        @media print {
          @page { size: letter landscape; margin: 0.4in; }
          .cash-proof-report { border: none !important; border-radius: 0 !important; }
          .cash-proof-report * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
        <div style={{ fontSize: '20px', color: '#0f172a', fontWeight: 800, letterSpacing: '-0.02em' }}>{reportTitle}</div>
        <div style={{ fontSize: '18px', color: '#1e293b', fontWeight: 800, marginTop: '6px' }}>Cash Proof</div>
        <div style={{ fontSize: '16px', color: '#475569', marginTop: '4px', lineHeight: 1.45 }}>
          Prepared for: <strong>{companyName}</strong> | Generated: {new Date().toLocaleDateString('en-US', { timeZone: APP_TIME_ZONE })}
        </div>
      </div>
      <div style={{ padding: '16px 18px', display: 'grid', gap: '20px' }}>
        {error && <div style={{ color: '#b91c1c', fontSize: '13px' }}>{error}</div>}
        {isLoading ? (
          <div data-report-loading="true" style={{ fontSize: '13px', color: '#64748b' }}>Loading cash proof…</div>
        ) : !engagement ? (
          <div style={{ fontSize: '13px', color: '#64748b' }}>
            The cash proof has not been started for this company. Start it from Valuation › SDE › Cash Proof.
          </div>
        ) : (
          <>
            {selections.summary && (
              <div>
                <div style={sectionTitle}>Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '8px', marginBottom: '10px' }}>
                  {[
                    ['Review Period', `${formatMonthLabel(engagement.periodStartMonth)} – ${formatMonthLabel(engagement.periodEndMonth)}`],
                    ['Bank Accounts', String(includedAccounts.length)],
                    ['Statements Tested', String(data!.summary.accountMonths)],
                    ['Tied / Cleared', `${data!.summary.tied} / ${data!.summary.cleared}`],
                    ['Open Exceptions', String(data!.summary.exceptions + data!.summary.transactionExceptionsOpen)],
                    [
                      'Revenue Supported',
                      recon
                        ? `${recon.periods.filter((p) => p.status === 'RECONCILED' || p.status === 'EXPLAINED').length} of ${recon.periods.length} years`
                        : '—',
                    ],
                  ].map(([label, value]) => (
                    <div key={label} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', background: '#f8fafc' }}>
                      <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: 700, marginTop: '2px' }}>{value}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6, margin: 0 }}>{conclusion}</p>
                {transactionConclusion && (
                  <p style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6, margin: '6px 0 0' }}>{transactionConclusion}</p>
                )}
                {revenueConclusion && (
                  <p style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6, margin: '6px 0 0' }}>{revenueConclusion}</p>
                )}
                {engagement.status === 'LOCKED' && engagement.lockedAt && (
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '6px 0 0' }}>Cash proof locked {formatEstDateTime(engagement.lockedAt)}.</p>
                )}
                {excludedAccounts.length > 0 && (
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '6px 0 0' }}>
                    Excluded accounts: {excludedAccounts.map((a) => `${a.accountName} (${a.exclusionReason || 'no reason given'})`).join('; ')}.
                  </p>
                )}
              </div>
            )}

            {selections.tieOutDetail && (
              <div>
                <div style={sectionTitle}>Tie-Out Detail</div>
                {reportedSamples.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#64748b' }}>No months sampled yet.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: 'left' }}>Account</th>
                        <th style={{ ...th, textAlign: 'left' }}>Month</th>
                        <th style={{ ...th, textAlign: 'left' }}>Selection</th>
                        <th style={th}>Book Balance</th>
                        <th style={th}>Statement Ending</th>
                        <th style={th}>Reconciling Items</th>
                        <th style={th}>Difference</th>
                        <th style={{ ...th, textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportedSamples.map((s) => (
                        <tr key={s.id}>
                          <td style={{ ...td, textAlign: 'left' }}>{accountName(s.bankAccountId)}</td>
                          <td style={{ ...td, textAlign: 'left' }}>{formatMonthLabel(s.month)}</td>
                          <td style={{ ...td, textAlign: 'left' }}>{SAMPLE_SELECTION_LABELS[s.selectionReason]}</td>
                          <td style={td}>{money(s.tieOut.bookBalance)}</td>
                          <td style={td}>{money(s.statementEnding)}</td>
                          <td style={td}>{money(s.reconcilingItems)}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{money(s.tieOut.difference)}</td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <span
                              style={{
                                padding: '1px 6px',
                                borderRadius: '999px',
                                fontSize: '10px',
                                fontWeight: 700,
                                background: STATUS_COLORS[s.status].bg,
                                color: STATUS_COLORS[s.status].fg,
                                border: `1px solid ${STATUS_COLORS[s.status].border}`,
                              }}
                            >
                              {SAMPLE_STATUS_LABELS[s.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {selections.exceptions && (
              <div>
                <div style={sectionTitle}>Exceptions</div>
                {exceptions.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#64748b' }}>No exceptions were identified in the sampled months.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, textAlign: 'left' }}>Account</th>
                        <th style={{ ...th, textAlign: 'left' }}>Month</th>
                        <th style={th}>Difference</th>
                        <th style={{ ...th, textAlign: 'left' }}>Exception</th>
                        <th style={{ ...th, textAlign: 'left' }}>Resolution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exceptions.map((s) => (
                        <tr key={s.id}>
                          <td style={{ ...td, textAlign: 'left' }}>{accountName(s.bankAccountId)}</td>
                          <td style={{ ...td, textAlign: 'left' }}>{formatMonthLabel(s.month)}</td>
                          <td style={td}>{money(s.tieOut.difference)}</td>
                          <td style={{ ...td, textAlign: 'left' }}>{s.exceptionNote || '—'}</td>
                          <td style={{ ...td, textAlign: 'left' }}>{s.status === 'CLEARED' ? s.resolutionNote : 'Open'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                {transactionMatch && (
                  <>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', margin: '14px 0 6px' }}>Transaction Testing</div>
                    <p style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6, margin: '0 0 8px' }}>{transactionConclusion}</p>
                    {transactionTypeTotals.length > 0 && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px' }}>
                        <thead>
                          <tr>
                            <th style={{ ...th, textAlign: 'left' }}>Exception Type</th>
                            <th style={th}>Found</th>
                            <th style={th}>Open</th>
                            <th style={th}>Dollars</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactionTypeTotals.map((t) => (
                            <tr key={t.type}>
                              <td style={{ ...td, textAlign: 'left' }}>{TRANSACTION_EXCEPTION_TYPES[t.type].label}</td>
                              <td style={td}>{t.count}</td>
                              <td style={{ ...td, fontWeight: t.open ? 700 : 400 }}>{t.open}</td>
                              <td style={td}>{t.type === 'UNDISCLOSED_BANK_ACCOUNT' ? '—' : money(t.dollars)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', margin: '6px 0 6px' }}>Transaction Exceptions</div>
                    {transactionExceptions.length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#64748b' }}>No differences were found between the books and the bank transactions.</div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ ...th, textAlign: 'center' }}>Severity</th>
                            <th style={{ ...th, textAlign: 'left' }}>Account</th>
                            <th style={{ ...th, textAlign: 'left' }}>Date</th>
                            <th style={th}>Amount</th>
                            <th style={{ ...th, textAlign: 'left' }}>Exception</th>
                            <th style={{ ...th, textAlign: 'left' }}>Resolution</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactionExceptions.map((e) => (
                            <tr key={e.id}>
                              <td style={{ ...td, textAlign: 'center' }}>
                                <span style={badge(SEVERITY_COLORS[e.severity])}>{SEVERITY_LABELS[e.severity]}</span>
                              </td>
                              <td style={{ ...td, textAlign: 'left' }}>{e.bankAccountId ? accountName(e.bankAccountId) : 'Not in the books'}</td>
                              <td style={{ ...td, textAlign: 'left', whiteSpace: 'nowrap' }}>
                                {e.date ? `${Number(e.date.slice(5, 7))}/${Number(e.date.slice(8, 10))}/${e.date.slice(0, 4)}` : '—'}
                              </td>
                              <td style={td}>{e.type === 'UNDISCLOSED_BANK_ACCOUNT' ? '—' : money(e.amount)}</td>
                              <td style={{ ...td, textAlign: 'left' }}>
                                <strong>{TRANSACTION_EXCEPTION_TYPES[e.type]?.label || e.type}.</strong> {e.description}
                              </td>
                              <td style={{ ...td, textAlign: 'left' }}>{e.status === 'CLEARED' ? e.resolutionNote : 'Open'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
            )}

            {selections.depositsToRevenue && recon && (
              <div>
                <div style={sectionTitle}>Deposits to Revenue</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...th, textAlign: 'left' }} />
                      {reconColumns.map((p) => (
                        <th key={p.key} style={th}>
                          {p.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reconRows.map((row) => (
                      <tr key={row.key}>
                        <td
                          style={{
                            ...td,
                            textAlign: 'left',
                            fontWeight: row.emphasis ? 700 : 400,
                            borderTop: row.topBorder && row.key !== 'bankDeposits' ? '2px solid #e2e8f0' : undefined,
                          }}
                        >
                          {row.label}
                        </td>
                        {reconColumns.map((p) => (
                          <td
                            key={p.key}
                            style={{
                              ...td,
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
                      <td style={{ ...td, textAlign: 'left' }}>Variance</td>
                      {reconColumns.map((p) => (
                        <td key={p.key} style={td}>
                          {formatPercent(p.variancePct)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={{ ...td, textAlign: 'left' }}>Status</td>
                      {reconColumns.map((p) => (
                        <td key={p.key} style={td}>
                          <span style={badge(REVENUE_STATUS_COLORS[p.status])}>{REVENUE_STATUS_LABELS[p.status]}</span>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>

                {usedCategories.length > 0 && (
                  <>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e293b', margin: '14px 0 6px' }}>
                      Non-Revenue Deposits and Adjustments
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ ...th, textAlign: 'left' }}>Category</th>
                          {reconColumns.map((p) => (
                            <th key={p.key} style={th}>
                              {p.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {usedCategories.map((c) => (
                          <tr key={c}>
                            <td style={{ ...td, textAlign: 'left' }}>{REVENUE_ADJUSTMENT_CATEGORIES[c].label}</td>
                            {reconColumns.map((p) => {
                              const amount = p.byCategory[c];
                              return (
                                <td key={p.key} style={td}>
                                  {amount ? money(REVENUE_ADJUSTMENT_CATEGORIES[c].sign * amount) : '—'}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {includedAccounts.some((a) => a.depositsCategory) && (
                  <p style={{ fontSize: '11px', color: '#64748b', margin: '6px 0 0' }}>
                    All deposits to these accounts were treated as non-revenue:{' '}
                    {includedAccounts
                      .filter((a) => a.depositsCategory)
                      .map((a) => `${accountName(a.id)} (${REVENUE_ADJUSTMENT_CATEGORIES[a.depositsCategory!].label.toLowerCase()})`)
                      .join('; ')}
                    .
                  </p>
                )}

                {recon.periods.some((p) => p.note) && (
                  <div style={{ marginTop: '12px', display: 'grid', gap: '6px' }}>
                    {recon.periods
                      .filter((p) => p.note)
                      .map((p) => (
                        <p key={p.key} style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6, margin: 0 }}>
                          <strong>{p.label}:</strong> {p.note}
                        </p>
                      ))}
                  </div>
                )}
                <p style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6, margin: '10px 0 0' }}>{revenueConclusion}</p>
              </div>
            )}

            {selections.methodology && (
              <div>
                <div style={sectionTitle}>Methodology</div>
                <p style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6, margin: 0 }}>
                  Month-end cash balances for every bank account were taken from the company&apos;s accounting system for{' '}
                  {formatMonthLabel(engagement.periodStartMonth)} through {formatMonthLabel(engagement.periodEndMonth)} and
                  reconciled in total to balance sheet cash. Bank statements were requested for the latest month, each fiscal
                  year-end ({FISCAL_MONTHS[engagement.fiscalYearEndMonth - 1]}), any month with an unusual balance swing
                  (more than two standard deviations from the account&apos;s average monthly change), and four additional months
                  selected at random from the remaining period. The random draw is seeded and reproducible
                  {engagement.sampledAt ? ` (drawn ${formatEstDateTime(engagement.sampledAt)})` : ''}. Each statement was
                  checked to foot (beginning balance plus deposits less withdrawals equals ending balance), for continuity
                  with the prior month where both were sampled, and agreed to book cash within{' '}
                  {money(engagement.balanceTolerance)} after documented reconciling items. Where a difference could not be
                  explained, the sample was expanded by three further months.
                </p>
                <p style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6, margin: '8px 0 0' }}>
                  Revenue was tested against every bank statement in the review period, not a sample. Total deposits for each
                  account and month were reduced by deposits that are not customer payments (transfers between company accounts,
                  loan proceeds, owner contributions, customer funds held, sales tax, and other non-operating receipts), increased
                  by processor fees netted from deposits and customer receipts held outside the tested accounts, and adjusted for
                  the change in receivables
                  {reconRows.some((r) => r.key === 'contractAssets' || r.key === 'contractLiabilities')
                    ? ', contract assets, and deferred revenue'
                    : ''}{' '}
                  to arrive at implied revenue. Implied revenue was compared with revenue reported in the books for each fiscal
                  year, with differences over {recon?.tolerancePct ?? engagement.revenueTolerancePct}% of reported revenue
                  requiring a documented explanation.
                </p>
                {transactionMatch && (
                  <p style={{ fontSize: '12px', color: '#334155', lineHeight: 1.6, margin: '8px 0 0' }}>
                    Where the client provided bank transaction detail (a bank connection report or a reviewed transaction
                    export), every General Ledger entry to each bank account was matched to the bank&apos;s transactions: by check
                    number, then by amount within {transactionMatch.settings.exactWindowDays} days, then payments clearing up to{' '}
                    {transactionMatch.settings.lateClearingDays} days later, and finally batched deposits and split payments.
                    Bank activity with no book entry, book deposits that never reached the bank, payments outstanding more than{' '}
                    {transactionMatch.settings.staleCheckDays} days, and check amounts that differ were reported as exceptions;
                    bank fees and interest of {money(transactionMatch.settings.feeGroupMax)} or less were grouped by month. For
                    sampled months, uncleared items were used as the reconciling items. Months with statements only were tested by
                    comparing book and statement deposit and withdrawal totals, allowing for timing differences that reverse the
                    following month. Bank accounts with statements in the Data Room but no account in the books were reported as
                    exceptions.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
