/**
 * Pure builder for QuickBooks Desktop account-level real-estate lines.
 *  - BALANCE lines: every balance-sheet account at each month end, walked back
 *    from the latest QuickBooks Balance Sheet with General Ledger detail.
 *  - ACTIVITY lines: every income-statement account's monthly activity.
 * Amounts use each account's normal sign (assets debit-positive, liabilities
 * and equity credit-positive, income and expense positive), matching the
 * imported entity workbooks.
 */

export const QBD_DEBIT_BALANCE_TYPES = new Set(['bank', 'accountsreceivable', 'othercurrentasset', 'fixedasset', 'otherasset']);
export const QBD_CREDIT_BALANCE_TYPES = new Set(['accountspayable', 'creditcard', 'othercurrentliability', 'longtermliability', 'equity']);
const INCOME_TYPES = new Set(['income', 'otherincome']);
const EXPENSE_TYPES = new Set(['expense', 'otherexpense', 'costofgoodssold']);

export const QBD_ACCOUNT_TYPE_LABEL: Record<string, string> = {
  bank: 'Bank',
  accountsreceivable: 'AccountsReceivable',
  othercurrentasset: 'OtherCurrentAsset',
  fixedasset: 'FixedAsset',
  otherasset: 'OtherAsset',
  accountspayable: 'AccountsPayable',
  creditcard: 'CreditCard',
  othercurrentliability: 'OtherCurrentLiability',
  longtermliability: 'LongTermLiability',
  equity: 'Equity',
  income: 'Income',
  otherincome: 'Income',
  expense: 'Expense',
  otherexpense: 'Expense',
  costofgoodssold: 'Expense',
};

export type QbdAccount = { key: string; fullName: string; code: string; type: string; listId?: string; accountNumber?: string };
export type QbdBalanceSheetRow = { asOf: string; batchId: string | null; createdAt: Date; account: string; amount: number };
export type QbdGlRow = { account: string; txnDate: string; amount: number };
export type QbdAccountLine = { reportType: 'BALANCE' | 'ACTIVITY'; periodEnd: string; account: QbdAccount; amount: number };

function decode(value: string) {
  return value.replace(/&#183;/g, '·').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

/** "15000 · Land:1606 · Land improvements" -> "land:land improvements" */
export function qbdAccountKey(value: unknown) {
  return decode(String(value || ''))
    .split(':')
    .map((segment) => segment.trim().replace(/^[0-9A-Za-z][0-9A-Za-z.\-]*\s+·\s+/, '').trim())
    .filter(Boolean)
    .join(':')
    .toLowerCase();
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function nextMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, '0')}`;
}

export function buildQbdAccountMap(rows: Array<{ listId?: string | null; fullName: string | null; accountType: string | null; accountNumber: string | null }>) {
  const codeCounts = new Map<string, number>();
  rows.forEach((row) => { if (row.accountNumber) codeCounts.set(row.accountNumber, (codeCounts.get(row.accountNumber) || 0) + 1); });
  const accounts = new Map<string, QbdAccount>();
  for (const row of rows) {
    const fullName = String(row.fullName || '').trim();
    const type = String(row.accountType || '').toLowerCase();
    const key = qbdAccountKey(fullName);
    if (!fullName || !type || accounts.has(key)) continue;
    const code = row.accountNumber && codeCounts.get(row.accountNumber) === 1 ? row.accountNumber : fullName;
    accounts.set(key, { key, fullName, code, type, listId: row.listId || undefined, accountNumber: row.accountNumber || undefined });
  }
  return accounts;
}

/** Rows of the latest Balance Sheet date, from the latest batch that reported it. */
export function pickLatestQbdBalanceSheet(rows: QbdBalanceSheetRow[]) {
  const asOf = rows.map((row) => row.asOf).sort().at(-1);
  if (!asOf) return null;
  const forDate = rows.filter((row) => row.asOf === asOf);
  const latest = forDate.reduce((best, row) => (row.createdAt > best.createdAt ? row : best), forDate[0]);
  const byAccount = new Map<string, number>();
  forDate.filter((row) => row.batchId === latest.batchId).forEach((row) => byAccount.set(row.account, row.amount));
  return { asOf, rows: Array.from(byAccount.entries()).map(([account, amount]) => ({ account, amount })) };
}

export function buildQbdAccountLines(
  accounts: Map<string, QbdAccount>,
  balanceSheet: { asOf: string; rows: Array<{ account: string; amount: number }> },
  glRows: QbdGlRow[],
) {
  const resolve = (name: string) => accounts.get(qbdAccountKey(name));
  const isBalanceType = (type: string) => QBD_DEBIT_BALANCE_TYPES.has(type) || QBD_CREDIT_BALANCE_TYPES.has(type);
  const isActivityType = (type: string) => INCOME_TYPES.has(type) || EXPENSE_TYPES.has(type);

  // Debit-positive balances at the Balance Sheet date.
  const anchorDebit = new Map<string, number>();
  for (const row of balanceSheet.rows) {
    const account = resolve(row.account);
    if (!account || !isBalanceType(account.type)) continue;
    const debit = QBD_DEBIT_BALANCE_TYPES.has(account.type) ? row.amount : -row.amount;
    anchorDebit.set(account.key, (anchorDebit.get(account.key) || 0) + debit);
  }

  // General Ledger amounts are debit-positive.
  const anchorMonth = balanceSheet.asOf.slice(0, 7);
  const glByAccountMonth = new Map<string, Map<string, number>>();
  const glAfterAnchor = new Map<string, number>();
  let firstMonth = anchorMonth;
  // Each General Ledger transaction nets to zero, so a row whose account name QuickBooks
  // dropped (the report then shows the transaction type) is posted to Retained Earnings to
  // keep every historical month in balance.
  const retainedEarnings = Array.from(accounts.values()).find((account) => account.type === 'equity' && /retained earnings/i.test(account.fullName));
  const unresolvedGlRows: QbdGlRow[] = [];
  for (const row of glRows) {
    let account = resolve(row.account);
    if (!account) {
      unresolvedGlRows.push(row);
      account = retainedEarnings;
    }
    if (!account) continue;
    const month = row.txnDate.slice(0, 7);
    if (month > anchorMonth) continue;
    if (month < firstMonth) firstMonth = month;
    const byMonth = glByAccountMonth.get(account.key) || new Map<string, number>();
    byMonth.set(month, (byMonth.get(month) || 0) + row.amount);
    glByAccountMonth.set(account.key, byMonth);
    if (row.txnDate > balanceSheet.asOf) glAfterAnchor.set(account.key, (glAfterAnchor.get(account.key) || 0) + row.amount);
  }
  const months: string[] = [];
  for (let month = firstMonth; month <= anchorMonth; month = nextMonth(month)) months.push(month);

  const netIncomeByMonth = new Map<string, number>();
  for (const [key, byMonth] of glByAccountMonth) {
    if (!isActivityType(accounts.get(key)!.type)) continue;
    for (const [month, debit] of byMonth) netIncomeByMonth.set(month, (netIncomeByMonth.get(month) || 0) - debit);
  }
  const netIncomeByYear = new Map<number, number>();
  for (const [month, value] of netIncomeByMonth) {
    const year = Number(month.slice(0, 4));
    netIncomeByYear.set(year, (netIncomeByYear.get(year) || 0) + value);
  }
  const anchorYear = Number(anchorMonth.slice(0, 4));
  const round = (value: number) => Math.round(value * 100) / 100;

  const lines: QbdAccountLine[] = [];
  const balanceKeys = new Set<string>([
    ...anchorDebit.keys(),
    ...Array.from(glByAccountMonth.keys()).filter((key) => isBalanceType(accounts.get(key)!.type)),
  ]);
  for (const key of balanceKeys) {
    const account = accounts.get(key)!;
    const byMonth = glByAccountMonth.get(key) || new Map<string, number>();
    const isRetainedEarnings = account.type === 'equity' && /retained earnings/i.test(account.fullName);
    // Balance at the end of month m = anchor-month-end balance minus activity in later months.
    let debit = (anchorDebit.get(key) || 0) + (glAfterAnchor.get(key) || 0);
    for (let index = months.length - 1; index >= 0; index -= 1) {
      const month = months[index];
      if (index < months.length - 1) debit -= byMonth.get(months[index + 1]) || 0;
      let natural = QBD_DEBIT_BALANCE_TYPES.has(account.type) ? debit : -debit;
      if (isRetainedEarnings) {
        // QuickBooks closes each year's net income into Retained Earnings on January 1.
        for (let closed = Number(month.slice(0, 4)); closed < anchorYear; closed += 1) natural -= netIncomeByYear.get(closed) || 0;
      }
      if (Math.abs(natural) >= 0.005) lines.push({ reportType: 'BALANCE', periodEnd: monthEnd(month), account, amount: round(natural) });
    }
  }
  const netIncomeAccount: QbdAccount = { key: 'qbd_net_income', fullName: 'Net Income', code: 'qbd_net_income', type: 'equity' };
  let ytd = 0;
  for (const month of months) {
    if (month.endsWith('-01')) ytd = 0;
    ytd += netIncomeByMonth.get(month) || 0;
    if (Math.abs(ytd) >= 0.005) lines.push({ reportType: 'BALANCE', periodEnd: monthEnd(month), account: netIncomeAccount, amount: round(ytd) });
  }
  for (const [key, byMonth] of glByAccountMonth) {
    const account = accounts.get(key)!;
    if (!isActivityType(account.type)) continue;
    for (const [month, debit] of byMonth) {
      const natural = INCOME_TYPES.has(account.type) ? -debit : debit;
      if (Math.abs(natural) >= 0.005) lines.push({ reportType: 'ACTIVITY', periodEnd: monthEnd(month), account, amount: round(natural) });
    }
  }
  return { asOf: balanceSheet.asOf, firstMonth, lastMonth: anchorMonth, lines, unresolvedGlRows };
}

/**
 * Normal-sign balance of every balance-sheet account on each requested date,
 * walked from the latest Balance Sheet with General Ledger detail, plus the
 * Balance Sheet's computed current-year Net Income for each date.
 */
export function buildQbdDailyAccountBalances(
  accounts: Map<string, QbdAccount>,
  balanceSheet: { asOf: string; rows: Array<{ account: string; amount: number }> },
  glRows: QbdGlRow[],
  dateKeys: string[],
) {
  const isBalanceType = (type: string) => QBD_DEBIT_BALANCE_TYPES.has(type) || QBD_CREDIT_BALANCE_TYPES.has(type);
  const isActivityType = (type: string) => INCOME_TYPES.has(type) || EXPENSE_TYPES.has(type);
  const retainedEarnings = Array.from(accounts.values()).find((account) => account.type === 'equity' && /retained earnings/i.test(account.fullName));
  const resolve = (name: string) => accounts.get(qbdAccountKey(name)) || retainedEarnings;

  const anchorDebit = new Map<string, number>();
  for (const row of balanceSheet.rows) {
    const account = accounts.get(qbdAccountKey(row.account));
    if (!account || !isBalanceType(account.type)) continue;
    const debit = QBD_DEBIT_BALANCE_TYPES.has(account.type) ? row.amount : -row.amount;
    anchorDebit.set(account.key, (anchorDebit.get(account.key) || 0) + debit);
  }

  const glByAccount = new Map<string, QbdGlRow[]>();
  const netIncomeRows: Array<{ txnDate: string; amount: number }> = [];
  for (const row of glRows) {
    const account = resolve(row.account);
    if (!account) continue;
    if (isActivityType(account.type)) netIncomeRows.push({ txnDate: row.txnDate, amount: -row.amount });
    if (!isBalanceType(account.type)) continue;
    const list = glByAccount.get(account.key) || [];
    list.push(row);
    glByAccount.set(account.key, list);
  }
  const netIncomeByYear = new Map<number, number>();
  for (const row of netIncomeRows) {
    const year = Number(row.txnDate.slice(0, 4));
    netIncomeByYear.set(year, (netIncomeByYear.get(year) || 0) + row.amount);
  }
  const anchorYear = Number(balanceSheet.asOf.slice(0, 4));
  const round = (value: number) => Math.round(value * 100) / 100;

  const balances: Array<{ account: QbdAccount; byDate: Record<string, number> }> = [];
  for (const key of new Set([...anchorDebit.keys(), ...glByAccount.keys()])) {
    const account = accounts.get(key);
    if (!account) continue;
    const rows = glByAccount.get(key) || [];
    const isRetainedEarnings = account === retainedEarnings;
    const byDate: Record<string, number> = {};
    for (const dateKey of dateKeys) {
      // Balance on date d = Balance Sheet balance minus activity between d and the Balance Sheet date.
      let debit = anchorDebit.get(key) || 0;
      for (const row of rows) {
        if (row.txnDate > dateKey && row.txnDate <= balanceSheet.asOf) debit -= row.amount;
        else if (row.txnDate > balanceSheet.asOf && row.txnDate <= dateKey) debit += row.amount;
      }
      let natural = QBD_DEBIT_BALANCE_TYPES.has(account.type) ? debit : -debit;
      if (isRetainedEarnings) {
        // QuickBooks closes each year's net income into Retained Earnings on January 1.
        const year = Number(dateKey.slice(0, 4));
        for (let closed = year; closed < anchorYear; closed += 1) natural -= netIncomeByYear.get(closed) || 0;
        for (let opened = anchorYear; opened < year; opened += 1) natural += netIncomeByYear.get(opened) || 0;
      }
      byDate[dateKey] = round(natural);
    }
    if (Object.values(byDate).some((value) => Math.abs(value) >= 0.005)) balances.push({ account, byDate });
  }

  const netIncomeByDate: Record<string, number> = {};
  for (const dateKey of dateKeys) {
    const yearStart = `${dateKey.slice(0, 4)}-01-01`;
    netIncomeByDate[dateKey] = round(
      netIncomeRows.reduce((sum, row) => (row.txnDate >= yearStart && row.txnDate <= dateKey ? sum + row.amount : sum), 0),
    );
  }
  return { asOf: balanceSheet.asOf, balances, netIncomeByDate };
}
