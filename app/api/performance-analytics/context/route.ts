import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { getOpsMetricProfile } from '@/lib/performance-analytics/ops-metric-profiles';

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
        industrySector: true,
      },
    });

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

    const monthlyFinancialWhere: any = {
      companyId,
      monthDate: { gte: startDate, lte: endDate },
    };

    const [
      monthlyFinancials,
      cashSnapshots,
      arSnapshots,
      apSnapshots,
      customerSnapshots,
      productSnapshots,
      inventorySnapshots,
    ] = await Promise.all([
      safeFindMany(
        'monthly financials',
        prisma.monthlyFinancial.findMany({
          where: monthlyFinancialWhere,
          orderBy: { monthDate: 'asc' },
          take: limit,
        })
      ),
      safeFindMany(
        'cash snapshots',
        prisma.cashSnapshot.findMany({
          where: { companyId, frequency, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'asc' },
          take: limit,
        })
      ),
      safeFindMany(
        'ar snapshots',
        prisma.aRAgingSnapshot.findMany({
          where: { companyId, frequency, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'asc' },
          take: limit,
        })
      ),
      safeFindMany(
        'ap snapshots',
        prisma.aPAgingSnapshot.findMany({
          where: { companyId, frequency, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'asc' },
          take: limit,
        })
      ),
      safeFindMany(
        'customer snapshots',
        prisma.customerSalesSnapshot.findMany({
          where: { companyId, frequency, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'asc' },
          take: limit,
        })
      ),
      safeFindMany(
        'product snapshots',
        prisma.productSalesSnapshot.findMany({
          where: { companyId, frequency, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'asc' },
          take: limit,
        })
      ),
      safeFindMany(
        'inventory snapshots',
        prisma.inventorySnapshot.findMany({
          where: { companyId, frequency, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'asc' },
          take: limit,
        })
      ),
    ]);

    const [expenseGoals, operationalGoals] = await Promise.all([
      loadGoals('ExpenseGoal', companyId),
      loadGoals('OperationalGoal', companyId),
    ]);

    const opsProfile = getOpsMetricProfile(industrySectorCategory);

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
      ranges: {
        financials: summarizeRange(monthlyFinancials),
        cash: summarizeRange(cashSnapshots),
        ar: summarizeRange(arSnapshots),
        ap: summarizeRange(apSnapshots),
        customers: summarizeRange(customerSnapshots),
        products: summarizeRange(productSnapshots),
        inventory: summarizeRange(inventorySnapshots),
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
