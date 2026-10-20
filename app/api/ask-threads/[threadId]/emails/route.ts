import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditLog } from '@/lib/audit-logger';
import { askThreadErrorResponse } from '@/lib/ask-corelytics/threads';
import { sendAskThreadResultEmail, type AskThreadEmailTurn } from '@/lib/email';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ threadId: string }> };

const MAX_RECIPIENTS_PER_REQUEST = 10;
const MAX_RECIPIENTS_PER_HOUR = 50;
const MAX_MESSAGE_CHARS = 1000;
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toEmailTurn(turn: { askedAt: Date; question: string; response: Prisma.JsonValue }): AskThreadEmailTurn {
  const response = (turn.response && typeof turn.response === 'object' && !Array.isArray(turn.response)
    ? turn.response
    : {}) as Record<string, unknown>;
  const bullets = Array.isArray(response.citedBullets) ? response.citedBullets : [];
  const sources = Array.isArray(response.sources) ? response.sources : [];
  return {
    askedAt: turn.askedAt,
    question: turn.question,
    shortAnswer: asText(response.shortAnswer),
    longAnswer: asText(response.longAnswer),
    howThisImpactsUs: asText(response.howThisImpactsUs),
    citedBullets: bullets.map((b) => ({ text: asText((b as Record<string, unknown>)?.text) })),
    sources: sources.map((s) => {
      const source = (s || {}) as Record<string, unknown>;
      return {
        url: asText(source.url),
        title: asText(source.title) || null,
        publishedDate: asText(source.publishedDate) || null,
      };
    }),
  };
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const context = await requireAuth();
    const { threadId } = await ctx.params;
    const thread = await prisma.askThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        title: true,
        companyId: true,
        ownerUserId: true,
        company: { select: { name: true } },
        turns: { orderBy: { position: 'asc' }, select: { askedAt: true, question: true, response: true } },
      },
    });
    if (!thread || thread.ownerUserId !== context.userId || !(await validateCompanyAccess(thread.companyId))) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }
    if (thread.turns.length === 0) {
      return NextResponse.json({ error: 'Ask at least one question before emailing.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const rawEmails: unknown[] = Array.isArray(body?.emails)
      ? body.emails
      : String(body?.emails || '').split(/[,;\s]+/);
    const emails = Array.from(
      new Set(rawEmails.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean)),
    );
    if (emails.length === 0) {
      return NextResponse.json({ error: 'Enter at least one email address.' }, { status: 400 });
    }
    if (emails.length > MAX_RECIPIENTS_PER_REQUEST) {
      return NextResponse.json({ error: `Email at most ${MAX_RECIPIENTS_PER_REQUEST} addresses at a time.` }, { status: 400 });
    }
    const invalid = emails.filter((email) => email.length > 254 || !EMAIL_PATTERN.test(email));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Check these addresses: ${invalid.join(', ')}` }, { status: 400 });
    }

    const message = String(body?.message || '').trim();
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json({ error: `Keep the message under ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 });
    }

    const sentLastHour = await prisma.askThreadEmail.count({
      where: { sentByUserId: context.userId, sentAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (sentLastHour + emails.length > MAX_RECIPIENTS_PER_HOUR) {
      return NextResponse.json(
        { error: `You can email up to ${MAX_RECIPIENTS_PER_HOUR} addresses per hour. Try again later.` },
        { status: 429 },
      );
    }

    const sender = await prisma.user.findUnique({ where: { id: context.userId }, select: { name: true, email: true } });
    const senderEmail = sender?.email || context.email;
    const sentByNameOrEmail = sender?.name?.trim() || senderEmail;
    const turns = thread.turns.map(toEmailTurn);
    const sentAt = new Date();

    const results = await Promise.all(
      emails.map(async (email) => ({
        email,
        result: await sendAskThreadResultEmail({
          to: [email],
          replyTo: senderEmail,
          sentByNameOrEmail,
          companyName: thread.company?.name || 'your company',
          threadTitle: thread.title,
          sentAt,
          message,
          turns,
        }),
      })),
    );
    const sent = results.filter((r) => r.result.success);
    const failed = results.filter((r) => !r.result.success).map((r) => r.email);

    if (sent.length > 0) {
      await prisma.askThreadEmail.createMany({
        data: sent.map((r) => ({
          threadId: thread.id,
          sentByUserId: context.userId,
          recipientEmail: r.email,
          sentTurnCount: thread.turns.length,
          message: message || null,
          providerMessageId: r.result.success ? r.result.data?.id || null : null,
          sentAt,
        })),
      });
    }
    await auditLog({
      action: 'ASK_THREAD_EMAILED',
      entityType: 'AskThread',
      entityId: thread.id,
      success: sent.length > 0,
      metadata: {
        companyId: thread.companyId,
        recipientEmails: sent.map((r) => r.email),
        failedRecipientEmails: failed,
        sentTurnCount: thread.turns.length,
        messageLength: message.length,
      },
    });

    if (sent.length === 0) {
      return NextResponse.json({ error: 'The email could not be sent. Try again in a few minutes.', failed }, { status: 502 });
    }
    return NextResponse.json({ sent: sent.map((r) => r.email), failed });
  } catch (error) {
    return askThreadErrorResponse(error, 'Failed to email thread');
  }
}
