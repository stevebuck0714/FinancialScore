import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const accountId = process.argv[3] || '45000';
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH logs AS (
      SELECT
        l."createdAt",
        l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','NULL')) = 'NULL'
        AND COALESCE(l."errorDetails"->>'endpointPath','') ILIKE '%/ido/load/SLCharts%'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
      ORDER BY l."createdAt" DESC
      LIMIT 20
    ),
    rows AS (
      SELECT
        logs."createdAt",
        x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(logs.items) x
    )
    SELECT
      "createdAt",
      item->>'Acct' AS acct,
      item->>'Description' AS description,
      item->>'Type' AS type,
      item->>'DerAmount1' AS der_amount1,
      item->>'DerAmount2' AS der_amount2,
      item->>'DerFiscalYear' AS der_fiscal_year,
      item->>'RecordDate' AS record_date
    FROM rows
    WHERE TRIM(COALESCE(item->>'Acct','')) = ${accountId}
    ORDER BY "createdAt" DESC
    LIMIT 20
  `;

  console.log(JSON.stringify({ companyId, accountId, rows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
