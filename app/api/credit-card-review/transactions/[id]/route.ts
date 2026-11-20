import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { BankStatementsAccessError, requireCreditCardReviewAccess } from '@/lib/bank-statements/access';

export const dynamic = 'force-dynamic';

const CLASSIFICATIONS = new Set(['BUSINESS', 'PERSONAL_DISCRETIONARY', 'NON_RECURRING', 'NEEDS_EXPLANATION', 'EXCLUDED']);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { classification?: unknown; note?: unknown };
    const transaction = await prisma.creditCardTransaction.findUnique({ where: { id }, select: { companyId: true } });
    if (!transaction) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const user = await requireCreditCardReviewAccess(transaction.companyId);

    const classification = String(body.classification || '').trim().toUpperCase();
    if (!CLASSIFICATIONS.has(classification)) return NextResponse.json({ error: 'Invalid classification' }, { status: 400 });
    const note = String(body.note || '').trim();
    if ((classification === 'PERSONAL_DISCRETIONARY' || classification === 'NON_RECURRING') && !note) {
      return NextResponse.json({ error: 'A review note is required for a potential QoE adjustment.' }, { status: 400 });
    }
    const updated = await prisma.creditCardTransaction.update({
      where: { id },
      data: { reviewClassification: classification, reviewNote: note || null, reviewedByUserId: user.userId, reviewedAt: new Date() },
      select: { id: true, reviewClassification: true, reviewNote: true, reviewedAt: true },
    });
    return NextResponse.json({ transaction: updated });
  } catch (error) {
    if (error instanceof BankStatementsAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    const message = String((error as Error)?.message || error);
    if (message.startsWith('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('Credit-card transaction review failed:', error);
    return NextResponse.json({ error: 'Failed to save credit-card review', detail: message }, { status: 500 });
  }
}
