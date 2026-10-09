import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, validateCompanyAccess } from '@/lib/tenant-security';
import { askThreadErrorResponse } from '@/lib/ask-corelytics/threads';

export const dynamic = 'force-dynamic';

const MAX_THREADS = 100;

export async function GET(request: NextRequest) {
  try {
    const context = await requireAuth();
    const companyId = String(request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    if (!(await validateCompanyAccess(companyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const [myThreads, sharedWithMe] = await Promise.all([
      prisma.askThread.findMany({
        where: { companyId, ownerUserId: context.userId },
        orderBy: { updatedAt: 'desc' },
        take: MAX_THREADS,
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { turns: true } },
          shares: {
            orderBy: { sharedAt: 'asc' },
            select: { viewedAt: true, sharedWith: { select: { id: true, name: true, email: true } } },
          },
        },
      }),
      prisma.askThreadShare.findMany({
        where: { sharedWithUserId: context.userId, thread: { companyId } },
        orderBy: { sharedAt: 'desc' },
        take: MAX_THREADS,
        select: {
          id: true,
          threadId: true,
          sharedAt: true,
          viewedAt: true,
          sharedTurnCount: true,
          message: true,
          thread: { select: { title: true } },
          sharedBy: { select: { name: true, email: true } },
        },
      }),
    ]);

    return NextResponse.json({
      myThreads: myThreads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        createdAt: thread.createdAt.toISOString(),
        updatedAt: thread.updatedAt.toISOString(),
        turnCount: thread._count.turns,
        sharedWith: thread.shares.map((share) => ({
          userId: share.sharedWith.id,
          name: share.sharedWith.name || share.sharedWith.email,
          viewed: Boolean(share.viewedAt),
        })),
      })),
      sharedWithMe: sharedWithMe.map((share) => ({
        shareId: share.id,
        threadId: share.threadId,
        title: share.thread.title,
        sharedAt: share.sharedAt.toISOString(),
        viewedAt: share.viewedAt ? share.viewedAt.toISOString() : null,
        turnCount: share.sharedTurnCount,
        message: share.message,
        sharedBy: { name: share.sharedBy.name, email: share.sharedBy.email },
      })),
    });
  } catch (error) {
    return askThreadErrorResponse(error, 'Failed to load Ask Corelytics threads');
  }
}
