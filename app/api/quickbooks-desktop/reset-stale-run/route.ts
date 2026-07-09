import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireSiteAdminAuthorizedInforCompany } from '@/lib/infor-m3/route-guards';
import { isQuickBooksDesktopFamily } from '@/lib/quickbooks-desktop/family';

export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, any>;

const DEFAULT_MIN_STALE_MINUTES = 5;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asSessionList(metadata: JsonRecord): JsonRecord[] {
  const sessions = asRecord(metadata.quickbooksDesktopWebConnectorSessions);
  if (!sessions) return [];
  const completedTicket = asString(asRecord(metadata.quickbooksDesktopWebConnectorLastRun)?.ticket);
  return Object.values(sessions)
    .map(asRecord)
    .filter((session): session is JsonRecord => Boolean(session))
    .filter((session) => {
      if (asString(session.ticket) === completedTicket) return false;
      const requests = Array.isArray(session.requests) ? session.requests : [];
      const currentIndex = Math.max(0, Number(session.currentIndex || 0));
      return requests.length === 0 || currentIndex < requests.length;
    })
    .sort((a, b) => asString(b.updatedAt).localeCompare(asString(a.updatedAt)));
}

function getActiveJobIds(session: JsonRecord): Set<string> {
  const ids = new Set<string>();
  if (asString(session.backfillJobId)) ids.add(asString(session.backfillJobId));

  const jobIds = asRecord(session.backfillJobIds);
  if (jobIds) {
    Object.values(jobIds).forEach((value) => {
      const id = asString(value);
      if (id) ids.add(id);
    });
  }

  const sequence = Array.isArray(session.backfillJobSequence) ? session.backfillJobSequence : [];
  sequence.forEach((entry) => {
    const id = asString(asRecord(entry)?.id);
    if (id) ids.add(id);
  });

  return ids;
}

function requeueStaleJobs(
  jobsValue: unknown,
  staleTicket: string,
  activeJobIds: Set<string>,
  now: string,
): { jobs: JsonRecord | undefined; requeuedCount: number } {
  const jobs = asRecord(jobsValue);
  if (!jobs) return { jobs: undefined, requeuedCount: 0 };

  let requeuedCount = 0;
  const nextJobs = Object.fromEntries(
    Object.entries(jobs).map(([id, value]) => {
      const job = asRecord(value);
      if (!job) return [id, value];
      const shouldRequeue =
        asString(job.status).toLowerCase() === 'running' &&
        (asString(job.ticket) === staleTicket || activeJobIds.has(asString(job.id) || id));

      if (!shouldRequeue) return [id, job];

      requeuedCount += 1;
      const { ticket, failedAt, completedAt, ...rest } = job;
      return [
        id,
        {
          ...rest,
          status: 'queued',
          updatedAt: now,
          iteratorRemainingCount: null,
          lastError: null,
        },
      ];
    }),
  );

  return { jobs: nextJobs, requeuedCount };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as JsonRecord;
    const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
    const minStaleMinutes = Math.max(
      1,
      Math.min(120, Number(body.minStaleMinutes || DEFAULT_MIN_STALE_MINUTES) || DEFAULT_MIN_STALE_MINUTES),
    );

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { accountingSystem: true },
    });
    if (!company) {
      return NextResponse.json({ ok: false, error: 'Company not found' }, { status: 404 });
    }
    if (!isQuickBooksDesktopFamily(company.accountingSystem)) {
      return NextResponse.json(
        { ok: false, error: 'Stale run reset is only available for QuickBooks Desktop-family companies.' },
        { status: 400 },
      );
    }

    const connection = await prisma.accountingConnection.findUnique({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
      select: { connectionMetadata: true },
    });
    if (!connection) {
      return NextResponse.json(
        { ok: false, error: 'QuickBooks Desktop connection settings have not been saved yet.' },
        { status: 404 },
      );
    }

    const metadata = asRecord(connection.connectionMetadata) || {};
    const activeSession = asSessionList(metadata)[0];
    if (!activeSession) {
      return NextResponse.json({ ok: false, error: 'No active QuickBooks Desktop Web Connector session was found.' }, { status: 400 });
    }

    const staleTicket = asString(activeSession.ticket);
    const updatedAt = asString(activeSession.updatedAt);
    const updatedAtMs = updatedAt ? new Date(updatedAt).getTime() : NaN;
    const staleAgeMinutes = Number.isFinite(updatedAtMs) ? Math.floor((Date.now() - updatedAtMs) / 60000) : null;
    if (!staleTicket || staleAgeMinutes === null || staleAgeMinutes < minStaleMinutes) {
      return NextResponse.json(
        {
          ok: false,
          error: `The latest QuickBooks Desktop Web Connector session is not stale yet. Wait at least ${minStaleMinutes} minutes without backend updates before resetting.`,
          staleAgeMinutes,
          minStaleMinutes,
        },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const activeJobIds = getActiveJobIds(activeSession);
    const headerReset = requeueStaleJobs(metadata.quickbooksDesktopBackfillJobs, staleTicket, activeJobIds, now);
    const detailReset = requeueStaleJobs(metadata.quickbooksDesktopDetailBackfillJobs, staleTicket, activeJobIds, now);
    const sessions = asRecord(metadata.quickbooksDesktopWebConnectorSessions) || {};
    const { [staleTicket]: _removedSession, ...remainingSessions } = sessions;

    await prisma.accountingConnection.update({
      where: {
        companyId_platform: {
          companyId,
          platform: 'QUICKBOOKS',
        },
      },
      data: {
        connectionMetadata: {
          ...metadata,
          quickbooksDesktopWebConnectorSessions: remainingSessions,
          quickbooksDesktopBackfillJobs: headerReset.jobs || metadata.quickbooksDesktopBackfillJobs,
          quickbooksDesktopDetailBackfillJobs: detailReset.jobs || metadata.quickbooksDesktopDetailBackfillJobs,
          quickbooksDesktopWebConnectorLastRecovery: {
            ticket: staleTicket,
            resetAt: now,
            staleAgeMinutes,
            headerJobsRequeued: headerReset.requeuedCount,
            detailJobsRequeued: detailReset.requeuedCount,
          },
        } as any,
        errorMessage: null,
      },
    });

    return NextResponse.json({
      ok: true,
      companyId,
      ticket: staleTicket,
      staleAgeMinutes,
      headerJobsRequeued: headerReset.requeuedCount,
      detailJobsRequeued: detailReset.requeuedCount,
      message: 'Stale QuickBooks Desktop Web Connector run cleared. Requeued abandoned running jobs.',
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to reset stale QuickBooks Desktop run';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
