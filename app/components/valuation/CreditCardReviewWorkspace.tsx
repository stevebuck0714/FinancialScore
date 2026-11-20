'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEstDateTime } from '@/lib/time/eastern';
import { buttonStyle, cardStyle, tdStyle, thStyle } from './cashProofStyles';

type ReviewTransaction = {
  id: string;
  accountLast4: string | null;
  accountName: string | null;
  date: string;
  amount: number;
  currency: string | null;
  description: string | null;
  merchantName: string | null;
  category: string[];
  creditCategoryPrimary: string | null;
  creditCategoryDetailed: string | null;
  reviewClassification: string | null;
  reviewNote: string | null;
};

type Import = {
  id: string;
  institution: string | null;
  coverageStart: string | null;
  coverageEnd: string | null;
  accountCount: number;
  transactionCount: number;
  importedAt: string;
  dataRoomDocument: { id: string; originalFileName: string };
  transactions: ReviewTransaction[];
};

type State = { dataRoomReady: boolean; canImport: boolean; canReview: boolean; imports: Import[]; error?: string };
type PlaidHandler = { open: () => void; destroy: () => void };
type PlaidLink = { create: (config: { token: string; onSuccess: (token: string) => void; onExit: (error: { display_message?: string; error_message?: string } | null) => void }) => PlaidHandler };

const classifications = [
  ['BUSINESS', 'Business'],
  ['PERSONAL_DISCRETIONARY', 'Personal / discretionary'],
  ['NON_RECURRING', 'Non-recurring'],
  ['NEEDS_EXPLANATION', 'Needs explanation'],
  ['EXCLUDED', 'Excluded / duplicate'],
] as const;

async function postJson<T>(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(json.error || `Request failed (${response.status})`);
  return json;
}

async function loadPlaid(): Promise<PlaidLink> {
  const existing = (window as unknown as { Plaid?: PlaidLink }).Plaid;
  if (existing) return existing;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Plaid Link could not be loaded.'));
    document.head.appendChild(script);
  });
  const plaid = (window as unknown as { Plaid?: PlaidLink }).Plaid;
  if (!plaid) throw new Error('Plaid Link did not load.');
  return plaid;
}

const money = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);

export default function CreditCardReviewWorkspace({ companyId }: { companyId: string | null }) {
  const [data, setData] = useState<State | null>(null);
  const [loading, setLoading] = useState(Boolean(companyId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    const response = await fetch(`/api/credit-card-review?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
    const json = (await response.json().catch(() => ({}))) as State;
    if (!response.ok) throw new Error(json.error || 'Failed to load credit-card activity.');
    setData(json);
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const initialLoad = async () => {
      try {
        const response = await fetch(`/api/credit-card-review?companyId=${encodeURIComponent(companyId)}`, { cache: 'no-store' });
        const json = (await response.json().catch(() => ({}))) as State;
        if (!response.ok) throw new Error(json.error || 'Failed to load credit-card activity.');
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, [companyId, load]);

  const connect = async () => {
    if (!companyId || busy) return;
    setBusy(true);
    setError(null);
    setMessage('Opening Plaid…');
    try {
      const [{ linkToken }, Plaid] = await Promise.all([
        postJson<{ linkToken: string }>('/api/credit-card-review/plaid/link-token', { companyId }),
        loadPlaid(),
      ]);
      const publicToken = await new Promise<string | null>((resolve, reject) => {
        const handler = Plaid.create({
          token: linkToken,
          onSuccess: (token) => {
            handler.destroy();
            resolve(token);
          },
          onExit: (plaidError) => {
            handler.destroy();
            if (plaidError) reject(new Error(plaidError.display_message || plaidError.error_message || 'Plaid connection failed.'));
            else resolve(null);
          },
        });
        handler.open();
      });
      if (!publicToken) {
        setMessage(null);
        return;
      }
      setMessage('Importing up to 24 months of posted company-card transactions…');
      const result = await postJson<{ transactionCount: number; institution: string | null; coverageStart: string | null; coverageEnd: string | null }>(
        '/api/credit-card-review/plaid/import',
        { companyId, publicToken },
      );
      setMessage(
        `Saved ${result.transactionCount.toLocaleString('en-US')} transactions${result.institution ? ` from ${result.institution}` : ''}. The Plaid connection has been removed.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessage(null);
    } finally {
      setBusy(false);
    }
  };

  const review = async (transaction: ReviewTransaction, classification: string) => {
    if (!data?.canReview) return;
    const existing = transaction.reviewNote || '';
    const note = window.prompt(
      classification === 'PERSONAL_DISCRETIONARY' || classification === 'NON_RECURRING'
        ? 'Why is this a potential QoE adjustment?'
        : 'Review note (optional):',
      existing,
    );
    if (note === null) return;
    try {
      const response = await fetch(`/api/credit-card-review/transactions/${transaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classification, note }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error || 'Failed to save review.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!companyId) return <div style={cardStyle}>Select a company to review its company-credit-card activity.</div>;
  if (loading) return <div style={cardStyle}>Loading credit-card activity…</div>;
  if (!data) return <div style={{ ...cardStyle, color: '#b91c1c' }}>{error || 'Credit-card review is unavailable.'}</div>;

  return (
    <div>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: '#1e293b', margin: 0 }}>Credit Card Review</h2>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, maxWidth: 780 }}>
              Pull up to 24 months of posted company-card activity once through Plaid. Corelytics saves the transaction file in the
              Data Room Credit Card Statements folder, then removes the Plaid connection. Credit-card activity is never used in Cash Proof.
            </div>
          </div>
          <button style={buttonStyle()} onClick={() => void load()}>Refresh</button>
        </div>
        {error && <div style={{ color: '#b91c1c', marginTop: 10, fontSize: 12 }}>{error}</div>}
        {message && <div style={{ color: '#047857', marginTop: 10, fontSize: 12 }}>{message}</div>}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Import Company Credit Cards</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, marginBottom: 10 }}>
          Ask the borrower to select business credit cards only. Plaid may show other eligible accounts, but Corelytics imports only
          credit-card activity. Plaid returns transaction data, not statement PDFs; upload original card statements to the Credit Card
          Statements folder when support is needed for a material adjustment.
        </div>
        <button style={buttonStyle('primary', !data.dataRoomReady || !data.canImport || busy)} disabled={!data.dataRoomReady || !data.canImport || busy} onClick={() => void connect()}>
          {busy ? 'Importing…' : 'Import with Plaid'}
        </button>
        {!data.dataRoomReady && <div style={{ color: '#b45309', marginTop: 8, fontSize: 12 }}>Enable the Data Room before importing card activity.</div>}
      </div>

      {data.imports.map((item) => (
        <div style={cardStyle} key={item.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{item.institution || 'Plaid credit-card import'}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {item.accountCount} card{item.accountCount === 1 ? '' : 's'} · {item.transactionCount.toLocaleString('en-US')} transactions · {item.coverageStart || '—'} to {item.coverageEnd || '—'} · imported {formatEstDateTime(item.importedAt)}
              </div>
            </div>
            <a href={`/api/dataroom/documents/${item.dataRoomDocument.id}/view`} target="_blank" rel="noreferrer" style={{ color: '#2751d0', fontSize: 12 }}>
              Open source CSV
            </a>
          </div>
          <div style={{ overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 10, maxHeight: 480 }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Date</th><th style={{ ...thStyle, textAlign: 'left' }}>Card</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Merchant / description</th><th style={{ ...thStyle, textAlign: 'left' }}>Category</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th><th style={{ ...thStyle, textAlign: 'left' }}>Review</th>
                </tr>
              </thead>
              <tbody>
                {item.transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>{transaction.date}</td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>{transaction.accountName || 'Card'}{transaction.accountLast4 ? ` · x${transaction.accountLast4}` : ''}</td>
                    <td style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'normal' }}>{transaction.merchantName || transaction.description || '—'}{transaction.reviewNote && <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{transaction.reviewNote}</div>}</td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>{transaction.creditCategoryDetailed || transaction.category.join(' › ') || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: transaction.amount > 0 ? '#b91c1c' : '#047857' }}>{money(transaction.amount, transaction.currency || 'USD')}</td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>
                      {data.canReview ? (
                        <select value={transaction.reviewClassification || ''} onChange={(event) => event.target.value && void review(transaction, event.target.value)} style={{ fontSize: 11, maxWidth: 165 }}>
                          <option value="">Classify…</option>
                          {classifications.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      ) : transaction.reviewClassification || 'Unreviewed'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {item.transactionCount > item.transactions.length && <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>Showing the most recent {item.transactions.length} transactions. The complete source file is in the Data Room.</div>}
        </div>
      ))}
    </div>
  );
}
