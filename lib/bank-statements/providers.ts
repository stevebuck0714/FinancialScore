/**
 * PLAID_ASSETS is a Plaid asset report (bank data and transactions).
 * UPLOAD_EXPORT is a client-uploaded CSV / Excel transaction export, used after the Corelytics team reviews it.
 */
export type BankStatementSource = 'UPLOAD' | 'UPLOAD_EXPORT' | 'PLAID' | 'PLAID_ASSETS';

export const BANK_STATEMENT_SOURCES: BankStatementSource[] = ['UPLOAD', 'UPLOAD_EXPORT', 'PLAID', 'PLAID_ASSETS'];

export type ExportReviewStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export const TRANSACTION_FILE_EXTENSIONS = ['.csv', '.xlsx', '.xls'] as const;

export function isTransactionFileName(fileName: string): boolean {
  const name = fileName.toLowerCase();
  return TRANSACTION_FILE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export type BankStatementProvider = {
  id: 'plaid';
  source: Exclude<BankStatementSource, 'UPLOAD' | 'PLAID_ASSETS'>;
  label: string;
  coverage: string;
};

/** Display order is fixed everywhere a Connect button appears. */
export const BANK_STATEMENT_PROVIDERS: BankStatementProvider[] = [
  { id: 'plaid', source: 'PLAID', label: 'Plaid', coverage: 'Statement PDFs from major banks; bank data from most other U.S. banks' },
];

/** Aggregators return at most this many months; older months are uploaded by the client. */
export const AGGREGATOR_MAX_MONTHS = 24;
export const BANK_STATEMENT_REVIEW_MONTHS = 36;

export const BANK_STATEMENT_SOURCE_LABELS: Record<BankStatementSource, string> = {
  UPLOAD: 'Upload',
  UPLOAD_EXPORT: 'Upload (CSV/Excel)',
  PLAID: 'Bank API (Plaid)',
  PLAID_ASSETS: 'Bank Data (Plaid Assets)',
};

export function isAggregatorSource(source: string | null | undefined): boolean {
  return source === 'PLAID' || source === 'PLAID_ASSETS';
}

/**
 * One account-month of figures derived from bank transactions. Balances are null for
 * client transaction exports, which list transactions only.
 */
export type BankActivityMonth = {
  last4: string | null;
  accountName: string | null;
  month: string; // YYYY-MM
  beginning: number | null;
  deposits: number;
  withdrawals: number;
  ending: number | null;
};

const numberOrNull = (v: unknown) => v === null || typeof v === 'number';

export function parseBankActivity(value: unknown): BankActivityMonth[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is BankActivityMonth => {
    const r = v as Record<string, unknown> | null;
    return (
      !!r &&
      typeof r === 'object' &&
      typeof r.month === 'string' &&
      typeof r.deposits === 'number' &&
      typeof r.withdrawals === 'number' &&
      numberOrNull(r.beginning) &&
      numberOrNull(r.ending)
    );
  });
}
