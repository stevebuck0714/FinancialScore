import prisma from '@/lib/prisma';
import { buildQbdAccountMap, buildQbdDailyAccountBalances, pickLatestQbdBalanceSheet } from '@/lib/real-estate/qbd-account-lines';
import { loadQbdAccountRows, loadQbdBalanceSheetRows, loadQbdGeneralLedgerRows } from '@/lib/quickbooks-desktop/account-books';
import { qbdAccountSideForType, qbdBuildMappingTargetLookup, qbdSignedBalanceForTarget } from '@/lib/quickbooks-desktop/account-lookup';

export type DailyBalanceSheetDetailRow = {
  targetField: string;
  accountName: string;
  valuesByDate: Record<string, number>;
};

export type DailyBalanceSheetDetail = {
  asOf: string;
  rows: DailyBalanceSheetDetailRow[];
};

function displayAccountName(fullName: string, accountNumber?: string) {
  const name = fullName.replace(/&#183;/g, '·').replace(/:/g, ' › ');
  return accountNumber ? `${accountNumber} · ${name}` : name;
}

/**
 * Per-account balances behind each Daily Financials balance-sheet line, from
 * the saved QuickBooks Desktop Balance Sheet and General Ledger, mapped and
 * signed the same way the daily snapshot totals are.
 */
export async function loadQbdDailyBalanceSheetDetail(companyId: string, dateKeys: string[]): Promise<DailyBalanceSheetDetail | null> {
  const dates = Array.from(new Set(dateKeys.filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key)))).sort();
  if (!dates.length) return null;
  const [accountRows, balanceSheetRows, glRows, mappings] = await Promise.all([
    loadQbdAccountRows(companyId),
    loadQbdBalanceSheetRows(companyId),
    loadQbdGeneralLedgerRows(companyId),
    prisma.accountMapping.findMany({
      where: { companyId },
      select: { accountId: true, accountName: true, accountCode: true, targetField: true },
    }),
  ]);
  const accounts = buildQbdAccountMap(accountRows);
  const balanceSheet = pickLatestQbdBalanceSheet(balanceSheetRows);
  if (!balanceSheet || !accounts.size) return null;

  const getTarget = qbdBuildMappingTargetLookup(mappings);
  const { asOf, balances, netIncomeByDate } = buildQbdDailyAccountBalances(accounts, balanceSheet, glRows, dates);
  const rows: DailyBalanceSheetDetailRow[] = balances.map(({ account, byDate }) => {
    const targetField = getTarget({ id: account.listId, name: account.fullName }) || getTarget({ name: account.accountNumber });
    const side = qbdAccountSideForType(account.type);
    const valuesByDate: Record<string, number> = {};
    for (const [dateKey, value] of Object.entries(byDate)) {
      valuesByDate[dateKey] = targetField ? qbdSignedBalanceForTarget(value, side, targetField) : value;
    }
    return { targetField, accountName: displayAccountName(account.fullName, account.accountNumber), valuesByDate };
  });
  if (Object.values(netIncomeByDate).some((value) => Math.abs(value) >= 0.005)) {
    // The Balance Sheet's computed Net Income row lands in Retained Earnings.
    rows.push({ targetField: 'retainedEarnings', accountName: 'Net Income (current year)', valuesByDate: netIncomeByDate });
  }
  rows.sort((a, b) => a.accountName.localeCompare(b.accountName));
  return { asOf, rows };
}
