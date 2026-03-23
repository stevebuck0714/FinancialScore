import { NextRequest, NextResponse } from 'next/server';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { pruneCompanyOperationalData, syncInforM3OperationalData } from '@/lib/infor-m3/operational-sync';
import prisma from '@/lib/prisma';
import { normalizeInforSystem } from '@/lib/infor-m3/system';

type Frequency = 'daily' | 'weekly' | 'monthly';
type SyncMode = 'daily_overlap' | 'backfill' | 'manual' | 'business_day_backfill';
type SyncWindow = { startDate: Date; endDate: Date; mode: SyncMode } | null;

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

      let recordsCreated = 0;
      const errors: string[] = [];
      let credentialSource: 'database' | 'env' | null = null;

      for (const businessDate of businessDates) {
        const dayStart = new Date(businessDate);
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(businessDate);
        dayEnd.setUTCHours(23, 59, 59, 999);
        const dayWindow = { startDate: dayStart, endDate: dayEnd, mode: 'manual' as const };

        const dayResult = await syncInforM3OperationalData(
          companyId,
          frequency,
          site,
          dayWindow,
          { snapshotDateOverride: businessDate, skipPrune: true }
        );
        recordsCreated += dayResult.recordsCreated;
        credentialSource = dayResult.credentialSource;
        if (dayResult.errors.length) {
          errors.push(...dayResult.errors.map((message) => `[${businessDate.toISOString().slice(0, 10)}] ${message}`));
        }
      }

      await pruneCompanyOperationalData(companyId);

      return NextResponse.json({
        ok: errors.length === 0,
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
        },
        recordsCreated,
        errors,
        credentialSource,
      });
    }

    const result = await syncInforM3OperationalData(companyId, frequency, site, syncWindow || undefined);
    return NextResponse.json({
      ok: result.success,
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
      credentialSource: result.credentialSource,
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
