import { addEstCalendarDays, formatEstDate, yearsAgoEstDate } from '@/lib/time/eastern';
import {
  bankTransactionsFromAssetAccount,
  monthlyActivityFromAssetAccount,
  type AssetReportAccount,
  type BankTransactionInput,
} from './bank-activity';
import type { BankActivityMonth } from './providers';
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
    readonly rateLimited = false,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRateLimitRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof PlaidRequestError && e.rateLimited) || attempt >= attempts) throw e;
      await sleep(Math.min(30_000, 2_000 * 2 ** (attempt - 1)) + Math.random() * 1_000);
    }
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
    const err = (await res.json().catch(() => ({}))) as {
      error_type?: string;
      error_code?: string;
      display_message?: string;
      error_message?: string;
    };
    throw new PlaidRequestError(
      err.display_message || err.error_message || `Plaid request failed (${res.status})`,
      err.error_code || null,
      res.status === 429 || err.error_type === 'RATE_LIMIT_EXCEEDED',
    );
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

/**
 * Assets is required and Statements is pulled when the bank supports it, so banks
 * without statement PDFs can still be connected. Teams without Assets access fall
 * back to a Statements-only session.
 */
export async function createPlaidLinkToken(params: { userId: string; email: string | null }): Promise<string> {
  const base = {
    client_name: 'Corelytics',
    language: 'en',
    country_codes: ['US'],
    user: { client_user_id: params.userId, ...(params.email ? { email_address: params.email } : {}) },
    statements: statementWindow(),
  };
  try {
    const json = await plaidJson<{ link_token: string }>('/link/token/create', {
      ...base,
      products: ['assets'],
      required_if_supported_products: ['statements'],
    });
    return json.link_token;
  } catch (e) {
    if (!(e instanceof PlaidRequestError && e.code === 'INVALID_PRODUCT')) throw e;
    const json = await plaidJson<{ link_token: string }>('/link/token/create', { ...base, products: ['statements'] });
    return json.link_token;
  }
}

type StatementsList = {
  institution_name: string | null;
  accounts: Array<{
    account_id: string;
    account_mask: string | null;
    account_name: string | null;
    account_official_name: string | null;
    statements: Array<{ statement_id: string; month: number; year: number }>;
  }>;
};

type AccountsList = { accounts: Array<{ account_id: string; mask: string | null; name: string; type: string; subtype: string | null }> };

type AssetReport = {
  report: {
    date_generated: string;
    items: Array<{ institution_name: string | null; accounts: AssetReportAccount[] }>;
  };
};

export type PlaidBankDataReport = {
  institution: string | null;
  pdf: ArrayBuffer;
  /** Monthly figures, only for accounts without statement PDFs. */
  activity: BankActivityMonth[];
  /** Posted transactions for every depository account in the report. */
  transactions: BankTransactionInput[];
  accounts: string[];
};

export type PlaidImportHandlers<S, A> = {
  saveStatements: (statements: FetchedStatement[], institution: string | null) => Promise<S>;
  saveBankDataReport: (report: PlaidBankDataReport) => Promise<A>;
};

export type PlaidImportOutcome<S, A> = {
  institution: string | null;
  statements: S;
  bankData: A | null;
  /** Why the bank data report was not saved; null when it was or the connection has no bank accounts. */
  bankDataNote: string | null;
};

const ASSET_REPORT_DAYS = 730;
const ASSET_REPORT_POLL_MS = 3_000;
const isDepository = (a: { type: string }) => a.type === 'depository';
const accountLabel = (name: string | null, mask: string | null) => [name, mask ? `x${mask.slice(-4)}` : null].filter(Boolean).join(' ');

// Statements is "required if supported": at a bank without statements the user is never
// asked to consent, so Plaid answers ADDITIONAL_CONSENT_REQUIRED rather than PRODUCTS_NOT_SUPPORTED.
const NO_STATEMENTS_CODES = new Set(['PRODUCTS_NOT_SUPPORTED', 'PRODUCT_NOT_ENABLED', 'ADDITIONAL_CONSENT_REQUIRED', 'INVALID_PRODUCT']);

async function listStatements(accessToken: string): Promise<StatementsList | null> {
  try {
    return await plaidJson<StatementsList>('/statements/list', { access_token: accessToken });
  } catch (e) {
    if (e instanceof PlaidRequestError && e.code && NO_STATEMENTS_CODES.has(e.code)) return null;
    throw e;
  }
}

async function waitForAssetReport(token: string, until: number): Promise<AssetReport> {
  for (;;) {
    try {
      return await plaidJson<AssetReport>('/asset_report/get', { asset_report_token: token, include_insights: true });
    } catch (e) {
      if (!(e instanceof PlaidRequestError && (e.code === 'PRODUCT_NOT_READY' || e.rateLimited)) || Date.now() > until) throw e;
      await sleep(ASSET_REPORT_POLL_MS);
    }
  }
}

/**
 * Exchanges the Link public token and saves statement PDFs for every account the
 * bank provides them for. Every connection with bank accounts also gets a Plaid
 * asset report with insights: its PDF and every posted transaction are saved, and
 * accounts without statements get monthly figures from it. The asset report and
 * the Item are always removed afterwards so no bank connection or access token is kept.
 */
export async function importPlaidBankData<S, A>(
  publicToken: string,
  handlers: PlaidImportHandlers<S, A>,
  assetReportDeadline: number,
): Promise<PlaidImportOutcome<S, A>> {
  const { access_token: accessToken } = await plaidJson<{ access_token: string }>('/item/public_token/exchange', {
    public_token: publicToken,
  });
  let assetReportToken: string | null = null;
  try {
    const [list, { accounts }] = await Promise.all([
      listStatements(accessToken),
      plaidJson<AccountsList>('/accounts/get', { access_token: accessToken }),
    ]);
    const withStatements = new Set((list?.accounts ?? []).filter((a) => a.statements.length > 0).map((a) => a.account_id));
    const depositoryAccounts = accounts.filter(isDepository);
    const gapAccounts = depositoryAccounts.filter((a) => !withStatements.has(a.account_id));

    let bankDataNote: string | null = null;
    if (depositoryAccounts.length > 0) {
      try {
        assetReportToken = (
          await plaidJson<{ asset_report_token: string }>('/asset_report/create', {
            access_tokens: [accessToken],
            days_requested: ASSET_REPORT_DAYS,
          })
        ).asset_report_token;
      } catch (e) {
        const unavailable = e instanceof PlaidRequestError && !!e.code && NO_STATEMENTS_CODES.has(e.code);
        bankDataNote = !unavailable
          ? `Bank data could not be requested: ${e instanceof Error ? e.message : String(e)}`
          : gapAccounts.length > 0
            ? `Transaction detail is not available, and there are no statements for ${gapAccounts.map((a) => accountLabel(a.name, a.mask)).join(', ')}. Upload those statements instead.`
            : 'Transaction detail is not available for this connection.';
      }
    }

    let institution = list?.institution_name || null;
    const statements: FetchedStatement[] = (list?.accounts ?? []).flatMap((account) =>
      account.statements.map((s) => ({
        source: 'PLAID' as const,
        institution,
        accountLast4: account.account_mask ? account.account_mask.slice(-4) : null,
        accountName: account.account_name || account.account_official_name || null,
        month: `${s.year}-${String(s.month).padStart(2, '0')}`,
        download: () =>
          withRateLimitRetry(async () =>
            (await plaidRequest('/statements/download', { access_token: accessToken, statement_id: s.statement_id })).arrayBuffer(),
          ),
      })),
    );
    const savedStatements = await handlers.saveStatements(statements, institution);

    let bankData: A | null = null;
    if (assetReportToken) {
      try {
        const { report } = await waitForAssetReport(assetReportToken, assetReportDeadline);
        const gapIds = new Set(gapAccounts.map((a) => a.account_id));
        const reportDate = formatEstDate(new Date(report.date_generated));
        const reportAccounts = report.items.flatMap((item) => item.accounts).filter(isDepository);
        institution = institution || report.items[0]?.institution_name || null;
        const pdf = await withRateLimitRetry(async () =>
          (await plaidRequest('/asset_report/pdf/get', { asset_report_token: assetReportToken })).arrayBuffer(),
        );
        bankData = await handlers.saveBankDataReport({
          institution,
          pdf,
          activity: reportAccounts.filter((a) => gapIds.has(a.account_id)).flatMap((a) => monthlyActivityFromAssetAccount(a, reportDate)),
          transactions: reportAccounts.flatMap((a) => bankTransactionsFromAssetAccount(a, institution)),
          accounts: reportAccounts.map((a) => accountLabel(a.name || a.official_name, a.mask)),
        });
      } catch (e) {
        bankDataNote =
          e instanceof PlaidRequestError && e.code === 'PRODUCT_NOT_READY'
            ? 'The bank data report was not ready in time. Connect the bank again to retry.'
            : `Bank data could not be saved: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    return { institution, statements: savedStatements, bankData, bankDataNote };
  } finally {
    if (assetReportToken) {
      await plaidRequest('/asset_report/remove', { asset_report_token: assetReportToken }).catch((e) =>
        console.error('Plaid /asset_report/remove failed:', e),
      );
    }
    await plaidRequest('/item/remove', { access_token: accessToken }).catch((e) =>
      console.error('Plaid /item/remove failed; remove the Item from the Plaid dashboard:', e),
    );
  }
}
