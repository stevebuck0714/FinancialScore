'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import type { QbdInvestorActivityResult } from '@/lib/real-estate/qbd-investor-activity';
import { formatEstDateTime } from '@/lib/time/eastern';
import { useTableSort } from '@/app/components/operations/useTableSort';

type LedgerInvestor = {
  id: string;
  legalName: string;
  entries?: Array<{ entryType: string; amount: number | string }>;
};

type Props = {
  companyId: string;
  investors: LedgerInvestor[];
  fmt: (value: unknown) => string;
};

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 };
const th: React.CSSProperties = { padding: '9px 10px', textAlign: 'left', fontSize: 11, color: '#475569', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' };
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 };
const right: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

const ACTIVITY_LABEL: Record<string, string> = { CONTRIBUTION: 'Contribution', DISTRIBUTION: 'Distribution', OTHER: 'Other' };

export default function QbdInvestorActivityPanel({ companyId, investors, fmt }: Props) {
  const [result, setResult] = useState<QbdInvestorActivityResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/operations/real-estate/qbd-investor-activity?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) throw new Error(payload?.error || 'Failed to load QuickBooks member activity.');
        setResult(payload);
        setError('');
      })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  const ledgerById = useMemo(() => new Map(investors.map((investor) => {
    const entries = Array.isArray(investor.entries) ? investor.entries : [];
    const sum = (types: string[]) => entries.filter((entry) => types.includes(entry.entryType)).reduce((total, entry) => total + Number(entry.amount || 0), 0);
    return [investor.id, { legalName: investor.legalName, contributions: sum(['CONTRIBUTION', 'DEEMED_CONTRIBUTION']), distributions: sum(['DISTRIBUTION']) }];
  })), [investors]);

  const { sortRows, sortableHeader } = useTableSort(th);
  const members = result?.members || [];
  const rows = members.map((member) => {
    const ledger = member.investorId ? ledgerById.get(member.investorId) : undefined;
    return {
      member,
      ledgerName: ledger?.legalName ?? null,
      ledgerContributions: ledger ? ledger.contributions : null,
      contributionDifference: ledger ? member.contributions - ledger.contributions : null,
      ledgerDistributions: ledger ? ledger.distributions : null,
      distributionDifference: ledger ? member.distributions - ledger.distributions : null,
    };
  });
  type Row = (typeof rows)[number];
  const sortValue = (row: Row, key: string): unknown => {
    if (key === 'member') return row.member.memberName;
    if (key === 'ledgerMember') return row.ledgerName ?? '';
    if (key === 'qbdContributions') return row.member.contributions;
    if (key === 'qbdDistributions') return row.member.distributions;
    if (key === 'transactions') return row.member.transactionCount;
    const value = row[key as keyof Row];
    return typeof value === 'number' ? value : Number.NEGATIVE_INFINITY;
  };
  const sumOf = (pick: (row: Row) => number | null) => rows.reduce((total, row) => total + (pick(row) ?? 0), 0);
  const totals = {
    qbdContributions: sumOf((row) => row.member.contributions),
    ledgerContributions: sumOf((row) => row.ledgerContributions),
    contributionDifference: sumOf((row) => row.contributionDifference),
    qbdDistributions: sumOf((row) => row.member.distributions),
    ledgerDistributions: sumOf((row) => row.ledgerDistributions),
    distributionDifference: sumOf((row) => row.distributionDifference),
    transactions: sumOf((row) => row.member.transactionCount),
  };
  const unmatched = members.filter((member) => !member.investorId);
  const variance = (difference: number | null) => {
    if (difference === null) return <span style={{ color: '#64748b' }}>-</span>;
    return <span style={{ color: Math.abs(difference) < 1 ? '#166534' : '#92400e' }}>{fmt(difference)}</span>;
  };

  return <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
    <div style={{ padding: '14px 18px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h3 style={{ margin: 0 }}>QuickBooks Member Activity</h3>
        <p style={{ color: '#64748b', margin: '6px 0 12px', fontSize: 13 }}>
          Contributions and distributions posted to each member&apos;s equity accounts in QuickBooks Desktop, compared with the member ledger above. For review only; the rollforward and waterfall still use the member ledger.
          {result?.latestSyncAt ? ` QuickBooks data as of ${formatEstDateTime(result.latestSyncAt)}.` : ''}
        </p>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 999, padding: '3px 9px', textTransform: 'uppercase' }}>Review</span>
    </div>
    {loading && <div style={{ padding: 18, color: '#64748b' }}>Loading QuickBooks member activity…</div>}
    {!loading && error && <div style={{ padding: 18, color: '#b91c1c' }}>{error}</div>}
    {!loading && !error && !members.length && <div style={{ padding: 18, color: '#64748b' }}>No member contribution or distribution activity has synced from QuickBooks Desktop yet.</div>}
    {!loading && !error && members.length > 0 && <>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
        <thead><tr>
          {sortableHeader('qbdMembers', 'member', 'QuickBooks member')}
          {sortableHeader('qbdMembers', 'ledgerMember', 'Ledger member')}
          {sortableHeader('qbdMembers', 'qbdContributions', 'QuickBooks contributions', 'right')}
          {sortableHeader('qbdMembers', 'ledgerContributions', 'Ledger contributions', 'right')}
          {sortableHeader('qbdMembers', 'contributionDifference', 'Difference', 'right')}
          {sortableHeader('qbdMembers', 'qbdDistributions', 'QuickBooks distributions', 'right')}
          {sortableHeader('qbdMembers', 'ledgerDistributions', 'Ledger distributions', 'right')}
          {sortableHeader('qbdMembers', 'distributionDifference', 'Difference', 'right')}
          {sortableHeader('qbdMembers', 'transactions', 'Transactions', 'right')}
        </tr></thead>
        <tbody>{sortRows('qbdMembers', rows, sortValue).map((row) => {
          const { member } = row;
          const isExpanded = expandedMember === member.memberName;
          const memberActivity = isExpanded ? (result?.activity || []).filter((entry) => entry.memberName === member.memberName) : [];
          return <Fragment key={member.memberName}>
            <tr style={{ background: isExpanded ? '#eff6ff' : undefined }}>
              <td style={{ ...td, fontWeight: 700 }}>
                <button type="button" onClick={() => setExpandedMember(isExpanded ? null : member.memberName)} style={{ border: 0, padding: 0, background: 'transparent', color: '#1e3a8a', font: 'inherit', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>{member.memberName}</button>
              </td>
              <td style={td}>{row.ledgerName ?? <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>NOT MATCHED</span>}</td>
              <td style={right}>{fmt(member.contributions)}</td>
              <td style={right}>{row.ledgerContributions === null ? '-' : fmt(row.ledgerContributions)}</td>
              <td style={right}>{variance(row.contributionDifference)}</td>
              <td style={right}>{fmt(member.distributions)}</td>
              <td style={right}>{row.ledgerDistributions === null ? '-' : fmt(row.ledgerDistributions)}</td>
              <td style={right}>{variance(row.distributionDifference)}</td>
              <td style={right}>{member.transactionCount}</td>
            </tr>
            {isExpanded && <tr><td colSpan={9} style={{ padding: '0 10px 12px', background: '#f8fafc' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Date</th><th style={th}>Type</th><th style={th}>Account detail</th><th style={th}>QuickBooks txn</th><th style={th}>Num</th><th style={th}>Name</th><th style={th}>Memo</th><th style={{ ...th, textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>{memberActivity.map((entry, index) => <tr key={`${entry.txnDate}-${entry.refNo}-${index}`}>
                  <td style={td}>{entry.txnDate}</td>
                  <td style={td}>{ACTIVITY_LABEL[entry.activityType]}</td>
                  <td style={td}>{entry.detail}</td>
                  <td style={td}>{entry.txnType || '-'}</td>
                  <td style={td}>{entry.refNo || '-'}</td>
                  <td style={td}>{entry.payee || '-'}</td>
                  <td style={td}>{entry.memo || '-'}</td>
                  <td style={right}>{fmt(entry.amount)}</td>
                </tr>)}</tbody>
              </table>
            </td></tr>}
          </Fragment>;
        })}</tbody>
        <tfoot><tr style={{ background: '#f8fafc' }}>
          <td style={{ ...td, fontWeight: 800 }}>Total</td>
          <td style={td} />
          <td style={{ ...right, fontWeight: 800 }}>{fmt(totals.qbdContributions)}</td>
          <td style={{ ...right, fontWeight: 800 }}>{fmt(totals.ledgerContributions)}</td>
          <td style={{ ...right, fontWeight: 800 }}>{variance(totals.contributionDifference)}</td>
          <td style={{ ...right, fontWeight: 800 }}>{fmt(totals.qbdDistributions)}</td>
          <td style={{ ...right, fontWeight: 800 }}>{fmt(totals.ledgerDistributions)}</td>
          <td style={{ ...right, fontWeight: 800 }}>{variance(totals.distributionDifference)}</td>
          <td style={{ ...right, fontWeight: 800 }}>{totals.transactions}</td>
        </tr></tfoot>
      </table>
      {unmatched.length > 0 && <div style={{ padding: '10px 18px 14px', fontSize: 12, color: '#92400e' }}>
        {unmatched.length} QuickBooks member{unmatched.length === 1 ? '' : 's'} did not match a ledger member: {unmatched.map((member) => member.memberName).join('; ')}.
      </div>}
    </>}
  </div>;
}
