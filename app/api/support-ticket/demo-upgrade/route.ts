import { NextResponse } from 'next/server';
import { sendSupportTicket } from '@/lib/email';
import prisma from '@/lib/prisma';

/**
 * Public endpoint for the logged-in-app "Upgrade now" (demo) modal.
 * The main /api/support-ticket route requires middleware-injected auth headers; this flow
 * still failed for some sessions, so demo upgrade posts here without auth (rate-limited in middleware).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { subject, category, priority, description, contactName, contactEmail, companyName, pageModule, companyId } =
      body;

    if (String(category || '').trim() !== 'Demo Upgrade') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (
      !subject?.trim() ||
      !description?.trim() ||
      !contactName?.trim() ||
      !contactEmail?.trim() ||
      !companyName?.trim()
    ) {
      return NextResponse.json(
        { error: 'Subject, Description, Contact Name, Contact Email, and Company Name are required.' },
        { status: 400 },
      );
    }

    if (companyId && typeof companyId === 'string' && companyId.trim()) {
      const exists = await prisma.company.findUnique({
        where: { id: companyId.trim() },
        select: { id: true },
      });
      if (!exists) {
        return NextResponse.json({ error: 'Invalid company reference.' }, { status: 400 });
      }
    }

    await sendSupportTicket({
      subject: subject.trim(),
      category: 'Demo Upgrade',
      priority: priority?.trim() || undefined,
      description: description.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      companyName: companyName.trim(),
      pageModule: pageModule?.trim() || undefined,
      tier1Owner: 'CORELYTICS',
      routedToEmail: 'support@corelytics.com',
      routedToLabel: 'Corelytics Tier 1',
    });

    return NextResponse.json({ success: true, message: 'Support ticket submitted successfully.' });
  } catch (error) {
    console.error('Demo upgrade support ticket error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit upgrade request.' },
      { status: 500 },
    );
  }
}
