import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';

export function askThreadErrorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Unauthorized')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (message.startsWith('Forbidden')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  console.error(fallback, error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

const ASK_SECTION_KEY = 'ask-corelytics';
const MAX_TITLE_CHARS = 120;

export type AskThreadTurnDto = {
  id: string;
  position: number;
  askedAt: string;
  question: string;
  useExternalSources: boolean;
  response: unknown;
};

export type ShareCandidate = {
  id: string;
  name: string;
  email: string;
};

export function titleFromQuestion(question: string): string {
  const clean = String(question || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_TITLE_CHARS) return clean || 'Untitled thread';
  return `${clean.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`;
}

export function serializeTurn(turn: {
  id: string;
  position: number;
  askedAt: Date;
  question: string;
  useExternalSources: boolean;
  response: Prisma.JsonValue;
}): AskThreadTurnDto {
  return {
    id: turn.id,
    position: turn.position,
    askedAt: turn.askedAt.toISOString(),
    question: turn.question,
    useExternalSources: turn.useExternalSources,
    response: turn.response,
  };
}

function hasAskCorelyticsAccess(
  user: {
    role: string;
    companyId: string | null;
    companyRole: string | null;
    sidebarAccess: Prisma.JsonValue | null;
    companyAccess: Array<{ companyRole: string | null; sidebarAccess: Prisma.JsonValue | null }>;
  },
  companyId: string,
): boolean {
  if (user.role !== 'USER') return true;
  const membership = user.companyAccess[0];
  const isHomeCompany = user.companyId === companyId;
  const companyRole = String(membership?.companyRole || (isHomeCompany ? user.companyRole : '') || '').toLowerCase();
  if (companyRole === 'admin') return true;
  const sidebar = membership?.sidebarAccess ?? (isHomeCompany ? user.sidebarAccess : null);
  // Missing sidebar access means full access, matching the app navigation.
  if (!Array.isArray(sidebar)) return true;
  return sidebar.includes(ASK_SECTION_KEY);
}

/**
 * Users who belong to the company (home company or explicit company access)
 * and can open Ask Corelytics. Site admins are excluded: they are not company members.
 */
export async function listShareCandidates(companyId: string, excludeUserId: string): Promise<ShareCandidate[]> {
  const users = await prisma.user.findMany({
    where: {
      id: { not: excludeUserId },
      role: { not: 'SITEADMIN' },
      OR: [{ companyId }, { companyAccess: { some: { companyId } } }],
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      companyId: true,
      companyRole: true,
      sidebarAccess: true,
      companyAccess: {
        where: { companyId },
        select: { companyRole: true, sidebarAccess: true },
      },
    },
    orderBy: { name: 'asc' },
  });
  return users
    .filter((user) => hasAskCorelyticsAccess(user, companyId))
    .map((user) => ({ id: user.id, name: user.name, email: user.email }));
}

export async function appendTurnToThread(params: {
  companyId: string;
  ownerUserId: string;
  threadId: string | null;
  question: string;
  useExternalSources: boolean;
  response: Prisma.InputJsonValue;
}): Promise<{ threadId: string; turnId: string }> {
  return prisma.$transaction(async (tx) => {
    let threadId = params.threadId;
    if (threadId) {
      const existing = await tx.askThread.findFirst({
        where: { id: threadId, companyId: params.companyId, ownerUserId: params.ownerUserId },
        select: { id: true },
      });
      if (!existing) threadId = null;
    }
    if (!threadId) {
      const created = await tx.askThread.create({
        data: {
          companyId: params.companyId,
          ownerUserId: params.ownerUserId,
          title: titleFromQuestion(params.question),
        },
        select: { id: true },
      });
      threadId = created.id;
    }
    const position = await tx.askThreadTurn.count({ where: { threadId } });
    const turn = await tx.askThreadTurn.create({
      data: {
        threadId,
        position,
        question: params.question,
        useExternalSources: params.useExternalSources,
        response: params.response,
      },
      select: { id: true },
    });
    await tx.askThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
    return { threadId, turnId: turn.id };
  });
}
