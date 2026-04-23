import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { publishMonthFromDailySnapshots } from '@/lib/financial/publish-month-service';
import { supportsPublishFromDailySnapshots } from '@/lib/financial/pipeline-strategy';

// UTC. The cron runs on Vercel (UTC) so this was already effectively UTC,
// but using local-TZ accessors made it ambiguous when invoked from a script
// on a developer laptop. See lib/date-utils.ts for the broader rule.
function previousMonthString(now = new Date()): string {
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return process.env.NODE_ENV === 'development';
  return request.headers.get('authorization') === `Bearer ${cronSecret}`;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const month = request.nextUrl.searchParams.get('month') || previousMonthString();
    const force = request.nextUrl.searchParams.get('force') === 'true';

    const rows = await prisma.accountingConnection.findMany({
      where: {
        status: 'ACTIVE',
        autoSync: true,
      },
      select: {
        companyId: true,
      },
      distinct: ['companyId'],
      orderBy: {
        companyId: 'asc',
      },
    });
    const allCompanyIds = rows.map((row) => row.companyId);
    const companies = await prisma.company.findMany({
      where: { id: { in: allCompanyIds } },
      select: { id: true, accountingSystem: true },
    });
    const publishEligibleCompanyIds = new Set(
      companies
        .filter((company) => supportsPublishFromDailySnapshots(company.accountingSystem))
        .map((company) => company.id)
    );
    const companyIds = allCompanyIds.filter((companyId) => publishEligibleCompanyIds.has(companyId));

    const results: Array<Record<string, unknown>> = [];
    let successCount = 0;
    let failedCount = 0;

    for (const companyId of companyIds) {
      const result = await publishMonthFromDailySnapshots({
        companyId,
        month,
        force,
      });
      if (result.success) successCount += 1;
      else failedCount += 1;
      results.push(result);
    }

    return NextResponse.json({
      success: failedCount === 0,
      month,
      companiesProcessed: companyIds.length,
      companiesPublished: successCount,
      companiesFailed: failedCount,
      results,
    });
  } catch (error: any) {
    console.error('Failed month-end publish cron run:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
