import { NextRequest, NextResponse } from 'next/server';
import { BankStatementsAccessError, requireCreditCardUploadAccess } from '@/lib/bank-statements/access';
import { createPlaidCreditCardLinkToken, isPlaidConfigured, PlaidRequestError } from '@/lib/bank-statements/plaid';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { companyId?: string };
    const context = await requireCreditCardUploadAccess(String(body.companyId || '').trim());
    if (!isPlaidConfigured()) return NextResponse.json({ error: 'Plaid is not set up yet.' }, { status: 503 });
    const linkToken = await createPlaidCreditCardLinkToken({ userId: context.userId, email: context.email || null });
    return NextResponse.json({ linkToken });
  } catch (error) {
    if (error instanceof BankStatementsAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof PlaidRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    const message = String((error as Error)?.message || error);
    if (message.startsWith('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Credit-card Plaid link token failed:', error);
    return NextResponse.json({ error: 'Could not start the credit-card connection' }, { status: 500 });
  }
}
