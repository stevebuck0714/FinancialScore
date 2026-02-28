import prisma from '@/lib/prisma';
import { BS_LAST_DAY_FIELDS, parseMonthInput, PNL_SUM_FIELDS, safeNumber } from '@/lib/financial/month-publish';

export type PublishMonthParams = {
  companyId: string;
  month: string; // YYYY-MM
  force?: boolean;
  actingUserId?: string | null;
};

export async function publishMonthFromDailySnapshots(params: PublishMonthParams): Promise<{
  success: boolean;
  companyId: string;
  month: string;
  snapshotDays: number;
  monthEndSnapshotDate: Date | null;
  error?: string;
}> {
  const companyId = String(params.companyId || '').trim();
  const month = String(params.month || '').trim();
  const force = Boolean(params.force);
  const actingUserId = params.actingUserId || null;

  if (!companyId || !month) {
    return {
      success: false,
      companyId,
      month,
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
      snapshotDays: 0,
      monthEndSnapshotDate: null,
      error: 'Invalid month format. Use YYYY-MM.',
    };
  }

  const { monthStart, monthEnd } = parsed;
  const dailySnapshotDelegate = (prisma as any).dailyFinancialSnapshot;
  const publishDelegate = (prisma as any).financialMonthPublish;
  if (!dailySnapshotDelegate || !publishDelegate) {
    return {
      success: false,
      companyId,
      month,
      snapshotDays: 0,
      monthEndSnapshotDate: null,
      error: 'Daily publish models are not available. Run prisma migrate + prisma generate.',
    };
  }

  const existingPublish = await publishDelegate.findUnique({
    where: { companyId_monthStart: { companyId, monthStart } },
  });
  if (existingPublish?.status === 'LOCKED' && !force) {
    return {
      success: false,
      companyId,
      month,
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
        gte: monthStart,
        lte: monthEnd,
      },
    },
    orderBy: { snapshotDate: 'asc' },
  });

  if (!snapshots.length) {
    return {
      success: false,
      companyId,
      month,
      snapshotDays: 0,
      monthEndSnapshotDate: null,
      error: 'No daily financial snapshots found for requested month',
    };
  }

  const pnlTotals: Record<string, number> = {};
  for (const field of PNL_SUM_FIELDS) {
    pnlTotals[field] = snapshots.reduce((sum: number, row: any) => sum + safeNumber(row[field]), 0);
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
    return {
      success: false,
      companyId,
      month,
      snapshotDays: snapshots.length,
      monthEndSnapshotDate: monthEndSnapshot.snapshotDate,
      error: 'Unable to resolve uploader user for this company. Add at least one company user.',
    };
  }

  const monthRecordData = {
    companyId,
    monthDate: monthStart,
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
        fileName: `AUTO_MONTH_END_PUBLISH_${month}`,
        rawData: {
          source: 'DAILY_FINANCIAL_MONTH_END',
          month,
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
      monthDate: monthStart,
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
        .map((row: any) => String(row.sourceRunId || '').trim())
        .filter((value: string) => value.length > 0)
    )
  );

  await publishDelegate.upsert({
    where: { companyId_monthStart: { companyId, monthStart } },
    create: {
      companyId,
      monthStart,
      monthEnd,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sourceSnapshotDays: snapshots.length,
      sourceRunIds,
      notes: force ? 'Force publish' : null,
    },
    update: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
      sourceSnapshotDays: snapshots.length,
      sourceRunIds,
      notes: force ? 'Force publish' : null,
    },
  });

  return {
    success: true,
    companyId,
    month,
    snapshotDays: snapshots.length,
    monthEndSnapshotDate: monthEndSnapshot.snapshotDate,
  };
}
