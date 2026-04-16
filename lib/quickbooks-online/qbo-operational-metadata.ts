/**
 * QuickBooks Online operational load policy (Site Admin + orchestrator).
 * Stored on AccountingConnection.connectionMetadata (JSON).
 */

export type QboOperationalLoadMode = 'rolling_90' | 'backfill_3y_pending';

export type QboOperationalBackfillStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed';

export type QboOperationalBackfillState = {
  status: QboOperationalBackfillStatus;
  /** First month not yet completed, ISO YYYY-MM-01 (inclusive backfill cursor). */
  cursorMonth?: string;
  /** Inclusive end month for backfill, ISO YYYY-MM-01 */
  endMonth?: string;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  error?: string;
};

export type QboOperationalWindowOverride = {
  start: string;
  end: string;
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function readQboOperationalPendingLoad(metadata: unknown): QboOperationalLoadMode | null {
  const raw = asRecord(metadata).qboOperationalPendingLoad;
  if (raw === 'backfill_3y') return 'backfill_3y_pending';
  return null;
}

export function readQboOperationalBackfill(metadata: unknown): QboOperationalBackfillState | null {
  const raw = asRecord(metadata).qboOperationalBackfill;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const status = o.status;
  if (typeof status !== 'string') return null;
  return {
    status: status as QboOperationalBackfillStatus,
    cursorMonth: typeof o.cursorMonth === 'string' ? o.cursorMonth : undefined,
    endMonth: typeof o.endMonth === 'string' ? o.endMonth : undefined,
    startedAt: typeof o.startedAt === 'string' ? o.startedAt : undefined,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : undefined,
    completedAt: typeof o.completedAt === 'string' ? o.completedAt : undefined,
    error: typeof o.error === 'string' ? o.error : undefined,
  };
}

export function readQboOperationalWindowOverride(metadata: unknown): QboOperationalWindowOverride | null {
  const raw = asRecord(metadata).qboOperationalWindowOverride;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.start !== 'string' || typeof o.end !== 'string') return null;
  return { start: o.start, end: o.end };
}

/** Rolling window length in days (inclusive anchor). */
export const QBO_ROLLING_OPERATIONAL_DAYS = 90;

/** Max historical backfill from anchor date. */
export const QBO_BACKFILL_YEARS = 3;
