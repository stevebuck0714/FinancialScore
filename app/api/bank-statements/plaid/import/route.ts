import { NextRequest, NextResponse } from 'next/server';
import { BankStatementsAccessError, requireStatementUploadAccess } from '@/lib/bank-statements/access';
import { isPlaidConfigured, PlaidRequestError, withPlaidStatements } from '@/lib/bank-statements/plaid';
import { saveFetchedStatements } from '@/lib/bank-statements/store';

export const dynamic = 'force-dynamic';
// Downloads up to 24 statement PDFs per connected account.
export const maxDuration = 300;

// New downloads stop here, leaving time for in-flight downloads, retries, and /item/remove.
const DOWNLOAD_BUDGET_MS = 200_000;

export async function POST(request: NextRequest) {
  const deadline = Date.now() + DOWNLOAD_BUDGET_MS;
  try {
    const body = (await request.json().catch(() => ({}))) as { companyId?: string; publicToken?: string };
    const companyId = String(body.companyId || '').trim();
    const publicToken = String(body.publicToken || '').trim();
    const context = await requireStatementUploadAccess(companyId);
    if (!publicToken) return NextResponse.json({ error: 'publicToken is required' }, { status: 400 });
    if (!isPlaidConfigured()) return NextResponse.json({ error: 'Plaid is not set up yet.' }, { status: 503 });

    const result = await withPlaidStatements(publicToken, async (statements, institution) => ({
      institution,
      ...(await saveFetchedStatements({ companyId, userId: context.userId, userEmail: context.email, statements, deadline })),
    }));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BankStatementsAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof PlaidRequestError) {
      const message =
        error.code === 'PRODUCTS_NOT_SUPPORTED'
          ? 'This bank does not provide statements through Plaid. Try Finicity or Yodlee, or upload the PDFs.'
          : error.message;
      return NextResponse.json({ error: message, code: error.code }, { status: 502 });
    }
    const message = String((error as Error)?.message || error);
    if (message.startsWith('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Plaid statement import failed:', error);
    return NextResponse.json({ error: 'Statement import failed', detail: message }, { status: 500 });
  }
}
