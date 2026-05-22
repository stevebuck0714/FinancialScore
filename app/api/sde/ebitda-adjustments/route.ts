import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { withPrismaReconnectRetry } from '@/lib/prisma-retry';
import {
  SDE_BUCKETS,
  SDE_BUCKET_LABELS,
  SDE_LINE_ITEMS,
  isValidLineItem,
  type SdeBucket,
} from '@/lib/sde/adjustment-line-items';

export const dynamic = 'force-dynamic';

const VALID_BUCKETS = SDE_BUCKETS;
const BUCKET_LABELS = SDE_BUCKET_LABELS;

// "Raw-data" accounting systems: trial-balance / per-period totals are stored
// in FinancialRecord.rawData (one row per account, columns per month-end).
// These systems do NOT write per-account rows into GLTransactionFact, so the
// raw-data path is the only source of truth for per-account values.
//   - QuickBooks (online + desktop), Xero, Sage all share the trial-balance
//     export shape that drove the original "Group B" handling.
//   - CSV_FILE is the same shape — users upload a trial balance CSV.
// Big-ERP systems (Infor M3, Infor CSI, Sage Intacct, Vista Cloud, NetSuite,
// Acumatica, Odoo, Dynamics 365, Dynamics) all populate GLTransactionFact and
// BalanceSheetAccountAnchor; they take the GL + anchor path below.
const RAW_DATA_ACCOUNTING_SYSTEMS = new Set([
  'QUICKBOOKS',
  'QUICKBOOKS_DESKTOP',
  'XERO',
  'SAGE',
  'CSV_FILE',
]);

type AccountMappingRow = {
  id: string;
  accountId: string | null;
  accountCode: string | null;
  accountName: string;
  accountClassification: string | null;
  targetField: string;
  ownerPercent: number | null;
  sdeAdjustmentBucket: string | null;
  sdeAdjustmentLineItem: string | null;
};

type AccountDetail = {
  mappingId: string;
  accountId: string | null;
  accountCode: string | null;
  accountName: string;
  targetField: string;
  ltm: number;
  monthly: Array<{ month: string; value: number }>;
  ownerPercent: number;
  ownerAmount: number;
  lineItem: string | null;
};

type LineItemDetail = {
  key: string;
  label: string;
  accounts: AccountDetail[];
  ltmTotal: number;
  ownerAmountTotal: number;
};

type BucketDetail = {
  bucket: SdeBucket;
  label: string;
  accounts: AccountDetail[];
  ltmTotal: number;
  ownerAmountTotal: number;
  lineItems: LineItemDetail[];
};

type AccountCategory = 'Revenue' | 'Expense' | 'Asset' | 'Liability' | 'Equity' | 'Other';

type AccountListEntry = {
  mappingId: string;
  accountId: string | null;
  accountCode: string | null;
  accountName: string;
  targetField: string;
  category: AccountCategory;
  ltm: number;
  sdeAdjustmentBucket: SdeBucket | null;
  sdeAdjustmentLineItem: string | null;
};

// Lookup tables for classifying mapped accounts into the 5 user-facing
// categories. We try `accountClassification` first (set by source seeders),
// then fall back to `targetField` (the user mapping) so every mapped row gets
// a category even if the source never populated a classification.
const CLASSIFICATION_TO_CATEGORY: Record<string, AccountCategory> = {
  income: 'Revenue',
  revenue: 'Revenue',
  i: 'Revenue',
  r: 'Revenue',
  'cost of goods sold': 'Expense',
  cogs: 'Expense',
  expense: 'Expense',
  expenses: 'Expense',
  e: 'Expense',
  x: 'Expense',
  asset: 'Asset',
  a: 'Asset',
  liability: 'Liability',
  liabilities: 'Liability',
  l: 'Liability',
  equity: 'Equity',
  q: 'Equity',
};

const TARGET_FIELD_TO_CATEGORY: Record<string, AccountCategory> = {
  revenue: 'Revenue',
  cash: 'Asset',
  ar: 'Asset',
  inventory: 'Asset',
  otherca: 'Asset',
  tca: 'Asset',
  fixedassets: 'Asset',
  otherassets: 'Asset',
  totalassets: 'Asset',
  ap: 'Liability',
  othercl: 'Liability',
  tcl: 'Liability',
  ltd: 'Liability',
  totalliab: 'Liability',
  totalequity: 'Equity',
  totallande: 'Equity',
  retainedearnings: 'Equity',
  paidincapital: 'Equity',
  capitalcontributions: 'Equity',
  equity: 'Equity',
  unmapped: 'Other',
};

function classifyAccount(mapping: Pick<AccountMappingRow, 'accountClassification' | 'targetField'>): AccountCategory {
  const cls = String(mapping.accountClassification || '').trim().toLowerCase();
  if (cls && CLASSIFICATION_TO_CATEGORY[cls]) return CLASSIFICATION_TO_CATEGORY[cls];
  const tf = String(mapping.targetField || '').trim().toLowerCase();
  if (tf && TARGET_FIELD_TO_CATEGORY[tf]) return TARGET_FIELD_TO_CATEGORY[tf];
  // Fallback: anything starting with cogs* is an Expense; anything that didn't
  // match above and is mapped to a non-empty target field is treated as
  // Expense (the largest mapped category by far). Truly empty stays Other.
  if (tf.startsWith('cogs')) return 'Expense';
  if (tf && tf !== 'unmapped' && tf !== 'ignored') return 'Expense';
  return 'Other';
}

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildLtmWindow(asOfMonth: string): { start: Date; end: Date; months: string[] } {
  const m = asOfMonth.match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    const now = new Date();
    return buildLtmWindow(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const start = new Date(Date.UTC(year, month - 12, 1, 0, 0, 0, 0));
  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(year, month - 12 + i, 1));
    months.push(toMonthKey(d));
  }
  return { start, end, months };
}

async function resolveAsOfMonth(companyId: string, requested: string | null): Promise<string> {
  if (requested && /^\d{4}-\d{2}$/.test(requested)) return requested;
  const rows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{ ym: string }>>`
      SELECT to_char(date_trunc('month', mf."monthDate"), 'YYYY-MM') AS ym
      FROM "MonthlyFinancial" mf
      WHERE mf."companyId" = ${companyId}
      ORDER BY mf."monthDate" DESC
      LIMIT 1
    `,
    'sde-ebitda-adjustments.resolveAsOfMonth',
  );
  if (rows[0]?.ym) return rows[0].ym;
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Returns a Map of `accountId` (or `accountCode`) -> Map<monthKey, signedAmount>
// For ERP-shaped companies, return the as-of-month closing balance for every
// anchored balance-sheet account. The pattern mirrors the daily balance
// sheet logic and the account-review "latest values" route:
//   value = openingBalance + SUM(GLTransactionFact.signedAmount)
//           where transDate > anchorDate AND transDate <= monthEnd
// Every value is registered under the case-preserved accountId, the
// accountCode (when present), and a normalized lowercased name so a
// mapping can find it via any of those keys.
async function loadAnchoredBsBalances(
  companyId: string,
  monthEnd: Date,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!monthEnd) return result;

  const anchorDateRows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{ anchorDate: Date }>>`
      SELECT "anchorDate"
      FROM "BalanceSheetAccountAnchor"
      WHERE "companyId" = ${companyId}
        AND "anchorDate" <= ${monthEnd}
      ORDER BY "anchorDate" DESC
      LIMIT 1
    `,
    'sde-ebitda-adjustments.loadAnchoredBsBalances.anchorDate',
  );
  const anchorDate = anchorDateRows[0]?.anchorDate ?? null;
  if (!anchorDate) return result;

  const rows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{
      accountId: string;
      accountName: string | null;
      accountCode: string | null;
      openingBalance: number;
      delta: number | null;
    }>>`
      WITH anchors AS (
        SELECT
          TRIM("accountId") AS "accountId",
          NULLIF(TRIM(COALESCE("accountName", '')), '') AS "accountName",
          NULLIF(TRIM(COALESCE("accountCode", '')), '') AS "accountCode",
          "openingBalance"::double precision AS "openingBalance"
        FROM "BalanceSheetAccountAnchor"
        WHERE "companyId" = ${companyId}
          AND "anchorDate" = ${anchorDate}
      ),
      deltas AS (
        SELECT
          TRIM(g."accountId") AS "accountId",
          SUM(g."signedAmount")::double precision AS "delta"
        FROM "GLTransactionFact" g
        WHERE g."companyId" = ${companyId}
          AND g."transDate" > ${anchorDate}
          AND g."transDate" <= ${monthEnd}
          AND TRIM(g."accountId") IN (SELECT "accountId" FROM anchors)
        GROUP BY 1
      )
      SELECT
        a."accountId",
        a."accountName",
        a."accountCode",
        a."openingBalance",
        d."delta"
      FROM anchors a
      LEFT JOIN deltas d ON d."accountId" = a."accountId"
    `,
    'sde-ebitda-adjustments.loadAnchoredBsBalances.compute',
  );

  for (const row of rows || []) {
    const acct = String(row.accountId || '').trim();
    if (!acct) continue;
    const opening = normalizeNumber(row.openingBalance);
    const delta = normalizeNumber(row.delta);
    const value = opening + delta;
    result.set(acct, value);
    const code = String(row.accountCode || '').trim();
    if (code && !result.has(code)) result.set(code, value);
    for (const k of nameLookupKeys(String(row.accountName || ''))) {
      if (!result.has(k)) result.set(k, value);
    }
  }
  return result;
}

async function loadGlMonthlyByAccount(
  companyId: string,
  start: Date,
  end: Date,
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  const rows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{ accountId: string; ym: string; total: number }>>`
      SELECT
        gtf."accountId" AS "accountId",
        to_char(date_trunc('month', gtf."transDate"), 'YYYY-MM') AS ym,
        SUM(gtf."signedAmount")::float8 AS total
      FROM "GLTransactionFact" gtf
      WHERE gtf."companyId" = ${companyId}
        AND gtf."transDate" >= ${start}
        AND gtf."transDate" <= ${end}
      GROUP BY gtf."accountId", date_trunc('month', gtf."transDate")
    `,
    'sde-ebitda-adjustments.loadGlMonthlyByAccount',
  );
  for (const row of rows) {
    const acct = String(row.accountId || '').trim();
    if (!acct) continue;
    if (!result.has(acct)) result.set(acct, new Map());
    result.get(acct)!.set(row.ym, normalizeNumber(row.total));
  }
  return result;
}

// Normalize a name/description for fuzzy matching across CSV / QuickBooks /
// Xero / Sage trial-balance exports. Lowercases, collapses whitespace,
// removes leading "N-" / "NN-" account-class prefixes (e.g. "1-1005 Foo" ->
// "1005 foo"), and produces a description-only variant ("Foo") for cases
// where the chart-of-accounts numbering differs between the saved mappings
// and the current rawData but the description text is identical.
// Returns multiple candidate keys; the caller probes each in order.
function nameLookupKeys(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: string) => {
    const norm = v.trim().toLowerCase().replace(/\s+/g, ' ');
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  };
  const trimmed = String(raw || '').trim();
  if (!trimmed) return out;
  push(trimmed);
  // Strip leading "N-" or "NN-" prefix (account class indicator)
  const classStripped = trimmed.replace(/^\d+-/, '').trim();
  if (classStripped !== trimmed) push(classStripped);
  // Pull out the numeric account code on its own
  const numMatch = trimmed.match(/^\d+-(\d+)/) || trimmed.match(/^(\d+)/);
  if (numMatch) push(numMatch[1]);
  // Description-only: drop ANY leading "N-NNNN" / "NNNN" / "N-" tokens
  // (separated by whitespace) so "1-1100 Accounts Receivable" and
  // "11000 Accounts Receivable" both reduce to "accounts receivable".
  // This is the last-resort fallback — only used when nothing more
  // specific matches.
  const descOnly = trimmed.replace(/^(?:\d+(?:-\d+)?\s+)+/, '').trim();
  if (descOnly && descOnly !== trimmed && descOnly !== classStripped) push(descOnly);
  return out;
}

// Fallback: parse FinancialRecord.rawData (CSV trial balance shape) for
// QuickBooks/CSV/Xero/Sage companies with no GLTransactionFact data.
// rawData shape: { accounts: [{ acctId, acctType, description, values: { 'YYYY-MM-DD' | 'M/D/YY': number, ... } }, ...] }
//
// For matching, every per-account monthly map is registered under MULTIPLE
// keys: the explicit acctId/accountId (when present) AND a normalized form
// of the description text (full, prefix-stripped, and numeric-only). This
// is required for QuickBooks-shaped exports where acctId is empty and the
// only thing tying a mapping to a row is the human-readable name.
async function loadCsvMonthlyByAccount(
  companyId: string,
  ltmMonths: string[],
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  const record = await withPrismaReconnectRetry(
    () =>
      prisma.financialRecord.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        select: { rawData: true },
      }),
    'sde-ebitda-adjustments.loadCsvMonthlyByAccount',
  );
  const raw = record?.rawData as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  const accounts = (raw as Record<string, unknown>).accounts;
  if (!Array.isArray(accounts)) return result;

  const monthSet = new Set(ltmMonths);

  for (const acct of accounts) {
    if (!acct || typeof acct !== 'object') continue;
    const a = acct as Record<string, unknown>;
    const acctId = String(a.acctId || a.accountId || '').trim();
    const description = String(a.description || a.name || '').trim();
    const values = a.values && typeof a.values === 'object' && !Array.isArray(a.values)
      ? (a.values as Record<string, unknown>)
      : null;
    if (!values) continue;
    const monthMap = new Map<string, number>();
    for (const [dateKey, amountRaw] of Object.entries(values)) {
      const monthKey = (() => {
        const trimmed = String(dateKey).trim();
        const iso = trimmed.match(/^(\d{4})-(\d{2})/);
        if (iso) return `${iso[1]}-${iso[2]}`;
        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) {
          return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
        }
        return null;
      })();
      if (!monthKey || !monthSet.has(monthKey)) continue;
      const amount = normalizeNumber(amountRaw);
      monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + amount);
    }
    if (monthMap.size === 0) continue;
    // Register under all candidate lookup keys so the mapping side can hit
    // by accountId, accountCode, accountName (full), accountName (prefix-
    // stripped), or numeric-only code — whichever it has.
    const keys = new Set<string>();
    if (acctId) keys.add(acctId);
    for (const k of nameLookupKeys(description)) keys.add(k);
    for (const k of keys) {
      // First-write-wins: don't clobber an existing more-specific match.
      if (!result.has(k)) result.set(k, monthMap);
    }
  }

  return result;
}

function pickAccountLookupKeys(mapping: AccountMappingRow): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const push = (v: string) => {
    if (v && !seen.has(v)) {
      seen.add(v);
      keys.push(v);
    }
  };
  const id = String(mapping.accountId || '').trim();
  const code = String(mapping.accountCode || '').trim();
  // Case-preserved primary keys (match GL fact rows for ERP companies).
  if (id) push(id);
  if (code) push(code);
  // Normalized name variants (lowercased / prefix-stripped) — used by the
  // CSV/QuickBooks fallback where acctId is empty and the only common key
  // between the mapping and the rawData rows is the account name.
  for (const k of nameLookupKeys(mapping.accountName)) push(k);
  return keys;
}

function clampOwnerPct(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const sp = request.nextUrl.searchParams;
    const companyId = String(sp.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('SdeEbitdaAdjustments', companyId, 'READ');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const requestedAsOf = String(sp.get('asOfMonth') || '').trim() || null;
    const asOfMonth = await resolveAsOfMonth(companyId, requestedAsOf);
    const { start, end, months: ltmMonths } = buildLtmWindow(asOfMonth);

    const company = await withPrismaReconnectRetry(
      () => prisma.company.findUnique({
        where: { id: companyId },
        select: { accountingSystem: true, name: true },
      }),
      'sde-ebitda-adjustments.company',
    );
    const accountingSystem = String(company?.accountingSystem || '').trim().toUpperCase();
    const isRawDataSystem = RAW_DATA_ACCOUNTING_SYSTEMS.has(accountingSystem);

    // Load ALL mappings for this company (we need the full set for the
    // right-rail account list AND a subset for the bucket cards). We use
    // raw SQL because the Prisma client cache may not yet have the
    // `sdeAdjustmentBucket` / `sdeAdjustmentLineItem` columns on every
    // generation.
    const allMappings = await withPrismaReconnectRetry(
      () => prisma.$queryRaw<AccountMappingRow[]>`
        SELECT
          id,
          "accountId",
          "accountCode",
          "accountName",
          "accountClassification",
          "targetField",
          "ownerPercent",
          "sdeAdjustmentBucket",
          "sdeAdjustmentLineItem"
        FROM "AccountMapping"
        WHERE "companyId" = ${companyId}
        ORDER BY "accountCode" ASC, "accountName" ASC
      `,
      'sde-ebitda-adjustments.allMappings',
    );

    // Just the bucketed subset for the four adjustment cards.
    const mappings = allMappings.filter(
      (m) => (VALID_BUCKETS as readonly string[]).includes(m.sdeAdjustmentBucket ?? ''),
    );

    // Load per-account monthly history. ERP-shaped systems use
    // GLTransactionFact (signed amounts grouped by month). Raw-data systems
    // (QuickBooks / Xero / Sage / CSV_FILE) parse FinancialRecord.rawData.
    // Defensive fallback: if the GL probe is empty (e.g. an Infor company
    // that has only ingested rawData so far), still try the CSV path.
    let monthlyByAccount = new Map<string, Map<string, number>>();
    if (!isRawDataSystem) {
      monthlyByAccount = await loadGlMonthlyByAccount(companyId, start, end);
    }
    if (monthlyByAccount.size === 0) {
      monthlyByAccount = await loadCsvMonthlyByAccount(companyId, ltmMonths);
    }

    // For ERP-shaped companies, separately resolve true cumulative
    // balance-sheet balances at the as-of month-end using
    // BalanceSheetAccountAnchor + GL deltas (not single-month period
    // activity). Raw-data systems don't need this — their per-month value
    // already IS the closing balance for trial-balance accounts.
    const bsBalancesByAccount = isRawDataSystem
      ? new Map<string, number>()
      : await loadAnchoredBsBalances(companyId, end);

    // Build per-bucket detail with line-item rollups.
    const bucketMap = new Map<SdeBucket, BucketDetail>();
    for (const b of VALID_BUCKETS) {
      const lineItems: LineItemDetail[] = SDE_LINE_ITEMS[b].map((li) => ({
        key: li.key,
        label: li.label,
        accounts: [],
        ltmTotal: 0,
        ownerAmountTotal: 0,
      }));
      bucketMap.set(b, {
        bucket: b,
        label: BUCKET_LABELS[b],
        accounts: [],
        ltmTotal: 0,
        ownerAmountTotal: 0,
        lineItems,
      });
    }

    for (const mapping of mappings) {
      const bucket = mapping.sdeAdjustmentBucket as SdeBucket;
      if (!(VALID_BUCKETS as readonly string[]).includes(bucket)) continue;
      const lookupKeys = pickAccountLookupKeys(mapping);
      let monthMap: Map<string, number> | null = null;
      for (const key of lookupKeys) {
        const found = monthlyByAccount.get(key);
        if (found) {
          monthMap = found;
          break;
        }
      }

      const monthly = ltmMonths.map((m) => {
        const raw = monthMap?.get(m);
        // For income statement accounts, "value" in GL is signed (debit positive).
        // Expense accounts naturally come through as positive sums; revenue accounts
        // come through as negative. Keep them signed; UI presentation handles sign.
        return { month: m, value: normalizeNumber(raw ?? 0) };
      });
      const ltm = monthly.reduce((sum, r) => sum + r.value, 0);
      // Use absolute value as the adjustment magnitude — owner-comp / personal /
      // non-recurring buckets are all expenses (positive sums) and one-time
      // revenue rows are typically negative (credits). Surface the magnitude
      // for the user; sign is preserved on the raw `monthly[].value`.
      const ltmMagnitude = Math.abs(ltm);
      const ownerPct = clampOwnerPct(mapping.ownerPercent);
      const ownerAmount = (ltmMagnitude * ownerPct) / 100;
      const lineItemKey = isValidLineItem(bucket, mapping.sdeAdjustmentLineItem)
        ? mapping.sdeAdjustmentLineItem
        : null;

      const detail: AccountDetail = {
        mappingId: mapping.id,
        accountId: mapping.accountId,
        accountCode: mapping.accountCode,
        accountName: mapping.accountName,
        targetField: mapping.targetField,
        ltm: ltmMagnitude,
        monthly: monthly.map((r) => ({ month: r.month, value: Math.abs(r.value) })),
        ownerPercent: ownerPct,
        ownerAmount,
        lineItem: lineItemKey,
      };

      const detailBucket = bucketMap.get(bucket)!;
      detailBucket.accounts.push(detail);
      detailBucket.ltmTotal += ltmMagnitude;
      detailBucket.ownerAmountTotal += ownerAmount;

      if (lineItemKey) {
        const li = detailBucket.lineItems.find((x) => x.key === lineItemKey);
        if (li) {
          li.accounts.push(detail);
          li.ltmTotal += ltmMagnitude;
          li.ownerAmountTotal += ownerAmount;
        }
      }
    }

    const buckets = Array.from(bucketMap.values());

    // Build the right-rail account list. For every mapped account, compute
    // the LTM amount the same way as bucket cards:
    //   - P&L items (Revenue / Expense): sum of last 12 months (signed).
    //   - BS items (Asset / Liability / Equity):
    //       * ERP path: cumulative balance at as-of month-end via
    //         BalanceSheetAccountAnchor + GL deltas (`bsBalancesByAccount`).
    //         Falls back to single-month GL activity if the account isn't
    //         anchored yet.
    //       * Raw-data path: the as-of month-end value in rawData IS the
    //         closing balance (trial-balance shape).
    // We always surface the magnitude, never the sign.
    const asOfMonthKey = ltmMonths[ltmMonths.length - 1];
    const allAccounts: AccountListEntry[] = allMappings.map((mapping) => {
      const category = classifyAccount(mapping);
      const lookupKeys = pickAccountLookupKeys(mapping);
      let monthMap: Map<string, number> | null = null;
      for (const key of lookupKeys) {
        const found = monthlyByAccount.get(key);
        if (found) {
          monthMap = found;
          break;
        }
      }
      const isBs = category === 'Asset' || category === 'Liability' || category === 'Equity';
      let ltmRaw = 0;
      if (isBs && !isRawDataSystem) {
        // ERP path: prefer the anchored cumulative balance.
        let bsValue: number | null = null;
        for (const key of lookupKeys) {
          if (bsBalancesByAccount.has(key)) {
            bsValue = bsBalancesByAccount.get(key) ?? 0;
            break;
          }
        }
        if (bsValue !== null) {
          ltmRaw = bsValue;
        } else if (monthMap) {
          // No anchor for this account yet — fall back to as-of-month
          // period activity so the user still sees something non-zero.
          ltmRaw = normalizeNumber(monthMap.get(asOfMonthKey) ?? 0);
        }
      } else if (monthMap) {
        if (isBs) {
          // Raw-data path: the per-month value IS the closing balance.
          ltmRaw = normalizeNumber(monthMap.get(asOfMonthKey) ?? 0);
        } else {
          for (const m of ltmMonths) ltmRaw += normalizeNumber(monthMap.get(m) ?? 0);
        }
      }
      const bucket = (VALID_BUCKETS as readonly string[]).includes(mapping.sdeAdjustmentBucket ?? '')
        ? (mapping.sdeAdjustmentBucket as SdeBucket)
        : null;
      const lineItem =
        bucket && isValidLineItem(bucket, mapping.sdeAdjustmentLineItem)
          ? mapping.sdeAdjustmentLineItem
          : null;
      return {
        mappingId: mapping.id,
        accountId: mapping.accountId,
        accountCode: mapping.accountCode,
        accountName: mapping.accountName,
        targetField: mapping.targetField,
        category,
        ltm: Math.abs(ltmRaw),
        sdeAdjustmentBucket: bucket,
        sdeAdjustmentLineItem: lineItem,
      };
    });

    return NextResponse.json({
      companyId,
      companyName: company?.name || null,
      accountingSystem,
      asOfMonth,
      ltmWindow: { start: ltmMonths[0], end: ltmMonths[ltmMonths.length - 1], months: ltmMonths },
      sourceUsed: isRawDataSystem
        ? 'rawdata_trial_balance'
        : monthlyByAccount.size > 0
          ? 'gl_transaction_fact'
          : 'rawdata_fallback',
      bsSource: isRawDataSystem
        ? 'rawdata_period_close'
        : bsBalancesByAccount.size > 0
          ? 'balance_sheet_account_anchor'
          : 'gl_period_activity_fallback',
      buckets,
      allAccounts,
    });
  } catch (error: any) {
    console.error('SDE EBITDA adjustments GET failed:', error);
    return NextResponse.json(
      { error: 'Failed to load EBITDA adjustments', detail: String(error?.message || error) },
      { status: 500 },
    );
  }
}
