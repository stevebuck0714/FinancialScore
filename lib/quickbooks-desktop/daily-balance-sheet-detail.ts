import prisma from '@/lib/prisma';
import {
  buildQbdAccountMap,
  buildQbdDailyAccountBalances,
  isQbdActivityAccountType,
  pickLatestQbdBalanceSheet,
  qbdAccountKey,
} from '@/lib/real-estate/qbd-account-lines';
import { loadQbdAccountRows, loadQbdBalanceSheetRows, loadQbdGeneralLedgerRows } from '@/lib/quickbooks-desktop/account-books';
import { qbdAccountSideForType, qbdBuildMappingTargetLookup, qbdSignedBalanceForTarget } from '@/lib/quickbooks-desktop/account-lookup';
import { isConsolidatedReportingCompany } from '@/lib/real-estate/consolidated-reporting-companies';
import { estReportingBusinessDate, estReportingWindow, formatEstDate, isEstBusinessDay } from '@/lib/time/eastern';
import {
  displayAccountName,
  incomeDetailLineForTarget,
  roundCents,
  type DailyAccountDetail,
  type DailyAccountDetailRow,
} from '@/lib/financial/daily-account-detail';

export type DailyBalanceSheetDetailRow = DailyAccountDetailRow;
export type DailyBalanceSheetDetail = DailyAccountDetail;

/**
 * Per-account balances behind each Daily Financials balance-sheet line, from
 * the saved QuickBooks Desktop Balance Sheet and General Ledger, mapped and
 * signed the same way the daily snapshot totals are.
 */
const isDateKey = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key);

async function loadQbdBooks(companyId: string) {
  const [accountRows, balanceSheetRows, glRows, mappings] = await Promise.all([
    loadQbdAccountRows(companyId),
    loadQbdBalanceSheetRows(companyId),
    loadQbdGeneralLedgerRows(companyId),
    prisma.accountMapping.findMany({
      where: { companyId },
      select: { accountId: true, accountName: true, accountCode: true, targetField: true },
    }),
  ]);
  return {
    accounts: buildQbdAccountMap(accountRows),
    balanceSheet: pickLatestQbdBalanceSheet(balanceSheetRows),
    glRows,
    getTarget: qbdBuildMappingTargetLookup(mappings),
  };
}

type QbdBooks = Awaited<ReturnType<typeof loadQbdBooks>>;

export async function loadQbdDailyBalanceSheetDetail(
  companyId: string,
  dateKeys: string[],
  options: { includeBalanceSheetDate?: boolean } = {},
): Promise<DailyBalanceSheetDetail | null> {
  const dates = Array.from(new Set(dateKeys.filter(isDateKey))).sort();
  if (!dates.length && !options.includeBalanceSheetDate) return null;
  return buildBalanceSheetDetail(await loadQbdBooks(companyId), dates, options);
}

/** Balance-sheet and income-statement account detail for Daily Financials, from one load of the QuickBooks Desktop books. */
export async function loadQbdDailyAccountDetail(
  companyId: string,
  balanceDateKeys: string[],
  incomeDayKeys: string[],
): Promise<{ balance: DailyAccountDetail | null; income: DailyAccountDetail | null }> {
  const balanceDates = Array.from(new Set(balanceDateKeys.filter(isDateKey))).sort();
  const incomeDays = Array.from(new Set(incomeDayKeys.filter(isDateKey))).sort();
  if (!balanceDates.length && !incomeDays.length) return { balance: null, income: null };
  const books = await loadQbdBooks(companyId);
  return {
    balance: balanceDates.length ? buildBalanceSheetDetail(books, balanceDates) : null,
    income: incomeDays.length ? buildIncomeDetail(books, incomeDays) : null,
  };
}

/** Each mapped income-statement account's activity on every requested day, signed like the daily snapshot line it sits under. */
function buildIncomeDetail(books: QbdBooks, days: string[]): DailyAccountDetail | null {
  const { accounts, glRows, getTarget } = books;
  if (!accounts.size) return null;
  const daySet = new Set(days);
  const rowsByKey = new Map<string, DailyAccountDetailRow>();
  for (const glRow of glRows) {
    const row = { ...glRow, txnDate: estReportingBusinessDate(glRow.txnDate) };
    if (!daySet.has(row.txnDate)) continue;
    const account = accounts.get(qbdAccountKey(row.account));
    if (!account || !isQbdActivityAccountType(account.type)) continue;
    const targetField = getTarget({ id: account.listId, name: account.fullName }) || getTarget({ name: account.accountNumber });
    const line = targetField ? incomeDetailLineForTarget(targetField) : null;
    if (!line) continue;
    const rowKey = `${line.field}|${account.key}`;
    const detailRow =
      rowsByKey.get(rowKey) ||
      { targetField: line.field, accountName: displayAccountName(account.fullName, account.accountNumber), valuesByDate: {} };
    detailRow.valuesByDate[row.txnDate] = roundCents((detailRow.valuesByDate[row.txnDate] || 0) + row.amount * line.sign);
    rowsByKey.set(rowKey, detailRow);
  }
  const rows = Array.from(rowsByKey.values())
    .filter((row) => Object.values(row.valuesByDate).some((value) => Math.abs(value) >= 0.005))
    .sort((a, b) => a.accountName.localeCompare(b.accountName));
  return rows.length ? { asOf: days[days.length - 1], rows } : null;
}

function buildBalanceSheetDetail(
  books: QbdBooks,
  dates: string[],
  options: { includeBalanceSheetDate?: boolean } = {},
): DailyBalanceSheetDetail | null {
  const { accounts, balanceSheet, glRows, getTarget } = books;
  if (!balanceSheet || !accounts.size) return null;
  if (options.includeBalanceSheetDate && !dates.includes(balanceSheet.asOf)) dates.push(balanceSheet.asOf);

  // A month's last business day reports the month-end balance (same rule as
  // the daily rows), never past today so forward-dated entries stay out.
  const today = formatEstDate();
  const walkDateFor = (dateKey: string) => {
    if (!isEstBusinessDay(dateKey)) return dateKey;
    const end = estReportingWindow(dateKey).end;
    return end <= today ? end : dateKey > today ? dateKey : today;
  };
  const walkDates = Array.from(new Set(dates.map(walkDateFor))).sort();
  const rekey = (byWalkDate: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const dateKey of dates) {
      const value = byWalkDate[walkDateFor(dateKey)];
      if (value !== undefined) out[dateKey] = value;
    }
    return out;
  };

  const { asOf, balances, netIncomeByDate } = buildQbdDailyAccountBalances(accounts, balanceSheet, glRows, walkDates);
  const rows: DailyBalanceSheetDetailRow[] = balances.map(({ account, byDate }) => {
    const targetField = getTarget({ id: account.listId, name: account.fullName }) || getTarget({ name: account.accountNumber });
    const side = qbdAccountSideForType(account.type);
    const valuesByDate: Record<string, number> = {};
    for (const [dateKey, value] of Object.entries(rekey(byDate))) {
      valuesByDate[dateKey] = targetField ? qbdSignedBalanceForTarget(value, side, targetField) : value;
    }
    return { targetField, accountName: displayAccountName(account.fullName, account.accountNumber), valuesByDate };
  });
  const netIncomeByRequestedDate = rekey(netIncomeByDate);
  if (Object.values(netIncomeByRequestedDate).some((value) => Math.abs(value) >= 0.005)) {
    // The Balance Sheet's computed Net Income row lands in Retained Earnings.
    rows.push({ targetField: 'retainedEarnings', accountName: 'Net Income (current year)', valuesByDate: netIncomeByRequestedDate });
  }
  rows.sort((a, b) => a.accountName.localeCompare(b.accountName));
  return { asOf, rows };
}

const ASSET_FIELDS = ['cash', 'ar', 'retainageReceivables', 'contractAssets', 'inventory', 'otherCA', 'fixedAssets', 'constructionEquipment', 'officeEquipment', 'shopEquipment', 'investments', 'rightOfUseLeases', 'otherAssets'] as const;
const LIABILITY_FIELDS = ['ap', 'loc', 'contractLiabilities', 'otherCL', 'ltd'] as const;
const EQUITY_FIELDS = ['ownersCapital', 'ownersDraw', 'commonStock', 'preferredStock', 'retainedEarnings', 'additionalPaidInCapital', 'treasuryStock'] as const;
const LINE_FIELDS = [...ASSET_FIELDS, ...LIABILITY_FIELDS, ...EQUITY_FIELDS];
const TOTAL_FIELDS = ['tca', 'totalAssets', 'tcl', 'totalLiab', 'totalEquity', 'totalLAndE'] as const;

function balanceSheetFromDetail(detail: DailyBalanceSheetDetail, dateKey: string) {
  const values: Record<string, number> = Object.fromEntries(LINE_FIELDS.map((field) => [field, 0]));
  for (const row of detail.rows) {
    if (row.targetField in values) values[row.targetField] += Number(row.valuesByDate[dateKey] || 0);
  }
  const sum = (fields: readonly string[]) => fields.reduce((total, field) => total + values[field], 0);
  const tca = sum(['cash', 'ar', 'retainageReceivables', 'contractAssets', 'inventory', 'otherCA']);
  const totalAssets = sum(ASSET_FIELDS);
  const tcl = sum(['ap', 'loc', 'contractLiabilities', 'otherCL']);
  const totalLiab = tcl + values.ltd;
  const totalEquity = sum(EQUITY_FIELDS);
  const round = (value: number) => Math.round(value * 100) / 100;
  const result: Record<string, number> = {};
  for (const [field, value] of Object.entries({ ...values, tca, totalAssets, tcl, totalLiab, totalEquity, totalLAndE: totalLiab + totalEquity })) {
    result[field] = round(value);
  }
  return result;
}

/**
 * Rewrites the balance-sheet fields of every QuickBooks Desktop daily snapshot
 * from the account-level walk, so historical days carry the same mapped and
 * signed balances as the latest QuickBooks Balance Sheet. Skipped when the walk
 * does not balance on the Balance Sheet date (for example, an unmapped account).
 */
export async function realignQbdDailyBalanceSheetsToAccounts(companyId: string, sourcePlatform: string) {
  const snapshots = await prisma.dailyFinancialSnapshot.findMany({
    where: { companyId, frequency: 'daily', sourcePlatform },
    select: { id: true, snapshotDate: true },
  });
  if (!snapshots.length) return { updated: 0, skipped: 'no_snapshots' };
  const dateKeyFor = (date: Date) => date.toISOString().slice(0, 10);
  const detail = await loadQbdDailyBalanceSheetDetail(
    companyId,
    snapshots.map((row) => dateKeyFor(row.snapshotDate)),
    { includeBalanceSheetDate: true },
  );
  if (!detail) return { updated: 0, skipped: 'no_balance_sheet' };

  const anchor = balanceSheetFromDetail(detail, detail.asOf);
  const difference = Math.round((anchor.totalAssets - anchor.totalLAndE) * 100) / 100;
  if (Math.abs(difference) > 1) {
    return { updated: 0, skipped: 'accounts_out_of_balance', asOf: detail.asOf, difference };
  }

  const updated = await writeBalanceSheetRows(
    'DailyFinancialSnapshot',
    snapshots.map((snapshot) => ({ id: snapshot.id, balances: balanceSheetFromDetail(detail, dateKeyFor(snapshot.snapshotDate)) })),
    true,
  );
  return { updated, asOf: detail.asOf };
}

async function writeBalanceSheetRows(table: 'DailyFinancialSnapshot' | 'MonthlyFinancial', rows: Array<{ id: string; balances: Record<string, number> }>, hasUpdatedAt: boolean) {
  const columns = [...LINE_FIELDS, ...TOTAL_FIELDS];
  const chunkSize = 200;
  let updated = 0;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const params: unknown[] = [];
    const values = rows.slice(start, start + chunkSize).map((row) => {
      params.push(row.id, ...columns.map((field) => row.balances[field] || 0));
      const base = params.length - columns.length - 1;
      return `($${base + 1}::text,${columns.map((_, index) => `$${base + index + 2}::float8`).join(',')})`;
    });
    updated += await prisma.$executeRawUnsafe(
      `UPDATE "${table}" s SET ${columns.map((field) => `"${field}"=v."${field}"`).join(',')}${hasUpdatedAt ? ', "updatedAt"=NOW()' : ''}
       FROM (VALUES ${values.join(',')}) AS v("id",${columns.map((field) => `"${field}"`).join(',')})
       WHERE s."id"=v."id"`,
      ...params,
    );
  }
  return updated;
}

/** Same realignment for the latest financial record's monthly rows, using each month-end balance. */
export async function realignQbdMonthlyBalanceSheetsToAccounts(companyId: string, todayKey: string) {
  if (isConsolidatedReportingCompany(companyId)) return { updated: 0, skipped: 'consolidated_reporting_company' };
  const record = await prisma.financialRecord.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
  if (!record) return { updated: 0, skipped: 'no_financial_record' };
  const months = await prisma.monthlyFinancial.findMany({ where: { financialRecordId: record.id }, select: { id: true, monthDate: true } });
  if (!months.length) return { updated: 0, skipped: 'no_months' };
  const balanceDateFor = (monthDate: Date) => {
    const monthEnd = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    return monthEnd < todayKey ? monthEnd : todayKey;
  };
  const detail = await loadQbdDailyBalanceSheetDetail(companyId, months.map((row) => balanceDateFor(row.monthDate)), { includeBalanceSheetDate: true });
  if (!detail) return { updated: 0, skipped: 'no_balance_sheet' };
  const anchor = balanceSheetFromDetail(detail, detail.asOf);
  const difference = Math.round((anchor.totalAssets - anchor.totalLAndE) * 100) / 100;
  if (Math.abs(difference) > 1) return { updated: 0, skipped: 'accounts_out_of_balance', asOf: detail.asOf, difference };
  const updated = await writeBalanceSheetRows(
    'MonthlyFinancial',
    months.map((row) => ({ id: row.id, balances: balanceSheetFromDetail(detail, balanceDateFor(row.monthDate)) })),
    false,
  );
  return { updated, asOf: detail.asOf };
}
