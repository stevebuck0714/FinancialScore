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
): MonthlyByAccount {
  const result: MonthlyByAccount = new Map();
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return result;
  const raw = rawData as Record<string, unknown>;
  const monthSet = new Set(ltmMonths);
  collectQboReport(raw.profitAndLoss, monthSet, nameKeys, result);
  collectQboReport(raw.balanceSheet, monthSet, nameKeys, result);
  return result;
}
