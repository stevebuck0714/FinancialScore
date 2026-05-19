import prisma from '@/lib/prisma';
import { AdapterFactory } from '@/lib/accounting-adapters/adapter-factory';
import {
  QBO_BACKFILL_YEARS,
  QBO_ROLLING_OPERATIONAL_DAYS,
  asRecord,
  readQboOperationalBackfill,
  readQboOperationalPendingLoad,
  type QboOperationalBackfillState,
} from '@/lib/quickbooks-online/qbo-operational-metadata';
import { deleteQuickBooksOperationalDataInRange } from '@/lib/quickbooks-online/delete-operational-range';

export type QboOperationalOrchestratorResult =
  | {
      kind: 'rolling_complete';
      recordsCreated: number;
      errors: string[];
      moduleCounts?: {
        cash: number;
        arAging: number;
        apAging: number;
        customers: number;
        products: number;
        inventory: number;
      };
    }
  | { kind: 'backfill_started' }
  | { kind: 'backfill_in_progress'; backfill: QboOperationalBackfillState }
  | { kind: 'idle' };

function normalizeDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addMonths(ymd: string, add: number): string {
  const base = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return ymd;
  base.setUTCMonth(base.getUTCMonth() + add);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function lastDayOfMonthUtc(ymd: string): Date {
  const [y, m] = ymd.split('-').map((v) => Number.parseInt(v, 10));
  return new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
}

function computeBackfillMonthBounds(metadata: unknown): { startMonth: string; endMonth: string } {
  const root = asRecord(metadata);
  const settings =
    root.quickbooksOnlineSettings && typeof root.quickbooksOnlineSettings === 'object' && !Array.isArray(root.quickbooksOnlineSettings)
      ? asRecord(root.quickbooksOnlineSettings)
      : {};
  const initialRaw = typeof settings.initialSyncStartDate === 'string' ? settings.initialSyncStartDate.trim() : '';
  const anchor = normalizeDay(new Date());
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  let start = new Date(anchor.getTime() - QBO_BACKFILL_YEARS * msPerYear);
  if (/^\d{4}-\d{2}-\d{2}$/.test(initialRaw)) {
    const parsed = new Date(`${initialRaw}T00:00:00`);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > start.getTime()) {
      start = parsed;
    }
  }
  const startMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`;
  const endMonth = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-01`;
  return { startMonth, endMonth };
}

async function mergeConnectionMetadata(
  connectionId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const row = await prisma.accountingConnection.findUnique({
    where: { id: connectionId },
    select: { connectionMetadata: true },
  });
  const existing =
    row?.connectionMetadata && typeof row.connectionMetadata === 'object' && !Array.isArray(row.connectionMetadata)
      ? (row.connectionMetadata as Record<string, unknown>)
      : {};
  await prisma.accountingConnection.update({
    where: { id: connectionId },
    data: {
      connectionMetadata: {
        ...existing,
        ...patch,
      } as any,
    },
  });
}

/**
 * Client-facing + manual sync entry: rolling 90 by default; first eligible sync kicks off 3y backfill (async worker).
 */
export async function orchestrateQuickBooksOnlineOperationalSync(companyId: string): Promise<QboOperationalOrchestratorResult> {
  const connection = await prisma.accountingConnection.findUnique({
    where: {
      companyId_platform: {
        companyId,
        platform: 'QUICKBOOKS',
      },
    },
    select: {
      id: true,
      companyId: true,
      status: true,
      accessToken: true,
      connectionMetadata: true,
    },
  });

  if (!connection?.accessToken) {
    return { kind: 'idle' };
  }

  const metadata = connection.connectionMetadata;
  const pending = readQboOperationalPendingLoad(metadata);
  const backfill = readQboOperationalBackfill(metadata);

  if (backfill?.status === 'running') {
    return { kind: 'backfill_in_progress', backfill };
  }

  if (pending === 'backfill_3y_pending') {
    const { startMonth, endMonth } = computeBackfillMonthBounds(metadata);
    const now = new Date().toISOString();
    await mergeConnectionMetadata(connection.id, {
      qboOperationalPendingLoad: null,
      qboOperationalBackfill: {
        status: 'running',
        cursorMonth: startMonth,
        endMonth,
        startedAt: now,
        updatedAt: now,
        error: undefined,
      },
    });

    await triggerBackfillWorker();

    return { kind: 'backfill_started' };
  }

  const anchor = normalizeDay(new Date());
  const windowStart = new Date(anchor);
  windowStart.setDate(windowStart.getDate() - (QBO_ROLLING_OPERATIONAL_DAYS - 1));

  await deleteQuickBooksOperationalDataInRange(companyId, windowStart, anchor);

  const adapter = await AdapterFactory.createFromConnection(connection.id, {
    connectionMetadataMerge: {
      qboOperationalWindowOverride: {
        start: windowStart.toISOString(),
        end: anchor.toISOString(),
      },
    },
  });

  const result = await adapter.syncAll('daily');

  return {
    kind: 'rolling_complete',
    recordsCreated: result.recordsCreated,
    errors: result.errors || [],
    moduleCounts: result.moduleCounts,
  };
}

export async function triggerBackfillWorker(): Promise<void> {
  const base = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || '';
  if (!base || !process.env.CRON_SECRET) {
    console.warn('[QBO backfill] Skip worker trigger: NEXTAUTH_URL/VERCEL_URL or CRON_SECRET missing');
    return;
  }
  const origin = base.startsWith('http') ? base : `https://${base}`;
  const url = `${origin.replace(/\/$/, '')}/api/cron/process-qbo-operational-backfill`;
  try {
    await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    });
  } catch (error) {
    console.error('[QBO backfill] Worker trigger failed:', error);
  }
}

/**
 * Processes one calendar month of a running backfill. Invoked from cron or after kickoff.
 */
export async function processQuickBooksOperationalBackfillStep(): Promise<{
  processed: boolean;
  companyId?: string;
  done?: boolean;
  error?: string;
}> {
  const candidates = await prisma.accountingConnection.findMany({
    where: {
      platform: 'QUICKBOOKS',
      status: 'ACTIVE',
    },
    select: {
      id: true,
      companyId: true,
      connectionMetadata: true,
    },
  });

  const running = candidates.find((c) => readQboOperationalBackfill(c.connectionMetadata)?.status === 'running');

  if (!running) {
    return { processed: false };
  }

  const backfill = readQboOperationalBackfill(running.connectionMetadata);
  if (!backfill || backfill.status !== 'running' || !backfill.cursorMonth || !backfill.endMonth) {
    return { processed: false };
  }

  const cursor = backfill.cursorMonth;
  const endMonth = backfill.endMonth;

  if (new Date(`${cursor}T00:00:00Z`).getTime() > new Date(`${endMonth}T00:00:00Z`).getTime()) {
    const now = new Date().toISOString();
    await mergeConnectionMetadata(running.id, {
      qboOperationalBackfill: {
        status: 'completed',
        cursorMonth: endMonth,
        endMonth,
        startedAt: backfill.startedAt,
        updatedAt: now,
        completedAt: now,
        error: null,
      },
    });
    return { processed: true, companyId: running.companyId, done: true };
  }

  const monthEnd = lastDayOfMonthUtc(cursor);
  const monthStart = new Date(`${cursor.slice(0, 10)}T00:00:00Z`);

  try {
    await deleteQuickBooksOperationalDataInRange(running.companyId, monthStart, monthEnd);

    const adapter = await AdapterFactory.createFromConnection(running.id, {
      connectionMetadataMerge: {
        qboOperationalWindowOverride: {
          start: monthStart.toISOString(),
          end: monthEnd.toISOString(),
        },
      },
    });

    const result = await adapter.syncAll('daily');
    const now = new Date().toISOString();

    if (!result.success) {
      await mergeConnectionMetadata(running.id, {
        qboOperationalBackfill: {
          ...backfill,
          status: 'failed',
          updatedAt: now,
          error: (result.errors || []).join(' | ').slice(0, 900),
        },
      });
      return {
        processed: true,
        companyId: running.companyId,
        error: (result.errors || []).join(' | '),
      };
    }

    const nextMonth = addMonths(cursor, 1);

    const finished = new Date(`${nextMonth}T00:00:00Z`).getTime() > new Date(`${endMonth}T00:00:00Z`).getTime();

    if (finished) {
      await mergeConnectionMetadata(running.id, {
        qboOperationalBackfill: {
          status: 'completed',
          cursorMonth: endMonth,
          endMonth,
          startedAt: backfill.startedAt,
          updatedAt: now,
          completedAt: now,
          error: null,
        },
      });
    } else {
      await mergeConnectionMetadata(running.id, {
        qboOperationalBackfill: {
          status: 'running',
          cursorMonth: nextMonth,
          endMonth,
          startedAt: backfill.startedAt,
          updatedAt: now,
          error: null,
        },
      });
      await triggerBackfillWorker();
    }

    return {
      processed: true,
      companyId: running.companyId,
      done: finished,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await mergeConnectionMetadata(running.id, {
      qboOperationalBackfill: {
        ...backfill,
        status: 'failed',
        updatedAt: new Date().toISOString(),
        error: message.slice(0, 900),
      },
    });
    return { processed: true, companyId: running.companyId, error: message };
  }
}
