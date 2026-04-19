/**
 * Daily Balance Sheet rebuilder — derives DailyFinancialSnapshot rows
 * directly from GLTransactionFact (the system of record for posted activity)
 * by way of AccountMapping.targetField → DailyFinancialSnapshot column.
 *
 * Why this exists:
 *   The daily-financials ingest path in lib/financial/daily-financial-ingest.ts
 *   is fed by upstream IDO snapshots that carry "current" balances, which
 *   drift from GL whenever the bank/AR/AP modules don't post back to the GL
 *   on the same day. This rebuilder replays GL into the daily snapshots from
 *   first principles for any historical window.
 *
 * Same architectural pattern as rebuildAllCashSnapshotsFromGL in
 * lib/infor-m3/operational-sync.ts, generalized to the full balance sheet
 * plus YTD P&L and a derived rolling Retained Earnings.
 */

import prisma from '@/lib/prisma';
import { BS_LAST_DAY_FIELDS, PNL_SUM_FIELDS } from '@/lib/financial/month-publish';

type Frequency = 'daily' | 'weekly' | 'monthly';

const ASSET_TARGET_FIELDS = new Set<string>([
  'cash',
  'ar',
  'inventory',
  'otherCA',
  'fixedAssets',
  'otherAssets',
]);

const LIABILITY_TARGET_FIELDS = new Set<string>([
  'ap',
  'loc',
  'otherCL',
  'ltd',
]);

// Equity fields stored on DailyFinancialSnapshot (excludes the computed totals).
// retainedEarnings is computed separately as bookedRE + YTD net income.
const EQUITY_TARGET_FIELDS = new Set<string>([
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
]);

// Income statement fields whose natural balance is a credit (revenue / income).
const INCOME_PNL_FIELDS = new Set<string>([
  'revenue',
  'nonOperatingIncome',
]);

// All P&L fields except income are treated as expense-natural (debit balance).
// extraordinaryItems is treated as expense-side by default; if the chart of
// accounts has a credit-balance extraordinary gain, the GL signs will still
// produce the right number with a flip downstream.
const ALL_PNL_FIELDS = new Set<string>(PNL_SUM_FIELDS as readonly string[]);
const EXPENSE_PNL_FIELDS = new Set<string>(
  Array.from(ALL_PNL_FIELDS).filter((f) => !INCOME_PNL_FIELDS.has(f))
);

/**
 * Sign factor that converts GL `debit - credit` into the value we want stored
 * in DailyFinancialSnapshot for that target field.
 *
 * Convention used by the rest of the app: BS values are stored as positive
 * numbers in their natural-balance column (assets positive, liabilities
 * positive, equity positive). P&L values are stored as positive numbers in
 * their natural-balance column (revenue positive, expense positive).
 *
 * GL stores debits and credits at face value. So:
 *   asset / expense (debit-balance natural) → use +1 (debit - credit)
 *   liability / equity / income (credit-balance natural) → use -1 (credit - debit)
 *
 * ownersDraw is a debit-balance equity contra; intentionally bucketed with
 * equity (-1) so a debit balance there reduces totalEquity in the rollup.
 */
function signForTargetField(field: string): number {
  if (ASSET_TARGET_FIELDS.has(field)) return 1;
  if (LIABILITY_TARGET_FIELDS.has(field)) return -1;
  if (EQUITY_TARGET_FIELDS.has(field)) return -1;
  if (INCOME_PNL_FIELDS.has(field)) return -1;
  if (EXPENSE_PNL_FIELDS.has(field)) return 1;
  return 1;
}

type AccountMappingRow = {
  qbAccount: string | null;
  qbAccountId: string | null;
  qbAccountCode: string | null;
  qbAccountClassification: string | null;
  targetField: string;
};

type AccountTarget = {
  targetField: string;
  classification: string | null;
  qbAccount: string | null;
};

/**
 * Build a fast lookup from any candidate account identifier (qbAccountId,
 * qbAccountCode, qbAccount) → its mapped target field. Multiple mapping
 * rows may share the same identifier; first-write-wins keeps the lookup
 * deterministic. This mirrors the cash rebuilder's probing strategy because
 * Infor companies historically carried the GL account number in any of those
 * three slots depending on how the connection was originally configured.
 */
function buildAccountIdToTarget(
  mappings: AccountMappingRow[]
): Map<string, AccountTarget> {
  const out = new Map<string, AccountTarget>();
  for (const m of mappings) {
    const target: AccountTarget = {
      targetField: m.targetField,
      classification: m.qbAccountClassification,
      qbAccount: m.qbAccount,
    };
    for (const candidate of [m.qbAccountId, m.qbAccountCode, m.qbAccount]) {
      const trimmed = String(candidate || '').trim();
      if (trimmed && !out.has(trimmed)) out.set(trimmed, target);
    }
  }
  return out;
}

type GlSumRow = { accountId: string; balance: number | null };

async function sumGLByAccount(
  companyId: string,
  accountIds: string[],
  startDateInclusive: Date | null,
  endDateInclusive: Date
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (accountIds.length === 0) return out;

  // Two query shapes: one with a lower bound (YTD P&L), one without (BS
  // running balance from beginning of time). Keeping them as separate
  // template-literal calls preserves Prisma parameter typing.
  const rows: GlSumRow[] = startDateInclusive
    ? await prisma.$queryRaw<GlSumRow[]>`
        SELECT
          "accountId",
          SUM(COALESCE("debitAmount", 0) - COALESCE("creditAmount", 0))::float AS balance
        FROM "GLTransactionFact"
        WHERE "companyId" = ${companyId}
          AND "accountId" = ANY(${accountIds}::text[])
          AND "transDate" >= ${startDateInclusive}
          AND "transDate" <= ${endDateInclusive}
        GROUP BY "accountId"
      `
    : await prisma.$queryRaw<GlSumRow[]>`
        SELECT
          "accountId",
          SUM(COALESCE("debitAmount", 0) - COALESCE("creditAmount", 0))::float AS balance
        FROM "GLTransactionFact"
        WHERE "companyId" = ${companyId}
          AND "accountId" = ANY(${accountIds}::text[])
          AND "transDate" <= ${endDateInclusive}
        GROUP BY "accountId"
      `;

  for (const row of rows) {
    out.set(row.accountId, Number(row.balance) || 0);
  }
  return out;
}

type ComputedSnapshot = {
  // BS
  cash: number;
  ar: number;
  inventory: number;
  otherCA: number;
  tca: number;
  fixedAssets: number;
  otherAssets: number;
  totalAssets: number;
  ap: number;
  loc: number;
  otherCL: number;
  tcl: number;
  ltd: number;
  totalLiab: number;
  ownersCapital: number;
  ownersDraw: number;
  commonStock: number;
  preferredStock: number;
  retainedEarnings: number;
  additionalPaidInCapital: number;
  treasuryStock: number;
  totalEquity: number;
  totalLAndE: number;

  // P&L (YTD as-of snapshotDate)
  revenue: number;
  expense: number;
  cogsPayroll: number;
  cogsOwnerPay: number;
  cogsContractors: number;
  cogsMaterials: number;
  cogsCommissions: number;
  cogsOther: number;
  cogsTotal: number;
  payroll: number;
  ownerBasePay: number;
  benefits: number;
  insurance: number;
  professionalFees: number;
  subcontractors: number;
  rent: number;
  taxLicense: number;
  stateIncomeTaxes: number;
  federalIncomeTaxes: number;
  phoneComm: number;
  infrastructure: number;
  autoTravel: number;
  salesExpense: number;
  marketing: number;
  trainingCert: number;
  mealsEntertainment: number;
  interestExpense: number;
  depreciationAmortization: number;
  otherExpense: number;
  nonOperatingIncome: number;
  nonOperatingExpense: number;
  extraordinaryItems: number;
};

function emptySnapshot(): ComputedSnapshot {
  const zero = {} as Record<string, number>;
  for (const f of BS_LAST_DAY_FIELDS) zero[f] = 0;
  for (const f of PNL_SUM_FIELDS) zero[f] = 0;
  return zero as unknown as ComputedSnapshot;
}

function aggregateByTargetField(
  glSums: Map<string, number>,
  accountIdToTarget: Map<string, AccountTarget>
): Map<string, number> {
  const byField = new Map<string, number>();
  for (const [accountId, raw] of glSums.entries()) {
    const target = accountIdToTarget.get(accountId);
    if (!target) continue;
    const sign = signForTargetField(target.targetField);
    const adjusted = (Number(raw) || 0) * sign;
    byField.set(
      target.targetField,
      (byField.get(target.targetField) || 0) + adjusted
    );
  }
  return byField;
}

function computeFiscalYearStart(
  date: Date,
  fyMonth: number,
  fyDay: number
): Date {
  const year = date.getUTCFullYear();
  // Anchor at UTC midnight; this matches how snapshotDate is stored.
  const candidate = new Date(Date.UTC(year, fyMonth - 1, fyDay));
  if (date < candidate) {
    return new Date(Date.UTC(year - 1, fyMonth - 1, fyDay));
  }
  return candidate;
}

/**
 * Compute one DailyFinancialSnapshot row for a single (companyId, snapshotDate).
 *
 * Returns the column values only — the caller is responsible for the upsert
 * (so the same helper can power both per-date rebuilds and ad-hoc previews).
 */
export async function computeDailyBalanceSheetFromGL(
  companyId: string,
  snapshotDate: Date,
  fiscalYearStart: Date,
  accountIdToTarget: Map<string, AccountTarget>
): Promise<ComputedSnapshot> {
  const accountIds = Array.from(accountIdToTarget.keys());
  if (accountIds.length === 0) return emptySnapshot();

  const [bsRaw, ytdRaw] = await Promise.all([
    sumGLByAccount(companyId, accountIds, null, snapshotDate),
    sumGLByAccount(companyId, accountIds, fiscalYearStart, snapshotDate),
  ]);

  const bsByField = aggregateByTargetField(bsRaw, accountIdToTarget);
  const ytdByField = aggregateByTargetField(ytdRaw, accountIdToTarget);

  const get = (m: Map<string, number>, k: string) => m.get(k) || 0;

  // ---- Balance sheet ----
  const cash = get(bsByField, 'cash');
  const ar = get(bsByField, 'ar');
  const inventory = get(bsByField, 'inventory');
  const otherCA = get(bsByField, 'otherCA');
  const fixedAssets = get(bsByField, 'fixedAssets');
  const otherAssets = get(bsByField, 'otherAssets');
  const tca = cash + ar + inventory + otherCA;
  const totalAssets = tca + fixedAssets + otherAssets;

  const ap = get(bsByField, 'ap');
  const loc = get(bsByField, 'loc');
  const otherCL = get(bsByField, 'otherCL');
  const ltd = get(bsByField, 'ltd');
  const tcl = ap + loc + otherCL;
  const totalLiab = tcl + ltd;

  const ownersCapital = get(bsByField, 'ownersCapital');
  const ownersDraw = get(bsByField, 'ownersDraw');
  const commonStock = get(bsByField, 'commonStock');
  const preferredStock = get(bsByField, 'preferredStock');
  const additionalPaidInCapital = get(bsByField, 'additionalPaidInCapital');
  const treasuryStock = get(bsByField, 'treasuryStock');
  const bookedRE = get(bsByField, 'retainedEarnings');

  // YTD P&L (signed positive: revenue +, expense +)
  const revenue = get(ytdByField, 'revenue');
  const nonOperatingIncome = get(ytdByField, 'nonOperatingIncome');
  let totalExpense = 0;
  for (const f of EXPENSE_PNL_FIELDS) totalExpense += get(ytdByField, f);
  const ytdNetIncome = revenue + nonOperatingIncome - totalExpense;

  const retainedEarnings = bookedRE + ytdNetIncome;

  const totalEquity =
    ownersCapital +
    ownersDraw +
    commonStock +
    preferredStock +
    retainedEarnings +
    additionalPaidInCapital +
    treasuryStock;
  const totalLAndE = totalLiab + totalEquity;

  // ---- P&L bucket fields (YTD) — every PNL_SUM_FIELDS field gets written
  //      so the snapshot row always has a complete shape ----
  const out = emptySnapshot();
  out.cash = cash;
  out.ar = ar;
  out.inventory = inventory;
  out.otherCA = otherCA;
  out.tca = tca;
  out.fixedAssets = fixedAssets;
  out.otherAssets = otherAssets;
  out.totalAssets = totalAssets;
  out.ap = ap;
  out.loc = loc;
  out.otherCL = otherCL;
  out.tcl = tcl;
  out.ltd = ltd;
  out.totalLiab = totalLiab;
  out.ownersCapital = ownersCapital;
  out.ownersDraw = ownersDraw;
  out.commonStock = commonStock;
  out.preferredStock = preferredStock;
  out.retainedEarnings = retainedEarnings;
  out.additionalPaidInCapital = additionalPaidInCapital;
  out.treasuryStock = treasuryStock;
  out.totalEquity = totalEquity;
  out.totalLAndE = totalLAndE;

  for (const f of PNL_SUM_FIELDS) {
    (out as unknown as Record<string, number>)[f] = get(ytdByField, f);
  }
  // revenue/nonOperatingIncome already covered by the loop; the explicit
  // names above (revenue/nonOperatingIncome) were just for the netIncome math.

  return out;
}

export type RebuildDailyBSOptions = {
  companyId: string;
  startDate: Date;
  endDate: Date;
  frequency?: Frequency;
  /** 1-12, default 1 (January) */
  fiscalYearStartMonth?: number;
  /** 1-31, default 1 */
  fiscalYearStartDay?: number;
};

/**
 * Recompute DailyFinancialSnapshot rows from GLTransactionFact for every date
 * in [startDate, endDate] inclusive, at the given frequency. Idempotent:
 * existing snapshots for each (companyId, snapshotDate, frequency) are
 * upserted with current GL state.
 */
export async function rebuildDailyFinancialSnapshotsFromGL(
  opts: RebuildDailyBSOptions
): Promise<{
  datesProcessed: number;
  rowsWritten: number;
  mappedAccountCount: number;
  unmappedTargetFields: string[];
}> {
  const companyId = String(opts.companyId || '').trim();
  if (!companyId) throw new Error('rebuildDailyFinancialSnapshotsFromGL: companyId required');
  if (!(opts.startDate instanceof Date) || Number.isNaN(opts.startDate.getTime())) {
    throw new Error('rebuildDailyFinancialSnapshotsFromGL: invalid startDate');
  }
  if (!(opts.endDate instanceof Date) || Number.isNaN(opts.endDate.getTime())) {
    throw new Error('rebuildDailyFinancialSnapshotsFromGL: invalid endDate');
  }
  if (opts.startDate.getTime() > opts.endDate.getTime()) {
    throw new Error('rebuildDailyFinancialSnapshotsFromGL: startDate must be <= endDate');
  }

  const frequency: Frequency = opts.frequency || 'daily';
  const fyMonth = Number(opts.fiscalYearStartMonth || 1);
  const fyDay = Number(opts.fiscalYearStartDay || 1);
  if (!(fyMonth >= 1 && fyMonth <= 12)) {
    throw new Error('rebuildDailyFinancialSnapshotsFromGL: fiscalYearStartMonth must be 1-12');
  }
  if (!(fyDay >= 1 && fyDay <= 31)) {
    throw new Error('rebuildDailyFinancialSnapshotsFromGL: fiscalYearStartDay must be 1-31');
  }

  const mappings = await prisma.accountMapping.findMany({
    where: {
      companyId,
      targetField: { notIn: ['', 'unmapped', 'UNMAPPED'] },
    },
    select: {
      qbAccount: true,
      qbAccountId: true,
      qbAccountCode: true,
      qbAccountClassification: true,
      targetField: true,
    },
  });

  const accountIdToTarget = buildAccountIdToTarget(mappings);

  // Surface any AccountMapping.targetField values we don't know how to bucket.
  // Useful early signal that the COA contains a category we haven't accounted
  // for yet (e.g. a new equity line). These rows will silently be ignored if
  // we can't classify them, so the rebuild caller wants visibility.
  const knownFields = new Set<string>([
    ...ASSET_TARGET_FIELDS,
    ...LIABILITY_TARGET_FIELDS,
    ...EQUITY_TARGET_FIELDS,
    ...ALL_PNL_FIELDS,
  ]);
  const unmappedTargetFields = Array.from(
    new Set(
      mappings
        .map((m) => String(m.targetField || '').trim())
        .filter((f) => f && !knownFields.has(f))
    )
  );

  // Normalize the iteration cursor to UTC midnight so snapshotDate values
  // collide cleanly with the unique index (companyId, snapshotDate, frequency).
  const startUtc = new Date(
    Date.UTC(
      opts.startDate.getUTCFullYear(),
      opts.startDate.getUTCMonth(),
      opts.startDate.getUTCDate()
    )
  );
  const endUtc = new Date(
    Date.UTC(
      opts.endDate.getUTCFullYear(),
      opts.endDate.getUTCMonth(),
      opts.endDate.getUTCDate()
    )
  );

  let datesProcessed = 0;
  let rowsWritten = 0;
  const cursor = new Date(startUtc.getTime());
  while (cursor.getTime() <= endUtc.getTime()) {
    const fiscalYearStart = computeFiscalYearStart(cursor, fyMonth, fyDay);
    const snapshot = await computeDailyBalanceSheetFromGL(
      companyId,
      cursor,
      fiscalYearStart,
      accountIdToTarget
    );

    // Always upsert — even when accountIdToTarget is empty we still write a
    // zeroed row to keep the daily series gapless.
    await prisma.dailyFinancialSnapshot.upsert({
      where: {
        companyId_snapshotDate_frequency: {
          companyId,
          snapshotDate: cursor,
          frequency,
        },
      },
      update: {
        ...snapshot,
        sourcePlatform: 'INFOR_M3_GL_REBUILD',
      },
      create: {
        companyId,
        snapshotDate: cursor,
        frequency,
        ...snapshot,
        sourcePlatform: 'INFOR_M3_GL_REBUILD',
      },
    });

    rowsWritten++;
    datesProcessed++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    datesProcessed,
    rowsWritten,
    mappedAccountCount: accountIdToTarget.size,
    unmappedTargetFields,
  };
}
