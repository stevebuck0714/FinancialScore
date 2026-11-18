import { NextRequest, NextResponse } from 'next/server';
import { BankStatementsAccessError, requireStatementReviewAccess } from '@/lib/bank-statements/access';
import { previewStatementExport } from '@/lib/bank-statements/export-review';
import type { TransactionFileMapping } from '@/lib/bank-statements/transaction-file';

export const dynamic = 'force-dynamic';

/** Reads a client transaction file and shows how it would be imported with the given (or detected) columns. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { companyId?: string; sheet?: string | null; mapping?: TransactionFileMapping | null };
    const companyId = String(body.companyId || '').trim();
    await requireStatementReviewAccess(companyId);
    return NextResponse.json(await previewStatementExport({ companyId, documentId: id, sheet: body.sheet ?? null, mapping: body.mapping ?? null }));
  } catch (error) {
    if (error instanceof BankStatementsAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = String((error as Error)?.message || error);
    if (message.startsWith('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Transaction file preview failed:', error);
    return NextResponse.json({ error: 'This file could not be read.', detail: message }, { status: 500 });
  }
}
