-- CreateTable
CREATE TABLE "OperationalSourceState" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "mockEnabled" BOOLEAN NOT NULL DEFAULT false,
    "liveSince" TIMESTAMP(3),
    "lastMockRunAt" TIMESTAMP(3),
    "lastLiveRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastRunMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalSourceState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalDataset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "datasetKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "grain" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "dataMode" TEXT NOT NULL DEFAULT 'MOCK',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "minDate" DATE,
    "maxDate" DATE,
    "lastSyncedAt" TIMESTAMP(3),
    "lastRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "recordDate" DATE NOT NULL,
    "externalId" TEXT NOT NULL,
    "dimensions" JSONB NOT NULL DEFAULT '{}',
    "measures" JSONB NOT NULL DEFAULT '{}',
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "dataMode" TEXT NOT NULL,
    "sourceRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperationalSourceState_companyId_sourceCode_key" ON "OperationalSourceState"("companyId", "sourceCode");

-- CreateIndex
CREATE INDEX "OperationalSourceState_mockEnabled_idx" ON "OperationalSourceState"("mockEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalDataset_companyId_datasetKey_key" ON "OperationalDataset"("companyId", "datasetKey");

-- CreateIndex
CREATE INDEX "OperationalDataset_companyId_sourceCode_idx" ON "OperationalDataset"("companyId", "sourceCode");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalRecord_datasetId_externalId_key" ON "OperationalRecord"("datasetId", "externalId");

-- CreateIndex
CREATE INDEX "OperationalRecord_companyId_datasetId_recordDate_idx" ON "OperationalRecord"("companyId", "datasetId", "recordDate");

-- CreateIndex
CREATE INDEX "OperationalRecord_datasetId_dataMode_idx" ON "OperationalRecord"("datasetId", "dataMode");

-- AddForeignKey
ALTER TABLE "OperationalSourceState" ADD CONSTRAINT "OperationalSourceState_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalDataset" ADD CONSTRAINT "OperationalDataset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRecord" ADD CONSTRAINT "OperationalRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalRecord" ADD CONSTRAINT "OperationalRecord_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "OperationalDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
