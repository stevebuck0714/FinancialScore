'use client';

import { useCallback, useState } from 'react';

type PlaidHandler = { open: () => void; destroy: () => void };
type PlaidLinkFactory = {
  create: (config: {
    token: string;
    onSuccess: (publicToken: string) => void;
    onExit: (error: { display_message?: string; error_message?: string } | null) => void;
  }) => PlaidHandler;
};

const PLAID_SCRIPT = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';

function loadPlaidLink(): Promise<PlaidLinkFactory> {
  const existing = (window as unknown as { Plaid?: PlaidLinkFactory }).Plaid;
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PLAID_SCRIPT;
    script.async = true;
    script.onload = () => {
      const plaid = (window as unknown as { Plaid?: PlaidLinkFactory }).Plaid;
      if (plaid) resolve(plaid);
      else reject(new Error('Plaid Link did not load.'));
    };
    script.onerror = () => reject(new Error('Plaid Link could not be loaded.'));
    document.head.appendChild(script);
  });
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}

type ImportResult = {
  institution: string | null;
  imported: number;
  skipped: number;
  failed: number;
  accounts: string[];
  errors: string[];
  bankData: { saved: boolean; accounts: string[]; months: number; transactions: number } | null;
  bankDataNote: string | null;
};

export type BankConnectStatus = { tone: 'info' | 'success' | 'error'; message: string } | null;

/** Opens a provider's hosted bank login and saves the pulled statements to the Data Room. */
export function useBankConnect(companyId: string, onImported: () => void) {
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [status, setStatus] = useState<BankConnectStatus>(null);

  const connect = useCallback(
    async (providerId: string) => {
      if (providerId !== 'plaid' || busyProvider) return;
      setBusyProvider(providerId);
      setStatus({ tone: 'info', message: 'Opening Plaid…' });
      try {
        const [{ linkToken }, Plaid] = await Promise.all([
          postJson<{ linkToken: string }>('/api/bank-statements/plaid/link-token', { companyId }),
          loadPlaidLink(),
        ]);
        const publicToken = await new Promise<string | null>((resolve, reject) => {
          const handler = Plaid.create({
            token: linkToken,
            onSuccess: (token) => {
              handler.destroy();
              resolve(token);
            },
            onExit: (error) => {
              handler.destroy();
              if (error) reject(new Error(error.display_message || error.error_message || 'Plaid connection failed.'));
              else resolve(null);
            },
          });
          handler.open();
        });
        if (!publicToken) {
          setStatus(null);
          return;
        }
        setStatus({ tone: 'info', message: 'Downloading statements from the bank. This can take a minute…' });
        const result = await postJson<ImportResult>('/api/bank-statements/plaid/import', { companyId, publicToken });
        await fetch('/api/dataroom/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId }),
        }).catch(() => undefined);
        const parts = [
          `Saved ${result.imported} statement${result.imported === 1 ? '' : 's'}${result.institution ? ` from ${result.institution}` : ''}`,
          result.skipped ? `${result.skipped} already on file` : null,
          result.failed ? `${result.failed} failed` : null,
          result.bankData?.saved
            ? `bank data report with ${result.bankData.transactions.toLocaleString('en-US')} transactions for ${result.bankData.accounts.join(', ') || 'the connected accounts'}${result.bankData.months ? ` (${result.bankData.months} account-months without statements)` : ''}`
            : null,
        ].filter(Boolean);
        const problems = [result.errors[0], result.bankDataNote].filter(Boolean);
        setStatus({
          tone: result.failed || result.bankDataNote ? 'error' : 'success',
          message: `${parts.join(', ')}. The bank connection has been removed.${problems.length ? ` ${problems.join(' ')}` : ''}`,
        });
        onImported();
      } catch (e) {
        setStatus({ tone: 'error', message: e instanceof Error ? e.message : String(e) });
      } finally {
        setBusyProvider(null);
      }
    },
    [busyProvider, companyId, onImported],
  );

  return { connect, busyProvider, status };
}
