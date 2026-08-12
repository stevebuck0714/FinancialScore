import prisma from '@/lib/prisma';
import {
  isQuickBooksAccountingSystem,
  listOperationalSystemConnections,
} from '@/lib/operational/operational-system-connections';

export type DailyBriefingMode = 'full' | 'ops-only' | 'none';

export type DailyBriefingCapability = {
  supportsDaily: boolean;
  mode: DailyBriefingMode;
  /** True when company books/accounting system is QBO (monthly-led). */
  isQuickBooksOnline: boolean;
  hasDailyFinancials: boolean;
  hasDailyOps: boolean;
  dailyFinancialDistinctDays: number;
  latestDailyFinancialDate: string | null;
  latestDailyOpsDate: string | null;
  dailyOpsFeeds: string[];
  dailyApiSources: Array<{ sourceCode: string; provider: string; lastSyncAt: string | null }>;
  reason: string;
};

const MS_IN_DAY = 24 * 60 * 60 * 1000;
/** How recent daily ops / DFS rows must be to unlock the Daily tab. */
export const DAILY_BRIEFING_FRESHNESS_DAYS = 7;
/** Prefer at least 2 DFS days so day-vs-prior-day comparisons can run. */
const MIN_FULL_MODE_DISTINCT_DAYS = 2;

function toYmd(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function maxYmd(values: Array<string | null | undefined>): string | null {
  const sorted = values.filter(Boolean).sort() as string[];
  return sorted.length ? sorted[sorted.length - 1] : null;
}

function isSpreadsheetProvider(provider: string): boolean {
  const normalized = String(provider || '').trim().toUpperCase();
  return (
    normalized === 'SPREADSHEET_UPLOAD' ||
    normalized === 'SPREADSHEET' ||
    normalized === 'EXCEL' ||
    normalized === 'CSV_UPLOAD'
  );
}

function freshnessCutoff(now = new Date()): Date {
  return new Date(now.getTime() - DAILY_BRIEFING_FRESHNESS_DAYS * MS_IN_DAY);
}

async function countDistinctDailyFinancialDays(companyId: string, since: Date): Promise<{
  distinctDays: number;
  latestDate: string | null;
}> {
  try {
    const rows = await prisma.dailyFinancialSnapshot.findMany({
      where: {
        companyId,
        frequency: 'daily',
        snapshotDate: { gte: since },
      },
      select: { snapshotDate: true },
      orderBy: { snapshotDate: 'desc' },
      take: 60,
    });
    const days = new Set(rows.map((row) => toYmd(row.snapshotDate)).filter(Boolean));
    return {
      distinctDays: days.size,
      latestDate: rows.length ? toYmd(rows[0].snapshotDate) : null,
    };
  } catch {
    return { distinctDays: 0, latestDate: null };
  }
}

async function latestDailyOpsFeedDates(companyId: string, since: Date): Promise<{
  feeds: string[];
  latestDate: string | null;
}> {
  const feedChecks: Array<{ label: string; run: () => Promise<Date | null> }> = [
    {
      label: 'product sales',
      run: async () => {
        const row = await prisma.productSalesSnapshot.findFirst({
          where: { companyId, frequency: 'daily', snapshotDate: { gte: since } },
          select: { snapshotDate: true },
          orderBy: { snapshotDate: 'desc' },
        });
        return row?.snapshotDate || null;
      },
    },
    {
      label: 'customer sales',
      run: async () => {
        const row = await prisma.customerSalesSnapshot.findFirst({
          where: { companyId, frequency: 'daily', snapshotDate: { gte: since } },
          select: { snapshotDate: true },
          orderBy: { snapshotDate: 'desc' },
        });
        return row?.snapshotDate || null;
      },
    },
    {
      label: 'cash',
      run: async () => {
        const row = await prisma.cashSnapshot.findFirst({
          where: { companyId, frequency: 'daily', snapshotDate: { gte: since } },
          select: { snapshotDate: true },
          orderBy: { snapshotDate: 'desc' },
        });
        return row?.snapshotDate || null;
      },
    },
    {
      label: 'AR aging',
      run: async () => {
        const row = await prisma.aRAgingSnapshot.findFirst({
          where: { companyId, frequency: 'daily', snapshotDate: { gte: since } },
          select: { snapshotDate: true },
          orderBy: { snapshotDate: 'desc' },
        });
        return row?.snapshotDate || null;
      },
    },
    {
      label: 'AP aging',
      run: async () => {
        const row = await prisma.aPAgingSnapshot.findFirst({
          where: { companyId, frequency: 'daily', snapshotDate: { gte: since } },
          select: { snapshotDate: true },
          orderBy: { snapshotDate: 'desc' },
        });
        return row?.snapshotDate || null;
      },
    },
    {
      label: 'inventory',
      run: async () => {
        const row = await prisma.inventorySnapshot.findFirst({
          where: { companyId, frequency: 'daily', snapshotDate: { gte: since } },
          select: { snapshotDate: true },
          orderBy: { snapshotDate: 'desc' },
        });
        return row?.snapshotDate || null;
      },
    },
  ];

  const results = await Promise.all(
    feedChecks.map(async (feed) => {
      try {
        const date = await feed.run();
        return { label: feed.label, date: toYmd(date) };
      } catch {
        return { label: feed.label, date: null as string | null };
      }
    })
  );

  const present = results.filter((row) => row.date);
  return {
    feeds: present.map((row) => row.label),
    latestDate: maxYmd(present.map((row) => row.date)),
  };
}

/**
 * Resolve whether Daily Exec Briefing should be offered, and which mode to run.
 * - full: daily books (DFS) available for day/MTD financial comparisons
 * - ops-only: no daily books, but fresh daily operational snapshots (API ops feeds)
 * - none: neither
 */
export async function resolveDailyBriefingCapability(
  companyId: string,
  opts?: { accountingSystem?: string | null; now?: Date }
): Promise<DailyBriefingCapability> {
  const now = opts?.now || new Date();
  const since = freshnessCutoff(now);

  let accountingSystem = opts?.accountingSystem;
  if (accountingSystem == null) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    accountingSystem = company?.accountingSystem || null;
  }

  const isQuickBooksOnline = isQuickBooksAccountingSystem(accountingSystem);

  const [dfs, opsFeeds, connections] = await Promise.all([
    countDistinctDailyFinancialDays(companyId, since),
    latestDailyOpsFeedDates(companyId, since),
    listOperationalSystemConnections(companyId).catch(() => []),
  ]);

  const disconnectedStatuses = new Set(['DISCONNECTED', 'DISABLED', 'ERROR', 'FAILED', 'INACTIVE']);
  const dailyApiSources = connections
    .filter((connection) => {
      const frequency = String(connection.syncFrequency || '').toLowerCase();
      const status = String(connection.status || '').trim().toUpperCase();
      if (frequency !== 'daily') return false;
      if (isSpreadsheetProvider(connection.provider)) return false;
      if (status && disconnectedStatuses.has(status)) return false;
      if (!connection.lastSyncAt) return false;
      return connection.lastSyncAt.getTime() >= since.getTime();
    })
    .map((connection) => ({
      sourceCode: connection.sourceCode,
      provider: connection.provider,
      lastSyncAt: connection.lastSyncAt ? connection.lastSyncAt.toISOString() : null,
    }));

  const hasDailyFinancials = dfs.distinctDays >= MIN_FULL_MODE_DISTINCT_DAYS;
  // Ops unlocks from actual daily-frequency snapshot rows (API syncs write these).
  // Daily API connections are recorded for source notes / diagnostics, not required alone.
  const hasDailyOps = opsFeeds.feeds.length > 0;

  let mode: DailyBriefingMode = 'none';
  if (hasDailyFinancials) mode = 'full';
  else if (hasDailyOps) mode = 'ops-only';

  const supportsDaily = mode !== 'none';

  let reason: string;
  if (mode === 'full') {
    reason = `Daily books available (${dfs.distinctDays} recent daily financial days).`;
  } else if (mode === 'ops-only') {
    reason = `Daily operational feeds available (${opsFeeds.feeds.join(', ')}); books remain monthly.`;
  } else if (isQuickBooksOnline) {
    reason =
      'QuickBooks Online books are monthly-only and no fresh daily operational snapshots were found.';
  } else {
    reason = 'No fresh daily financial or operational snapshots were found.';
  }

  return {
    supportsDaily,
    mode,
    isQuickBooksOnline,
    hasDailyFinancials,
    hasDailyOps,
    dailyFinancialDistinctDays: dfs.distinctDays,
    latestDailyFinancialDate: dfs.latestDate,
    latestDailyOpsDate: opsFeeds.latestDate,
    dailyOpsFeeds: opsFeeds.feeds,
    dailyApiSources,
    reason,
  };
}

export function shouldOfferDailyBriefingTab(capability: DailyBriefingCapability): boolean {
  // Non-QBO companies keep the existing Daily tab (CSI / DFS / etc.).
  if (!capability.isQuickBooksOnline) return true;
  return capability.supportsDaily;
}
