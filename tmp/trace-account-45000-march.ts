import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const accountId = process.argv[3] || '45000';
  const month = process.argv[4] || '2026-03';

  const mapping = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      "qbAccount",
      "qbAccountId",
      "qbAccountCode",
      "targetField",
      "qbAccountClassification"
    FROM "AccountMapping"
    WHERE "companyId" = ${companyId}
      AND (
        TRIM(COALESCE("qbAccountId", '')) = ${accountId}
        OR TRIM(COALESCE("qbAccountCode", '')) = ${accountId}
        OR LOWER(TRIM(COALESCE("qbAccount", ''))) LIKE '%retained earnings%'
      )
    ORDER BY "qbAccountId" NULLS LAST
    LIMIT 20
  `;

  const glFact = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      COUNT(*)::int AS cnt,
      COALESCE(SUM("signedAmount"),0)::double precision AS sum_signed,
      MIN("transDate") AS min_date,
      MAX("transDate") AS max_date
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
      AND TRIM("accountId") = ${accountId}
      AND to_char(date_trunc('month', "transDate"), 'YYYY-MM') = ${month}
  `;

  const glFactCum = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      COALESCE(SUM("signedAmount"),0)::double precision AS cumulative_to_month_end
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
      AND TRIM("accountId") = ${accountId}
      AND "transDate" <= to_date(${month} || '-01', 'YYYY-MM-DD') + INTERVAL '1 month - 1 millisecond'
  `;

  const periodRaw = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    WITH logs AS (
      SELECT l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l."companyId" = ${companyId}
        AND l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram','')) = 'GLACCTPERIODBALANCES'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
    ),
    rows AS (
      SELECT x.value AS item
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    )
    SELECT
      item->>'Acct' AS acct,
      item->>'FiscalYear' AS fiscal_year,
      item->>'FiscalPeriod' AS fiscal_period,
      item->>'EndBalance' AS end_balance,
      item->>'DomAmount' AS dom_amount
    FROM rows
    WHERE TRIM(COALESCE(item->>'Acct','')) = ${accountId}
      AND (item->>'FiscalYear') = split_part(${month}, '-', 1)
      AND LPAD(COALESCE(item->>'FiscalPeriod',''),2,'0') = split_part(${month}, '-', 2)
    LIMIT 30
  `;

  const monthly = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      "monthDate",
      "retainedEarnings",
      "totalEquity",
      "totalAssets",
      "totalLiab",
      "totalLAndE"
    FROM "MonthlyFinancial"
    WHERE "companyId" = ${companyId}
      AND to_char(date_trunc('month',"monthDate"),'YYYY-MM') = ${month}
    ORDER BY "monthDate" DESC
    LIMIT 3
  `;

  console.log(
    JSON.stringify(
      {
        companyId,
        accountId,
        month,
        mapping,
        glFact: glFact[0] || null,
        glFactCum: glFactCum[0] || null,
        periodRawSample: periodRaw,
        monthlyRows: monthly,
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
