-- CreateTable
CREATE TABLE "InforRawBatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'INFOR_M3',
    "syncRunId" TEXT,
    "frequency" TEXT,
    "mode" TEXT,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "businessDate" TIMESTAMP(3),
    "module" TEXT,
    "miProgram" TEXT,
    "transaction" TEXT,
    "endpointPath" TEXT,
    "pageNo" INTEGER NOT NULL DEFAULT 1,
    "bookmarkIn" TEXT,
    "bookmarkOut" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "httpStatus" INTEGER,
    "durationMs" INTEGER,
    "payloadHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "errorMessage" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InforRawBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InforRawRecord" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'INFOR_M3',
    "syncRunId" TEXT,
    "businessDate" TIMESTAMP(3),
    "module" TEXT,
    "miProgram" TEXT,
    "transaction" TEXT,
    "sourceRecordId" TEXT,
    "sourceRecordHash" TEXT,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InforRawRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InforRawCompleteness" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'INFOR_M3',
    "syncRunId" TEXT,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "lastBatchId" TEXT,
    "statusMessage" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InforRawCompleteness_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InforRawBatch_companyId_platform_syncRunId_module_miProgram_tra_key"
ON "InforRawBatch"("companyId", "platform", "syncRunId", "module", "miProgram", "transaction", "businessDate", "pageNo", "bookmarkIn");

-- CreateIndex
CREATE INDEX "InforRawBatch_companyId_platform_fetchedAt_idx"
ON "InforRawBatch"("companyId", "platform", "fetchedAt" DESC);

-- CreateIndex
CREATE INDEX "InforRawBatch_companyId_syncRunId_fetchedAt_idx"
ON "InforRawBatch"("companyId", "syncRunId", "fetchedAt" DESC);

-- CreateIndex
CREATE INDEX "InforRawBatch_companyId_businessDate_module_miProgram_idx"
ON "InforRawBatch"("companyId", "businessDate", "module", "miProgram");

-- CreateIndex
CREATE INDEX "InforRawBatch_status_fetchedAt_idx"
ON "InforRawBatch"("status", "fetchedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "InforRawRecord_companyId_platform_syncRunId_businessDate_miProg_key"
ON "InforRawRecord"("companyId", "platform", "syncRunId", "businessDate", "miProgram", "transaction", "sourceRecordHash");

-- CreateIndex
CREATE INDEX "InforRawRecord_batchId_createdAt_idx"
ON "InforRawRecord"("batchId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "InforRawRecord_companyId_syncRunId_createdAt_idx"
ON "InforRawRecord"("companyId", "syncRunId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "InforRawRecord_companyId_businessDate_module_miProgram_createdAt_idx"
ON "InforRawRecord"("companyId", "businessDate", "module", "miProgram", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "InforRawCompleteness_companyId_platform_syncRunId_businessDate_key"
ON "InforRawCompleteness"("companyId", "platform", "syncRunId", "businessDate", "sourceKey");

-- CreateIndex
CREATE INDEX "InforRawCompleteness_companyId_businessDate_sourceKey_idx"
ON "InforRawCompleteness"("companyId", "businessDate", "sourceKey");

-- CreateIndex
CREATE INDEX "InforRawCompleteness_companyId_syncRunId_businessDate_idx"
ON "InforRawCompleteness"("companyId", "syncRunId", "businessDate");

-- CreateIndex
CREATE INDEX "InforRawCompleteness_isComplete_updatedAt_idx"
ON "InforRawCompleteness"("isComplete", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "InforRawBatch"
ADD CONSTRAINT "InforRawBatch_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InforRawRecord"
ADD CONSTRAINT "InforRawRecord_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "InforRawBatch"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InforRawRecord"
ADD CONSTRAINT "InforRawRecord_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InforRawCompleteness"
ADD CONSTRAINT "InforRawCompleteness_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
