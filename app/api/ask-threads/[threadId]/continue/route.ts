import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { auditLog } from '@/lib/audit-logger';
import { askThreadErrorResponse, serializeTurn } from '@/lib/ask-corelytics/threads';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ threadId: string }> };

export async function POST(_request: NextRequest, ctx: RouteContext) {
  try {
    const context = await requireAuth();
    const { threadId } = await ctx.params;
    const share = await prisma.askThreadShare.findUnique({
      where: { threadId_sharedWithUserId: { threadId, sharedWithUserId: context.userId } },
      select: {
        sharedTurnCount: true,
        thread: {
          select: {
            id: true,
            companyId: true,
            title: true,
            turns: { orderBy: { position: 'asc' } },
          },
        },
      },
    });
    if (!share) return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    const source = share.thread;
    if (!(await validateCompanyAccess(source.companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sharedTurns = source.turns.slice(0, share.sharedTurnCount);
    const created = await prisma.askThread.create({
      data: {
        companyId: source.companyId,
        ownerUserId: context.userId,
        title: source.title,
        forkedFromThreadId: source.id,
        turns: {
          create: sharedTurns.map((turn, position) => ({
            position,
            question: turn.question,
            useExternalSources: turn.useExternalSources,
            response: turn.response as Prisma.InputJsonValue,
            askedAt: turn.askedAt,
          })),
        },
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        turns: { orderBy: { position: 'asc' } },
      },
    });
    await auditLog({
      action: 'ASK_THREAD_CONTINUED',
      entityType: 'AskThread',
      entityId: created.id,
      metadata: { companyId: source.companyId, forkedFromThreadId: source.id, copiedTurns: sharedTurns.length },
    });

    return NextResponse.json({
      id: created.id,
      companyId: source.companyId,
      title: created.title,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
      access: 'owner',
      turns: created.turns.map(serializeTurn),
    });
  } catch (error) {
    return askThreadErrorResponse(error, 'Failed to continue shared thread');
  }
}
