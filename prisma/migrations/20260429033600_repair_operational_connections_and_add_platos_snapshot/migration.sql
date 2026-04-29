DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OperationalSystemProvider') THEN
    CREATE TYPE "OperationalSystemProvider" AS ENUM ('BAMBOOHR');
  END IF;
END $$;

ALTER TYPE "OperationalSystemProvider" ADD VALUE IF NOT EXISTS 'SPREADSHEET_UPLOAD';

CREATE TABLE IF NOT EXISTS "OperationalSystemConnection" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "provider" "OperationalSystemProvider" NOT NULL,
  "sourceCode" TEXT NOT NULL DEFAULT 'BAMBOOHR_STANDARD',
  "status" "ConnectionStatus" NOT NULL DEFAULT 'INACTIVE',
  "authType" TEXT,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "baseUrl" TEXT,
  "lastSyncAt" TIMESTAMP(3),
  "autoSync" BOOLEAN NOT NULL DEFAULT false,
  "syncFrequency" TEXT NOT NULL DEFAULT 'manual',
  "connectionMetadata" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OperationalSystemConnection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OperationalSystemConnection"
  ADD COLUMN IF NOT EXISTS "sourceCode" TEXT NOT NULL DEFAULT 'BAMBOOHR_STANDARD';

CREATE INDEX IF NOT EXISTS "OperationalSystemConnection_companyId_idx"
  ON "OperationalSystemConnection"("companyId");

CREATE INDEX IF NOT EXISTS "OperationalSystemConnection_status_idx"
  ON "OperationalSystemConnection"("status");

CREATE INDEX IF NOT EXISTS "OperationalSystemConnection_lastSyncAt_idx"
  ON "OperationalSystemConnection"("lastSyncAt");

DROP INDEX IF EXISTS "OperationalSystemConnection_companyId_provider_key";

CREATE UNIQUE INDEX IF NOT EXISTS "OperationalSystemConnection_companyId_provider_sourceCode_key"
  ON "OperationalSystemConnection"("companyId", "provider", "sourceCode");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'OperationalSystemConnection_companyId_fkey'
      AND table_name = 'OperationalSystemConnection'
  ) THEN
    ALTER TABLE "OperationalSystemConnection"
      ADD CONSTRAINT "OperationalSystemConnection_companyId_fkey"
      FOREIGN KEY ("companyId")
      REFERENCES "Company"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PlatosClosetWorkbookSnapshot" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "sourceCode" TEXT NOT NULL DEFAULT 'PLATOS_CLOSET_STORE_VISIT',
  "frequency" TEXT NOT NULL DEFAULT 'monthly',
  "documentId" TEXT,
  "originalFileName" TEXT,
  "blobUrl" TEXT,
  "workbookPeriod" TEXT,
  "storeNumber" TEXT,
  "cityState" TEXT,
  "visitDateText" TEXT,
  "openDateText" TEXT,
  "salesTrend" DOUBLE PRECISION,
  "buysTrend" DOUBLE PRECISION,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "departmentCount" INTEGER NOT NULL DEFAULT 0,
  "categoryCount" INTEGER NOT NULL DEFAULT 0,
  "parsedWorkbook" JSONB NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatosClosetWorkbookSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlatosClosetWorkbookSnapshot_companyId_uploadedAt_idx"
  ON "PlatosClosetWorkbookSnapshot"("companyId", "uploadedAt" DESC);

CREATE INDEX IF NOT EXISTS "PlatosClosetWorkbookSnapshot_companyId_sourceCode_uploadedAt_idx"
  ON "PlatosClosetWorkbookSnapshot"("companyId", "sourceCode", "uploadedAt" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'PlatosClosetWorkbookSnapshot_companyId_fkey'
      AND table_name = 'PlatosClosetWorkbookSnapshot'
  ) THEN
    ALTER TABLE "PlatosClosetWorkbookSnapshot"
      ADD CONSTRAINT "PlatosClosetWorkbookSnapshot_companyId_fkey"
      FOREIGN KEY ("companyId")
      REFERENCES "Company"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
