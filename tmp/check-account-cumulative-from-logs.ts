import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const accountId = process.argv[3] || '45000';
  const monthEnd = process.argv[4] || '2026-03-31';

  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH logs AS (
      SELECT
        UPPER(COALESCE(l."errorDetails"->>'miProgram','')) AS program,
        l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) IN ('SLGLTRANS','GLACCTPERIODBALANCES','SLLEDGERS')
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    ),
    item_rows AS (
      SELECT
        program,
        x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    ),
    normalized AS (
      SELECT
        program,
        TRIM(COALESCE(item->>'Acct','')) AS acct,
        to_timestamp(substr(COALESCE(item->>'TransDate','00010101 00:00:00.000'),1,8), 'YYYYMMDD') AT TIME ZONE 'UTC' AS trans_date,
        COALESCE(NULLIF(item->>'DomAmount','')::double precision, 0) AS dom_amount
      FROM item_rows
    )
    SELECT
      program,
      COUNT(*)::int AS cnt,
      COALESCE(SUM(dom_amount),0)::double precision AS cumulative_dom_amount
    FROM normalized
    WHERE acct = ${accountId}
      AND trans_date <= (${monthEnd}::date + INTERVAL '1 day' - INTERVAL '1 millisecond')
    GROUP BY 1
    ORDER BY 1
  `;

  console.log(JSON.stringify({ companyId, accountId, monthEnd, rows }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
