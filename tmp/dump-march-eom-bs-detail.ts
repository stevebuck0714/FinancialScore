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
  const monthEnd = process.argv[3] || '2026-03-31';
  const outPath =
    process.argv[4] || path.join(process.cwd(), 'exports', 'march-2026-eom-bs-detail.csv');

  const rows = await prisma.$queryRaw<
    Array<{
      account_id: string;
      account_name: string | null;
      target_field: string | null;
      classification: string | null;
      amount: number | null;
    }>
  >`
    WITH bs_mappings AS (
      SELECT DISTINCT
        TRIM(COALESCE("qbAccountId", "qbAccountCode")) AS account_id,
        NULLIF(TRIM(COALESCE("qbAccount", '')), '') AS account_name,
        NULLIF(TRIM(COALESCE("targetField", '')), '') AS target_field,
        NULLIF(TRIM(COALESCE("qbAccountClassification", '')), '') AS classification
      FROM "AccountMapping"
      WHERE "companyId" = ${companyId}
        AND COALESCE("targetField",'') IN (
          'cash','ar','inventory','otherCA','fixedAssets','otherAssets','totalAssets',
          'ap','loc','otherCL','tcl','ltd','totalLiab',
          'ownersCapital','ownersDraw','commonStock','preferredStock','retainedEarnings','additionalPaidInCapital','treasuryStock','totalEquity'
        )
        AND TRIM(COALESCE("qbAccountId", "qbAccountCode", '')) <> ''
    ),
    log_items AS (
      SELECT x.value AS item
      FROM "ApiSyncLog" l
      CROSS JOIN LATERAL jsonb_array_elements(l."errorDetails"->'response'->'Items') x
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'GLACCTPERIODBALANCES'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    ),
    tx_balances AS (
      SELECT
        TRIM(COALESCE(item->>'Acct','')) AS account_id,
        SUM(COALESCE(NULLIF(item->>'DomAmount','')::double precision,0)) AS amount
      FROM log_items
      WHERE TRIM(COALESCE(item->>'Acct','')) <> ''
        AND to_timestamp(substr(COALESCE(item->>'TransDate','00010101 00:00:00.000'),1,8),'YYYYMMDD')
            <= (${monthEnd}::date + INTERVAL '1 day' - INTERVAL '1 millisecond')
      GROUP BY 1
    )
    SELECT
      m.account_id,
      m.account_name,
      m.target_field,
      m.classification,
      b.amount
    FROM bs_mappings m
    LEFT JOIN tx_balances b
      ON b.account_id = m.account_id
    ORDER BY m.account_id
  `;

  const header = ['account_id', 'account_name', 'target_field', 'classification', 'amount'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.account_id),
        csvEscape(row.account_name ?? ''),
        csvEscape(row.target_field ?? ''),
        csvEscape(row.classification ?? ''),
        csvEscape(row.amount == null ? '' : Number(row.amount).toFixed(2)),
      ].join(',')
    );
  }

  await fs.writeFile(outPath, `${lines.join('\n')}\n`, 'utf8');

  const retained = rows.find((r) => r.account_id === '45000') || null;
  console.log(
    JSON.stringify(
      {
        companyId,
        monthEnd,
        outPath,
        rowCount: rows.length,
        retainedEarnings45000: retained,
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
