import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';

  const programSummary = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH logs AS (
      SELECT
        UPPER(COALESCE(l."errorDetails"->>'miProgram','NULL')) AS program,
        l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
      ORDER BY l."createdAt" DESC
      LIMIT 400
    ),
    rows AS (
      SELECT program, x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    )
    SELECT
      program,
      COUNT(*)::int AS item_count,
      COUNT(*) FILTER (WHERE item ? 'FiscalYear')::int AS has_fiscal_year,
      COUNT(*) FILTER (WHERE item ? 'FiscalPeriod')::int AS has_fiscal_period,
      COUNT(*) FILTER (WHERE item ? 'ControlYear')::int AS has_control_year,
      COUNT(*) FILTER (WHERE item ? 'ControlPeriod')::int AS has_control_period,
      COUNT(*) FILTER (WHERE item ? 'EndBalance')::int AS has_end_balance,
      COUNT(*) FILTER (WHERE item ? 'BegBalance')::int AS has_beg_balance,
      COUNT(*) FILTER (WHERE item ? 'Balance')::int AS has_balance,
      COUNT(*) FILTER (WHERE item ? 'DomAmount')::int AS has_dom_amount,
      COUNT(*) FILTER (WHERE item ? 'Acct')::int AS has_acct,
      COUNT(*) FILTER (WHERE item ? 'TransDate')::int AS has_trans_date
    FROM rows
    GROUP BY 1
    ORDER BY item_count DESC
    LIMIT 50
  `;

  const keyFrequency = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH logs AS (
      SELECT
        UPPER(COALESCE(l."errorDetails"->>'miProgram','NULL')) AS program,
        l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
      ORDER BY l."createdAt" DESC
      LIMIT 400
    ),
    rows AS (
      SELECT program, x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    ),
    kv AS (
      SELECT program, k.key AS key
      FROM rows
      CROSS JOIN LATERAL jsonb_object_keys(rows.item) AS k(key)
    )
    SELECT
      program,
      key,
      COUNT(*)::int AS cnt
    FROM kv
    WHERE key ILIKE ANY (ARRAY[
      '%fiscal%',
      '%control%',
      '%period%',
      '%year%',
      '%balance%',
      '%ending%',
      '%begin%',
      '%acct%',
      '%amount%'
    ])
    GROUP BY 1,2
    ORDER BY cnt DESC
    LIMIT 200
  `;

  const samples = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH ranked AS (
      SELECT
        UPPER(COALESCE(l."errorDetails"->>'miProgram','NULL')) AS program,
        l."errorDetails"->'response'->'Items' AS items,
        l."createdAt"
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','NULL')) IN ('SLGLTRANS','SLLEDGERS','GLACCTPERIODBALANCES','SLCHARTS')
      ORDER BY l."createdAt" DESC
      LIMIT 20
    )
    SELECT
      program,
      "createdAt",
      (items->0) AS first_item
    FROM ranked
  `;

  console.log(JSON.stringify({ companyId, programSummary, keyFrequency, samples }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
