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
  /** Plaid sign convention: positive is money out of the account, negative is money in. */
  transactions: Array<{ date: string; amount: number; pending: boolean }>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

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
