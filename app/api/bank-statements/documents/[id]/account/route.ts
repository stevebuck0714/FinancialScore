import { NextRequest, NextResponse } from 'next/server';
import { BankStatementsAccessError, requireStatementReviewAccess } from '@/lib/bank-statements/access';
import { correctStatementAccount } from '@/lib/bank-statements/export-review';

export const dynamic = 'force-dynamic';

/** Corrects the bank account an uploaded statement was read as. Corelytics team only. */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await request.json().catch(() => ({}))) as { companyId?: string; last4?: string; bankName?: string | null };
    const companyId = String(body.companyId || '').trim();
    const context = await requireStatementReviewAccess(companyId);
    await correctStatementAccount({
      companyId,
      documentId: id,
      last4: String(body.last4 || ''),
      bankName: body.bankName ?? null,
      ctx: { userId: context.userId, email: context.email },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof BankStatementsAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = String((error as Error)?.message || error);
    if (message.startsWith('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Statement account correction failed:', error);
    return NextResponse.json({ error: 'The account could not be saved.', detail: message }, { status: 500 });
  }
}
