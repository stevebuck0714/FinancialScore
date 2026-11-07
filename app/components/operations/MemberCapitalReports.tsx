'use client';

import { useMemo, useState } from 'react';
import { memberCapitalByYear, toReportLines } from '@/lib/real-estate/quickbooks-report-lines';

type Props = {
  quickBooksLines: unknown[];
  investors: Array<{ id: string; legalName: string; memberGroup?: string | null; ownershipPercentage?: number | string | null }>;
  aliases: Array<{ alias: string; investorId: string }>;
  unpaidFor: (investorId: string) => { preferred: number | null; evenUp: number | null };
  waterfallReady: boolean;
  showRollforward: boolean;
  showStatements: boolean;
  fmt: (value: unknown) => string;
};

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 };
const th: React.CSSProperties = { padding: '9px 10px', textAlign: 'left', fontSize: 11, color: '#475569', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' };
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 };
const num: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const totalNum: React.CSSProperties = { ...num, fontWeight: 800 };
const selectStyle: React.CSSProperties = { minWidth: 150, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6 };
const labelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' };
const quickBooksBasisBadge = <span style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 999, padding: '3px 9px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>QuickBooks basis</span>;
const preliminaryBadge = <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 999, padding: '3px 9px', textTransform: 'uppercase' }}>Preliminary</span>;

/** Annual capital account rollforward and member statements from the QuickBooks member equity accounts. */
export default function MemberCapitalReports({ quickBooksLines, investors, aliases, unpaidFor, waterfallReady, showRollforward, showStatements, fmt }: Props) {
  const capital = useMemo(() => memberCapitalByYear(
    toReportLines(quickBooksLines),
    investors.map((investor) => ({ id: investor.id, legalName: investor.legalName, ownershipPercentage: investor.ownershipPercentage == null ? null : Number(investor.ownershipPercentage) })),
    aliases,
  ), [quickBooksLines, investors, aliases]);
  const [yearChoice, setYearChoice] = useState<number | null>(null);
  const [memberChoice, setMemberChoice] = useState<string>('');
  const year = yearChoice ?? capital.years.at(-1) ?? null;
  const member = capital.members.find((item) => item.member === memberChoice) || capital.members[0] || null;
  const investorName = (investorId: string | null) => investors.find((investor) => investor.id === investorId)?.legalName || null;

  if (!capital.members.length) {
    const empty = <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: 13 }}>Connect QuickBooks Desktop and run Rebuild Daily Financials to load member equity accounts.</p>;
    return <>
      {showRollforward && <div style={card}><h3 style={{ margin: 0 }}>Annual Capital Account Rollforward</h3>{empty}</div>}
      {showStatements && <div style={card}><h3 style={{ margin: 0 }}>Member Statements</h3>{empty}</div>}
    </>;
  }

  const yearRows = capital.members.map((item) => ({ ...item, row: item.years.find((entry) => entry.year === year)! })).filter((item) => item.row);
  const sum = (pick: (row: (typeof yearRows)[number]['row']) => number | null) => yearRows.reduce((total, item) => total + (pick(item.row) || 0), 0);
  const bookIncome = year == null ? 0 : capital.bookIncomeByYear.get(year) || 0;
  const unmatched = capital.members.filter((item) => !item.investorId);
  const incomeShareToDate = member ? member.years.reduce((total, entry) => total + (entry.incomeShare || 0), 0) : 0;
  const capitalToDate = member ? member.toDate.contributions + member.toDate.distributions + member.toDate.other : 0;
  const unpaid = member?.investorId ? unpaidFor(member.investorId) : { preferred: null, evenUp: null };

  return <>
    {showRollforward && <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>Annual Capital Account Rollforward</h3>
          <p style={{ color: '#475569', margin: '6px 0 0', fontSize: 13 }}>Each member&apos;s QuickBooks equity accounts by year: opening balance, contributions, distributions, and closing balance. QuickBooks does not record deemed capital, so Land Contributor and Sponsor Group balances are lower than in the Member Capital Rollforward. Book income is shared pro rata by ownership until the Operating Agreement §9.1 allocation is confirmed.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>{quickBooksBasisBadge}{preliminaryBadge}</div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <label style={labelStyle}>Year<select value={year ?? ''} onChange={(event) => setYearChoice(Number(event.target.value))} style={selectStyle}>{capital.years.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
          <thead><tr><th style={th}>Member (QuickBooks)</th><th style={{ ...th, textAlign: 'right' }}>Ownership</th><th style={{ ...th, textAlign: 'right' }}>Opening</th><th style={{ ...th, textAlign: 'right' }}>Contributions</th><th style={{ ...th, textAlign: 'right' }}>Distributions</th><th style={{ ...th, textAlign: 'right' }}>Other</th><th style={{ ...th, textAlign: 'right' }}>Closing</th><th style={{ ...th, textAlign: 'right' }}>Share of book income</th></tr></thead>
          <tbody>{yearRows.map((item) => <tr key={item.member}>
            <td style={{ ...td, fontWeight: 700 }}>{item.member}{investorName(item.investorId) && investorName(item.investorId) !== item.member && <div style={{ marginTop: 3, color: '#64748b', fontSize: 11, fontWeight: 400 }}>{investorName(item.investorId)}</div>}</td>
            <td style={num}>{item.ownershipPct == null ? '—' : `${item.ownershipPct.toFixed(2)}%`}</td>
            <td style={num}>{fmt(item.row.opening)}</td>
            <td style={num}>{fmt(item.row.contributions)}</td>
            <td style={num}>{fmt(item.row.distributions)}</td>
            <td style={num}>{fmt(item.row.other)}</td>
            <td style={{ ...num, fontWeight: 700 }}>{fmt(item.row.closing)}</td>
            <td style={num}>{item.row.incomeShare == null ? '—' : fmt(item.row.incomeShare)}</td>
          </tr>)}</tbody>
          <tfoot><tr style={{ background: '#f8fafc' }}>
            <td style={{ ...td, fontWeight: 800 }}>Total</td>
            <td style={totalNum}>{`${yearRows.reduce((total, item) => total + (item.ownershipPct || 0), 0).toFixed(2)}%`}</td>
            <td style={totalNum}>{fmt(sum((row) => row.opening))}</td>
            <td style={totalNum}>{fmt(sum((row) => row.contributions))}</td>
            <td style={totalNum}>{fmt(sum((row) => row.distributions))}</td>
            <td style={totalNum}>{fmt(sum((row) => row.other))}</td>
            <td style={totalNum}>{fmt(sum((row) => row.closing))}</td>
            <td style={totalNum}>{fmt(sum((row) => row.incomeShare))}</td>
          </tr></tfoot>
        </table>
      </div>
      <div style={{ display: 'grid', gap: 6, marginTop: 12, fontSize: 12, color: '#64748b' }}>
        <div><strong style={{ color: '#475569' }}>{year} book net income (QuickBooks):</strong> {fmt(bookIncome)}. QuickBooks closes it to Retained Earnings rather than to the member accounts, so it is shown beside the closing balance, not inside it.</div>
        {unmatched.length > 0 && <div><strong style={{ color: '#475569' }}>Not matched to the member ledger:</strong> {unmatched.map((item) => item.member).join('; ')}. Their ownership and income share stay blank until the name is matched to a member in Record distribution, which saves it as an alias.</div>}
      </div>
    </div>}
    {showStatements && member && <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>Member Statements</h3>
          <p style={{ color: '#475569', margin: '6px 0 0', fontSize: 13 }}>One member&apos;s ownership, capital account, distributions to date, and unpaid preferred return or even-up. The capital account comes from QuickBooks and excludes deemed capital; see the Member Capital Rollforward for capital under the Operating Agreement.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>{quickBooksBasisBadge}{preliminaryBadge}</div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <label style={labelStyle}>Member<select value={member.member} onChange={(event) => setMemberChoice(event.target.value)} style={{ ...selectStyle, minWidth: 260 }}>{capital.members.map((item) => <option key={item.member} value={item.member}>{item.member}</option>)}</select></label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginTop: 14 }}>
        {[
          ['Ownership', member.ownershipPct == null ? '—' : `${member.ownershipPct.toFixed(2)}%`],
          ['Contributions to date', fmt(member.toDate.contributions)],
          ['Distributions to date', fmt(member.toDate.distributions)],
          ['Capital account (QuickBooks)', fmt(capitalToDate)],
          ['Share of book income to date', member.ownershipPct == null ? '—' : fmt(incomeShareToDate)],
          ['Capital incl. income share', member.ownershipPct == null ? '—' : fmt(capitalToDate + incomeShareToDate)],
          ['Unpaid preferred return', waterfallReady && unpaid.preferred != null ? fmt(unpaid.preferred) : '—'],
          ['Unpaid even-up', waterfallReady && unpaid.evenUp != null ? fmt(unpaid.evenUp) : '—'],
        ].map(([label, value]) => <div key={label} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{label}</div><div style={{ marginTop: 4, fontSize: 20, fontWeight: 800 }}>{value}</div></div>)}
      </div>
      <div style={{ overflowX: 'auto', marginTop: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead><tr><th style={th}>Year</th><th style={{ ...th, textAlign: 'right' }}>Opening</th><th style={{ ...th, textAlign: 'right' }}>Contributions</th><th style={{ ...th, textAlign: 'right' }}>Distributions</th><th style={{ ...th, textAlign: 'right' }}>Other</th><th style={{ ...th, textAlign: 'right' }}>Closing</th><th style={{ ...th, textAlign: 'right' }}>Share of book income</th></tr></thead>
          <tbody>{member.years.map((entry) => <tr key={entry.year}>
            <td style={{ ...td, fontWeight: 700 }}>{entry.year}</td>
            <td style={num}>{fmt(entry.opening)}</td>
            <td style={num}>{fmt(entry.contributions)}</td>
            <td style={num}>{fmt(entry.distributions)}</td>
            <td style={num}>{fmt(entry.other)}</td>
            <td style={{ ...num, fontWeight: 700 }}>{fmt(entry.closing)}</td>
            <td style={num}>{entry.incomeShare == null ? '—' : fmt(entry.incomeShare)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p style={{ color: '#64748b', fontSize: 12, margin: '8px 0 0' }}>Balances as of {member.latestPeriod || '—'} from QuickBooks. {waterfallReady ? 'Unpaid amounts come from the waterfall preview.' : 'Save the Stabilization Date in the waterfall settings to show unpaid preferred return and even-up.'}</p>
    </div>}
  </>;
}
