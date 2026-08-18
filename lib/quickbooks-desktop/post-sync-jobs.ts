import prisma from '@/lib/prisma';
import { hashCacheParts } from '@/lib/derived-api-cache';
import { runQuickBooksDesktopPostSyncReprocess } from '@/lib/quickbooks-desktop/post-sync-reprocess';

export type QuickBooksDesktopPostSyncJob = {
  id: string;
  companyId: string;
  startDate: string;
  endDate: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  source: string | null;
  attemptCount: number;
  maxAttempts: number;
  errorMessage: string | null;
};

export type QuickBooksDesktopPostSyncJobProcessResult = {
  processed: number;
  completed: number;
  failed: number;
  skipped: number;
  jobs: Array<{
    id: string;
    companyId: string;
    startDate: string;
    endDate: string;
    status: QuickBooksDesktopPostSyncJob['status'] | 'skipped';
    error?: string;
  }>;
};

let ensurePromise: Promise<void> | null = null;

function parseDate(value: unknown): string {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? '' : text;
}

function jobId(companyId: string, startDate: string, endDate: string): string {
  return hashCacheParts(['qbd-post-sync-reprocess', companyId, startDate, endDate]);
}

function mapJob(row: any): QuickBooksDesktopPostSyncJob {
  return {
    id: String(row.id || ''),
    companyId: String(row.companyId || ''),
    startDate: String(row.startDate || ''),
    endDate: String(row.endDate || ''),
    status: String(row.status || 'queued') as QuickBooksDesktopPostSyncJob['status'],
    source: row.source == null ? null : String(row.source),
    attemptCount: Number(row.attemptCount || 0),
    maxAttempts: Number(row.maxAttempts || 5),
    errorMessage: row.errorMessage == null ? null : String(row.errorMessage),
  };
}

async function ensureQuickBooksDesktopPostSyncJobTable(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "QuickBooksDesktopPostSyncJob" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "startDate" TEXT NOT NULL,
          "endDate" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'queued',
          "source" TEXT,
          "attemptCount" INTEGER NOT NULL DEFAULT 0,
          "maxAttempts" INTEGER NOT NULL DEFAULT 5,
          "availableAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "leaseExpiresAt" TIMESTAMP,
          "startedAt" TIMESTAMP,
          "finishedAt" TIMESTAMP,
          "errorMessage" TEXT,
          "result" JSONB,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "QuickBooksDesktopPostSyncJob_company_range_unique" UNIQUE ("companyId", "startDate", "endDate")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "QuickBooksDesktopPostSyncJob_status_available_idx"
        ON "QuickBooksDesktopPostSyncJob"("status", "availableAt", "leaseExpiresAt")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "QuickBooksDesktopPostSyncJob_company_status_idx"
        ON "QuickBooksDesktopPostSyncJob"("companyId", "status", "updatedAt")
      `);
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  await ensurePromise;
}

export async function enqueueQuickBooksDesktopPostSyncJob(params: {
  companyId: string;
  startDate: string;
  endDate: string;
  source?: string;
}): Promise<QuickBooksDesktopPostSyncJob> {
  await ensureQuickBooksDesktopPostSyncJobTable();
  const companyId = String(params.companyId || '').trim();
  const startDate = parseDate(params.startDate);
  const endDate = parseDate(params.endDate);
  if (!companyId) throw new Error('companyId is required');
  if (!startDate || !endDate) throw new Error('startDate and endDate are required');
  if (startDate > endDate) throw new Error('startDate must be before or equal to endDate');

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO "QuickBooksDesktopPostSyncJob" (
       "id", "companyId", "startDate", "endDate", "status", "source", "availableAt", "updatedAt", "errorMessage"
     )
     VALUES ($1, $2, $3, $4, 'queued', $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
     ON CONFLICT ("companyId", "startDate", "endDate")
     DO UPDATE SET
       "status" = CASE
         WHEN "QuickBooksDesktopPostSyncJob"."status" = 'running' THEN "QuickBooksDesktopPostSyncJob"."status"
         ELSE 'queued'
       END,
       "source" = EXCLUDED."source",
       "availableAt" = CASE
         WHEN "QuickBooksDesktopPostSyncJob"."status" = 'running' THEN "QuickBooksDesktopPostSyncJob"."availableAt"
         ELSE CURRENT_TIMESTAMP
       END,
       "updatedAt" = CURRENT_TIMESTAMP,
       "errorMessage" = CASE
         WHEN "QuickBooksDesktopPostSyncJob"."status" = 'running' THEN "QuickBooksDesktopPostSyncJob"."errorMessage"
         ELSE NULL
       END
     RETURNING *`,
    jobId(companyId, startDate, endDate),
    companyId,
    startDate,
    endDate,
    params.source || null,
  );
  return mapJob(rows[0]);
}

async function claimNextQuickBooksDesktopPostSyncJob(companyId?: string): Promise<QuickBooksDesktopPostSyncJob | null> {
  await ensureQuickBooksDesktopPostSyncJobTable();
  const normalizedCompanyId = String(companyId || '').trim();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `WITH next_job AS (
       SELECT "id"
       FROM "QuickBooksDesktopPostSyncJob"
       WHERE ($1::text = '' OR "companyId" = $1)
         AND (
           "status" = 'queued'
           OR ("status" = 'running' AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" < CURRENT_TIMESTAMP)
           OR ("status" = 'failed' AND "attemptCount" < "maxAttempts" AND "availableAt" <= CURRENT_TIMESTAMP)
         )
       ORDER BY "availableAt" ASC, "createdAt" ASC
       LIMIT 1
     )
     UPDATE "QuickBooksDesktopPostSyncJob" job
     SET "status" = 'running',
         "attemptCount" = job."attemptCount" + 1,
         "startedAt" = CURRENT_TIMESTAMP,
         "leaseExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '15 minutes',
         "updatedAt" = CURRENT_TIMESTAMP,
         "errorMessage" = NULL
     FROM next_job
     WHERE job."id" = next_job."id"
     RETURNING job.*`,
    normalizedCompanyId,
  );
  return rows[0] ? mapJob(rows[0]) : null;
}

async function completeQuickBooksDesktopPostSyncJob(job: QuickBooksDesktopPostSyncJob, result: unknown): Promise<void> {
  await ensureQuickBooksDesktopPostSyncJobTable();
  await prisma.$executeRawUnsafe(
    `UPDATE "QuickBooksDesktopPostSyncJob"
     SET "status" = 'done',
         "finishedAt" = CURRENT_TIMESTAMP,
         "leaseExpiresAt" = NULL,
         "updatedAt" = CURRENT_TIMESTAMP,
         "errorMessage" = NULL,
         "result" = $2::jsonb
     WHERE "id" = $1`,
    job.id,
    JSON.stringify(result || {}),
  );
}

async function failQuickBooksDesktopPostSyncJob(job: QuickBooksDesktopPostSyncJob, error: unknown): Promise<void> {
  await ensureQuickBooksDesktopPostSyncJobTable();
  const message = error instanceof Error ? error.message : String(error);
  await prisma.$executeRawUnsafe(
    `UPDATE "QuickBooksDesktopPostSyncJob"
     SET "status" = 'failed',
         "finishedAt" = CURRENT_TIMESTAMP,
         "leaseExpiresAt" = NULL,
         "availableAt" = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
         "updatedAt" = CURRENT_TIMESTAMP,
         "errorMessage" = $2
     WHERE "id" = $1`,
    job.id,
    message.slice(0, 1000),
  );
}

async function processJob(job: QuickBooksDesktopPostSyncJob) {
  const result = await runQuickBooksDesktopPostSyncReprocess({
    companyId: job.companyId,
    startDate: job.startDate,
    endDate: job.endDate,
    source: job.source || 'qbd-post-sync-job',
  });
  const failures = [
    !result.dailyFinancials.ok ? `daily financial rebuild: ${result.dailyFinancials.error || 'failed'}` : '',
    result.arApAging && !result.arApAging.ok ? `AR/AP rebuild: ${result.arApAging.error || 'failed'}` : '',
  ].filter(Boolean);
  if (failures.length > 0) {
    throw new Error(failures.join('; '));
  }
  await completeQuickBooksDesktopPostSyncJob(job, result);
  return result;
}

export async function processQuickBooksDesktopPostSyncJobs(
  limit = 3,
  companyId?: string,
): Promise<QuickBooksDesktopPostSyncJobProcessResult> {
  const maxJobs = Math.max(1, Math.min(10, Math.floor(Number(limit) || 3)));
  const result: QuickBooksDesktopPostSyncJobProcessResult = {
    processed: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    jobs: [],
  };

  for (let index = 0; index < maxJobs; index += 1) {
    const job = await claimNextQuickBooksDesktopPostSyncJob(companyId);
    if (!job) {
      result.skipped += 1;
      break;
    }

    result.processed += 1;
    try {
      await processJob(job);
      result.completed += 1;
      result.jobs.push({
        id: job.id,
        companyId: job.companyId,
        startDate: job.startDate,
        endDate: job.endDate,
        status: 'done',
      });
    } catch (error) {
      await failQuickBooksDesktopPostSyncJob(job, error);
      result.failed += 1;
      result.jobs.push({
        id: job.id,
        companyId: job.companyId,
        startDate: job.startDate,
        endDate: job.endDate,
        status: 'failed',
        error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      });
    }
  }

  return result;
}
