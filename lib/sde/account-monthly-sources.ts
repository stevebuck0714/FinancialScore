import prisma from '@/lib/prisma';
import { withPrismaReconnectRetry } from '@/lib/prisma-retry';

export type MonthlyByAccount = Map<string, Map<string, number>>;

function lookupKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function registerMonthMap(result: MonthlyByAccount, keys: Iterable<string>, monthMap: Map<string, number>): void {
  for (const key of keys) {
    if (key && !result.has(key)) result.set(key, monthMap);
  }
}

// QuickBooks Desktop: per-account P&L movement from the General Ledger Detail
// report pages. Overlapping pulls repeat days, so each txn date uses the most
// recent batch that contains it (same rule as the QBD monthly rebuild).
// Keyed by the lowercased full account name, which matches AccountMapping.accountName.
export async function loadQbdGlMonthlyByAccount(companyId: string, ltmMonths: string[]): Promise<MonthlyByAccount> {
  const result: MonthlyByAccount = new Map();
  if (ltmMonths.length === 0) return result;
  const startDate = `${ltmMonths[0]}-01`;
  const endDate = `${ltmMonths[ltmMonths.length - 1]}-31`;

  const rows = await withPrismaReconnectRetry(
    () => prisma.$queryRaw<Array<{ account: string; ym: string; total: number }>>`
      WITH gl_rows AS (
        SELECT
          COALESCE(NULLIF(TRIM(x->>'accountName'), ''), NULLIF(TRIM(x->>'rowValue'), '')) AS account,
          p."batchId" AS "batchId",
          p."createdAt" AS "createdAt",
          (
            SELECT c->>'value'
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(x->'colData') = 'array' THEN x->'colData' ELSE '[]'::jsonb END
            ) c
            WHERE (c->>'colID' = '3' OR lower(regexp_replace(COALESCE(c->>'colTitle', ''), '[^a-zA-Z]', '', 'g')) IN ('txndate', 'date'))
              AND c->>'value' ~ '^\\d{4}-\\d{2}-\\d{2}'
            LIMIT 1
          ) AS "txnDate",
          (
            SELECT replace(c->>'value', ',', '')
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(x->'colData') = 'array' THEN x->'colData' ELSE '[]'::jsonb END
            ) c
            WHERE c->>'colID' = '8' OR lower(regexp_replace(COALESCE(c->>'colTitle', ''), '[^a-zA-Z]', '', 'g')) = 'amount'
            LIMIT 1
          ) AS amount
        FROM "QuickBooksDesktopBackfillPage" p
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(p."payload") = 'array' THEN p."payload" ELSE '[]'::jsonb END
        ) x
        WHERE p."companyId" = ${companyId}
          AND p."requestName" = 'GeneralDetailReportQuery'
          AND x->>'rowKind' = 'DataRow'
      ),
      dated AS (
        SELECT *
        FROM gl_rows
        WHERE account IS NOT NULL
          AND "txnDate" >= ${startDate}
          AND "txnDate" <= ${endDate}
      ),
      latest_batch_by_date AS (
        SELECT DISTINCT ON ("txnDate") "txnDate", "batchId"
        FROM (
          SELECT "txnDate", "batchId", MAX("createdAt") AS "lastSeen"
          FROM dated
          GROUP BY "txnDate", "batchId"
        ) batch_dates
        ORDER BY "txnDate", "lastSeen" DESC
      )
      SELECT
        d.account,
        left(d."txnDate", 7) AS ym,
        SUM(CASE WHEN d.amount ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN d.amount::numeric ELSE 0 END)::float8 AS total
      FROM dated d
      JOIN latest_batch_by_date l
        ON l."txnDate" = d."txnDate"
       AND l."batchId" IS NOT DISTINCT FROM d."batchId"
      GROUP BY d.account, left(d."txnDate", 7)
    `,
    'sde-account-monthly-sources.loadQbdGlMonthlyByAccount',
  );

  const byAccount = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const key = lookupKey(row.account);
    if (!key) continue;
    if (!byAccount.has(key)) byAccount.set(key, new Map());
    const monthMap = byAccount.get(key)!;
    monthMap.set(row.ym, (monthMap.get(row.ym) || 0) + (Number(row.total) || 0));
  }
  for (const [key, monthMap] of byAccount) registerMonthMap(result, [key], monthMap);
  return result;
}

type QboReport = {
  Columns?: { Column?: Array<{ ColTitle?: string; MetaData?: Array<{ Name?: string; Value?: string }> }> };
  Rows?: { Row?: unknown };
};

function qboColumnMonths(report: QboReport): Map<number, string> {
  const columns = Array.isArray(report.Columns?.Column) ? report.Columns!.Column! : [];
  const byMonth = new Map<string, { index: number; fullMonth: boolean }>();
  columns.forEach((column, index) => {
    const meta = new Map((column.MetaData || []).map((m) => [String(m.Name || ''), String(m.Value || '')]));
    const start = meta.get('StartDate') || '';
    const end = meta.get('EndDate') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return;
    const month = end.slice(0, 7);
    if (start.slice(0, 7) !== month) return;
    const fullMonth = start.endsWith('-01');
    const current = byMonth.get(month);
    if (!current || (fullMonth && !current.fullMonth)) byMonth.set(month, { index, fullMonth });
  });
  const result = new Map<number, string>();
  for (const [month, { index }] of byMonth) result.set(index, month);
  return result;
}

function parseQboAmount(value: unknown): number {
  const raw = String(value ?? '').replace(/,/g, '').replace(/\(([^)]+)\)/, '-$1').trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function collectQboReport(
  report: unknown,
  monthSet: Set<string>,
  nameKeys: (name: string) => string[],
  result: MonthlyByAccount,
): void {
  if (!report || typeof report !== 'object' || Array.isArray(report)) return;
  const typed = report as QboReport;
  const columnMonths = qboColumnMonths(typed);
  const visit = (rows: unknown) => {
    const items = Array.isArray(rows) ? rows : rows ? [rows] : [];
    for (const item of items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const row = item as { type?: string; ColData?: Array<{ id?: string; value?: string }>; Rows?: { Row?: unknown } };
      if (row.Rows?.Row) visit(row.Rows.Row);
      if (row.type === 'Section' || !Array.isArray(row.ColData)) continue;
      const first = row.ColData[0] || {};
      const name = String(first.value || '').trim();
      if (!name || /^total\b/i.test(name)) continue;
      const monthMap = new Map<string, number>();
      for (const [index, month] of columnMonths) {
        if (!monthSet.has(month)) continue;
        monthMap.set(month, parseQboAmount(row.ColData[index]?.value));
      }
      if (monthMap.size === 0) continue;
      const keys = [String(first.id || '').trim(), ...nameKeys(name)];
      registerMonthMap(result, keys, monthMap);
    }
  };
  visit(typed.Rows?.Row);
}

// QuickBooks Online: the latest FinancialRecord stores the monthly-column
// Profit & Loss and Balance Sheet reports. P&L columns are period activity;
// Balance Sheet columns are month-end balances.
export function loadQboReportMonthlyByAccount(
  rawData: unknown,
  ltmMonths: string[],
  nameKeys: (name: string) => string[],
  reports: Array<'profitAndLoss' | 'balanceSheet'> = ['profitAndLoss', 'balanceSheet'],
): MonthlyByAccount {
  const result: MonthlyByAccount = new Map();
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return result;
  const raw = rawData as Record<string, unknown>;
  const monthSet = new Set(ltmMonths);
  for (const report of reports) collectQboReport(raw[report], monthSet, nameKeys, result);
  return result;
}

const MONTH_ABBREVIATIONS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

// Normalize a name/description for fuzzy matching across CSV / QuickBooks /
// Xero / Sage trial-balance exports. Lowercases, collapses whitespace,
// removes leading "N-" / "NN-" account-class prefixes (e.g. "1-1005 Foo" ->
// "1005 foo"), and produces a description-only variant ("Foo") for cases
// where the chart-of-accounts numbering differs between the saved mappings
// and the current rawData but the description text is identical.
// Returns multiple candidate keys; the caller probes each in order.
export function nameLookupKeys(raw: string): string[] {
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

// For ERP-shaped companies, return the as-of-month closing balance for every
// anchored balance-sheet account. The pattern mirrors the daily balance
// sheet logic and the account-review "latest values" route:
//   value = openingBalance + SUM(GLTransactionFact.signedAmount)
//           where transDate > anchorDate AND transDate <= monthEnd
// Every value is registered under the case-preserved accountId, the
// accountCode (when present), and a normalized lowercased name so a
// mapping can find it via any of those keys.
export async function loadAnchoredBsBalances(
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
    'account-monthly-sources.loadAnchoredBsBalances.anchorDate',
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
    'account-monthly-sources.loadAnchoredBsBalances.compute',
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

// Fallback: parse FinancialRecord.rawData (CSV trial balance shape) for
// QuickBooks/CSV/Xero/Sage companies with no GLTransactionFact data.
// rawData shape: { accounts: [{ acctId, acctType, description, values: { 'YYYY-MM-DD' | 'M/D/YY': number, ... } }, ...] }
//
// For matching, every per-account monthly map is registered under MULTIPLE
// keys: the explicit acctId/accountId (when present) AND a normalized form
// of the description text (full, prefix-stripped, and numeric-only). This
// is required for QuickBooks-shaped exports where acctId is empty and the
// only thing tying a mapping to a row is the human-readable name.
export async function loadCsvMonthlyByAccount(
  companyId: string,
  ltmMonths: string[],
): Promise<MonthlyByAccount> {
  const result: MonthlyByAccount = new Map();
  const record = await withPrismaReconnectRetry(
    () =>
      prisma.financialRecord.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        select: { rawData: true },
      }),
    'account-monthly-sources.loadCsvMonthlyByAccount',
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
        // "Apr-24" / "Apr 2024" column labels
        const named = trimmed.match(/^([A-Za-z]{3})[A-Za-z]*[-\s]+(\d{2}|\d{4})$/);
        if (named) {
          const monthIndex = MONTH_ABBREVIATIONS.indexOf(named[1].toLowerCase());
          if (monthIndex >= 0) {
            const year = named[2].length === 2 ? 2000 + Number(named[2]) : Number(named[2]);
            return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
          }
        }
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
