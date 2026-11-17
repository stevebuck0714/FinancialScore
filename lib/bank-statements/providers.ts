export type BankStatementSource = 'UPLOAD' | 'PLAID' | 'FINICITY' | 'YODLEE';

export type BankStatementProvider = {
  id: 'plaid' | 'finicity' | 'yodlee';
  source: Exclude<BankStatementSource, 'UPLOAD'>;
  label: string;
  coverage: string;
};

/** Display order is fixed everywhere a Connect button appears. */
export const BANK_STATEMENT_PROVIDERS: BankStatementProvider[] = [
  { id: 'plaid', source: 'PLAID', label: 'Plaid', coverage: 'Major national banks (Chase, Bank of America, Wells Fargo, Citi, U.S. Bank)' },
  { id: 'finicity', source: 'FINICITY', label: 'Finicity', coverage: 'Commercial and regional banks (Mastercard Open Finance)' },
  { id: 'yodlee', source: 'YODLEE', label: 'Yodlee', coverage: 'Community banks and credit unions' },
];

/** Aggregators return at most this many months; older months are uploaded by the client. */
export const AGGREGATOR_MAX_MONTHS = 24;
export const BANK_STATEMENT_REVIEW_MONTHS = 36;

export const BANK_STATEMENT_SOURCE_LABELS: Record<BankStatementSource, string> = {
  UPLOAD: 'Upload',
  PLAID: 'Bank API (Plaid)',
  FINICITY: 'Bank API (Finicity)',
  YODLEE: 'Bank API (Yodlee)',
};

export function isAggregatorSource(source: string | null | undefined): boolean {
  return source === 'PLAID' || source === 'FINICITY' || source === 'YODLEE';
}
