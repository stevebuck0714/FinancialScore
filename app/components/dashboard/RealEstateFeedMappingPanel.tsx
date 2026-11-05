'use client';

import { useEffect, useState } from 'react';
import AccountMappingTable from './AccountMappingTable';
import { isNonrecurringRepairLine } from '@/lib/real-estate/property-income-statement';

export const PRIMARY_FINANCIAL_FEED = 'PRIMARY';

type FeedAccount = {
  accountCode: string;
  accountName: string;
  accountType: string;
  reportType: string;
  targetField: string | null;
  suggestedTargetField: string | null;
  suggestionConfidence: 'high' | 'medium' | null;
  bookTreatment: 'expense' | 'capitalize' | null;
};

type Props = {
  companyId: string;
  industrySectorCategory: string | null;
  primaryFeedLabel: string;
  feed: string;
  onFeedChange: (feed: string) => void;
};

function classificationFor(accountType: string): string {
  const type = String(accountType || '').toLowerCase();
  if (type === 'income') return 'manual:Revenue';
  if (type === 'expense') return 'manual:Expense';
  if (type.includes('equity')) return 'manual:Equity';
  if (type.includes('payable') || type.includes('liabilit') || type.includes('debt')) return 'manual:Liability';
  return 'manual:Asset';
}

/**
 * Financial Feed selector for Data Mapping. PRIMARY leaves the existing
 * accounting-system mapping UI in charge; entity feeds (BGAH, SLN) are mapped
 * here and stored separately from the primary account mappings.
 */
export default function RealEstateFeedMappingPanel({ companyId, industrySectorCategory, primaryFeedLabel, feed, onFeedChange }: Props) {
  const [feeds, setFeeds] = useState<string[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [loadedFeed, setLoadedFeed] = useState<string | null>(null);
  const loading = feed !== PRIMARY_FINANCIAL_FEED && loadedFeed !== feed;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/operations/real-estate/account-mappings?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => { if (active) setFeeds(Array.isArray(payload?.feeds) ? payload.feeds : []); })
      .catch(() => { if (active) setFeeds([]); });
    return () => { active = false; };
  }, [companyId]);

  useEffect(() => {
    if (feed === PRIMARY_FINANCIAL_FEED) return;
    let active = true;
    fetch(`/api/operations/real-estate/account-mappings?companyId=${encodeURIComponent(companyId)}&feed=${encodeURIComponent(feed)}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'Unable to load feed accounts.');
        if (!active) return;
        setMappings((payload.accounts as FeedAccount[]).map((account) => ({
          accountName: account.accountName,
          accountCode: account.accountCode,
          accountId: account.accountCode,
          accountType: account.accountType,
          accountClassification: classificationFor(account.accountType),
          targetField: account.targetField || account.suggestedTargetField || 'unmapped',
          confidence: account.targetField ? 'high' : account.suggestionConfidence || 'low',
          sourceStatus: account.targetField ? 'mapped' : 'new',
          bookTreatment: account.bookTreatment === 'capitalize' ? 'capitalize' : 'expense',
        })));
      })
      .catch((error) => active && setMessage({ tone: 'error', text: error.message }))
      .finally(() => active && setLoadedFeed(feed));
    return () => { active = false; };
  }, [companyId, feed]);

  if (feeds.length === 0) return null;

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/operations/real-estate/account-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          feed,
          mappings: mappings.map((mapping) => ({
            accountCode: mapping.accountCode,
            accountName: mapping.accountName,
            accountType: mapping.accountType,
            targetField: mapping.targetField,
            bookTreatment: mapping.bookTreatment,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Unable to save mappings.');
      setMappings((current) => current.map((mapping) => ({
        ...mapping,
        confidence: mapping.targetField && mapping.targetField !== 'unmapped' ? 'high' : 'low',
        sourceStatus: mapping.targetField && mapping.targetField !== 'unmapped' ? 'mapped' : 'new',
      })));
      setMessage({ tone: 'ok', text: `Saved ${payload.saved} ${feed} account mappings.` });
    } catch (error: any) {
      setMessage({ tone: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const mappedCount = mappings.filter((mapping) => mapping.targetField && mapping.targetField !== 'unmapped').length;
  const nonrecurringIndexes = mappings.flatMap((mapping, index) => (isNonrecurringRepairLine(mapping.targetField) ? [index] : []));

  return (
    <div style={{ background: 'white', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '13px', fontWeight: 600, color: '#475569' }}>Financial Feed</label>
        <select
          value={feed}
          onChange={(event) => { setMessage(null); onFeedChange(event.target.value); }}
          style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: 'white', minWidth: '240px' }}
        >
          <option value={PRIMARY_FINANCIAL_FEED}>{primaryFeedLabel}</option>
          {feeds.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        {feed !== PRIMARY_FINANCIAL_FEED && (
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            <strong>Total:</strong> {mappings.length} &nbsp; <strong>Mapped:</strong> {mappedCount} &nbsp; <strong>Unmapped:</strong> {mappings.length - mappedCount}
          </span>
        )}
      </div>

      {feed !== PRIMARY_FINANCIAL_FEED && (
        <div style={{ marginTop: '12px' }}>
          <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#475569' }}>
            Map each {feed} account to its property income statement line. Unsaved accounts are pre-filled with a suggested line by name; review them and click Save Mappings. Combined BGAH + SLN statements use these feed mappings; the combined view is never mapped directly.
          </p>
          {loading ? (
            <div style={{ padding: '16px', color: '#64748b', fontSize: '13px' }}>Loading {feed} accounts…</div>
          ) : (
            <AccountMappingTable
              mappings={mappings}
              linesOfBusiness={[]}
              industrySectorCategory={industrySectorCategory}
              includeSectorStatementLines
              onMappingChange={(index, updates) => {
                setMappings((current) => {
                  const next = [...current];
                  next[index] = { ...next[index], ...updates };
                  return next;
                });
              }}
            />
          )}
          {!loading && nonrecurringIndexes.length > 0 && (
            <div style={{ marginTop: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e3a8a' }}>Nonrecurring Repair Treatment</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  Expensed accounts reduce net income on the Financial Statements. Capitalized accounts are added to Fixed Assets instead. Both still show under Nonrecurring Repair &amp; Maint in Operations.
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: '#475569' }}>ACCOUNT</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: '#475569' }}>BOOK TREATMENT</th>
                  </tr>
                </thead>
                <tbody>
                  {nonrecurringIndexes.map((index) => (
                    <tr key={mappings[index].accountCode} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px' }}>{mappings[index].accountCode} · {mappings[index].accountName}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <select
                          value={mappings[index].bookTreatment || 'expense'}
                          onChange={(event) => {
                            const bookTreatment = event.target.value;
                            setMappings((current) => current.map((mapping, i) => (i === index ? { ...mapping, bookTreatment } : mapping)));
                          }}
                          style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: 'white' }}
                        >
                          <option value="expense">Expense</option>
                          <option value="capitalize">Capitalize (Fixed Assets)</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '2px solid #e2e8f0' }}>
            <button
              onClick={save}
              disabled={saving || loading}
              style={{ padding: '8px 16px', background: saving ? '#9ca3af' : '#10b981', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 2px 6px rgba(16, 185, 129, 0.3)' }}
            >
              {saving ? 'Saving...' : 'Save Mappings'}
            </button>
            {message && (
              <span style={{ fontSize: '12px', fontWeight: 600, color: message.tone === 'ok' ? '#0f766e' : '#b91c1c' }}>{message.text}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
