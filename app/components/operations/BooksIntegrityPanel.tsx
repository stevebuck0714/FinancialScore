'use client';

import { useMemo, useState } from 'react';
import { accountTypeIs, balanceAt, balanceChecks, isConstructionLoan, toReportLines, type ReportLine } from '@/lib/real-estate/quickbooks-report-lines';

type Props = {
  lines: unknown[];
  quickBooksLines: unknown[];
  mappings: Array<{ financialFeed: string; accountCode: string }>;
  quickBooksMappings: Array<{ financialFeed: string; accountCode: string }>;
  bgahSource: 'QUICKBOOKS' | 'WORKBOOK';
  fmt: (value: unknown) => string;
};

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 };
const th: React.CSSProperties = { padding: '9px 10px', textAlign: 'left', fontSize: 11, color: '#475569', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' };
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 };
const num: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const sectionTitle: React.CSSProperties = { margin: '16px 0 8px', fontSize: 13 };
const toggleButton: React.CSSProperties = { marginTop: 8, border: 0, borderRadius: 6, background: '#eff6ff', color: '#1e3a8a', padding: '6px 9px', fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const statusColor = { Balanced: '#166534', Partial: '#475569', 'Out of balance': '#b91c1c' } as const;

/** Exceptions to clear before the BGAH and SLN books are combined. */
export default function BooksIntegrityPanel({ lines, quickBooksLines, mappings, quickBooksMappings, bgahSource, fmt }: Props) {
  const [showAllChecks, setShowAllChecks] = useState(false);
  const reportLines = useMemo(() => toReportLines(lines), [lines]);
  const qbLines = useMemo(() => toReportLines(quickBooksLines), [quickBooksLines]);
  const slnLines = useMemo(() => reportLines.filter((line) => line.sourceEntity === 'SLN'), [reportLines]);
  const bgahWorkbookLines = useMemo(() => bgahSource === 'WORKBOOK' ? reportLines.filter((line) => line.sourceEntity === 'BGAH') : [], [reportLines, bgahSource]);
  const bgahBooks = qbLines.length ? qbLines : bgahWorkbookLines;

  const checks = useMemo(() => balanceChecks([
    { label: 'SLN', lines: slnLines },
    ...(bgahWorkbookLines.length ? [{ label: 'BGAH workbook', lines: bgahWorkbookLines }] : []),
    ...(qbLines.length ? [{ label: 'BGAH QuickBooks', lines: qbLines }] : []),
  ]), [slnLines, bgahWorkbookLines, qbLines]);
  const exceptions = checks.filter((row) => row.status !== 'Balanced');
  const checkSummary = ['SLN', 'BGAH workbook', 'BGAH QuickBooks'].map((source) => {
    const rows = checks.filter((row) => row.source === source);
    return rows.length ? { source, total: rows.length, balanced: rows.filter((row) => row.status === 'Balanced').length, partial: rows.filter((row) => row.status === 'Partial').length } : null;
  }).filter(Boolean) as Array<{ source: string; total: number; balanced: number; partial: number }>;

  const intercompanyRows = useMemo(() => {
    const isDueToSln = (line: ReportLine) => /due to\/?from sln|due (to|from) sln/i.test(line.accountName);
    const isTransferToOwner = (line: ReportLine) => /transfer to owner/i.test(line.accountName);
    const periods = [...new Set(bgahBooks.filter((line) => line.reportType === 'BALANCE' && isDueToSln(line)).map((line) => line.periodEnd))]
      .filter((period) => slnLines.some((line) => line.reportType === 'BALANCE' && line.periodEnd === period && isTransferToOwner(line)))
      .sort();
    return periods.map((periodEnd) => {
      const bgah = balanceAt(bgahBooks, periodEnd, isDueToSln);
      const sln = balanceAt(slnLines, periodEnd, isTransferToOwner);
      return { periodEnd, bgah, sln, difference: Math.abs(bgah) - Math.abs(sln) };
    });
  }, [bgahBooks, slnLines]);

  const unmappedByFeed = useMemo(() => {
    const feeds: Array<{ feed: string; label: string; lines: ReportLine[]; mapped: Set<string> }> = [
      { feed: 'SLN', label: 'SLN', lines: slnLines, mapped: new Set(mappings.filter((mapping) => mapping.financialFeed === 'SLN').map((mapping) => mapping.accountCode)) },
      ...(bgahWorkbookLines.length ? [{ feed: 'BGAH', label: 'BGAH workbook', lines: bgahWorkbookLines, mapped: new Set(mappings.filter((mapping) => mapping.financialFeed === 'BGAH').map((mapping) => mapping.accountCode)) }] : []),
      ...(qbLines.length ? [{ feed: 'QBD', label: 'BGAH QuickBooks (QBD feed)', lines: qbLines, mapped: new Set(quickBooksMappings.map((mapping) => mapping.accountCode)) }] : []),
    ];
    return feeds.map(({ label, lines: feedLines, mapped }) => {
      const accounts = new Map<string, { accountCode: string; accountName: string; accountType: string }>();
      feedLines.forEach((line) => {
        if (line.reportType !== 'ACTIVITY' || mapped.has(line.accountCode) || Math.abs(line.amount) < 0.005) return;
        accounts.set(line.accountCode, { accountCode: line.accountCode, accountName: line.accountName, accountType: line.accountType });
      });
      return { label, accounts: [...accounts.values()].sort((a, b) => a.accountName.localeCompare(b.accountName)) };
    });
  }, [slnLines, bgahWorkbookLines, qbLines, mappings, quickBooksMappings]);

  const cashBasisItems = useMemo(() => {
    const latest = qbLines.filter((line) => line.reportType === 'BALANCE').map((line) => line.periodEnd).sort().at(-1);
    if (!latest) return { latest: null as string | null, rows: [] as ReportLine[] };
    const rows = qbLines.filter((line) =>
      line.reportType === 'BALANCE' &&
      line.periodEnd === latest &&
      Math.abs(line.amount) >= 0.5 &&
      accountTypeIs(line, 'accountsreceivable', 'accountspayable', 'othercurrentliability') &&
      !isConstructionLoan(line));
    return { latest, rows };
  }, [qbLines]);

  const visibleChecks = showAllChecks ? checks : exceptions;
  return <div style={card}>
    <h3 style={{ margin: 0 }}>Books Integrity Exceptions</h3>
    <p style={{ color: '#475569', margin: '6px 0 0', fontSize: 13 }}>Out-of-balance balance sheets, BGAH / SLN intercompany differences, unmapped accounts, and accrual balances to clear before the books are combined.</p>

    <h4 style={sectionTitle}>Balance sheet checks</h4>
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: '#475569' }}>
      {checkSummary.map((row) => <span key={row.source}><strong>{row.source}:</strong> {row.balanced} of {row.total} month-ends balance{row.partial ? `, ${row.partial} partial (no equity accounts)` : ''}</span>)}
      {!checkSummary.length && <span>No balance sheet lines are loaded.</span>}
    </div>
    {visibleChecks.length > 0 && <div style={{ overflowX: 'auto', marginTop: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
        <thead><tr><th style={th}>Source</th><th style={th}>Month-end</th><th style={{ ...th, textAlign: 'right' }}>Assets</th><th style={{ ...th, textAlign: 'right' }}>Liabilities + equity</th><th style={{ ...th, textAlign: 'right' }}>Difference</th><th style={th}>Status</th></tr></thead>
        <tbody>{visibleChecks.map((row) => <tr key={`${row.source}-${row.periodEnd}`}>
          <td style={{ ...td, fontWeight: 700 }}>{row.source}</td>
          <td style={td}>{row.periodEnd}</td>
          <td style={num}>{fmt(row.assets)}</td>
          <td style={num}>{fmt(row.liabilitiesAndEquity)}</td>
          <td style={{ ...num, color: statusColor[row.status] }}>{fmt(row.difference)}</td>
          <td style={{ ...td, color: statusColor[row.status], fontWeight: 700 }}>{row.status}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {checks.length > 0 && <button type="button" style={toggleButton} onClick={() => setShowAllChecks((current) => !current)}>{showAllChecks ? 'Show exceptions only' : `Show all ${checks.length} month-ends`}</button>}

    <h4 style={sectionTitle}>BGAH / SLN intercompany</h4>
    {intercompanyRows.length ? <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
        <thead><tr><th style={th}>Month-end</th><th style={{ ...th, textAlign: 'right' }}>BGAH Due to/from SLN</th><th style={{ ...th, textAlign: 'right' }}>SLN Transfer to Owner</th><th style={{ ...th, textAlign: 'right' }}>Difference</th></tr></thead>
        <tbody>{intercompanyRows.map((row) => <tr key={row.periodEnd}>
          <td style={td}>{row.periodEnd}</td>
          <td style={num}>{fmt(row.bgah)}</td>
          <td style={num}>{fmt(row.sln)}</td>
          <td style={{ ...num, color: Math.abs(row.difference) < 1 ? '#166534' : '#b91c1c' }}>{fmt(row.difference)}</td>
        </tr>)}</tbody>
      </table>
      <p style={{ color: '#64748b', fontSize: 12, margin: '6px 0 0' }}>Difference compares the size of the two balances; they should offset when the entities are combined.</p>
    </div> : <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>No month has both a BGAH Due to/from SLN balance and an SLN Transfer to Owner balance.</p>}

    <h4 style={sectionTitle}>Unmapped income and expense accounts</h4>
    {unmappedByFeed.map(({ label, accounts }) => <div key={label} style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>
      <strong>{label}:</strong> {accounts.length ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} with activity are not mapped in Site Admin → Data Mapping — ${accounts.slice(0, 8).map((account) => account.accountName).join('; ')}${accounts.length > 8 ? `; and ${accounts.length - 8} more` : ''}` : 'every account with activity is mapped.'}
    </div>)}

    <h4 style={sectionTitle}>Accrual balances not on the cash-basis statements</h4>
    {cashBasisItems.rows.length ? <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
        <thead><tr><th style={th}>QuickBooks account</th><th style={th}>Type</th><th style={{ ...th, textAlign: 'right' }}>Balance at {cashBasisItems.latest}</th></tr></thead>
        <tbody>{cashBasisItems.rows.map((row) => <tr key={row.accountCode}><td style={{ ...td, fontWeight: 700 }}>{row.accountName}</td><td style={td}>{row.accountType}</td><td style={num}>{fmt(row.amount)}</td></tr>)}</tbody>
      </table>
      <p style={{ color: '#64748b', fontSize: 12, margin: '6px 0 0' }}>QuickBooks carries these receivables, payables, and accruals; the client&apos;s cash-basis statements leave them out.</p>
    </div> : <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>{qbLines.length ? 'QuickBooks has no receivable, payable, or accrued balances at the latest month-end.' : 'Connect QuickBooks Desktop to compare accrual balances.'}</p>}
  </div>;
}
