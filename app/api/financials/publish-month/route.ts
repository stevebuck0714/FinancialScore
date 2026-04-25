import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/tenant-security';
import {
  publishMonthFromDailySnapshots,
  publishMonthsFromMonthlyFinancialDirect,
} from '@/lib/financial/publish-month-service';
import prisma from '@/lib/prisma';
import { supportsPublishFromDailySnapshots } from '@/lib/financial/pipeline-strategy';

function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const companyId = String(body?.companyId || '').trim();
    const month = String(body?.month || '').trim();
    const force = Boolean(body?.force);

    if (!companyId || !month) {
      return NextResponse.json({ error: 'companyId and month (YYYY-MM) are required' }, { status: 400 });
    }

    const cronAuthorized = isCronAuthorized(request);
    let actingUserId: string | null = null;

    if (!cronAuthorized) {
      try {
        const context = await requireCompanyAccess(companyId);
        actingUserId = context.userId;
      } catch {
        return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
      }
    }

    // Daily->monthly publish applies to ERP-ledger and CSV trial-balance lanes.
    // Lightweight payload systems (QBO/Sage/Xero) should use push/reprocess flows.
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    const accountingSystem = String(company?.accountingSystem || '').toUpperCase();
    if (!supportsPublishFromDailySnapshots(accountingSystem)) {
      return NextResponse.json(
        {
          error:
            'Publish Monthly Financials is only supported for ERP-ledger/CSV workflows. Use payload Process/Reprocess for lightweight accounting systems.',
        },
        { status: 409 }
      );
    }

    // CSV-only direct path: CSV trial-balance uploads write to MonthlyFinancial
    // but never produce DailyFinancialSnapshot rows (the source has no daily
    // grain). Route those companies to the monthly-direct publisher so the
    // publish gate flips without requiring fabricated daily snapshots.
    //
    // IMPORTANT: this branch is gated on the exact `CSV_FILE` system string —
    // every ERP system (INFOR_M3, INFOR_CSI, NETSUITE, ACUMATICA, ODOO,
    // DYNAMICS365, EPICOR, IFS, QUICKBOOKS_DESKTOP) keeps using the existing
    // daily-snapshots flow unchanged.
    if (accountingSystem === 'CSV_FILE') {
      const csvResult = await publishMonthsFromMonthlyFinancialDirect({
        companyId,
        month,
        force,
      });
      if (!csvResult.success) {
        const error = String(csvResult.error || 'Failed to publish month from MonthlyFinancial');
        if (error.includes('No FinancialRecord') || error.includes('No MonthlyFinancial')) {
          return NextResponse.json({ error }, { status: 404 });
        }
        if (csvResult.lockedMonths.includes(month)) {
          return NextResponse.json({ error: 'Month is locked. Pass force=true to override.' }, { status: 409 });
        }
        if (error.includes('Run prisma migrate')) return NextResponse.json({ error }, { status: 501 });
        return NextResponse.json({ error }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        companyId: csvResult.companyId,
        month,
        mode: 'CSV_MONTHLY_DIRECT',
        monthsPublished: csvResult.publishedMonths.length,
        publishedMonths: csvResult.publishedMonths,
        skippedMonths: csvResult.skippedMonths,
        lockedMonths: csvResult.lockedMonths,
        missingMonths: csvResult.missingMonths,
      });
    }

    const result = await publishMonthFromDailySnapshots({
      companyId,
      month,
      force,
      actingUserId,
    });
    if (!result.success) {
      const error = String(result.error || 'Failed to publish month');
      if (error.includes('Forbidden')) return NextResponse.json({ error }, { status: 403 });
      if (error.includes('Invalid month format') || error.includes('required')) return NextResponse.json({ error }, { status: 400 });
      if (
        error.includes('No daily financial snapshots') ||
        error.includes('Requested publish month has no daily snapshots')
      ) {
        return NextResponse.json({ error }, { status: 404 });
      }
      if (error.includes('Month is locked')) return NextResponse.json({ error }, { status: 409 });
      if (error.includes('Run prisma migrate')) return NextResponse.json({ error }, { status: 501 });
      return NextResponse.json({ error }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Failed to publish month from daily financial snapshots:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
