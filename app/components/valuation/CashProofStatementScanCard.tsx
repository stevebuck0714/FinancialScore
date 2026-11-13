'use client';

import { useState } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import type { StatementScanStatus } from '@/lib/cash-proof/statement-scan';
import { SCAN_STATUS, formatMonthLabel, type CashProofResponse } from './cashProofClient';
import { buttonStyle, cardStyle, tdStyle, thStyle } from './cashProofStyles';

type Money = (value: number | null | undefined) => string;

const PROBLEM_ORDER: StatementScanStatus[] = ['CONFLICT', 'FAILED', 'NEEDS_REVIEW', 'UNMATCHED', 'NO_TEXT', 'PENDING_SCAN', 'APPLIED', 'VERIFIED'];
const NEEDS_ATTENTION = new Set<StatementScanStatus>(['CONFLICT', 'FAILED', 'NEEDS_REVIEW', 'UNMATCHED', 'NO_TEXT']);

export default function CashProofStatementScanCard({ data, money }: { data: CashProofResponse; money: Money }) {
  const scan = data.statementScan;
  const [showAll, setShowAll] = useState(false);
  if (!scan) return null;

  const counts = new Map<StatementScanStatus, number>();
  for (const r of scan.results) counts.set(r.status, (counts.get(r.status) || 0) + 1);
  const attention = scan.results.filter((r) => NEEDS_ATTENTION.has(r.status)).length;
  const rows = [...scan.results]
    .filter((r) => showAll || NEEDS_ATTENTION.has(r.status) || r.status === 'APPLIED')
    .sort((a, b) => PROBLEM_ORDER.indexOf(a.status) - PROBLEM_ORDER.indexOf(b.status) || a.fileName.localeCompare(b.fileName));
  const accountName = (id: string | null) => (id && data.accounts.find((a) => a.id === id)?.accountName) || '—';

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>Statement Reading</div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            {scan.results.length} file{scan.results.length === 1 ? '' : 's'} read {formatEstDateTime(scan.scannedAt)}.{' '}
            {attention > 0 ? `${attention} need${attention === 1 ? 's' : ''} attention.` : 'Nothing needs attention.'} Figures already
            entered are never overwritten.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {PROBLEM_ORDER.filter((s) => counts.get(s)).map((s) => (
            <span
              key={s}
              style={{
                padding: '1px 8px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                background: SCAN_STATUS[s].colors.bg,
                color: SCAN_STATUS[s].colors.fg,
                border: `1px solid ${SCAN_STATUS[s].colors.border}`,
              }}
            >
              {SCAN_STATUS[s].label} {counts.get(s)}
            </span>
          ))}
          <button style={{ ...buttonStyle(), padding: '3px 10px' }} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Hide Matches' : 'Show All'}
          </button>
        </div>
      </div>
      {rows.length > 0 && (
        <div style={{ overflow: 'auto', maxHeight: 360, border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '10px' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>File</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Account</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Month</th>
                <th style={thStyle}>Beginning</th>
                <th style={thStyle}>Deposits</th>
                <th style={thStyle}>Withdrawals</th>
                <th style={thStyle}>Ending</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Result</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.documentId}>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>
                    <a href={`/api/dataroom/documents/${r.documentId}/view`} target="_blank" rel="noreferrer" style={{ color: '#2751d0' }}>
                      {r.fileName}
                    </a>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>
                    {accountName(r.bankAccountId)}
                    {r.parsed?.last4 ? <span style={{ color: '#64748b' }}> · x{r.parsed.last4}</span> : null}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left' }}>{r.month ? formatMonthLabel(r.month) : '—'}</td>
                  <td style={tdStyle}>{money(r.parsed?.beginning)}</td>
                  <td style={tdStyle}>{money(r.parsed?.deposits)}</td>
                  <td style={tdStyle}>{money(r.parsed?.withdrawals)}</td>
                  <td style={tdStyle}>{money(r.parsed?.ending)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '999px',
                        fontSize: '10px',
                        fontWeight: 700,
                        background: SCAN_STATUS[r.status].colors.bg,
                        color: SCAN_STATUS[r.status].colors.fg,
                        border: `1px solid ${SCAN_STATUS[r.status].colors.border}`,
                      }}
                    >
                      {SCAN_STATUS[r.status].label}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'normal', minWidth: 280 }}>{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
