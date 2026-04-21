/**
 * Daily Balance Sheet rebuilder — derives DailyFinancialSnapshot rows
 * directly from GLTransactionFact (the system of record for posted activity)
 * by way of AccountMapping.targetField → DailyFinancialSnapshot column.
 *
 * Two computation modes:
 *
 * 1) **Anchored** (preferred). When a `BalanceSheetAnchor` row exists with
 *    `anchorDate <= snapshotDate`, each balance-sheet line is computed as
 *      `anchor[field] + GL_delta(accounts mapped to field, anchorDate < transDate <= snapshotDate)`
 *    This avoids drift from incomplete historical GL loads or pre-system
 *    carryover entries — the anchor pins the BS to a trusted external
 *    reference (e.g. the Infor M3 Balance Sheet run for 12/31/2023).
 *
 * 2) **All-time GL sum** (fallback). When no anchor exists at-or-before
 *    `snapshotDate`, each BS line is computed as the cumulative GL
 *    `debit - credit` from the beginning of time through `snapshotDate`.
 *    Same behavior as the original implementation. Useful for
 *    pre-anchor dates or for companies that haven't set an anchor yet.
 *
 * YTD P&L is always derived from GL deltas. When an anchor is in effect
 * the YTD lower bound is `max(fiscalYearStart, anchorDate)` so we never
 * double-count activity already baked into the anchor.
 *
 * Retained Earnings on any snapshotDate is computed as:
 *   anchor.retainedEarnings
 *   + GL postings to RE accounts in (anchorDate, snapshotDate]   ← closing JEs etc.
 *   + prior-period NI in (anchorDate, fiscalYearStart)            ← unclosed prior-FY earnings
 *   + YTD NI in [fiscalYearStart, snapshotDate]                   ← current-FY P&L
 * The "prior-period NI" term handles companies that don't post year-end
 * closing JEs — without it, an unclosed prior FY's earnings would vanish
 * the moment the fiscal year rolls over (YTD restarts at zero, BS-window
 * sum on RE accounts has nothing because no closing JE was posted).
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

// ---------------------------------------------------------------------------
// Target-field translation
//
// AccountMapping.targetField uses two naming conventions interchangeably:
//   1. Bare DFS column names: 'revenue', 'cogsOther', 'fixedAssets', 'ar', etc.
//   2. Slug names:            'rev_finished_goods_sales',
//                             'rev_aftermarket_and_service_revenue',
//                             'cogs_other_cogs',
//                             'cogs_direct_production_labor',
//                             'cogs_scrap_yield_loss', etc.
//
// The monthly builder (lib/infor-m3/csi-monthly-financial-builder.ts) handles
// both conventions via prefix checks (`startsWith('rev_')` /
// `startsWith('cogs_')`). The earlier version of this file did NOT — it used
// `targetField` literally as the bucket key, so any mapping using the slug
// form was silently dropped. For Atlantic Precision this hid all
// `rev_finished_goods_sales` and `cogs_*` activity from every DFS row whose
// last writer was the GL rebuild.
//
// `resolveDfsColumnsForTargetField` below translates a raw targetField to
// one or more DFS columns to receive the signed contribution. For COGS /
// expense subcategories it returns the rollup column AND the specific
// subcategory column (cogsTotal + cogsOther, expense + payroll, etc.) so
// totals stay consistent with the per-bucket lines.
// ---------------------------------------------------------------------------

// Token → DFS column name. Tokens are the lowercased, alphanumeric-only form
// of the targetField (so 'cogsOther', 'cogs_other', 'COGS-OTHER' all collapse
// to 'cogsother'). Mirrors BUCKET_KEY_BY_TARGET_FIELD in the monthly builder.
const TOKEN_TO_DFS_COLUMN: Record<string, string> = {
  // P&L
  revenue: 'revenue',
  cogstotal: 'cogsTotal',
  cogspayroll: 'cogsPayroll',
  cogsownerpay: 'cogsOwnerPay',
  cogscontractors: 'cogsContractors',
  cogsmaterials: 'cogsMaterials',
  cogscommissions: 'cogsCommissions',
  cogsother: 'cogsOther',
  expense: 'expense',
  payroll: 'payroll',
  ownerbasepay: 'ownerBasePay',
  benefits: 'benefits',
  insurance: 'insurance',
  professionalfees: 'professionalFees',
  subcontractors: 'subcontractors',
  rent: 'rent',
  taxlicense: 'taxLicense',
  stateincometaxes: 'stateIncomeTaxes',
  federalincometaxes: 'federalIncomeTaxes',
  phonecomm: 'phoneComm',
  infrastructure: 'infrastructure',
  autotravel: 'autoTravel',
  salesexpense: 'salesExpense',
  marketing: 'marketing',
  trainingcert: 'trainingCert',
  mealsentertainment: 'mealsEntertainment',
  interestexpense: 'interestExpense',
  depreciationamortization: 'depreciationAmortization',
  otherexpense: 'otherExpense',
  nonoperatingincome: 'nonOperatingIncome',
  nonoperatingexpense: 'nonOperatingExpense',
  extraordinaryitems: 'extraordinaryItems',
  // BS — assets
  cash: 'cash',
  ar: 'ar',
  inventory: 'inventory',
  otherca: 'otherCA',
  fixedassets: 'fixedAssets',
  otherassets: 'otherAssets',
  // BS — liabilities
  ap: 'ap',
  loc: 'loc',
  othercl: 'otherCL',
  ltd: 'ltd',
  // BS — equity
  ownerscapital: 'ownersCapital',
  ownersdraw: 'ownersDraw',
  commonstock: 'commonStock',
  preferredstock: 'preferredStock',
  retainedearnings: 'retainedEarnings',
  additionalpaidincapital: 'additionalPaidInCapital',
  treasurystock: 'treasuryStock',
};

// Slug-prefix tokens we additionally recognize as cogs subcategories. Mirrors
// the explicit names the COA emits via the mapping UI.
const COGS_SLUG_SUBCATEGORY: Record<string, string> = {
  cogs_payroll: 'cogsPayroll',
  cogs_owner_pay: 'cogsOwnerPay',
  cogs_contractors: 'cogsContractors',
  cogs_materials: 'cogsMaterials',
  cogs_commissions: 'cogsCommissions',
  cogs_other_cogs: 'cogsOther',
  cogs_other: 'cogsOther',
  cogs_direct_production_labor: 'cogsPayroll',
  cogs_scrap_yield_loss: 'cogsOther',
};

function tokenize(raw: string): string {
  return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Resolve a raw `AccountMapping.targetField` value into one or more DFS column
 * names that should each receive the (signed) contribution. Returns an empty
 * array when the targetField doesn't map to any known column — the caller
 * should drop the contribution (and ideally surface it as "unmapped" for
 * mapping-quality dashboards).
 */
export function resolveDfsColumnsForTargetField(rawTargetField: string): readonly string[] {
  const trimmed = String(rawTargetField || '').trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const token = tokenize(trimmed);

  // 1) Direct hit on a known DFS column (bare-name convention).
  const direct = TOKEN_TO_DFS_COLUMN[token];
  if (direct) {
    if (direct === 'cogsTotal') return [direct];
    if (
      direct === 'cogsPayroll' ||
      direct === 'cogsOwnerPay' ||
      direct === 'cogsContractors' ||
      direct === 'cogsMaterials' ||
      direct === 'cogsCommissions' ||
      direct === 'cogsOther'
    ) {
      return ['cogsTotal', direct];
    }
    if (direct === 'expense') return [direct];
    // Operating expense subcategories: route to BOTH the `expense` rollup
    // column AND the subcategory column, mirroring the COGS pattern above
    // (cogs_* → ['cogsTotal', cogsSubcategory]). Without this the
    // `expense` rollup stays at 0 in DFS and the UI's "prefer DFS rollup
    // over per-bucket sum" branch falls through to summing mappedLines —
    // which is incomplete for many accounts and silently under-reports
    // Total Operating Expenses (Atlantic Precision Jan 2026: short by
    // ~$45,866 vs the M3 truth of $449,356).
    //
    // Excludes: stateIncomeTaxes / federalIncomeTaxes (taxes, separate
    // line in the income statement); nonOperatingIncome /
    // nonOperatingExpense / extraordinaryItems (below-the-line).
    if (
      direct === 'payroll' ||
      direct === 'ownerBasePay' ||
      direct === 'benefits' ||
      direct === 'insurance' ||
      direct === 'professionalFees' ||
      direct === 'subcontractors' ||
      direct === 'rent' ||
      direct === 'taxLicense' ||
      direct === 'phoneComm' ||
      direct === 'infrastructure' ||
      direct === 'autoTravel' ||
      direct === 'salesExpense' ||
      direct === 'marketing' ||
      direct === 'trainingCert' ||
      direct === 'mealsEntertainment' ||
      direct === 'interestExpense' ||
      direct === 'depreciationAmortization' ||
      direct === 'otherExpense'
    ) {
      return ['expense', direct];
    }
    return [direct];
  }

  // 2) Revenue slug convention: rev_finished_goods_sales,
  //    rev_aftermarket_and_service_revenue, etc.
  if (lower === 'revenue' || lower.startsWith('rev_') || lower.startsWith('rev-')) {
    return ['revenue'];
  }

  // 3) COGS slug convention: cogs_other_cogs, cogs_direct_production_labor, etc.
  if (
    lower === 'cogstotal' ||
    lower === 'costofgoodssold' ||
    lower.startsWith('cogs_') ||
    lower.startsWith('cogs-')
  ) {
    const sub = COGS_SLUG_SUBCATEGORY[lower];
    if (sub) return ['cogsTotal', sub];
    return ['cogsTotal'];
  }

  // 4) Expense slug convention (rare — expense buckets generally use bare
  //    names, but be defensive).
  if (lower.startsWith('expense_') || lower.startsWith('exp_')) {
    return ['expense', 'otherExpense'];
  }

  // Unknown — caller will treat as unmapped.
  return [];
}

// Anchor columns we care about (everything except RE — RE is handled
// specially because we layer YTD P&L on top of the booked RE anchor).
const ANCHOR_BS_FIELDS = [
  'cash',
  'ar',
  'inventory',
  'otherCA',
  'fixedAssets',
  'otherAssets',
  'ap',
  'loc',
  'otherCL',
  'ltd',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'additionalPaidInCapital',
  'treasuryStock',
] as const;

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

// Sign factor keyed by the resolved DFS column name (post-translation). This
// is the version used by `aggregateByTargetField` once we've routed slug
// targetFields like `rev_finished_goods_sales` to their DFS column
// (`revenue`). Without this, `signForTargetField('rev_finished_goods_sales')`
// would return the default +1 (debit-positive) and produce the wrong sign on
// revenue contributions.
function signForDfsColumn(column: string): number {
  if (ASSET_TARGET_FIELDS.has(column)) return 1;
  if (LIABILITY_TARGET_FIELDS.has(column)) return -1;
  if (EQUITY_TARGET_FIELDS.has(column)) return -1;
  if (INCOME_PNL_FIELDS.has(column)) return -1;
  if (EXPENSE_PNL_FIELDS.has(column)) return 1;
  // cogsTotal and the cogs* subcategories are debit-balance natural
  // (expense-side); cogsTotal isn't in EXPENSE_PNL_FIELDS so handle here.
  if (column === 'cogsTotal' || column.startsWith('cogs')) return 1;
  return 1;
}

type AccountMappingRow = {
  accountName: string | null;
  accountId: string | null;
  accountCode: string | null;
  accountClassification: string | null;
  targetField: string;
};

type AccountTarget = {
  targetField: string;
  classification: string | null;
  accountName: string | null;
};

/**
 * Build a fast lookup from any candidate account identifier (accountId,
 * accountCode, accountName) → its mapped target field. Multiple mapping
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
      classification: m.accountClassification,
      accountName: m.accountName,
    };
    for (const candidate of [m.accountId, m.accountCode, m.accountName]) {
      const trimmed = String(candidate || '').trim();
      if (trimmed && !out.has(trimmed)) out.set(trimmed, target);
    }
  }
  return out;
}

type GlSumRow = { accountId: string; balance: number | null };

/**
 * Sum GL `signedAmount` per account, with flexible window semantics:
 *
 *   - `lowerBoundExclusive` set & `lowerBoundInclusive` null  → transDate >  lowerBoundExclusive
 *   - `lowerBoundInclusive` set & `lowerBoundExclusive` null  → transDate >= lowerBoundInclusive
 *   - both null                                              → no lower bound (running balance from time zero)
 *
 * `endInclusive` is always inclusive: `transDate <= endInclusive`.
 *
 * The exclusive variant is used when an anchor pins the EOD balance for
 * `anchorDate` — we only want to add transactions that happened *after* that
 * day to derive the new balance.
 *
 * NOTE: We sum `signedAmount` (NOT NULL) rather than `debitAmount - creditAmount`
 * because the dr/cr split is not reliably populated across all source
 * programs. Specifically, SLGLTRANS rows on Infor M3 ingests carry
 * signedAmount only and leave debitAmount/creditAmount NULL — using dr-cr
 * silently dropped large chunks of GL activity (e.g. for company APR's AP
 * account 30100 in 2024, all 95 SLGLTRANS rows worth $292K of AP increases
 * were lost). `signedAmount` is the dr-cr-equivalent in standard
 * debit-positive convention and matches dr-cr on rows where both are populated.
 */
async function sumGLByAccount(
  companyId: string,
  accountIds: string[],
  lowerBoundInclusive: Date | null,
  endInclusive: Date,
  lowerBoundExclusive: Date | null = null
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (accountIds.length === 0) return out;

  // Three query shapes (no lower bound, inclusive lower, exclusive lower).
  // Each is its own template-literal call to preserve Prisma parameter typing
  // and keep the SQL trivially auditable.
  let rows: GlSumRow[];
  if (lowerBoundExclusive) {
    rows = await prisma.$queryRaw<GlSumRow[]>`
      SELECT
        "accountId",
        SUM("signedAmount")::float AS balance
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND "accountId" = ANY(${accountIds}::text[])
        AND "transDate" > ${lowerBoundExclusive}
        AND "transDate" <= ${endInclusive}
      GROUP BY "accountId"
    `;
  } else if (lowerBoundInclusive) {
    rows = await prisma.$queryRaw<GlSumRow[]>`
      SELECT
        "accountId",
        SUM("signedAmount")::float AS balance
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND "accountId" = ANY(${accountIds}::text[])
        AND "transDate" >= ${lowerBoundInclusive}
        AND "transDate" <= ${endInclusive}
      GROUP BY "accountId"
    `;
  } else {
    rows = await prisma.$queryRaw<GlSumRow[]>`
      SELECT
        "accountId",
        SUM("signedAmount")::float AS balance
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND "accountId" = ANY(${accountIds}::text[])
        AND "transDate" <= ${endInclusive}
      GROUP BY "accountId"
    `;
  }

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

  // P&L (single-day movement on snapshotDate; multi-day if pnlPeriodStart used)
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

/**
 * Compute the P&L *daily movement* (revenue, cogsTotal, expense rollup, plus
 * each subcategory) for a single (companyId, day) by reading
 * `GLTransactionFact` directly and routing each `AccountMapping.targetField`
 * through `resolveDfsColumnsForTargetField`.
 *
 * This is the same source-of-truth path the GL rebuild uses, exposed as a
 * focused helper so the daily operational sync (`operational-sync.ts`) can
 * stop deriving its `revenueFromGl`/`cogsFromGl`/`expenseFromGl` totals from
 * the partially-populated `DailyFinancialMappedLine` table. mappedLines is a
 * best-effort breakdown that misses accounts (e.g. Atlantic Precision Jan
 * 2026: GL has $700k COGS but mappedLines only captured $282k), which caps
 * the snapshot via `Math.max(revenueFromOps, revenueFromGl)` at the lower
 * incomplete value.
 *
 * Returned values follow DFS natural-balance convention (revenue positive,
 * cogs/expense positive). The window is [`dayStart`, `dayEnd`] inclusive.
 */
export async function computeDailyPnlMovementsFromGL(
  companyId: string,
  dayStart: Date,
  dayEnd: Date
): Promise<{
  revenue: number;
  cogsTotal: number;
  expense: number;
  byColumn: Map<string, number>;
}> {
  const mappings = (await prisma.accountMapping.findMany({
    where: { companyId },
    select: {
      accountId: true,
      accountCode: true,
      accountName: true,
      accountClassification: true,
      targetField: true,
    },
  })) as AccountMappingRow[];
  const accountIdToTarget = buildAccountIdToTarget(mappings);
  const accountIds = Array.from(accountIdToTarget.keys());
  if (accountIds.length === 0) {
    return { revenue: 0, cogsTotal: 0, expense: 0, byColumn: new Map() };
  }

  const glSums = await sumGLByAccount(companyId, accountIds, dayStart, dayEnd);
  const byColumn = aggregateByTargetField(glSums, accountIdToTarget);

  // Read the rollup columns directly. `resolveDfsColumnsForTargetField`
  // routes:
  //   revenue accounts          → 'revenue'
  //   COGS accounts             → ['cogsTotal', cogs_subcategory]
  //   OPEX accounts             → ['expense',   opex_subcategory]
  // so the rollup columns are always populated when the underlying
  // subcategories are. Summing the OPEX subcategories would double-count
  // against the rollup; we take the rollup directly. Non-operating /
  // tax / extraordinary lines are deliberately excluded — they're shown
  // separately on the income statement and tracked in their own DFS
  // columns.
  const revenue = byColumn.get('revenue') || 0;
  const cogsTotal = byColumn.get('cogsTotal') || 0;
  const expense = byColumn.get('expense') || 0;

  return { revenue, cogsTotal, expense, byColumn };
}

function aggregateByTargetField(
  glSums: Map<string, number>,
  accountIdToTarget: Map<string, AccountTarget>
): Map<string, number> {
  const byField = new Map<string, number>();
  for (const [accountId, raw] of glSums.entries()) {
    const target = accountIdToTarget.get(accountId);
    if (!target) continue;
    // Resolve the raw targetField (which can be a slug like
    // 'rev_finished_goods_sales') into one or more DFS column names.
    // Empty array = unknown targetField → contribution dropped.
    const dfsColumns = resolveDfsColumnsForTargetField(target.targetField);
    if (dfsColumns.length === 0) continue;

    // Each contribution lands in EVERY resolved column with the sign of
    // that column's natural balance. For COGS that means cogsTotal AND the
    // matching subcategory both receive the same daily delta — keeping
    // them internally consistent.
    const rawNum = Number(raw) || 0;
    for (const column of dfsColumns) {
      const sign = signForDfsColumn(column);
      const adjusted = rawNum * sign;
      byField.set(column, (byField.get(column) || 0) + adjusted);
    }
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
 * Anchor record we need for the rebuild — only the BS balance lines plus
 * `anchorDate`. Loaded once per rebuild and cached for every date in the
 * window since anchors are immutable for the rebuild's duration.
 */
export type AnchorRecord = {
  anchorDate: Date;
  cash: number;
  ar: number;
  inventory: number;
  otherCA: number;
  fixedAssets: number;
  otherAssets: number;
  ap: number;
  loc: number;
  otherCL: number;
  ltd: number;
  ownersCapital: number;
  ownersDraw: number;
  commonStock: number;
  preferredStock: number;
  retainedEarnings: number;
  additionalPaidInCapital: number;
  treasuryStock: number;
};

/**
 * Resolve the anchor that applies to this snapshotDate, if any.
 *
 * Picks the most-recent anchor with `anchorDate <= snapshotDate`. A company
 * may carry multiple anchors over time (one per fiscal-year-end is the
 * recommended cadence) — this lets us re-anchor each year-end and keep the
 * intra-year math anchored to the most recent trusted statement.
 */
async function findAnchorForDate(
  companyId: string,
  snapshotDate: Date
): Promise<AnchorRecord | null> {
  const row = await prisma.balanceSheetAnchor.findFirst({
    where: {
      companyId,
      anchorDate: { lte: snapshotDate },
    },
    orderBy: { anchorDate: 'desc' },
  });
  if (!row) return null;
  return {
    anchorDate: row.anchorDate,
    cash: row.cash,
    ar: row.ar,
    inventory: row.inventory,
    otherCA: row.otherCA,
    fixedAssets: row.fixedAssets,
    otherAssets: row.otherAssets,
    ap: row.ap,
    loc: row.loc,
    otherCL: row.otherCL,
    ltd: row.ltd,
    ownersCapital: row.ownersCapital,
    ownersDraw: row.ownersDraw,
    commonStock: row.commonStock,
    preferredStock: row.preferredStock,
    retainedEarnings: row.retainedEarnings,
    additionalPaidInCapital: row.additionalPaidInCapital,
    treasuryStock: row.treasuryStock,
  };
}

/**
 * Compute one DailyFinancialSnapshot row for a single (companyId, snapshotDate).
 *
 * Returns the column values only — the caller is responsible for the upsert
 * (so the same helper can power both per-date rebuilds and ad-hoc previews).
 *
 * P&L semantics (`out.revenue`, `out.cogsTotal`, every PNL_SUM_FIELDS member):
 * the values returned are the *single-day movement* between
 * `pnlPeriodStart` (inclusive, default = snapshotDate at 00:00:00 UTC) and
 * `snapshotDate` (inclusive, end of day). This matches the schema contract
 * for `DailyFinancialSnapshot` ("Income statement activity fields (daily
 * movement)") and matches the value `operational-sync.ts` writes from
 * `ProductSalesSnapshot.revenue` for that day.
 *
 * NOTE: Earlier versions of this helper wrote *YTD* P&L into these fields,
 * which produced wildly inflated daily numbers for any day that the GL-
 * rebuild path was the last writer (e.g. Atlantic Precision 2026-03-10:
 * $2.7M YTD revenue dumped into a "daily" slot). The YTD aggregation is
 * still computed below but only for retained-earnings math.
 *
 * For a multi-day P&L window (e.g. monthly rebuild), pass `pnlPeriodStart`
 * = first calendar day of the period and `snapshotDate` = last day.
 */
export async function computeDailyBalanceSheetFromGL(
  companyId: string,
  snapshotDate: Date,
  fiscalYearStart: Date,
  accountIdToTarget: Map<string, AccountTarget>,
  anchor: AnchorRecord | null = null,
  pnlPeriodStart: Date | null = null
): Promise<ComputedSnapshot> {
  const accountIds = Array.from(accountIdToTarget.keys());
  if (accountIds.length === 0) return emptySnapshot();

  const useAnchor = anchor !== null && anchor.anchorDate.getTime() <= snapshotDate.getTime();

  // BS source-of-truth aggregation:
  //   - anchored:   sum GL deltas in (anchorDate, snapshotDate]
  //   - unanchored: sum all GL through snapshotDate (running balance)
  const bsRawPromise = useAnchor
    ? sumGLByAccount(companyId, accountIds, null, snapshotDate, anchor!.anchorDate)
    : sumGLByAccount(companyId, accountIds, null, snapshotDate);

  // YTD P&L aggregation:
  //   - anchored & anchor inside current FY (rare): start from anchor exclusive
  //   - anchored & anchor at/before fyStart:        start from fyStart inclusive
  //                                                  (clean for FY-end anchors —
  //                                                   anchor 12/31 + fyStart 1/1
  //                                                   give the same window)
  //   - unanchored:                                 start from fyStart inclusive
  const ytdRawPromise =
    useAnchor && anchor!.anchorDate.getTime() > fiscalYearStart.getTime()
      ? sumGLByAccount(companyId, accountIds, null, snapshotDate, anchor!.anchorDate)
      : sumGLByAccount(companyId, accountIds, fiscalYearStart, snapshotDate);

  // Prior-period P&L aggregation (anchorDate, fiscalYearStart):
  //
  // Captures any net income earned between the anchor and the start of the
  // current fiscal year that wasn't formally closed to RE via a year-end
  // closing JE. Without this, an unclosed prior FY's P&L gets stranded:
  // the BS-window sum on RE accounts misses it (no GL posting to RE),
  // and the YTD-window sum starts at fiscalYearStart (excludes prior FY).
  //
  // When the prior FY *was* closed via JE, prior-FY revenue/expense
  // balances net to ~0 over this window (closing JE cancels them), so
  // priorPeriodNI ≈ 0 and the closing posting to RE is already in
  // bsByField['retainedEarnings'] — this addition is a no-op.
  // When the prior FY was *not* closed, priorPeriodNI is exactly the
  // missing earnings.
  //
  // Window upper bound = (fiscalYearStart - 1ms) — strictly before
  // fiscalYearStart so we don't double-count current-FY YTD activity.
  const needsPriorPeriodNI =
    useAnchor && anchor!.anchorDate.getTime() < fiscalYearStart.getTime();
  const priorPeriodRawPromise = needsPriorPeriodNI
    ? sumGLByAccount(
        companyId,
        accountIds,
        null,
        new Date(fiscalYearStart.getTime() - 1),
        anchor!.anchorDate
      )
    : Promise.resolve(new Map<string, number>());

  // Daily-delta P&L window (this is what the schema's "daily movement"
  // fields actually represent). Defaults to the calendar day containing
  // snapshotDate; multi-day callers can override via pnlPeriodStart.
  const dayStart = pnlPeriodStart
    ? new Date(
        Date.UTC(
          pnlPeriodStart.getUTCFullYear(),
          pnlPeriodStart.getUTCMonth(),
          pnlPeriodStart.getUTCDate(),
          0, 0, 0, 0
        )
      )
    : new Date(
        Date.UTC(
          snapshotDate.getUTCFullYear(),
          snapshotDate.getUTCMonth(),
          snapshotDate.getUTCDate(),
          0, 0, 0, 0
        )
      );
  const dayEnd = new Date(
    Date.UTC(
      snapshotDate.getUTCFullYear(),
      snapshotDate.getUTCMonth(),
      snapshotDate.getUTCDate(),
      23, 59, 59, 999
    )
  );
  const dailyPnlRawPromise = sumGLByAccount(
    companyId,
    accountIds,
    dayStart,
    dayEnd
  );

  const [bsRaw, ytdRaw, priorPeriodRaw, dailyPnlRaw] = await Promise.all([
    bsRawPromise,
    ytdRawPromise,
    priorPeriodRawPromise,
    dailyPnlRawPromise,
  ]);

  const bsByField = aggregateByTargetField(bsRaw, accountIdToTarget);
  const ytdByField = aggregateByTargetField(ytdRaw, accountIdToTarget);
  const priorPeriodByField = aggregateByTargetField(
    priorPeriodRaw,
    accountIdToTarget
  );
  const dailyPnlByField = aggregateByTargetField(
    dailyPnlRaw,
    accountIdToTarget
  );

  const get = (m: Map<string, number>, k: string) => m.get(k) || 0;

  // Anchor base value for a BS field (zero when unanchored or field not in anchor).
  const anchorVal = (field: string): number => {
    if (!useAnchor || !anchor) return 0;
    return (anchor as unknown as Record<string, number>)[field] || 0;
  };

  // ---- Balance sheet ----
  const cash = anchorVal('cash') + get(bsByField, 'cash');
  const ar = anchorVal('ar') + get(bsByField, 'ar');
  const inventory = anchorVal('inventory') + get(bsByField, 'inventory');
  const otherCA = anchorVal('otherCA') + get(bsByField, 'otherCA');
  const fixedAssets = anchorVal('fixedAssets') + get(bsByField, 'fixedAssets');
  const otherAssets = anchorVal('otherAssets') + get(bsByField, 'otherAssets');
  const tca = cash + ar + inventory + otherCA;
  const totalAssets = tca + fixedAssets + otherAssets;

  const ap = anchorVal('ap') + get(bsByField, 'ap');
  const loc = anchorVal('loc') + get(bsByField, 'loc');
  const otherCL = anchorVal('otherCL') + get(bsByField, 'otherCL');
  const ltd = anchorVal('ltd') + get(bsByField, 'ltd');
  const tcl = ap + loc + otherCL;
  const totalLiab = tcl + ltd;

  const ownersCapital = anchorVal('ownersCapital') + get(bsByField, 'ownersCapital');
  const ownersDraw = anchorVal('ownersDraw') + get(bsByField, 'ownersDraw');
  const commonStock = anchorVal('commonStock') + get(bsByField, 'commonStock');
  const preferredStock = anchorVal('preferredStock') + get(bsByField, 'preferredStock');
  const additionalPaidInCapital =
    anchorVal('additionalPaidInCapital') + get(bsByField, 'additionalPaidInCapital');
  const treasuryStock = anchorVal('treasuryStock') + get(bsByField, 'treasuryStock');
  // Prior-period NI (see comment above sumGLByAccount call): folds any
  // unclosed prior-FY earnings into RE so they don't get stranded when
  // the fiscal year rolls over without a closing JE.
  const priorPeriodRevenue = get(priorPeriodByField, 'revenue');
  const priorPeriodNonOpInc = get(priorPeriodByField, 'nonOperatingIncome');
  // Sum the rollup expense columns ONLY (cogsTotal, expense, plus the
  // below-the-line buckets). We must NOT sum subcategory columns
  // (cogs_*, payroll, benefits, ...) because the resolver routes each
  // contributing account into BOTH the rollup and its subcategory; adding
  // them again would double-count and inflate priorPeriodExpense, which
  // would understate priorPeriodNetIncome and (via bookedRE) understate
  // retainedEarnings on every snapshot.
  const sumExpenseRollups = (m: Map<string, number>): number =>
    get(m, 'cogsTotal') +
    get(m, 'expense') +
    get(m, 'nonOperatingExpense') +
    get(m, 'extraordinaryItems') +
    get(m, 'stateIncomeTaxes') +
    get(m, 'federalIncomeTaxes');
  const priorPeriodExpense = sumExpenseRollups(priorPeriodByField);
  const priorPeriodNetIncome =
    priorPeriodRevenue + priorPeriodNonOpInc - priorPeriodExpense;

  // Booked RE = anchor RE + GL postings to RE accounts in the BS window
  //           + any prior-FY NI that wasn't closed via GL.
  // For a clean FY-end anchor or a fully-closed prior year this last term
  // is ~0; for unclosed prior years it captures the carryover earnings.
  const bookedRE =
    anchorVal('retainedEarnings') +
    get(bsByField, 'retainedEarnings') +
    priorPeriodNetIncome;

  // YTD P&L (signed positive: revenue +, expense +). Same rollup-only
  // sum as priorPeriodExpense above — see comment there.
  const revenue = get(ytdByField, 'revenue');
  const nonOperatingIncome = get(ytdByField, 'nonOperatingIncome');
  const totalExpense = sumExpenseRollups(ytdByField);
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

  // ---- P&L bucket fields (DAILY DELTA) — every PNL_SUM_FIELDS field gets
  //      written so the snapshot row always has a complete shape. Note we
  //      use `dailyPnlByField` here, not `ytdByField`. The YTD aggregation
  //      is only used above for retained-earnings/netIncome math; writing
  //      it into these per-day columns would inflate every row to YTD-
  //      through-snapshotDate (the bug this fix corrects). ----
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
    (out as unknown as Record<string, number>)[f] = get(dailyPnlByField, f);
  }
  // revenue/nonOperatingIncome handled via the loop above using daily-delta
  // values; the YTD `revenue` / `nonOperatingIncome` locals near line 556
  // were only consumed by the retained-earnings math.

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
  /**
   * Controls whether the rebuild overwrites P&L fields on *existing*
   * `DailyFinancialSnapshot` rows. New rows always get the freshly-computed
   * daily-delta P&L (so the row is never structurally incomplete).
   *
   * - `'preserve'` (default): leave P&L on existing rows untouched. This is
   *   the safe production default — `operational-sync.ts` is the system-of-
   *   record for daily revenue/COGS (it writes from `ProductSalesSnapshot`
   *   which can carry signal not yet posted to GL), so the rebuild should
   *   not silently clobber its values.
   *
   * - `'overwrite'`: force-write daily-delta P&L over every row in the
   *   window. Used by the one-time corrective backfill that repairs rows
   *   poisoned by an earlier YTD-into-daily-slot bug. Should not be the
   *   default for routine rebuilds (e.g. mapping-save propagation).
   */
  pnlUpdateMode?: 'preserve' | 'overwrite';
};

// Fields the rebuild owns on update: balance-sheet snapshot lines plus the
// derived totals. P&L lives on `operational-sync.ts` and is governed by
// `pnlUpdateMode`. Source-platform metadata is also written so we can trace
// which writer last touched a row.
const REBUILD_BS_UPDATE_FIELDS: ReadonlyArray<keyof ComputedSnapshot> = [
  'cash',
  'ar',
  'inventory',
  'otherCA',
  'tca',
  'fixedAssets',
  'otherAssets',
  'totalAssets',
  'ap',
  'loc',
  'otherCL',
  'tcl',
  'ltd',
  'totalLiab',
  'ownersCapital',
  'ownersDraw',
  'commonStock',
  'preferredStock',
  'retainedEarnings',
  'additionalPaidInCapital',
  'treasuryStock',
  'totalEquity',
  'totalLAndE',
];

/**
 * Recompute DailyFinancialSnapshot rows from GLTransactionFact for every date
 * in [startDate, endDate] inclusive, at the given frequency. Idempotent:
 * existing snapshots for each (companyId, snapshotDate, frequency) are
 * upserted with current GL state.
 *
 * If the company has any `BalanceSheetAnchor` rows, the rebuild uses the
 * most-recent anchor with `anchorDate <= snapshotDate` as a starting point
 * (anchor + GL deltas). Dates strictly before the earliest anchor fall back
 * to the all-time-GL-sum behavior.
 */
export async function rebuildDailyFinancialSnapshotsFromGL(
  opts: RebuildDailyBSOptions
): Promise<{
  datesProcessed: number;
  rowsWritten: number;
  mappedAccountCount: number;
  unmappedTargetFields: string[];
  anchorsApplied: number;
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
  const pnlUpdateMode: 'preserve' | 'overwrite' = opts.pnlUpdateMode || 'preserve';
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
      accountName: true,
      accountId: true,
      accountCode: true,
      accountClassification: true,
      targetField: true,
    },
  });

  const accountIdToTarget = buildAccountIdToTarget(mappings);

  // Surface any AccountMapping.targetField values we don't know how to bucket.
  // Useful early signal that the COA contains a category we haven't accounted
  // for yet (e.g. a new equity line). These rows will silently be ignored if
  // we can't classify them, so the rebuild caller wants visibility.
  // We use the same resolver the aggregator uses so this list reflects what
  // is actually being dropped (not what's "unfamiliar by string match" — the
  // resolver routes slug names like `rev_finished_goods_sales` to `revenue`,
  // so they are NOT unmapped even though they don't appear in any of the
  // *_TARGET_FIELDS sets).
  const unmappedTargetFields = Array.from(
    new Set(
      mappings
        .map((m) => String(m.targetField || '').trim())
        .filter((f) => f && resolveDfsColumnsForTargetField(f).length === 0)
    )
  );

  // Pre-load all anchors for this company (typically a handful of rows) so
  // every iteration can pick the right one without an extra DB round-trip.
  const allAnchorRows = await prisma.balanceSheetAnchor.findMany({
    where: { companyId },
    orderBy: { anchorDate: 'desc' },
  });
  const allAnchors: AnchorRecord[] = allAnchorRows.map((row) => ({
    anchorDate: row.anchorDate,
    cash: row.cash,
    ar: row.ar,
    inventory: row.inventory,
    otherCA: row.otherCA,
    fixedAssets: row.fixedAssets,
    otherAssets: row.otherAssets,
    ap: row.ap,
    loc: row.loc,
    otherCL: row.otherCL,
    ltd: row.ltd,
    ownersCapital: row.ownersCapital,
    ownersDraw: row.ownersDraw,
    commonStock: row.commonStock,
    preferredStock: row.preferredStock,
    retainedEarnings: row.retainedEarnings,
    additionalPaidInCapital: row.additionalPaidInCapital,
    treasuryStock: row.treasuryStock,
  }));

  function anchorForDate(d: Date): AnchorRecord | null {
    for (const a of allAnchors) {
      // allAnchors is desc by anchorDate, so first hit is the latest applicable.
      if (a.anchorDate.getTime() <= d.getTime()) return a;
    }
    return null;
  }

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
  let anchorsApplied = 0;
  const cursor = new Date(startUtc.getTime());
  while (cursor.getTime() <= endUtc.getTime()) {
    const fiscalYearStart = computeFiscalYearStart(cursor, fyMonth, fyDay);
    const anchor = anchorForDate(cursor);
    if (anchor) anchorsApplied++;

    const snapshot = await computeDailyBalanceSheetFromGL(
      companyId,
      cursor,
      fiscalYearStart,
      accountIdToTarget,
      anchor
    );

    // Always upsert — even when accountIdToTarget is empty we still write a
    // zeroed row to keep the daily series gapless. Note the `update` payload
    // is intentionally narrower than `create`: existing P&L is preserved
    // unless `pnlUpdateMode === 'overwrite'` (see option doc).
    const updatePayload: Record<string, unknown> = {
      sourcePlatform: 'INFOR_M3_GL_REBUILD',
    };
    for (const f of REBUILD_BS_UPDATE_FIELDS) {
      updatePayload[f as string] = (snapshot as unknown as Record<string, number>)[f as string];
    }
    if (pnlUpdateMode === 'overwrite') {
      for (const f of PNL_SUM_FIELDS) {
        updatePayload[f] = (snapshot as unknown as Record<string, number>)[f];
      }
    }

    await prisma.dailyFinancialSnapshot.upsert({
      where: {
        companyId_snapshotDate_frequency: {
          companyId,
          snapshotDate: cursor,
          frequency,
        },
      },
      update: updatePayload,
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
    anchorsApplied,
  };
}

// Re-export for callers that want to load an anchor directly (e.g. preview).
export { findAnchorForDate };
