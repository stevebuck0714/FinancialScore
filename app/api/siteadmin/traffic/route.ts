import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import { addEstCalendarDays, estMidnightUtc, formatEstDate, nextEstMidnightUtc } from '@/lib/time/eastern';

export const dynamic = 'force-dynamic';

const EST_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Site Admin Traffic report: client-user views, unique users, and time per
 * sidebar section for each company over an inclusive EST date range.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await requireAuth();
    if (context.role !== 'SITEADMIN') {
      await auditForbiddenAccess('SectionView', 'all', 'READ_TRAFFIC');
      return NextResponse.json({ error: 'Forbidden: Site admin access required' }, { status: 403 });
    }

    const today = formatEstDate();
    const startParam = String(request.nextUrl.searchParams.get('start') || '').trim();
    const endParam = String(request.nextUrl.searchParams.get('end') || '').trim();
    const end = EST_DATE.test(endParam) ? endParam : today;
    const start = EST_DATE.test(startParam) ? startParam : addEstCalendarDays(end, -29);
    if (start > end) {
      return NextResponse.json({ error: 'Start date must be on or before end date' }, { status: 400 });
    }
    const from = estMidnightUtc(start);
    const to = nextEstMidnightUtc(end);

    const [cells, companyTotals, sectionTotals, overall] = await Promise.all([
      prisma.$queryRaw<Array<{ companyId: string; section: string; views: bigint; users: bigint; durationMs: bigint }>>`
        SELECT "companyId", "section",
               COUNT(*) FILTER (WHERE NOT "isResume") AS "views",
               COUNT(DISTINCT "userId") AS "users",
               COALESCE(SUM("durationMs"), 0) AS "durationMs"
        FROM "SectionView"
        WHERE "startedAt" >= ${from} AND "startedAt" < ${to}
        GROUP BY "companyId", "section"
      `,
      prisma.$queryRaw<Array<{ companyId: string; views: bigint; users: bigint; durationMs: bigint }>>`
        SELECT "companyId",
               COUNT(*) FILTER (WHERE NOT "isResume") AS "views",
               COUNT(DISTINCT "userId") AS "users",
               COALESCE(SUM("durationMs"), 0) AS "durationMs"
        FROM "SectionView"
        WHERE "startedAt" >= ${from} AND "startedAt" < ${to}
        GROUP BY "companyId"
      `,
      prisma.$queryRaw<Array<{ section: string; views: bigint; users: bigint; durationMs: bigint }>>`
        SELECT "section",
               COUNT(*) FILTER (WHERE NOT "isResume") AS "views",
               COUNT(DISTINCT "userId") AS "users",
               COALESCE(SUM("durationMs"), 0) AS "durationMs"
        FROM "SectionView"
        WHERE "startedAt" >= ${from} AND "startedAt" < ${to}
        GROUP BY "section"
      `,
      prisma.$queryRaw<Array<{ views: bigint; users: bigint; durationMs: bigint }>>`
        SELECT COUNT(*) FILTER (WHERE NOT "isResume") AS "views",
               COUNT(DISTINCT "userId") AS "users",
               COALESCE(SUM("durationMs"), 0) AS "durationMs"
        FROM "SectionView"
        WHERE "startedAt" >= ${from} AND "startedAt" < ${to}
      `,
    ]);

    const companies = companyTotals.length
      ? await prisma.company.findMany({
          where: { id: { in: companyTotals.map((row) => row.companyId) } },
          select: { id: true, name: true },
        })
      : [];
    const companyNames = new Map(companies.map((company) => [company.id, company.name]));
    const metrics = (row: { views: bigint; users: bigint; durationMs: bigint } | undefined) => ({
      views: Number(row?.views ?? 0),
      users: Number(row?.users ?? 0),
      durationMs: Number(row?.durationMs ?? 0),
    });

    return NextResponse.json({
      start,
      end,
      companies: companyTotals
        .map((total) => ({
          companyId: total.companyId,
          companyName: companyNames.get(total.companyId) ?? total.companyId,
          total: metrics(total),
          sections: Object.fromEntries(
            cells.filter((cell) => cell.companyId === total.companyId).map((cell) => [cell.section, metrics(cell)]),
          ),
        }))
        .sort((a, b) => b.total.views - a.total.views || a.companyName.localeCompare(b.companyName)),
      sectionTotals: Object.fromEntries(sectionTotals.map((row) => [row.section, metrics(row)])),
      total: metrics(overall[0]),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unauthorized')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Error loading traffic report:', error);
    return NextResponse.json({ error: 'Failed to load traffic report' }, { status: 500 });
  }
}
