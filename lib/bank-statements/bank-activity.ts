import { monthRange, shiftMonth } from '@/lib/cash-proof/book-balances';
import { addEstCalendarDays } from '@/lib/time/eastern';
import type { BankActivityMonth } from './providers';

export type AssetReportAccount = {
  account_id: string;
  mask: string | null;
  name: string | null;
  official_name: string | null;
  type: string;
  subtype: string | null;
  days_available: number;
  balances: { current: number | null };
  historical_balances: Array<{ date: string; current: number }>;
  transactions: AssetReportTransaction[];
};

/** Fields past `pending` are only returned when the report is fetched with insights. */
export type AssetReportTransaction = {
  transaction_id: string;
  date: string;
  /** Plaid sign convention: positive is money out of the account, negative is money in. */
  amount: number;
  pending: boolean;
  date_transacted?: string | null;
  iso_currency_code?: string | null;
  unofficial_currency_code?: string | null;
  original_description?: string | null;
  merchant_name?: string | null;
  category?: string[] | null;
  category_id?: string | null;
  credit_category?: { primary?: string | null; detailed?: string | null } | null;
  check_number?: string | null;
  transaction_type?: string | null;
  payment_meta?: {
    payer?: string | null;
    payee?: string | null;
    by_order_of?: string | null;
    payment_method?: string | null;
    payment_processor?: string | null;
    reference_number?: string | null;
    ppd_id?: string | null;
    reason?: string | null;
  } | null;
  location?: Record<string, unknown> | null;
};

/** A posted transaction ready to save; amount is positive for money in. */
export type BankTransactionInput = {
  externalId: string;
  institution: string | null;
  accountLast4: string | null;
  accountName: string | null;
  date: string;
  dateTransacted: string | null;
  amount: number;
  currency: string | null;
  description: string | null;
  merchantName: string | null;
  category: string[];
  categoryId: string | null;
  creditCategoryPrimary: string | null;
  creditCategoryDetailed: string | null;
  checkNumber: string | null;
  transactionType: string | null;
  payer: string | null;
  payee: string | null;
  byOrderOf: string | null;
  paymentMethod: string | null;
  paymentProcessor: string | null;
  referenceNumber: string | null;
  ppdId: string | null;
  reason: string | null;
  location: Record<string, unknown> | null;
};

/** A posted credit-card transaction. Plaid's native positive-charge convention is retained. */
export type CreditCardTransactionInput = Omit<BankTransactionInput, 'amount'> & { amount: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

const hasValue = (o: Record<string, unknown> | null | undefined) => !!o && Object.values(o).some((v) => v !== null && v !== undefined && v !== '');

export function bankTransactionsFromAssetAccount(account: AssetReportAccount, institution: string | null): BankTransactionInput[] {
  const accountLast4 = account.mask ? account.mask.slice(-4) : null;
  const accountName = account.name || account.official_name || null;
  return account.transactions
    .filter((t) => !t.pending)
    .map((t) => ({
      externalId: t.transaction_id,
      institution,
      accountLast4,
      accountName,
      date: t.date,
      dateTransacted: t.date_transacted || null,
      amount: round2(-t.amount),
      currency: t.iso_currency_code || t.unofficial_currency_code || null,
      description: t.original_description || null,
      merchantName: t.merchant_name || null,
      category: t.category || [],
      categoryId: t.category_id || null,
      creditCategoryPrimary: t.credit_category?.primary || null,
      creditCategoryDetailed: t.credit_category?.detailed || null,
      checkNumber: t.check_number || null,
      transactionType: t.transaction_type || null,
      payer: t.payment_meta?.payer || null,
      payee: t.payment_meta?.payee || null,
      byOrderOf: t.payment_meta?.by_order_of || null,
      paymentMethod: t.payment_meta?.payment_method || null,
      paymentProcessor: t.payment_meta?.payment_processor || null,
      referenceNumber: t.payment_meta?.reference_number || null,
      ppdId: t.payment_meta?.ppd_id || null,
      reason: t.payment_meta?.reason || null,
      location: hasValue(t.location) ? t.location! : null,
    }));
}

export function creditCardTransactionsFromAssetAccount(
  account: AssetReportAccount,
  institution: string | null,
): CreditCardTransactionInput[] {
  const accountLast4 = account.mask ? account.mask.slice(-4) : null;
  const accountName = account.name || account.official_name || null;
  return account.transactions
    .filter((t) => !t.pending)
    .map((t) => ({
      externalId: t.transaction_id,
      institution,
      accountLast4,
      accountName,
      date: t.date,
      dateTransacted: t.date_transacted || null,
      amount: round2(t.amount),
      currency: t.iso_currency_code || t.unofficial_currency_code || null,
      description: t.original_description || null,
      merchantName: t.merchant_name || null,
      category: t.category || [],
      categoryId: t.category_id || null,
      creditCategoryPrimary: t.credit_category?.primary || null,
      creditCategoryDetailed: t.credit_category?.detailed || null,
      checkNumber: t.check_number || null,
      transactionType: t.transaction_type || null,
      payer: t.payment_meta?.payer || null,
      payee: t.payment_meta?.payee || null,
      byOrderOf: t.payment_meta?.by_order_of || null,
      paymentMethod: t.payment_meta?.payment_method || null,
      paymentProcessor: t.payment_meta?.payment_processor || null,
      referenceNumber: t.payment_meta?.reference_number || null,
      ppdId: t.payment_meta?.ppd_id || null,
      reason: t.payment_meta?.reason || null,
      location: hasValue(t.location) ? t.location! : null,
    }));
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/**
 * Builds statement-style monthly figures for every calendar month fully inside the
 * report's history. Month-end balances come from Plaid's daily balances; when a
 * date is missing, the balance is rolled back from the current balance through
 * posted transactions. Months that start before the history or end on or after
 * the report date are left out rather than reported partially.
 */
export function monthlyActivityFromAssetAccount(account: AssetReportAccount, reportDate: string): BankActivityMonth[] {
  const posted = account.transactions.filter((t) => !t.pending);
  const historyStart =
    account.days_available > 0
      ? addEstCalendarDays(reportDate, -account.days_available)
      : posted.reduce<string | null>((min, t) => (min === null || t.date < min ? t.date : min), null);
  if (!historyStart || account.balances.current === null) return [];

  const balanceByDate = new Map(account.historical_balances.map((b) => [b.date, b.current]));
  const current = account.balances.current;
  const rolledBack = (date: string) => current + posted.reduce((sum, t) => (t.date > date ? sum + t.amount : sum), 0);
  const closingBalance = (date: string) => balanceByDate.get(date) ?? rolledBack(date);

  const firstMonth = historyStart.slice(8) === '01' ? historyStart.slice(0, 7) : shiftMonth(historyStart.slice(0, 7), 1);
  const lastMonth = shiftMonth(reportDate.slice(0, 7), -1);
  if (firstMonth > lastMonth) return [];

  const last4 = account.mask ? account.mask.slice(-4) : null;
  const accountName = account.name || account.official_name || null;
  return monthRange(firstMonth, lastMonth).map((month) => {
    const inMonth = posted.filter((t) => t.date.startsWith(month));
    return {
      last4,
      accountName,
      month,
      beginning: round2(closingBalance(lastDayOfMonth(shiftMonth(month, -1)))),
      deposits: round2(inMonth.reduce((sum, t) => (t.amount < 0 ? sum - t.amount : sum), 0)),
      withdrawals: round2(inMonth.reduce((sum, t) => (t.amount > 0 ? sum + t.amount : sum), 0)),
      ending: round2(closingBalance(lastDayOfMonth(month))),
    };
  });
}
