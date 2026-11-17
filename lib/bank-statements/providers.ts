/** PLAID_ASSETS is a Plaid asset report: bank data for accounts whose bank does not provide statement PDFs. */
export type BankStatementSource = 'UPLOAD' | 'PLAID' | 'PLAID_ASSETS' | 'FINICITY' | 'YODLEE';

export const BANK_STATEMENT_SOURCES: BankStatementSource[] = ['UPLOAD', 'PLAID', 'PLAID_ASSETS', 'FINICITY', 'YODLEE'];

export type BankStatementProvider = {
  id: 'plaid' | 'finicity' | 'yodlee';
  source: Exclude<BankStatementSource, 'UPLOAD' | 'PLAID_ASSETS'>;
  label: string;
  coverage: string;
};

/** Display order is fixed everywhere a Connect button appears. */
export const BANK_STATEMENT_PROVIDERS: BankStatementProvider[] = [
  { id: 'plaid', source: 'PLAID', label: 'Plaid', coverage: 'Statement PDFs from major banks; bank data from most other U.S. banks' },
  { id: 'finicity', source: 'FINICITY', label: 'Finicity', coverage: 'Commercial and regional banks (Mastercard Open Finance)' },
  { id: 'yodlee', source: 'YODLEE', label: 'Yodlee', coverage: 'Community banks and credit unions' },
];

/** Aggregators return at most this many months; older months are uploaded by the client. */
export const AGGREGATOR_MAX_MONTHS = 24;
export const BANK_STATEMENT_REVIEW_MONTHS = 36;

export const BANK_STATEMENT_SOURCE_LABELS: Record<BankStatementSource, string> = {
  UPLOAD: 'Upload',
  PLAID: 'Bank API (Plaid)',
  PLAID_ASSETS: 'Bank Data (Plaid Assets)',
  FINICITY: 'Bank API (Finicity)',
  YODLEE: 'Bank API (Yodlee)',
};

export function isAggregatorSource(source: string | null | undefined): boolean {
  return source === 'PLAID' || source === 'PLAID_ASSETS' || source === 'FINICITY' || source === 'YODLEE';
}

/** One account-month of figures derived from bank transactions and balances. */
export type BankActivityMonth = {
  last4: string | null;
  accountName: string | null;
  month: string; // YYYY-MM
  beginning: number;
  deposits: number;
  withdrawals: number;
  ending: number;
};

export function parseBankActivity(value: unknown): BankActivityMonth[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is BankActivityMonth =>
      !!v &&
      typeof v === 'object' &&
      typeof (v as BankActivityMonth).month === 'string' &&
      ['beginning', 'deposits', 'withdrawals', 'ending'].every((k) => typeof (v as Record<string, unknown>)[k] === 'number'),
  );
}
