import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { assertOperationalDataTypeAccess } from '@/lib/operations/operational-data-access';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';
import { loadQbdBankRegister } from '@/lib/quickbooks-desktop/bank-register';
import { loadQboBankRegister } from '@/lib/quickbooks-online/bank-register';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const isDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Bank register behind the Daily Financials "Bank Transactions" tab, for QuickBooks Online and Desktop companies. */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const companyId = String(params.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    const denied = await assertOperationalDataTypeAccess(companyId, 'daily-financials');
    if (denied) return denied;

    const startDate = String(params.get('startDate') || '').slice(0, 10);
    const endDate = String(params.get('endDate') || '').slice(0, 10);
    if (!isDateKey(startDate) || !isDateKey(endDate) || startDate > endDate) {
      return NextResponse.json({ error: 'Valid startDate and endDate (YYYY-MM-DD) are required' }, { status: 400 });
    }
    const accountKey = String(params.get('account') || '').trim() || null;

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { accountingSystem: true } });
    const register = isQuickBooksDesktopFamily(company?.accountingSystem)
      ? await loadQbdBankRegister(companyId, accountKey, startDate, endDate)
      : await loadQboBankRegister(companyId, accountKey, startDate, endDate);

    return NextResponse.json({ hasData: Boolean(register), register });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load bank transactions' }, { status: 500 });
  }
}
