import 'dotenv/config';
import prisma from '../lib/prisma';

const COMPANY_ID = process.argv[2] || 'cmmcp278j0002kz0439rlixdj';

async function main() {
  const rows = await prisma.productGoalUpdate.findMany({
    where: { companyId: COMPANY_ID },
    select: { year: true, goalUpdate: true, updatedAt: true },
    orderBy: { year: 'asc' },
  });

  if (rows.length === 0) {
    console.log(`No ProductGoalUpdate rows for company ${COMPANY_ID}`);
    return;
  }

  for (const row of rows) {
    const goalUpdate = (row.goalUpdate || {}) as { monthlyRevenueGoals?: unknown };
    const months = Array.isArray(goalUpdate.monthlyRevenueGoals)
      ? (goalUpdate.monthlyRevenueGoals as Array<Record<string, unknown>>)
      : [];
    const populated = months.filter((month) =>
      ['baseline', 'growth', 'stretch'].some((key) => {
        const value = month?.[key];
        return value != null && value !== '' && Number.isFinite(Number(value));
      })
    );
    console.log(
      `year=${row.year} monthRows=${months.length} populatedMonths=${populated.length} updatedAt=${row.updatedAt.toISOString()}`
    );
    for (const month of populated) {
      console.log(
        `  month=${month.month} baseline=${month.baseline} growth=${month.growth} stretch=${month.stretch}`
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
