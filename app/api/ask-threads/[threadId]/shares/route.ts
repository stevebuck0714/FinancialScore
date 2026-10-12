import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditLog } from '@/lib/audit-logger';
import { askThreadErrorResponse, listShareCandidates } from '@/lib/ask-corelytics/threads';
import { sendAskThreadSharedEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ threadId: string }> };

const MAX_RECIPIENTS_PER_REQUEST = 50;
const MAX_MESSAGE_CHARS = 1000;

async function loadOwnedThread(threadId: string, userId: string) {
  const thread = await prisma.askThread.findUnique({
    where: { id: threadId },
    select: { id: true, companyId: true, ownerUserId: true, _count: { select: { turns: true } } },
  });
  if (!thread || thread.ownerUserId !== userId) return null;
  if (!(await validateCompanyAccess(thread.companyId))) return null;
  return thread;
}

async function listShares(threadId: string) {
  const shares = await prisma.askThreadShare.findMany({
    where: { threadId },
    orderBy: { sharedAt: 'desc' },
    select: {
      sharedAt: true,
      viewedAt: true,
      sharedTurnCount: true,
      message: true,
      sharedWith: { select: { id: true, name: true, email: true } },
    },
  });
  return shares.map((share) => ({
    userId: share.sharedWith.id,
    name: share.sharedWith.name,
    email: share.sharedWith.email,
    sharedAt: share.sharedAt.toISOString(),
    viewedAt: share.viewedAt ? share.viewedAt.toISOString() : null,
    sharedTurnCount: share.sharedTurnCount,
    message: share.message,
  }));
}

async function notifyShareRecipients(params: {
  request: NextRequest;
  threadId: string;
  companyId: string;
  sharedByUserId: string;
  sharedByEmail: string;
  recipientUserIds: string[];
  questionCount: number;
  sharedAt: Date;
  message: string;
}) {
  try {
    const [thread, company, sharer, recipients] = await Promise.all([
      prisma.askThread.findUnique({ where: { id: params.threadId }, select: { title: true } }),
      prisma.company.findUnique({ where: { id: params.companyId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: params.sharedByUserId }, select: { name: true, email: true } }),
      prisma.user.findMany({
        where: { id: { in: params.recipientUserIds } },
        select: { name: true, email: true },
      }),
    ]);
    const baseUrl = String(
      process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || params.request.nextUrl.origin || 'http://localhost:3002'
    ).replace(/\/+$/, '');
    const sharedByNameOrEmail = sharer?.name?.trim() || sharer?.email || params.sharedByEmail;

    await Promise.all(
      recipients
        .filter((recipient) => recipient.email)
        .map((recipient) =>
          sendAskThreadSharedEmail({
            to: recipient.email,
            recipientName: recipient.name || recipient.email,
            sharedByNameOrEmail,
            companyName: company?.name || 'your company',
            threadTitle: thread?.title || 'Untitled thread',
            questionCount: params.questionCount,
            sharedAt: params.sharedAt,
            message: params.message,
            openLink: `${baseUrl}/?view=ai-analysis`,
          }),
        ),
    );
  } catch (error) {
    console.error('Failed to send Ask Corelytics share notification emails:', error);
  }
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const context = await requireAuth();
    const { threadId } = await ctx.params;
    const thread = await loadOwnedThread(threadId, context.userId);
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

    const [candidates, shares] = await Promise.all([
      listShareCandidates(thread.companyId, context.userId),
      listShares(thread.id),
    ]);
    return NextResponse.json({ turnCount: thread._count.turns, candidates, shares });
  } catch (error) {
    return askThreadErrorResponse(error, 'Failed to load thread sharing');
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const context = await requireAuth();
    const { threadId } = await ctx.params;
    const thread = await loadOwnedThread(threadId, context.userId);
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    if (thread._count.turns === 0) {
      return NextResponse.json({ error: 'Ask at least one question before sharing.' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const requested = Array.isArray(body?.userIds)
      ? Array.from(new Set((body.userIds as unknown[]).map((id) => String(id || '').trim()).filter(Boolean)))
      : [];
    if (requested.length === 0) {
      return NextResponse.json({ error: 'Select at least one person to share with.' }, { status: 400 });
    }
    if (requested.length > MAX_RECIPIENTS_PER_REQUEST) {
      return NextResponse.json({ error: `Share with at most ${MAX_RECIPIENTS_PER_REQUEST} people at a time.` }, { status: 400 });
    }

    const message = String(body?.message || '').trim();
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json({ error: `Keep the message under ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 });
    }

    const eligibleIds = new Set((await listShareCandidates(thread.companyId, context.userId)).map((c) => c.id));
    const ineligible = requested.filter((id) => !eligibleIds.has(id));
    if (ineligible.length > 0) {
      return NextResponse.json(
        { error: 'One or more selected people do not have Ask Corelytics access for this company.' },
        { status: 400 },
      );
    }

    const now = new Date();
    await prisma.$transaction(
      requested.map((sharedWithUserId) =>
        prisma.askThreadShare.upsert({
          where: { threadId_sharedWithUserId: { threadId: thread.id, sharedWithUserId } },
          create: {
            threadId: thread.id,
            sharedWithUserId,
            sharedByUserId: context.userId,
            sharedTurnCount: thread._count.turns,
            message: message || null,
            sharedAt: now,
          },
          update: {
            sharedByUserId: context.userId,
            sharedTurnCount: thread._count.turns,
            message: message || null,
            sharedAt: now,
            viewedAt: null,
          },
        }),
      ),
    );
    await auditLog({
      action: 'ASK_THREAD_SHARED',
      entityType: 'AskThread',
      entityId: thread.id,
      metadata: {
        companyId: thread.companyId,
        recipientUserIds: requested,
        sharedTurnCount: thread._count.turns,
        messageLength: message.length,
      },
    });

    await notifyShareRecipients({
      request,
      threadId: thread.id,
      companyId: thread.companyId,
      sharedByUserId: context.userId,
      sharedByEmail: context.email,
      recipientUserIds: requested,
      questionCount: thread._count.turns,
      sharedAt: now,
      message,
    });

    return NextResponse.json({ turnCount: thread._count.turns, shares: await listShares(thread.id) });
  } catch (error) {
    return askThreadErrorResponse(error, 'Failed to share thread');
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  try {
    const context = await requireAuth();
    const { threadId } = await ctx.params;
    const thread = await loadOwnedThread(threadId, context.userId);
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });

    const sharedWithUserId = String(request.nextUrl.searchParams.get('userId') || '').trim();
    if (!sharedWithUserId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    const removed = await prisma.askThreadShare.deleteMany({ where: { threadId: thread.id, sharedWithUserId } });
    if (removed.count > 0) {
      await auditLog({
        action: 'ASK_THREAD_UNSHARED',
        entityType: 'AskThread',
        entityId: thread.id,
        metadata: { companyId: thread.companyId, recipientUserId: sharedWithUserId },
      });
    }
    return NextResponse.json({ shares: await listShares(thread.id) });
  } catch (error) {
    return askThreadErrorResponse(error, 'Failed to remove share');
  }
}
