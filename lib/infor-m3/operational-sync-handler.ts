// @ts-nocheck
/**
 * Shared core for the Infor M3 operational sync request.
 *
 * Both code paths must produce identical behavior:
 *   1. HTTP path:  app/api/infor-m3/operational-sync POST handler
 *      - Authenticates the request via requireSiteAdminAuthorizedInforCompany
 *      - Calls runOperationalSyncRequest(body, companyId)
 *      - Wraps the result in NextResponse.json
 *
 *   2. In-process path: lib/infor-m3/sync-queue processTask
 *      - Authenticates via the worker secret (CRON_SECRET) it received from the
 *        queue tick caller, then trusts the companyId stored on the InforSyncTask
 *      - Calls runOperationalSyncRequest(body, companyId) directly
 *      - Skips Vercel HTTP, cold-start, and the 300s maxDuration cap
 *
 * IMPORTANT: This function MUST NOT perform authentication. The caller is
 * responsible for verifying that the requester is allowed to sync the given
 * companyId. The HTTP route uses requireSiteAdminAuthorizedInforCompany; the
 * worker uses the queue's worker-secret + DB-backed task scoping.
 */

import { randomUUID } from 'node:crypto';

import prisma from '@/lib/prisma';
import { normalizeInforSystem } from '@/lib/infor-m3/system';
import {
  pruneCompanyOperationalData,
  syncInforM3OperationalData,
} from '@/lib/infor-m3/operational-sync';

type Frequency = 'daily' | 'weekly' | 'monthly';
type SyncMode = 'daily_overlap' | 'backfill' | 'manual' | 'business_day_backfill';
type SyncWindow = { startDate: Date; endDate: Date; mode: SyncMode } | null;
type SyncCursor = {
  mode: SyncMode;
  syncRunId: string;
  salesOnly?: boolean;
  businessDayFanout?: boolean;
  businessDateIso?: string;
  programOffset: number;
  programEndOffset?: number;
  programBatchSize: number;
  requestOffset?: number;
  bookmark?: string | null;
  backfillMonths?: number;
  businessDateIndex?: number;
  stagnantCursorCount?: number;
};

export type OperationalSyncRequestBody = Record<string, unknown>;

export type OperationalSyncResponse = {
  status: number;
  body: Record<string, unknown>;
};

function isBookmarkStallWarningOnly(errors: string[] | undefined): boolean {
  if (!Array.isArray(errors) || errors.length === 0) return false;
  return errors.every((entry) =>
    String(entry || '').toLowerCase().includes('pagination bookmark did not advance')
  );
}

function normalizeBookmark(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function didCursorAdvance(previous: SyncCursor, next: SyncCursor): boolean {
  return !(
    previous.programOffset === next.programOffset &&
    (previous.requestOffset ?? 0) === (next.requestOffset ?? 0) &&
    normalizeBookmark(previous.bookmark) === normalizeBookmark(next.bookmark) &&
    (previous.businessDateIndex ?? 0) === (next.businessDateIndex ?? 0)
  );
}

function withStagnationState(previous: SyncCursor, next: SyncCursor): SyncCursor {
  const advanced = didCursorAdvance(previous, next);
  const previousCount = Math.max(0, Number(previous.stagnantCursorCount || 0));
  return {
    ...next,
    stagnantCursorCount: advanced ? 0 : previousCount + 1,
  };
}

function isCursorUnchangedFromRequest(params: {
  requestedProgramOffset: number;
  requestedRequestOffset: number;
  requestedBookmark: string | null;
  nextCursor: SyncCursor | null;
}): boolean {
  const { requestedProgramOffset, requestedRequestOffset, requestedBookmark, nextCursor } = params;
  if (!nextCursor) return false;
  return (
    nextCursor.programOffset === requestedProgramOffset &&
    (nextCursor.requestOffset ?? 0) === requestedRequestOffset &&
    normalizeBookmark(nextCursor.bookmark) === normalizeBookmark(requestedBookmark)
  );
}

function normalizeFrequency(value: unknown): Frequency {
  if (typeof value !== 'string') return 'daily';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'monthly') return 'monthly';
  return 'daily';
}

function normalizePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }
  return null;
}

function normalizeNonNegativeInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseBusinessDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  const normalized = raw.length === 10 ? `${raw}T00:00:00.000Z` : raw;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return atUtcMidnight(parsed);
}

function buildSyncWindow(body: Record<string, unknown>, frequency: Frequency): SyncWindow {
  const explicitStart = parseDate(body.startDate);
  const explicitEnd = parseDate(body.endDate);
  if (explicitStart && explicitEnd && explicitStart <= explicitEnd) {
    return { startDate: explicitStart, endDate: explicitEnd, mode: 'manual' };
  }

  const mode = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : '';
  const now = new Date();
  if (mode === 'backfill') {
    const months = normalizePositiveInt(body.backfillMonths) ?? 36;
    const start = new Date(now);
    start.setMonth(start.getMonth() - months);
    return { startDate: start, endDate: now, mode: 'backfill' };
  }

  if (frequency === 'daily') {
    const lookbackDays = normalizePositiveInt(body.lookbackDays) ?? 30;
    const start = new Date(now);
    start.setDate(start.getDate() - lookbackDays);
    return { startDate: start, endDate: now, mode: 'daily_overlap' };
  }

  return null;
}

function normalizeMode(value: unknown): SyncMode {
  const mode = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (mode === 'backfill') return 'backfill';
  if (mode === 'manual') return 'manual';
  if (mode === 'business_day_backfill') return 'business_day_backfill';
  return 'daily_overlap';
}

function normalizeCursorBounds(cursor: SyncCursor | null): SyncCursor | null {
  if (!cursor) return null;
  const endOffsetRaw = cursor.programEndOffset;
  if (typeof endOffsetRaw !== 'number' || !Number.isFinite(endOffsetRaw)) return cursor;
  const endOffset = Math.max(0, Math.floor(endOffsetRaw));
  const startOffset = Math.max(0, Math.floor(Number(cursor.programOffset || 0)));
  if (startOffset >= endOffset) {
    return null;
  }
  return {
    ...cursor,
    programOffset: startOffset,
    programEndOffset: endOffset,
  };
}

function atUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildUsFederalHolidaySet(fromDate: Date, toDate: Date): Set<string> {
  const fromYear = fromDate.getUTCFullYear();
  const toYear = toDate.getUTCFullYear();
  const keys = new Set<string>();

  const key = (d: Date): string => d.toISOString().slice(0, 10);
  const add = (d: Date) => keys.add(key(d));

  const nthWeekdayOfMonthUtc = (year: number, monthZeroBased: number, weekday: number, n: number): Date => {
    const first = new Date(Date.UTC(year, monthZeroBased, 1));
    const dayOffset = (weekday - first.getUTCDay() + 7) % 7;
    return new Date(Date.UTC(year, monthZeroBased, 1 + dayOffset + (n - 1) * 7));
  };

  const lastWeekdayOfMonthUtc = (year: number, monthZeroBased: number, weekday: number): Date => {
    const lastDay = new Date(Date.UTC(year, monthZeroBased + 1, 0));
    const dayOffset = (lastDay.getUTCDay() - weekday + 7) % 7;
    return new Date(Date.UTC(year, monthZeroBased, lastDay.getUTCDate() - dayOffset));
  };

  const observed = (year: number, monthZeroBased: number, dayOfMonth: number): Date => {
    const actual = new Date(Date.UTC(year, monthZeroBased, dayOfMonth));
    const dow = actual.getUTCDay();
    if (dow === 0) return new Date(Date.UTC(year, monthZeroBased, dayOfMonth + 1));
    if (dow === 6) return new Date(Date.UTC(year, monthZeroBased, dayOfMonth - 1));
    return actual;
  };

  for (let year = fromYear - 1; year <= toYear + 1; year += 1) {
    add(observed(year, 0, 1));
    add(nthWeekdayOfMonthUtc(year, 0, 1, 3));
    add(nthWeekdayOfMonthUtc(year, 1, 1, 3));
    add(lastWeekdayOfMonthUtc(year, 4, 1));
    add(observed(year, 5, 19));
    add(observed(year, 6, 4));
    add(nthWeekdayOfMonthUtc(year, 8, 1, 1));
    add(nthWeekdayOfMonthUtc(year, 9, 1, 2));
    add(observed(year, 10, 11));
    add(nthWeekdayOfMonthUtc(year, 10, 4, 4));
    add(observed(year, 11, 25));
  }

  return keys;
}

function enumerateBusinessDates(startDate: Date, endDate: Date): Date[] {
  const start = atUtcMidnight(startDate);
  const end = atUtcMidnight(endDate);
  const federalHolidays = buildUsFederalHolidaySet(start, end);
  const dates: Date[] = [];
  for (let cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dow = cursor.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const k = cursor.toISOString().slice(0, 10);
    if (federalHolidays.has(k)) continue;
    dates.push(new Date(cursor));
  }
  return dates;
}

/**
 * Run an Infor M3 operational sync request. Caller MUST pre-authenticate.
 *
 * @param body          Same shape as the JSON body POSTed to /api/infor-m3/operational-sync
 * @param companyId     Trusted companyId (already validated by caller)
 * @returns             { status, body } — caller wraps in NextResponse / forwards to queue
 */
export async function runOperationalSyncRequest(
  body: OperationalSyncRequestBody,
  companyId: string
): Promise<OperationalSyncResponse> {
  const rawIngestOnlyMode =
    String(process.env.INFOR_RAW_INGEST_ENABLED || '').trim().toLowerCase() === 'true' &&
    String(process.env.INFOR_RAW_INGEST_ONLY || '').trim().toLowerCase() === 'true';
  const allowRawIngestOnly = body.allowRawIngestOnly === true;
  const frequency = normalizeFrequency(body.frequency);
  const site = String(body.site || '').trim();
  const mode = normalizeMode(body.mode);
  const syncWindow = buildSyncWindow(body, frequency);

  if (rawIngestOnlyMode && !allowRawIngestOnly) {
    return {
      status: 409,
      body: {
        error:
          'Sync start blocked: INFOR_RAW_INGEST_ONLY is enabled. Disable raw-ingest-only for ingest+transform runs, or pass allowRawIngestOnly=true to acknowledge ingest-only behavior.',
      },
    };
  }

  if (mode === 'business_day_backfill' && (!parseDate(body.startDate) || !parseDate(body.endDate))) {
    return {
      status: 400,
      body: {
        error: 'Historical Daily Backfill requires explicit startDate and endDate (day-level).',
      },
    };
  }

  // Defensive guard: an explicit multi-day window with mode='manual' (or 'daily_overlap')
  // is almost always an unintended single-chunk sync that will silently leave snapshots
  // incomplete. Reject it and tell the caller to use 'business_day_backfill' instead.
  {
    const explicitStart = parseDate(body.startDate);
    const explicitEnd = parseDate(body.endDate);
    const carryingContinuation =
      (normalizeNonNegativeInt(body.programOffset) ?? 0) > 0 ||
      (normalizeNonNegativeInt(body.requestOffset) ?? 0) > 0 ||
      (typeof body.bookmark === 'string' && body.bookmark.trim().length > 0);
    if (
      explicitStart &&
      explicitEnd &&
      explicitStart.getTime() < explicitEnd.getTime() &&
      mode !== 'business_day_backfill' &&
      mode !== 'backfill' &&
      !carryingContinuation
    ) {
      const spanMs = explicitEnd.getTime() - explicitStart.getTime();
      const spanDays = spanMs / (24 * 60 * 60 * 1000);
      if (spanDays > 1.5) {
        return {
          status: 400,
          body: {
            error:
              "Explicit multi-day windows must use mode='business_day_backfill' so the run fans out one snapshot per business day. Single-shot manual/daily_overlap over a multi-day window only processes one chunk and leaves daily snapshots incomplete.",
            details: {
              providedMode: mode,
              spanDays: Math.round(spanDays * 100) / 100,
              hint: "Set mode='business_day_backfill' (the 'Run Historical Daily Backfill' option in the UI).",
            },
          },
        };
      }
    }
  }

  const programBatchSize = Math.min(normalizePositiveInt(body.programBatchSize) ?? 1, 10);
  const requestedProgramOffset = normalizeNonNegativeInt(body.programOffset) ?? 0;
  const requestedProgramEndOffset = normalizeNonNegativeInt(body.programEndOffset);
  const requestedRequestOffset = normalizeNonNegativeInt(body.requestOffset) ?? 0;
  const requestedBookmark =
    typeof body.bookmark === 'string' && body.bookmark.trim().length > 0 ? body.bookmark.trim() : null;
  const requestedStagnantCursorCount = normalizeNonNegativeInt(body.stagnantCursorCount) ?? 0;
  const requestedSyncRunId =
    typeof body.syncRunId === 'string' && body.syncRunId.trim().length > 0 ? body.syncRunId.trim() : null;
  const forceIngestOnly = body.forceIngestOnly === true;
  const deferDailySnapshotHydration = forceIngestOnly || body.deferDailySnapshotHydration === true;
  const salesOnly = body.salesOnly === true || String(body.scope || '').trim().toLowerCase() === 'sales';
  const hasContinuationCursor = requestedProgramOffset > 0 || requestedRequestOffset > 0 || Boolean(requestedBookmark);
  const resetContinuationForMissingRunId = hasContinuationCursor && !requestedSyncRunId;
  const effectiveSyncRunId = requestedSyncRunId || randomUUID();
  const effectiveProgramOffset = resetContinuationForMissingRunId ? 0 : requestedProgramOffset;
  const effectiveProgramEndOffset = resetContinuationForMissingRunId ? null : requestedProgramEndOffset;
  const effectiveRequestOffset = resetContinuationForMissingRunId ? 0 : requestedRequestOffset;
  const effectiveBookmark = resetContinuationForMissingRunId ? null : requestedBookmark;
  const effectiveStagnantCursorCount = resetContinuationForMissingRunId ? 0 : requestedStagnantCursorCount;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { accountingSystem: true },
  });
  const inforSystem = normalizeInforSystem(company?.accountingSystem);
  if (inforSystem === 'INFOR_CSI' && !site) {
    return {
      status: 400,
      body: {
        error: 'Missing required field: site',
        details: 'CSI operational sync requires site.',
      },
    };
  }

  if (mode === 'business_day_backfill') {
    const requestedBusinessDate = parseBusinessDate(body.businessDateIso);
    const businessDayFanout = body.businessDayFanout === true || Boolean(requestedBusinessDate);
    const explicitStartDate = parseDate(body.startDate);
    const explicitEndDate = parseDate(body.endDate);
    const hasExplicitWindow =
      Boolean(explicitStartDate) &&
      Boolean(explicitEndDate) &&
      (explicitStartDate as Date).getTime() <= (explicitEndDate as Date).getTime();

    const months = normalizePositiveInt(body.backfillMonths) ?? 36;
    const endDate = hasExplicitWindow ? (explicitEndDate as Date) : new Date();
    const startDate = hasExplicitWindow
      ? (explicitStartDate as Date)
      : (() => {
          const value = new Date(endDate);
          value.setMonth(value.getMonth() - months);
          return value;
        })();
    const businessDates = enumerateBusinessDates(startDate, endDate);
    const defaultBusinessDateIndex = Math.max(0, businessDates.length - 1);
    const requestedBusinessDateIndex = normalizeNonNegativeInt(body.businessDateIndex);
    let businessDateIndex = Math.min(
      requestedBusinessDateIndex ?? defaultBusinessDateIndex,
      Math.max(0, businessDates.length - 1)
    );
    let businessDate = businessDates[businessDateIndex];
    if (requestedBusinessDate) {
      const requestedIso = requestedBusinessDate.toISOString().slice(0, 10);
      const matchedIndex = businessDates.findIndex((entry) => entry.toISOString().slice(0, 10) === requestedIso);
      if (matchedIndex < 0) {
        return {
          status: 400,
          body: {
            error: 'Requested businessDateIso is outside configured backfill window.',
            details: {
              businessDateIso: requestedIso,
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
            },
          },
        };
      }
      businessDateIndex = matchedIndex;
      businessDate = businessDates[businessDateIndex];
    }

    if (!businessDate) {
      if (!businessDayFanout) {
        await pruneCompanyOperationalData(companyId);
      }
      return {
        status: 200,
        body: {
          ok: true,
          companyId,
          frequency,
          site,
          syncWindow: {
            mode,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
          businessDayBackfill: {
            holidayCalendar: 'US_FEDERAL',
            businessDaysProcessed: businessDates.length,
            businessDaysTotal: businessDates.length,
          },
          recordsCreated: 0,
          errors: [],
          credentialSource: null,
          hasMore: false,
          cursor: null,
        },
      };
    }

    const dayStart = new Date(businessDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(businessDate);
    dayEnd.setUTCHours(23, 59, 59, 999);
    const dayWindow = { startDate: dayStart, endDate: dayEnd, mode: 'manual' as const };
    const shouldPreserveCashSnapshotForSlice = businessDateIndex === defaultBusinessDateIndex;
    const dayResult = await syncInforM3OperationalData(
      companyId,
      frequency,
      site,
      dayWindow,
      {
        snapshotDateOverride: businessDate,
        preserveCashSnapshot: shouldPreserveCashSnapshotForSlice,
        skipPrune: true,
        ingestOnly: forceIngestOnly,
        deferDailySnapshotHydration,
        businessDayFanout,
        programOffset: effectiveProgramOffset,
        programEndOffset: effectiveProgramEndOffset ?? undefined,
        programLimit: programBatchSize,
        requestOffset: effectiveRequestOffset,
        bookmark: effectiveBookmark,
        syncRunId: effectiveSyncRunId,
        salesOnly,
      }
    );

    let hasMore = false;
    let cursor: SyncCursor | null = null;
    if (dayResult.nextProgramOffset !== null) {
      hasMore = true;
      cursor = {
        mode,
        syncRunId: effectiveSyncRunId,
        salesOnly: salesOnly || undefined,
        businessDayFanout: businessDayFanout || undefined,
        businessDateIso: businessDate.toISOString().slice(0, 10),
        backfillMonths: months,
        businessDateIndex,
        programOffset: dayResult.continuation?.programOffset ?? dayResult.nextProgramOffset,
        programEndOffset: dayResult.continuation?.programEndOffset ?? effectiveProgramEndOffset ?? undefined,
        programBatchSize,
        requestOffset: dayResult.continuation?.requestOffset ?? 0,
        bookmark: dayResult.continuation?.bookmark ?? null,
        stagnantCursorCount: effectiveStagnantCursorCount,
      };
    } else if (!businessDayFanout && businessDateIndex > 0) {
      hasMore = true;
      cursor = {
        mode,
        syncRunId: effectiveSyncRunId,
        salesOnly: salesOnly || undefined,
        backfillMonths: months,
        businessDateIndex: businessDateIndex - 1,
        programOffset: 0,
        programEndOffset: undefined,
        programBatchSize,
        stagnantCursorCount: 0,
      };
    } else if (!businessDayFanout) {
      await pruneCompanyOperationalData(companyId);
    }
    if (hasMore && cursor) {
      if (
        isCursorUnchangedFromRequest({
          requestedProgramOffset: effectiveProgramOffset,
          requestedRequestOffset: effectiveRequestOffset,
          requestedBookmark: effectiveBookmark,
          nextCursor: cursor,
        })
      ) {
        cursor = {
          ...cursor,
          programOffset: effectiveProgramOffset + Math.max(1, programBatchSize || 1),
          requestOffset: 0,
          bookmark: null,
          stagnantCursorCount: 0,
        };
      }
      const previousCursor: SyncCursor = {
        mode,
        syncRunId: effectiveSyncRunId,
        salesOnly: salesOnly || undefined,
        businessDayFanout: businessDayFanout || undefined,
        businessDateIso: businessDate.toISOString().slice(0, 10),
        backfillMonths: months,
        businessDateIndex,
        programOffset: effectiveProgramOffset,
        programEndOffset: effectiveProgramEndOffset ?? undefined,
        programBatchSize,
        requestOffset: effectiveRequestOffset,
        bookmark: effectiveBookmark,
        stagnantCursorCount: effectiveStagnantCursorCount,
      };
      cursor = withStagnationState(previousCursor, cursor);
      if ((cursor.stagnantCursorCount || 0) >= 1) {
        cursor = {
          ...cursor,
          programOffset: previousCursor.programOffset + Math.max(1, previousCursor.programBatchSize || 1),
          requestOffset: 0,
          bookmark: null,
          stagnantCursorCount: 0,
        };
      }
      cursor = normalizeCursorBounds(cursor);
      if (!cursor) {
        hasMore = false;
      }
    }

    const warningOnly = isBookmarkStallWarningOnly(dayResult.errors);

    return {
      status: 200,
      body: {
        ok: dayResult.success || warningOnly,
        companyId,
        frequency,
        site,
        syncWindow: {
          mode,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        businessDayBackfill: {
          holidayCalendar: 'US_FEDERAL',
          businessDaysProcessed: businessDayFanout
            ? 1
            : businessDates.length - businessDateIndex + (dayResult.nextProgramOffset === null ? 0 : -1),
          businessDaysTotal: businessDates.length,
          currentBusinessDate: businessDate.toISOString().slice(0, 10),
        },
        recordsCreated: dayResult.recordsCreated,
        errors: dayResult.errors.map((message) => `[${businessDate.toISOString().slice(0, 10)}] ${message}`),
        warningOnly,
        credentialSource: dayResult.credentialSource,
        syncRunId: effectiveSyncRunId,
        hasMore,
        cursor,
      },
    };
  }

  const result = await syncInforM3OperationalData(companyId, frequency, site, syncWindow || undefined, {
    ingestOnly: forceIngestOnly,
    deferDailySnapshotHydration,
    programOffset: effectiveProgramOffset,
    programEndOffset: effectiveProgramEndOffset ?? undefined,
    programLimit: programBatchSize,
    requestOffset: effectiveRequestOffset,
    bookmark: effectiveBookmark,
    syncRunId: effectiveSyncRunId,
    salesOnly,
  });
  let hasMore = result.hasMore;
  let cursor: SyncCursor | null = result.hasMore
    ? {
        mode,
        syncRunId: effectiveSyncRunId,
        salesOnly: salesOnly || undefined,
        programOffset: (result.continuation?.programOffset ?? result.nextProgramOffset) || 0,
        programEndOffset: result.continuation?.programEndOffset ?? effectiveProgramEndOffset ?? undefined,
        programBatchSize,
        requestOffset: result.continuation?.requestOffset ?? 0,
        bookmark: result.continuation?.bookmark ?? null,
        stagnantCursorCount: effectiveStagnantCursorCount,
      }
    : null;
  if (hasMore && cursor) {
    if (
      isCursorUnchangedFromRequest({
        requestedProgramOffset: effectiveProgramOffset,
        requestedRequestOffset: effectiveRequestOffset,
        requestedBookmark: effectiveBookmark,
        nextCursor: cursor,
      })
    ) {
      (cursor as SyncCursor).programOffset = effectiveProgramOffset + Math.max(1, programBatchSize || 1);
      (cursor as SyncCursor).requestOffset = 0;
      (cursor as SyncCursor).bookmark = null;
      (cursor as SyncCursor).stagnantCursorCount = 0;
    }
    const previousCursor: SyncCursor = {
      mode,
      syncRunId: effectiveSyncRunId,
      salesOnly: salesOnly || undefined,
      programOffset: effectiveProgramOffset,
      programEndOffset: effectiveProgramEndOffset ?? undefined,
      programBatchSize,
      requestOffset: effectiveRequestOffset,
      bookmark: effectiveBookmark,
      stagnantCursorCount: effectiveStagnantCursorCount,
    };
    const nextCursor = withStagnationState(previousCursor, cursor);
    if ((nextCursor.stagnantCursorCount || 0) >= 1) {
      (cursor as SyncCursor).programOffset = previousCursor.programOffset + Math.max(1, previousCursor.programBatchSize || 1);
      (cursor as SyncCursor).requestOffset = 0;
      (cursor as SyncCursor).bookmark = null;
      (cursor as SyncCursor).stagnantCursorCount = 0;
    } else {
      (cursor as SyncCursor).stagnantCursorCount = nextCursor.stagnantCursorCount;
    }
    cursor = normalizeCursorBounds(cursor as SyncCursor);
    if (!cursor) {
      hasMore = false;
    }
  }
  const warningOnly = isBookmarkStallWarningOnly(result.errors);
  return {
    status: 200,
    body: {
      ok: result.success || warningOnly,
      companyId,
      frequency,
      site,
      syncWindow: syncWindow
        ? {
            mode: syncWindow.mode,
            startDate: syncWindow.startDate.toISOString(),
            endDate: syncWindow.endDate.toISOString(),
          }
        : null,
      recordsCreated: result.recordsCreated,
      errors: result.errors,
      warningOnly,
      credentialSource: result.credentialSource,
      syncRunId: effectiveSyncRunId,
      hasMore,
      cursor,
    },
  };
}

export function isInforSyncInProcessWorkerEnabled(): boolean {
  const raw = String(process.env.INFOR_SYNC_INPROCESS_WORKER || '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}
