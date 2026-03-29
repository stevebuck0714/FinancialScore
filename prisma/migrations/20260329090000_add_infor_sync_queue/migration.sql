-- CreateTable
CREATE TABLE "InforSyncRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'INFOR_M3',
    "status" TEXT NOT NULL DEFAULT 'running',
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "site" TEXT,
    "mode" TEXT,
    "backfillMonths" INTEGER,
    "lookbackDays" INTEGER,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "salesOnly" BOOLEAN NOT NULL DEFAULT false,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "lastChunkAt" TIMESTAMP(3),

    CONSTRAINT "InforSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InforSyncTask" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 6,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "lastError" TEXT,
    "lastResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "InforSyncTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InforSyncTaskAttempt" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "errorMessage" TEXT,
    "responseSnippet" TEXT,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "InforSyncTaskAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InforSyncRun_companyId_status_createdAt_idx" ON "InforSyncRun"("companyId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "InforSyncRun_companyId_createdAt_idx" ON "InforSyncRun"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "InforSyncRun_status_createdAt_idx" ON "InforSyncRun"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "InforSyncTask_runId_status_availableAt_idx" ON "InforSyncTask"("runId", "status", "availableAt");

-- CreateIndex
CREATE INDEX "InforSyncTask_status_availableAt_leaseExpiresAt_idx" ON "InforSyncTask"("status", "availableAt", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "InforSyncTask_companyId_status_createdAt_idx" ON "InforSyncTask"("companyId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "InforSyncTaskAttempt_taskId_attemptNo_idx" ON "InforSyncTaskAttempt"("taskId", "attemptNo");

-- CreateIndex
CREATE INDEX "InforSyncTaskAttempt_runId_startedAt_idx" ON "InforSyncTaskAttempt"("runId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "InforSyncTaskAttempt_companyId_startedAt_idx" ON "InforSyncTaskAttempt"("companyId", "startedAt" DESC);

-- AddForeignKey
ALTER TABLE "InforSyncTask" ADD CONSTRAINT "InforSyncTask_runId_fkey" FOREIGN KEY ("runId") REFERENCES "InforSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InforSyncTaskAttempt" ADD CONSTRAINT "InforSyncTaskAttempt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "InforSyncTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
