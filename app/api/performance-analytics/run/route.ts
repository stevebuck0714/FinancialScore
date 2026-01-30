import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { getOpsMetricProfile } from '@/lib/performance-analytics/ops-metric-profiles';

type FindingType = 'trend' | 'anomaly' | 'driver' | 'focus' | 'opportunity';
type FindingInput = {
  type: FindingType;
  metric?: string;
  severity?: string;
  confidence?: number;
  payload: Record<string, any>;
};

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

async function ensureTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PerformanceFinding" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "metric" TEXT,
      "severity" TEXT,
      "confidence" FLOAT,
      "payload" JSONB NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PerformanceFinding_companyId_idx" ON "PerformanceFinding"("companyId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PerformanceFinding_type_idx" ON "PerformanceFinding"("type")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PerformanceFinding_updatedAt_idx" ON "PerformanceFinding"("updatedAt")
  `);
}

async function safeFindMany<T>(label: string, query: Promise<T[]>): Promise<T[]> {
  try {
    return await query;
  } catch (error) {
    console.warn(`Performance analytics run: failed to load ${label}`, error);
    return [];
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
    console.warn(`Performance analytics run: failed to load ${table}`, error);
    return [];
  }
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentChange(current: number, prior: number) {
  const denom = Math.abs(prior) || 1;
  return (current - prior) / denom;
}

function zScore(value: number, values: number[]) {
  if (values.length < 3) return 0;
  const mean = average(values);
  const variance = average(values.map((v) => (v - mean) ** 2));
  const std = Math.sqrt(variance);
  if (!std) return 0;
  return (value - mean) / std;
}

function severityFromScore(score: number) {
  const abs = Math.abs(score);
  if (abs >= 3) return 'high';
  if (abs >= 2) return 'medium';
  return 'low';
}

function formatPct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function findBenchmark(benchmarks: Array<{ metricName: string; fiveYearValue: number | null }>, matcher: RegExp) {
  const match = benchmarks.find((b) => matcher.test(b.metricName || ''));
  return match?.fiveYearValue ?? null;
}

function daysInPeriod(recent: any[], prior: any[]) {
  const recentDays = recent.length * 30;
  const priorDays = prior.length * 30;
  return { recentDays, priorDays };
}

function getLatest<T extends { snapshotDate?: Date; monthDate?: Date }>(records: T[]) {
  if (!records.length) return null;
  const sorted = [...records].sort((a, b) => {
    const aDate = a.snapshotDate ?? a.monthDate ?? new Date(0);
    const bDate = b.snapshotDate ?? b.monthDate ?? new Date(0);
    return aDate.getTime() - bDate.getTime();
  });
  return sorted[sorted.length - 1];
}

function aggregateBreakdown(rows: any[], key: string) {
  const totals: Record<string, number> = {};
  rows.forEach((row) => {
    const breakdown = row?.[key];
    if (breakdown && typeof breakdown === 'object') {
      Object.entries(breakdown).forEach(([name, value]) => {
        const num = typeof value === 'number' ? value : parseFloat(String(value));
        if (!Number.isFinite(num)) return;
        totals[name] = (totals[name] || 0) + num;
      });
    }
  });
  return totals;
}

function summarizeBreakdown(prior: any[], recent: any[], key: string, totalDelta: number) {
  const priorTotals = aggregateBreakdown(prior, key);
  const recentTotals = aggregateBreakdown(recent, key);
  const contributions = Object.keys({ ...priorTotals, ...recentTotals })
    .map((name) => ({
      name,
      delta: (recentTotals[name] || 0) - (priorTotals[name] || 0),
    }))
    .filter((item) => item.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const top = contributions.slice(0, 3).map((item) => {
    const share = totalDelta !== 0 ? Math.abs(item.delta / totalDelta) : 0;
    return `${item.name} (${item.delta >= 0 ? '+' : '-'}$${Math.abs(item.delta).toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}, ${Math.round(share * 100)}%)`;
  });

  return top;
}

function findBreakdownSpike(prior: any[], recent: any[], key: string) {
  const priorTotals = aggregateBreakdown(prior, key);
  const recentTotals = aggregateBreakdown(recent, key);
  const priorMonths = Math.max(prior.length, 1);
  const recentMonths = Math.max(recent.length, 1);

  const spikes = Object.keys({ ...priorTotals, ...recentTotals })
    .map((name) => {
      const priorAvg = (priorTotals[name] || 0) / priorMonths;
      const recentAvg = (recentTotals[name] || 0) / recentMonths;
      const delta = recentAvg - priorAvg;
      const ratio = priorAvg > 0 ? recentAvg / priorAvg : null;
      return { name, priorAvg, recentAvg, delta, ratio };
    })
    .filter((item) => item.delta > 1000 && item.ratio != null && item.ratio >= 1.5)
    .sort((a, b) => b.delta - a.delta);

  return spikes[0] || null;
}

function summarizeContributors(
  recent: any[],
  prior: any[],
  fields: Array<{ key: string; label: string }>,
  totalDelta: number
) {
  const contributions = fields
    .map((field) => {
      const priorAvg = average(prior.map((m: any) => m[field.key] || 0));
      const recentAvg = average(recent.map((m: any) => m[field.key] || 0));
      const delta = recentAvg - priorAvg;
      return { ...field, delta };
    })
    .filter((item) => item.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const top = contributions.slice(0, 3);
  const formatted = top.map((item) => {
    const share = totalDelta !== 0 ? Math.abs(item.delta / totalDelta) : 0;
    return `${item.label} (${item.delta >= 0 ? '+' : '-'}$${Math.abs(item.delta).toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}, ${Math.round(share * 100)}%)`;
  });

  return { contributions, top, formatted };
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const frequency = body?.frequency || 'monthly';
    const replace = body?.replace !== false;

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const hasAccess = await validateCompanyAccess(companyId);
    if (!hasAccess) {
      await auditForbiddenAccess('PerformanceAnalyticsRun', companyId, 'WRITE');
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    await ensureTable();

    if (replace) {
      await prisma.$executeRawUnsafe(`DELETE FROM "PerformanceFinding" WHERE "companyId" = $1`, companyId);
    }

    const defaultRange = getDefaultDateRange(frequency);
    const startDate = body?.startDate ? new Date(body.startDate) : defaultRange.startDate;
    const endDate = body?.endDate ? new Date(body.endDate) : defaultRange.endDate;

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
      console.warn('Performance analytics run: industrySectorCategory not available', error);
    }

    const industryGroupId = company?.industrySector ? String(company.industrySector) : null;
    const benchmarks = industryGroupId
      ? await safeFindMany(
          'industry benchmarks',
          prisma.industryBenchmark.findMany({
            where: { industryId: industryGroupId },
            select: { metricName: true, fiveYearValue: true },
            take: 200,
          })
        )
      : [];

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
          where: { companyId, monthDate: { gte: startDate, lte: endDate } },
          orderBy: { monthDate: 'asc' },
          take: 200,
        })
      ),
      safeFindMany(
        'cash snapshots',
        prisma.cashSnapshot.findMany({
          where: { companyId, frequency, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'asc' },
          take: 200,
        })
      ),
      safeFindMany(
        'ar snapshots',
        prisma.aRAgingSnapshot.findMany({
          where: { companyId, frequency, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'asc' },
          take: 200,
        })
      ),
      safeFindMany(
        'ap snapshots',
        prisma.aPAgingSnapshot.findMany({
          where: { companyId, frequency, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'asc' },
          take: 200,
        })
      ),
      safeFindMany(
        'customer snapshots',
        prisma.customerSalesSnapshot.findMany({
          where: { companyId, frequency, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'asc' },
          take: 200,
        })
      ),
      safeFindMany(
        'product snapshots',
        prisma.productSalesSnapshot.findMany({
          where: { companyId, frequency, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'asc' },
          take: 200,
        })
      ),
      safeFindMany(
        'inventory snapshots',
        prisma.inventorySnapshot.findMany({
          where: { companyId, frequency, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'asc' },
          take: 200,
        })
      ),
    ]);

    const [expenseGoals, operationalGoals] = await Promise.all([
      loadGoals('ExpenseGoal', companyId),
      loadGoals('OperationalGoal', companyId),
    ]);

    const loans = await safeFindMany(
      'loans',
      prisma.loan.findMany({
        where: { companyId },
        include: {
          covenants: {
            where: { isApplicable: true },
          },
        },
      })
    );

    const opsProfile = getOpsMetricProfile(industrySectorCategory);

    const findings: FindingInput[] = [];

    const recentRevenue = monthlyFinancials.slice(-3).reduce((sum: number, m: any) => sum + (m.revenue || 0), 0);
    const priorRevenue = monthlyFinancials.slice(-6, -3).reduce((sum: number, m: any) => sum + (m.revenue || 0), 0);
    const revenueDelta = recentRevenue - priorRevenue;

    const recentAR = arSnapshots.slice(-3).reduce((sum: number, r: any) => sum + (r.totalAR || 0), 0);
    const priorAR = arSnapshots.slice(-6, -3).reduce((sum: number, r: any) => sum + (r.totalAR || 0), 0);
    const arDelta = recentAR - priorAR;

    const recentCash = cashSnapshots.slice(-3).reduce((sum: number, r: any) => sum + (r.cashBalance || 0), 0);
    const priorCash = cashSnapshots.slice(-6, -3).reduce((sum: number, r: any) => sum + (r.cashBalance || 0), 0);
    const cashDelta = recentCash - priorCash;

    // Trend & Change-Point Agent (simple 3 vs 3 rolling check)
    const lastSix = monthlyFinancials.slice(-6);
    const revenueBaseline = (() => {
      if (lastSix.length >= 6) {
        const prior = lastSix.slice(0, 3);
        const recent = lastSix.slice(3, 6);
        const priorAvg = average(prior.map((m: any) => m.revenue || 0));
        const recentAvg = average(recent.map((m: any) => m.revenue || 0));
        return { priorAvg, recentAvg };
      }
      return { priorAvg: 0, recentAvg: 0 };
    })();
    if (lastSix.length >= 6) {
      const prior = lastSix.slice(0, 3);
      const recent = lastSix.slice(3, 6);
      const { recentDays, priorDays } = daysInPeriod(recent, prior);
      const revenuePriorAvg = revenueBaseline.priorAvg;
      const revenueRecentAvg = revenueBaseline.recentAvg;
      const revenueChange = percentChange(revenueRecentAvg, revenuePriorAvg);

      const metrics = [
        { key: 'revenue', label: 'Revenue', value: (m: any) => m.revenue || 0 },
        { key: 'cogsTotal', label: 'COGS', value: (m: any) => m.cogsTotal || 0 },
        { key: 'expense', label: 'Operating Expense', value: (m: any) => m.expense || 0 },
        { key: 'ar', label: 'Total AR', value: (m: any) => m.ar || 0 },
        { key: 'ap', label: 'Total AP', value: (m: any) => m.ap || 0 },
        { key: 'inventory', label: 'Inventory', value: (m: any) => m.inventory || 0 },
        { key: 'ltd', label: 'Long-term Debt', value: (m: any) => m.ltd || 0 },
        { key: 'totalLiab', label: 'Total Liabilities', value: (m: any) => m.totalLiab || 0 },
      ];

      metrics.forEach((metric) => {
        const priorAvg = average(prior.map(metric.value));
        const recentAvg = average(recent.map(metric.value));
        const change = percentChange(recentAvg, priorAvg);
        if (Math.abs(change) >= 0.1) {
          const inventoryPrior = average(prior.map((m: any) => m.inventory || 0));
          const inventoryRecent = average(recent.map((m: any) => m.inventory || 0));
          const inventoryDelta = inventoryRecent - inventoryPrior;

          let driverSummary = '';
          if (metric.label === 'COGS') {
            const cogsFields = [
              { key: 'cogsPayroll', label: 'COGS Payroll' },
              { key: 'cogsOwnerPay', label: 'COGS Owner Pay' },
              { key: 'cogsContractors', label: 'COGS Contractors' },
              { key: 'cogsMaterials', label: 'COGS Materials' },
              { key: 'cogsCommissions', label: 'COGS Commissions' },
              { key: 'cogsOther', label: 'COGS Other' },
            ];
            const { formatted } = summarizeContributors(recent, prior, cogsFields, recentAvg - priorAvg);
            const breakdownDrivers = summarizeBreakdown(prior, recent, 'cogsBreakdown', recentAvg - priorAvg);
            if (breakdownDrivers.length) {
              driverSummary = `Primary drivers (account-level): ${breakdownDrivers.join(', ')}.`;
            } else if (formatted.length) {
              driverSummary = `Primary drivers: ${formatted.join(', ')}.`;
            }
            if (inventoryDelta > 0 && change < 0) {
              driverSummary += ' Inventory rose while COGS fell, suggesting potential stock build or timing effects.';
            } else if (inventoryDelta < 0 && change < 0) {
              driverSummary += ' Inventory fell alongside lower COGS, indicating reduced consumption or volume.';
            }
          }
          if (metric.label === 'Revenue') {
            const breakdownDrivers = summarizeBreakdown(prior, recent, 'revenueBreakdown', recentAvg - priorAvg);
            if (breakdownDrivers.length) {
              driverSummary = `Primary drivers (mix): ${breakdownDrivers.join(', ')}.`;
            }
            const priorBreakdown = aggregateBreakdown(prior, 'revenueBreakdown');
            const recentBreakdown = aggregateBreakdown(recent, 'revenueBreakdown');
            const totalPrior = Object.values(priorBreakdown).reduce((sum, v) => sum + v, 0);
            const totalRecent = Object.values(recentBreakdown).reduce((sum, v) => sum + v, 0);
            const topPrior = Object.entries(priorBreakdown).sort((a, b) => b[1] - a[1])[0];
            const topRecent = Object.entries(recentBreakdown).sort((a, b) => b[1] - a[1])[0];
            if (topPrior && topRecent && topPrior[0] !== topRecent[0]) {
              const priorShare = totalPrior ? topPrior[1] / totalPrior : 0;
              const recentShare = totalRecent ? topRecent[1] / totalRecent : 0;
              driverSummary += ` Mix shift: ${topPrior[0]} → ${topRecent[0]} (share ${formatPct(priorShare)} → ${formatPct(recentShare)}).`;
            }
          }
          if (metric.label === 'Operating Expense') {
            const expenseFields = [
              { key: 'payroll', label: 'Payroll' },
              { key: 'benefits', label: 'Benefits' },
              { key: 'insurance', label: 'Insurance' },
              { key: 'professionalFees', label: 'Professional Fees' },
              { key: 'subcontractors', label: 'Subcontractors' },
              { key: 'rent', label: 'Rent' },
              { key: 'taxLicense', label: 'Tax & License' },
              { key: 'phoneComm', label: 'Phone & Communication' },
              { key: 'infrastructure', label: 'Infrastructure/Utilities' },
              { key: 'autoTravel', label: 'Auto & Travel' },
              { key: 'salesExpense', label: 'Sales & Marketing' },
              { key: 'marketing', label: 'Marketing' },
              { key: 'trainingCert', label: 'Training & Certification' },
              { key: 'mealsEntertainment', label: 'Meals & Entertainment' },
              { key: 'interestExpense', label: 'Interest Expense' },
              { key: 'depreciationAmortization', label: 'Depreciation & Amortization' },
              { key: 'otherExpense', label: 'Other Expense' },
            ];
            const { formatted } = summarizeContributors(recent, prior, expenseFields, recentAvg - priorAvg);
            const breakdownDrivers = summarizeBreakdown(prior, recent, 'expenseBreakdown', recentAvg - priorAvg);
            if (breakdownDrivers.length) {
              driverSummary = `Primary drivers (account-level): ${breakdownDrivers.join(', ')}.`;
            } else if (formatted.length) {
              driverSummary = `Primary drivers: ${formatted.join(', ')}.`;
            }
            const spike = findBreakdownSpike(prior, recent, 'expenseBreakdown');
            if (spike) {
              driverSummary += ` Possible one-time spike in ${spike.name} (avg ${Math.round(spike.priorAvg)} → ${Math.round(spike.recentAvg)}).`;
            }
          }
          if (metric.label === 'Total AR') {
            const cashPrior = average(prior.map((m: any) => m.cash || 0));
            const cashRecent = average(recent.map((m: any) => m.cash || 0));
            const cashDelta = cashRecent - cashPrior;
            if (change > 0 && revenueChange <= 0) {
              driverSummary = 'AR rose while revenue slowed, suggesting slower collections.';
            } else if (change > 0 && revenueChange > 0) {
              driverSummary = 'AR rose alongside revenue growth; monitor collection speed.';
            }
            if (cashDelta < 0) {
              driverSummary += ' Cash also declined, increasing collection risk.';
            }
          }
          if (metric.label === 'Total AP') {
            const cashPrior = average(prior.map((m: any) => m.cash || 0));
            const cashRecent = average(recent.map((m: any) => m.cash || 0));
            const cashDelta = cashRecent - cashPrior;
            if (change > 0 && cashDelta < 0) {
              driverSummary = 'AP rose while cash declined, suggesting payment delays or liquidity pressure.';
            }
          }
          if (metric.label === 'Long-term Debt') {
            const cashPrior = average(prior.map((m: any) => m.cash || 0));
            const cashRecent = average(recent.map((m: any) => m.cash || 0));
            const cashDelta = cashRecent - cashPrior;
            driverSummary = 'Debt levels shifted materially; review financing events or amortization changes.';
            if (cashDelta > 0 && change > 0) {
              driverSummary += ' Cash increased alongside debt, indicating recent financing.';
            }
          }
          if (metric.label === 'Inventory') {
            if (change > 0 && revenueChange <= 0) {
              driverSummary = 'Inventory rose while revenue slowed, indicating potential overstock or demand softening.';
            } else if (change > 0 && revenueChange > 0) {
              driverSummary = 'Inventory rose alongside revenue growth; verify turns and replenishment timing.';
            } else if (change < 0 && revenueChange > 0) {
              driverSummary = 'Inventory fell while revenue increased, suggesting improved turns or stock drawdown.';
            }
            if (change < 0 && inventoryDelta < 0 && revenueChange <= 0) {
              driverSummary += ' Monitor for stockouts or deferred purchasing.';
            }
          }

          const revenueContext =
            metric.label !== 'Revenue'
              ? `Revenue moved ${formatPct(revenueChange)} over the same period.`
              : '';

          const deltaAbs = Math.abs(recentAvg - priorAvg);
          const materialityThreshold = ['Revenue', 'COGS', 'Operating Expense'].includes(metric.label)
            ? Math.max(0.01 * revenueRecentAvg, 10000)
            : Math.max(0.02 * revenueRecentAvg, 20000);
          const material = deltaAbs >= materialityThreshold;
          const attributionLow = !driverSummary;
          const changePoint = Math.abs(change) >= 0.1;
          const persistenceLevel = recent.every((m) => (metric.value(m) - priorAvg) * (change > 0 ? 1 : -1) > 0)
            ? 'high'
            : 'medium';
          const investigate = material || attributionLow || (changePoint && persistenceLevel === 'high');

          findings.push({
            type: 'trend',
            metric: metric.label,
            severity: Math.abs(change) >= 0.2 ? 'high' : 'medium',
            confidence: Math.min(0.9, 0.5 + Math.abs(change)),
            payload: {
              title: `${metric.label} ${change > 0 ? 'up' : 'down'} ${formatPct(change)}`,
              summary: `${metric.label} shifted ${formatPct(change)} comparing the last 3 months to the prior 3. ${revenueContext} ${driverSummary}`.trim(),
              magnitude: change,
              onsetDate: recent[0]?.monthDate,
              persistence: persistenceLevel,
              materiality: deltaAbs,
              materialityThreshold,
              attributionConfidence: attributionLow ? 'low' : 'medium',
              changePoint,
              boardBucket: investigate ? 'investigate' : 'monitor',
            },
          });
        }
      });

      const ocfPrior = average(
        prior.map((m: any) => (m.revenue || 0) - (m.cogsTotal || 0) - (m.expense || 0) + (m.depreciationAmortization || 0))
      );
      const ocfRecent = average(
        recent.map((m: any) => (m.revenue || 0) - (m.cogsTotal || 0) - (m.expense || 0) + (m.depreciationAmortization || 0))
      );
      const ocfChange = percentChange(ocfRecent, ocfPrior);
      if (Math.abs(ocfChange) >= 0.1) {
        findings.push({
          type: 'trend',
          metric: 'Operating Cash Flow',
          severity: Math.abs(ocfChange) >= 0.2 ? 'high' : 'medium',
          confidence: Math.min(0.9, 0.5 + Math.abs(ocfChange)),
          payload: {
            title: `Operating Cash Flow ${ocfChange > 0 ? 'up' : 'down'} ${formatPct(ocfChange)}`,
            summary: `Operating cash flow shifted ${formatPct(ocfChange)} vs the prior 3 months. Compare with revenue and working capital changes for drivers.`,
            magnitude: ocfChange,
            onsetDate: recent[0]?.monthDate,
            persistence: 'medium',
          },
        });
      }

      const arPrior = average(prior.map((m: any) => m.ar || 0));
      const arRecent = average(recent.map((m: any) => m.ar || 0));
      const apPrior = average(prior.map((m: any) => m.ap || 0));
      const apRecent = average(recent.map((m: any) => m.ap || 0));
      const invPrior = average(prior.map((m: any) => m.inventory || 0));
      const invRecent = average(recent.map((m: any) => m.inventory || 0));
      const wcPrior = (arPrior + invPrior) - apPrior;
      const wcRecent = (arRecent + invRecent) - apRecent;
      const wcDelta = wcRecent - wcPrior;
      const wcChange = percentChange(wcRecent, wcPrior);

      if (Math.abs(wcChange) >= 0.1) {
        const dsoPrior = revenuePriorAvg ? (arPrior / revenuePriorAvg) * (priorDays / 3) : 0;
        const dsoRecent = revenueRecentAvg ? (arRecent / revenueRecentAvg) * (recentDays / 3) : 0;
        const dpoPrior = revenuePriorAvg ? (apPrior / revenuePriorAvg) * (priorDays / 3) : 0;
        const dpoRecent = revenueRecentAvg ? (apRecent / revenueRecentAvg) * (recentDays / 3) : 0;
        const dioPrior = revenuePriorAvg ? (invPrior / revenuePriorAvg) * (priorDays / 3) : 0;
        const dioRecent = revenueRecentAvg ? (invRecent / revenueRecentAvg) * (recentDays / 3) : 0;
        const cccPrior = dsoPrior + dioPrior - dpoPrior;
        const cccRecent = dsoRecent + dioRecent - dpoRecent;
        const cccDelta = cccRecent - cccPrior;

        findings.push({
          type: 'trend',
          metric: 'Working Capital',
          severity: Math.abs(wcChange) >= 0.2 ? 'high' : 'medium',
          confidence: Math.min(0.9, 0.5 + Math.abs(wcChange)),
          payload: {
            title: `Working Capital ${wcChange > 0 ? 'up' : 'down'} ${formatPct(wcChange)}`,
            summary: `Working capital ${wcChange > 0 ? 'increased' : 'decreased'} by $${Math.abs(wcDelta).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}. Cash conversion cycle changed ${cccDelta > 0 ? '+' : ''}${cccDelta.toFixed(1)} days.`,
            drivers: {
              dso: { prior: dsoPrior, recent: dsoRecent, delta: dsoRecent - dsoPrior },
              dio: { prior: dioPrior, recent: dioRecent, delta: dioRecent - dioPrior },
              dpo: { prior: dpoPrior, recent: dpoRecent, delta: dpoRecent - dpoPrior },
            },
          },
        });
      }
    }

    // Anomaly & Exception Agent (z-score on last values)
    const latestCash = getLatest(cashSnapshots);
    if (latestCash && cashSnapshots.length >= 6) {
      const values = cashSnapshots.map((r: any) => r.cashBalance || 0);
      const score = zScore(latestCash.cashBalance || 0, values);
      if (Math.abs(score) >= 2) {
        const likelyCause =
          cashDelta < 0 && arDelta > 0
            ? 'Cash is down while receivables are rising, which often signals slower collections.'
            : cashDelta < 0
              ? 'Cash is down without a matching AR increase; investigate expense spikes or timing issues.'
              : 'Cash is up sharply; confirm one-time inflows or timing effects.';
        findings.push({
          type: 'anomaly',
          metric: 'Cash Balance',
          severity: severityFromScore(score),
          confidence: Math.min(0.9, 0.5 + Math.abs(score) / 4),
          payload: {
            title: `Cash balance ${score > 0 ? 'spike' : 'drop'}`,
            summary: `Latest cash balance deviates by ${score.toFixed(1)}σ from recent history.`,
            likelyCause,
            nextSteps: [
              'Review large payments or transfers in the period.',
              'Check AR collections and aging trends.',
              'Confirm any one-time inflows or timing effects.',
            ],
            zScore: score,
            latest: latestCash.cashBalance,
          },
        });
      }
    }

    const latestAR = getLatest(arSnapshots);
    if (latestAR && arSnapshots.length >= 6) {
      const values = arSnapshots.map((r: any) => r.totalAR || 0);
      const score = zScore(latestAR.totalAR || 0, values);
      if (Math.abs(score) >= 2) {
        const likelyCause =
          arDelta > 0 && revenueDelta <= 0
            ? 'Receivables grew while revenue slowed, indicating slower payment behavior.'
            : arDelta > 0
              ? 'Receivables rose alongside revenue growth; monitor collection speed.'
              : 'Receivables declined sharply; confirm payment timing or write-offs.';
        findings.push({
          type: 'anomaly',
          metric: 'Total AR',
          severity: severityFromScore(score),
          confidence: Math.min(0.9, 0.5 + Math.abs(score) / 4),
          payload: {
            title: `AR balance ${score > 0 ? 'spike' : 'drop'}`,
            summary: `Total AR deviates by ${score.toFixed(1)}σ from recent history.`,
            likelyCause,
            nextSteps: [
              'Identify top customers with aging over 60 days.',
              'Compare recent billing volume to collections.',
              'Check for payment term changes or disputes.',
            ],
            zScore: score,
            latest: latestAR.totalAR,
          },
        });
      }
    }

    if (arSnapshots.length >= 6 && lastSix.length >= 6) {
      const arPrior = arSnapshots.slice(-6, -3);
      const arRecent = arSnapshots.slice(-3);
      const priorTotal = average(arPrior.map((r: any) => r.totalAR || 0));
      const recentTotal = average(arRecent.map((r: any) => r.totalAR || 0));
      const priorOver60 = average(
        arPrior.map((r: any) => (r.days31to60 || 0) + (r.days61to90 || 0) + (r.days90plus || 0))
      );
      const recentOver60 = average(
        arRecent.map((r: any) => (r.days31to60 || 0) + (r.days61to90 || 0) + (r.days90plus || 0))
      );
      const priorPct = priorTotal ? priorOver60 / priorTotal : 0;
      const recentPct = recentTotal ? recentOver60 / recentTotal : 0;
      const pctDelta = recentPct - priorPct;

      const dsoPrior = revenueBaseline.priorAvg ? (priorTotal / revenueBaseline.priorAvg) * 30 : 0;
      const dsoRecent = revenueBaseline.recentAvg ? (recentTotal / revenueBaseline.recentAvg) * 30 : 0;
      const dsoDelta = dsoRecent - dsoPrior;

      if (pctDelta >= 0.03 || dsoDelta >= 5) {
        findings.push({
          type: 'anomaly',
          metric: 'AR Aging',
          severity: 'medium',
          confidence: 0.7,
          payload: {
            title: 'AR aging deterioration',
            summary: `AR >60 days increased ${(pctDelta * 100).toFixed(1)} pts; DSO up ${dsoDelta.toFixed(1)} days.`,
            boardBucket: 'investigate',
            nextSteps: [
              'Review top overdue customers and payment terms.',
              'Confirm any billing or dispute delays.',
              'Assess collections capacity for recent volume.',
            ],
          },
        });
      }
    }

    if (cashSnapshots.length >= 2) {
      const recentCashSnap = cashSnapshots[cashSnapshots.length - 1] as any;
      const cashChange =
        recentCashSnap.changeAmount != null
          ? Number(recentCashSnap.changeAmount)
          : (recentCashSnap.cashBalance || 0) - (cashSnapshots[cashSnapshots.length - 2]?.cashBalance || 0);
      const cashOutflows = cashSnapshots
        .map((r: any) => Number(r.changeAmount || 0))
        .filter((val) => val < 0)
        .map((val) => Math.abs(val));
      const avgOutflow = cashOutflows.length ? average(cashOutflows) : 0;
      const swingThreshold = Math.max(0.03 * avgOutflow, 25000);
      if (Math.abs(cashChange) >= swingThreshold) {
        findings.push({
          type: 'anomaly',
          metric: 'Cash Swing',
          severity: 'medium',
          confidence: 0.6,
          payload: {
            title: 'Cash swing exceeds threshold',
            summary: `Weekly cash swing of $${Math.abs(cashChange).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })} exceeds threshold of $${Math.round(swingThreshold).toLocaleString()}.`,
            boardBucket: 'investigate',
          },
        });
      }
    }

    if (loans.length) {
      const covenantFindings = loans.flatMap((loan: any) =>
        (loan.covenants || [])
          .filter((c: any) => {
            const status = String(c.status || '').toUpperCase();
            return status === 'WARNING' || status === 'BREACHED' || status === 'CRITICAL';
          })
          .map((c: any) => ({
            loan,
            covenant: c,
          }))
      );

      const covenantBuffers = loans.flatMap((loan: any) =>
        (loan.covenants || [])
          .filter((c: any) => c.isApplicable && c.threshold != null && c.currentValue != null)
          .map((c: any) => {
            const threshold = Number(c.threshold);
            const current = Number(c.currentValue);
            let bufferPct: number | null = null;
            if (c.covenantType === 'MINIMUM') {
              bufferPct = threshold !== 0 ? (current - threshold) / Math.abs(threshold) : null;
            } else if (c.covenantType === 'MAXIMUM') {
              bufferPct = threshold !== 0 ? (threshold - current) / Math.abs(threshold) : null;
            }
            return {
              loan,
              covenant: c,
              bufferPct,
            };
          })
      );

      covenantFindings.forEach(({ loan, covenant }) => {
        const status = String(covenant.status || '').toUpperCase();
        const severity = status === 'BREACHED' || status === 'CRITICAL' ? 'high' : 'medium';
        let bufferNote = '';
        if (covenant.threshold != null && covenant.currentValue != null) {
          const threshold = Number(covenant.threshold);
          const current = Number(covenant.currentValue);
          if (covenant.covenantType === 'MINIMUM') {
            const buffer = threshold !== 0 ? (current - threshold) / Math.abs(threshold) : null;
            if (buffer != null) bufferNote = ` Buffer: ${(buffer * 100).toFixed(1)}% above minimum.`;
          }
          if (covenant.covenantType === 'MAXIMUM') {
            const buffer = threshold !== 0 ? (threshold - current) / Math.abs(threshold) : null;
            if (buffer != null) bufferNote = ` Buffer: ${(buffer * 100).toFixed(1)}% below maximum.`;
          }
        }
        findings.push({
          type: 'anomaly',
          metric: `Covenant: ${covenant.covenantName}`,
          severity,
          confidence: 0.8,
          payload: {
            title: `${covenant.covenantName} ${status === 'BREACHED' || status === 'CRITICAL' ? 'breach' : 'warning'}`,
            summary: `Loan ${loan.loanName} (${loan.lenderName}) is ${status.toLowerCase()} for ${covenant.covenantName}.${bufferNote} Trend history not available.`,
            currentValue: covenant.currentValue,
            threshold: covenant.threshold,
            covenantType: covenant.covenantType,
            status,
            loanName: loan.loanName,
            lenderName: loan.lenderName,
            updatedAt: covenant.updatedAt,
            nextSteps: [
              'Review covenant calculations and inputs.',
              'Confirm lender reporting timeline.',
              'Assess remediation options or waiver needs.',
            ],
          },
        });
      });

      if (!covenantFindings.length) {
        const atRisk = covenantBuffers
          .filter((entry) => entry.bufferPct != null && entry.bufferPct <= 0.1)
          .sort((a, b) => (a.bufferPct ?? 0) - (b.bufferPct ?? 0));
        if (atRisk.length) {
          const topRisk = atRisk[0];
          findings.push({
            type: 'anomaly',
            metric: `Covenant: ${topRisk.covenant.covenantName}`,
            severity: 'medium',
            confidence: 0.7,
            payload: {
              title: `${topRisk.covenant.covenantName} at-risk`,
              summary: `Loan ${topRisk.loan.loanName} (${topRisk.loan.lenderName}) is within ${(topRisk.bufferPct! * 100).toFixed(1)}% of the threshold.`,
              currentValue: topRisk.covenant.currentValue,
              threshold: topRisk.covenant.threshold,
              covenantType: topRisk.covenant.covenantType,
              status: topRisk.covenant.status,
              loanName: topRisk.loan.loanName,
              lenderName: topRisk.loan.lenderName,
              updatedAt: topRisk.covenant.updatedAt,
              nextSteps: [
                'Monitor ratio trend more frequently.',
                'Prepare a mitigation plan if trend continues.',
              ],
            },
          });
        }
        findings.push({
          type: 'focus',
          metric: 'Covenant Compliance',
          severity: 'low',
          confidence: 0.6,
          payload: {
            title: 'No covenant breaches detected',
            summary: 'All applicable covenants are currently compliant.',
            loanCount: loans.length,
          },
        });
      }
    }

    // Driver Attribution Agent (revenue vs cogs vs expense contribution)
    if (lastSix.length >= 6) {
      const prior = lastSix.slice(0, 3);
      const recent = lastSix.slice(3, 6);
      const priorRevenue = average(prior.map((m: any) => m.revenue || 0));
      const recentRevenue = average(recent.map((m: any) => m.revenue || 0));
      const priorCogs = average(prior.map((m: any) => m.cogsTotal || 0));
      const recentCogs = average(recent.map((m: any) => m.cogsTotal || 0));
      const priorExpense = average(prior.map((m: any) => m.expense || 0));
      const recentExpense = average(recent.map((m: any) => m.expense || 0));

      const drivers = [
        { name: 'Revenue', impact: recentRevenue - priorRevenue },
        { name: 'COGS', impact: -(recentCogs - priorCogs) },
        { name: 'Operating Expense', impact: -(recentExpense - priorExpense) },
      ].sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

      findings.push({
        type: 'driver',
        metric: 'Net Income',
        severity: 'medium',
        confidence: 0.6,
        payload: {
          title: 'Top drivers of recent change',
          summary: `Largest impacts came from ${drivers[0]?.name}, ${drivers[1]?.name}, ${drivers[2]?.name}.`,
          drivers: drivers.map((d) => ({
            name: d.name,
            impact: d.impact,
          })),
        },
      });
    }

    // Peer & Plan Context Agent (simple focus score)
    const latestFinancial = getLatest(monthlyFinancials);
    if (latestFinancial && (latestFinancial.revenue || 0) > 0) {
      const revenue = latestFinancial.revenue || 0;
      const grossMargin = revenue ? (revenue - (latestFinancial.cogsTotal || 0)) / revenue : 0;
      const grossMarginBenchmark = findBenchmark(benchmarks, /gross\s*margin/i);
      const deviationPeers =
        grossMarginBenchmark != null ? (grossMargin - grossMarginBenchmark) / Math.abs(grossMarginBenchmark || 1) : 0;
      const deviationPlan = 0;
      const trendAcceleration = 0.05;
      const materiality = Math.min(1, revenue / 1_000_000);
      const confidence = monthlyFinancials.length >= 6 ? 0.8 : 0.5;

      const focusScore =
        materiality * 30 +
        Math.abs(deviationPlan) * 25 +
        Math.abs(deviationPeers) * 20 +
        trendAcceleration * 15 +
        confidence * 10;

      findings.push({
        type: 'focus',
        metric: 'Gross Margin',
        severity: focusScore >= 60 ? 'high' : focusScore >= 40 ? 'medium' : 'low',
        confidence,
        payload: {
          title: 'Focus score update',
          summary: `Focus score ${focusScore.toFixed(1)} based on materiality and peer deviation.`,
          focusScore,
          deviationPeers,
          benchmark: grossMarginBenchmark,
        },
      });
    }

    // Opportunity Agent (basic heuristic)
    if (latestFinancial && monthlyFinancials.length >= 6) {
      const recent = monthlyFinancials.slice(-3);
      const prior = monthlyFinancials.slice(-6, -3);
      const growth = percentChange(average(recent.map((m: any) => m.revenue || 0)), average(prior.map((m: any) => m.revenue || 0)));
      const revenue = latestFinancial.revenue || 0;
      const grossMargin = revenue ? (revenue - (latestFinancial.cogsTotal || 0)) / revenue : 0;
      const grossMarginBenchmark = findBenchmark(benchmarks, /gross\s*margin/i);
      if (growth > 0.05 && (grossMarginBenchmark == null || grossMargin > grossMarginBenchmark)) {
        findings.push({
          type: 'opportunity',
          metric: 'Growth Capacity',
          severity: 'medium',
          confidence: 0.6,
          payload: {
            title: 'Scale efficient growth',
            summary: 'Revenue is accelerating while margin is at/above peer benchmarks.',
            expectedImpact: 'Sustain growth without margin erosion.',
            prerequisites: ['Validate capacity', 'Confirm working capital headroom'],
            risks: 'Over-expansion could pressure service levels or working capital.',
          },
        });
      }
    }

    if (!findings.some((finding) => finding.type === 'opportunity')) {
      findings.push({
        type: 'opportunity',
        metric: 'Opportunity Scan',
        severity: 'low',
        confidence: 0.3,
        payload: {
          title: 'No qualified opportunities detected',
          summary: 'Current signals do not meet opportunity thresholds (growth + margin + capacity).',
          expectedImpact: 'Establish baseline opportunities once signals strengthen.',
          prerequisites: ['Confirm growth trend stability', 'Verify margin vs peers', 'Assess liquidity headroom'],
          risks: 'Pursuing initiatives without signal confirmation could dilute focus.',
        },
      });
    }

    if (!findings.length) {
      findings.push({
        type: 'trend',
        metric: 'Baseline',
        severity: 'low',
        confidence: 0.4,
        payload: {
          title: 'No material findings detected',
          summary: 'Current data does not show significant shifts or anomalies.',
        },
      });
    }

    if (!findings.some((finding) => finding.type === 'anomaly')) {
      const coverage = [
        { label: 'cash', count: cashSnapshots.length },
        { label: 'AR', count: arSnapshots.length },
        { label: 'AP', count: apSnapshots.length },
        { label: 'customers', count: customerSnapshots.length },
        { label: 'products', count: productSnapshots.length },
        { label: 'inventory', count: inventorySnapshots.length },
      ];
      const coverageSummary = coverage.map((item) => `${item.label}: ${item.count}`).join(', ');
      findings.push({
        type: 'anomaly',
        metric: 'Anomaly Scan',
        severity: 'low',
        confidence: 0.3,
        payload: {
          title: 'No anomaly signals detected',
          summary: `No anomalies were flagged in the current window. Coverage: ${coverageSummary}.`,
          likelyCause: 'Current patterns are within expected ranges.',
          nextSteps: [
            'Confirm data freshness and frequency.',
            'Expand the window if seasonality is expected.',
            'Monitor for emerging changes over the next cycle.',
          ],
        },
      });
    }

    const now = new Date().toISOString();
    for (const finding of findings) {
      const id = `pf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "PerformanceFinding" ("id", "companyId", "type", "metric", "severity", "confidence", "payload", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::timestamp, $9::timestamp)`,
        id,
        companyId,
        finding.type,
        finding.metric || null,
        finding.severity || null,
        typeof finding.confidence === 'number' ? finding.confidence : null,
        JSON.stringify(finding.payload),
        now,
        now
      );
    }

    return NextResponse.json({
      success: true,
      inserted: findings.length,
      opsProfile,
      goals: {
        expense: expenseGoals[0]?.goals || {},
        operational: operationalGoals[0]?.goals || {},
      },
    });
  } catch (error) {
    console.error('Performance analytics run error:', error);
    return NextResponse.json(
      { error: 'Failed to run performance analytics agents', details: String(error) },
      { status: 500 }
    );
  }
}
