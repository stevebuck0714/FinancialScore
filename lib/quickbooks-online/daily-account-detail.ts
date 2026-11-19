import prisma from '@/lib/prisma';
import {
  buildAccountIdToTarget,
  resolveDfsColumnsForTargetField,
  signForDfsColumn,
  type AccountMappingRow,
  type AccountTarget,
} from '@/lib/financial/daily-bs-from-gl';
import {
  displayAccountName,
  incomeDetailLineForTarget,
  roundCents,
  type DailyAccountDetail,
  type DailyAccountDetailRow,
} from '@/lib/financial/daily-account-detail';
import {
  estReportingBusinessDate,
  estReportingWindow,
  isEstBusinessDay,
  utcMidnightForEstDate,
} from '@/lib/time/eastern';

const ASSET_FIELDS = ['cash', 'ar', 'retainageReceivables', 'contractAssets', 'inventory', 'otherCA', 'fixedAssets', 'constructionEquipment', 'officeEquipment', 'shopEquipment', 'investments', 'rightOfUseLeases', 'otherAssets'];
const LIABILITY_FIELDS = ['ap', 'loc', 'contractLiabilities', 'otherCL', 'ltd'];
const OTHER_EQUITY_FIELDS = ['ownersCapital', 'ownersDraw', 'commonStock', 'preferredStock', 'additionalPaidInCapital', 'treasuryStock'];
const BALANCE_FIELDS = new Set([...ASSET_FIELDS, ...LIABILITY_FIELDS, ...OTHER_EQUITY_FIELDS, 'retainedEarnings']);

const isDateKey = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key);

function targetFor(accountIdToTarget: Map<string, AccountTarget>, ...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    const key = String(candidate || '').trim();
    if (key && accountIdToTarget.has(key)) return accountIdToTarget.get(key)!;
  }
  return null;
}

/**
 * Retained earnings is the balance-sheet bridge in the daily rebuild
 * (assets - liabilities - other equity). Mirrors computeDailyBalanceSheetFromGL.
 */
function retainedEarningsBridge(lineTotals: Map<string, number>) {
  const get = (field: string) => lineTotals.get(field) || 0;
  const fixedAssetsTotal = get('fixedAssets') || get('constructionEquipment') + get('officeEquipment') + get('shopEquipment');
  const totalAssets =
    get('cash') + get('ar') + get('retainageReceivables') + get('contractAssets') + get('inventory') + get('otherCA') +
    fixedAssetsTotal + get('investments') + get('rightOfUseLeases') + get('otherAssets');
  const totalLiab = LIABILITY_FIELDS.reduce((sum, field) => sum + get(field), 0);
  const otherEquity = OTHER_EQUITY_FIELDS.reduce((sum, field) => sum + get(field), 0);
  return totalAssets - totalLiab - otherEquity;
}

/**
 * Per-account detail behind QuickBooks Online Daily Financials, from the same
 * GL facts, per-account opening balances, and mappings the daily rebuild uses:
 *  - balance: each mapped balance-sheet account's balance on every balance date
 *  - income: each mapped income-statement account's activity on every day
 */
export async function loadQboDailyAccountDetail(
  companyId: string,
  balanceDateKeys: string[],
  incomeDayKeys: string[],
): Promise<{ balance: DailyAccountDetail | null; income: DailyAccountDetail | null }> {
  const balanceDates = Array.from(new Set(balanceDateKeys.filter(isDateKey))).sort();
  const incomeDays = Array.from(new Set(incomeDayKeys.filter(isDateKey))).sort();
  if (!balanceDates.length && !incomeDays.length) return { balance: null, income: null };

  const mappings = (await prisma.accountMapping.findMany({
    where: {
      companyId,
      targetField: { notIn: ['', 'unmapped', 'UNMAPPED', 'ignored', 'IGNORED'] },
    },
    select: { accountName: true, accountId: true, accountCode: true, accountClassification: true, targetField: true },
  })) as AccountMappingRow[];
  const accountIdToTarget = buildAccountIdToTarget(mappings);
  if (!accountIdToTarget.size) return { balance: null, income: null };
  const accountCodeById = new Map<string, string>();
  for (const mapping of mappings) {
    const id = String(mapping.accountId || '').trim();
    const code = String(mapping.accountCode || '').trim();
    if (id && code && code !== id) accountCodeById.set(id, code);
  }

  const [balance, income] = await Promise.all([
    balanceDates.length ? loadBalanceDetail(companyId, balanceDates, accountIdToTarget, accountCodeById) : null,
    incomeDays.length ? loadIncomeDetail(companyId, incomeDays, accountIdToTarget, accountCodeById) : null,
  ]);
  return { balance, income };
}

async function loadBalanceDetail(
  companyId: string,
  dates: string[],
  accountIdToTarget: Map<string, AccountTarget>,
  accountCodeById: Map<string, string>,
): Promise<DailyAccountDetail | null> {
  // Matches the rebuild: a month's last business day is as of month-end.
  const asOfFor = (dateKey: string) => (isEstBusinessDay(dateKey) ? estReportingWindow(dateKey).end : dateKey);
  const lastDate = dates.map(asOfFor).sort()[dates.length - 1];
  const anchorRows = await prisma.balanceSheetAccountAnchor.findMany({
    where: { companyId, anchorDate: { lte: utcMidnightForEstDate(lastDate) } },
    select: { anchorDate: true, accountId: true, accountCode: true, accountName: true, openingBalance: true },
  });
  if (!anchorRows.length) return null;

  const anchorsByDate = new Map<string, typeof anchorRows>();
  for (const row of anchorRows) {
    const key = row.anchorDate.toISOString().slice(0, 10);
    const list = anchorsByDate.get(key) || [];
    list.push(row);
    anchorsByDate.set(key, list);
  }
  const anchorDates = Array.from(anchorsByDate.keys()).sort();
  const anchorDateFor = (dateKey: string) => {
    let picked: string | null = null;
    for (const anchorDate of anchorDates) {
      if (anchorDate <= dateKey) picked = anchorDate;
      else break;
    }
    return picked;
  };

  const usedAnchorDates = Array.from(new Set(dates.map((dateKey) => anchorDateFor(asOfFor(dateKey))).filter((key): key is string => Boolean(key)))).sort();
  if (!usedAnchorDates.length) return null;
  const glDaily = await prisma.$queryRaw<Array<{ accountId: string; day: string; amount: number }>>`
    SELECT "accountId", to_char("transDate", 'YYYY-MM-DD') AS day, SUM("signedAmount")::float AS amount
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
      AND "transDate" > ${utcMidnightForEstDate(usedAnchorDates[0])}
      AND "transDate" <= ${utcMidnightForEstDate(lastDate)}
    GROUP BY 1, 2
  `;
  const glByAccount = new Map<string, { days: string[]; cumulative: number[] }>();
  for (const row of [...glDaily].sort((a, b) => a.day.localeCompare(b.day))) {
    const series = glByAccount.get(row.accountId) || { days: [], cumulative: [] };
    const previous = series.cumulative[series.cumulative.length - 1] || 0;
    series.days.push(row.day);
    series.cumulative.push(previous + (Number(row.amount) || 0));
    glByAccount.set(row.accountId, series);
  }
  const glThrough = (accountId: string, dayKey: string) => {
    const series = glByAccount.get(accountId);
    if (!series) return 0;
    let low = 0;
    let high = series.days.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (series.days[mid] <= dayKey) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return found >= 0 ? series.cumulative[found] : 0;
  };

  type AccountRow = { targetField: string; accountName: string; valuesByDate: Record<string, number> };
  const rowsByKey = new Map<string, AccountRow>();
  const retainedEarningsByDate: Record<string, number> = {};

  for (const dateKey of dates) {
    const asOf = asOfFor(dateKey);
    const anchorDate = anchorDateFor(asOf);
    if (!anchorDate) continue;
    const lineTotals = new Map<string, number>();
    for (const anchor of anchorsByDate.get(anchorDate) || []) {
      const accountId = String(anchor.accountId || '').trim();
      if (!accountId) continue;
      const target = targetFor(accountIdToTarget, accountId, anchor.accountCode, anchor.accountName);
      if (!target) continue;
      const delta = glThrough(accountId, asOf) - glThrough(accountId, anchorDate);
      const debitBalance = (Number(anchor.openingBalance) || 0) + delta;
      for (const column of resolveDfsColumnsForTargetField(target.targetField)) {
        if (!BALANCE_FIELDS.has(column)) continue;
        const value = debitBalance * signForDfsColumn(column);
        lineTotals.set(column, (lineTotals.get(column) || 0) + value);
        const rowKey = `${column}|${accountId}`;
        const row =
          rowsByKey.get(rowKey) ||
          {
            targetField: column,
            accountName: displayAccountName(String(anchor.accountName || accountId), accountCodeById.get(accountId)),
            valuesByDate: {},
          };
        row.valuesByDate[dateKey] = roundCents(value);
        rowsByKey.set(rowKey, row);
      }
    }
    // The rebuild stores the balancing amount as retained earnings, so the
    // part not held in a retained-earnings account is current-year earnings.
    retainedEarningsByDate[dateKey] = roundCents(retainedEarningsBridge(lineTotals) - (lineTotals.get('retainedEarnings') || 0));
  }

  const rows: DailyAccountDetailRow[] = Array.from(rowsByKey.values()).filter((row) =>
    Object.values(row.valuesByDate).some((value) => Math.abs(value) >= 0.005),
  );
  if (Object.values(retainedEarningsByDate).some((value) => Math.abs(value) >= 0.005)) {
    rows.push({ targetField: 'retainedEarnings', accountName: 'Net Income (current year)', valuesByDate: retainedEarningsByDate });
  }
  rows.sort((a, b) => a.accountName.localeCompare(b.accountName));
  return { asOf: dates[dates.length - 1], rows };
}

async function loadIncomeDetail(
  companyId: string,
  days: string[],
  accountIdToTarget: Map<string, AccountTarget>,
  accountCodeById: Map<string, string>,
): Promise<DailyAccountDetail | null> {
  const daySet = new Set(days);
  // Same activity window as the daily rebuild's P&L: weekend/holiday activity
  // reports on its business day, year-end Income Summary closes excluded.
  const glDaily = await prisma.$queryRaw<Array<{ accountId: string; accountName: string | null; day: string; amount: number }>>`
    SELECT "accountId", MAX("accountName") AS "accountName", to_char("transDate", 'YYYY-MM-DD') AS day,
           SUM("signedAmount")::float AS amount
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
      AND "transDate" >= ${utcMidnightForEstDate(estReportingWindow(days[0]).start)}
      AND "transDate" <= ${utcMidnightForEstDate(estReportingWindow(days[days.length - 1]).end)}
      AND LOWER(BTRIM(COALESCE("ref", ''))) <> 'income summary'
    GROUP BY 1, 3
  `;

  const rowsByKey = new Map<string, DailyAccountDetailRow>();
  for (const glRow of glDaily) {
    const row = { ...glRow, day: estReportingBusinessDate(glRow.day) };
    if (!daySet.has(row.day)) continue;
    const target = targetFor(accountIdToTarget, row.accountId, row.accountName);
    if (!target) continue;
    const line = incomeDetailLineForTarget(target.targetField);
    if (!line) continue;
    const value = (Number(row.amount) || 0) * line.sign;
    if (Math.abs(value) < 0.005) continue;
    const rowKey = `${line.field}|${row.accountId}`;
    const detailRow =
      rowsByKey.get(rowKey) ||
      {
        targetField: line.field,
        accountName: displayAccountName(String(row.accountName || row.accountId), accountCodeById.get(row.accountId)),
        valuesByDate: {},
      };
    detailRow.valuesByDate[row.day] = roundCents((detailRow.valuesByDate[row.day] || 0) + value);
    rowsByKey.set(rowKey, detailRow);
  }
  const rows = Array.from(rowsByKey.values()).sort((a, b) => a.accountName.localeCompare(b.accountName));
  return rows.length ? { asOf: days[days.length - 1], rows } : null;
}
