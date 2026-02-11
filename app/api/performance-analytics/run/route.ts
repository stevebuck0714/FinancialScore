import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { getOpsMetricProfile } from '@/lib/performance-analytics/ops-metric-profiles';
import {
  getSectorPlaybook,
  getFocusBucketForMetric,
  isHighSeverityTrigger,
  matchRecommendationTheme,
  themeObjectiveToRun,
  themeOwnerToRun,
} from '@/lib/performance-analytics/sector-playbooks';
import { getFieldDisplayName } from '@/lib/constants/field-display-names';

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

async function ensureCovenantThresholdColumns() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Covenant"
      ADD COLUMN IF NOT EXISTS "warningThreshold" DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS "breachThreshold" DOUBLE PRECISION
  `);
}

async function loadCovenantDebugMeta(companyId: string) {
  const meta: Record<string, any> = {};
  try {
    const rows = await prisma.$queryRaw<Array<{ count: any }>>`
      SELECT COUNT(*)::int AS count FROM "Loan" WHERE "companyId" = ${companyId}
    `;
    meta.companyLoanCount = rows[0]?.count ?? null;
  } catch (error) {
    meta.companyLoanCountError = String(error);
  }
  try {
    const rows = await prisma.$queryRaw<Array<{ count: any }>>`
      SELECT COUNT(*)::int AS count FROM "Covenant"
    `;
    meta.covenantTotalCount = rows[0]?.count ?? null;
  } catch (error) {
    meta.covenantTotalCountError = String(error);
  }
  try {
    const rows = await prisma.$queryRaw<Array<{ count: any }>>`
      SELECT COUNT(*)::int AS count
      FROM "Covenant" c
      JOIN "Loan" l ON l."id" = c."loanId"
      WHERE l."companyId" = ${companyId}
    `;
    meta.companyCovenantCount = rows[0]?.count ?? null;
  } catch (error) {
    meta.companyCovenantCountError = String(error);
  }
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; loanName: string | null; lenderName: string | null }>>`
      SELECT "id", "loanName", "lenderName" FROM "Loan" WHERE "companyId" = ${companyId}
    `;
    meta.companyLoans = rows;
  } catch (error) {
    meta.companyLoansError = String(error);
  }
  return meta;
}

async function loadCovenants(companyId: string) {
  try {
    try {
      await ensureCovenantThresholdColumns();
      const rows = await prisma.$queryRaw<Array<any>>`
        SELECT
          c."id" as "covenantId",
          c."covenantName",
          c."covenantType",
          c."threshold",
          c."warningThreshold",
          c."breachThreshold",
          c."currentValue",
          c."status",
          c."isApplicable",
          c."description",
          c."updatedAt",
          l."id" as "loanId",
          l."loanName",
          l."lenderName"
        FROM "Covenant" c
        JOIN "Loan" l ON l."id" = c."loanId"
        WHERE l."companyId" = ${companyId}
      `;
      return rows.map((row) => ({
        ...row,
        statusValue: row.status,
        applicableValue: row.isApplicable,
      }));
    } catch (error) {
      console.warn('Performance analytics run: threshold/current columns unavailable', error);
      try {
        const rows = await prisma.$queryRaw<Array<any>>`
          SELECT
            c."id" as "covenantId",
            c."covenantName",
            c."covenantType",
            c."threshold",
            c."warningThreshold",
            c."breachThreshold",
            c."status",
            c."isApplicable",
            c."description",
            c."updatedAt",
            l."id" as "loanId",
            l."loanName",
            l."lenderName"
          FROM "Covenant" c
          JOIN "Loan" l ON l."id" = c."loanId"
          WHERE l."companyId" = ${companyId}
        `;
        return rows.map((row) => ({
          ...row,
          currentValue: null,
          statusValue: row.status,
          applicableValue: row.isApplicable,
        }));
      } catch (innerError) {
        console.warn('Performance analytics run: currentValue column unavailable', innerError);
        try {
          const rows = await prisma.$queryRaw<Array<any>>`
            SELECT
              c."id" as "covenantId",
              c."covenantName",
              c."covenantType",
              c."threshold",
              c."warningThreshold",
              c."breachThreshold",
              c."alertLevel" as "status",
              c."applicable" as "isApplicable",
              c."notes" as "description",
              c."updatedAt",
              l."id" as "loanId",
              l."loanName",
              l."lenderName"
            FROM "Covenant" c
            JOIN "Loan" l ON l."id" = c."loanId"
            WHERE l."companyId" = ${companyId}
          `;
          return rows.map((row) => ({
            ...row,
            currentValue: null,
            statusValue: row.status,
            applicableValue: row.isApplicable,
          }));
        } catch (statusError) {
          console.warn('Performance analytics run: status column unavailable', statusError);
        }
      }
    }
  } catch (error) {
    console.warn('Performance analytics run: fallback covenant query used', error);
    const rows = await prisma.$queryRaw<Array<any>>`
      SELECT
        c."id" as "covenantId",
        c."covenantName",
        c."covenantType",
        c."threshold",
        c."alertLevel" as "status",
        c."applicable" as "isApplicable",
        c."notes" as "description",
        c."updatedAt",
        l."id" as "loanId",
        l."loanName",
        l."lenderName"
      FROM "Covenant" c
      JOIN "Loan" l ON l."id" = c."loanId"
      WHERE l."companyId" = ${companyId}
    `;
    return rows.map((row) => ({
      ...row,
      currentValue: null,
      statusValue: row.status,
      applicableValue: row.isApplicable,
    }));
  }

  const rows = await prisma.$queryRaw<Array<any>>`
    SELECT
      c."id" as "covenantId",
      c."covenantName",
      c."covenantType",
      c."threshold",
      c."status",
      c."isApplicable",
      c."description",
      c."updatedAt",
      l."id" as "loanId",
      l."loanName",
      l."lenderName"
    FROM "Covenant" c
    JOIN "Loan" l ON l."id" = c."loanId"
    WHERE l."companyId" = ${companyId}
  `;
  return rows.map((row) => ({
    ...row,
    warningThreshold: null,
    breachThreshold: null,
    currentValue: null,
    statusValue: row.status,
    applicableValue: row.isApplicable,
  }));
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

function formatDays(value: number | null) {
  if (value == null || Number.isNaN(value)) return 'N/A';
  return `${Math.round(value)} days`;
}

function findBenchmark(benchmarks: Array<{ metricName: string; fiveYearValue: number | null }>, matcher: RegExp) {
  const match = benchmarks.find((b) => matcher.test(b.metricName || ''));
  return match?.fiveYearValue ?? null;
}

function scoreOpportunity(params: {
  revenue: number;
  impactLow: number | null;
  impactHigh: number | null;
  confidence: number;
  feasibility: number;
  timeToImpactDays: number;
}) {
  const { revenue, impactLow, impactHigh, confidence, feasibility, timeToImpactDays } = params;
  const impactMid = impactLow != null && impactHigh != null ? (impactLow + impactHigh) / 2 : null;
  const baseline = Math.max(50_000, revenue * 0.02);
  const impactScore = impactMid != null ? Math.min(1, impactMid / baseline) : 0.3;
  const timePenalty = timeToImpactDays <= 30 ? 1 : timeToImpactDays <= 90 ? 1.2 : 1.5;
  const score = (impactScore * confidence * feasibility) / timePenalty;
  return { score, impactScore, timePenalty };
}

function timeLabel(runRateDays: number) {
  if (runRateDays <= 30) return '0–30 days';
  if (runRateDays <= 90) return '30–90 days';
  return '90–180+ days';
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

function summarizeBreakdown(
  prior: any[],
  recent: any[],
  key: string,
  totalDelta: number,
  allowlist?: Set<string>
) {
  const priorTotals = aggregateBreakdown(prior, key);
  const recentTotals = aggregateBreakdown(recent, key);
  const contributions = Object.keys({ ...priorTotals, ...recentTotals })
    .filter((name) => (allowlist ? allowlist.has(name) : true))
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

function findBreakdownSpike(prior: any[], recent: any[], key: string, allowlist?: Set<string>) {
  const priorTotals = aggregateBreakdown(prior, key);
  const recentTotals = aggregateBreakdown(recent, key);
  const priorMonths = Math.max(prior.length, 1);
  const recentMonths = Math.max(recent.length, 1);

  const spikes = Object.keys({ ...priorTotals, ...recentTotals })
    .filter((name) => (allowlist ? allowlist.has(name) : true))
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

function formatMonthRange(rows: any[]) {
  if (!rows.length) return 'the latest period';
  const start = rows[0]?.monthDate ? new Date(rows[0].monthDate) : null;
  const end = rows[rows.length - 1]?.monthDate ? new Date(rows[rows.length - 1].monthDate) : null;
  if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) return 'the latest period';
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  return `${fmt(start)} to ${fmt(end)}`;
}

function normalizeCovenantStatus(value: string) {
  const normalized = String(value || '').toUpperCase();
  if (!normalized) return '';
  if (normalized.includes('BREACH') || normalized.includes('DEFAULT') || normalized.includes('VIOLATION')) {
    return 'BREACHED';
  }
  if (normalized.includes('CRITICAL')) return 'CRITICAL';
  if (normalized.includes('WARN')) return 'WARNING';
  if (normalized.includes('WAIVE') || normalized.includes('NOT_APPLICABLE')) return 'COMPLIANT';
  return normalized;
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const frequency = body?.frequency || 'monthly';
    const replace = body?.replace !== false;
    const includeCovenantDebug = Boolean(body?.includeCovenantDebug);
    const debugLoanName = body?.debugLoanName ? String(body.debugLoanName).trim().toLowerCase() : '';

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
    const operationalGoalValues = operationalGoals[0]?.goals || {};

    const accountMappings = await safeFindMany(
      'account mappings',
      prisma.accountMapping.findMany({
        where: { companyId },
        select: { qbAccount: true },
      })
    );
    const mappedAccounts = new Set(accountMappings.map((m: any) => String(m.qbAccount)));

    const covenantRows = await loadCovenants(companyId);

    const opsProfile = getOpsMetricProfile(industrySectorCategory);
    const playbook = getSectorPlaybook(industrySectorCategory);

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
              { key: 'cogsPayroll', label: getFieldDisplayName('cogsPayroll') },
              { key: 'cogsOwnerPay', label: getFieldDisplayName('cogsOwnerPay') },
              { key: 'cogsContractors', label: getFieldDisplayName('cogsContractors') },
              { key: 'cogsMaterials', label: getFieldDisplayName('cogsMaterials') },
              { key: 'cogsCommissions', label: getFieldDisplayName('cogsCommissions') },
              { key: 'cogsOther', label: getFieldDisplayName('cogsOther') },
            ];
            const { formatted } = summarizeContributors(recent, prior, cogsFields, recentAvg - priorAvg);
            if (formatted.length) {
              driverSummary = `Primary drivers: ${formatted.join(', ')}.`;
            }
            if (inventoryDelta > 0 && change < 0) {
              driverSummary += ' Inventory rose while COGS fell, suggesting potential stock build or timing effects.';
            } else if (inventoryDelta < 0 && change < 0) {
              driverSummary += ' Inventory fell alongside lower COGS, indicating reduced consumption or volume.';
            }
          }
          if (metric.label === 'Revenue') {
            driverSummary = '';
          }
          if (metric.label === 'Operating Expense') {
            const expenseFields = [
              { key: 'payroll', label: getFieldDisplayName('payroll') },
              { key: 'ownerBasePay', label: getFieldDisplayName('ownerBasePay') },
              { key: 'ownersRetirement', label: getFieldDisplayName('ownersRetirement') },
              { key: 'benefits', label: getFieldDisplayName('benefits') },
              { key: 'insurance', label: getFieldDisplayName('insurance') },
              { key: 'professionalFees', label: getFieldDisplayName('professionalFees') },
              { key: 'subcontractors', label: getFieldDisplayName('subcontractors') },
              { key: 'rent', label: getFieldDisplayName('rent') },
              { key: 'taxLicense', label: getFieldDisplayName('taxLicense') },
              { key: 'phoneComm', label: getFieldDisplayName('phoneComm') },
              { key: 'infrastructure', label: getFieldDisplayName('infrastructure') },
              { key: 'autoTravel', label: getFieldDisplayName('autoTravel') },
              { key: 'salesExpense', label: getFieldDisplayName('salesExpense') },
              { key: 'marketing', label: getFieldDisplayName('marketing') },
              { key: 'trainingCert', label: getFieldDisplayName('trainingCert') },
              { key: 'mealsEntertainment', label: getFieldDisplayName('mealsEntertainment') },
              { key: 'interestExpense', label: getFieldDisplayName('interestExpense') },
              { key: 'depreciationAmortization', label: getFieldDisplayName('depreciationAmortization') },
              { key: 'otherExpense', label: getFieldDisplayName('otherExpense') },
            ];
            const { formatted } = summarizeContributors(recent, prior, expenseFields, recentAvg - priorAvg);
            if (formatted.length) {
              driverSummary = `Primary drivers: ${formatted.join(', ')}.`;
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

      const ocfPrior = average(
        prior.map((m: any) => (m.revenue || 0) - (m.cogsTotal || 0) - (m.expense || 0) + (m.depreciationAmortization || 0))
      );
      const ocfRecent = average(
        recent.map((m: any) => (m.revenue || 0) - (m.cogsTotal || 0) - (m.expense || 0) + (m.depreciationAmortization || 0))
      );
      const ocfChange = percentChange(ocfRecent, ocfPrior);
      if (Math.abs(ocfChange) >= 0.1) {
        const revDelta = average(recent.map((m: any) => m.revenue || 0)) - average(prior.map((m: any) => m.revenue || 0));
        const cogsDelta = average(recent.map((m: any) => m.cogsTotal || 0)) - average(prior.map((m: any) => m.cogsTotal || 0));
        const expenseDelta = average(recent.map((m: any) => m.expense || 0)) - average(prior.map((m: any) => m.expense || 0));
        const daDelta =
          average(recent.map((m: any) => m.depreciationAmortization || 0)) -
          average(prior.map((m: any) => m.depreciationAmortization || 0));
        const ocfDrivers = [
          { name: 'Revenue', impact: revDelta },
          { name: 'COGS', impact: -cogsDelta },
          { name: 'Operating Expense', impact: -expenseDelta },
          { name: 'Depreciation & Amortization', impact: daDelta },
        ]
          .filter((entry) => entry.impact !== 0)
          .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
          .slice(0, 3)
          .map((entry) => {
            const formatted = `$${Math.abs(entry.impact).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            return `${entry.name} ${entry.impact >= 0 ? '+' : '-'}${formatted}`;
          });

        const wcDrivers = [
          { name: 'AR', impact: -(arRecent - arPrior) },
          { name: 'Inventory', impact: -(invRecent - invPrior) },
          { name: 'AP', impact: apRecent - apPrior },
        ]
          .filter((entry) => entry.impact !== 0)
          .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
          .slice(0, 2)
          .map((entry) => {
            const formatted = `$${Math.abs(entry.impact).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            return `${entry.name} ${entry.impact >= 0 ? '+' : '-'}${formatted}`;
          });
        const wcSummary = wcDelta
          ? ` Working capital ${wcDelta > 0 ? 'absorbed' : 'released'} $${Math.abs(wcDelta).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}${wcDrivers.length ? `, driven by ${wcDrivers.join(', ')}` : ''}.`
          : '';

        findings.push({
          type: 'trend',
          metric: 'Operating Cash Flow',
          severity: Math.abs(ocfChange) >= 0.2 ? 'high' : 'medium',
          confidence: Math.min(0.9, 0.5 + Math.abs(ocfChange)),
          payload: {
            title: `Operating Cash Flow ${ocfChange > 0 ? 'up' : 'down'} ${formatPct(ocfChange)}`,
            summary: `Operating cash flow shifted ${formatPct(ocfChange)} vs the prior 3 months.${ocfDrivers.length ? ` Primary drivers: ${ocfDrivers.join(', ')}.` : ''}${wcSummary}`,
            magnitude: ocfChange,
            onsetDate: recent[0]?.monthDate,
            persistence: 'medium',
          },
        });
      }

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
      const configuredThreshold = Number(operationalGoalValues.cash_swing_threshold);
      const swingThreshold = Number.isFinite(configuredThreshold) && configuredThreshold > 0
        ? configuredThreshold
        : Math.max(0.03 * avgOutflow, 25000);
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

    // COA-level anomaly: z-score on material line items from monthly financials (sector hints prioritize order)
    const COA_ANOMALY_BASE: Array<{ key: string; label: string }> = [
      { key: 'revenue', label: 'Revenue' },
      { key: 'cogsTotal', label: 'COGS Total' },
      { key: 'expense', label: 'Operating Expense' },
      { key: 'payroll', label: 'Payroll' },
      { key: 'marketing', label: 'Marketing' },
      { key: 'rent', label: 'Rent' },
      { key: 'professionalFees', label: 'Professional Fees' },
      { key: 'cogsPayroll', label: 'COGS Payroll' },
      { key: 'cogsMaterials', label: 'COGS Materials' },
      { key: 'subcontractors', label: 'Subcontractors' },
      { key: 'depreciationAmortization', label: 'Depreciation & Amortization' },
      { key: 'infrastructure', label: 'Infrastructure' },
      { key: 'interestExpense', label: 'Interest Expense' },
      { key: 'inventory', label: 'Inventory' },
      { key: 'otherExpense', label: 'Other Expense' },
    ];
    const hintSet = new Set(playbook.coaCategoryHints || []);
    const COA_ANOMALY_FIELDS =
      hintSet.size > 0
        ? [
            ...(playbook.coaCategoryHints || [])
              .filter((key) => COA_ANOMALY_BASE.some((f) => f.key === key))
              .map((key) => COA_ANOMALY_BASE.find((f) => f.key === key)!),
            ...COA_ANOMALY_BASE.filter((f) => !hintSet.has(f.key)),
          ]
        : COA_ANOMALY_BASE;
    if (monthlyFinancials.length >= 6) {
      const sortedMonthly = [...(monthlyFinancials as any[])].sort(
        (a, b) => new Date(a.monthDate).getTime() - new Date(b.monthDate).getTime()
      );
      for (const { key, label } of COA_ANOMALY_FIELDS) {
        const values = sortedMonthly.map((m: any) => (m[key] != null ? Number(m[key]) : 0));
        const latest = values.length ? values[values.length - 1] : 0;
        const score = zScore(latest, values);
        if (Math.abs(score) >= 2 && values.some((v: number) => v !== 0)) {
          findings.push({
            type: 'anomaly',
            metric: label,
            severity: severityFromScore(score),
            confidence: Math.min(0.85, 0.5 + Math.abs(score) / 4),
            payload: {
              title: `${label} ${score > 0 ? 'spike' : 'drop'}`,
              summary: `Latest ${label} deviates by ${score.toFixed(1)}σ from recent ${values.length}-month history.`,
              likelyCause: score > 0
                ? 'Unusual increase; confirm one-time items, timing, or volume change.'
                : 'Unusual decrease; confirm timing, reclass, or true decline.',
              nextSteps: [
                'Compare to prior period and budget if available.',
                'Check for reclasses or one-time items.',
                'Confirm data load and mapping for this line.',
              ],
              zScore: score,
              latest,
              coaField: key,
            },
          });
        }
      }
    }

    if (covenantRows.length) {
      const covenantAlerts = new Map<string, { loan: any; covenant: any; status: string; bufferPct: number | null }>();

      covenantRows.forEach((row: any) => {
        const applicable = row.applicableValue ?? true;
        if (!applicable) return;
        const status = normalizeCovenantStatus(String(row.statusValue || ''));
        const threshold = Number(row.threshold);
        const warningThresholdRaw = row.warningThreshold != null ? Number(row.warningThreshold) : null;
        const breachThresholdRaw = row.breachThreshold != null ? Number(row.breachThreshold) : null;
        const breachThreshold = Number.isFinite(breachThresholdRaw ?? NaN) ? breachThresholdRaw : threshold;
        const warningThreshold = Number.isFinite(warningThresholdRaw ?? NaN)
          ? warningThresholdRaw
          : Number.isFinite(threshold)
            ? (row.covenantType === 'MAXIMUM' ? threshold * 0.9 : threshold * 1.1)
            : null;
        const current = Number(row.currentValue);
        let bufferPct: number | null = null;
        if (Number.isFinite(threshold) && Number.isFinite(current)) {
          if (row.covenantType === 'MINIMUM') {
            bufferPct = threshold !== 0 ? (current - threshold) / Math.abs(threshold) : null;
          } else if (row.covenantType === 'MAXIMUM') {
            bufferPct = threshold !== 0 ? (threshold - current) / Math.abs(threshold) : null;
          }
        }

        let derivedStatus = status;
        if (!derivedStatus || derivedStatus === 'COMPLIANT') {
          if (Number.isFinite(current) && Number.isFinite(breachThreshold)) {
            if (row.covenantType === 'MAXIMUM') {
              if (current > breachThreshold) derivedStatus = 'BREACHED';
              else if (warningThreshold != null && current > warningThreshold) derivedStatus = 'WARNING';
            } else {
              if (current < breachThreshold) derivedStatus = 'BREACHED';
              else if (warningThreshold != null && current < warningThreshold) derivedStatus = 'WARNING';
            }
          } else if (bufferPct != null) {
            if (bufferPct <= 0) derivedStatus = 'BREACHED';
            else if (bufferPct <= 0.1) derivedStatus = 'WARNING';
          }
        }

        if (derivedStatus === 'WARNING' || derivedStatus === 'BREACHED' || derivedStatus === 'BREACH' || derivedStatus === 'CRITICAL') {
          covenantAlerts.set(row.covenantId, {
            loan: { loanName: row.loanName, lenderName: row.lenderName },
            covenant: {
              covenantName: row.covenantName,
              covenantType: row.covenantType,
              currentValue: row.currentValue,
              threshold: row.threshold,
              updatedAt: row.updatedAt,
            },
            status: derivedStatus === 'BREACH' ? 'BREACHED' : derivedStatus,
            bufferPct,
          });
        }
      });

      const covenantFindings = Array.from(covenantAlerts.values());

      covenantFindings.forEach(({ loan, covenant, status, bufferPct }) => {
        const severity = status === 'BREACHED' || status === 'CRITICAL' ? 'high' : 'medium';
        let bufferNote = '';
        if (bufferPct != null) {
          if (covenant.covenantType === 'MINIMUM') {
            bufferNote = ` Buffer: ${(bufferPct * 100).toFixed(1)}% above minimum.`;
          }
          if (covenant.covenantType === 'MAXIMUM') {
            bufferNote = ` Buffer: ${(bufferPct * 100).toFixed(1)}% below maximum.`;
          }
        }
        findings.push({
          type: 'anomaly',
          metric: `Covenant: ${covenant.covenantName}`,
          severity,
          confidence: 0.8,
          payload: {
            title: `${loan.loanName} • ${covenant.covenantName} ${status === 'BREACHED' || status === 'CRITICAL' ? 'breach' : 'warning'}`,
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
        const statusCounts = covenantRows.reduce((acc: Record<string, number>, row: any) => {
          const applicable = row.applicableValue ?? true;
          if (!applicable) return acc;
          const key = normalizeCovenantStatus(String(row.statusValue || '')) || 'UNKNOWN';
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});
        findings.push({
          type: 'focus',
          metric: 'Covenant Compliance',
          severity: 'low',
          confidence: 0.6,
          payload: {
            title: 'No covenant breaches detected',
            summary: 'All applicable covenants are currently compliant.',
            loanCount: new Set(covenantRows.map((row: any) => row.loanId)).size,
            statusCounts,
          },
        });
      }
    }

    // Driver Attribution Agent (revenue vs cogs vs expense contribution)
    if (lastSix.length >= 6) {
      const prior = lastSix.slice(0, 3);
      const recent = lastSix.slice(3, 6);
      const periodLabel = formatMonthRange(recent);
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

      const accountFields = [
        { key: 'cogsPayroll', source: 'COGS' },
        { key: 'cogsOwnerPay', source: 'COGS' },
        { key: 'cogsContractors', source: 'COGS' },
        { key: 'cogsMaterials', source: 'COGS' },
        { key: 'cogsCommissions', source: 'COGS' },
        { key: 'cogsOther', source: 'COGS' },
        { key: 'payroll', source: 'Operating Expense' },
        { key: 'ownerBasePay', source: 'Operating Expense' },
        { key: 'ownersRetirement', source: 'Operating Expense' },
        { key: 'benefits', source: 'Operating Expense' },
        { key: 'insurance', source: 'Operating Expense' },
        { key: 'professionalFees', source: 'Operating Expense' },
        { key: 'subcontractors', source: 'Operating Expense' },
        { key: 'rent', source: 'Operating Expense' },
        { key: 'taxLicense', source: 'Operating Expense' },
        { key: 'phoneComm', source: 'Operating Expense' },
        { key: 'infrastructure', source: 'Operating Expense' },
        { key: 'autoTravel', source: 'Operating Expense' },
        { key: 'salesExpense', source: 'Operating Expense' },
        { key: 'marketing', source: 'Operating Expense' },
        { key: 'trainingCert', source: 'Operating Expense' },
        { key: 'mealsEntertainment', source: 'Operating Expense' },
        { key: 'interestExpense', source: 'Operating Expense' },
        { key: 'depreciationAmortization', source: 'Operating Expense' },
        { key: 'otherExpense', source: 'Operating Expense' },
      ];

      const accountDrivers = accountFields
        .map((field) => {
          const priorAvg = average(prior.map((m: any) => m[field.key] || 0));
          const recentAvg = average(recent.map((m: any) => m[field.key] || 0));
          const delta = recentAvg - priorAvg;
          const impact = field.source === 'COGS' || field.source === 'Operating Expense' ? -delta : delta;
          return {
            name: getFieldDisplayName(field.key),
            impact,
            source: field.source,
          };
        })
        .filter((entry) => entry.impact !== 0)
        .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
        .slice(0, 3)
        .map((entry) => {
          const formatted = `$${Math.abs(entry.impact).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
          return `${entry.name} (${entry.impact >= 0 ? '+' : '-'}${formatted}, ${entry.source})`;
        });

      findings.push({
        type: 'driver',
        metric: 'Net Income',
        severity: 'medium',
        confidence: 0.6,
        payload: {
          title: 'Top drivers of recent change',
          summary: accountDrivers.length
            ? `Primary account-level drivers for ${periodLabel}: ${accountDrivers.join(', ')}.`
            : `Largest impacts for ${periodLabel} came from ${drivers[0]?.name}, ${drivers[1]?.name}, ${drivers[2]?.name}.`,
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
          summary: `Focus score ${focusScore.toFixed(1)} (0–100) combines revenue materiality, peer deviation, recent trend acceleration, and data confidence. Higher scores mean a bigger, more actionable gap to prioritize.`,
          focusScore,
          focusScoreComponents: {
            materiality: Number((materiality * 30).toFixed(1)),
            deviationPlan: Number((Math.abs(deviationPlan) * 25).toFixed(1)),
            deviationPeers: Number((Math.abs(deviationPeers) * 20).toFixed(1)),
            trendAcceleration: Number((trendAcceleration * 15).toFixed(1)),
            confidence: Number((confidence * 10).toFixed(1)),
          },
          deviationPeers,
          benchmark: grossMarginBenchmark,
        },
      });
    }

    // Opportunity Agent (signal-driven hypotheses)
    if (latestFinancial && monthlyFinancials.length >= 6) {
      const recent = monthlyFinancials.slice(-3);
      const prior = monthlyFinancials.slice(-6, -3);
      const revenue = latestFinancial.revenue || 0;
      const cogs = latestFinancial.cogsTotal || 0;
      const ar = latestFinancial.ar || 0;
      const ap = latestFinancial.ap || 0;
      const inventory = (latestFinancial as any).inventory || 0;

      const growth = percentChange(average(recent.map((m: any) => m.revenue || 0)), average(prior.map((m: any) => m.revenue || 0)));
      const grossMargin = revenue ? (revenue - cogs) / revenue : 0;
      const grossMarginBenchmark = findBenchmark(benchmarks, /gross\s*margin/i);
      const dso = revenue > 0 ? (ar / revenue) * 365 : null;
      const dio = cogs > 0 ? (inventory / cogs) * 365 : null;
      const dpo = cogs > 0 ? (ap / cogs) * 365 : null;
      const dsoBenchmark = findBenchmark(benchmarks, /days\s*(receivables|sales\s*outstanding|dso)/i);
      const dioBenchmark = findBenchmark(benchmarks, /days\s*inventory/i);
      const dpoBenchmark = findBenchmark(benchmarks, /days\s*payables/i);

      // Next 3–5 Actions: verb + object + data reference + owner + due date per task
      type NextActionTask = { description: string; owner?: string; dueHorizon: string; dataReference?: string };
      type MonitoringSpec = { primaryKpi: string; leadingIndicators: string[]; timeWindowDays: number; stopContinueRule: string };

      const makeOpportunity = (input: {
        title: string;
        family: string;
        objective: 'Growth' | 'Margin' | 'Cash' | 'Risk';
        why: string[];
        impactLow: number | null;
        impactHigh: number | null;
        impactUnit: 'EBITDA' | 'Cash' | 'Revenue';
        timeToSignalDays: number;
        timeToRunRateDays: number;
        dependencies: string[];
        peerEvidence: string;
        tests: string[];
        guardrails: string[];
        owner: 'Sales' | 'Ops' | 'Finance' | 'Marketing';
        nextAction: string;
        confidence: number;
        feasibility: number;
        metric: string;
        nextActions?: NextActionTask[];
        monitoring?: MonitoringSpec;
      }) => {
        const scoring = scoreOpportunity({
          revenue,
          impactLow: input.impactLow,
          impactHigh: input.impactHigh,
          confidence: input.confidence,
          feasibility: input.feasibility,
          timeToImpactDays: input.timeToRunRateDays,
        });
        const severity = scoring.score >= 0.55 ? 'high' : scoring.score >= 0.35 ? 'medium' : 'low';
        findings.push({
          type: 'opportunity',
          metric: input.metric,
          severity,
          confidence: input.confidence,
          payload: {
            title: input.title,
            type: input.family,
            objective: input.objective,
            why: input.why,
            impact: {
              unit: input.impactUnit,
              low: input.impactLow,
              high: input.impactHigh,
              basis: 'Baseline × lever size × expected lift',
            },
            timeToImpact: {
              signalDays: input.timeToSignalDays,
              runRateDays: input.timeToRunRateDays,
              label: timeLabel(input.timeToRunRateDays),
            },
            dependencies: input.dependencies,
            peerEvidence: input.peerEvidence,
            validationTests: input.tests,
            guardrails: input.guardrails,
            owner: input.owner,
            status: 'Discover',
            nextAction: input.nextAction,
            nextActions: input.nextActions ?? [],
            monitoring: input.monitoring ?? null,
            score: {
              value: Number(scoring.score.toFixed(2)),
              impact: Number(scoring.impactScore.toFixed(2)),
              confidence: input.confidence,
              feasibility: input.feasibility,
              timePenalty: scoring.timePenalty,
              reason: 'Ranked by impact × confidence × feasibility, adjusted for time-to-impact.',
            },
          },
        });
      };

      // Pricing & packaging (margin gap)
      if (grossMarginBenchmark != null && grossMargin < grossMarginBenchmark - 0.02 && revenue > 0) {
        const gap = grossMarginBenchmark - grossMargin;
        const impactLow = revenue * gap * 0.5;
        const impactHigh = revenue * gap * 0.9;
        makeOpportunity({
          title: 'Reduce discount leakage on high-margin segments',
          family: 'Pricing & packaging',
          objective: 'Margin',
          why: [
            `Gross margin ${formatPct(grossMargin)} vs peer ${formatPct(grossMarginBenchmark)}.`,
            'Margin gap suggests pricing or mix improvement potential.',
          ],
          impactLow,
          impactHigh,
          impactUnit: 'EBITDA',
          timeToSignalDays: 14,
          timeToRunRateDays: 60,
          dependencies: ['Quote approval rules', 'Segment margin visibility', 'Discount policy thresholds'],
          peerEvidence: `Peers at or above ${formatPct(grossMarginBenchmark)} typically show tighter discount variance and fewer overrides.`,
          tests: ['Pilot price floors on one segment for 30 days', 'Track win rate and discount variance'],
          guardrails: ['Churn increase > 0.5% triggers rollback', 'Win rate drop > 5% triggers review'],
          owner: 'Sales',
          nextAction: 'Define target segment and price floor thresholds',
          confidence: 0.62,
          feasibility: 0.7,
          metric: 'Gross Margin',
          nextActions: [
            { description: 'Export segment margin by product/customer from P&L; flag segments below target margin', owner: 'Finance', dueHorizon: 'today', dataReference: 'P&L by segment' },
            { description: 'Define price floor and max discount % by segment; publish to quote tool', owner: 'Sales', dueHorizon: '48 hours', dataReference: 'Pricing policy' },
            { description: 'Pilot price floors on top 3 segments for 14 days; track win rate and discount variance', owner: 'Sales', dueHorizon: '7 days', dataReference: 'Win/loss + discount %' },
            { description: 'Review gross margin % and scrap/expedite; if no improvement in 14 days escalate to pricing committee', owner: 'Finance', dueHorizon: '14 days', dataReference: 'Gross margin %' },
          ],
          monitoring: {
            primaryKpi: 'Gross margin % (monthly)',
            leadingIndicators: ['Discount % by segment (daily)', 'Scrap rate / expedite freight % (daily)', 'Win rate by segment (weekly)'],
            timeWindowDays: 14,
            stopContinueRule: 'If gross margin does not improve by 0.5 pts in 14 days or churn increases >0.5%, escalate to pricing committee; if scrap stays >3% for 3 consecutive days after containment, escalate to supplier action plan.',
          },
        });
      }

      // Working capital (DSO)
      if (dsoBenchmark != null && dso != null && dso > dsoBenchmark + 5 && revenue > 0) {
        const dsoGap = dso - dsoBenchmark;
        const cashImpact = (dsoGap / 365) * revenue;
        makeOpportunity({
          title: 'Tighten terms and collections to reduce DSO',
          family: 'Working capital (AR/AP/inventory)',
          objective: 'Cash',
          why: [
            `DSO ${formatDays(dso)} vs peer ${formatDays(dsoBenchmark)}.`,
            'Cash conversion is slower than peer median.',
          ],
          impactLow: cashImpact * 0.6,
          impactHigh: cashImpact * 0.9,
          impactUnit: 'Cash',
          timeToSignalDays: 14,
          timeToRunRateDays: 75,
          dependencies: ['AR aging accuracy', 'Customer contact list', 'Reminder sequence'],
          peerEvidence: `Peers with DSO near ${formatDays(dsoBenchmark)} typically see 1–2 quarter EBITDA lift from improved cash conversion.`,
          tests: ['Target top 15 overdue accounts for 2-week collection sprint'],
          guardrails: ['Customer churn > 0.5% triggers review', 'Disputes volume spike > 10% triggers pause'],
          owner: 'Finance',
          nextAction: 'Identify top overdue accounts and launch collection cadence',
          confidence: 0.68,
          feasibility: 0.8,
          metric: 'DSO',
          nextActions: [
            { description: 'Generate Top 25 past-due invoices by $ and days; assign owners; draft email script', owner: 'Finance', dueHorizon: 'today', dataReference: 'AR aging report' },
            { description: 'Create dispute queue for invoices blocked by POD/price mismatch; resolve top 10', owner: 'Finance', dueHorizon: '48 hours', dataReference: 'Dispute log' },
            { description: 'Implement credit hold threshold update; measure DSO change over 30 days', owner: 'Finance', dueHorizon: '7 days', dataReference: 'DSO + AR aging' },
          ],
          monitoring: {
            primaryKpi: 'DSO (days sales outstanding, monthly)',
            leadingIndicators: ['AR aging bucket mix (daily)', 'Over 60 days % (weekly)', 'Dispute count (weekly)'],
            timeWindowDays: 14,
            stopContinueRule: 'If DSO does not improve by 2+ days in 14 days, escalate to credit manager; if disputes spike >10%, pause and review process.',
          },
        });
      }

      // Growth investment when margin strong + growth strong
      if (growth > 0.05 && (grossMarginBenchmark == null || grossMargin >= grossMarginBenchmark) && revenue > 0) {
        makeOpportunity({
          title: 'Scale channels while margin is strong',
          family: 'Sales efficiency & pipeline',
          objective: 'Growth',
          why: [
            `Revenue growth ${formatPct(growth)} over last 3 months.`,
            `Gross margin ${formatPct(grossMargin)} ${grossMarginBenchmark != null ? `vs peer ${formatPct(grossMarginBenchmark)}` : 'is healthy'}.`,
          ],
          impactLow: revenue * 0.08,
          impactHigh: revenue * 0.15,
          impactUnit: 'Revenue',
          timeToSignalDays: 30,
          timeToRunRateDays: 90,
          dependencies: ['Capacity planning', 'Channel ROI tracking', 'Working capital headroom'],
          peerEvidence: 'Peers with strong margins often scale by doubling down on highest-ROI channels.',
          tests: ['Pilot incremental spend on top 2 channels for 6 weeks'],
          guardrails: ['CAC increase > 15% triggers pause', 'Utilization > 92% triggers capacity review'],
          owner: 'Marketing',
          nextAction: 'Identify top ROI channels and set pilot budget',
          confidence: 0.6,
          feasibility: 0.65,
          metric: 'Revenue Growth',
          nextActions: [
            { description: 'Pull channel ROI (CAC, LTV, conversion) for last 90 days; rank by ROI', owner: 'Marketing', dueHorizon: 'today', dataReference: 'Channel attribution' },
            { description: 'Set pilot budget and cap for top 2 channels; define success metric (e.g. CPA target)', owner: 'Marketing', dueHorizon: '48 hours', dataReference: 'Budget + targets' },
            { description: 'Launch pilot; track spend and conversion weekly for 6 weeks', owner: 'Marketing', dueHorizon: '7 days', dataReference: 'Weekly channel report' },
            { description: 'Review revenue and CAC at 30 days; continue or pause per guardrails', owner: 'Marketing', dueHorizon: '30 days', dataReference: 'Revenue + CAC' },
          ],
          monitoring: {
            primaryKpi: 'Revenue (monthly)',
            leadingIndicators: ['Channel spend vs plan (daily)', 'Conversion rate by channel (weekly)', 'CAC by channel (weekly)'],
            timeWindowDays: 30,
            stopContinueRule: 'If CAC increases >15% vs baseline, pause channel; if utilization >92%, trigger capacity review before adding spend.',
          },
        });
      }

      // High margin but low growth (unlock)
      if (grossMarginBenchmark != null && grossMargin > grossMarginBenchmark + 0.02 && growth < 0.02 && revenue > 0) {
        makeOpportunity({
          title: 'Monetize strong margins by expanding pipeline',
          family: 'Marketing channel mix',
          objective: 'Growth',
          why: [
            `Gross margin ${formatPct(grossMargin)} vs peer ${formatPct(grossMarginBenchmark)}.`,
            `Revenue growth ${formatPct(growth)} is below potential given margin strength.`,
          ],
          impactLow: revenue * 0.05,
          impactHigh: revenue * 0.12,
          impactUnit: 'Revenue',
          timeToSignalDays: 30,
          timeToRunRateDays: 120,
          dependencies: ['Channel capacity', 'Lead quality scoring', 'Sales enablement assets'],
          peerEvidence: 'Peers with high margins but low growth typically expand via targeted partnerships and channel focus.',
          tests: ['Launch partner pilot with 2 strategic partners'],
          guardrails: ['Pipeline conversion < 10% triggers channel re-evaluation'],
          owner: 'Sales',
          nextAction: 'Select 1–2 channel experiments and define success metrics',
          confidence: 0.55,
          feasibility: 0.6,
          metric: 'Pipeline Growth',
          nextActions: [
            { description: 'List 5 partner/channel options with reach and fit; score and pick top 2', owner: 'Sales', dueHorizon: 'today', dataReference: 'Partner pipeline' },
            { description: 'Draft pilot scope and success metric (e.g. pipeline added in 90 days)', owner: 'Sales', dueHorizon: '48 hours', dataReference: 'Pilot brief' },
            { description: 'Launch partner pilot; track pipeline and conversion weekly', owner: 'Sales', dueHorizon: '7 days', dataReference: 'Pipeline + conversion' },
            { description: 'Review pipeline conversion at 30 days; continue or re-evaluate per guardrails', owner: 'Sales', dueHorizon: '30 days', dataReference: 'Conversion %' },
          ],
          monitoring: {
            primaryKpi: 'Revenue growth % (monthly)',
            leadingIndicators: ['Pipeline added by channel (weekly)', 'Conversion % by channel (weekly)', 'Lead quality score (weekly)'],
            timeWindowDays: 30,
            stopContinueRule: 'If pipeline conversion stays <10% at 30 days, re-evaluate channel; escalate to sales leadership for channel mix review.',
          },
        });
      }

      // Inventory drag (if available)
      if (dioBenchmark != null && dio != null && dio > dioBenchmark + 5 && cogs > 0) {
        const cashImpact = ((dio - dioBenchmark) / 365) * cogs;
        makeOpportunity({
          title: 'Reduce inventory drag to free cash',
          family: 'COGS / procurement / supplier terms',
          objective: 'Cash',
          why: [
            `Inventory days ${formatDays(dio)} vs peer ${formatDays(dioBenchmark)}.`,
            'Inventory turns imply excess working capital tied up.',
          ],
          impactLow: cashImpact * 0.5,
          impactHigh: cashImpact * 0.8,
          impactUnit: 'Cash',
          timeToSignalDays: 30,
          timeToRunRateDays: 90,
          dependencies: ['SKU-level margin accuracy', 'Demand forecasting', 'Supplier lead time review'],
          peerEvidence: `Peers with inventory days near ${formatDays(dioBenchmark)} see higher cash conversion and fewer stockouts.`,
          tests: ['Pilot reorder point changes on top 10 SKUs'],
          guardrails: ['Stockout rate > 2% triggers rollback'],
          owner: 'Ops',
          nextAction: 'Review slow-moving SKUs and adjust reorder points',
          confidence: 0.5,
          feasibility: 0.55,
          metric: 'Inventory Days',
          nextActions: [
            { description: 'Export slow-moving and excess inventory by SKU ($ and days); assign owners by category', owner: 'Ops', dueHorizon: 'today', dataReference: 'Inventory aging report' },
            { description: 'Review reorder points for top 10 SKUs; propose new targets with demand and lead time', owner: 'Ops', dueHorizon: '48 hours', dataReference: 'Reorder points + demand' },
            { description: 'Implement reorder point changes; track stockout rate and inventory days for 14 days', owner: 'Ops', dueHorizon: '7 days', dataReference: 'Stockout % + inventory days' },
            { description: 'Measure inventory days and cash released at 30 days; roll back if stockout >2%', owner: 'Ops', dueHorizon: '30 days', dataReference: 'Inventory days + stockout %' },
          ],
          monitoring: {
            primaryKpi: 'Inventory days (monthly)',
            leadingIndicators: ['Stockout rate by SKU (daily)', 'Inventory $ by category (weekly)', 'Reorder trigger hits (weekly)'],
            timeWindowDays: 14,
            stopContinueRule: 'If stockout rate exceeds 2%, roll back reorder changes; if inventory days do not improve in 14 days, escalate to procurement/supplier action plan.',
          },
        });
      }

      // Recommendation layer: enrich opportunities with sector playbook theme (title/family)
      const signals = {
        revenue,
        growth,
        grossMargin,
        dso,
        dio,
        cogs,
        grossMarginBenchmark: grossMarginBenchmark ?? null,
        dsoBenchmark: dsoBenchmark ?? null,
        dioBenchmark: dioBenchmark ?? null,
      };
      for (const f of findings) {
        if (f.type !== 'opportunity' || !f.payload) continue;
        const objective = f.payload.objective as string | undefined;
        const metric = (f.metric || '').toLowerCase();
        for (const theme of playbook.recommendationThemes) {
          if (themeObjectiveToRun(theme.objective) !== objective) continue;
          const themeId = theme.id.toLowerCase();
          const cond = (theme.whenCondition || '').toLowerCase();
          const metricInTheme =
            (metric && themeId.includes(metric.replace(/\s+/g, '_'))) ||
            (metric && cond.includes(metric)) ||
            (metric === 'dso' && (themeId.includes('dso') || themeId.includes('receivables'))) ||
            (metric === 'gross margin' && (themeId.includes('margin') || themeId.includes('gross'))) ||
            (metric.includes('inventory') && (themeId.includes('inventory') || themeId.includes('inv'))) ||
            (metric.includes('revenue growth') && (themeId.includes('growth') || themeId.includes('scale') || themeId.includes('channel'))) ||
            (metric.includes('pipeline') && (themeId.includes('pipeline') || themeId.includes('expand')));
          if (metricInTheme) {
            f.payload.recommendationThemeId = theme.id;
            f.payload.sectorTitle = theme.title;
            f.payload.sectorFamily = theme.family;
            if (playbook.sector !== 'DEFAULT') {
              f.payload.title = theme.title;
              f.payload.type = theme.family;
              if (theme.suggestedOwner) f.payload.owner = themeOwnerToRun(theme.suggestedOwner);
            }
            break;
          }
        }
      }

      // Add up to 2 sector-only opportunities from playbook when signals match and no existing opportunity covers that theme
      const existingOpportunityMetrics = new Set(
        findings.filter((x) => x.type === 'opportunity').map((x) => (x.metric || '').toLowerCase())
      );
      let addedFromPlaybook = 0;
      const maxPlaybookOpportunities = 2;
      for (const theme of playbook.recommendationThemes) {
        if (addedFromPlaybook >= maxPlaybookOpportunities) break;
        if (findings.some((f) => f.type === 'opportunity' && f.payload?.recommendationThemeId === theme.id)) continue;
        const match = matchRecommendationTheme(theme, signals);
        if (!match || existingOpportunityMetrics.has(match.metric.toLowerCase())) continue;
        const objective = themeObjectiveToRun(theme.objective);
        const scoring = scoreOpportunity({
          revenue,
          impactLow: match.impactLow,
          impactHigh: match.impactHigh,
          confidence: match.confidence,
          feasibility: match.feasibility,
          timeToImpactDays: match.impactUnit === 'Cash' ? 75 : match.impactUnit === 'Revenue' ? 90 : 60,
        });
        const severity = scoring.score >= 0.55 ? 'high' : scoring.score >= 0.35 ? 'medium' : 'low';
        findings.push({
          type: 'opportunity',
          metric: match.metric,
          severity,
          confidence: match.confidence,
          payload: {
            title: theme.title,
            type: theme.family,
            objective,
            why: match.why,
            recommendationThemeId: theme.id,
            source: 'playbook',
            impact: {
              unit: match.impactUnit,
              low: match.impactLow,
              high: match.impactHigh,
              basis: 'Sector playbook × signal',
            },
            timeToImpact: {
              signalDays: 14,
              runRateDays: match.impactUnit === 'Cash' ? 75 : 90,
              label: timeLabel(match.impactUnit === 'Cash' ? 75 : 90),
            },
            dependencies: [],
            peerEvidence: `Sector playbook (${playbook.label}) suggests this lever when ${theme.whenCondition}.`,
            validationTests: ['Validate with local data', 'Confirm owner and timeline'],
            guardrails: ['Monitor for unintended effects'],
            owner: themeOwnerToRun(theme.suggestedOwner),
            status: 'Discover',
            nextAction: `Review and assign owner; validate ${theme.whenCondition}`,
            nextActions: [
              { description: `Validate signal and data for: ${theme.whenCondition}`, owner: themeOwnerToRun(theme.suggestedOwner), dueHorizon: 'today', dataReference: 'Relevant P&L / ops metric' },
              { description: 'Define 3 concrete tasks (verb + object + owner + due date); assign owner', owner: themeOwnerToRun(theme.suggestedOwner), dueHorizon: '48 hours', dataReference: 'Action plan' },
              { description: 'Execute first task; set primary KPI and 14-day check', owner: themeOwnerToRun(theme.suggestedOwner), dueHorizon: '7 days', dataReference: 'KPI + leading indicator' },
            ],
            monitoring: {
              primaryKpi: `${match.metric} (primary outcome)`,
              leadingIndicators: ['Relevant daily/weekly operational metric'],
              timeWindowDays: 14,
              stopContinueRule: 'If no improvement in 14 days, escalate or re-prioritize; monitor for unintended effects.',
            },
            score: {
              value: Number(scoring.score.toFixed(2)),
              impact: Number(scoring.impactScore.toFixed(2)),
              confidence: match.confidence,
              feasibility: match.feasibility,
              timePenalty: scoring.timePenalty,
              reason: 'Sector playbook recommendation from signal match.',
            },
          },
        });
        existingOpportunityMetrics.add(match.metric.toLowerCase());
        addedFromPlaybook += 1;
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
          nextActions: [],
          monitoring: null,
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

    // Enrich findings with sector playbook (boardBucket, sector context, severity)
    for (const finding of findings) {
      if (playbook.sector !== 'DEFAULT') {
        finding.payload = { ...finding.payload, sector: playbook.sector, sectorLabel: playbook.label };
      }
      if (finding.type === 'anomaly') {
        if (playbook.anomalyContext.seasonalityNote || playbook.anomalyContext.typicalVarianceNote) {
          finding.payload.sectorContext = {
            seasonalityNote: playbook.anomalyContext.seasonalityNote ?? undefined,
            typicalVarianceNote: playbook.anomalyContext.typicalVarianceNote ?? undefined,
          };
        }
        if (finding.severity === 'medium' && isHighSeverityTrigger(playbook, finding.metric || '')) {
          finding.severity = 'high';
        }
      }
      if (finding.type === 'focus') {
        finding.payload.boardBucket = getFocusBucketForMetric(
          playbook,
          finding.metric || 'Gross Margin',
          (finding.severity as 'high' | 'medium' | 'low') || 'medium'
        );
      }
      if (finding.type === 'opportunity' && playbook.sector !== 'DEFAULT') {
        finding.payload.sector = playbook.sector;
        finding.payload.sectorLabel = playbook.label;
      }
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

    const debugCovenantMeta = includeCovenantDebug ? await loadCovenantDebugMeta(companyId) : undefined;
    const debugCovenants = includeCovenantDebug
      ? covenantRows
          .filter((row: any) => (debugLoanName ? String(row.loanName || '').toLowerCase().includes(debugLoanName) : true))
          .map((row: any) => ({
            loanName: row.loanName,
            covenantName: row.covenantName,
            covenantType: row.covenantType,
            status: row.statusValue,
            applicable: row.applicableValue,
            currentValue: row.currentValue,
            threshold: row.threshold,
            warningThreshold: row.warningThreshold ?? null,
            breachThreshold: row.breachThreshold ?? null,
          }))
      : undefined;

    return NextResponse.json({
      success: true,
      inserted: findings.length,
      opsProfile,
      playbook: { sector: playbook.sector, label: playbook.label },
      goals: {
        expense: expenseGoals[0]?.goals || {},
        operational: operationalGoals[0]?.goals || {},
      },
      ...(includeCovenantDebug ? { debugCovenants, debugCovenantMeta } : {}),
    });
  } catch (error) {
    console.error('Performance analytics run error:', error);
    return NextResponse.json(
      { error: 'Failed to run performance analytics agents', details: String(error) },
      { status: 500 }
    );
  }
}
