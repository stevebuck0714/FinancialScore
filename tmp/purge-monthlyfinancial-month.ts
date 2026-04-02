import prisma from '../lib/prisma';

const COMPANY_ID = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const TARGET_MONTH = process.argv[3] || '2026-03';

async function main() {
  const before = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM "MonthlyFinancial"
    WHERE "companyId" = ${COMPANY_ID}
      AND to_char(date_trunc('month', "monthDate"), 'YYYY-MM') = ${TARGET_MONTH}
  `;

  const latest = await prisma.$queryRaw<
    Array<{ id: string; createdAt: Date; cash: number; totalAssets: number; totalLiab: number }>
  >`
    SELECT id, "createdAt", cash, "totalAssets", "totalLiab"
    FROM "MonthlyFinancial"
    WHERE "companyId" = ${COMPANY_ID}
      AND to_char(date_trunc('month', "monthDate"), 'YYYY-MM') = ${TARGET_MONTH}
    ORDER BY "createdAt" DESC
    LIMIT 5
  `;

  const deleted = await prisma.monthlyFinancial.deleteMany({
    where: {
      companyId: COMPANY_ID,
      monthDate: {
        gte: new Date(`${TARGET_MONTH}-01T00:00:00.000Z`),
        lt: new Date(
          (() => {
            const [y, m] = TARGET_MONTH.split('-').map(Number);
            const d = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
            return d.toISOString();
          })(),
        ),
      },
    },
  });

  const after = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count
    FROM "MonthlyFinancial"
    WHERE "companyId" = ${COMPANY_ID}
      AND to_char(date_trunc('month', "monthDate"), 'YYYY-MM') = ${TARGET_MONTH}
  `;

  console.log(
    JSON.stringify(
      {
        companyId: COMPANY_ID,
        month: TARGET_MONTH,
        rowsBefore: Number(before[0]?.count || 0),
        latestSampleBefore: latest,
        deletedCount: deleted.count,
        rowsAfter: Number(after[0]?.count || 0),
      },
      null,
      2,
    ),
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
