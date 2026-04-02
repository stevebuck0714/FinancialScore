import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-03';
  const monthEnd = `${month}-31`;
  const outDir = path.join(process.cwd(), 'exports');
  const dataReviewCsv = path.join(outDir, 'march-2026-data-review-cash-source.csv');
  const accountReviewCsv = path.join(outDir, 'march-2026-account-review-cash-source.csv');

  await fs.mkdir(outDir, { recursive: true });

  const monthlyRows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      mf.id,
      mf."monthDate",
      mf."createdAt",
      mf."cash",
      mf."totalAssets",
      mf."totalLiab",
      mf."totalEquity"
    FROM "MonthlyFinancial" mf
    WHERE mf."companyId" = ${companyId}
      AND to_char(date_trunc('month', mf."monthDate"), 'YYYY-MM') = ${month}
    ORDER BY mf."createdAt" DESC
    LIMIT 1
  `;
  const monthly = monthlyRows[0] || {};

  const mappings = await prisma.$queryRaw<
    Array<{
      qbAccountId: string | null;
      qbAccountCode: string | null;
      qbAccount: string | null;
      targetField: string | null;
    }>
  >`
    SELECT
      "qbAccountId",
      "qbAccountCode",
      "qbAccount",
      "targetField"
    FROM "AccountMapping"
    WHERE "companyId" = ${companyId}
      AND LOWER(COALESCE("targetField", '')) = 'cash'
    ORDER BY COALESCE("qbAccountId","qbAccountCode","qbAccount")
  `;

  const glRows = await prisma.$queryRaw<
    Array<{
      account_id: string;
      amount: number;
      row_count: number;
      latest_account_name: string | null;
    }>
  >`
    WITH balances AS (
      SELECT
        TRIM("accountId") AS account_id,
        SUM("signedAmount")::double precision AS amount,
        COUNT(*)::int AS row_count
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND "transDate" <= (${monthEnd}::date + INTERVAL '1 day' - INTERVAL '1 millisecond')
      GROUP BY 1
    ),
    names AS (
      SELECT DISTINCT ON (TRIM("accountId"))
        TRIM("accountId") AS account_id,
        NULLIF(TRIM(COALESCE("accountName", '')), '') AS latest_account_name
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND "transDate" <= (${monthEnd}::date + INTERVAL '1 day' - INTERVAL '1 millisecond')
      ORDER BY TRIM("accountId"), "transDate" DESC
    )
    SELECT
      b.account_id,
      b.amount,
      b.row_count,
      n.latest_account_name
    FROM balances b
    LEFT JOIN names n ON n.account_id = b.account_id
  `;
  const glById = new Map<string, { amount: number; rowCount: number; latestAccountName: string | null }>();
  for (const row of glRows) {
    glById.set(String(row.account_id || '').trim(), {
      amount: Number(row.amount || 0),
      rowCount: Number(row.row_count || 0),
      latestAccountName: row.latest_account_name || null,
    });
  }

  const dataReviewLines: string[] = [];
  dataReviewLines.push(['company_id', 'month', 'monthly_financial_id', 'month_date', 'created_at', 'cash', 'total_assets', 'total_liab', 'total_equity'].join(','));
  dataReviewLines.push(
    [
      csvEscape(companyId),
      csvEscape(month),
      csvEscape(monthly.id ?? ''),
      csvEscape(monthly.monthDate ?? ''),
      csvEscape(monthly.createdAt ?? ''),
      csvEscape(monthly.cash ?? ''),
      csvEscape(monthly.totalAssets ?? ''),
      csvEscape(monthly.totalLiab ?? ''),
      csvEscape(monthly.totalEquity ?? ''),
    ].join(',')
  );
  await fs.writeFile(dataReviewCsv, `${dataReviewLines.join('\n')}\n`, 'utf8');

  const accountReviewLines: string[] = [];
  accountReviewLines.push(
    [
      'company_id',
      'month',
      'target_field',
      'mapped_account_id',
      'mapped_account_code',
      'mapped_account_name',
      'glfact_eom_balance',
      'glfact_row_count',
      'latest_gl_account_name',
      'data_review_cash_rollup',
    ].join(',')
  );
  for (const mapping of mappings) {
    const accountId = String(mapping.qbAccountId || mapping.qbAccountCode || '').trim();
    const gl = accountId ? glById.get(accountId) : undefined;
    accountReviewLines.push(
      [
        csvEscape(companyId),
        csvEscape(month),
        csvEscape(mapping.targetField || ''),
        csvEscape(mapping.qbAccountId || ''),
        csvEscape(mapping.qbAccountCode || ''),
        csvEscape(mapping.qbAccount || ''),
        csvEscape(gl ? gl.amount : ''),
        csvEscape(gl ? gl.rowCount : 0),
        csvEscape(gl?.latestAccountName || ''),
        csvEscape(monthly.cash ?? ''),
      ].join(',')
    );
  }
  await fs.writeFile(accountReviewCsv, `${accountReviewLines.join('\n')}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        companyId,
        month,
        dataReviewCsv,
        accountReviewCsv,
        mappingRows: mappings.length,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
