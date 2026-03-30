import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { pruneCompanyOperationalData, syncInforM3OperationalData } from '@/lib/infor-m3/operational-sync';
import prisma from '@/lib/prisma';
import { normalizeInforSystem } from '@/lib/infor-m3/system';
import { randomUUID } from 'node:crypto';

export const maxDuration = 300;

type Frequency = 'daily' | 'weekly' | 'monthly';
type SyncMode = 'daily_overlap' | 'backfill' | 'manual' | 'business_day_backfill';
type SyncWindow = { startDate: Date; endDate: Date; mode: SyncMode } | null;
type SyncCursor = {
  mode: SyncMode;
  syncRunId: string;
  salesOnly?: boolean;
  programOffset: number;
  programBatchSize: number;
  requestOffset?: number;
  bookmark?: string | null;
  backfillMonths?: number;
  businessDateIndex?: number;
  stagnantCursorCount?: number;
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
    if (dow === 0) return new Date(Date.UTC(year, monthZeroBased, dayOfMonth + 1)); // Sunday -> Monday
    if (dow === 6) return new Date(Date.UTC(year, monthZeroBased, dayOfMonth - 1)); // Saturday -> Friday
    return actual;
  };

  for (let year = fromYear - 1; year <= toYear + 1; year += 1) {
    add(observed(year, 0, 1)); // New Year's Day
    add(nthWeekdayOfMonthUtc(year, 0, 1, 3)); // MLK Day (3rd Monday Jan)
    add(nthWeekdayOfMonthUtc(year, 1, 1, 3)); // Presidents Day (3rd Monday Feb)
    add(lastWeekdayOfMonthUtc(year, 4, 1)); // Memorial Day (last Monday May)
    add(observed(year, 5, 19)); // Juneteenth
    add(observed(year, 6, 4)); // Independence Day
    add(nthWeekdayOfMonthUtc(year, 8, 1, 1)); // Labor Day (1st Monday Sep)
    add(nthWeekdayOfMonthUtc(year, 9, 1, 2)); // Columbus Day (2nd Monday Oct)
    add(observed(year, 10, 11)); // Veterans Day
    add(nthWeekdayOfMonthUtc(year, 10, 4, 4)); // Thanksgiving (4th Thursday Nov)
    add(observed(year, 11, 25)); // Christmas Day
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

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const frequency = normalizeFrequency(body.frequency);
    const site = String(body.site || '').trim();
    const mode = normalizeMode(body.mode);
    const syncWindow = buildSyncWindow(body, frequency);
    const programBatchSize = Math.min(normalizePositiveInt(body.programBatchSize) ?? 1, 10);
    const requestedProgramOffset = normalizeNonNegativeInt(body.programOffset) ?? 0;
    const requestedRequestOffset = normalizeNonNegativeInt(body.requestOffset) ?? 0;
    const requestedBookmark =
      typeof body.bookmark === 'string' && body.bookmark.trim().length > 0 ? body.bookmark.trim() : null;
    const requestedStagnantCursorCount = normalizeNonNegativeInt(body.stagnantCursorCount) ?? 0;
    const requestedSyncRunId =
      typeof body.syncRunId === 'string' && body.syncRunId.trim().length > 0 ? body.syncRunId.trim() : null;
    const salesOnly = body.salesOnly === true || String(body.scope || '').trim().toLowerCase() === 'sales';
    const hasContinuationCursor = requestedProgramOffset > 0 || requestedRequestOffset > 0 || Boolean(requestedBookmark);
    const resetContinuationForMissingRunId = hasContinuationCursor && !requestedSyncRunId;
    const effectiveSyncRunId = requestedSyncRunId || randomUUID();
    const effectiveProgramOffset = resetContinuationForMissingRunId ? 0 : requestedProgramOffset;
    const effectiveRequestOffset = resetContinuationForMissingRunId ? 0 : requestedRequestOffset;
    const effectiveBookmark = resetContinuationForMissingRunId ? null : requestedBookmark;
    const effectiveStagnantCursorCount = resetContinuationForMissingRunId ? 0 : requestedStagnantCursorCount;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    const inforSystem = normalizeInforSystem(company?.accountingSystem);
    if (inforSystem === 'INFOR_CSI' && !site) {
      return NextResponse.json(
        {
          error: 'Missing required field: site',
          details: 'CSI operational sync requires site.',
        },
        { status: 400 }
      );
    }

    if (mode === 'business_day_backfill') {
      const months = normalizePositiveInt(body.backfillMonths) ?? 36;
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setMonth(startDate.getMonth() - months);
      const businessDates = enumerateBusinessDates(startDate, endDate);
      const defaultBusinessDateIndex = Math.max(0, businessDates.length - 1);
      const requestedBusinessDateIndex = normalizeNonNegativeInt(body.businessDateIndex);
      const businessDateIndex = Math.min(
        requestedBusinessDateIndex ?? defaultBusinessDateIndex,
        Math.max(0, businessDates.length - 1)
      );
      const businessDate = businessDates[businessDateIndex];

      if (!businessDate) {
        await pruneCompanyOperationalData(companyId);
        return NextResponse.json({
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
        });
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
          programOffset: effectiveProgramOffset,
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
          backfillMonths: months,
          businessDateIndex,
          programOffset: dayResult.continuation?.programOffset ?? dayResult.nextProgramOffset,
          programBatchSize,
          requestOffset: dayResult.continuation?.requestOffset ?? 0,
          bookmark: dayResult.continuation?.bookmark ?? null,
          stagnantCursorCount: effectiveStagnantCursorCount,
        };
      } else if (businessDateIndex > 0) {
        hasMore = true;
        cursor = {
          mode,
          syncRunId: effectiveSyncRunId,
          salesOnly: salesOnly || undefined,
          backfillMonths: months,
          businessDateIndex: businessDateIndex - 1,
          programOffset: 0,
          programBatchSize,
          stagnantCursorCount: 0,
        };
      } else {
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
          backfillMonths: months,
          businessDateIndex,
          programOffset: effectiveProgramOffset,
          programBatchSize,
          requestOffset: effectiveRequestOffset,
          bookmark: effectiveBookmark,
          stagnantCursorCount: effectiveStagnantCursorCount,
        };
        cursor = withStagnationState(previousCursor, cursor);
        if ((cursor.stagnantCursorCount || 0) >= 1) {
          // Recovery path: when cursor does not advance, immediately skip the stuck
          // request/program slice so the run can move on to subsequent programs.
          cursor = {
            ...cursor,
            programOffset: previousCursor.programOffset + Math.max(1, previousCursor.programBatchSize || 1),
            requestOffset: 0,
            bookmark: null,
            stagnantCursorCount: 0,
          };
        }
      }

      const warningOnly = isBookmarkStallWarningOnly(dayResult.errors);

      return NextResponse.json({
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
          businessDaysProcessed: businessDates.length - businessDateIndex + (dayResult.nextProgramOffset === null ? 0 : -1),
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
      });
    }

    const result = await syncInforM3OperationalData(companyId, frequency, site, syncWindow || undefined, {
      programOffset: effectiveProgramOffset,
      programLimit: programBatchSize,
      requestOffset: effectiveRequestOffset,
      bookmark: effectiveBookmark,
      syncRunId: effectiveSyncRunId,
      salesOnly,
    });
    const cursor: SyncCursor | null = result.hasMore
      ? {
          mode,
          syncRunId: effectiveSyncRunId,
          salesOnly: salesOnly || undefined,
          programOffset: (result.continuation?.programOffset ?? result.nextProgramOffset) || 0,
          programBatchSize,
          requestOffset: result.continuation?.requestOffset ?? 0,
          bookmark: result.continuation?.bookmark ?? null,
          stagnantCursorCount: effectiveStagnantCursorCount,
        }
      : null;
    if (result.hasMore && cursor) {
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
        programBatchSize,
        requestOffset: effectiveRequestOffset,
        bookmark: effectiveBookmark,
        stagnantCursorCount: effectiveStagnantCursorCount,
      };
      const nextCursor = withStagnationState(previousCursor, cursor);
      if ((nextCursor.stagnantCursorCount || 0) >= 1) {
        // Recovery path: when cursor does not advance, immediately skip the stuck
        // request/program slice so the run can move on to subsequent programs.
        (cursor as SyncCursor).programOffset = previousCursor.programOffset + Math.max(1, previousCursor.programBatchSize || 1);
        (cursor as SyncCursor).requestOffset = 0;
        (cursor as SyncCursor).bookmark = null;
        (cursor as SyncCursor).stagnantCursorCount = 0;
      } else {
        (cursor as SyncCursor).stagnantCursorCount = nextCursor.stagnantCursorCount;
      }
    }
    const warningOnly = isBookmarkStallWarningOnly(result.errors);
    return NextResponse.json({
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
      hasMore: result.hasMore,
      cursor,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to run Infor M3 operational sync',
        details: message,
      },
      { status }
    );
  }
}
