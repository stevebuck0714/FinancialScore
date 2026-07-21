import prisma from '@/lib/prisma';
import { hashCacheParts } from '@/lib/derived-api-cache';
import { industryBriefDateKey } from '@/lib/industry-brief/cache';

export type IndustryBriefJob = {
  id: string;
  companyId: string;
  briefDate: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  source: string | null;
  attemptCount: number;
  maxAttempts: number;
  errorMessage: string | null;
};

let ensurePromise: Promise<void> | null = null;

async function ensureIndustryBriefJobTable(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "IndustryBriefGenerationJob" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "companyId" TEXT NOT NULL,
          "briefDate" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'queued',
          "source" TEXT,
          "attemptCount" INTEGER NOT NULL DEFAULT 0,
          "maxAttempts" INTEGER NOT NULL DEFAULT 3,
          "availableAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "leaseExpiresAt" TIMESTAMP,
          "startedAt" TIMESTAMP,
          "finishedAt" TIMESTAMP,
          "errorMessage" TEXT,
          "result" JSONB,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "IndustryBriefGenerationJob_company_date_unique" UNIQUE ("companyId", "briefDate")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "IndustryBriefGenerationJob_status_available_idx"
        ON "IndustryBriefGenerationJob"("status", "availableAt", "leaseExpiresAt")
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "IndustryBriefGenerationJob_company_status_idx"
        ON "IndustryBriefGenerationJob"("companyId", "status", "updatedAt")
      `);
    })().catch((error) => {
      ensurePromise = null;
      throw error;
    });
  }
  await ensurePromise;
}

function jobId(companyId: string, briefDate: string): string {
  return hashCacheParts(['industry-brief-job', companyId, briefDate]);
}

function mapJob(row: any): IndustryBriefJob {
  return {
    id: String(row.id || ''),
    companyId: String(row.companyId || ''),
    briefDate: String(row.briefDate || ''),
    status: String(row.status || 'queued') as IndustryBriefJob['status'],
    source: row.source == null ? null : String(row.source),
    attemptCount: Number(row.attemptCount || 0),
    maxAttempts: Number(row.maxAttempts || 3),
    errorMessage: row.errorMessage == null ? null : String(row.errorMessage),
  };
}

export async function enqueueIndustryBriefJob(params: {
  companyId: string;
  source?: string;
  briefDate?: string;
}): Promise<IndustryBriefJob> {
  await ensureIndustryBriefJobTable();
  const companyId = String(params.companyId || '').trim();
  if (!companyId) throw new Error('companyId is required');
  const briefDate = params.briefDate || industryBriefDateKey();
  const id = jobId(companyId, briefDate);
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO "IndustryBriefGenerationJob" (
       "id", "companyId", "briefDate", "status", "source", "availableAt", "updatedAt", "errorMessage"
     )
     VALUES ($1, $2, $3, 'queued', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
     ON CONFLICT ("companyId", "briefDate")
     DO UPDATE SET
       "status" = CASE
         WHEN "IndustryBriefGenerationJob"."status" = 'running' THEN "IndustryBriefGenerationJob"."status"
         ELSE 'queued'
       END,
       "source" = EXCLUDED."source",
       "availableAt" = CASE
         WHEN "IndustryBriefGenerationJob"."status" = 'running' THEN "IndustryBriefGenerationJob"."availableAt"
         ELSE CURRENT_TIMESTAMP
       END,
       "updatedAt" = CURRENT_TIMESTAMP,
       "errorMessage" = CASE
         WHEN "IndustryBriefGenerationJob"."status" = 'running' THEN "IndustryBriefGenerationJob"."errorMessage"
         ELSE NULL
       END
     RETURNING *`,
    id,
    companyId,
    briefDate,
    params.source || null,
  );
  return mapJob(rows[0]);
}

export async function claimNextIndustryBriefJob(): Promise<IndustryBriefJob | null> {
  await ensureIndustryBriefJobTable();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `WITH next_job AS (
       SELECT "id"
       FROM "IndustryBriefGenerationJob"
       WHERE (
         "status" = 'queued'
         OR ("status" = 'running' AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" < CURRENT_TIMESTAMP)
         OR ("status" = 'failed' AND "attemptCount" < "maxAttempts" AND "availableAt" <= CURRENT_TIMESTAMP)
       )
       ORDER BY "availableAt" ASC, "createdAt" ASC
       LIMIT 1
     )
     UPDATE "IndustryBriefGenerationJob" job
     SET "status" = 'running',
         "attemptCount" = job."attemptCount" + 1,
         "startedAt" = CURRENT_TIMESTAMP,
         "leaseExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '5 minutes',
         "updatedAt" = CURRENT_TIMESTAMP,
         "errorMessage" = NULL
     FROM next_job
     WHERE job."id" = next_job."id"
     RETURNING job.*`
  );
  return rows[0] ? mapJob(rows[0]) : null;
}

export async function completeIndustryBriefJob(job: IndustryBriefJob, result: unknown): Promise<void> {
  await ensureIndustryBriefJobTable();
  await prisma.$executeRawUnsafe(
    `UPDATE "IndustryBriefGenerationJob"
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

export async function failIndustryBriefJob(job: IndustryBriefJob, error: unknown): Promise<void> {
  await ensureIndustryBriefJobTable();
  const message = error instanceof Error ? error.message : String(error);
  await prisma.$executeRawUnsafe(
    `UPDATE "IndustryBriefGenerationJob"
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

export async function getIndustryBriefJob(companyId: string, briefDate = industryBriefDateKey()): Promise<IndustryBriefJob | null> {
  await ensureIndustryBriefJobTable();
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT *
     FROM "IndustryBriefGenerationJob"
     WHERE "companyId" = $1 AND "briefDate" = $2
     LIMIT 1`,
    companyId,
    briefDate,
  );
  return rows[0] ? mapJob(rows[0]) : null;
}
