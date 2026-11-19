import { buildQbdDailyAccountBalances, qbdAccountKey } from '@/lib/real-estate/qbd-account-lines';
import { loadQbdGeneralLedgerDetailRows } from '@/lib/quickbooks-desktop/account-books';
import { loadQbdBooks } from '@/lib/quickbooks-desktop/daily-balance-sheet-detail';
import { resolveDfsColumnsForTargetField } from '@/lib/financial/daily-bs-from-gl';
import { displayAccountName } from '@/lib/financial/daily-account-detail';
import {
  buildBankRegister,
  resolveBankRegisterSelection,
  type BankRegister,
  type BankRegisterAccount,
} from '@/lib/financial/bank-register';
import { addEstCalendarDays } from '@/lib/time/eastern';

/**
 * QuickBooks Desktop bank register from the saved Balance Sheet and General
 * Ledger (the same books Daily Financials uses). Bank accounts are Bank-type
 * accounts plus any account mapped to the Cash line.
 */
export async function loadQbdBankRegister(
  companyId: string,
  requestedAccountKey: string | null,
  startDate: string,
  endDate: string,
): Promise<BankRegister | null> {
  const books = await loadQbdBooks(companyId);
  if (!books.balanceSheet || !books.accounts.size) return null;

  const isCash = (target: string) => Boolean(target) && resolveDfsColumnsForTargetField(target).includes('cash');
  const accountsByKey = new Map<string, BankRegisterAccount>();
  for (const account of books.accounts.values()) {
    const target = books.getTarget({ id: account.listId, name: account.fullName }) || books.getTarget({ name: account.accountNumber });
    if (account.type !== 'bank' && !isCash(target)) continue;
    accountsByKey.set(account.key, { key: account.key, name: displayAccountName(account.fullName, account.accountNumber) });
  }
  const accounts = Array.from(accountsByKey.values()).sort((a, b) => a.name.localeCompare(b.name));
  if (!accounts.length) return null;

  const { accountKey, keys } = resolveBankRegisterSelection(accounts, requestedAccountKey);
  const selected = new Set(keys);
  const beginningDate = addEstCalendarDays(startDate, -1);
  const { balances } = buildQbdDailyAccountBalances(books.accounts, books.balanceSheet, books.glRows, [beginningDate, endDate]);
  const balanceOn = (dateKey: string) =>
    balances.reduce((sum, { account, byDate }) => (selected.has(account.key) ? sum + Number(byDate[dateKey] || 0) : sum), 0);

  const activityMonths = new Set<string>();
  for (const row of books.glRows) {
    if (accountsByKey.has(qbdAccountKey(row.account))) activityMonths.add(row.txnDate.slice(0, 7));
  }

  const detailRows = await loadQbdGeneralLedgerDetailRows(companyId, startDate, endDate);
  return buildBankRegister({
    activityMonths: Array.from(activityMonths),
    accounts,
    accountKey,
    startDate,
    endDate,
    beginningBalance: balanceOn(beginningDate),
    ledgerEndingBalance: balanceOn(endDate),
    lines: detailRows.flatMap((row) => {
      const key = qbdAccountKey(row.account);
      if (!selected.has(key)) return [];
      return [{
        date: row.txnDate,
        accountName: accountsByKey.get(key)?.name || row.account,
        type: row.txnType,
        num: row.num,
        description: [row.name, row.memo].filter(Boolean).join(' - '),
        amount: row.amount,
      }];
    }),
  });
}
