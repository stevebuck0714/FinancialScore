import { addEstCalendarDays, formatEstDate, yearsAgoEstDate } from '@/lib/time/eastern';
import type { FetchedStatement } from './store';

type PlaidEnv = 'sandbox' | 'production';

function plaidConfig(): { clientId: string; secret: string; env: PlaidEnv } | null {
  const clientId = String(process.env.PLAID_CLIENT_ID || '').trim();
  const secret = String(process.env.PLAID_SECRET || '').trim();
  const env = String(process.env.PLAID_ENV || 'sandbox').trim().toLowerCase() === 'production' ? 'production' : 'sandbox';
  return clientId && secret ? { clientId, secret, env } : null;
}

export function isPlaidConfigured(): boolean {
  return plaidConfig() !== null;
}

export class PlaidRequestError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

async function plaidRequest(path: string, body: Record<string, unknown>): Promise<Response> {
  const config = plaidConfig();
  if (!config) throw new PlaidRequestError('Plaid is not configured (PLAID_CLIENT_ID / PLAID_SECRET).', null);
  const res = await fetch(`https://${config.env}.plaid.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'PLAID-CLIENT-ID': config.clientId, 'PLAID-SECRET': config.secret },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error_code?: string; display_message?: string; error_message?: string };
    throw new PlaidRequestError(err.display_message || err.error_message || `Plaid request failed (${res.status})`, err.error_code || null);
  }
  return res;
}

async function plaidJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return (await (await plaidRequest(path, body)).json()) as T;
}

/** Plaid allows up to two years of statements, measured by the posted date. */
function statementWindow() {
  const end = formatEstDate();
  return { start_date: addEstCalendarDays(yearsAgoEstDate(2), 1), end_date: end };
}

export async function createPlaidLinkToken(params: { userId: string; email: string | null }): Promise<string> {
  const json = await plaidJson<{ link_token: string }>('/link/token/create', {
    client_name: 'Corelytics',
    language: 'en',
    country_codes: ['US'],
    user: { client_user_id: params.userId, ...(params.email ? { email_address: params.email } : {}) },
    products: ['statements'],
    statements: statementWindow(),
  });
  return json.link_token;
}

type StatementsList = {
  institution_name: string | null;
  accounts: Array<{
    account_mask: string | null;
    account_name: string | null;
    account_official_name: string | null;
    statements: Array<{ statement_id: string; month: number; year: number }>;
  }>;
};

/**
 * Exchanges the Link public token, hands every statement to `save`, and always
 * removes the Item afterwards so no bank connection or access token is kept.
 */
export async function withPlaidStatements<T>(
  publicToken: string,
  save: (statements: FetchedStatement[], institution: string | null) => Promise<T>,
): Promise<T> {
  const { access_token: accessToken } = await plaidJson<{ access_token: string }>('/item/public_token/exchange', {
    public_token: publicToken,
  });
  try {
    const list = await plaidJson<StatementsList>('/statements/list', { access_token: accessToken });
    const institution = list.institution_name || null;
    const statements: FetchedStatement[] = list.accounts.flatMap((account) =>
      account.statements.map((s) => ({
        source: 'PLAID' as const,
        institution,
        accountLast4: account.account_mask ? account.account_mask.slice(-4) : null,
        accountName: account.account_name || account.account_official_name || null,
        month: `${s.year}-${String(s.month).padStart(2, '0')}`,
        download: async () =>
          (await plaidRequest('/statements/download', { access_token: accessToken, statement_id: s.statement_id })).arrayBuffer(),
      })),
    );
    return await save(statements, institution);
  } finally {
    await plaidRequest('/item/remove', { access_token: accessToken }).catch((e) =>
      console.error('Plaid /item/remove failed; remove the Item from the Plaid dashboard:', e),
    );
  }
}
