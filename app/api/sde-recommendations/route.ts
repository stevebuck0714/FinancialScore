import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireCompanyAccess } from '@/lib/tenant-security';
import { computeSdeRecommendationsFromMonthly } from '@/lib/sde-recommendations';

const APPROVED_SDE_SOURCES = [
  'quickbooks',
  'quickbooks_desktop',
  'xero',
  'sage',
  'sage_intacct',
  'infor',
  'infor_m3',
  'dynamics',
  'dynamics365',
  'csv_trial_balance',
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    try {
      await requireCompanyAccess(companyId);
    } catch {
      return NextResponse.json({ error: 'Forbidden: Access to this company denied' }, { status: 403 });
    }

    const latestRecord = await prisma.financialRecord.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        monthlyData: {
          orderBy: { monthDate: 'asc' },
        },
      },
    });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { industrySectorCategory: true },
    });

    if (!latestRecord || !Array.isArray(latestRecord.monthlyData) || latestRecord.monthlyData.length === 0) {
      return NextResponse.json({ error: 'No company financial data found' }, { status: 404 });
    }

    const sourceLabel = String((latestRecord.columnMapping as any)?.source || '').toLowerCase();
    const isMockSource = sourceLabel.includes('mock');
    const isApprovedSource = APPROVED_SDE_SOURCES.some((source) => sourceLabel.includes(source));

    if (!isApprovedSource || isMockSource) {
      return NextResponse.json(
        {
          error: 'SDE strict mode blocked: source not approved or mock source detected',
          source: sourceLabel || null,
        },
        { status: 422 },
      );
    }

    const payload = computeSdeRecommendationsFromMonthly(latestRecord.monthlyData, {
      industrySectorCategory: company?.industrySectorCategory || null,
    });

    return NextResponse.json({
      companyId,
      source: sourceLabel || null,
      industrySectorCategory: company?.industrySectorCategory || null,
      ...payload,
    });
  } catch (error) {
    console.error('Error generating SDE recommendations:', error);
    return NextResponse.json({ error: 'Failed to generate SDE recommendations' }, { status: 500 });
  }
}

