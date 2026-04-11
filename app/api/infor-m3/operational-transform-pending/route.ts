import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const RUN_MODE = 'pending_transform_replay';
const RUN_FREQUENCY = 'daily';
const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_STALE_MINUTES = 10;
const LEASE_TIMEOUT_MS = 120_000;
const TASK_TIMEOUT_MS = 90_000;

type PendingTaskPayload = {
  sourceSyncRunId: string;
  businessDateIso: string;
  frequency: 'daily' | 'weekly' | 'monthly';
};

type AuthorizedCompany = {
  companyId: string;
  viaWorkerSecret: boolean;
};

function asPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function normalizeFrequency(value: unknown): 'daily' | 'weekly' | 'monthly' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'weekly') return 'weekly';
  if (normalized === 'monthly') return 'monthly';
  return 'daily';
}

function parseTaskPayload(value: unknown): PendingTaskPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const sourceSyncRunId = String(row.sourceSyncRunId || '').trim();
  const businessDateIso = String(row.businessDateIso || '').trim();
  if (!sourceSyncRunId || !/^\d{4}-\d{2}-\d{2}$/.test(businessDateIso)) return null;
  return {
    sourceSyncRunId,
    businessDateIso,
    frequency: normalizeFrequency(row.frequency),
  };
}

function getBatchSizeForAttempt(attemptNo: number): number {
  if (attemptNo <= 1) return 12;
  if (attemptNo === 2) return 8;
  if (attemptNo === 3) return 5;
  return 3;
}

function getBackoffMs(attemptNo: number): number {
  return Math.min(30_000, 1_000 * Math.max(2, 2 ** attemptNo));
}

async function resolveAuthorizedCompany(
  request: NextRequest,
  body: Record<string, unknown>,
  requireSiteAdminAuthorizedInforCompany: (
    request: NextRequest,
    body: Record<string, unknown>
  ) => Promise<{ companyId: string }>
): Promise<AuthorizedCompany> {
  const workerSecret = String(process.env.CRON_SECRET || '').trim();
  const providedWorkerSecret = String(request.headers.get('x-infor-sync-worker-secret') || '').trim();
  const viaWorkerSecret = Boolean(workerSecret && providedWorkerSecret && providedWorkerSecret === workerSecret);
  if (viaWorkerSecret) {
    const companyId = String(body.companyId || request.nextUrl.searchParams.get('companyId') || '').trim();
    if (!companyId) {
      throw new Error('companyId is required for worker execution.');
    }
    return { companyId, viaWorkerSecret: true };
  }
  const { companyId } = await requireSiteAdminAuthorizedInforCompany(request, body);
  return { companyId, viaWorkerSecret: false };
}

async function getPendingRemaining(prisma: any, companyId: string): Promise<number> {
  const pendingRows = await prisma.$queryRaw<Array<{ pending: number }>>`
    SELECT COUNT(*)::int AS pending
    FROM (
      SELECT rc."syncRunId", rc."businessDate"
      FROM "InforRawCompleteness" rc
      INNER JOIN "InforSyncRun" sr
        ON sr.id = rc."syncRunId"
        AND sr.status = 'done'
      WHERE rc.platform = 'INFOR_M3'
        AND rc."companyId" = ${companyId}
        AND rc."isComplete" = false
        AND COALESCE(rc."statusMessage", '') NOT LIKE 'raw_missing:%'
      GROUP BY rc."syncRunId", rc."businessDate"
    ) q
  `;
  return Number(pendingRows[0]?.pending || 0);
}

async function seedPendingTransformTasks(prisma: any, runId: string, companyId: string, maxAttempts: number): Promise<number> {
  const existingCount = await prisma.inforSyncTask.count({ where: { runId } });
  if (existingCount > 0) return 0;

  const rows = await prisma.$queryRaw<
    Array<{ sourceSyncRunId: string; businessDate: Date; frequency: string | null }>
  >`
    SELECT
      rc."syncRunId" AS "sourceSyncRunId",
      rc."businessDate" AS "businessDate",
      sr."frequency" AS "frequency"
    FROM "InforRawCompleteness" rc
    INNER JOIN "InforSyncRun" sr
      ON sr.id = rc."syncRunId"
      AND sr.status = 'done'
    WHERE rc.platform = 'INFOR_M3'
      AND rc."companyId" = ${companyId}
      AND rc."isComplete" = false
      AND COALESCE(rc."statusMessage", '') NOT LIKE 'raw_missing:%'
    GROUP BY rc."syncRunId", rc."businessDate", sr."frequency"
    ORDER BY rc."businessDate" ASC
  `;

  if (rows.length === 0) return 0;

  await prisma.inforSyncTask.createMany({
    data: rows.map((row) => ({
      runId,
      companyId,
      status: 'pending',
      maxAttempts,
      payload: {
        sourceSyncRunId: String(row.sourceSyncRunId),
        businessDateIso: new Date(row.businessDate).toISOString().slice(0, 10),
        frequency: normalizeFrequency(row.frequency),
      },
    })),
  });

  return rows.length;
}

async function getOrCreateActiveRun(prisma: any, companyId: string): Promise<any> {
  const staleCutoff = new Date(Date.now() - DEFAULT_STALE_MINUTES * 60_000);
  const staleRuns = await prisma.inforSyncRun.findMany({
    where: {
      companyId,
      platform: 'INFOR_M3',
      mode: RUN_MODE,
      status: 'running',
      OR: [{ lastChunkAt: { lt: staleCutoff } }, { lastChunkAt: null, updatedAt: { lt: staleCutoff } }],
    },
    select: { id: true },
    take: 20,
  });
  if (staleRuns.length > 0) {
    await prisma.inforSyncRun.updateMany({
      where: { id: { in: staleRuns.map((r: { id: string }) => r.id) } },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        lastError: `Marked stale after ${DEFAULT_STALE_MINUTES}m without heartbeat.`,
        message: 'Stale pending-transform run auto-failed.',
      },
    });
  }

  const running = await prisma.inforSyncRun.findFirst({
    where: {
      companyId,
      platform: 'INFOR_M3',
      mode: RUN_MODE,
      status: 'running',
    },
    orderBy: { createdAt: 'desc' },
  });
  if (running) return running;

  return prisma.inforSyncRun.create({
    data: {
      id: randomUUID(),
      companyId,
      platform: 'INFOR_M3',
      status: 'running',
      frequency: RUN_FREQUENCY,
      mode: RUN_MODE,
      message: 'Pending transform replay started.',
      startedAt: new Date(),
      lastChunkAt: new Date(),
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const { requireSiteAdminAuthorizedInforCompany } = await import('@/lib/infor-m3/route-guards');
    const prisma = (await import('@/lib/prisma')).default;
    const companyIdParam = request.nextUrl.searchParams.get('companyId') || '';
    const { companyId } = await resolveAuthorizedCompany(
      request,
      { companyId: companyIdParam },
      requireSiteAdminAuthorizedInforCompany
    );

    const run = await prisma.inforSyncRun.findFirst({
      where: {
        companyId,
        platform: 'INFOR_M3',
        mode: RUN_MODE,
      },
      orderBy: { createdAt: 'desc' },
    });

    const taskCounts = run
      ? await prisma.inforSyncTask.groupBy({
          by: ['status'],
          where: { runId: run.id },
          _count: { _all: true },
        })
      : [];
    const counts = taskCounts.reduce<Record<string, number>>((acc, row: { status: string; _count: { _all: number } }) => {
      acc[row.status] = Number(row._count._all || 0);
      return acc;
    }, {});
    const pendingRemaining = await getPendingRemaining(prisma, companyId);

    return NextResponse.json({
      ok: true,
      companyId,
      runMode: RUN_MODE,
      run: run
        ? {
            id: run.id,
            status: run.status,
            createdAt: run.createdAt,
            startedAt: run.startedAt,
            updatedAt: run.updatedAt,
            lastChunkAt: run.lastChunkAt,
            finishedAt: run.finishedAt,
            chunkCount: run.chunkCount,
            recordsCreated: run.recordsCreated,
            retryCount: run.retryCount,
            warningCount: run.warningCount,
            message: run.message,
            lastError: run.lastError,
          }
        : null,
      taskCounts: counts,
      pendingRemaining,
      done: pendingRemaining === 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to read pending transform status.',
        details: message,
      },
      { status }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { requireSiteAdminAuthorizedInforCompany } = await import('@/lib/infor-m3/route-guards');
    const prisma = (await import('@/lib/prisma')).default;
    const { transformInforM3RawRun } = await import('@/lib/infor-m3/operational-sync');
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const { companyId } = await resolveAuthorizedCompany(
      request,
      body,
      requireSiteAdminAuthorizedInforCompany
    );
    const maxDaysPerTick = Math.min(100, asPositiveInt(body.maxDaysPerTick, 20));
    const maxTicks = Math.min(5000, asPositiveInt(body.maxTicks, 5000));
    const maxAttempts = Math.min(12, asPositiveInt(body.maxAttempts, DEFAULT_MAX_ATTEMPTS));
    const runUntilDrained = body.runUntilDrained === false ? false : true;
    const requeueFailed = body.requeueFailed === true;
    const startedAt = Date.now();
    const hardStopMs = 270_000;

    const run = await getOrCreateActiveRun(prisma, companyId);
    await seedPendingTransformTasks(prisma, run.id, companyId, maxAttempts);
      // Self-heal stale leased tasks from interrupted worker executions.
      await prisma.inforSyncTask.updateMany({
        where: {
          runId: run.id,
          status: 'leased',
          leaseExpiresAt: { lt: new Date() },
        },
        data: {
          status: 'pending',
          availableAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: 'Auto-requeued expired leased task.',
        },
      });
      if (requeueFailed) {
        await prisma.inforSyncTask.updateMany({
          where: { runId: run.id, status: 'failed' },
          data: {
            status: 'pending',
            availableAt: new Date(),
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: null,
          },
        });
      }

      let ticksRun = 0;
      let processedDays = 0;
      let failedDays = 0;
      let retriedDays = 0;
      let stoppedBy = 'drained';
      const results: Array<{ businessDateIso: string; syncRunId: string; ok: boolean; status: string; details?: string }> = [];

      while (ticksRun < maxTicks && Date.now() - startedAt < hardStopMs) {
        const now = new Date();
        await prisma.inforSyncTask.updateMany({
          where: {
            runId: run.id,
            status: 'leased',
            leaseExpiresAt: { lt: now },
          },
          data: {
            status: 'pending',
            availableAt: now,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastError: 'Auto-requeued expired leased task during run.',
          },
        });
        await prisma.inforSyncRun.updateMany({
          where: { id: run.id, status: 'running' },
          data: { updatedAt: now, lastChunkAt: now, message: 'Pending transform replay in progress.' },
        });

        const candidates = await prisma.inforSyncTask.findMany({
          where: {
            runId: run.id,
            status: 'pending',
            availableAt: { lte: now },
          },
          orderBy: { createdAt: 'asc' },
          take: maxDaysPerTick,
        });
        if (candidates.length === 0) {
          stoppedBy = 'drained';
          break;
        }

        ticksRun += 1;
        for (const task of candidates) {
          const lease = await prisma.inforSyncTask.updateMany({
            where: { id: task.id, status: 'pending' },
            data: {
              status: 'leased',
              leaseOwner: `pending-transform-${run.id.slice(0, 8)}`,
              leaseExpiresAt: new Date(Date.now() + LEASE_TIMEOUT_MS),
            },
          });
          if (Number(lease.count || 0) !== 1) continue;

          const payload = parseTaskPayload(task.payload);
          const attemptNo = Math.max(1, Number(task.attemptCount || 0) + 1);
          let finalized = false;
          try {
            if (!payload) {
              failedDays += 1;
              await prisma.$transaction([
                prisma.inforSyncTask.update({
                  where: { id: task.id },
                  data: {
                    status: 'failed',
                    attemptCount: attemptNo,
                    finishedAt: new Date(),
                    lastError: 'Invalid pending transform task payload.',
                    leaseOwner: null,
                    leaseExpiresAt: null,
                  },
                }),
                prisma.inforSyncTaskAttempt.create({
                  data: {
                    taskId: task.id,
                    runId: run.id,
                    companyId,
                    attemptNo,
                    status: 'failed',
                    errorMessage: 'Invalid pending transform task payload.',
                    finishedAt: new Date(),
                  },
                }),
              ]);
              finalized = true;
              continue;
            }

            let transformed: { success: boolean; recordsCreated: number; errors: string[] } = {
              success: false,
              recordsCreated: 0,
              errors: [],
            };
            try {
              const runResult = (await Promise.race([
                transformInforM3RawRun({
                  companyId,
                  syncRunId: payload.sourceSyncRunId,
                  frequency: payload.frequency,
                  businessDateIso: payload.businessDateIso,
                  maxBusinessDates: 1,
                  batchSize: getBatchSizeForAttempt(attemptNo),
                }),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error(`Transform task timed out after ${TASK_TIMEOUT_MS}ms`)), TASK_TIMEOUT_MS)
                ),
              ])) as { success: boolean; recordsCreated: number; errors: string[] };
              transformed = {
                success: Boolean(runResult?.success),
                recordsCreated: Math.max(0, Number(runResult?.recordsCreated || 0)),
                errors: Array.isArray(runResult?.errors) ? runResult.errors.map((v) => String(v)) : [],
              };
            } catch (taskError) {
              const message = taskError instanceof Error ? taskError.message : 'Unknown task error';
              transformed = {
                success: false,
                recordsCreated: 0,
                errors: [`task_exception:${message}`],
              };
            }

            if (transformed.success) {
              processedDays += 1;
              results.push({
                businessDateIso: payload.businessDateIso,
                syncRunId: payload.sourceSyncRunId,
                ok: true,
                status: 'success',
              });
              await prisma.$transaction([
                prisma.inforSyncTask.update({
                  where: { id: task.id },
                  data: {
                    status: 'done',
                    attemptCount: attemptNo,
                    finishedAt: new Date(),
                    leaseOwner: null,
                    leaseExpiresAt: null,
                    lastError: null,
                  },
                }),
                prisma.inforSyncTaskAttempt.create({
                  data: {
                    taskId: task.id,
                    runId: run.id,
                    companyId,
                    attemptNo,
                    status: 'success',
                    recordsCreated: transformed.recordsCreated,
                    warningCount: transformed.errors.length,
                    finishedAt: new Date(),
                  },
                }),
                prisma.inforSyncRun.update({
                  where: { id: run.id },
                  data: {
                    chunkCount: { increment: 1 },
                    recordsCreated: { increment: transformed.recordsCreated },
                    warningCount: { increment: transformed.errors.length },
                    retryCount: 0,
                    updatedAt: new Date(),
                    lastChunkAt: new Date(),
                    lastError: null,
                  },
                }),
              ]);
              finalized = true;
              continue;
            }

            const errorDetails = transformed.errors.join(' | ') || 'Transform day failed.';
            const reachedMax = attemptNo >= Math.max(1, Number(task.maxAttempts || maxAttempts));
            if (reachedMax) {
              failedDays += 1;
              results.push({
                businessDateIso: payload.businessDateIso,
                syncRunId: payload.sourceSyncRunId,
                ok: false,
                status: 'failed',
                details: errorDetails.slice(0, 500),
              });
              await prisma.$transaction([
                prisma.inforSyncTask.update({
                  where: { id: task.id },
                  data: {
                    status: 'failed',
                    attemptCount: attemptNo,
                    finishedAt: new Date(),
                    lastError: errorDetails.slice(0, 1200),
                    leaseOwner: null,
                    leaseExpiresAt: null,
                  },
                }),
                prisma.inforSyncTaskAttempt.create({
                  data: {
                    taskId: task.id,
                    runId: run.id,
                    companyId,
                    attemptNo,
                    status: 'failed',
                    errorMessage: errorDetails.slice(0, 1200),
                    finishedAt: new Date(),
                  },
                }),
                prisma.inforSyncRun.update({
                  where: { id: run.id },
                  data: {
                    retryCount: { increment: 1 },
                    updatedAt: new Date(),
                    lastChunkAt: new Date(),
                    lastError: errorDetails.slice(0, 1200),
                    message: `Retry exhausted for ${payload.businessDateIso}.`,
                  },
                }),
              ]);
            } else {
              retriedDays += 1;
              results.push({
                businessDateIso: payload.businessDateIso,
                syncRunId: payload.sourceSyncRunId,
                ok: false,
                status: 'retry',
                details: errorDetails.slice(0, 500),
              });
              await prisma.$transaction([
                prisma.inforSyncTask.update({
                  where: { id: task.id },
                  data: {
                    status: 'pending',
                    attemptCount: attemptNo,
                    availableAt: new Date(Date.now() + getBackoffMs(attemptNo)),
                    lastError: errorDetails.slice(0, 1200),
                    leaseOwner: null,
                    leaseExpiresAt: null,
                  },
                }),
                prisma.inforSyncTaskAttempt.create({
                  data: {
                    taskId: task.id,
                    runId: run.id,
                    companyId,
                    attemptNo,
                    status: 'retry',
                    errorMessage: errorDetails.slice(0, 1200),
                    finishedAt: new Date(),
                  },
                }),
                prisma.inforSyncRun.update({
                  where: { id: run.id },
                  data: {
                    retryCount: { increment: 1 },
                    updatedAt: new Date(),
                    lastChunkAt: new Date(),
                    lastError: errorDetails.slice(0, 1200),
                    message: `Retry queued for ${payload.businessDateIso} (attempt ${attemptNo}).`,
                  },
                }),
              ]);
            }
            finalized = true;
          } finally {
            if (!finalized) {
              await prisma.inforSyncTask.updateMany({
                where: { id: task.id, status: 'leased' },
                data: {
                  status: 'pending',
                  availableAt: new Date(Date.now() + 5_000),
                  leaseOwner: null,
                  leaseExpiresAt: null,
                  lastError: 'Auto-recovered leased task after unexpected task failure.',
                },
              });
            }
          }
        }

        if (!runUntilDrained) {
          stoppedBy = 'maxTicks';
          break;
        }
      }

      if (Date.now() - startedAt >= hardStopMs) {
        stoppedBy = 'hardStopMs';
      } else if (ticksRun >= maxTicks && runUntilDrained) {
        stoppedBy = 'maxTicks';
      }

      const grouped = await prisma.inforSyncTask.groupBy({
        by: ['status'],
        where: { runId: run.id },
        _count: { _all: true },
      });
      const taskCounts = grouped.reduce<Record<string, number>>((acc, row: { status: string; _count: { _all: number } }) => {
        acc[row.status] = Number(row._count._all || 0);
        return acc;
      }, {});
      const pendingTaskCount = Number(taskCounts.pending || 0) + Number(taskCounts.leased || 0);
      const failedTaskCount = Number(taskCounts.failed || 0);
      const pendingRemaining = await getPendingRemaining(prisma, companyId);
      const runDone = pendingTaskCount === 0 && failedTaskCount === 0;
      await prisma.inforSyncRun.update({
        where: { id: run.id },
        data: {
          status: runDone ? 'done' : 'running',
          finishedAt: runDone ? new Date() : null,
          updatedAt: new Date(),
          lastChunkAt: new Date(),
          message: runDone
            ? 'Pending transform replay completed.'
            : failedTaskCount > 0
              ? 'Pending transform replay paused with failed tasks.'
              : 'Pending transform replay in progress.',
        },
      });

    return NextResponse.json({
      ok: true,
      companyId,
      runId: run.id,
      runMode: RUN_MODE,
      ticksRun,
      maxTicks,
      runUntilDrained,
      maxDaysPerTick,
      maxAttempts,
      processedDays,
      failedDays,
      retriedDays,
      taskCounts,
      pendingRemaining,
      done: runDone && pendingRemaining === 0,
      stoppedBy,
      elapsedMs: Date.now() - startedAt,
      sample: results.slice(0, 50),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : message.includes('Forbidden') ? 403 : 500;
    return NextResponse.json(
      {
        ok: false,
        error: 'Failed to process pending Infor raw transforms.',
        details: message,
      },
      { status }
    );
  }
}

