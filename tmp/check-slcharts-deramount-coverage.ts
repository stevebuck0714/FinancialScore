import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','NULL')) = 'NULL'
        AND COALESCE(l."errorDetails"->>'endpointPath','') ILIKE '%/ido/load/SLCharts%'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
      ORDER BY l."createdAt" DESC
      LIMIT 30
    ),
    rows AS (
      SELECT x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(logs.items) x
    )
    SELECT
      COUNT(*)::int AS total_rows,
      COUNT(*) FILTER (WHERE NULLIF(item->>'DerAmount1','') IS NOT NULL)::int AS der_amount1_nonnull,
      COUNT(*) FILTER (WHERE NULLIF(item->>'DerAmount2','') IS NOT NULL)::int AS der_amount2_nonnull,
      COUNT(*) FILTER (WHERE NULLIF(item->>'DerFiscalYear','') IS NOT NULL)::int AS der_fiscal_year_nonnull
    FROM rows
  `;

  const samples = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','NULL')) = 'NULL'
        AND COALESCE(l."errorDetails"->>'endpointPath','') ILIKE '%/ido/load/SLCharts%'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
      ORDER BY l."createdAt" DESC
      LIMIT 30
    ),
    rows AS (
      SELECT x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(logs.items) x
    )
    SELECT
      item->>'Acct' AS acct,
      item->>'Description' AS description,
      item->>'Type' AS type,
      item->>'DerAmount1' AS der_amount1,
      item->>'DerAmount2' AS der_amount2,
      item->>'DerFiscalYear' AS der_fiscal_year
    FROM rows
    WHERE NULLIF(item->>'DerAmount1','') IS NOT NULL
       OR NULLIF(item->>'DerAmount2','') IS NOT NULL
       OR NULLIF(item->>'DerFiscalYear','') IS NOT NULL
    LIMIT 30
  `;

  console.log(JSON.stringify({ companyId, coverage: rows[0] || null, samples }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
