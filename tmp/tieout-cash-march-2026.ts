import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const MONTH = process.argv[3] || '2026-03';

const CLIENT_ACTUAL = new Map<string, number>([
  ['10100', 95680.49],
  ['10150', 62396.68],
  ['10200', 0],
  ['10250', 2502.84],
  ['10400', 204.78],
  ['10450', 4259.77],
]);

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function n(value: unknown): number {
  const num = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : 0;
}

function monthEndUtc(month: string): Date {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
}

async function main() {
  const outDir = path.join(process.cwd(), 'exports');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, `cash-tieout-${MONTH}.csv`);

  const mappings = await prisma.accountMapping.findMany({
    where: {
      companyId: COMPANY_ID,
      targetField: { in: ['cash', 'CASH'] as any },
    },
    select: {
      qbAccountId: true,
      qbAccountCode: true,
      qbAccount: true,
      targetField: true,
    },
    orderBy: { qbAccountId: 'asc' },
  });

  const accountIds = Array.from(
    new Set(
      mappings
        .map((m) => String(m.qbAccountId || m.qbAccountCode || '').trim())
        .filter(Boolean)
    )
  );

  const eom = monthEndUtc(MONTH);
  const glFactRows = await prisma.$queryRaw<Array<{ accountId: string; amount: number }>>`
    SELECT TRIM("accountId") AS "accountId", SUM("signedAmount")::double precision AS amount
    FROM "GLTransactionFact"
    WHERE "companyId" = ${COMPANY_ID}
      AND "transDate" <= ${eom}
      AND TRIM("accountId") = ANY(${accountIds})
    GROUP BY 1
  `;
  const glFactByAccount = new Map(glFactRows.map((r) => [String(r.accountId).trim(), n(r.amount)]));

  const periodRows = await prisma.$queryRaw<Array<{ item: unknown }>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${COMPANY_ID}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'GLACCTPERIODBALANCES'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    )
    SELECT x.value AS item
    FROM logs
    CROSS JOIN LATERAL jsonb_array_elements(items) x
  `;

  const periodByAccount = new Map<string, number>();
  for (const row of periodRows) {
    if (!row?.item || typeof row.item !== 'object' || Array.isArray(row.item)) continue;
    const item = row.item as Record<string, unknown>;
    const acct = String(item.Acct ?? item.acct ?? item.Account ?? '').trim();
    if (!acct || !accountIds.includes(acct)) continue;
    const fy = Number(item.FiscalYear ?? item.fiscalYear ?? item.ControlYear ?? item.controlYear ?? 0);
    const fp = Number(item.FiscalPeriod ?? item.fiscalPeriod ?? item.ControlPeriod ?? item.controlPeriod ?? 0);
    const hasShape = Number.isFinite(fy) && Number.isFinite(fp) && fy > 1900 && fp >= 1 && fp <= 12 && item.EndBalance !== undefined;
    if (!hasShape) continue;
    const monthKey = `${Math.trunc(fy)}-${String(Math.trunc(fp)).padStart(2, '0')}`;
    if (monthKey !== MONTH) continue;
    const endBal = n(item.EndBalance ?? item.endBalance ?? item.PeriodEndBalance ?? item.periodEndBalance);
    periodByAccount.set(acct, (periodByAccount.get(acct) || 0) + endBal);
  }

  const monthly = await prisma.$queryRaw<Array<{ cash: number }>>`
    SELECT mf."cash"
    FROM "MonthlyFinancial" mf
    WHERE mf."companyId" = ${COMPANY_ID}
      AND to_char(date_trunc('month', mf."monthDate"), 'YYYY-MM') = ${MONTH}
    ORDER BY mf."createdAt" DESC
    LIMIT 1
  `;
  const dataReviewCashRollup = monthly[0] ? n(monthly[0].cash) : 0;

  let totalClient = 0;
  let totalGl = 0;
  let totalPeriod = 0;

  const lines: string[] = [];
  lines.push([
    'account_id',
    'account_name',
    'client_actual',
    'slgltrans_cumulative_transdate_eom',
    'glacctperiodbalances_endbalance_eom',
    'account_review_expected_current',
    'delta_gl_vs_client',
    'delta_period_vs_client',
    'data_review_cash_rollup_monthlyfinancial',
  ].join(','));

  for (const m of mappings) {
    const accountId = String(m.qbAccountId || m.qbAccountCode || '').trim();
    const name = String(m.qbAccount || '').trim();
    const client = CLIENT_ACTUAL.get(accountId) || 0;
    const gl = glFactByAccount.get(accountId) ?? 0;
    const period = periodByAccount.get(accountId) ?? 0;
    const accountReviewExpected = gl; // current account-review fallback path for multi-mapped cash

    totalClient += client;
    totalGl += gl;
    totalPeriod += period;

    lines.push([
      csvEscape(accountId),
      csvEscape(name),
      csvEscape(client),
      csvEscape(gl),
      csvEscape(period),
      csvEscape(accountReviewExpected),
      csvEscape(gl - client),
      csvEscape(period - client),
      csvEscape(dataReviewCashRollup),
    ].join(','));
  }

  lines.push([
    'TOTAL',
    '',
    csvEscape(totalClient),
    csvEscape(totalGl),
    csvEscape(totalPeriod),
    csvEscape(totalGl),
    csvEscape(totalGl - totalClient),
    csvEscape(totalPeriod - totalClient),
    csvEscape(dataReviewCashRollup),
  ].join(','));

  await fs.writeFile(outFile, `${lines.join('\n')}\n`, 'utf8');
  console.log(JSON.stringify({ companyId: COMPANY_ID, month: MONTH, outFile }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

