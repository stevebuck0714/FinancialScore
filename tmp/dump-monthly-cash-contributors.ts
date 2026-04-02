import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-03';
  const [y, m] = month.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  const outFile = path.join(process.cwd(), 'exports', `monthly-cash-contributors-${month}.csv`);
  await fs.mkdir(path.dirname(outFile), { recursive: true });

  const rows = await prisma.$queryRaw<Array<{ accountId: string; accountName: string | null; eomBalance: number; rowCount: number }>>`
    WITH b AS (
      SELECT
        TRIM("accountId") AS "accountId",
        SUM("signedAmount")::double precision AS "eomBalance",
        COUNT(*)::int AS "rowCount"
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND "transDate" <= ${monthEnd}
      GROUP BY 1
    ),
    n AS (
      SELECT DISTINCT ON (TRIM("accountId"))
        TRIM("accountId") AS "accountId",
        NULLIF(TRIM(COALESCE("accountName", '')), '') AS "accountName"
      FROM "GLTransactionFact"
      WHERE "companyId" = ${companyId}
        AND "transDate" <= ${monthEnd}
      ORDER BY TRIM("accountId"), "transDate" DESC
    )
    SELECT b."accountId", n."accountName", b."eomBalance", b."rowCount"
    FROM b
    LEFT JOIN n ON n."accountId" = b."accountId"
    WHERE LOWER(COALESCE(n."accountName", '')) LIKE '%cash%'
       OR LOWER(COALESCE(n."accountName", '')) LIKE '%bank%'
    ORDER BY ABS(b."eomBalance") DESC
  `;

  const lines = ['account_id,account_name,eom_balance,row_count'];
  let total = 0;
  for (const r of rows) {
    total += Number(r.eomBalance || 0);
    lines.push(`${r.accountId},"${String(r.accountName || '').replace(/"/g, '""')}",${Number(r.eomBalance || 0)},${r.rowCount}`);
  }
  lines.push(`TOTAL,,${total},`);
  await fs.writeFile(outFile, `${lines.join('\n')}\n`, 'utf8');
  console.log(JSON.stringify({ outFile, rowCount: rows.length, total }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

