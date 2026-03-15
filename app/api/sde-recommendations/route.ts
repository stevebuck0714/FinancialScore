import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { computeSdeRecommendationsFromMonthly } from '@/lib/sde-recommendations';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = String(searchParams.get('companyId') || '').trim();

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    // Enforce tenant access to company-level recommendation outputs.
    await requireCompanyAccess(companyId);

    const [company, latestRecord] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, industrySectorCategory: true },
      }),
      prisma.financialRecord.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        include: {
          monthlyData: {
            orderBy: { monthDate: 'asc' },
          },
        },
      }),
    ]);

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    const monthlyRows = (latestRecord?.monthlyData || []).map((row: any) => ({
      monthDate: row.monthDate,
      revenue: Number(row.revenue || 0),
      cogsTotal: Number(row.cogsTotal || 0),
      expense: Number(row.expense || 0),
      interestExpense: Number(row.interestExpense || 0),
      depreciationAmortization: Number(row.depreciationAmortization || 0),
      stateIncomeTaxes: Number(row.stateIncomeTaxes || 0),
      federalIncomeTaxes: Number(row.federalIncomeTaxes || 0),
      ar: Number(row.ar || 0),
      inventory: Number(row.inventory || 0),
      ap: Number(row.ap || 0),
      otherCL: Number(row.otherCL || 0),
      fixedAssets: Number(row.fixedAssets || 0),
    }));

    if (monthlyRows.length === 0) {
      return NextResponse.json(
        {
          error: 'No monthly financial data found for company',
          executiveSummary: null,
          executiveFinancialSummary: null,
          recommendations: [],
        },
        { status: 200 },
      );
    }

    const payload = computeSdeRecommendationsFromMonthly(monthlyRows, {
      industrySectorCategory: company.industrySectorCategory,
    });

    return NextResponse.json(payload);
  } catch (error: any) {
    const message = String(error?.message || 'Failed to load SDE recommendations');
    console.error('Error in /api/sde-recommendations:', error);
    const lowerMessage = message.toLowerCase();
    const status = lowerMessage.includes('forbidden') ? 403 : lowerMessage.includes('unauthorized') ? 401 : 500;
    return NextResponse.json(
      {
        error:
          status === 403
            ? 'Forbidden: Access to this company denied'
            : status === 401
              ? 'Unauthorized: Authentication required'
              : 'Failed to load SDE recommendations',
        details: message,
      },
      { status },
    );
  }
}

