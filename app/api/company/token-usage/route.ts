import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { computeOverage, currentEstMonth, readAiUsagePricing } from '@/lib/ai-usage/summary';
import { ensureAiUsageTable } from '@/lib/ai-usage/record';
import { APP_TIME_ZONE } from '@/lib/time/eastern';

export const dynamic = 'force-dynamic';

const ASK_FEATURES = ['ask_data', 'ask_document'];

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    if (!(await validateCompanyAccess(companyId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { userDefinedAllocations: true },
    });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    await ensureAiUsageTable();
    const month = currentEstMonth();
    const rows = await prisma.$queryRaw<Array<{
      month: string; interactions: number; totalTokens: number; costUsd: number;
    }>>`
      SELECT to_char("createdAt" AT TIME ZONE ${APP_TIME_ZONE}, 'YYYY-MM') AS month,
        COUNT(*)::int AS interactions,
        COALESCE(SUM("totalTokens"), 0)::float8 AS "totalTokens",
        COALESCE(SUM("costUsd"), 0)::float8 AS "costUsd"
      FROM "AiUsageEvent"
      WHERE "companyId" = ${companyId}
        AND "feature" IN ('ask_data', 'ask_document')
        AND ("createdAt" AT TIME ZONE ${APP_TIME_ZONE}) >= ${`${month}-01`}::timestamp - INTERVAL '6 months'
      GROUP BY 1
      ORDER BY 1 DESC
    `;
    const pricing = readAiUsagePricing(company.userDefinedAllocations);
    const months = rows.map((row) => {
      const tokens = Number(row.totalTokens || 0);
      return {
        month: row.month,
        interactions: Number(row.interactions || 0),
        billableTokens: tokens,
        totalTokens: tokens,
        costUsd: Number(row.costUsd || 0),
        ...computeOverage(tokens, pricing),
      };
    });
    return NextResponse.json({ pricing, months, current: months.find((row) => row.month === month) || null });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to load token usage');
    return NextResponse.json({ error: message }, { status: message.toLowerCase().includes('unauthorized') ? 401 : 500 });
  }
}
