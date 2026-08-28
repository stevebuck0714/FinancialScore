import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { getOpsMetricProfile } from '@/lib/performance-analytics/ops-metric-profiles';
import { loadMonthlyFromDfs } from '@/lib/performance-analytics/monthly-from-dfs';

export const dynamic = 'force-dynamic';

const MS_IN_DAY = 24 * 60 * 60 * 1000;

function getDefaultDateRange(frequency: string) {
  const endDate = new Date();
  const startDate = new Date();

  if (frequency === 'daily') {
    startDate.setTime(endDate.getTime() - 90 * MS_IN_DAY);
  } else if (frequency === 'weekly') {
    startDate.setTime(endDate.getTime() - 16 * 7 * MS_IN_DAY);
  } else {
    startDate.setMonth(endDate.getMonth() - 12);
  }

  return { startDate, endDate };
}

function summarizeRange<T extends { snapshotDate?: Date; monthDate?: Date }>(records: T[]) {
  if (!records.length) return { count: 0, start: null, end: null };
  const dates = records
    .map((r) => (r.snapshotDate ? r.snapshotDate : r.monthDate))
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => a.getTime() - b.getTime());
  if (!dates.length) return { count: records.length, start: null, end: null };
  return { count: records.length, start: dates[0], end: dates[dates.length - 1] };
}

type OpsCoverageSummary = {
  count: number;
  start: Date | null;
  end: Date | null;
  frequency: string | null;
};

type OpsCoverageGroup = {
  frequency: string;
  _count: { _all: number };
  _min: { snapshotDate: Date | null };
  _max: { snapshotDate: Date | null };
};

/**
 * Ops modules (esp. Infor CSI tenants like Atlantic Precision) write mostly
 * daily snapshots. Data Coverage previously filtered frequency=monthly only,
 * so Cash/AR/AP/etc. showed 0 even when daily data was present. Prefer the
 * densest frequency series in the window (daily → weekly → monthly).
 */
async function summarizeOpsCoverage(
  label: string,
  loadGroups: () => Promise<OpsCoverageGroup[]>
): Promise<OpsCoverageSummary> {
  try {
    const groups = await loadGroups();
    if (!groups.length) return { count: 0, start: null, end: null, frequency: null };

    const preferredOrder = ['daily', 'weekly', 'monthly'];
    const ranked = [...groups].sort((a, b) => {
      const countDiff = (b._count?._all || 0) - (a._count?._all || 0);
      if (countDiff !== 0) return countDiff;
      return preferredOrder.indexOf(a.frequency) - preferredOrder.indexOf(b.frequency);
    });
    const best = ranked[0];
    return {
      count: best._count?._all || 0,
      start: best._min?.snapshotDate || null,
      end: best._max?.snapshotDate || null,
      frequency: best.frequency || null,
    };
  } catch (error) {
    console.warn(`Performance analytics: failed to summarize ${label} coverage`, error);
    return { count: 0, start: null, end: null, frequency: null };
  }
}

async function loadGoals(table: 'ExpenseGoal' | 'OperationalGoal', companyId: string) {
  try {
    return table === 'ExpenseGoal'
      ? await prisma.$queryRaw<Array<{ goals: any }>>`
          SELECT goals FROM "ExpenseGoal" WHERE "companyId" = ${companyId}
        `
      : await prisma.$queryRaw<Array<{ goals: any }>>`
          SELECT goals FROM "OperationalGoal" WHERE "companyId" = ${companyId}
        `;
  } catch (error) {
    console.warn(`Performance analytics: failed to load ${table}`, error);
    return [];
  }
}

async function safeFindMany<T>(label: string, query: Promise<T[]>): Promise<T[]> {
  try {
    return await query;
  } catch (error) {
    console.warn(`Performance analytics: failed to load ${label}`, error);
    return [];
  }
}

async function safeFindFirst<T>(label: string, query: Promise<T | null>): Promise<T | null> {
  try {
    return await query;
  } catch (error) {
    console.warn(`Performance analytics: failed to load ${label}`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const searchParams = request.nextUrl.searchParams;
    const companyId = searchParams.get('companyId') || '';
    const frequency = searchParams.get('frequency') || 'monthly';
    const monthsParam = searchParams.get('months');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 1000);

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('PerformanceAnalytics', companyId, 'READ');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const defaultRange = getDefaultDateRange(frequency);
    const months = Math.max(1, Math.min(parseInt(monthsParam || '24', 10), 60));
    const startDate = startDateParam
      ? new Date(startDateParam)
      : frequency === 'monthly'
        ? (() => {
            const custom = new Date();
            custom.setMonth(custom.getMonth() - months);
            return custom;
          })()
        : defaultRange.startDate;
    const endDate = endDateParam ? new Date(endDateParam) : defaultRange.endDate;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        accountingSystem: true,
        industrySector: true,
      },
    });
    const isQuickBooksCompany = ['QUICKBOOKS', 'QUICKBOOKS_DESKTOP', 'QUICKBOOKS_ENTERPRISE'].includes(
      String(company?.accountingSystem || '').trim().toUpperCase()
    );

    let industrySectorCategory: string | null = null;
    try {
      const sectorResult = await prisma.$queryRaw<Array<{ industrySectorCategory: string | null }>>`
        SELECT "industrySectorCategory" FROM "Company" WHERE id = ${companyId}
      `;
      industrySectorCategory = sectorResult[0]?.industrySectorCategory ?? null;
    } catch (error) {
      console.warn('Performance analytics: industrySectorCategory not available', error);
    }

    const industryGroupId = company?.industrySector ? String(company.industrySector) : null;
    const benchmarks = industryGroupId
      ? await safeFindMany(
          'industry benchmarks',
          prisma.industryBenchmark.findMany({
            where: { industryId: industryGroupId },
            select: { metricName: true, fiveYearValue: true, industryName: true, assetSizeCategory: true },
            take: 200,
          })
        )
      : [];

    // Prefer DailyFinancialSnapshot when the tenant has daily coverage in the
    // requested window (avoids the legacy MonthlyFinancial duplication issue
    // and shows the latest ingest immediately). Fall back to MonthlyFinancial
    // pinned to the latest FinancialRecord when DFS is empty.
    const dfsMonthly = isQuickBooksCompany ? null : await loadMonthlyFromDfs(companyId, startDate, endDate);

    const latestFinancialRecord = dfsMonthly
      ? null
      : await safeFindFirst(
          'latest financial record',
          prisma.financialRecord.findFirst({
            where: { companyId },
            select: { id: true },
            orderBy: { createdAt: 'desc' },
          }) as any
        );

    const monthlyFinancialWhere: any = {
      companyId,
      monthDate: { gte: startDate, lte: endDate },
    };
    if (latestFinancialRecord && (latestFinancialRecord as any).id) {
      monthlyFinancialWhere.financialRecordId = (latestFinancialRecord as any).id;
    }

    const [
      monthlyFinancialsRaw,
      cashSnapshots,
      arSnapshots,
      apSnapshots,
      customerSnapshots,
      productSnapshots,
      inventorySnapshots,
      cashCoverage,
      arCoverage,
      apCoverage,
      customerCoverage,
      productCoverage,
      inventoryCoverage,
    ] = await Promise.all([
      dfsMonthly
        ? Promise.resolve([])
        : safeFindMany(
            'monthly financials',
            prisma.monthlyFinancial.findMany({
              where: monthlyFinancialWhere,
              orderBy: { monthDate: 'asc' },
              take: limit,
            })
          ),
      // Sample rows for downstream consumers — include all snapshot frequencies
      // (Infor CSI tenants primarily write daily).
      safeFindMany(
        'cash snapshots',
        prisma.cashSnapshot.findMany({
          where: {
            companyId,
            frequency: { in: ['daily', 'weekly', 'monthly'] },
            snapshotDate: { gte: startDate, lte: endDate },
          },
          orderBy: { snapshotDate: 'asc' },
          take: limit,
        })
      ),
      safeFindMany(
        'ar snapshots',
        prisma.aRAgingSnapshot.findMany({
          where: {
            companyId,
            frequency: { in: ['daily', 'weekly', 'monthly'] },
            snapshotDate: { gte: startDate, lte: endDate },
          },
          orderBy: { snapshotDate: 'asc' },
          take: limit,
        })
      ),
      safeFindMany(
        'ap snapshots',
        prisma.aPAgingSnapshot.findMany({
          where: {
            companyId,
            frequency: { in: ['daily', 'weekly', 'monthly'] },
            snapshotDate: { gte: startDate, lte: endDate },
          },
          orderBy: { snapshotDate: 'asc' },
          take: limit,
        })
      ),
      safeFindMany(
        'customer snapshots',
        prisma.customerSalesSnapshot.findMany({
          where: {
            companyId,
            frequency: { in: ['daily', 'weekly', 'monthly'] },
            snapshotDate: { gte: startDate, lte: endDate },
          },
          orderBy: { snapshotDate: 'asc' },
          take: limit,
        })
      ),
      safeFindMany(
        'product snapshots',
        prisma.productSalesSnapshot.findMany({
          where: {
            companyId,
            frequency: { in: ['daily', 'weekly', 'monthly'] },
            snapshotDate: { gte: startDate, lte: endDate },
          },
          orderBy: { snapshotDate: 'asc' },
          take: limit,
        })
      ),
      safeFindMany(
        'inventory snapshots',
        prisma.inventorySnapshot.findMany({
          where: {
            companyId,
            frequency: { in: ['daily', 'weekly', 'monthly'] },
            snapshotDate: { gte: startDate, lte: endDate },
          },
          orderBy: { snapshotDate: 'asc' },
          take: limit,
        })
      ),
      summarizeOpsCoverage('cash', async () => {
        const groups = await prisma.cashSnapshot.groupBy({ by: ['frequency'], where: { companyId, frequency: { in: ['daily', 'weekly', 'monthly'] }, snapshotDate: { gte: startDate, lte: endDate } }, _count: { _all: true }, _min: { snapshotDate: true }, _max: { snapshotDate: true } });
        return groups as OpsCoverageGroup[];
      }),
      summarizeOpsCoverage('ar', async () => {
        const groups = await prisma.aRAgingSnapshot.groupBy({ by: ['frequency'], where: { companyId, frequency: { in: ['daily', 'weekly', 'monthly'] }, snapshotDate: { gte: startDate, lte: endDate } }, _count: { _all: true }, _min: { snapshotDate: true }, _max: { snapshotDate: true } });
        return groups as OpsCoverageGroup[];
      }),
      summarizeOpsCoverage('ap', async () => {
        const groups = await prisma.aPAgingSnapshot.groupBy({ by: ['frequency'], where: { companyId, frequency: { in: ['daily', 'weekly', 'monthly'] }, snapshotDate: { gte: startDate, lte: endDate } }, _count: { _all: true }, _min: { snapshotDate: true }, _max: { snapshotDate: true } });
        return groups as OpsCoverageGroup[];
      }),
      summarizeOpsCoverage('customers', async () => {
        const groups = await prisma.customerSalesSnapshot.groupBy({ by: ['frequency'], where: { companyId, frequency: { in: ['daily', 'weekly', 'monthly'] }, snapshotDate: { gte: startDate, lte: endDate } }, _count: { _all: true }, _min: { snapshotDate: true }, _max: { snapshotDate: true } });
        return groups as OpsCoverageGroup[];
      }),
      summarizeOpsCoverage('products', async () => {
        const groups = await prisma.productSalesSnapshot.groupBy({ by: ['frequency'], where: { companyId, frequency: { in: ['daily', 'weekly', 'monthly'] }, snapshotDate: { gte: startDate, lte: endDate } }, _count: { _all: true }, _min: { snapshotDate: true }, _max: { snapshotDate: true } });
        return groups as OpsCoverageGroup[];
      }),
      summarizeOpsCoverage('inventory', async () => {
        const groups = await prisma.inventorySnapshot.groupBy({ by: ['frequency'], where: { companyId, frequency: { in: ['daily', 'weekly', 'monthly'] }, snapshotDate: { gte: startDate, lte: endDate } }, _count: { _all: true }, _min: { snapshotDate: true }, _max: { snapshotDate: true } });
        return groups as OpsCoverageGroup[];
      }),
    ]);

    const [expenseGoals, operationalGoals] = await Promise.all([
      loadGoals('ExpenseGoal', companyId),
      loadGoals('OperationalGoal', companyId),
    ]);

    const opsProfile = getOpsMetricProfile(industrySectorCategory);

    const monthlyFinancials = dfsMonthly ? dfsMonthly.rows : monthlyFinancialsRaw;
    const trendSource: 'dfs' | 'monthly' = dfsMonthly ? 'dfs' : 'monthly';

    return NextResponse.json({
      company: {
        id: company?.id || companyId,
        name: company?.name || null,
        industryGroupId,
        industryGroupName: benchmarks[0]?.industryName || null,
        industrySectorCategory,
      },
      benchmarks: {
        count: benchmarks.length,
        items: benchmarks,
        sample: benchmarks.slice(0, 20),
      },
      goals: {
        expense: expenseGoals[0]?.goals || {},
        operational: operationalGoals[0]?.goals || {},
      },
      operationalProfile: opsProfile,
      meta: {
        trendSource,
        trendWindow: {
          start: startDate,
          end: endDate,
        },
        dfs: dfsMonthly
          ? {
              daysCovered: dfsMonthly.daysCovered,
              firstSnapshot: dfsMonthly.firstSnapshot,
              lastSnapshot: dfsMonthly.lastSnapshot,
            }
          : null,
        monthlyFinancialRecordId:
          latestFinancialRecord && (latestFinancialRecord as any).id
            ? (latestFinancialRecord as any).id
            : null,
      },
      ranges: {
        financials: summarizeRange(monthlyFinancials as any),
        cash: cashCoverage,
        ar: arCoverage,
        ap: apCoverage,
        customers: customerCoverage,
        products: productCoverage,
        inventory: inventoryCoverage,
      },
      data: {
        monthlyFinancials,
        cashSnapshots,
        arSnapshots,
        apSnapshots,
        customerSnapshots,
        productSnapshots,
        inventorySnapshots,
      },
    });
  } catch (error) {
    console.error('Performance analytics context error:', error);
    return NextResponse.json(
      { error: 'Failed to load performance analytics context', details: String(error) },
      { status: 500 }
    );
  }
}
