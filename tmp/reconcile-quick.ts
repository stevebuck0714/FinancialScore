import prisma from '../lib/prisma';
import { parseMonthInput } from '../lib/financial/month-publish';

const companyId = process.argv[2] || 'cmmnwyofv000fqhp4z8lebbny';
const months = process.argv.slice(3).length > 0 ? process.argv.slice(3) : ['2026-01', '2026-02', '2026-03'];

const toNumber = (value: unknown): number => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

async function main() {
  const summaryFields = ['revenue', 'cogsTotal', 'expense', 'cash', 'ar', 'ap', 'totalAssets', 'totalLiab', 'totalEquity', 'totalLAndE'];
  const results: Array<Record<string, unknown>> = [];
  const delegate = (prisma as any).dailyFinancialSnapshot;

  for (const month of months) {
    const parsed = parseMonthInput(month);
    if (!parsed) {
      results.push({ month, error: 'invalid month format' });
      continue;
    }

    const snapshots = await delegate.findMany({
      where: {
        companyId,
        frequency: 'daily',
        snapshotDate: { gte: parsed.monthStart, lte: parsed.monthEnd },
      },
      orderBy: { snapshotDate: 'asc' },
    });

    const latestRecord = await prisma.financialRecord.findFirst({
      where: { companyId },
      select: {
        id: true,
        monthlyData: {
          where: { monthDate: parsed.monthStart },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const monthly = latestRecord?.monthlyData?.[0] || null;

    if (!snapshots.length || !monthly) {
      results.push({
        month,
        error: !snapshots.length ? 'no daily snapshots' : 'no monthly row in latest financial record',
      });
      continue;
    }

    const monthEndSnapshot = snapshots[snapshots.length - 1];
    const incomeFields = ['revenue', 'cogsTotal', 'expense'];
    const incomeDiffs = incomeFields.map((field) => {
      const dailySum = snapshots.reduce((sum: number, row: any) => sum + toNumber(row?.[field]), 0);
      const monthlyValue = toNumber((monthly as any)?.[field]);
      return { field, delta: dailySum - monthlyValue };
    });
    const balanceDiffs = summaryFields.map((field) => {
      const dailyValue = toNumber((monthEndSnapshot as any)?.[field]);
      const monthlyValue = toNumber((monthly as any)?.[field]);
      return { field, delta: dailyValue - monthlyValue };
    });

    results.push({
      month,
      snapshotDays: snapshots.length,
      maxIncomeDelta: Math.max(...incomeDiffs.map((entry) => Math.abs(Number(entry.delta || 0)))),
      maxBalanceDelta: Math.max(...balanceDiffs.map((entry) => Math.abs(Number(entry.delta || 0)))),
    });
  }

  console.log(JSON.stringify({ companyId, results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
