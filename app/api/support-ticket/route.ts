import { NextResponse } from 'next/server';
import { sendSupportTicket } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      subject,
      category,
      priority,
      description,
      contactName,
      contactEmail,
      companyName,
      pageModule,
    } = body;

    if (!subject?.trim() || !category?.trim() || !description?.trim() || !contactName?.trim() || !contactEmail?.trim() || !companyName?.trim()) {
      return NextResponse.json(
        { error: 'Subject, Category, Description, Contact Name, Contact Email, and Company Name are required.' },
        { status: 400 }
      );
    }

    await sendSupportTicket({
      subject: subject.trim(),
      category: category.trim(),
      priority: priority?.trim() || undefined,
      description: description.trim(),
      contactName: contactName.trim(),
      contactEmail: contactEmail.trim(),
      companyName: companyName.trim(),
      pageModule: pageModule?.trim() || undefined,
    });

    return NextResponse.json({ success: true, message: 'Support ticket submitted successfully.' });
  } catch (error) {
    console.error('Support ticket error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit support ticket.' },
      { status: 500 }
    );
  }
}
