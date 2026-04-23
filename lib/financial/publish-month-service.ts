import prisma from '@/lib/prisma';
import { BS_LAST_DAY_FIELDS, parseMonthInput, PNL_SUM_FIELDS, safeNumber } from '@/lib/financial/month-publish';
import { monthKey } from '@/lib/date-utils';

export type PublishMonthParams = {
  companyId: string;
  month: string; // YYYY-MM
  force?: boolean;
  actingUserId?: string | null;
  backfillMonths?: number;
};

type DailySnapshotRow = {
  snapshotDate: Date;
  sourceRunId?: string | null;
  [key: string]: unknown;
};

type DailySnapshotDelegate = {
  findMany: (args: unknown) => Promise<DailySnapshotRow[]>;
};

type FinancialMonthPublishDelegate = {
  findUnique: (args: unknown) => Promise<{ status?: string | null } | null>;
  upsert: (args: unknown) => Promise<unknown>;
  count: (args: unknown) => Promise<number>;
};

function getDailySnapshotDelegate(): DailySnapshotDelegate | null {
  const delegate = (prisma as unknown as Record<string, unknown>).dailyFinancialSnapshot as Record<string, unknown> | undefined;
  if (!delegate || typeof delegate.findMany !== 'function') return null;
  return delegate as unknown as DailySnapshotDelegate;
}

function getFinancialMonthPublishDelegate(): FinancialMonthPublishDelegate | null {
  const delegate = (prisma as unknown as Record<string, unknown>).financialMonthPublish as Record<string, unknown> | undefined;
  if (
    !delegate ||
    typeof delegate.findUnique !== 'function' ||
    typeof delegate.upsert !== 'function' ||
    typeof delegate.count !== 'function'
  ) {
    return null;
  }
  return delegate as unknown as FinancialMonthPublishDelegate;
}

export async function publishMonthFromDailySnapshots(params: PublishMonthParams): Promise<{
  success: boolean;
  companyId: string;
  month: string;
  mode: 'INITIAL_BACKFILL' | 'INCREMENTAL';
  monthsPublished: number;
  publishedMonths: string[];
  skippedMonths: string[];
  snapshotDays: number;
  monthEndSnapshotDate: Date | null;
  error?: string;
}> {
  const companyId = String(params.companyId || '').trim();
  const month = String(params.month || '').trim();
  const force = Boolean(params.force);
  const actingUserId = params.actingUserId || null;
  const backfillMonths = Math.max(1, Math.min(36, Number(params.backfillMonths || 36)));

  if (!companyId || !month) {
    return {
      success: false,
      companyId,
      month,
      mode: 'INCREMENTAL',
      monthsPublished: 0,
      publishedMonths: [],
      skippedMonths: [],
      snapshotDays: 0,
      monthEndSnapshotDate: null,
      error: 'companyId and month (YYYY-MM) are required',
    };
  }

  const parsed = parseMonthInput(month);
  if (!parsed) {
    return {
      success: false,
      companyId,
      month,
      mode: 'INCREMENTAL',
      monthsPublished: 0,
      publishedMonths: [],
      skippedMonths: [],
      snapshotDays: 0,
      monthEndSnapshotDate: null,
      error: 'Invalid month format. Use YYYY-MM.',
    };
  }

  const { monthStart, monthEnd } = parsed;
  const dailySnapshotDelegate = getDailySnapshotDelegate();
  const publishDelegate = getFinancialMonthPublishDelegate();
  if (!dailySnapshotDelegate || !publishDelegate) {
    return {
      success: false,
      companyId,
      month,
      mode: 'INCREMENTAL',
      monthsPublished: 0,
      publishedMonths: [],
      skippedMonths: [],
      snapshotDays: 0,
      monthEndSnapshotDate: null,
      error: 'Daily publish models are not available. Run prisma migrate + prisma generate.',
    };
  }

  // UTC-only. See lib/date-utils.ts. Local-TZ accessors here used to
  // mis-classify boundary snapshots (eg. 2026-03-01T00:00:00Z) into the
  // previous month when the writer ran on a developer's laptop in PT.
  const monthKeyFromDate = (date: Date): string => monthKey(date) || '';

  const publishSingleMonth = async (targetMonth: string): Promise<{
    success: boolean;
    month: string;
    snapshotDays: number;
    monthEndSnapshotDate: Date | null;
    error?: string;
  }> => {
    const targetParsed = parseMonthInput(targetMonth);
    if (!targetParsed) {
      return { success: false, month: targetMonth, snapshotDays: 0, monthEndSnapshotDate: null, error: 'Invalid month format. Use YYYY-MM.' };
    }
    const { monthStart: targetMonthStart, monthEnd: targetMonthEnd } = targetParsed;

    const existingPublish = await publishDelegate.findUnique({
      where: { companyId_monthStart: { companyId, monthStart: targetMonthStart } },
    });
    if (existingPublish?.status === 'LOCKED' && !force) {
      return {
        success: false,
        month: targetMonth,
        snapshotDays: 0,
        monthEndSnapshotDate: null,
        error: 'Month is locked. Pass force=true to override.',
      };
    }

    const snapshots = await dailySnapshotDelegate.findMany({
      where: {
        companyId,
        frequency: 'daily',
        snapshotDate: {
          gte: targetMonthStart,
          lte: targetMonthEnd,
        },
      },
      orderBy: { snapshotDate: 'asc' },
    });

    if (!snapshots.length) {
      return {
        success: false,
        month: targetMonth,
        snapshotDays: 0,
        monthEndSnapshotDate: null,
        error: 'No daily financial snapshots found for requested month',
      };
    }

    const pnlTotals: Record<string, number> = {};
    for (const field of PNL_SUM_FIELDS) {
      pnlTotals[field] = snapshots.reduce((sum: number, row) => sum + safeNumber(row[field]), 0);
    }
    const monthEndSnapshot = snapshots[snapshots.length - 1];
    const balanceValues: Record<string, number> = {};
    for (const field of BS_LAST_DAY_FIELDS) {
      balanceValues[field] = safeNumber(monthEndSnapshot[field]);
    }

    let uploaderId = actingUserId;
    if (!uploaderId) {
      const fallbackUser = await prisma.user.findFirst({
        where: { companyId },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      uploaderId = fallbackUser?.id || null;
    }
    if (!uploaderId) {
      const accessFallback = await prisma.userCompanyAccess.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
        select: { userId: true },
      });
      uploaderId = accessFallback?.userId || null;
    }
    if (!uploaderId) {
      const anyUser = await prisma.user.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      uploaderId = anyUser?.id || null;
    }
    if (!uploaderId) {
      return {
        success: false,
        month: targetMonth,
        snapshotDays: snapshots.length,
        monthEndSnapshotDate: monthEndSnapshot.snapshotDate,
        error: 'Unable to resolve uploader user for this company. Add at least one company user.',
      };
    }

    const monthRecordData = {
      companyId,
      monthDate: targetMonthStart,
      ...pnlTotals,
      ...balanceValues,
    };

    let financialRecord = await prisma.financialRecord.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!financialRecord) {
      financialRecord = await prisma.financialRecord.create({
        data: {
          companyId,
          uploadedByUserId: uploaderId,
          fileName: `AUTO_MONTH_END_PUBLISH_${targetMonth}`,
          rawData: {
            source: 'DAILY_FINANCIAL_MONTH_END',
            sourceBasis: 'mapped_daily_snapshots',
            statementCurrency: 'USD',
            rollupPolicy: {
              incomeStatement: 'sum_daily_activity',
              balanceSheet: 'month_end_snapshot',
            },
            month: targetMonth,
          },
          columnMapping: {},
        },
        select: { id: true },
      });
    }

    const existingMonthRow = await prisma.monthlyFinancial.findFirst({
      where: {
        companyId,
        financialRecordId: financialRecord.id,
        monthDate: targetMonthStart,
      },
      select: { id: true },
    });

    if (existingMonthRow) {
      await prisma.monthlyFinancial.update({
        where: { id: existingMonthRow.id },
        data: monthRecordData,
      });
    } else {
      await prisma.monthlyFinancial.create({
        data: {
          financialRecordId: financialRecord.id,
          ...monthRecordData,
        },
      });
    }

    const sourceRunIds = Array.from(
      new Set(
        snapshots
          .map((row) => String(row.sourceRunId || '').trim())
          .filter((value: string) => value.length > 0)
      )
    );

    const publishNotes = force
      ? 'Force publish | basis=mapped_daily_snapshots | currency=USD | IS=sum_daily_activity | BS=month_end_snapshot'
      : 'basis=mapped_daily_snapshots | currency=USD | IS=sum_daily_activity | BS=month_end_snapshot';
    await publishDelegate.upsert({
      where: { companyId_monthStart: { companyId, monthStart: targetMonthStart } },
      create: {
        companyId,
        monthStart: targetMonthStart,
        monthEnd: targetMonthEnd,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        sourceSnapshotDays: snapshots.length,
        sourceRunIds,
        notes: publishNotes,
      },
      update: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        sourceSnapshotDays: snapshots.length,
        sourceRunIds,
        notes: publishNotes,
      },
    });

    return {
      success: true,
      month: targetMonth,
      snapshotDays: snapshots.length,
      monthEndSnapshotDate: monthEndSnapshot.snapshotDate,
    };
  };

  const publishedCount = await publishDelegate.count({
    where: { companyId, status: 'PUBLISHED' },
  });
  const isInitialBackfill = publishedCount === 0;

  if (!isInitialBackfill) {
    const single = await publishSingleMonth(month);
    if (!single.success) {
      return {
        success: false,
        companyId,
        month,
        mode: 'INCREMENTAL',
        monthsPublished: 0,
        publishedMonths: [],
        skippedMonths: [month],
        snapshotDays: single.snapshotDays,
        monthEndSnapshotDate: single.monthEndSnapshotDate,
        error: single.error || 'Failed to publish month',
      };
    }
    return {
      success: true,
      companyId,
      month,
      mode: 'INCREMENTAL',
      monthsPublished: 1,
      publishedMonths: [month],
      skippedMonths: [],
      snapshotDays: single.snapshotDays,
      monthEndSnapshotDate: single.monthEndSnapshotDate,
    };
  }

  const backfillStart = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - (backfillMonths - 1), 1, 0, 0, 0, 0),
  );
  const backfillSnapshots = await dailySnapshotDelegate.findMany({
    where: {
      companyId,
      frequency: 'daily',
      snapshotDate: {
        gte: backfillStart,
        lte: monthEnd,
      },
    },
    select: { snapshotDate: true },
    orderBy: { snapshotDate: 'asc' },
  });

  if (!backfillSnapshots.length) {
    return {
      success: false,
      companyId,
      month,
      mode: 'INITIAL_BACKFILL',
      monthsPublished: 0,
      publishedMonths: [],
      skippedMonths: [],
      snapshotDays: 0,
      monthEndSnapshotDate: null,
      error: 'No daily financial snapshots found for initial backfill window',
    };
  }

  const monthSet = new Set<string>();
  for (const row of backfillSnapshots) {
    const key = monthKeyFromDate(new Date(row.snapshotDate));
    if (key <= month) monthSet.add(key);
  }
  const monthsToPublish = Array.from(monthSet).sort();

  if (!monthsToPublish.includes(month)) {
    return {
      success: false,
      companyId,
      month,
      mode: 'INITIAL_BACKFILL',
      monthsPublished: 0,
      publishedMonths: [],
      skippedMonths: [],
      snapshotDays: 0,
      monthEndSnapshotDate: null,
      error: 'Requested publish month has no daily snapshots',
    };
  }

  const publishedMonths: string[] = [];
  const skippedMonths: string[] = [];
  let selectedMonthSnapshotDays = 0;
  let selectedMonthEndSnapshotDate: Date | null = null;
  let selectedMonthError: string | undefined;

  for (const targetMonth of monthsToPublish) {
    const result = await publishSingleMonth(targetMonth);
    if (result.success) {
      publishedMonths.push(targetMonth);
      if (targetMonth === month) {
        selectedMonthSnapshotDays = result.snapshotDays;
        selectedMonthEndSnapshotDate = result.monthEndSnapshotDate;
      }
    } else {
      skippedMonths.push(targetMonth);
      if (targetMonth === month) {
        selectedMonthError = result.error || 'Failed to publish requested month';
      }
    }
  }

  if (selectedMonthError) {
    return {
      success: false,
      companyId,
      month,
      mode: 'INITIAL_BACKFILL',
      monthsPublished: publishedMonths.length,
      publishedMonths,
      skippedMonths,
      snapshotDays: selectedMonthSnapshotDays,
      monthEndSnapshotDate: selectedMonthEndSnapshotDate,
      error: selectedMonthError,
    };
  }

  return {
    success: publishedMonths.length > 0,
    companyId,
    month,
    mode: 'INITIAL_BACKFILL',
    monthsPublished: publishedMonths.length,
    publishedMonths,
    skippedMonths,
    snapshotDays: selectedMonthSnapshotDays,
    monthEndSnapshotDate: selectedMonthEndSnapshotDate,
    ...(publishedMonths.length > 0 ? {} : { error: 'No months were published during initial backfill' }),
  };
}
