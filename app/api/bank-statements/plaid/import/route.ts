import { NextRequest, NextResponse } from 'next/server';
import { BankStatementsAccessError, requireStatementUploadAccess } from '@/lib/bank-statements/access';
import { importPlaidBankData, isPlaidConfigured, PlaidRequestError } from '@/lib/bank-statements/plaid';
import { saveBankDataReport, saveFetchedStatements } from '@/lib/bank-statements/store';

export const dynamic = 'force-dynamic';
// Downloads up to 24 statement PDFs per connected account.
export const maxDuration = 300;

// New statement downloads stop here; the bank data report may wait a little longer.
// Both leave time for in-flight downloads, retries, and removing the bank connection.
const DOWNLOAD_BUDGET_MS = 200_000;
const ASSET_REPORT_BUDGET_MS = 250_000;

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await request.json().catch(() => ({}))) as { companyId?: string; publicToken?: string };
    const companyId = String(body.companyId || '').trim();
    const publicToken = String(body.publicToken || '').trim();
    const context = await requireStatementUploadAccess(companyId);
    if (!publicToken) return NextResponse.json({ error: 'publicToken is required' }, { status: 400 });
    if (!isPlaidConfigured()) return NextResponse.json({ error: 'Plaid is not set up yet.' }, { status: 503 });

    const ctx = { companyId, userId: context.userId, userEmail: context.email };
    const outcome = await importPlaidBankData(
      publicToken,
      {
        saveStatements: (statements) => saveFetchedStatements({ ...ctx, statements, deadline: startedAt + DOWNLOAD_BUDGET_MS }),
        saveBankDataReport: (report) => saveBankDataReport({ ...ctx, ...report }),
      },
      startedAt + ASSET_REPORT_BUDGET_MS,
    );
    return NextResponse.json({
      institution: outcome.institution,
      ...outcome.statements,
      bankData: outcome.bankData,
      bankDataNote: outcome.bankDataNote || outcome.bankData?.error || null,
    });
  } catch (error) {
    if (error instanceof BankStatementsAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof PlaidRequestError) return NextResponse.json({ error: error.message, code: error.code }, { status: 502 });
    const message = String((error as Error)?.message || error);
    if (message.startsWith('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Plaid statement import failed:', error);
    return NextResponse.json({ error: 'Statement import failed', detail: message }, { status: 500 });
  }
}
