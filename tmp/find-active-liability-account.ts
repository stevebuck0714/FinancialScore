import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-02';
  const site = process.argv[4] || 'LYN';
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  const rows = await prisma.$queryRaw<Array<{ accountId: string; targetField: string; cnt: number; amt: number }>>`
    WITH mapped_liability AS (
      SELECT DISTINCT
        TRIM(COALESCE("qbAccountId","qbAccountCode")) AS account_id,
        LOWER(COALESCE("targetField", '')) AS target_field
      FROM "AccountMapping"
      WHERE "companyId" = ${companyId}
        AND LOWER(COALESCE("targetField", '')) IN ('ap','loc','othercl','tcl','ltd','totalliab')
        AND TRIM(COALESCE("qbAccountId","qbAccountCode")) <> ''
    )
    SELECT
      g."accountId" AS "accountId",
      ml.target_field AS "targetField",
      COUNT(*)::int AS cnt,
      SUM(ABS(g."signedAmount"))::double precision AS amt
    FROM "GLTransactionFact" g
    JOIN mapped_liability ml ON ml.account_id = TRIM(g."accountId")
    WHERE g."companyId" = ${companyId}
      AND g."transDate" >= ${start}
      AND g."transDate" <= ${end}
      AND COALESCE(g.site, '') = ${site}
    GROUP BY 1,2
    ORDER BY cnt DESC, amt DESC
    LIMIT 5
  `;

  console.log(JSON.stringify({ companyId, month, site, candidates: rows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

