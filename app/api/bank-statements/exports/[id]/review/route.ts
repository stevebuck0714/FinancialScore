import { NextRequest, NextResponse } from 'next/server';
import { BankStatementsAccessError, requireStatementReviewAccess } from '@/lib/bank-statements/access';
import { acceptStatementExport, rejectStatementExport } from '@/lib/bank-statements/export-review';
import type { ConfirmedAccount, TransactionFileMapping } from '@/lib/bank-statements/transaction-file';

export const dynamic = 'force-dynamic';
// Accepting runs Read Statements and book-to-bank matching for the Cash Proof.
export const maxDuration = 300;

type ReviewBody = {
  companyId?: string;
  action?: 'accept' | 'reject';
  mapping?: TransactionFileMapping;
  accounts?: ConfirmedAccount[];
  fromMonth?: string | null;
  toMonth?: string | null;
  note?: string;
};

/** Accepts (imports) or rejects a client transaction file. Corelytics team only. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as ReviewBody;
    const companyId = String(body.companyId || '').trim();
    const context = await requireStatementReviewAccess(companyId);
    const reviewer = { userId: context.userId, email: context.email };

    if (body.action === 'reject') {
      await rejectStatementExport({ companyId, documentId: id, note: String(body.note || ''), ctx: reviewer });
      return NextResponse.json({ ok: true });
    }
    if (body.action !== 'accept' || !body.mapping) {
      return NextResponse.json({ error: 'action must be accept (with mapping) or reject (with note)' }, { status: 400 });
    }
    const result = await acceptStatementExport({
      companyId,
      documentId: id,
      mapping: body.mapping,
      accounts: Array.isArray(body.accounts) ? body.accounts : [],
      fromMonth: body.fromMonth ?? null,
      toMonth: body.toMonth ?? null,
      ctx: reviewer,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof BankStatementsAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = String((error as Error)?.message || error);
    if (message.startsWith('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Transaction file review failed:', error);
    return NextResponse.json({ error: 'The review could not be saved.', detail: message }, { status: 500 });
  }
}
