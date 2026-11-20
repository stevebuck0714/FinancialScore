import { NextRequest, NextResponse } from 'next/server';
import { BankStatementsAccessError, requireCreditCardUploadAccess } from '@/lib/bank-statements/access';
import { importPlaidCreditCardData, isPlaidConfigured, PlaidRequestError } from '@/lib/bank-statements/plaid';
import { savePlaidCreditCardImport } from '@/lib/credit-card-review/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ASSET_REPORT_BUDGET_MS = 250_000;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json().catch(() => ({}))) as { companyId?: string; publicToken?: string };
    const companyId = String(body.companyId || '').trim();
    const publicToken = String(body.publicToken || '').trim();
    const context = await requireCreditCardUploadAccess(companyId);
    if (!publicToken) return NextResponse.json({ error: 'publicToken is required' }, { status: 400 });
    if (!isPlaidConfigured()) return NextResponse.json({ error: 'Plaid is not set up yet.' }, { status: 503 });

    const pulled = await importPlaidCreditCardData(publicToken, startedAt + ASSET_REPORT_BUDGET_MS);
    const saved = await savePlaidCreditCardImport({
      companyId,
      userId: context.userId,
      userEmail: context.email,
      ...pulled,
    });
    return NextResponse.json({ institution: pulled.institution, accounts: pulled.accounts, coverageStart: pulled.coverageStart, coverageEnd: pulled.coverageEnd, ...saved });
  } catch (error) {
    if (error instanceof BankStatementsAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof PlaidRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    const message = String((error as Error)?.message || error);
    if (message.startsWith('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Credit-card Plaid import failed:', error);
    return NextResponse.json({ error: 'Credit-card import failed', detail: message }, { status: 500 });
  }
}
