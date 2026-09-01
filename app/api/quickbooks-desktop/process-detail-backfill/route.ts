import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';
import { transformQuickBooksDesktopInvoiceDetail } from '@/lib/quickbooks-desktop/detail-transform';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }
    if (!isQuickBooksDesktopFamily(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'Detail backfill processing is only available for QuickBooks Desktop-family companies.' },
        { status: 400 },
      );
    }

    const result = await transformQuickBooksDesktopInvoiceDetail(companyId, {
      includeNonDetailInvoicePages: true,
      frequencies: ['monthly'],
    });

    return NextResponse.json({
      ok: result.success,
      companyId,
      ...result,
    }, { status: result.success ? 200 : 422 });
  } catch (error: any) {
    const message = error?.message || 'Failed to process QuickBooks Desktop detail backfill';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
