'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import {
  TAX_RETURN_BASIS_LABELS,
  TAX_RETURN_FORMS,
  TAX_RETURN_FORM_ORDER,
  TAX_RETURN_STATUS_LABELS,
  type TaxReturnComparison,
} from '@/lib/cash-proof/tax-return';
import type { TaxReturnScanStatus } from '@/lib/cash-proof/tax-return-scan';
import { TAX_RETURN_STATUS_COLORS, TAX_SCAN_STATUS, formatPercent, type CashProofResponse } from './cashProofClient';
import { buttonStyle, cardStyle, inputStyle, stickyCol, tdStyle, thStyle } from './cashProofStyles';

type Money = (value: number | null | undefined) => string;
type Run = (label: string, body: Record<string, unknown>) => Promise<boolean>;
type AmountField = 'grossReceipts' | 'returnsAllowances';

const sectionHeading: CSSProperties = { fontSize: '14px', fontWeight: 600, color: '#1e293b' };
const NEEDS_ATTENTION = new Set<TaxReturnScanStatus>(['CONFLICT', 'FAILED', 'NEEDS_REVIEW', 'NO_TEXT']);
const SCAN_ORDER: TaxReturnScanStatus[] = [
  'CONFLICT',
  'FAILED',
  'NEEDS_REVIEW',
  'NO_TEXT',
  'PENDING_SCAN',
  'OUT_OF_PERIOD',
  'APPLIED',
  'VERIFIED',
  'NOT_A_RETURN',
];

function Badge({ colors, label }: { colors: { bg: string; fg: string; border: string }; label: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 6px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: 700,
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.border}`,
      }}
    >
      {label}
    </span>
  );
}

export default function CashProofTaxReturnCard({
  data,
  canEdit,
  busy,
  run,
  money,
}: {
  data: CashProofResponse;
  canEdit: boolean;
  busy: string | null;
  run: Run;
  money: Money;
}) {
  const engagement = data.engagement!;
  const years = data.taxReturns;
  const scan = data.taxReturnScan;
  const [editing, setEditing] = useState<{ key: string; field: AmountField; value: string } | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [showAllFiles, setShowAllFiles] = useState(false);
  const tolerancePct = data.revenueReconciliation?.tolerancePct ?? engagement.revenueTolerancePct;

  const save = (key: string, patch: Record<string, unknown>) =>
    run('tax-return', { action: 'set-tax-return', engagementId: engagement.id, periodKey: key, ...patch });

  const amountCell = (y: TaxReturnComparison, field: AmountField, topBorder: boolean) => {
    const value = y.entry?.[field] ?? null;
    const isEditing = editing?.key === y.key && editing.field === field;
    return (
      <td
        key={y.key}
        onDoubleClick={() => canEdit && setEditing({ key: y.key, field, value: value === null ? '' : String(value) })}
        title={canEdit ? 'Double-click to enter the figure from the return.' : undefined}
        style={{
          ...tdStyle,
          cursor: canEdit ? 'text' : 'default',
          color: value === null ? '#94a3b8' : tdStyle.color,
          borderTop: topBorder ? '2px solid #e2e8f0' : undefined,
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
              const next = editing.value.trim();
              setEditing(null);
              if (next === (value === null ? '' : String(value))) return;
              await save(y.key, { [field]: next === '' ? null : next });
            }}
            style={{ ...inputStyle, width: 120, textAlign: 'right' }}
          />
        ) : value === null ? (
          '—'
        ) : (
          <span style={{ fontStyle: y.entry?.source === 'entered' ? 'italic' : undefined }}>
            {money(field === 'returnsAllowances' ? -value : value)}
          </span>
        )}
      </td>
    );
  };

  const rows: Array<{
    label: string;
    emphasis?: boolean;
    topBorder?: boolean;
    /** The cell renders its own <td>. */
    ownCell?: boolean;
    cell: (y: TaxReturnComparison) => ReactNode;
  }> = [
    {
      label: 'Form',
      cell: (y) =>
        canEdit ? (
          <select
            value={y.entry?.form || ''}
            disabled={!!busy}
            onChange={(e) => save(y.key, { form: e.target.value || null })}
            style={{ ...inputStyle, padding: '3px 6px', fontSize: '11px' }}
          >
            <option value="">Select…</option>
            {TAX_RETURN_FORM_ORDER.map((f) => (
              <option key={f} value={f}>
                {TAX_RETURN_FORMS[f].label}
              </option>
            ))}
          </select>
        ) : y.entry?.form ? (
          TAX_RETURN_FORMS[y.entry.form].label
        ) : (
          '—'
        ),
    },
    {
      label: 'Accounting Method',
      cell: (y) =>
        canEdit ? (
          <select
            value={y.entry?.basis || 'ACCRUAL'}
            disabled={!!busy}
            title="Cash-basis returns are compared with customer receipts from the bank; accrual-basis returns with book revenue"
            onChange={(e) => save(y.key, { basis: e.target.value })}
            style={{ ...inputStyle, padding: '3px 6px', fontSize: '11px' }}
          >
            {Object.entries(TAX_RETURN_BASIS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          TAX_RETURN_BASIS_LABELS[y.entry?.basis || 'ACCRUAL']
        ),
    },
    { label: 'Gross Receipts or Sales', topBorder: true, ownCell: true, cell: (y) => amountCell(y, 'grossReceipts', true) },
    { label: 'Less: Returns and Allowances', ownCell: true, cell: (y) => amountCell(y, 'returnsAllowances', false) },
    { label: 'Tax Return Revenue', emphasis: true, cell: (y) => money(y.taxRevenue) },
    { label: 'Reported Revenue (Books)', topBorder: true, cell: (y) => money(y.reportedRevenue) },
    {
      label: 'Difference (Books − Tax Return)',
      emphasis: true,
      cell: (y) => (y.bookDifference === null ? '—' : `${money(y.bookDifference)} (${formatPercent(y.bookVariancePct)})`),
    },
    { label: 'Customer Receipts (Bank Deposits)', topBorder: true, cell: (y) => money(y.customerReceipts) },
    {
      label: 'Difference (Deposits − Tax Return)',
      emphasis: true,
      cell: (y) =>
        y.depositsDifference === null ? '—' : `${money(y.depositsDifference)} (${formatPercent(y.depositsVariancePct)})`,
    },
    {
      label: 'Tested Against',
      topBorder: true,
      cell: (y) => (y.taxRevenue === null ? '—' : y.comparedTo === 'DEPOSITS' ? 'Bank deposits' : 'Books'),
    },
    {
      label: 'Status',
      cell: (y) => (
        <>
          <Badge colors={TAX_RETURN_STATUS_COLORS[y.status]} label={TAX_RETURN_STATUS_LABELS[y.status]} />
          {y.status === 'INCOMPLETE' && (
            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '4px', maxWidth: 220, whiteSpace: 'normal', lineHeight: 1.4 }}>
              {y.comparedTo === 'DEPOSITS'
                ? `${y.missingDeposits} statement${y.missingDeposits === 1 ? '' : 's'} in ${y.label} still missing deposits. Enter them in Deposits to Revenue, or set the method to Accrual if the return was filed on the accrual basis.`
                : `No revenue in the books for ${y.label}. Refresh Book Balances, or set the method to Cash if the return was filed on the cash basis.`}
            </div>
          )}
        </>
      ),
    },
    {
      label: 'Return',
      cell: (y) => {
        const docId = y.entry?.dataRoomDocumentId || '';
        if (canEdit) {
          return (
            <select
              value={docId}
              disabled={!!busy}
              onChange={(e) => save(y.key, { dataRoomDocumentId: e.target.value || null })}
              style={{ ...inputStyle, padding: '3px 6px', fontSize: '11px', maxWidth: 200 }}
            >
              <option value="">No file linked</option>
              {data.taxReturnDocuments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.originalFileName}
                </option>
              ))}
            </select>
          );
        }
        const doc = data.taxReturnDocuments.find((d) => d.id === docId);
        return doc ? (
          <a href={`/api/dataroom/documents/${doc.id}/view`} target="_blank" rel="noreferrer" style={{ color: '#2751d0' }}>
            {doc.originalFileName}
          </a>
        ) : (
          '—'
        );
      },
    },
    ...(canEdit
      ? [
          {
            label: 'Reset',
            topBorder: true,
            cell: (y: TaxReturnComparison) => (
              <button
                style={{ ...buttonStyle(), padding: '3px 10px' }}
                disabled={!!busy || !y.entry}
                title="Clears this year's form, figures, linked return, and explanation. The accounting method is kept. Then press Read Tax Returns to read the return again."
                onClick={() => {
                  if (window.confirm(`Reset ${y.label}? Its form, figures, linked return, and explanation are cleared.`)) {
                    save(y.key, { reset: true });
                  }
                }}
              >
                Reset {y.label}
              </button>
            ),
          },
        ]
      : []),
  ];

  const notePeriods = years.filter((y) => y.status === 'VARIANCE' || y.status === 'EXPLAINED' || y.status === 'INCOMPLETE');
  const scanRows = scan
    ? [...scan.results]
        .filter((r) => showAllFiles || r.status !== 'NOT_A_RETURN')
        .sort((a, b) => SCAN_ORDER.indexOf(a.status) - SCAN_ORDER.indexOf(b.status) || a.fileName.localeCompare(b.fileName))
    : [];
  const attention = scan ? scan.results.filter((r) => NEEDS_ATTENTION.has(r.status)).length : 0;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={sectionHeading}>Tax Return Revenue</div>
          <p style={{ fontSize: '12px', color: '#475569', margin: '6px 0 0', lineHeight: 1.5 }}>
            Gross receipts from each fiscal year&apos;s business income tax return, compared with revenue in the books and
            with customer receipts from the bank. Read Tax Returns fills in the figures from returns in the Data Room{' '}
            <strong>Tax</strong> folder. Cash-basis returns are tested against bank deposits; accrual-basis returns against
            the books.
          </p>
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap' }}>
          Tolerance {tolerancePct}% of tax return revenue per fiscal year.
        </div>
      </div>

      {years.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '10px' }}>
          The review period has no complete fiscal year to compare with a tax return.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '10px' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, ...stickyCol(260), background: '#f8fafc' }} />
                {years.map((y) => (
                  <th key={y.key} style={thStyle}>
                    {y.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td
                    style={{
                      ...tdStyle,
                      ...stickyCol(260),
                      fontWeight: row.emphasis ? 700 : 600,
                      borderTop: row.topBorder ? '2px solid #e2e8f0' : undefined,
                    }}
                  >
                    {row.label}
                  </td>
                  {years.map((y) => {
                    const content = row.cell(y);
                    if (row.ownCell) return content;
                    return (
                      <td
                        key={y.key}
                        style={{
                          ...tdStyle,
                          fontWeight: row.emphasis ? 700 : 400,
                          borderTop: row.topBorder ? '2px solid #e2e8f0' : undefined,
                        }}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
        Double-click a gross receipts or returns cell to enter it by hand (shown in italics). A fiscal year reconciles when
        the tested difference is within {tolerancePct}% of tax return revenue. A larger difference needs a written explanation
        before the cash proof can be locked; a year with no return entered does not block locking but prints as not provided.
      </div>

      {notePeriods.length > 0 && (
        <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
          {notePeriods.map((y) => {
            const draft = noteDrafts[y.key] ?? y.entry?.note ?? '';
            const difference = y.comparedTo === 'DEPOSITS' ? y.depositsDifference : y.bookDifference;
            const variancePct = y.comparedTo === 'DEPOSITS' ? y.depositsVariancePct : y.bookVariancePct;
            return (
              <div key={y.key} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, color: '#1e293b' }}>
                  {y.label} <Badge colors={TAX_RETURN_STATUS_COLORS[y.status]} label={TAX_RETURN_STATUS_LABELS[y.status]} />
                  <span style={{ fontWeight: 400, color: '#64748b' }}>
                    {difference === null
                      ? y.comparedTo === 'DEPOSITS'
                        ? 'Statement deposits are still missing for this year.'
                        : 'Reported revenue is missing from the books.'
                      : `Difference ${money(difference)} (${formatPercent(variancePct)}) against ${y.comparedTo === 'DEPOSITS' ? 'bank deposits' : 'the books'}`}
                  </span>
                </div>
                <textarea
                  value={draft}
                  disabled={!canEdit}
                  rows={2}
                  placeholder="Explain the difference (for example: year-end accruals booked after the return was filed, revenue reported on a different basis, other income included on line 1a)."
                  onChange={(e) => setNoteDrafts({ ...noteDrafts, [y.key]: e.target.value })}
                  style={{ ...inputStyle, marginTop: '6px', resize: 'vertical' }}
                />
                {canEdit && draft !== (y.entry?.note ?? '') && (
                  <button
                    style={{ ...buttonStyle('primary', !!busy), marginTop: '6px' }}
                    disabled={!!busy}
                    onClick={async () => {
                      const ok = await save(y.key, { note: draft });
                      if (ok) {
                        setNoteDrafts((current) => {
                          const next = { ...current };
                          delete next[y.key];
                          return next;
                        });
                      }
                    }}
                  >
                    {busy === 'tax-return' ? 'Saving…' : 'Save Explanation'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {scan && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ ...sectionHeading, fontSize: '13px' }}>Tax Return Reading</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                {scan.results.length} file{scan.results.length === 1 ? '' : 's'} read {formatEstDateTime(scan.scannedAt)}.{' '}
                {attention > 0 ? `${attention} need${attention === 1 ? 's' : ''} attention.` : 'Nothing needs attention.'} Figures
                already entered are never overwritten. Change a year&apos;s form in the Form row above; to read a year again, press
                its Reset button above, then Read Tax Returns.
              </div>
            </div>
            <button style={{ ...buttonStyle(), padding: '3px 10px' }} onClick={() => setShowAllFiles(!showAllFiles)}>
              {showAllFiles ? 'Hide Other Files' : 'Show All'}
            </button>
          </div>
          {scanRows.length > 0 && (
            <div style={{ overflow: 'auto', maxHeight: 300, border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '8px' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left' }}>File</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Form Read</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Fiscal Year</th>
                    <th style={thStyle}>Gross Receipts</th>
                    <th style={thStyle}>Returns and Allowances</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Result</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {scanRows.map((r) => (
                    <tr key={r.documentId}>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>
                        <a href={`/api/dataroom/documents/${r.documentId}/view`} target="_blank" rel="noreferrer" style={{ color: '#2751d0' }}>
                          {r.fileName}
                        </a>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>{r.parsed?.form ? TAX_RETURN_FORMS[r.parsed.form].label : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'left' }}>{r.periodKey || '—'}</td>
                      <td style={tdStyle}>{money(r.parsed?.grossReceipts)}</td>
                      <td style={tdStyle}>{money(r.parsed?.returnsAllowances)}</td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <Badge colors={TAX_SCAN_STATUS[r.status].colors} label={TAX_SCAN_STATUS[r.status].label} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'normal', minWidth: 280 }}>{r.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
