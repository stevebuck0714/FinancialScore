CREATE TABLE "InforItemOverviewCache" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'INFOR_M3',
  "itemNumber" TEXT NOT NULL,
  "description" TEXT,
  "overview" TEXT,
  "partNotes" TEXT,
  "recordDate" TIMESTAMP(3),
  "changeDate" TIMESTAMP(3),
  "rawPayload" JSONB,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InforItemOverviewCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InforItemOverviewCache_companyId_platform_itemNumber_key"
  ON "InforItemOverviewCache"("companyId", "platform", "itemNumber");

CREATE INDEX "InforItemOverviewCache_companyId_platform_expiresAt_idx"
  ON "InforItemOverviewCache"("companyId", "platform", "expiresAt");

CREATE INDEX "InforItemOverviewCache_companyId_platform_fetchedAt_idx"
  ON "InforItemOverviewCache"("companyId", "platform", "fetchedAt" DESC);
