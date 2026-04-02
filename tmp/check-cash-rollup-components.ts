import prisma from '../lib/prisma';

async function main() {
  const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
  const month = process.argv[3] || '2026-03';
  const [y, m] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const monthEnd = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  const mappedCashAccounts = await prisma.accountMapping.findMany({
    where: { companyId, targetField: { in: ['cash', 'CASH'] as any } },
    select: { qbAccountId: true, qbAccountCode: true, qbAccount: true },
    orderBy: { qbAccountId: 'asc' },
  });
  const accountIds = Array.from(
    new Set(mappedCashAccounts.map((r) => String(r.qbAccountId || r.qbAccountCode || '').trim()).filter(Boolean))
  );

  const rows = await prisma.$queryRaw<Array<{ accountId: string; sumSigned: number; sumAbsSigned: number; rowCount: number }>>`
    SELECT
      TRIM("accountId") AS "accountId",
      SUM("signedAmount")::double precision AS "sumSigned",
      SUM(ABS("signedAmount"))::double precision AS "sumAbsSigned",
      COUNT(*)::int AS "rowCount"
    FROM "GLTransactionFact"
    WHERE "companyId" = ${companyId}
      AND "transDate" >= ${monthStart}
      AND "transDate" <= ${monthEnd}
      AND TRIM("accountId") = ANY(${accountIds})
    GROUP BY 1
    ORDER BY 1
  `;

  const monthly = await prisma.$queryRaw<Array<{ id: string; cash: number }>>`
    SELECT id, "cash"
    FROM "MonthlyFinancial"
    WHERE "companyId" = ${companyId}
      AND to_char(date_trunc('month', "monthDate"), 'YYYY-MM') = ${month}
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;

  const totalSigned = rows.reduce((s, r) => s + Number(r.sumSigned || 0), 0);
  const totalAbs = rows.reduce((s, r) => s + Number(r.sumAbsSigned || 0), 0);
  console.log(
    JSON.stringify(
      {
        companyId,
        month,
        monthlyFinancialId: monthly[0]?.id || null,
        monthlyFinancialCash: monthly[0]?.cash || null,
        mappedCashAccounts: mappedCashAccounts.map((r) => ({
          accountId: String(r.qbAccountId || r.qbAccountCode || '').trim(),
          name: r.qbAccount,
        })),
        contributors: rows,
        totalSigned,
        totalAbsSigned: totalAbs,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

