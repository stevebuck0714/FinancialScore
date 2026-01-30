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

function getLatest<T extends { snapshotDate?: Date; monthDate?: Date }>(records: T[]) {
  if (!records.length) return null;
  const sorted = [...records].sort((a, b) => {
    const aDate = a.snapshotDate ?? a.monthDate ?? new Date(0);
    const bDate = b.snapshotDate ?? b.monthDate ?? new Date(0);
    return aDate.getTime() - bDate.getTime();
  });
  return sorted[sorted.length - 1];
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
    if (lastSix.length >= 6) {
      const prior = lastSix.slice(0, 3);
      const recent = lastSix.slice(3, 6);

      const metrics = [
        { key: 'revenue', label: 'Revenue', value: (m: any) => m.revenue || 0 },
        { key: 'cogsTotal', label: 'COGS', value: (m: any) => m.cogsTotal || 0 },
        { key: 'expense', label: 'Operating Expense', value: (m: any) => m.expense || 0 },
      ];

      metrics.forEach((metric) => {
        const priorAvg = average(prior.map(metric.value));
        const recentAvg = average(recent.map(metric.value));
        const change = percentChange(recentAvg, priorAvg);
        if (Math.abs(change) >= 0.1) {
          findings.push({
            type: 'trend',
            metric: metric.label,
            severity: Math.abs(change) >= 0.2 ? 'high' : 'medium',
            confidence: Math.min(0.9, 0.5 + Math.abs(change)),
            payload: {
              title: `${metric.label} ${change > 0 ? 'up' : 'down'} ${formatPct(change)}`,
              summary: `${metric.label} shifted ${formatPct(change)} comparing the last 3 months to the prior 3.`,
              magnitude: change,
              onsetDate: recent[0]?.monthDate,
              persistence: recent.every((m) => (metric.value(m) - priorAvg) * (change > 0 ? 1 : -1) > 0)
                ? 'high'
                : 'medium',
            },
          });
        }
      });
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
