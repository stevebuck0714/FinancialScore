import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditLog } from '@/lib/audit-logger';
import { askThreadErrorResponse, serializeTurn } from '@/lib/ask-corelytics/threads';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ threadId: string }> };

const NOT_FOUND = { error: 'Thread not found' };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const context = await requireAuth();
    const { threadId } = await ctx.params;
    const thread = await prisma.askThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        companyId: true,
        ownerUserId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        turns: { orderBy: { position: 'asc' } },
        shares: {
          where: { sharedWithUserId: context.userId },
          select: {
            id: true,
            sharedAt: true,
            viewedAt: true,
            sharedTurnCount: true,
            message: true,
            sharedBy: { select: { name: true, email: true } },
          },
        },
      },
    });
    if (!thread) return NextResponse.json(NOT_FOUND, { status: 404 });
    if (!(await validateCompanyAccess(thread.companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const base = {
      id: thread.id,
      companyId: thread.companyId,
      title: thread.title,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
    };

    if (thread.ownerUserId === context.userId) {
      return NextResponse.json({ ...base, access: 'owner', turns: thread.turns.map(serializeTurn) });
    }

    const share = thread.shares[0];
    if (!share) return NextResponse.json(NOT_FOUND, { status: 404 });

    if (!share.viewedAt) {
      await prisma.askThreadShare.update({ where: { id: share.id }, data: { viewedAt: new Date() } });
      await auditLog({
        action: 'ASK_THREAD_SHARE_VIEWED',
        entityType: 'AskThread',
        entityId: thread.id,
        metadata: { companyId: thread.companyId, shareId: share.id },
      });
    }

    return NextResponse.json({
      ...base,
      access: 'recipient',
      share: {
        sharedAt: share.sharedAt.toISOString(),
        sharedBy: share.sharedBy,
        message: share.message,
      },
      turns: thread.turns.slice(0, share.sharedTurnCount).map(serializeTurn),
    });
  } catch (error) {
    return askThreadErrorResponse(error, 'Failed to load Ask Corelytics thread');
  }
}

/** Owners delete the thread. Recipients remove it from their Shared with me list. */
export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  try {
    const context = await requireAuth();
    const { threadId } = await ctx.params;
    const thread = await prisma.askThread.findUnique({
      where: { id: threadId },
      select: { id: true, companyId: true, ownerUserId: true, _count: { select: { shares: true } } },
    });
    if (!thread) return NextResponse.json(NOT_FOUND, { status: 404 });
    if (!(await validateCompanyAccess(thread.companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (thread.ownerUserId === context.userId) {
      await prisma.askThread.delete({ where: { id: thread.id } });
      await auditLog({
        action: 'ASK_THREAD_DELETED',
        entityType: 'AskThread',
        entityId: thread.id,
        metadata: { companyId: thread.companyId, removedShares: thread._count.shares },
      });
      return NextResponse.json({ success: true, deleted: 'thread' });
    }

    const removed = await prisma.askThreadShare.deleteMany({
      where: { threadId: thread.id, sharedWithUserId: context.userId },
    });
    if (removed.count === 0) return NextResponse.json(NOT_FOUND, { status: 404 });
    await auditLog({
      action: 'ASK_THREAD_SHARE_REMOVED_BY_RECIPIENT',
      entityType: 'AskThread',
      entityId: thread.id,
      metadata: { companyId: thread.companyId },
    });
    return NextResponse.json({ success: true, deleted: 'share' });
  } catch (error) {
    return askThreadErrorResponse(error, 'Failed to delete Ask Corelytics thread');
  }
}
