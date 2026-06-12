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

const OPERATIONAL_FOCUS_KEY = '__focusWatchlist';

function normalizeForMatch(value: string): string {
  return String(value || '').trim().toLowerCase();
}

function extractFocusTerms(goals: Record<string, any>): string[] {
  const raw = goals?.[OPERATIONAL_FOCUS_KEY];
  if (!raw || typeof raw !== 'object') return [];
  const values = Object.values(raw)
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => v.length > 0);
  return Array.from(new Set(values));
}

function findFocusMatch(text: string, focusTerms: string[]): string | null {
  const normalized = normalizeForMatch(text);
  if (!normalized) return null;
  for (const term of focusTerms) {
    if (term && normalized.includes(term)) return term;
  }
  return null;
}

function escalateSeverity(current?: string): string {
  const normalized = normalizeForMatch(current || 'medium');
  if (normalized === 'low') return 'medium';
  if (normalized === 'medium') return 'high';
  return current || 'high';
}

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

async function safeFindFirst<T>(label: string, query: Promise<T | null>): Promise<T | null> {
  try {
    return await query;
  } catch (error) {
    console.warn(`Performance analytics run: failed to load ${label}`, error);
    return null;
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

function describeAnomaly(score: number) {
  const abs = Math.abs(score);
  const direction = score >= 0 ? 'higher' : 'lower';
  if (abs >= 3) return `much ${direction} than normal`;
  if (abs >= 2.5) return `significantly ${direction} than normal`;
  return `${direction} than normal`;
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

function getOpsWindowSize(frequency: string) {
  if (frequency === 'daily') return 7;
  if (frequency === 'weekly') return 4;
  return 3;
}

function getOpsMinPoints(frequency: string) {
  if (frequency === 'daily') return 14;
  if (frequency === 'weekly') return 8;
  return 6;
}

function getFrequencyLabel(frequency: string) {
  if (frequency === 'daily') return 'days';
  if (frequency === 'weekly') return 'weeks';
  return 'months';
}

function getOpsSnapshotFrequency(frequency: string) {
  if (frequency === 'weekly') return 'weekly';
  if (frequency === 'daily') return 'daily';
  return 'monthly';
}

function getPreferredOpsOrder(preferred: string): Array<'daily' | 'weekly' | 'monthly'> {
  if (preferred === 'weekly') return ['weekly', 'daily', 'monthly'];
  if (preferred === 'monthly') return ['monthly', 'weekly', 'daily'];
  return ['daily', 'weekly', 'monthly'];
}

function selectBestOpsSeries(rows: any[], preferred: string) {
  const byFrequency: Record<'daily' | 'weekly' | 'monthly', any[]> = {
    daily: [],
    weekly: [],
    monthly: [],
  };
  rows.forEach((row: any) => {
    const freq = String(row?.frequency || '').toLowerCase();
    if (freq === 'daily' || freq === 'weekly' || freq === 'monthly') {
      byFrequency[freq].push(row);
    }
  });

  const ordered = getPreferredOpsOrder(preferred);
  for (const freq of ordered) {
    if (byFrequency[freq].length >= getOpsMinPoints(freq)) {
      return { frequency: freq, rows: byFrequency[freq] };
    }
  }

  const best = ordered
    .map((freq) => ({ freq, count: byFrequency[freq].length }))
    .sort((a, b) => b.count - a.count)[0];
  if (best && best.count > 0) {
    return { frequency: best.freq, rows: byFrequency[best.freq] };
  }

  return { frequency: ordered[0], rows: [] };
}

function getSeriesCadence(rows: any[], fallback: string) {
  const detected =
    rows && rows.length > 0
      ? String(rows[rows.length - 1]?.frequency || rows[0]?.frequency || '').toLowerCase()
      : '';
  const frequency =
    detected === 'daily' || detected === 'weekly' || detected === 'monthly'
      ? detected
      : getOpsSnapshotFrequency(fallback);
  return {
    frequency,
    windowSize: getOpsWindowSize(frequency),
    minPoints: getOpsMinPoints(frequency),
    label: getFrequencyLabel(frequency),
  };
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
    const frequency = body?.frequency || 'daily';
    const replace = body?.replace !== false;
    const includeCovenantDebug = Boolean(body?.includeCovenantDebug);
    const debugLoanName = body?.debugLoanName ? String(body.debugLoanName).trim().toLowerCase() : '';
    const preferredOpsFrequency = getOpsSnapshotFrequency(frequency);

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
        accountingSystem: true,
        industrySector: true,
        companySizeCategory: true,
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
      console.warn('Performance analytics run: industrySectorCategory not available', error);
    }

    const industryGroupId = company?.industrySector ? String(company.industrySector) : null;
    const assetSizeCategory = company?.companySizeCategory ? String(company.companySizeCategory) : 'DEFAULT';
    let benchmarks: Array<{ metricName: string; fiveYearValue: number | null }> = [];
    if (industryGroupId) {
      // Prefer size-specific benchmarks, then fall back.
      const primary = await safeFindMany(
        'industry benchmarks',
        prisma.industryBenchmark.findMany({
          where: { industryId: industryGroupId, assetSizeCategory },
          select: { metricName: true, fiveYearValue: true },
          take: 200,
        })
      );
      if (primary.length) {
        benchmarks = primary;
      } else {
        const fallbackDefault = assetSizeCategory !== 'DEFAULT'
          ? await safeFindMany(
              'industry benchmarks (default size)',
              prisma.industryBenchmark.findMany({
                where: { industryId: industryGroupId, assetSizeCategory: 'DEFAULT' },
                select: { metricName: true, fiveYearValue: true },
                take: 200,
              })
            )
          : [];
        benchmarks = fallbackDefault.length
          ? fallbackDefault
          : await safeFindMany(
              'industry benchmarks (any size)',
              prisma.industryBenchmark.findMany({
                where: { industryId: industryGroupId },
                select: { metricName: true, fiveYearValue: true },
                take: 200,
              })
            );
      }
    }

    const latestFinancialRecord = await safeFindFirst(
      'latest financial record',
      prisma.financialRecord.findFirst({
        where: { companyId },
        select: { id: true },
        orderBy: { createdAt: 'desc' },
      }) as any
    ) as { id: string } | null;

    const monthlyFinancialWhere: any = {
      companyId,
      monthDate: { gte: startDate, lte: endDate },
    };
    if (latestFinancialRecord?.id) {
      // Limit trend/anomaly analysis to the latest imported financial snapshot.
      monthlyFinancialWhere.financialRecordId = latestFinancialRecord.id;
    }

    const [
      monthlyFinancials,
      rawCashSnapshots,
      rawArSnapshots,
      rawApSnapshots,
      rawCustomerSnapshots,
      rawProductSnapshots,
      rawInventorySnapshots,
    ] = await Promise.all([
      safeFindMany(
        'monthly financials',
        prisma.monthlyFinancial.findMany({
          where: monthlyFinancialWhere,
          orderBy: { monthDate: 'asc' },
          take: 200,
        })
      ),
      // Daily snapshot tables can have thousands of rows in any window for
      // high-volume INFOR/M3 customers (Atlantic Precision has 8,790 daily
      // CustomerSalesSnapshot rows alone). With orderBy: 'asc' + take: 200 we
      // were silently truncating to the OLDEST 200 rows in the window, so the
      // "latest snapshot" used for findings/concentration was months out of
      // date. Fetch desc+take(200) to keep the MOST RECENT 200 rows, then
      // reverse so downstream code (which assumes ascending order via
      // .slice(-3), [length-1], etc.) continues to work.
      safeFindMany(
        'cash snapshots',
        prisma.cashSnapshot.findMany({
          where: { companyId, frequency: { in: ['daily', 'weekly', 'monthly'] }, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'desc' },
          take: 200,
        })
      ),
      safeFindMany(
        'ar snapshots',
        prisma.aRAgingSnapshot.findMany({
          where: { companyId, frequency: { in: ['daily', 'weekly', 'monthly'] }, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'desc' },
          take: 200,
        })
      ),
      safeFindMany(
        'ap snapshots',
        prisma.aPAgingSnapshot.findMany({
          where: { companyId, frequency: { in: ['daily', 'weekly', 'monthly'] }, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'desc' },
          take: 200,
        })
      ),
      safeFindMany(
        'customer snapshots',
        prisma.customerSalesSnapshot.findMany({
          where: { companyId, frequency: { in: ['daily', 'weekly', 'monthly'] }, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'desc' },
          take: 200,
        })
      ),
      safeFindMany(
        'product snapshots',
        prisma.productSalesSnapshot.findMany({
          where: { companyId, frequency: { in: ['daily', 'weekly', 'monthly'] }, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'desc' },
          take: 200,
        })
      ),
      safeFindMany(
        'inventory snapshots',
        prisma.inventorySnapshot.findMany({
          where: { companyId, frequency: { in: ['daily', 'weekly', 'monthly'] }, snapshotDate: { gte: startDate, lte: endDate } },
          orderBy: { snapshotDate: 'desc' },
          take: 200,
        })
      ),
    ]);

    // Restore ascending order so downstream code that uses .slice(-3),
    // .slice(-6, -3), arr[length - 1], etc. continues to mean "most recent N".
    rawCashSnapshots.reverse();
    rawArSnapshots.reverse();
    rawApSnapshots.reverse();
    rawCustomerSnapshots.reverse();
    rawProductSnapshots.reverse();
    rawInventorySnapshots.reverse();

    const { frequency: cashFrequency, rows: cashSnapshots } = selectBestOpsSeries(rawCashSnapshots, preferredOpsFrequency);
    const { frequency: arFrequency, rows: arSnapshots } = selectBestOpsSeries(rawArSnapshots, preferredOpsFrequency);
    const { frequency: apFrequency, rows: apSnapshots } = selectBestOpsSeries(rawApSnapshots, preferredOpsFrequency);
    const { frequency: customerFrequency, rows: customerSnapshots } = selectBestOpsSeries(rawCustomerSnapshots, preferredOpsFrequency);
    const { frequency: productFrequency, rows: productSnapshots } = selectBestOpsSeries(rawProductSnapshots, preferredOpsFrequency);
    const { frequency: inventoryFrequency, rows: inventorySnapshots } = selectBestOpsSeries(rawInventorySnapshots, preferredOpsFrequency);

    const hasProcessedFinancialMasterData = monthlyFinancials.length > 0;
    const hasCoreLiveFinancialData = isQuickBooksCompany
      ? hasProcessedFinancialMasterData
      : (
          monthlyFinancials.length > 0 ||
          cashSnapshots.length > 0 ||
          arSnapshots.length > 0 ||
          apSnapshots.length > 0
        );

    if (!hasCoreLiveFinancialData) {
      if (replace) {
        await prisma.$executeRawUnsafe(`DELETE FROM "PerformanceFinding" WHERE "companyId" = $1`, companyId);
      }
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: isQuickBooksCompany
          ? 'QuickBooks data has not been processed into the financial master yet. Performance analytics findings were not generated.'
          : 'No live financial data is available for this company. Performance analytics findings were not generated.',
        counts: {
          monthlyFinancials: monthlyFinancials.length,
          cashSnapshots: cashSnapshots.length,
          arSnapshots: arSnapshots.length,
          apSnapshots: apSnapshots.length,
          customerSnapshots: customerSnapshots.length,
          productSnapshots: productSnapshots.length,
          inventorySnapshots: inventorySnapshots.length,
        },
        findings: [],
      });
    }

    const selectedFrequencyCounts = [
      { frequency: cashFrequency, count: cashSnapshots.length },
      { frequency: arFrequency, count: arSnapshots.length },
      { frequency: apFrequency, count: apSnapshots.length },
      { frequency: customerFrequency, count: customerSnapshots.length },
      { frequency: productFrequency, count: productSnapshots.length },
      { frequency: inventoryFrequency, count: inventorySnapshots.length },
    ];
    const opsSnapshotFrequency =
      selectedFrequencyCounts
        .sort((a, b) => b.count - a.count)
        .map((row) => row.frequency)[0] || preferredOpsFrequency;
    const opsWindowSize = getOpsWindowSize(opsSnapshotFrequency);
    const opsFrequencyLabel = getFrequencyLabel(opsSnapshotFrequency);

    const [expenseGoals, operationalGoals] = await Promise.all([
      loadGoals('ExpenseGoal', companyId),
      loadGoals('OperationalGoal', companyId),
    ]);
    const operationalGoalValues = operationalGoals[0]?.goals || {};
    const focusTerms = extractFocusTerms(operationalGoalValues);

    const accountMappings = await safeFindMany(
      'account mappings',
      prisma.accountMapping.findMany({
        where: { companyId },
        select: { accountName: true },
      })
    );
    const mappedAccounts = new Set(accountMappings.map((m: any) => String(m.accountName)));

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
              summary: `${metric.label} shifted ${formatPct(change)} comparing the latest period window to the prior window. ${revenueContext} ${driverSummary}`.trim(),
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
            summary: `Operating cash flow shifted ${formatPct(ocfChange)} vs the prior period window.${ocfDrivers.length ? ` Primary drivers: ${ocfDrivers.join(', ')}.` : ''}${wcSummary}`,
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
            summary: `Latest cash balance is ${describeAnomaly(score)} versus the last ${values.length} periods.`,
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
            summary: `Total AR is ${describeAnomaly(score)} versus the last ${values.length} periods.`,
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
        // Only score months where this line item has actual loaded values.
        const values = sortedMonthly
          .map((m: any) => (m[key] != null ? Number(m[key]) : NaN))
          .filter((v: number) => Number.isFinite(v) && Math.abs(v) > 0.0001);
        if (values.length < 6) continue;
        const latest = values.length ? values[values.length - 1] : 0;
        const score = zScore(latest, values);
        if (Math.abs(score) >= 2) {
          findings.push({
            type: 'anomaly',
            metric: label,
            severity: severityFromScore(score),
            confidence: Math.min(0.85, 0.5 + Math.abs(score) / 4),
            payload: {
              title: `${label} ${score > 0 ? 'spike' : 'drop'}`,
              summary: `Latest ${label} is ${describeAnomaly(score)} versus the last ${values.length} months with data.`,
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
    const opsSeries = (() => {
      // If the company hasn't uploaded financial uploads for the requested cadence, we still
      // build a usable ops series from operational snapshots (customers/products/inventory + AR/AP/cash).
      // This keeps Actions/Monitor from being empty in early onboarding.
      const byDay = new Map<
        string,
        { monthDate: Date; revenue: number; cogsTotal: number; ar: number; ap: number; inventory: number; cash: number }
      >();

      function dayKey(d: Date) {
        return d.toISOString().slice(0, 10);
      }
      function ensure(d: Date) {
        const k = dayKey(d);
        if (!byDay.has(k)) {
          byDay.set(k, { monthDate: new Date(k), revenue: 0, cogsTotal: 0, ar: 0, ap: 0, inventory: 0, cash: 0 });
        }
        return byDay.get(k)!;
      }

      const custSeries = customerSnapshots || [];
      for (const r of custSeries) {
        const row = ensure(new Date(r.snapshotDate));
        row.revenue += Number(r.revenue || 0);
      }

      const prodSeries = productSnapshots || [];
      for (const r of prodSeries) {
        const row = ensure(new Date(r.snapshotDate));
        row.revenue += custSeries.length ? 0 : Number(r.revenue || 0); // prefer customer revenue if present
        row.cogsTotal += Number(r.cogs || 0);
      }

      const invSeries = inventorySnapshots || [];
      for (const r of invSeries) {
        const row = ensure(new Date(r.snapshotDate));
        row.inventory += Number(r.assetValue || 0);
      }

      const arSeries = arSnapshots || [];
      for (const r of arSeries) {
        const row = ensure(new Date(r.snapshotDate));
        row.ar = Number(r.totalAR || 0);
      }

      const apSeries = apSnapshots || [];
      for (const r of apSeries) {
        const row = ensure(new Date(r.snapshotDate));
        row.ap = Number(r.totalAP || 0);
      }

      const cashSeries = cashSnapshots || [];
      for (const r of cashSeries) {
        const row = ensure(new Date(r.snapshotDate));
        row.cash += Number(r.cashBalance || 0);
      }

      return Array.from(byDay.values()).sort((a, b) => a.monthDate.getTime() - b.monthDate.getTime());
    })();

    const useMonthlyFinancialSeries = opsSnapshotFrequency === 'monthly' && monthlyFinancials.length >= 4;
    const opportunitySeries: any[] = (
      useMonthlyFinancialSeries ? (monthlyFinancials as any[]) : opsSeries
    ) as any[];
    const opportunityLatest: any | null = getLatest(opportunitySeries);

    // If we have enough points (financial monthly or ops cadence), generate opportunities.
    if (opportunityLatest && opportunitySeries.length >= Math.max(opsWindowSize * 2, 4)) {
      const windowSize = opsWindowSize;
      const recent = opportunitySeries.slice(-windowSize);
      const prior = opportunitySeries.slice(-(windowSize * 2), -windowSize);

      const revenue = Number(opportunityLatest.revenue || 0);
      const cogs = Number(opportunityLatest.cogsTotal || 0);

      // MonthlyFinancial does not store AR/AP/inventory in this schema; always derive from snapshot tables.
      const latestAr = (arSnapshots?.length ? (arSnapshots[arSnapshots.length - 1] as any).totalAR : 0) || 0;
      const latestAp = (apSnapshots?.length ? (apSnapshots[apSnapshots.length - 1] as any).totalAP : 0) || 0;
      const latestInvDate = inventorySnapshots?.length ? new Date((inventorySnapshots[inventorySnapshots.length - 1] as any).snapshotDate) : null;
      const inventory =
        latestInvDate && inventorySnapshots?.length
          ? inventorySnapshots
              .filter((r: any) => new Date(r.snapshotDate).toISOString().slice(0, 10) === latestInvDate.toISOString().slice(0, 10))
              .reduce((sum: number, r: any) => sum + Number(r.assetValue || 0), 0)
          : 0;
      const ar = Number(latestAr || 0);
      const ap = Number(latestAp || 0);

      const growth = percentChange(average(recent.map((m: any) => m.revenue || 0)), average(prior.map((m: any) => m.revenue || 0)));
      const grossMargin = revenue ? (revenue - cogs) / revenue : 0;
      const grossMarginBenchmark = findBenchmark(benchmarks, /gross\s*margin/i);
      // Revenue/COGS here are monthly totals; convert to "days" using ~30-day months.
      const dso = revenue > 0 ? (ar / revenue) * 30 : null;
      const dio = cogs > 0 ? (inventory / cogs) * 30 : null;
      const dpo = cogs > 0 ? (ap / cogs) * 30 : null;
      const dsoBenchmark = findBenchmark(benchmarks, /days\s*(receivables|sales\s*outstanding|dso)/i);
      const dioBenchmark = findBenchmark(benchmarks, /days\s*inventory/i);
      const dpoBenchmark = findBenchmark(benchmarks, /days\s*payables/i);

      // Next 3–5 Actions: verb + object + data reference + owner + due date per task
      type NextActionTask = { description: string; owner?: string; dueHorizon: string; dataReference?: string };
      type MonitoringSpec = { primaryKpi: string; leadingIndicators: string[]; timeWindowDays: number; stopContinueRule: string };

      type EvidenceTopItem = {
        itemId: string | null;
        itemName: string;
        sku: string | null;
        inventoryAssetDelta: number;
        inventoryQtyDelta: number;
        recentAssetValue: number;
        recentQtyOnHand: number;
        recentAvgMonthlyUnitsSold: number | null;
        unitsSoldDelta: number | null;
        estimatedWeeksOnHand: number | null;
        recentGrossMarginPct: number | null;
      };
      type EvidenceColumn = {
        key: string;
        label: string;
        align?: 'left' | 'right';
        format?: 'text' | 'number' | 'money' | 'pct' | 'days';
      };
      type EvidenceRow = Record<string, string | number | null>;
      type OpportunityEvidenceBundle = {
        kind: 'inventory' | 'margin' | 'ar' | 'cash' | 'revenue';
        title?: string;
        methodology: string;
        topItems?: EvidenceTopItem[];
        columns?: EvidenceColumn[];
        rows?: EvidenceRow[];
        meta?: Record<string, any>;
      };

      function normKey(input: string) {
        return String(input || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      }
      function itemKey(itemId?: string | null, itemName?: string | null, sku?: string | null) {
        const id = String(itemId || '').trim();
        if (id) return `id:${id}`;
        const s = String(sku || '').trim();
        if (s) return `sku:${s.toLowerCase()}`;
        const n = normKey(String(itemName || ''));
        return n ? `name:${n}` : 'unknown';
      }
      function latestN<T>(rows: T[], getDate: (r: T) => Date, n: number): { recent: T[]; prior: T[] } {
        const dates = Array.from(
          new Set(
            rows
              .map((r) => getDate(r).toISOString().slice(0, 10))
              .filter(Boolean),
          ),
        ).sort();
        const recentDates = new Set(dates.slice(-n));
        const priorDates = new Set(dates.slice(-(n * 2), -n));
        return {
          recent: rows.filter((r) => recentDates.has(getDate(r).toISOString().slice(0, 10))),
          prior: rows.filter((r) => priorDates.has(getDate(r).toISOString().slice(0, 10))),
        };
      }
      function avg(nums: number[]) {
        if (!nums.length) return 0;
        return nums.reduce((s, n) => s + n, 0) / nums.length;
      }

      function buildInventoryEvidence(): OpportunityEvidenceBundle | null {
        // Requires item-level inventory + product snapshots for a meaningful drill-down.
        if (!Array.isArray(inventorySnapshots) || inventorySnapshots.length === 0) return null;

        const invSeries = Array.isArray(inventorySnapshots) ? inventorySnapshots : [];
        const prodSeries = Array.isArray(productSnapshots)
          ? productSnapshots
          : [];
        const invCadence = getSeriesCadence(invSeries, opsSnapshotFrequency);
        if (invSeries.length < invCadence.minPoints) return null;

        const invWindow = latestN(invSeries, (r: any) => new Date(r.snapshotDate), invCadence.windowSize);
        const prodWindow = latestN(prodSeries, (r: any) => new Date(r.snapshotDate), invCadence.windowSize);

        const invByItem = new Map<string, any>();
        for (const r of invSeries) {
          const k = itemKey(r.itemId, r.itemName, r.sku);
          const list = invByItem.get(k) || [];
          list.push(r);
          invByItem.set(k, list);
        }
        const prodByItem = new Map<string, any>();
        for (const r of prodSeries) {
          const k = itemKey(r.itemId, r.itemName, r.sku);
          const list = prodByItem.get(k) || [];
          list.push(r);
          prodByItem.set(k, list);
        }

        const out: EvidenceTopItem[] = [];
        for (const [k, invRows] of invByItem.entries()) {
          const recentInv = invRows.filter((r: any) => invWindow.recent.includes(r));
          const priorInv = invRows.filter((r: any) => invWindow.prior.includes(r));
          if (recentInv.length === 0 || priorInv.length === 0) continue;

          const recentAsset = avg(recentInv.map((r: any) => Number(r.assetValue || 0)));
          const priorAsset = avg(priorInv.map((r: any) => Number(r.assetValue || 0)));
          const recentQty = avg(recentInv.map((r: any) => Number(r.qtyOnHand || 0)));
          const priorQty = avg(priorInv.map((r: any) => Number(r.qtyOnHand || 0)));

          const invAssetDelta = recentAsset - priorAsset;
          if (invAssetDelta <= 0) continue; // focus on inventory build first

          const invQtyDelta = recentQty - priorQty;

          const prodRows = prodByItem.get(k) || [];
          const recentProd = prodRows.filter((r: any) => prodWindow.recent.includes(r));
          const priorProd = prodRows.filter((r: any) => prodWindow.prior.includes(r));

          const recentUnits = recentProd.length ? avg(recentProd.map((r: any) => Number(r.quantitySold || 0))) : null;
          const priorUnits = priorProd.length ? avg(priorProd.map((r: any) => Number(r.quantitySold || 0))) : null;
          const unitsDelta = recentUnits != null && priorUnits != null ? recentUnits - priorUnits : null;

          const recentGmPct = recentProd.length
            ? avg(recentProd.map((r: any) => (typeof r.grossMarginPct === 'number' ? r.grossMarginPct : 0))).toFixed(2)
            : null;

          const avgUnitsPerPeriod = recentUnits;
          const weeksOnHand = avgUnitsPerPeriod && avgUnitsPerPeriod > 0
            ? (recentQty / avgUnitsPerPeriod) * (invCadence.frequency === 'daily' ? 0.143 : invCadence.frequency === 'weekly' ? 1 : 4.33)
            : null;

          const sample = recentInv[0] || invRows[invRows.length - 1];
          out.push({
            itemId: sample?.itemId ? String(sample.itemId) : null,
            itemName: String(sample?.itemName || 'Item'),
            sku: sample?.sku ? String(sample.sku) : null,
            inventoryAssetDelta: Number(invAssetDelta.toFixed(2)),
            inventoryQtyDelta: Number(invQtyDelta.toFixed(2)),
            recentAssetValue: Number(recentAsset.toFixed(2)),
            recentQtyOnHand: Number(recentQty.toFixed(2)),
            recentAvgMonthlyUnitsSold: avgUnitsPerPeriod != null ? Number(avgUnitsPerPeriod.toFixed(2)) : null,
            unitsSoldDelta: unitsDelta != null ? Number(unitsDelta.toFixed(2)) : null,
            estimatedWeeksOnHand: weeksOnHand != null ? Number(weeksOnHand.toFixed(1)) : null,
            recentGrossMarginPct: recentGmPct != null ? Number(recentGmPct) : null,
          });
        }

        out.sort((a, b) => b.inventoryAssetDelta - a.inventoryAssetDelta);
        return {
          kind: 'inventory',
          methodology: `Top items by inventory asset value increase (recent ${invCadence.windowSize}-${invCadence.label} avg vs prior ${invCadence.windowSize}-${invCadence.label} avg), joined to product sales by itemId/sku/name.`,
          topItems: out.slice(0, 10),
        };
      }

      function buildMarginEvidence(params: { targetBenchmarkPct: number | null }): OpportunityEvidenceBundle | null {
        const { targetBenchmarkPct } = params;
        if (!Array.isArray(productSnapshots) || productSnapshots.length === 0) return null;
        const prodSeries = productSnapshots;
        const prodCadence = getSeriesCadence(prodSeries, opsSnapshotFrequency);
        if (prodSeries.length < prodCadence.minPoints) return null;

        const window = latestN(prodSeries, (r: any) => new Date(r.snapshotDate), prodCadence.windowSize);
        const recent = window.recent;
        const prior = window.prior;
        if (recent.length === 0 || prior.length === 0) return null;

        type Agg = { itemId: string | null; itemName: string; sku: string | null; rev: number; cogs: number; qty: number; gmPct: number | null };
        const by = new Map<string, Agg>();
        for (const r of recent) {
          const k = itemKey(r.itemId, r.itemName, r.sku);
          const prev = by.get(k) || {
            itemId: r.itemId ? String(r.itemId) : null,
            itemName: String(r.itemName || 'Item'),
            sku: r.sku ? String(r.sku) : null,
            rev: 0,
            cogs: 0,
            qty: 0,
            gmPct: null,
          };
          const rev = Number(r.revenue || 0);
          const cogs = Number(r.cogs || 0);
          prev.rev += rev;
          prev.cogs += cogs;
          prev.qty += Number(r.quantitySold || 0);
          by.set(k, prev);
        }
        const rows = Array.from(by.values()).map((a) => {
          const gmPct = a.rev > 0 ? ((a.rev - a.cogs) / a.rev) * 100 : null;
          return { ...a, gmPct };
        });

        // Choose "low margin but material revenue" items.
        const benchmark = targetBenchmarkPct != null ? targetBenchmarkPct * 100 : null;
        const low = rows
          .filter((r) => r.rev > 0)
          .sort((a, b) => b.rev - a.rev)
          .slice(0, 25)
          .filter((r) => (benchmark != null ? (r.gmPct != null && r.gmPct < benchmark - 1) : true))
          .sort((a, b) => ((a.gmPct ?? 999) - (b.gmPct ?? 999)))
          .slice(0, 10)
          .map((r) => ({
            itemId: r.itemId,
            itemName: r.itemName,
            sku: r.sku,
            inventoryAssetDelta: 0,
            inventoryQtyDelta: 0,
            recentAssetValue: 0,
            recentQtyOnHand: 0,
            recentAvgMonthlyUnitsSold: r.qty / Math.max(prodCadence.windowSize, 1),
            unitsSoldDelta: null,
            estimatedWeeksOnHand: null,
            recentGrossMarginPct: r.gmPct != null ? Number(r.gmPct.toFixed(2)) : null,
          }));

        if (low.length === 0) return null;
        return {
          kind: 'margin',
          methodology: `Low gross-margin items by revenue (recent ${prodCadence.windowSize} ${prodCadence.label}), surfaced as candidates for pricing/mix action.`,
          topItems: low,
        };
      }

      function buildArAgingEvidence(): OpportunityEvidenceBundle | null {
        const arSeries = arSnapshots || [];
        const arCadence = getSeriesCadence(arSeries, opsSnapshotFrequency);
        if (arSeries.length < Math.max(arCadence.windowSize * 2, 4)) return null;
        const win = latestN(arSeries, (r: any) => new Date(r.snapshotDate), arCadence.windowSize);
        if (win.recent.length === 0 || win.prior.length === 0) return null;

        const sum = (rows: any[], key: string) => rows.reduce((s, r) => s + Number(r[key] || 0), 0);
        const avgTotal = (rows: any[]) => avg(rows.map((r: any) => Number(r.totalAR || 0)));

        const buckets = [
          { key: 'current', label: '0-30 days' },
          { key: 'days1to30', label: '31-60 days' },
          { key: 'days31to60', label: '61-90 days' },
          { key: 'days61to90', label: '91-120 days' },
          { key: 'days90plus', label: '120+ days' },
        ];

        const recentTotal = avgTotal(win.recent);
        const priorTotal = avgTotal(win.prior);
        const recentOver60 = avg(win.recent.map((r: any) => Number((r.days31to60 || 0) + (r.days61to90 || 0) + (r.days90plus || 0))));
        const priorOver60 = avg(win.prior.map((r: any) => Number((r.days31to60 || 0) + (r.days61to90 || 0) + (r.days90plus || 0))));
        const over60RecentPct = recentTotal ? recentOver60 / recentTotal : 0;
        const over60PriorPct = priorTotal ? priorOver60 / priorTotal : 0;

        const rows: EvidenceRow[] = buckets.map((b) => {
          const recent = sum(win.recent, b.key) / win.recent.length;
          const prior = sum(win.prior, b.key) / win.prior.length;
          return {
            bucket: b.label,
            recent,
            prior,
            delta: recent - prior,
          };
        });

        return {
          kind: 'ar',
          title: 'AR aging breakdown',
          methodology: `Recent ${arCadence.windowSize} vs prior ${arCadence.windowSize} ${arCadence.label}. Over-60 mix: ${(over60RecentPct * 100).toFixed(0)}% (${((over60RecentPct - over60PriorPct) * 100).toFixed(1)} pts).`,
          columns: [
            { key: 'bucket', label: 'Bucket', align: 'left', format: 'text' },
            { key: 'recent', label: 'Recent $', align: 'right', format: 'money' },
            { key: 'prior', label: 'Prior $', align: 'right', format: 'money' },
            { key: 'delta', label: 'Δ $', align: 'right', format: 'money' },
          ],
          rows,
        };
      }

      function buildCashEvidence(): OpportunityEvidenceBundle | null {
        const cashDaily = (cashSnapshots || []).filter((r: any) => String(r.frequency || '') === 'daily');
        if (cashDaily.length < 14) return null;

        // Aggregate total cash by date (sum across accounts).
        const byDate = new Map<string, { date: string; total: number }>();
        for (const r of cashDaily) {
          const d = new Date(r.snapshotDate).toISOString().slice(0, 10);
          const prev = byDate.get(d) || { date: d, total: 0 };
          prev.total += Number(r.cashBalance || 0);
          byDate.set(d, prev);
        }
        const series = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
        if (series.length < 14) return null;

        const recent = series.slice(-7);
        const prior = series.slice(-14, -7);
        const recentAvg = avg(recent.map((x) => x.total));
        const priorAvg = avg(prior.map((x) => x.total));
        const delta = recentAvg - priorAvg;

        const latestDate = series[series.length - 1]?.date;
        const latestAccounts = cashDaily.filter((r: any) => new Date(r.snapshotDate).toISOString().slice(0, 10) === latestDate);
        const accounts = latestAccounts
          .map((r: any) => ({ account: String(r.accountName || 'Cash'), balance: Number(r.cashBalance || 0) }))
          .sort((a, b) => b.balance - a.balance)
          .slice(0, 6);

        return {
          kind: 'cash',
          title: 'Cash position (drivers)',
          methodology: `7-day avg cash ${delta >= 0 ? 'up' : 'down'} by $${Math.abs(delta).toFixed(0)} vs prior 7-day window. Top accounts shown for latest date.`,
          meta: { recentAvg, priorAvg, delta },
          columns: [
            { key: 'account', label: 'Account', align: 'left', format: 'text' },
            { key: 'balance', label: 'Balance', align: 'right', format: 'money' },
          ],
          rows: accounts.map((a) => ({ account: a.account, balance: a.balance })),
        };
      }

      function buildRevenueDriversEvidence(): OpportunityEvidenceBundle | null {
        const custSeries = customerSnapshots || [];
        const prodSeries = productSnapshots || [];
        const custCadence = getSeriesCadence(custSeries, opsSnapshotFrequency);
        const prodCadence = getSeriesCadence(prodSeries, opsSnapshotFrequency);
        const useCustomer = custSeries.length >= custCadence.minPoints || custSeries.length >= prodSeries.length;
        const base = useCustomer ? custSeries : prodSeries;
        const baseCadence = useCustomer ? custCadence : prodCadence;
        if (base.length < baseCadence.minPoints) return null;

        const win = latestN(base, (r: any) => new Date(r.snapshotDate), baseCadence.windowSize);
        if (win.recent.length === 0 || win.prior.length === 0) return null;

        const isCustomer = useCustomer;
        const keyOf = (r: any) => (isCustomer ? String(r.customerName || r.customerId || 'Customer') : String(r.itemName || r.itemId || 'Item'));

        const recentTotals = new Map<string, number>();
        const priorTotals = new Map<string, number>();
        for (const r of win.recent) {
          const k = keyOf(r);
          recentTotals.set(k, (recentTotals.get(k) || 0) + Number(r.revenue || 0));
        }
        for (const r of win.prior) {
          const k = keyOf(r);
          priorTotals.set(k, (priorTotals.get(k) || 0) + Number(r.revenue || 0));
        }

        const totalRecent = Array.from(recentTotals.values()).reduce((s, n) => s + n, 0);
        const rows = Array.from(new Set([...recentTotals.keys(), ...priorTotals.keys()]))
          .map((k) => {
            const recent = (recentTotals.get(k) || 0) / win.recent.length;
            const prior = (priorTotals.get(k) || 0) / win.prior.length;
            const delta = recent - prior;
            const share = totalRecent > 0 ? recent / (totalRecent / win.recent.length) : 0;
            return { name: k, recent, prior, delta, share };
          })
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
          .slice(0, 10);

        return {
          kind: 'revenue',
          title: isCustomer ? 'Revenue drivers (customers)' : 'Revenue drivers (products)',
          methodology: `Ranked by absolute revenue change (recent ${baseCadence.windowSize} vs prior ${baseCadence.windowSize} ${baseCadence.label}).`,
          columns: [
            { key: 'name', label: isCustomer ? 'Customer' : 'Item', align: 'left', format: 'text' },
            { key: 'delta', label: 'Δ Revenue', align: 'right', format: 'money' },
            { key: 'recent', label: 'Recent', align: 'right', format: 'money' },
            { key: 'prior', label: 'Prior', align: 'right', format: 'money' },
            { key: 'share', label: 'Share', align: 'right', format: 'pct' },
          ],
          rows,
        };
      }

      const makeOpportunity = (input: {
        title: string;
        family: string;
        objective: 'Growth' | 'Margin' | 'Cash' | 'Risk';
        why: string[];
        summary?: string;
        evidence?: OpportunityEvidenceBundle | null;
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
            summary: input.summary || undefined,
            evidence: input.evidence || null,
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
      const defaultGrossMarginFloor = playbook.sector === 'PROFESSIONAL_SERVICES' ? 0.35 : 0.30;
      const grossMarginTarget = grossMarginBenchmark ?? defaultGrossMarginFloor;
      if (grossMarginTarget != null && grossMargin < grossMarginTarget - 0.02 && revenue > 0) {
        const gap = grossMarginTarget - grossMargin;
        const impactLow = revenue * gap * 0.5;
        const impactHigh = revenue * gap * 0.9;
        const marginEvidence = buildMarginEvidence({ targetBenchmarkPct: grossMarginBenchmark });
        const worstItems = (marginEvidence?.topItems || []).slice(0, 5).map((x) => x.itemName);
        makeOpportunity({
          title: 'Reduce discount leakage on high-margin segments',
          family: 'Pricing & packaging',
          objective: 'Margin',
          why: [
            `Gross margin ${formatPct(grossMargin)} vs target ${formatPct(grossMarginTarget)}.`,
            'Margin gap suggests pricing or mix improvement potential.',
            ...(worstItems.length ? [`Low-margin revenue is concentrated in: ${worstItems.join(', ')}.`] : []),
          ],
          summary: worstItems.length
            ? `Gross margin is below target. Recent product mix shows low-margin revenue concentrated in ${worstItems.slice(0, 3).join(', ')}.`
            : `Gross margin is below target; focus on discount leakage and product mix.`,
          evidence: marginEvidence,
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
            { description: worstItems.length ? `Pull margin detail for these items and top customers: ${worstItems.slice(0, 5).join(', ')}` : 'Export segment margin by product/customer from P&L; flag segments below target margin', owner: 'Finance', dueHorizon: 'today', dataReference: 'Product margin + customer mix' },
            { description: 'Define price floor and max discount % by segment; publish to quote tool', owner: 'Sales', dueHorizon: '48 hours', dataReference: 'Pricing policy' },
            { description: 'Pilot price floors on top 3 segments for 14 days; track win rate and discount variance', owner: 'Sales', dueHorizon: '7 days', dataReference: 'Win/loss + discount %' },
            { description: 'Review gross margin % and scrap/expedite; if no improvement in 14 days escalate to pricing committee', owner: 'Finance', dueHorizon: '14 days', dataReference: 'Gross margin %' },
          ],
          monitoring: {
            primaryKpi: `Gross margin % (${opsSnapshotFrequency})`,
            leadingIndicators: ['Discount % by segment (daily)', 'Scrap rate / expedite freight % (daily)', 'Win rate by segment (weekly)'],
            timeWindowDays: 14,
            stopContinueRule: 'If gross margin does not improve by 0.5 pts in 14 days or churn increases >0.5%, escalate to pricing committee; if scrap stays >3% for 3 consecutive days after containment, escalate to supplier action plan.',
          },
        });
      }

      // Working capital (DSO)
      const defaultDsoTarget = playbook.sector === 'PROFESSIONAL_SERVICES' ? 45 : 55;
      const dsoTarget = dsoBenchmark ?? defaultDsoTarget;
      if (dso != null && dsoTarget != null && dso > dsoTarget + 5 && revenue > 0) {
        const dsoGap = dso - dsoTarget;
        const cashImpact = (dsoGap / 30) * revenue;
        const arEvidence = buildArAgingEvidence();
        makeOpportunity({
          title: 'Tighten terms and collections to reduce DSO',
          family: 'Working capital (AR/AP/inventory)',
          objective: 'Cash',
          why: [
            `DSO ${formatDays(dso)} vs target ${formatDays(dsoTarget)}.`,
            'Cash conversion is slower than peer median.',
          ],
          summary: arEvidence?.methodology
            ? `DSO is above target; AR aging suggests where to focus. ${arEvidence.methodology}`
            : undefined,
          evidence: arEvidence,
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
            primaryKpi: `DSO (days sales outstanding, ${opsSnapshotFrequency})`,
            leadingIndicators: ['AR aging bucket mix (daily)', 'Over 60 days % (weekly)', 'Dispute count (weekly)'],
            timeWindowDays: 14,
            stopContinueRule: 'If DSO does not improve by 2+ days in 14 days, escalate to credit manager; if disputes spike >10%, pause and review process.',
          },
        });
      }

      // Cash stability (when 7-day avg cash drops materially)
      const cashEvidence = buildCashEvidence();
      if (cashEvidence?.meta && typeof cashEvidence.meta.delta === 'number' && typeof cashEvidence.meta.priorAvg === 'number') {
        const delta = Number(cashEvidence.meta.delta);
        const priorAvg = Math.max(1, Number(cashEvidence.meta.priorAvg));
        const pct = delta / priorAvg;
        if (pct <= -0.06) {
          const impact = Math.abs(delta) * 0.8;
          makeOpportunity({
            title: 'Stabilize cash and reduce volatility',
            family: 'Cash management',
            objective: 'Cash',
            why: [
              `7-day average cash is down ${(Math.abs(pct) * 100).toFixed(0)}% vs prior week.`,
              'Cash volatility often hides timing issues (collections/payables cadence) or unplanned spend.',
            ],
            summary: cashEvidence.methodology,
            evidence: cashEvidence,
            impactLow: impact * 0.5,
            impactHigh: impact,
            impactUnit: 'Cash',
            timeToSignalDays: 7,
            timeToRunRateDays: 30,
            dependencies: ['Cash forecast', 'AR/AP cadence', 'Spend approvals'],
            peerEvidence: 'Teams that implement a weekly cash cadence (forecast + approvals) reduce volatility and avoid reactive cuts.',
            tests: ['Run a 2-week cash cadence: weekly forecast, daily receipts/payables review, and approval threshold'],
            guardrails: ['Do not pause customer delivery or critical supplier payments without owner sign-off'],
            owner: 'Finance',
            nextAction: 'Stand up a weekly cash cadence and forecast',
            confidence: 0.55,
            feasibility: 0.75,
            metric: 'Cash',
            nextActions: [
              { description: 'Build a 13-week cash forecast and set weekly update cadence', owner: 'Finance', dueHorizon: 'today', dataReference: 'Cash + AR/AP snapshots' },
              { description: 'Set approval threshold for non-essential spend; review top outflows weekly', owner: 'Finance', dueHorizon: '48 hours', dataReference: 'Spend log / GL' },
              { description: 'Align AR collections and AP payment runs to forecast; avoid bunching payables', owner: 'Finance', dueHorizon: '7 days', dataReference: 'AR/AP cadence' },
            ],
            monitoring: {
              primaryKpi: 'Cash balance (daily)',
              leadingIndicators: ['Net cash change (daily)', 'Collections vs plan (weekly)', 'Payables due next 14 days (weekly)'],
              timeWindowDays: 14,
              stopContinueRule: 'If cash continues to decline after 14 days, escalate to spend freeze + collections sprint and re-forecast.',
            },
          });
        }
      }

      // Growth investment when margin strong + growth strong
      if (growth > 0.05 && (grossMarginBenchmark == null || grossMargin >= grossMarginBenchmark) && revenue > 0) {
        const revenueEvidence = buildRevenueDriversEvidence();
        const topNames =
          revenueEvidence?.rows
            ?.slice(0, 3)
            .map((r: any) => String(r.name))
            .filter(Boolean) ?? [];
        makeOpportunity({
          title: 'Scale channels while margin is strong',
          family: 'Sales efficiency & pipeline',
          objective: 'Growth',
          why: [
            `Revenue growth ${formatPct(growth)} over the recent ${opsWindowSize} ${opsFrequencyLabel}.`,
            `Gross margin ${formatPct(grossMargin)} ${grossMarginBenchmark != null ? `vs peer ${formatPct(grossMarginBenchmark)}` : 'is healthy'}.`,
            ...(topNames.length ? [`Growth drivers include: ${topNames.join(', ')}.`] : []),
          ],
          summary: topNames.length
            ? `Growth is strong and margin is healthy. Recent revenue change is driven by ${topNames.join(', ')} — scale the channels that bring more of these wins.`
            : undefined,
          evidence: revenueEvidence,
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
            primaryKpi: `Revenue (${opsSnapshotFrequency})`,
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
            primaryKpi: `Revenue growth % (${opsSnapshotFrequency})`,
            leadingIndicators: ['Pipeline added by channel (weekly)', 'Conversion % by channel (weekly)', 'Lead quality score (weekly)'],
            timeWindowDays: 30,
            stopContinueRule: 'If pipeline conversion stays <10% at 30 days, re-evaluate channel; escalate to sales leadership for channel mix review.',
          },
        });
      }

      // Inventory drag (if available)
      const defaultDioTarget = 60;
      const dioTarget = dioBenchmark ?? defaultDioTarget;
      if (dio != null && dioTarget != null && dio > dioTarget + 5 && cogs > 0 && inventory > 0) {
        const cashImpact = ((dio - dioTarget) / 30) * cogs;
        const invEvidence = buildInventoryEvidence();
        const topBuildItems = (invEvidence?.topItems || []).slice(0, 5).map((x) => x.itemName);
        makeOpportunity({
          title: 'Reduce inventory drag to free cash',
          family: 'COGS / procurement / supplier terms',
          objective: 'Cash',
          why: [
            `Inventory days ${formatDays(dio)} vs target ${formatDays(dioTarget)}.`,
            'Inventory turns imply excess working capital tied up.',
            ...(topBuildItems.length ? [`Inventory build is concentrated in: ${topBuildItems.join(', ')}.`] : []),
          ],
          summary: topBuildItems.length
            ? `Inventory days are above peer benchmark; inventory build is concentrated in ${topBuildItems.slice(0, 3).join(', ')}.`
            : `Inventory days are above peer benchmark; prioritize slow-moving/excess items.`,
          evidence: invEvidence,
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
            { description: topBuildItems.length ? `Review these top inventory-build items first: ${topBuildItems.join(', ')} (asset value up); confirm demand and reorder logic` : 'Export slow-moving and excess inventory by SKU ($ and days); assign owners by category', owner: 'Ops', dueHorizon: 'today', dataReference: 'Inventory + product sales by item' },
            { description: 'Review reorder points for top 10 SKUs; propose new targets with demand and lead time', owner: 'Ops', dueHorizon: '48 hours', dataReference: 'Reorder points + demand' },
            { description: 'Implement reorder point changes; track stockout rate and inventory days for 14 days', owner: 'Ops', dueHorizon: '7 days', dataReference: 'Stockout % + inventory days' },
            { description: 'Measure inventory days and cash released at 30 days; roll back if stockout >2%', owner: 'Ops', dueHorizon: '30 days', dataReference: 'Inventory days + stockout %' },
          ],
          monitoring: {
            primaryKpi: `Inventory days (${opsSnapshotFrequency})`,
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

    // If we still have no opportunities (common when benchmarks/financials are missing),
    // create additional operational-snapshot-driven opportunities so Actions/Monitor is useful.
    // NOTE: we do this even if there is already 1 opportunity (e.g. "Scale channels...") so
    // the page can show a richer 3–6 card set when ops snapshots are present.
    if (!findings.some((f) => f.type === 'opportunity' && String(f.metric || '') === 'AR / Collections')) {
      const arSeries = arSnapshots || [];
      const arCadence = getSeriesCadence(arSeries, opsSnapshotFrequency);
      if (arSeries.length >= Math.max(arCadence.windowSize * 2, 6) && opsSeries.length >= Math.max(arCadence.windowSize, 3)) {
        const recent = arSeries.slice(-arCadence.windowSize);
        const prior = arSeries.slice(-(arCadence.windowSize * 2), -arCadence.windowSize);
        const recentTotal = average(recent.map((r: any) => Number(r.totalAR || 0)));
        const priorTotal = average(prior.map((r: any) => Number(r.totalAR || 0)));
        const recentOver60 = average(recent.map((r: any) => Number((r.days31to60 || 0) + (r.days61to90 || 0) + (r.days90plus || 0))));
        const priorOver60 = average(prior.map((r: any) => Number((r.days31to60 || 0) + (r.days61to90 || 0) + (r.days90plus || 0))));
        const recentPct = recentTotal ? recentOver60 / recentTotal : 0;
        const priorPct = priorTotal ? priorOver60 / priorTotal : 0;
        const pctDelta = recentPct - priorPct;

        const revRecent = average(opsSeries.slice(-arCadence.windowSize).map((m: any) => Number(m.revenue || 0)));
        const dsoRecent = revRecent > 0 ? (recentTotal / revRecent) * 30 : null;

        if (pctDelta >= 0.03 || (dsoRecent != null && dsoRecent >= 60) || recentPct >= 0.22) {
          const cashImpact = Math.max(0, recentOver60 * 0.25); // conservative: assume 25% collectible improvement in 60–120 days
          const arEvidence = {
            kind: 'ar',
            title: 'AR aging breakdown',
            methodology: `Recent ${arCadence.windowSize} vs prior ${arCadence.windowSize} ${arCadence.label}. Over-60 mix: ${(recentPct * 100).toFixed(0)}% (${((recentPct - priorPct) * 100).toFixed(1)} pts).`,
            columns: [
              { key: 'bucket', label: 'Bucket', align: 'left', format: 'text' },
              { key: 'recent', label: 'Recent $', align: 'right', format: 'money' },
              { key: 'prior', label: 'Prior $', align: 'right', format: 'money' },
              { key: 'delta', label: 'Δ $', align: 'right', format: 'money' },
            ],
            rows: [
              { bucket: '0-30 days', recent: average(recent.map((r: any) => Number(r.current || 0))), prior: average(prior.map((r: any) => Number(r.current || 0))), delta: average(recent.map((r: any) => Number(r.current || 0))) - average(prior.map((r: any) => Number(r.current || 0))) },
              { bucket: '31-60 days', recent: average(recent.map((r: any) => Number(r.days1to30 || 0))), prior: average(prior.map((r: any) => Number(r.days1to30 || 0))), delta: average(recent.map((r: any) => Number(r.days1to30 || 0))) - average(prior.map((r: any) => Number(r.days1to30 || 0))) },
              { bucket: '61-90 days', recent: average(recent.map((r: any) => Number(r.days31to60 || 0))), prior: average(prior.map((r: any) => Number(r.days31to60 || 0))), delta: average(recent.map((r: any) => Number(r.days31to60 || 0))) - average(prior.map((r: any) => Number(r.days31to60 || 0))) },
              { bucket: '91-120 days', recent: average(recent.map((r: any) => Number(r.days61to90 || 0))), prior: average(prior.map((r: any) => Number(r.days61to90 || 0))), delta: average(recent.map((r: any) => Number(r.days61to90 || 0))) - average(prior.map((r: any) => Number(r.days61to90 || 0))) },
              { bucket: '120+ days', recent: average(recent.map((r: any) => Number(r.days90plus || 0))), prior: average(prior.map((r: any) => Number(r.days90plus || 0))), delta: average(recent.map((r: any) => Number(r.days90plus || 0))) - average(prior.map((r: any) => Number(r.days90plus || 0))) },
            ],
          };
          findings.push({
            type: 'opportunity',
            metric: 'AR / Collections',
            severity: cashImpact >= 100000 ? 'high' : cashImpact >= 40000 ? 'medium' : 'low',
            confidence: 0.55,
            payload: {
              title: 'Run a 2-week collections sprint on top overdue accounts',
              type: 'Working capital (AR/AP/inventory)',
              objective: 'Cash',
              summary: `AR >60 days is ${Math.round(recentPct * 100)}% (${pctDelta >= 0 ? '+' : ''}${Math.round(pctDelta * 100)} pts vs prior).`,
              evidence: arEvidence,
              why: [
                `AR >60 days mix increased ${(pctDelta * 100).toFixed(1)} pts.`,
                dsoRecent != null ? `Implied DSO ~${dsoRecent.toFixed(0)} days using operational revenue.` : 'Revenue basis not available to estimate DSO.',
              ],
              impact: { unit: 'Cash', low: cashImpact * 0.5, high: cashImpact, basis: 'Over-60 AR × assumed collectible lift' },
              timeToImpact: { signalDays: 7, runRateDays: 45, label: '45 days' },
              dependencies: ['Accurate AR aging', 'Customer contact list', 'Dispute resolution queue'],
              peerEvidence: 'Teams that prioritize top-dollar past-due invoices and clear disputes first typically reduce >60-day mix within 4–8 weeks.',
              validationTests: ['Work top 15 invoices by $ for 10 business days; measure promises-to-pay and cash collected'],
              guardrails: ['Customer escalation volume spike > 20% triggers review'],
              owner: 'Finance',
              status: 'Discover',
              nextAction: 'Generate top past-due list and assign owners',
              nextActions: [
                { description: 'Pull top 25 past-due invoices by $ and days; tag dispute vs collectable; assign owners', owner: 'Finance', dueHorizon: 'today', dataReference: 'AR aging' },
                { description: 'Create daily 15-minute standup for collections sprint; track promises-to-pay and receipts', owner: 'Finance', dueHorizon: '48 hours', dataReference: 'Collections tracker' },
                { description: 'Implement dispute SLA (POD/price) and escalation path; clear top blockers', owner: 'Ops', dueHorizon: '7 days', dataReference: 'Dispute queue' },
              ],
              monitoring: {
                primaryKpi: 'AR >60 days % (weekly)',
                leadingIndicators: ['Cash collected from past-due (daily)', 'Disputes opened vs closed (weekly)'],
                timeWindowDays: 14,
                stopContinueRule: 'If >60-day mix does not improve within 14 days, escalate to credit policy + exec outreach for top accounts.',
              },
              score: { value: 0.35, impact: 0.35, confidence: 0.55, feasibility: 0.75, timePenalty: 0.0, reason: 'Operational fallback opportunity (no benchmarks/financial uploads).' },
            },
          });
        }
      }
    }

    if (!findings.some((f) => f.type === 'opportunity' && String(f.metric || '') === 'Customer Concentration')) {
      const custSeries = customerSnapshots || [];
      const custCadence = getSeriesCadence(custSeries, opsSnapshotFrequency);
      if (custSeries.length >= Math.max(custCadence.windowSize * 2, 6)) {
        const latestDate = new Date(custSeries[custSeries.length - 1].snapshotDate).toISOString().slice(0, 10);
        const latestRows = custSeries.filter((r: any) => new Date(r.snapshotDate).toISOString().slice(0, 10) === latestDate);
        const totalRev = latestRows.reduce((sum: number, r: any) => sum + Number(r.revenue || 0), 0);
        if (totalRev > 0) {
          const ranked = [...latestRows].sort((a: any, b: any) => Number(b.revenue || 0) - Number(a.revenue || 0));
          const top = ranked.slice(0, 3);
          const topRev = top.reduce((sum: number, r: any) => sum + Number(r.revenue || 0), 0);
          const topShare = topRev / totalRev;
          const top1Share = Number(ranked[0]?.revenue || 0) / totalRev;
          if (topShare >= 0.6 || top1Share >= 0.3) {
            const names = top.map((r: any) => String(r.customerName || 'Customer')).slice(0, 3);
            const evidence = {
              kind: 'revenue',
              title: `Top customers (latest ${opsSnapshotFrequency})`,
              methodology: 'Revenue concentration on a small set of customers increases volatility and reduces pricing power.',
              columns: [
                { key: 'name', label: 'Customer', align: 'left', format: 'text' },
                { key: 'revenue', label: 'Revenue', align: 'right', format: 'money' },
                { key: 'share', label: 'Share', align: 'right', format: 'pct' },
              ],
              rows: ranked.slice(0, 8).map((r: any) => ({
                name: String(r.customerName || 'Customer'),
                revenue: Number(r.revenue || 0),
                share: totalRev > 0 ? Number(r.revenue || 0) / totalRev : 0,
              })),
            };
            findings.push({
              type: 'opportunity',
              metric: 'Customer Concentration',
              severity: top1Share >= 0.4 || topShare >= 0.75 ? 'high' : topShare >= 0.6 ? 'medium' : 'low',
              confidence: 0.55,
              payload: {
                title: 'Reduce customer concentration risk and smooth revenue',
                type: 'Sales efficiency & pipeline',
                objective: 'Risk',
                summary: `Top customers represent ${Math.round(topShare * 100)}% of recent ${opsSnapshotFrequency} revenue (${names.join(', ')}).`,
                evidence,
                why: [
                  `Top 1 customer share: ${Math.round(top1Share * 100)}%.`,
                  `Top 3 customer share: ${Math.round(topShare * 100)}%.`,
                ],
                impact: { unit: 'Revenue', low: totalRev * 0.03, high: totalRev * 0.08, basis: 'Reduce volatility via pipeline diversification' },
                timeToImpact: { signalDays: 30, runRateDays: 120, label: '120 days' },
                dependencies: ['Pipeline tracking', 'Segmented outreach list', 'Offer/package clarity'],
                peerEvidence: 'Diversified client mix reduces forecast volatility and improves pricing power over time.',
                validationTests: ['Stand up a 30-day outbound pilot targeting 2 new segments; track meetings booked and qualified pipeline'],
                guardrails: ['Do not over-discount to win diversification logos'],
                owner: 'Sales',
                status: 'Discover',
                nextAction: 'Define 2 target segments to diversify revenue',
                nextActions: [
                  { description: `Identify 2–3 target segments adjacent to current work; define ICP and offer`, owner: 'Sales', dueHorizon: 'today', dataReference: 'Customer list + win/loss' },
                  { description: 'Build a 50-account outreach list per segment; assign owners and cadence', owner: 'Sales', dueHorizon: '48 hours', dataReference: 'CRM / contact list' },
                  { description: 'Launch 30-day outreach pilot; measure meetings, SQLs, and pipeline added', owner: 'Sales', dueHorizon: '7 days', dataReference: 'Pipeline dashboard' },
                ],
                monitoring: {
                  primaryKpi: `Top 3 customer revenue share (${opsSnapshotFrequency})`,
                  leadingIndicators: ['Qualified pipeline added outside top accounts (weekly)', 'Meetings booked per segment (weekly)'],
                  timeWindowDays: 30,
                  stopContinueRule: 'If pipeline diversification does not improve within 30 days, revisit segments and messaging; avoid discounting below floor.',
                },
                score: { value: 0.34, impact: 0.30, confidence: 0.55, feasibility: 0.7, timePenalty: 0.0, reason: 'Operational fallback opportunity (customer snapshot concentration).' },
              },
            });
          }
        }
      }
    }

    if (!findings.some((f) => f.type === 'opportunity' && String(f.metric || '') === 'Pipeline / Growth')) {
      // Generic growth opportunity using ops-derived revenue trend when everything is "within bounds"
      // (or when benchmarks exist but don't match available fields yet).
      if (opsSeries.length >= Math.max(opsWindowSize * 2, 4)) {
        const windowSize = opsWindowSize;
        const recentRev = average(opsSeries.slice(-windowSize).map((m: any) => Number(m.revenue || 0)));
        const priorRev = average(opsSeries.slice(-(windowSize * 2), -windowSize).map((m: any) => Number(m.revenue || 0)));
        const growth = percentChange(recentRev, priorRev);
        if (Number.isFinite(growth) && growth < 0.03) {
          findings.push({
            type: 'opportunity',
            metric: 'Pipeline / Growth',
            severity: growth < -0.02 ? 'high' : growth < 0.01 ? 'medium' : 'low',
            confidence: 0.5,
            payload: {
              title: 'Tighten pipeline and replicate what is working',
              type: 'Sales efficiency & pipeline',
              objective: 'Growth',
              summary: `Operational revenue trend looks flat (recent vs prior: ${formatPct(growth)}).`,
              why: [
                'With flat growth, the fastest win is usually pipeline hygiene + focusing on highest-converting segments.',
              ],
              impact: { unit: 'Revenue', low: Math.max(0, recentRev) * 0.03, high: Math.max(0, recentRev) * 0.08, basis: 'Revenue × lift from conversion + segment focus' },
              timeToImpact: { signalDays: 30, runRateDays: 90, label: '90 days' },
              dependencies: ['Defined ICP', 'Pipeline stages + conversion tracking', 'Outbound list'],
              peerEvidence: 'Peers with consistent growth typically run weekly pipeline reviews and focus on segments with repeatable conversion.',
              validationTests: ['Pick top 2 segments; run 2-week outreach sprint; measure meetings booked and SQL conversion'],
              guardrails: ['Avoid discounting below floor to “buy” growth'],
              owner: 'Sales',
              status: 'Discover',
              nextAction: 'Pick segments and instrument conversion',
              nextActions: [
                { description: 'Pull last 90 days wins/losses; identify top 2 segments by conversion and margin', owner: 'Sales', dueHorizon: 'today', dataReference: 'Customer + product snapshots / CRM' },
                { description: 'Define 2-week outreach sprint (50 targets per segment); track meetings + SQLs', owner: 'Sales', dueHorizon: '48 hours', dataReference: 'Outreach list + tracker' },
                { description: 'Run weekly pipeline review; remove stalled deals; enforce stage exit criteria', owner: 'Sales', dueHorizon: '7 days', dataReference: 'Pipeline stage report' },
              ],
              monitoring: {
                primaryKpi: 'Qualified pipeline added (weekly)',
                leadingIndicators: ['Meetings booked (weekly)', 'SQL conversion % (weekly)', 'Discount % (weekly)'],
                timeWindowDays: 30,
                stopContinueRule: 'If meetings and SQL conversion do not improve in 30 days, change segments/messaging and revisit offer.',
              },
              score: { value: 0.32, impact: 0.28, confidence: 0.5, feasibility: 0.7, timePenalty: 0.0, reason: 'Operational fallback opportunity (flat growth).' },
            },
          });
        }
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

      if (focusTerms.length > 0) {
        const focusText = [
          finding.metric || '',
          String(finding.payload?.title || ''),
          String(finding.payload?.summary || ''),
          String(finding.payload?.likelyCause || ''),
          String(finding.payload?.whyNow || ''),
        ].join(' | ');
        const matchedTerm = findFocusMatch(focusText, focusTerms);
        if (matchedTerm) {
          finding.severity = escalateSeverity(finding.severity);
          finding.payload = {
            ...finding.payload,
            priorityFocus: true,
            priorityFocusTerm: matchedTerm,
            priorityFocusReason: 'Matches Operational Focus Areas watchlist',
          };
        }
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

    const debug = body?.includeDebug
      ? {
          industryGroupId,
          assetSizeCategory,
          benchmarksCount: benchmarks.length,
          monthlyFinancialCount: monthlyFinancials.length,
          opsSeriesCount: opsSeries.length,
          opportunitySeriesSource: useMonthlyFinancialSeries ? 'monthlyFinancials' : `ops:${opsSnapshotFrequency}`,
          snapshotCounts: {
            cash: cashSnapshots.length,
            ar: arSnapshots.length,
            ap: apSnapshots.length,
            customers: customerSnapshots.length,
            products: productSnapshots.length,
            inventory: inventorySnapshots.length,
          },
        }
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
      ...(debug ? { debug } : {}),
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
