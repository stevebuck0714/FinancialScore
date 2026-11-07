'use client';

import { useMemo, useState } from 'react';
import { computeWaterfall, type WaterfallEntry, type WaterfallInvestor, type WaterfallResult, type WaterfallSettings } from '@/lib/real-estate/waterfall';
import { matchMember, parseCashFlowReport, type NameMatch } from '@/lib/real-estate/cash-flow-report';
import { useTableSort } from '@/app/components/operations/useTableSort';
import type { QbdInvestorActivityResult } from '@/lib/real-estate/qbd-investor-activity';

type Props = {
  companyId: string;
  investors: WaterfallInvestor[];
  entries: WaterfallEntry[];
  settings: WaterfallSettings;
  aliases: Array<{ alias: string; investorId: string }>;
  waterfall: WaterfallResult;
  asOfDate: string;
  currency: string;
  showWaterfall: boolean;
  onSaved: () => void;
};

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 };
const th: React.CSSProperties = { padding: '9px 10px', textAlign: 'left', fontSize: 11, color: '#475569', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' };
const td: React.CSSProperties = { padding: '9px 10px', borderBottom: '1px solid #f1f5f9', fontSize: 13 };
const num: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const label: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: '#475569' };
const input: React.CSSProperties = { minWidth: 150, padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: 6, font: 'inherit', fontWeight: 400 };
const saveButton = (busy: boolean): React.CSSProperties => ({ padding: '8px 16px', background: busy ? '#9ca3af' : '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 500, cursor: busy ? 'not-allowed' : 'pointer', boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)' });
const secondaryButton: React.CSSProperties = { padding: '8px 14px', background: '#eff6ff', color: '#1e3a8a', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const formatDate = (ymd: string) => {
  const [year, month, day] = ymd.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${day}, ${year}`;
};
const pct = (value: number) => `${value.toFixed(2)}%`;
const MATCH_LABEL: Record<NameMatch['confidence'], { text: string; color: string; background: string }> = {
  saved: { text: 'Saved match', color: '#166534', background: '#dcfce7' },
  exact: { text: 'Exact', color: '#166534', background: '#dcfce7' },
  likely: { text: 'Review', color: '#92400e', background: '#fef3c7' },
  none: { text: 'Not matched', color: '#991b1b', background: '#fee2e2' },
};

export default function RealEstateWaterfallPanel({ companyId, investors, entries, settings, aliases, waterfall, asOfDate, currency, showWaterfall, onSaved }: Props) {
  const fmt = (value: unknown) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const [stabilizationDate, setStabilizationDate] = useState(settings.stabilizationDate || '');
  const [preferredReturnRate, setPreferredReturnRate] = useState(String(settings.preferredReturnRate));
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [selectedEventDate, setSelectedEventDate] = useState<string | null>(null);

  const [reportText, setReportText] = useState('');
  const [quickBooksMonth, setQuickBooksMonth] = useState(() => {
    const [year, month] = asOfDate.split('-').map(Number);
    return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
  });
  const [loadingQuickBooks, setLoadingQuickBooks] = useState(false);
  const [review, setReview] = useState<null | {
    source: 'report' | 'quickbooks';
    parsed: ReturnType<typeof parseCashFlowReport>;
    effectiveDate: string;
    lines: Array<{ payee: string; amount: number; investorId: string; confidence: NameMatch['confidence'] }>;
  }>(null);
  const [savingDistribution, setSavingDistribution] = useState(false);
  const [distributionMessage, setDistributionMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const { sortRows, sortableHeader } = useTableSort(th);
  const investorById = useMemo(() => new Map(investors.map((investor) => [investor.id, investor])), [investors]);
  const sortedInvestors = useMemo(() => [...investors].sort((a, b) => a.legalName.localeCompare(b.legalName)), [investors]);
  const selectedEvent = waterfall.events.find((event) => event.effectiveDate === selectedEventDate) || null;
  const totalUnpaidPreferred = waterfall.balances.reduce((sum, balance) => sum + balance.preferredReturnUnpaid, 0);
  const totalUnpaidEvenUp = waterfall.balances.reduce((sum, balance) => sum + balance.evenUpUnpaid, 0);

  const saveSettings = async () => {
    setSavingSettings(true);
    setSettingsMessage('');
    try {
      const response = await fetch('/api/operations/real-estate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, kind: 'waterfall-settings', stabilizationDate: stabilizationDate || null, preferredReturnRate: Number(preferredReturnRate) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to save waterfall settings.');
      setSettingsMessage('Saved.');
      onSaved();
    } catch (error: any) {
      setSettingsMessage(error.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const reviewReport = () => {
    const parsed = parseCashFlowReport(reportText);
    setDistributionMessage(null);
    setConfirmReplace(false);
    setReview({
      source: 'report',
      parsed,
      effectiveDate: parsed.effectiveDate || '',
      lines: parsed.distributions.map((line) => {
        const match = matchMember(line.label, investors, aliases);
        return { payee: line.label, amount: line.amount, investorId: match.investorId || '', confidence: match.confidence };
      }),
    });
  };

  const loadFromQuickBooks = async () => {
    if (!/^\d{4}-\d{2}$/.test(quickBooksMonth)) return;
    setLoadingQuickBooks(true);
    setDistributionMessage(null);
    setConfirmReplace(false);
    try {
      const response = await fetch(`/api/operations/real-estate/qbd-investor-activity?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
      const payload: QbdInvestorActivityResult & { error?: string } = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to load QuickBooks member activity.');
      const byMember = new Map<string, { amount: number; investorId: string; confidence: NameMatch['confidence'] }>();
      payload.activity
        .filter((entry) => entry.activityType === 'DISTRIBUTION' && entry.txnDate.startsWith(quickBooksMonth))
        .forEach((entry) => {
          const current = byMember.get(entry.memberName) || { amount: 0, investorId: entry.investorId || '', confidence: entry.matchConfidence };
          current.amount += entry.amount;
          byMember.set(entry.memberName, current);
        });
      const [year, month] = quickBooksMonth.split('-').map(Number);
      const periodLabel = `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1]} ${year}`;
      const distributions = [...byMember.entries()]
        .map(([label, line]) => ({ label, amount: Math.round(line.amount * 100) / 100 }))
        .filter((line) => line.amount > 0)
        .sort((a, b) => a.label.localeCompare(b.label));
      const totalDistributions = Math.round(distributions.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
      setReview({
        source: 'quickbooks',
        parsed: {
          periodLabel,
          effectiveDate: `${quickBooksMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`,
          received: [], totalReceived: null, expenses: [], totalExpenses: null,
          distributions, totalDistributions, remainingAfterDistributions: null,
          issues: distributions.length ? [] : [`No member distributions are posted in QuickBooks Desktop for ${periodLabel}.`],
        },
        effectiveDate: `${quickBooksMonth}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`,
        lines: distributions.map((line) => {
          const found = byMember.get(line.label)!;
          return { payee: line.label, amount: line.amount, investorId: found.investorId, confidence: found.investorId ? found.confidence : 'none' };
        }),
      });
    } catch (error: any) {
      setDistributionMessage({ tone: 'error', text: error.message });
    } finally {
      setLoadingQuickBooks(false);
    }
  };

  const reviewTotal = review ? Math.round(review.lines.reduce((sum, line) => sum + line.amount, 0) * 100) / 100 : 0;
  const duplicateMembers = review
    ? review.lines.map((line) => line.investorId).filter((id, index, all) => id && all.indexOf(id) !== index)
    : [];
  const unmatchedCount = review ? review.lines.filter((line) => !line.investorId).length : 0;
  const missingMembers = review ? investors.filter((investor) => investor.ownershipPercentage > 0 && !review.lines.some((line) => line.investorId === investor.id)) : [];
  const existingOnDate = review ? entries.filter((entry) => entry.entryType === 'DISTRIBUTION' && entry.effectiveDate === review.effectiveDate).length : 0;

  const previewEvent = useMemo(() => {
    if (!review || !review.effectiveDate || review.lines.some((line) => !line.investorId)) return null;
    const otherEntries = entries.filter((entry) => !(entry.entryType === 'DISTRIBUTION' && entry.effectiveDate === review.effectiveDate));
    const previewEntries = review.lines.map((line) => ({ investorId: line.investorId, entryType: 'DISTRIBUTION', effectiveDate: review.effectiveDate, amount: line.amount }));
    const result = computeWaterfall(investors, [...otherEntries, ...previewEntries], settings, asOfDate);
    return result.events.find((event) => event.effectiveDate === review.effectiveDate) || null;
  }, [review, entries, investors, settings, asOfDate]);

  const saveDistribution = async (replaceExisting: boolean) => {
    if (!review) return;
    setSavingDistribution(true);
    setDistributionMessage(null);
    try {
      const response = await fetch('/api/operations/real-estate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          kind: 'distribution-batch',
          effectiveDate: review.effectiveDate,
          reference: review.source === 'quickbooks'
            ? `${review.parsed.periodLabel} QuickBooks Desktop member distributions`
            : `${review.parsed.periodLabel || review.effectiveDate} Cash Flow report`,
          replaceExisting,
          lines: review.lines.map((line) => ({ investorId: line.investorId, amount: line.amount, payee: line.payee })),
        }),
      });
      const payload = await response.json();
      if (response.status === 409) {
        setConfirmReplace(true);
        setDistributionMessage({ tone: 'error', text: `${payload.error} Click Replace Distribution to overwrite them.` });
        return;
      }
      if (!response.ok) throw new Error(payload.error || 'Unable to save the distribution.');
      setDistributionMessage({ tone: 'ok', text: `Recorded ${payload.recorded} member distributions for ${formatDate(review.effectiveDate)}.` });
      setReview(null);
      setReportText('');
      setConfirmReplace(false);
      onSaved();
    } catch (error: any) {
      setDistributionMessage({ tone: 'error', text: error.message });
    } finally {
      setSavingDistribution(false);
    }
  };

  const canSave = Boolean(review && review.effectiveDate && review.lines.length && !unmatchedCount && !duplicateMembers.length);

  return <>
    {showWaterfall && <div style={{ ...card, display: 'grid', gap: 14 }}>
      <div>
        <h3 style={{ margin: 0 }}>Distribution waterfall</h3>
        <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>
          Operating Agreement §8.1: member loans, then the Land Contributor Preferred Return, then the Even-Up Amount to all other Owners, then the balance by Ownership Percentage. Balances as of {formatDate(asOfDate)} EST.
        </p>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={label}>Stabilization Date<input type="date" value={stabilizationDate} onChange={(event) => setStabilizationDate(event.target.value)} style={input} /></label>
        <label style={label}>Preferred Return Rate (%)<input type="number" step="0.01" min="0" max="100" value={preferredReturnRate} onChange={(event) => setPreferredReturnRate(event.target.value)} style={{ ...input, minWidth: 120 }} /></label>
        <button type="button" onClick={saveSettings} disabled={savingSettings} style={saveButton(savingSettings)}>{savingSettings ? 'Saving...' : 'Save Settings'}</button>
        {settingsMessage && <span style={{ fontSize: 12, color: settingsMessage === 'Saved.' ? '#166534' : '#b91c1c', paddingBottom: 8 }}>{settingsMessage}</span>}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
        The agreement defines the Stabilization Date as the latest of the Development Loan lender&apos;s stabilization date, HUD Break-Even Occupancy, and the Mortgage Loan Final Closing. Accruals start on this date.
      </p>
      {waterfall.issues.length > 0 && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12 }}>
        {waterfall.issues.map((issue) => <div key={issue}>{issue}</div>)}
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        {[
          ['Annual Preferred Return', fmt(waterfall.annualPreferredReturn)],
          ['Annual Even-Up', fmt(waterfall.annualEvenUp)],
          ['Unpaid Pref. Return', waterfall.ready ? fmt(totalUnpaidPreferred) : '-'],
          ['Unpaid Even-Up', waterfall.ready ? fmt(totalUnpaidEvenUp) : '-'],
        ].map(([title, value]) => <div key={title} style={{ ...card, padding: 14 }}><div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{title}</div><div style={{ marginTop: 4, fontSize: 20, fontWeight: 800 }}>{value}</div></div>)}
      </div>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead><tr>
            {sortableHeader('events', 'date', 'Distribution Date')}
            {sortableHeader('events', 'total', 'Total', 'right')}
            {sortableHeader('events', 'memberLoan', 'Member Loans', 'right')}
            {sortableHeader('events', 'preferredReturn', 'Pref. Return', 'right')}
            {sortableHeader('events', 'evenUp', 'Even-Up', 'right')}
            {sortableHeader('events', 'residual', 'Residual', 'right')}
            {sortableHeader('events', 'paid', 'Paid per Waterfall')}
          </tr></thead>
          <tbody>
            {sortRows('events', [...waterfall.events].reverse(), (event, key) => key === 'date' ? event.effectiveDate
              : key === 'paid' ? event.members.filter((member) => Math.abs(member.variance) >= 0.05).length
              : Number(event[key as 'total' | 'memberLoan' | 'preferredReturn' | 'evenUp' | 'residual'] || 0)).map((event) => {
              const off = event.members.filter((member) => Math.abs(member.variance) >= 0.05);
              const isSelected = selectedEventDate === event.effectiveDate;
              return <tr key={event.effectiveDate} style={{ background: isSelected ? '#dbeafe' : undefined }}>
                <td style={td}><button type="button" title="Show member split" onClick={() => setSelectedEventDate(isSelected ? null : event.effectiveDate)} style={{ border: 0, padding: 0, background: 'transparent', color: '#1e3a8a', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>{formatDate(event.effectiveDate)}</button></td>
                <td style={num}>{fmt(event.total)}</td>
                <td style={num}>{fmt(event.memberLoan)}</td>
                <td style={num}>{waterfall.ready ? fmt(event.preferredReturn) : '-'}</td>
                <td style={num}>{waterfall.ready ? fmt(event.evenUp) : '-'}</td>
                <td style={num}>{waterfall.ready ? fmt(event.residual) : '-'}</td>
                <td style={{ ...td, color: off.length ? '#b91c1c' : '#166534', fontWeight: 700 }}>{!waterfall.ready ? '-' : off.length ? `${off.length} member${off.length === 1 ? '' : 's'} differ` : 'Yes'}</td>
              </tr>;
            })}
          </tbody>
        </table>
        {!waterfall.events.length && <div style={{ padding: 18, color: '#64748b' }}>No distributions recorded yet.</div>}
      </div>
      <span style={{ fontSize: 12, color: '#64748b' }}>Click a distribution date to see each member&apos;s split.</span>
      {selectedEvent && <WaterfallSplitTable event={selectedEvent} investorById={investorById} fmt={fmt} title={`Member split · ${formatDate(selectedEvent.effectiveDate)}`} />}
    </div>}

    <div style={{ ...card, display: 'grid', gap: 12 }}>
      <div>
        <h3 style={{ margin: 0 }}>Record distribution</h3>
        <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>Paste the monthly BGAH Cash Flow report from Excel, or load a month&apos;s member distributions from QuickBooks Desktop. Review the member matches and waterfall split, then save. Nothing is recorded until you click Save Distribution.</p>
      </div>
      <textarea value={reportText} onChange={(event) => setReportText(event.target.value)} rows={6} placeholder="September 2026 Cash Flow	BGAH&#10;…&#10;Distributions&#10;Amy-Shu Inc	$ 1,450.00&#10;…&#10;TOTAL DISTRIBUTIONS	$ 72,500.00" style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <button type="button" onClick={reviewReport} disabled={!reportText.trim()} style={{ ...secondaryButton, opacity: reportText.trim() ? 1 : 0.5 }}>Review Report</button>
        <span style={{ fontSize: 12, color: '#64748b', paddingBottom: 9 }}>or</span>
        <label style={label}>QuickBooks Month<input type="month" value={quickBooksMonth} onChange={(event) => setQuickBooksMonth(event.target.value)} style={input} /></label>
        <button type="button" onClick={loadFromQuickBooks} disabled={loadingQuickBooks || !quickBooksMonth} style={{ ...secondaryButton, opacity: loadingQuickBooks || !quickBooksMonth ? 0.5 : 1 }}>{loadingQuickBooks ? 'Loading...' : 'Load from QuickBooks'}</button>
      </div>
      {distributionMessage && <div style={{ fontSize: 13, color: distributionMessage.tone === 'ok' ? '#166534' : '#b91c1c' }}>{distributionMessage.text}</div>}
      {review && <div style={{ display: 'grid', gap: 12 }}>
        {review.parsed.issues.length > 0 && <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: 12 }}>{review.parsed.issues.map((issue) => <div key={issue}>{issue}</div>)}</div>}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={label}>Distribution Date<input type="date" value={review.effectiveDate} onChange={(event) => setReview({ ...review, effectiveDate: event.target.value })} style={input} /></label>
          <div style={{ fontSize: 12, color: '#475569', paddingBottom: 8 }}>
            {[
              review.parsed.periodLabel,
              review.parsed.totalReceived !== null ? `Cash received ${fmt(review.parsed.totalReceived)}` : null,
              review.parsed.totalExpenses !== null ? `Expenses ${fmt(review.parsed.totalExpenses)}` : null,
              `Distributions ${fmt(reviewTotal)}`,
              review.parsed.remainingAfterDistributions !== null ? `Remaining ${fmt(review.parsed.remainingAfterDistributions)}` : null,
            ].filter(Boolean).join(' · ')}
          </div>
        </div>
        {existingOnDate > 0 && <div style={{ fontSize: 12, color: '#92400e' }}>{existingOnDate} distributions are already recorded for {formatDate(review.effectiveDate)}. Saving will ask before replacing them.</div>}
        {missingMembers.length > 0 && <div style={{ fontSize: 12, color: '#92400e' }}>Not in this report: {missingMembers.map((investor) => investor.legalName).join(', ')}.</div>}
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr>
              {sortableHeader('review', 'payee', 'Payee in Report')}
              {sortableHeader('review', 'member', 'Member')}
              {sortableHeader('review', 'match', 'Match')}
              {sortableHeader('review', 'amount', 'Amount', 'right')}
              {sortableHeader('review', 'ownership', 'Ownership', 'right')}
              {sortableHeader('review', 'share', 'Share of Total', 'right')}
            </tr></thead>
            <tbody>
              {sortRows('review', review.lines.map((line, index) => ({ line, index })), ({ line }, key) => key === 'payee' ? line.payee
                : key === 'member' ? investorById.get(line.investorId)?.legalName || ''
                : key === 'match' ? MATCH_LABEL[line.confidence].text
                : key === 'ownership' ? investorById.get(line.investorId)?.ownershipPercentage ?? -1
                : line.amount).map(({ line, index }) => {
                const member = investorById.get(line.investorId);
                const share = reviewTotal ? (line.amount / reviewTotal) * 100 : 0;
                const shareMatches = member ? Math.abs(share - member.ownershipPercentage) < 0.005 : false;
                const badge = MATCH_LABEL[line.confidence];
                return <tr key={`${line.payee}-${index}`}>
                  <td style={td}>{line.payee}</td>
                  <td style={td}>
                    <select value={line.investorId} onChange={(event) => setReview({ ...review, lines: review.lines.map((current, i) => i === index ? { ...current, investorId: event.target.value, confidence: event.target.value ? 'saved' : 'none' } : current) })} style={{ ...input, minWidth: 240, borderColor: duplicateMembers.includes(line.investorId) || !line.investorId ? '#f87171' : '#cbd5e1' }}>
                      <option value="">Select member…</option>
                      {sortedInvestors.map((investor) => <option key={investor.id} value={investor.id}>{investor.legalName}</option>)}
                    </select>
                  </td>
                  <td style={td}><span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: badge.color, background: badge.background }}>{badge.text}</span></td>
                  <td style={num}>{fmt(line.amount)}</td>
                  <td style={num}>{member ? pct(member.ownershipPercentage) : '-'}</td>
                  <td style={{ ...num, color: member && !shareMatches ? '#92400e' : undefined }}>{pct(share)}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {duplicateMembers.length > 0 && <div style={{ fontSize: 12, color: '#b91c1c' }}>A member is selected on more than one line. Each member can appear once per distribution.</div>}
        {previewEvent && <WaterfallSplitTable event={previewEvent} investorById={investorById} fmt={fmt} title="Waterfall split for this distribution" ready={waterfall.ready} />}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button type="button" onClick={() => saveDistribution(confirmReplace)} disabled={!canSave || savingDistribution} style={saveButton(!canSave || savingDistribution)}>{savingDistribution ? 'Saving...' : confirmReplace ? 'Replace Distribution' : 'Save Distribution'}</button>
          <button type="button" onClick={() => { setReview(null); setConfirmReplace(false); setDistributionMessage(null); }} style={secondaryButton}>Cancel</button>
          {unmatchedCount > 0 && <span style={{ fontSize: 12, color: '#b91c1c' }}>Select a member for {unmatchedCount} unmatched line{unmatchedCount === 1 ? '' : 's'}.</span>}
        </div>
      </div>}
    </div>
  </>;
}

function WaterfallSplitTable({ event, investorById, fmt, title, ready = true }: {
  event: WaterfallResult['events'][number];
  investorById: Map<string, WaterfallInvestor>;
  fmt: (value: unknown) => string;
  title: string;
  ready?: boolean;
}) {
  const { sortRows, sortableHeader } = useTableSort(th);
  const rows = sortRows('split', event.members.filter((member) => member.expected || member.actual)
    .sort((a, b) => (investorById.get(a.investorId)?.legalName || '').localeCompare(investorById.get(b.investorId)?.legalName || '')), (member, key) => {
    const investor = investorById.get(member.investorId);
    if (key === 'member') return investor?.legalName || member.investorId;
    if (key === 'group') return investor?.memberGroup || '';
    if (key === 'ownership') return investor?.ownershipPercentage ?? 0;
    return Number(member[key as 'preferredReturn' | 'evenUp' | 'residual' | 'expected' | 'actual' | 'variance'] || 0);
  });
  return <div style={{ display: 'grid', gap: 8 }}>
    <h4 style={{ margin: 0, fontSize: 14, color: '#0f172a' }}>{title}</h4>
    {!ready && <div style={{ fontSize: 12, color: '#92400e' }}>Enter the Stabilization Date to split this distribution into preferred return and even-up. Until then it is shown entirely as residual.</div>}
    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
        <thead><tr>
          {sortableHeader('split', 'member', 'Member')}
          {sortableHeader('split', 'group', 'Group')}
          {sortableHeader('split', 'ownership', 'Ownership', 'right')}
          {sortableHeader('split', 'preferredReturn', 'Pref. Return', 'right')}
          {sortableHeader('split', 'evenUp', 'Even-Up', 'right')}
          {sortableHeader('split', 'residual', 'Residual', 'right')}
          {sortableHeader('split', 'expected', 'Per Waterfall', 'right')}
          {sortableHeader('split', 'actual', 'Paid', 'right')}
          {sortableHeader('split', 'variance', 'Difference', 'right')}
        </tr></thead>
        <tbody>
          {rows.map((member) => {
            const investor = investorById.get(member.investorId);
            const off = Math.abs(member.variance) >= 0.05;
            return <tr key={member.investorId}>
              <td style={{ ...td, fontWeight: 700 }}>{investor?.legalName || member.investorId}</td>
              <td style={td}>{investor?.memberGroup || '-'}</td>
              <td style={num}>{investor ? pct(investor.ownershipPercentage) : '-'}</td>
              <td style={num}>{fmt(member.preferredReturn)}</td>
              <td style={num}>{fmt(member.evenUp)}</td>
              <td style={num}>{fmt(member.residual)}</td>
              <td style={num}>{fmt(member.expected)}</td>
              <td style={num}>{fmt(member.actual)}</td>
              <td style={{ ...num, color: off ? '#b91c1c' : '#64748b', fontWeight: off ? 700 : 400 }}>{off ? fmt(member.variance) : '-'}</td>
            </tr>;
          })}
          <tr style={{ background: '#eff6ff' }}>
            <td style={{ ...td, fontWeight: 800 }} colSpan={3}>Total</td>
            <td style={{ ...num, fontWeight: 800 }}>{fmt(event.preferredReturn)}</td>
            <td style={{ ...num, fontWeight: 800 }}>{fmt(event.evenUp)}</td>
            <td style={{ ...num, fontWeight: 800 }}>{fmt(event.residual)}</td>
            <td style={{ ...num, fontWeight: 800 }}>{fmt(event.total)}</td>
            <td style={{ ...num, fontWeight: 800 }}>{fmt(event.total)}</td>
            <td style={num} />
          </tr>
        </tbody>
      </table>
    </div>
  </div>;
}
