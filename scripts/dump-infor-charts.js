const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    throw new Error('Usage: node scripts/dump-infor-charts.js <companyId>');
  }

  const rows = await prisma.$queryRaw`
    WITH logs AS (
      SELECT
        l."createdAt" AS created_at,
        l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram', '')) = 'SLCHARTS'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    ),
    chart_rows AS (
      SELECT
        created_at,
        x.value AS r
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    ),
    normalized AS (
      SELECT
        COALESCE(NULLIF(r->>'Acct', ''), NULLIF(r->>'account', ''), NULLIF(r->>'Account', '')) AS acct,
        COALESCE(
          NULLIF(r->>'Description', ''),
          NULLIF(r->>'ChaDescription', ''),
          NULLIF(r->>'FRDerDescription', ''),
          NULLIF(r->>'description', '')
        ) AS description,
        COALESCE(
          NULLIF(r->>'Type', ''),
          NULLIF(r->>'AcctType', ''),
          NULLIF(r->>'AccountType', ''),
          NULLIF(r->>'classification', '')
        ) AS acct_type,
        created_at
      FROM chart_rows
    ),
    ranked AS (
      SELECT
        acct,
        description,
        acct_type,
        row_number() OVER (PARTITION BY acct ORDER BY created_at DESC) AS rn
      FROM normalized
      WHERE acct IS NOT NULL AND acct <> ''
    )
    SELECT acct, description, acct_type
    FROM ranked
    WHERE rn = 1
    ORDER BY acct ASC
  `;

  console.log('acct,description,acct_type');
  for (const row of rows) {
    const acct = String(row.acct || '').replace(/"/g, '""');
    const description = String(row.description || '').replace(/"/g, '""');
    const acctType = String(row.acct_type || '').replace(/"/g, '""');
    console.log(`"${acct}","${description}","${acctType}"`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
