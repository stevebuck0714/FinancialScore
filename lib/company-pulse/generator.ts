import { createHash } from 'crypto';
import prisma from '@/lib/prisma';
import {
  PULSE_POLICY_OVERRIDE_KEY,
  getResolvedPulsePolicyValues,
  sanitizePulsePolicyOverrides,
} from '@/lib/company-pulse/policy';
import {
  ensurePulseAlertTables,
  syncPulseAlertsForCompany,
  type PulseAlertInput,
  type PulseAlertRow,
} from '@/lib/pulse-alerts';

export type PulseReadinessStatus = 'ready' | 'partial' | 'missing';

export type PulseReadinessItem = {
  key: string;
  label: string;
  status: PulseReadinessStatus;
  reason: string;
  lastUpdated?: string;
};

export type PulseCompanyCache = {
  companyId: string;
  cacheDate: string;
  dataVersion: string;
  status: string;
  generatedAt: Date | null;
  expiresAt: Date | null;
  alertCounts: Record<string, unknown>;
  readinessItems: PulseReadinessItem[];
  sourceNotes: string[];
  error: string | null;
  updatedAt: Date;
};

type GenerateOptions = {
  actorUserId?: string | null;
  actorEmail?: string | null;
};

type AgingSnapshot = {
  snapshotDate: Date;
  totalAR?: number;
  totalAP?: number;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
};

type CashSnapshot = {
  snapshotDate: Date;
  accountName: string;
  cashBalance: number;
};

type DailyFinancialRow = {
  snapshotDate: Date;
  revenue: number;
  expense: number;
  cogsTotal: number;
  depreciationAmortization?: number | null;
  cash?: number | null;
  ar?: number | null;
  ap?: number | null;
  loc?: number | null;
};

type SalesSnapshot = {
  snapshotDate: Date;
  customerName?: string | null;
  itemName?: string | null;
  sku?: string | null;
  revenue: number;
  cogs?: number | null;
  grossMargin?: number | null;
  grossMarginPct?: number | null;
  quantitySold?: number | null;
};

type FindingRow = {
  id: string;
  type: string | null;
  metric: string | null;
  severity: string | null;
  confidence: number | null;
  payload: any;
  updatedAt: Date;
};

const OPERATIONAL_FOCUS_KEY = '__focusWatchlist';
const EXECUTIVE_LOOKBACK_DAYS = 120;
const SALES_LOOKBACK_DAYS = 90;
const MATERIAL_REVENUE_DROP_PCT = -20;
const MATERIAL_GROSS_PROFIT_DROP_AMOUNT = -50000;
const CUSTOMER_CONCENTRATION_TOP1_PCT = 50;
const CUSTOMER_CONCENTRATION_TOP3_PCT = 80;
const SKU_CONCENTRATION_TOP1_PCT = 35;
const SKU_CONCENTRATION_TOP5_PCT = 40;
const LIQUIDITY_MIN_CASH_TO_LOC_PCT = 5;
const LIQUIDITY_MIN_CASH_TO_AR_PCT = 10;

function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

function dayOverDayPct(current: number, previous: number): number {
  if (!previous) return 0;
  return ((current - previous) / previous) * 100;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function monthKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function agingOver30(snapshot: AgingSnapshot, totalKey: 'totalAR' | 'totalAP'): number {
  return pct(
    asNumber(snapshot.days31to60) + asNumber(snapshot.days61to90) + asNumber(snapshot.days90plus),
    asNumber(snapshot[totalKey])
  );
}

function freshnessStatus(latest?: Date | null): PulseReadinessStatus {
  if (!latest) return 'missing';
  const ageHours = (Date.now() - latest.getTime()) / 36e5;
  if (ageHours <= 36) return 'ready';
  if (ageHours <= 96) return 'partial';
  return 'missing';
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function summarizeFinancialRows(rows: DailyFinancialRow[]): {
  revenue: number;
  grossProfit: number;
  expense: number;
  ebitda: number;
} {
  return rows.reduce(
    (acc, row) => {
      const revenue = asNumber(row.revenue);
      const cogs = asNumber(row.cogsTotal);
      const expense = asNumber(row.expense);
      acc.revenue += revenue;
      acc.grossProfit += revenue - cogs;
      acc.expense += expense;
      acc.ebitda += revenue - cogs - expense + asNumber(row.depreciationAmortization);
      return acc;
    },
    { revenue: 0, grossProfit: 0, expense: 0, ebitda: 0 }
  );
}

function aggregateRecentSales(
  rows: SalesSnapshot[],
  nameKey: 'customerName' | 'itemName'
): Array<{
  name: string;
  revenue: number;
  grossProfit: number;
  grossMarginPct: number;
  sku?: string | null;
}> {
  const dates = Array.from(new Set(rows.map((row) => row.snapshotDate.toISOString().slice(0, 10)))).sort();
  const recentDates = new Set(dates.slice(-6));
  const byName = new Map<string, { name: string; revenue: number; grossProfit: number; sku?: string | null }>();

  rows.forEach((row) => {
    if (!recentDates.has(row.snapshotDate.toISOString().slice(0, 10))) return;
    const name = String(row[nameKey] || '').trim();
    if (!name) return;
    const current = byName.get(name) || { name, revenue: 0, grossProfit: 0, sku: row.sku || null };
    const revenue = asNumber(row.revenue);
    const grossProfit =
      row.grossMargin != null ? asNumber(row.grossMargin) : revenue - asNumber(row.cogs);
    current.revenue += revenue;
    current.grossProfit += grossProfit;
    if (!current.sku && row.sku) current.sku = row.sku;
    byName.set(name, current);
  });

  return Array.from(byName.values())
    .map((row) => ({
      ...row,
      grossMarginPct: pct(row.grossProfit, row.revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

function extractPriorityFocusTerms(goals: Record<string, any>): string[] {
  const raw = goals?.[OPERATIONAL_FOCUS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return String(item.term || item.label || item.name || '');
      return '';
    })
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function isResolvedFinding(payload: any): boolean {
  const candidates = [
    payload?.status,
    payload?.state,
    payload?.resolutionStatus,
    payload?.workflowStatus,
  ].map((value) => String(value || '').trim().toLowerCase());
  return candidates.some((value) =>
    ['resolved', 'realized', 'closed', 'done', 'complete', 'completed'].includes(value)
  );
}

function buildAlertCounts(alerts: PulseAlertRow[]): Record<string, number> {
  const active = alerts.filter((alert) => alert.status !== 'resolved' && alert.isActive !== false);
  return {
    total: active.length,
    attention: active.filter((alert) => alert.bucket === 'attention').length,
    monitoring: active.filter((alert) => alert.bucket === 'monitoring').length,
    resolved: alerts.filter((alert) => alert.status === 'resolved').length,
  };
}

async function loadOperationalGoals(companyId: string): Promise<Record<string, any>> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ goals: any }>>(
      `SELECT "goals" FROM "OperationalGoal" WHERE "companyId" = $1 LIMIT 1`,
      companyId
    );
    return rows[0]?.goals && typeof rows[0].goals === 'object' ? rows[0].goals : {};
  } catch {
    return {};
  }
}

export async function getCompanyPulseContext(companyId: string): Promise<{
  goalsSnapshot: Record<string, any>;
  policyOverrides: Record<string, number>;
  industrySectorCategory: string | null;
}> {
  const [company, goalsSnapshot] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { industrySectorCategory: true },
    }),
    loadOperationalGoals(companyId),
  ]);
  return {
    goalsSnapshot,
    policyOverrides: sanitizePulsePolicyOverrides(goalsSnapshot[PULSE_POLICY_OVERRIDE_KEY]),
    industrySectorCategory: company?.industrySectorCategory || null,
  };
}

async function loadCriticalFindings(companyId: string): Promise<FindingRow[]> {
  try {
    return await prisma.$queryRawUnsafe<FindingRow[]>(
      `SELECT "id", "type", "metric", "severity", "confidence", "payload", "updatedAt"
       FROM "PerformanceFinding"
       WHERE "companyId" = $1
         AND LOWER(COALESCE("severity", '')) = 'critical'
       ORDER BY "updatedAt" DESC
       LIMIT 50`,
      companyId
    );
  } catch {
    return [];
  }
}

async function loadLatestCashDates(companyId: string): Promise<Array<{ snapshotDate: Date; totalCash: number }>> {
  const rows = await prisma.cashSnapshot.findMany({
    where: { companyId, frequency: 'daily' },
    orderBy: { snapshotDate: 'desc' },
    take: 250,
  });
  const byDate = new Map<string, { snapshotDate: Date; totalCash: number }>();
  rows.forEach((row) => {
    const key = row.snapshotDate.toISOString().slice(0, 10);
    const current = byDate.get(key) || { snapshotDate: row.snapshotDate, totalCash: 0 };
    current.totalCash += asNumber(row.cashBalance);
    byDate.set(key, current);
  });
  return Array.from(byDate.values())
    .sort((a, b) => b.snapshotDate.getTime() - a.snapshotDate.getTime())
    .slice(0, 2);
}

async function loadLatestCashAccounts(companyId: string, snapshotDate: Date): Promise<CashSnapshot[]> {
  const start = new Date(Date.UTC(snapshotDate.getUTCFullYear(), snapshotDate.getUTCMonth(), snapshotDate.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return prisma.cashSnapshot.findMany({
    where: {
      companyId,
      frequency: 'daily',
      snapshotDate: { gte: start, lt: end },
    },
    orderBy: { cashBalance: 'desc' },
    take: 20,
  });
}

export async function ensurePulseCompanyCacheTable(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PulseCompanyCache" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "companyId" TEXT NOT NULL,
      "cacheDate" TEXT NOT NULL,
      "dataVersion" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "generatedAt" TIMESTAMP,
      "expiresAt" TIMESTAMP,
      "alertCounts" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "readinessItems" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "sourceNotes" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "error" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PulseCompanyCache_company_key"
    ON "PulseCompanyCache"("companyId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "PulseCompanyCache_status_updated_idx"
    ON "PulseCompanyCache"("status", "updatedAt")
  `);
}

async function readPulseCompanyCache(companyId: string): Promise<PulseCompanyCache | null> {
  await ensurePulseCompanyCacheTable();
  const rows = await prisma.$queryRawUnsafe<PulseCompanyCache[]>(
    `SELECT "companyId", "cacheDate", "dataVersion", "status", "generatedAt", "expiresAt",
            "alertCounts", "readinessItems", "sourceNotes", "error", "updatedAt"
     FROM "PulseCompanyCache"
     WHERE "companyId" = $1
     LIMIT 1`,
    companyId
  );
  return rows[0] || null;
}

async function writePulseCompanyCache(params: {
  companyId: string;
  dataVersion: string;
  status: 'ready' | 'failed';
  alertCounts?: Record<string, unknown>;
  readinessItems?: PulseReadinessItem[];
  sourceNotes?: string[];
  error?: string | null;
}): Promise<void> {
  await ensurePulseCompanyCacheTable();
  const nowIso = new Date().toISOString();
  const expires = new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PulseCompanyCache"
      ("id", "companyId", "cacheDate", "dataVersion", "status", "generatedAt", "expiresAt", "alertCounts", "readinessItems", "sourceNotes", "error", "createdAt", "updatedAt")
     VALUES
      ($1, $2, $3, $4, $5, $6::timestamp, $7::timestamp, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12::timestamp, $13::timestamp)
     ON CONFLICT ("companyId") DO UPDATE
     SET "cacheDate" = EXCLUDED."cacheDate",
         "dataVersion" = EXCLUDED."dataVersion",
         "status" = EXCLUDED."status",
         "generatedAt" = EXCLUDED."generatedAt",
         "expiresAt" = EXCLUDED."expiresAt",
         "alertCounts" = EXCLUDED."alertCounts",
         "readinessItems" = EXCLUDED."readinessItems",
         "sourceNotes" = EXCLUDED."sourceNotes",
         "error" = EXCLUDED."error",
         "updatedAt" = EXCLUDED."updatedAt"`,
    `pc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    params.companyId,
    todayKey(),
    params.dataVersion,
    params.status,
    nowIso,
    expires,
    JSON.stringify(params.alertCounts || {}),
    JSON.stringify(params.readinessItems || []),
    JSON.stringify(params.sourceNotes || []),
    params.error || null,
    nowIso,
    nowIso
  );
}

export async function getCompanyPulseSnapshot(companyId: string): Promise<{
  alerts: PulseAlertRow[];
  cache: PulseCompanyCache | null;
}> {
  await ensurePulseAlertTables();
  const [alerts, cache] = await Promise.all([
    prisma.$queryRawUnsafe<PulseAlertRow[]>(
      `SELECT * FROM "PulseAlert"
       WHERE "companyId" = $1
         AND ("isActive" = TRUE OR "status" = 'resolved')
       ORDER BY COALESCE("priorityScore", 0) DESC, "modifiedAt" DESC`,
      companyId
    ),
    readPulseCompanyCache(companyId),
  ]);
  return { alerts, cache };
}

export async function generateCompanyPulse(companyId: string, options: GenerateOptions = {}): Promise<{
  alerts: PulseAlertRow[];
  cache: PulseCompanyCache | null;
  generatedInputs: {
    alertCount: number;
    readinessItems: PulseReadinessItem[];
    sourceNotes: string[];
  };
}> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, industrySectorCategory: true, accountingSystem: true },
  });
  if (!company) throw new Error('Company not found');

  const goals = await loadOperationalGoals(companyId);
  const policyOverrides = sanitizePulsePolicyOverrides(goals[PULSE_POLICY_OVERRIDE_KEY]);
  const policy = getResolvedPulsePolicyValues(policyOverrides, company.industrySectorCategory);
  const lookbackStart = addUtcDays(startOfUtcDay(new Date()), -EXECUTIVE_LOOKBACK_DAYS);
  const salesLookbackStart = addUtcDays(startOfUtcDay(new Date()), -SALES_LOOKBACK_DAYS);

  const [arRows, apRows, cashDates, dailyFinancialRows, customerRows, productRows, findings] = await Promise.all([
    prisma.aRAgingSnapshot.findMany({
      where: { companyId, frequency: 'daily' },
      orderBy: { snapshotDate: 'desc' },
      take: 8,
    }),
    prisma.aPAgingSnapshot.findMany({
      where: { companyId, frequency: 'daily' },
      orderBy: { snapshotDate: 'desc' },
      take: 8,
    }),
    loadLatestCashDates(companyId),
    prisma.dailyFinancialSnapshot.findMany({
      where: { companyId, frequency: 'daily', snapshotDate: { gte: lookbackStart } },
      orderBy: { snapshotDate: 'desc' },
      take: 150,
    }),
    prisma.customerSalesSnapshot.findMany({
      where: { companyId, snapshotDate: { gte: salesLookbackStart } },
      orderBy: { snapshotDate: 'desc' },
      take: 500,
    }),
    prisma.productSalesSnapshot.findMany({
      where: { companyId, snapshotDate: { gte: salesLookbackStart } },
      orderBy: { snapshotDate: 'desc' },
      take: 500,
    }),
    loadCriticalFindings(companyId),
  ]);

  const latestAr = arRows[0];
  const priorAr = arRows[1];
  const latestAp = apRows[0];
  const priorAp = apRows[1];
  const latestCash = cashDates[0];
  const priorCash = cashDates[1];
  const latestDaily = dailyFinancialRows[0];
  const latestCustomer = customerRows[0];
  const latestProduct = productRows[0];

  const readinessItems: PulseReadinessItem[] = [
    {
      key: 'ar-aging',
      label: 'AR aging snapshots',
      status: freshnessStatus(latestAr?.snapshotDate),
      reason: latestAr ? 'Latest daily AR aging snapshot is available.' : 'No daily AR aging snapshot found.',
      lastUpdated: iso(latestAr?.snapshotDate),
    },
    {
      key: 'ap-aging',
      label: 'AP aging snapshots',
      status: freshnessStatus(latestAp?.snapshotDate),
      reason: latestAp ? 'Latest daily AP aging snapshot is available.' : 'No daily AP aging snapshot found.',
      lastUpdated: iso(latestAp?.snapshotDate),
    },
    {
      key: 'cash',
      label: 'Cash snapshots',
      status: freshnessStatus(latestCash?.snapshotDate),
      reason: latestCash ? 'Latest daily cash snapshot is available.' : 'No daily cash snapshot found.',
      lastUpdated: iso(latestCash?.snapshotDate),
    },
    {
      key: 'daily-financials',
      label: 'Daily financial snapshots',
      status: freshnessStatus(latestDaily?.snapshotDate),
      reason: latestDaily ? 'Latest daily financial snapshot is available.' : 'No daily financial snapshot found.',
      lastUpdated: iso(latestDaily?.snapshotDate),
    },
    {
      key: 'customer-sales',
      label: 'Customer sales snapshots',
      status: freshnessStatus(latestCustomer?.snapshotDate),
      reason: latestCustomer ? 'Latest customer sales snapshot is available.' : 'No customer sales snapshot found.',
      lastUpdated: iso(latestCustomer?.snapshotDate),
    },
    {
      key: 'product-sales',
      label: 'Product sales snapshots',
      status: freshnessStatus(latestProduct?.snapshotDate),
      reason: latestProduct ? 'Latest product sales snapshot is available.' : 'No product sales snapshot found.',
      lastUpdated: iso(latestProduct?.snapshotDate),
    },
    {
      key: 'findings',
      label: 'Critical findings feed',
      status: findings.length > 0 ? 'ready' : 'partial',
      reason: findings.length > 0 ? `${findings.length} critical finding(s) available.` : 'No current critical findings returned.',
      lastUpdated: iso(findings[0]?.updatedAt),
    },
  ];

  const alerts: PulseAlertInput[] = [];
  const nowIso = new Date().toISOString();

  if (latestAr && priorAr) {
    const latestOver30 = agingOver30(latestAr, 'totalAR');
    const priorOver30 = agingOver30(priorAr, 'totalAR');
    const deltaPts = latestOver30 - priorOver30;
    if (
      latestOver30 >= policy['ar_daily_change.min_over30_pct'] &&
      deltaPts >= policy['ar_daily_change.min_delta_pts']
    ) {
      alerts.push({
        fingerprint: `ar-daily-change:${latestAr.snapshotDate.toISOString().slice(0, 10)}`,
        source: 'daily-change',
        title: 'AR aging deteriorated',
        detail: `AR over 30 days increased to ${latestOver30.toFixed(1)}%, up ${deltaPts.toFixed(1)} pts from the prior snapshot.`,
        owner: 'Finance Owner',
        drillView: 'working-capital',
        deltaText: `+${deltaPts.toFixed(1)} pts`,
        updatedAt: latestAr.snapshotDate.toISOString(),
        itemLabel: 'Accounts receivable',
        priorityScore: Math.min(100, Math.round(70 + deltaPts * 4)),
        bucket: 'attention',
        explainability: {
          triggerName: 'AR Daily Deterioration',
          formula: 'AR >30d % = (31-60 + 61-90 + 90+) / total AR * 100; delta = latest - previous',
          threshold: `latestOver30 >= ${policy['ar_daily_change.min_over30_pct']} and deltaPts >= ${policy['ar_daily_change.min_delta_pts']}`,
          reasonNow: `Latest ${latestOver30.toFixed(1)}%; previous ${priorOver30.toFixed(1)}%; delta ${deltaPts.toFixed(1)} pts`,
          policySource: 'Company Pulse policy',
          dataRefs: ['ARAgingSnapshot'],
          sourceTimestamp: latestAr.snapshotDate.toISOString(),
        },
      });
    }
    if (latestOver30 >= policy['ar_open_critical.min_over30_pct']) {
      alerts.push({
        fingerprint: `ar-open-critical:${latestAr.snapshotDate.toISOString().slice(0, 10)}`,
        source: 'open-critical',
        title: 'AR remains in critical aging range',
        detail: `AR over 30 days is ${latestOver30.toFixed(1)}%, above the ${policy['ar_open_critical.min_over30_pct']}% critical threshold.`,
        owner: 'Finance Owner',
        drillView: 'working-capital',
        updatedAt: latestAr.snapshotDate.toISOString(),
        itemLabel: 'Accounts receivable',
        priorityScore: Math.min(100, Math.round(80 + Math.max(0, latestOver30 - policy['ar_open_critical.min_over30_pct']))),
        bucket: 'attention',
        explainability: {
          triggerName: 'AR Open Critical',
          formula: 'AR >30d % compared to Company Pulse open-critical threshold',
          threshold: `AR >30d >= ${policy['ar_open_critical.min_over30_pct']}%`,
          reasonNow: `AR >30d ${latestOver30.toFixed(1)}%`,
          policySource: 'Company Pulse policy',
          dataRefs: ['ARAgingSnapshot'],
          sourceTimestamp: latestAr.snapshotDate.toISOString(),
        },
      });
    }
  }

  if (latestAp && priorAp) {
    const latestOver30 = agingOver30(latestAp, 'totalAP');
    const priorOver30 = agingOver30(priorAp, 'totalAP');
    const deltaPts = latestOver30 - priorOver30;
    if (
      latestOver30 >= policy['ap_daily_change.min_over30_pct'] &&
      deltaPts >= policy['ap_daily_change.min_delta_pts']
    ) {
      alerts.push({
        fingerprint: `ap-daily-change:${latestAp.snapshotDate.toISOString().slice(0, 10)}`,
        source: 'daily-change',
        title: 'AP aging pressure increased',
        detail: `AP over 30 days increased to ${latestOver30.toFixed(1)}%, up ${deltaPts.toFixed(1)} pts from the prior snapshot.`,
        owner: 'Finance Owner',
        drillView: 'working-capital',
        deltaText: `+${deltaPts.toFixed(1)} pts`,
        updatedAt: latestAp.snapshotDate.toISOString(),
        itemLabel: 'Accounts payable',
        priorityScore: Math.min(100, Math.round(68 + deltaPts * 4)),
        bucket: 'attention',
        explainability: {
          triggerName: 'AP Daily Deterioration',
          formula: 'AP >30d % = (31-60 + 61-90 + 90+) / total AP * 100; delta = latest - previous',
          threshold: `latestOver30 >= ${policy['ap_daily_change.min_over30_pct']} and deltaPts >= ${policy['ap_daily_change.min_delta_pts']}`,
          reasonNow: `Latest ${latestOver30.toFixed(1)}%; previous ${priorOver30.toFixed(1)}%; delta ${deltaPts.toFixed(1)} pts`,
          policySource: 'Company Pulse policy',
          dataRefs: ['APAgingSnapshot'],
          sourceTimestamp: latestAp.snapshotDate.toISOString(),
        },
      });
    }
    if (latestOver30 >= policy['ap_open_critical.min_over30_pct']) {
      alerts.push({
        fingerprint: `ap-open-critical:${latestAp.snapshotDate.toISOString().slice(0, 10)}`,
        source: 'open-critical',
        title: 'AP remains in critical aging range',
        detail: `AP over 30 days is ${latestOver30.toFixed(1)}%, above the ${policy['ap_open_critical.min_over30_pct']}% critical threshold.`,
        owner: 'Finance Owner',
        drillView: 'working-capital',
        updatedAt: latestAp.snapshotDate.toISOString(),
        itemLabel: 'Accounts payable',
        priorityScore: Math.min(100, Math.round(76 + Math.max(0, latestOver30 - policy['ap_open_critical.min_over30_pct']))),
        bucket: 'attention',
        explainability: {
          triggerName: 'AP Open Critical',
          formula: 'AP >30d % compared to Company Pulse open-critical threshold',
          threshold: `AP >30d >= ${policy['ap_open_critical.min_over30_pct']}%`,
          reasonNow: `AP >30d ${latestOver30.toFixed(1)}%`,
          policySource: 'Company Pulse policy',
          dataRefs: ['APAgingSnapshot'],
          sourceTimestamp: latestAp.snapshotDate.toISOString(),
        },
      });
    }
  }

  if (latestCash && priorCash) {
    const cashDelta = latestCash.totalCash - priorCash.totalCash;
    const cashDeltaPct = dayOverDayPct(latestCash.totalCash, priorCash.totalCash);
    if (
      cashDeltaPct <= policy['cash_daily_change.max_total_dod_pct'] ||
      cashDelta <= policy['cash_daily_change.max_total_dod_amount']
    ) {
      const accounts = await loadLatestCashAccounts(companyId, latestCash.snapshotDate);
      alerts.push({
        fingerprint: `cash-daily-change:${latestCash.snapshotDate.toISOString().slice(0, 10)}`,
        source: 'daily-change',
        title: 'Cash balance dropped materially',
        detail: `Total cash decreased ${formatMoney(Math.abs(cashDelta))} (${cashDeltaPct.toFixed(1)}%) from the prior snapshot.`,
        owner: 'Finance Owner',
        drillView: 'cash-flow',
        deltaText: `${cashDeltaPct.toFixed(1)}%`,
        updatedAt: latestCash.snapshotDate.toISOString(),
        itemLabel: accounts.length > 0 ? `${accounts.length} cash account(s)` : 'Cash',
        priorityScore: Math.min(100, Math.round(72 + Math.abs(cashDeltaPct))),
        bucket: 'attention',
        explainability: {
          triggerName: 'Cash Daily Deterioration',
          formula: 'Cash DoD % = (latest total cash - prior total cash) / prior total cash * 100',
          threshold: `cash DoD % <= ${policy['cash_daily_change.max_total_dod_pct']} or cash change <= ${policy['cash_daily_change.max_total_dod_amount']}`,
          reasonNow: `Latest ${formatMoney(latestCash.totalCash)}; previous ${formatMoney(priorCash.totalCash)}; delta ${cashDeltaPct.toFixed(1)}%`,
          policySource: 'Company Pulse policy',
          dataRefs: ['CashSnapshot'],
          sourceTimestamp: latestCash.snapshotDate.toISOString(),
        },
      });
    }
  }

  const orderedFinancialRows = [...dailyFinancialRows].sort(
    (a, b) => a.snapshotDate.getTime() - b.snapshotDate.getTime()
  );
  const currentMonth = latestDaily ? monthKey(latestDaily.snapshotDate) : todayKey().slice(0, 7);
  const completedRows = orderedFinancialRows.filter((row) => monthKey(row.snapshotDate) !== currentMonth);
  const rowsByMonth = new Map<string, DailyFinancialRow[]>();
  completedRows.forEach((row) => {
    const key = monthKey(row.snapshotDate);
    rowsByMonth.set(key, [...(rowsByMonth.get(key) || []), row]);
  });
  const completedMonthKeys = Array.from(rowsByMonth.keys()).sort();
  const latestCompletedMonthKey = completedMonthKeys[completedMonthKeys.length - 1];
  const priorCompletedMonthKey = completedMonthKeys[completedMonthKeys.length - 2];
  if (latestCompletedMonthKey && priorCompletedMonthKey) {
    const latestMonth = summarizeFinancialRows(rowsByMonth.get(latestCompletedMonthKey) || []);
    const priorMonth = summarizeFinancialRows(rowsByMonth.get(priorCompletedMonthKey) || []);
    const revenueDelta = latestMonth.revenue - priorMonth.revenue;
    const revenueDeltaPct = dayOverDayPct(latestMonth.revenue, priorMonth.revenue);
    const grossProfitDelta = latestMonth.grossProfit - priorMonth.grossProfit;
    const grossProfitDeltaPct = dayOverDayPct(latestMonth.grossProfit, priorMonth.grossProfit);
    if (revenueDeltaPct <= MATERIAL_REVENUE_DROP_PCT || grossProfitDelta <= MATERIAL_GROSS_PROFIT_DROP_AMOUNT) {
      alerts.push({
        fingerprint: `monthly-financial-deterioration:${latestCompletedMonthKey}`,
        source: 'open-critical',
        title: 'Monthly revenue and gross profit deteriorated',
        detail: `${monthLabel(latestCompletedMonthKey)} revenue was ${formatMoney(latestMonth.revenue)}, ${formatPct(revenueDeltaPct)} vs ${monthLabel(priorCompletedMonthKey)}; gross profit changed ${formatMoney(grossProfitDelta)} (${formatPct(grossProfitDeltaPct)}).`,
        owner: 'Finance Owner',
        drillView: 'performance-analytics',
        deltaText: `Revenue ${formatPct(revenueDeltaPct)}`,
        updatedAt: latestDaily?.snapshotDate.toISOString() || nowIso,
        itemLabel: monthLabel(latestCompletedMonthKey),
        priorityScore: Math.min(100, Math.round(78 + Math.max(0, Math.abs(revenueDeltaPct) - 20) / 2)),
        bucket: 'attention',
        explainability: {
          triggerName: 'Monthly Financial Deterioration',
          formula: 'Aggregate DailyFinancialSnapshot by completed month; compare latest completed month to prior completed month for revenue % and gross profit dollar movement',
          threshold: `revenueDeltaPct <= ${MATERIAL_REVENUE_DROP_PCT}% OR grossProfitDelta <= ${formatMoney(MATERIAL_GROSS_PROFIT_DROP_AMOUNT)}`,
          reasonNow: `Revenue delta ${formatMoney(revenueDelta)} (${formatPct(revenueDeltaPct)}); gross profit delta ${formatMoney(grossProfitDelta)} (${formatPct(grossProfitDeltaPct)})`,
          policySource: 'Company Pulse executive-risk rule',
          dataRefs: ['DailyFinancialSnapshot'],
          sourceTimestamp: latestDaily?.snapshotDate.toISOString(),
        },
      });
    }
  }

  if (latestDaily) {
    const balanceSheetCash = asNumber(latestDaily.cash);
    const balanceSheetAr = Math.abs(asNumber(latestDaily.ar));
    const balanceSheetAp = Math.abs(asNumber(latestDaily.ap));
    const loc = Math.abs(asNumber(latestDaily.loc));
    const cashToLocPct = pct(balanceSheetCash, loc);
    const cashToArPct = pct(balanceSheetCash, balanceSheetAr);
    if (
      balanceSheetCash > 0 &&
      ((loc > 0 && cashToLocPct < LIQUIDITY_MIN_CASH_TO_LOC_PCT) ||
        (balanceSheetAr > 0 && cashToArPct < LIQUIDITY_MIN_CASH_TO_AR_PCT))
    ) {
      alerts.push({
        fingerprint: `balance-sheet-liquidity:${latestDaily.snapshotDate.toISOString().slice(0, 10)}`,
        source: 'open-critical',
        title: 'Balance sheet liquidity is thin',
        detail: `Cash is ${formatMoney(balanceSheetCash)} vs AR ${formatMoney(balanceSheetAr)}, AP ${formatMoney(balanceSheetAp)}, and line of credit ${formatMoney(loc)}.`,
        owner: 'Finance Owner',
        drillView: 'cash-flow',
        deltaText: loc > 0 ? `Cash/LOC ${formatPct(cashToLocPct)}` : `Cash/AR ${formatPct(cashToArPct)}`,
        updatedAt: latestDaily.snapshotDate.toISOString(),
        itemLabel: 'Cash, AR, AP, LOC',
        priorityScore: Math.min(100, Math.round(82 + Math.max(0, LIQUIDITY_MIN_CASH_TO_LOC_PCT - cashToLocPct) * 2)),
        bucket: 'attention',
        explainability: {
          triggerName: 'Balance Sheet Liquidity / LOC Pressure',
          formula: 'Compare balance-sheet cash to AR and line-of-credit exposure from latest DailyFinancialSnapshot',
          threshold: `cash / LOC < ${LIQUIDITY_MIN_CASH_TO_LOC_PCT}% OR cash / AR < ${LIQUIDITY_MIN_CASH_TO_AR_PCT}%`,
          reasonNow: `Cash/LOC ${formatPct(cashToLocPct)}; Cash/AR ${formatPct(cashToArPct)}; AP ${formatMoney(balanceSheetAp)}`,
          policySource: 'Company Pulse executive-risk rule',
          dataRefs: ['DailyFinancialSnapshot.cash', 'DailyFinancialSnapshot.ar', 'DailyFinancialSnapshot.ap', 'DailyFinancialSnapshot.loc'],
          sourceTimestamp: latestDaily.snapshotDate.toISOString(),
        },
      });
    }
  }

  const customerSales = aggregateRecentSales(customerRows, 'customerName');
  const totalCustomerRevenue = customerSales.reduce((sum, row) => sum + row.revenue, 0);
  const topCustomer = customerSales[0];
  const topCustomerShare = pct(asNumber(topCustomer?.revenue), totalCustomerRevenue);
  const top3CustomerShare = pct(
    customerSales.slice(0, 3).reduce((sum, row) => sum + row.revenue, 0),
    totalCustomerRevenue
  );
  if (
    totalCustomerRevenue > 0 &&
    topCustomer &&
    (topCustomerShare >= CUSTOMER_CONCENTRATION_TOP1_PCT || top3CustomerShare >= CUSTOMER_CONCENTRATION_TOP3_PCT)
  ) {
    alerts.push({
      fingerprint: 'customer-concentration-risk',
      source: 'open-critical',
      title: 'Customer concentration risk is elevated',
      detail: `${topCustomer.name} is ${formatPct(topCustomerShare)} of recent customer revenue; top 3 customers are ${formatPct(top3CustomerShare)}.`,
      owner: 'Sales Lead',
      drillView: 'performance-analytics',
      deltaText: `Top customer ${formatPct(topCustomerShare)}`,
      updatedAt: latestCustomer?.snapshotDate.toISOString() || nowIso,
      itemLabel: topCustomer.name,
      priorityScore: Math.min(100, Math.round(70 + Math.max(topCustomerShare - 50, top3CustomerShare - 80))),
      bucket: 'attention',
      explainability: {
        triggerName: 'Customer Concentration Risk',
        formula: 'Recent top customer revenue / total recent customer revenue; top-3 revenue / total recent customer revenue',
        threshold: `top customer share >= ${CUSTOMER_CONCENTRATION_TOP1_PCT}% OR top 3 share >= ${CUSTOMER_CONCENTRATION_TOP3_PCT}%`,
        reasonNow: `Top customer ${formatPct(topCustomerShare)}; top 3 ${formatPct(top3CustomerShare)}; total recent revenue ${formatMoney(totalCustomerRevenue)}`,
        policySource: 'Company Pulse executive-risk rule',
        dataRefs: ['CustomerSalesSnapshot'],
        sourceTimestamp: latestCustomer?.snapshotDate.toISOString(),
      },
    });
  }

  const productSales = aggregateRecentSales(productRows, 'itemName');
  const totalProductRevenue = productSales.reduce((sum, row) => sum + row.revenue, 0);
  const topProduct = productSales[0];
  const topProductShare = pct(asNumber(topProduct?.revenue), totalProductRevenue);
  const top5ProductShare = pct(
    productSales.slice(0, 5).reduce((sum, row) => sum + row.revenue, 0),
    totalProductRevenue
  );
  if (
    totalProductRevenue > 0 &&
    topProduct &&
    (topProductShare >= SKU_CONCENTRATION_TOP1_PCT || top5ProductShare >= SKU_CONCENTRATION_TOP5_PCT)
  ) {
    const topProductLabel = topProduct.sku || topProduct.name;
    alerts.push({
      fingerprint: 'sku-concentration-risk',
      source: 'open-critical',
      title: 'SKU concentration risk is elevated',
      detail: `${topProductLabel} is ${formatPct(topProductShare)} of recent product revenue; top 5 SKUs are ${formatPct(top5ProductShare)}.`,
      owner: 'Operations Lead',
      drillView: 'performance-analytics',
      deltaText: `Top 5 ${formatPct(top5ProductShare)}`,
      updatedAt: latestProduct?.snapshotDate.toISOString() || nowIso,
      itemLabel: topProductLabel,
      priorityScore: Math.min(100, Math.round(65 + Math.max(topProductShare - 35, top5ProductShare - 75))),
      bucket: topProductShare >= 50 || top5ProductShare >= 85 ? 'attention' : 'monitoring',
      explainability: {
        triggerName: 'SKU Concentration / Margin Mix Risk',
        formula: 'Recent top SKU revenue / total recent product revenue; top-5 SKU revenue / total recent product revenue',
        threshold: `top SKU share >= ${SKU_CONCENTRATION_TOP1_PCT}% OR top 5 share >= ${SKU_CONCENTRATION_TOP5_PCT}%`,
        reasonNow: `Top SKU ${formatPct(topProductShare)} at ${formatMoney(topProduct.revenue)} revenue and ${formatPct(topProduct.grossMarginPct)} gross margin; top 5 ${formatPct(top5ProductShare)}`,
        policySource: 'Company Pulse executive-risk rule',
        dataRefs: ['ProductSalesSnapshot'],
        sourceTimestamp: latestProduct?.snapshotDate.toISOString(),
      },
    });
  }

  findings
    .filter((finding) => !isResolvedFinding(finding.payload))
    .slice(0, 12)
    .forEach((finding) => {
      const payload = finding.payload || {};
      const title = String(payload.title || payload.headline || finding.metric || 'Critical performance finding').trim();
      const detail = String(payload.detail || payload.summary || payload.description || 'Unresolved critical finding requires review.').trim();
      alerts.push({
        fingerprint: `finding:${finding.id}`,
        source: 'unresolved',
        title,
        detail,
        owner: String(payload.owner || payload.assignee || 'Ops/Finance Owner'),
        drillView: 'pa-critical-issues',
        updatedAt: finding.updatedAt.toISOString(),
        itemLabel: finding.metric || finding.type || 'Performance Analytics',
        priorityScore: Math.round(Math.min(100, 75 + asNumber(finding.confidence) * 10)),
        bucket: 'attention',
        explainability: {
          triggerName: 'Unresolved Critical Finding',
          formula: 'Critical PerformanceFinding with unresolved status',
          threshold: 'severity = critical and status not resolved',
          reasonNow: detail,
          policySource: 'Performance Analytics findings feed',
          dataRefs: ['PerformanceFinding'],
          sourceTimestamp: finding.updatedAt.toISOString(),
        },
      });
    });

  extractPriorityFocusTerms(goals).forEach((term) => {
    alerts.push({
      fingerprint: `focus-watch:${term.toLowerCase()}`,
      source: 'open-critical',
      title: `Priority Focus Watch: ${term}`,
      detail: `"${term}" is configured as a Company Pulse focus area for daily review.`,
      owner: 'Ops/Finance Owner',
      drillView: 'goals',
      updatedAt: nowIso,
      itemLabel: 'Priority Focus',
      priorityScore: 55,
      bucket: 'monitoring',
      priorityFocusTerm: term,
      explainability: {
        triggerName: 'Priority Focus Watch',
        formula: 'Configured operational focus term creates a monitoring item',
        threshold: 'Term exists in __focusWatchlist',
        reasonNow: `"${term}" configured as priority focus`,
        policySource: '__focusWatchlist operational goal',
        dataRefs: ['OperationalGoal'],
        sourceTimestamp: nowIso,
      },
    });
  });

  const dataVersion = createHash('sha256')
    .update(
      JSON.stringify({
        companyId,
        latestAr: iso(latestAr?.snapshotDate),
        latestAp: iso(latestAp?.snapshotDate),
        latestCash: iso(latestCash?.snapshotDate),
        latestDaily: iso(latestDaily?.snapshotDate),
        latestCustomer: iso(latestCustomer?.snapshotDate),
        latestProduct: iso(latestProduct?.snapshotDate),
        latestCompletedMonthKey,
        priorCompletedMonthKey,
        findings: findings.map((finding) => `${finding.id}:${iso(finding.updatedAt)}`),
        policyOverrides,
      })
    )
    .digest('hex');

  try {
    const syncedAlerts = await syncPulseAlertsForCompany({
      companyId,
      alerts,
      actorUserId: options.actorUserId || null,
      actorEmail: options.actorEmail || 'company-pulse-cron',
    });
    const sourceNotes = [
      `Generated from persisted daily snapshots for ${company.name}.`,
      'Company Pulse is cached after generation and loaded from PulseAlert/PulseCompanyCache for users.',
    ];
    await writePulseCompanyCache({
      companyId,
      dataVersion,
      status: 'ready',
      alertCounts: buildAlertCounts(syncedAlerts),
      readinessItems,
      sourceNotes,
    });
    return {
      alerts: syncedAlerts,
      cache: await readPulseCompanyCache(companyId),
      generatedInputs: { alertCount: alerts.length, readinessItems, sourceNotes },
    };
  } catch (error: any) {
    await writePulseCompanyCache({
      companyId,
      dataVersion,
      status: 'failed',
      readinessItems,
      error: String(error?.message || error).slice(0, 1000),
    });
    throw error;
  }
}
