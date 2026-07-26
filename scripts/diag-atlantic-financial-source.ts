import dotenv from 'dotenv';

dotenv.config({ path: '.env.prod.local', override: true });

const COMPANY_ID = 'cmmcp278j0002kz0439rlixdj';
const JUNE_START = new Date('2026-06-01T00:00:00.000Z');
const JUNE_END = new Date('2026-06-30T23:59:59.999Z');
const JUNE_REVENUE_EXPECTED = 2_144_474.82;
const JUNE_AP_EXPECTED = 557_429.01;

async function main() {
  const { default: prisma } = await import('@/lib/prisma');
  try {
    const [latestSnapshots, juneRevenueBySource, juneApBySource, latestPending] = await Promise.all([
      prisma.dailyFinancialSnapshot.findMany({
        where: { companyId: COMPANY_ID },
        orderBy: { snapshotDate: 'desc' },
        take: 10,
        select: {
          snapshotDate: true,
          revenue: true,
          expense: true,
          cash: true,
          ar: true,
          inventory: true,
          ap: true,
          loc: true,
          otherAssets: true,
          totalAssets: true,
          totalLiab: true,
          totalEquity: true,
          totalLAndE: true,
          sourcePlatform: true,
          updatedAt: true,
        },
      }),
      prisma.$queryRaw<Array<{ sourceProgram: string | null; sourceTransaction: string | null; revenuePositive: number | null }>>`
      SELECT
        g."sourceProgram" AS "sourceProgram",
        g."sourceTransaction" AS "sourceTransaction",
        (-SUM(g."signedAmount"))::float AS "revenuePositive"
      FROM "GLTransactionFact" g
      INNER JOIN "AccountMapping" am
        ON am."companyId" = g."companyId"
        AND am."accountId" = g."accountId"
      WHERE g."companyId" = ${COMPANY_ID}
        AND g."transDate" BETWEEN ${JUNE_START} AND ${JUNE_END}
        AND am."targetField" IN (
          'revenue',
          'nonOperatingIncome',
          'rev_contract_program_revenue',
          'rev_product_resale_revenue',
          'rev_vendor_rebates_and_incentives',
          'rev_other_revenue'
        )
      GROUP BY g."sourceProgram", g."sourceTransaction"
      ORDER BY ABS((-SUM(g."signedAmount")) - ${JUNE_REVENUE_EXPECTED}) ASC
    `,
      prisma.$queryRaw<Array<{ sourceProgram: string | null; sourceTransaction: string | null; apComputed: number | null }>>`
      SELECT
        g."sourceProgram" AS "sourceProgram",
        g."sourceTransaction" AS "sourceTransaction",
        (697929.58 - SUM(g."signedAmount"))::float AS "apComputed"
      FROM "GLTransactionFact" g
      WHERE g."companyId" = ${COMPANY_ID}
        AND g."accountId" = '30100'
        AND g."transDate"::date > DATE '2023-12-31'
        AND g."transDate" <= ${JUNE_END}
      GROUP BY g."sourceProgram", g."sourceTransaction"
      ORDER BY ABS((697929.58 - SUM(g."signedAmount")) - ${JUNE_AP_EXPECTED}) ASC
    `,
      prisma.$queryRaw<Array<{ pending: number }>>`
      SELECT COUNT(*)::int AS pending
      FROM (
        SELECT rc."syncRunId", rc."businessDate"
        FROM "InforRawCompleteness" rc
        INNER JOIN "InforSyncRun" sr
          ON sr.id = rc."syncRunId"
          AND sr.status IN ('done', 'failed', 'cancelled')
        WHERE rc.platform = 'INFOR_M3'
          AND rc."companyId" = ${COMPANY_ID}
          AND rc."isComplete" = false
          AND COALESCE(rc."statusMessage", '') NOT LIKE 'raw_missing:%'
        GROUP BY rc."syncRunId", rc."businessDate"
      ) q
    `,
    ]);

    console.log(
      JSON.stringify(
        {
          companyId: COMPANY_ID,
          expected: {
            juneRevenue: JUNE_REVENUE_EXPECTED,
            juneAp: JUNE_AP_EXPECTED,
          },
          pendingTransformRemaining: latestPending[0]?.pending ?? null,
          juneRevenueBySource,
          juneApBySource,
          latestSnapshots: latestSnapshots.map((row) => ({
            ...row,
            snapshotDate: row.snapshotDate.toISOString().slice(0, 10),
            updatedAt: row.updatedAt.toISOString(),
          })),
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
