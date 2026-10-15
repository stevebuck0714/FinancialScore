import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth } from '@/lib/tenant-security';
import { auditForbiddenAccess } from '@/lib/audit-logger';
import {
  computeOverage,
  currentEstMonth,
  loadCompanyAiUsage,
  loadCurrentMonthAiUsageByCompany,
  readAiUsagePricing,
} from '@/lib/ai-usage/summary';

export const dynamic = 'force-dynamic';

/**
 * Site Admin AI usage. Without companyId: current EST month totals for every company with usage.
 * With companyId: monthly history and the current month's per-feature breakdown.
 */
export async function GET(request: NextRequest) {
  try {
    const context = await requireAuth();
    if (context.role !== 'SITEADMIN') {
      await auditForbiddenAccess('AiUsage', 'all', 'READ_AI_USAGE');
      return NextResponse.json({ error: 'Forbidden: Site admin access required' }, { status: 403 });
    }

    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (companyId) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, userDefinedAllocations: true },
      });
      if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
      const pricing = readAiUsagePricing(company.userDefinedAllocations);
      const usage = await loadCompanyAiUsage(companyId, pricing);
      return NextResponse.json({ companyId, pricing, ...usage });
    }

    const rows = await loadCurrentMonthAiUsageByCompany();
    const companies = rows.length
      ? await prisma.company.findMany({
          where: { id: { in: rows.map((row) => row.companyId) } },
          select: { id: true, name: true, userDefinedAllocations: true },
        })
      : [];
    const companyById = new Map(companies.map((company) => [company.id, company]));
    return NextResponse.json({
      month: currentEstMonth(),
      companies: rows.map((row) => {
        const company = companyById.get(row.companyId);
        const pricing = readAiUsagePricing(company?.userDefinedAllocations);
        const billableTokens = Number(row.billableTokens);
        return {
          companyId: row.companyId,
          companyName: company?.name ?? null,
          interactions: Number(row.interactions),
          billableTokens,
          totalTokens: Number(row.totalTokens),
          costUsd: Number(row.costUsd),
          billableCostUsd: Number(row.billableCostUsd),
          ...pricing,
          usedPct: pricing.monthlyTokenAllowance > 0 ? (billableTokens / pricing.monthlyTokenAllowance) * 100 : null,
          ...computeOverage(billableTokens, pricing),
        };
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unauthorized')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Error loading AI usage:', error);
    return NextResponse.json({ error: 'Failed to load AI usage' }, { status: 500 });
  }
}
