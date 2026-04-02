import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND platform = 'INFOR_M3'
        AND status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'GLACCTPERIODBALANCES'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    ),
    rows AS (
      SELECT x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    )
    SELECT
      COUNT(*)::int AS total_rows,
      COUNT(*) FILTER (WHERE item ? 'FiscalYear')::int AS has_fiscal_year,
      COUNT(*) FILTER (WHERE item ? 'FiscalPeriod')::int AS has_fiscal_period,
      COUNT(*) FILTER (WHERE item ? 'EndBalance')::int AS has_end_balance,
      COUNT(*) FILTER (WHERE item ? 'DomAmount')::int AS has_dom_amount,
      COUNT(*) FILTER (WHERE item ? 'TransDate')::int AS has_trans_date
    FROM rows
  `;
  console.log(JSON.stringify({ companyId, coverage: rows[0] || null }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
