'use client';

type LedgerEntry = {
  entryType: string;
  amount: number | string;
  effectiveDate: string;
  reference?: string | null;
  notes?: string | null;
};

type Investor = {
  id: string;
  legalName: string;
  entries?: LedgerEntry[];
};

type Props = {
  investors: Investor[];
  aliases: Array<{ alias: string; investorId: string }>;
  fmt: (value: unknown) => string;
};

type Transfer = {
  effectiveDate: string;
  amount: number;
  transferor: string | null;
  transferee: string | null;
  transfereeId: string | null;
  reference: string | null;
  notes: string | null;
};

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 };
const th: React.CSSProperties = { padding: '9px 10px', textAlign: 'left', fontSize: 11, color: '#475569', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' };
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13, verticalAlign: 'top' };
const amountCell: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 700 };

function dateLabel(value: string) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return String(value || '—');
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${day}, ${year}`;
}

function sameTransfer(left: LedgerEntry, right: LedgerEntry) {
  const leftReference = String(left.reference || '').trim();
  const rightReference = String(right.reference || '').trim();
  return String(left.effectiveDate || '').slice(0, 10) === String(right.effectiveDate || '').slice(0, 10)
    && Math.abs(Number(left.amount || 0)) === Math.abs(Number(right.amount || 0))
    && (!leftReference || !rightReference || leftReference === rightReference);
}

export default function InvestorOwnershipTransfersPanel({ investors, aliases, fmt }: Props) {
  const incoming = investors.flatMap((investor) => (investor.entries || [])
    .filter((entry) => entry.entryType === 'OWNERSHIP_TRANSFER_IN')
    .map((entry) => ({ investor, entry })));
  const outgoing = investors.flatMap((investor) => (investor.entries || [])
    .filter((entry) => entry.entryType === 'OWNERSHIP_TRANSFER_OUT')
    .map((entry) => ({ investor, entry })));
  const matchedOutgoing = new Set<number>();
  const transfers: Transfer[] = incoming.map(({ investor, entry }) => {
    const outgoingIndex = outgoing.findIndex(({ entry: candidate }, index) => !matchedOutgoing.has(index) && sameTransfer(entry, candidate));
    if (outgoingIndex >= 0) matchedOutgoing.add(outgoingIndex);
    const source = outgoingIndex >= 0 ? outgoing[outgoingIndex] : null;
    return {
      effectiveDate: entry.effectiveDate,
      amount: Math.abs(Number(entry.amount || 0)),
      transferor: source?.investor.legalName || null,
      transferee: investor.legalName,
      transfereeId: investor.id,
      reference: entry.reference || source?.entry.reference || null,
      notes: entry.notes || source?.entry.notes || null,
    };
  });
  outgoing.forEach(({ investor, entry }, index) => {
    if (matchedOutgoing.has(index)) return;
    transfers.push({
      effectiveDate: entry.effectiveDate,
      amount: Math.abs(Number(entry.amount || 0)),
      transferor: investor.legalName,
      transferee: null,
      transfereeId: null,
      reference: entry.reference || null,
      notes: entry.notes || null,
    });
  });
  transfers.sort((left, right) => left.effectiveDate.localeCompare(right.effectiveDate));

  if (!transfers.length) return null;

  const aliasesByInvestorId = new Map<string, string[]>();
  for (const alias of aliases) {
    const values = aliasesByInvestorId.get(alias.investorId) || [];
    values.push(alias.alias);
    aliasesByInvestorId.set(alias.investorId, values);
  }

  return <div style={card}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h3 style={{ margin: 0 }}>Non-Cash Ownership Transfers</h3>
        <p style={{ color: '#64748b', margin: '6px 0 0', fontSize: 13 }}>Transfers reallocate member capital between investors. They do not represent cash contributed to or distributed by Benns Grant, so they are not expected in QuickBooks member activity.</p>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#1e3a8a', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 999, padding: '3px 9px', textTransform: 'uppercase' }}>Member ledger basis</span>
    </div>
    <div style={{ overflowX: 'auto', marginTop: 12 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1040 }}>
        <thead><tr><th style={th}>Effective date</th><th style={th}>Transferor</th><th style={th}>Transferee</th><th style={th}>QuickBooks name</th><th style={{ ...th, textAlign: 'right' }}>Capital transferred</th><th style={{ ...th, textAlign: 'right' }}>Cash to company</th><th style={th}>Ledger reference</th></tr></thead>
        <tbody>{transfers.map((transfer, index) => {
          const quickBooksNames = transfer.transfereeId ? aliasesByInvestorId.get(transfer.transfereeId) || [] : [];
          return <tr key={`${transfer.effectiveDate}-${transfer.transferor}-${transfer.transferee}-${index}`}>
            <td style={td}>{dateLabel(transfer.effectiveDate)}</td>
            <td style={{ ...td, fontWeight: 700 }}>{transfer.transferor || 'Unmatched transferor'}</td>
            <td style={{ ...td, fontWeight: 700 }}>{transfer.transferee || 'Unmatched transferee'}</td>
            <td style={td}>{quickBooksNames.length ? quickBooksNames.join(' · ') : '—'}</td>
            <td style={amountCell}>{fmt(transfer.amount)}</td>
            <td style={amountCell}>{fmt(0)}</td>
            <td style={td}>{transfer.reference || '—'}{transfer.notes && <div style={{ marginTop: 3, color: '#64748b', fontSize: 11 }}>{transfer.notes}</div>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}
