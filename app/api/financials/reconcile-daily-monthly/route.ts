import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { parseMonthInput, PNL_SUM_FIELDS } from '@/lib/financial/month-publish';

const SUMMARY_FIELDS = [
  'revenue',
  'cogsTotal',
  'expense',
  'cash',
  'ar',
  'ap',
  'totalAssets',
  'totalLiab',
  'totalEquity',
  'totalLAndE',
] as const;

const toNumber = (value: unknown): number => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

type SummaryField = (typeof SUMMARY_FIELDS)[number];

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const companyId = String(searchParams.get('companyId') || '').trim();
    const month = String(searchParams.get('month') || '').trim();
    if (!companyId || !month) {
      return NextResponse.json({ error: 'companyId and month (YYYY-MM) are required' }, { status: 400 });
    }

    await requireCompanyAccess(companyId);
    const parsed = parseMonthInput(month);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 });
    }

    const { monthStart, monthEnd } = parsed;
    const dailySnapshotDelegate = (prisma as any).dailyFinancialSnapshot;
    if (!dailySnapshotDelegate) {
      return NextResponse.json({ error: 'DailyFinancialSnapshot model is unavailable' }, { status: 501 });
    }

    const snapshots = await dailySnapshotDelegate.findMany({
      where: {
        companyId,
        frequency: 'daily',
        snapshotDate: { gte: monthStart, lte: monthEnd },
      },
      orderBy: { snapshotDate: 'asc' },
    });
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      return NextResponse.json({ error: 'No daily snapshots found for requested month' }, { status: 404 });
    }

    const latestFinancialRecord = await prisma.financialRecord.findFirst({
      where: { companyId },
      select: {
        id: true,
        createdAt: true,
        monthlyData: {
          where: { monthDate: monthStart },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const monthly = latestFinancialRecord?.monthlyData?.[0] || null;
    if (!monthly) {
      return NextResponse.json(
        { error: `No monthlyFinancial row found for ${month} in latest financial record` },
        { status: 404 }
      );
    }

    const pnlDailyTotals = PNL_SUM_FIELDS.reduce<Record<string, number>>((acc, field) => {
      acc[field] = snapshots.reduce((sum: number, row: any) => sum + toNumber(row?.[field]), 0);
      return acc;
    }, {});
    const monthEndSnapshot = snapshots[snapshots.length - 1];

    const monthEndBalanceDiffs = SUMMARY_FIELDS.reduce<Record<SummaryField, { daily: number; monthly: number; delta: number }>>(
      (acc, field) => {
        const dailyValue = toNumber((monthEndSnapshot as any)?.[field]);
        const monthlyValue = toNumber((monthly as any)?.[field]);
        acc[field] = {
          daily: dailyValue,
          monthly: monthlyValue,
          delta: dailyValue - monthlyValue,
        };
        return acc;
      },
      {} as Record<SummaryField, { daily: number; monthly: number; delta: number }>
    );

    const monthIncomeDiffs = (['revenue', 'cogsTotal', 'expense'] as const).reduce<
      Record<'revenue' | 'cogsTotal' | 'expense', { dailySum: number; monthly: number; delta: number }>
    >((acc, field) => {
      const dailySum = toNumber(pnlDailyTotals[field]);
      const monthlyValue = toNumber((monthly as any)?.[field]);
      acc[field] = {
        dailySum,
        monthly: monthlyValue,
        delta: dailySum - monthlyValue,
      };
      return acc;
    }, {} as Record<'revenue' | 'cogsTotal' | 'expense', { dailySum: number; monthly: number; delta: number }>);

    const hasMonthEndMismatch = Object.values(monthEndBalanceDiffs).some((entry) => Math.abs(entry.delta) > 0.01);
    const hasIncomeMismatch = Object.values(monthIncomeDiffs).some((entry) => Math.abs(entry.delta) > 0.01);

    return NextResponse.json({
      ok: true,
      companyId,
      month,
      snapshotDays: snapshots.length,
      monthEndSnapshotDate: monthEndSnapshot?.snapshotDate || null,
      monthlySourceRecordId: latestFinancialRecord?.id || null,
      monthlySourceRecordCreatedAt: latestFinancialRecord?.createdAt || null,
      checks: {
        monthEndBalanceMatches: !hasMonthEndMismatch,
        monthlyIncomeMatchesDailySums: !hasIncomeMismatch,
      },
      monthIncomeDiffs,
      monthEndBalanceDiffs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        error: 'Failed to reconcile daily vs monthly financials',
        details: message,
      },
      { status }
    );
  }
}
