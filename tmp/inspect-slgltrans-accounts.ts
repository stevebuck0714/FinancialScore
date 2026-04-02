import prisma from '../lib/prisma';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

async function main() {
  const rows = await prisma.$queryRaw<Array<{ acct: string; count: number }>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${COMPANY_ID}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'SLGLTRANS'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    ),
    items AS (
      SELECT x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    ),
    flat AS (
      SELECT
        COALESCE(
          NULLIF(TRIM(item->>'Acct'),''),
          NULLIF(TRIM(item->>'acct'),''),
          NULLIF(TRIM(item->>'Account'),''),
          NULLIF(TRIM(item->>'account'),'')
        ) AS acct
      FROM items
    )
    SELECT acct, COUNT(*)::int AS count
    FROM flat
    WHERE acct IS NOT NULL
    GROUP BY acct
    ORDER BY count DESC, acct ASC
    LIMIT 50
  `;

  const sample = await prisma.$queryRaw<Array<{ item: unknown }>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${COMPANY_ID}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'SLGLTRANS'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    )
    SELECT x.value AS item
    FROM logs
    CROSS JOIN LATERAL jsonb_array_elements(items) x
    LIMIT 3
  `;

  console.log(JSON.stringify({ topAccounts: rows, sample }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
