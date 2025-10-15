/*
  Warnings:

  - You are about to drop the column `location` on the `Company` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "title" TEXT;

-- CreateTable
CREATE TABLE "IndustryBenchmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "industryId" TEXT NOT NULL,
    "industryName" TEXT NOT NULL,
    "assetSizeCategory" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "fiveYearValue" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AccountingConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INACTIVE',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" DATETIME,
    "realmId" TEXT,
    "tenantId" TEXT,
    "organizationId" TEXT,
    "lastSyncAt" DATETIME,
    "autoSync" BOOLEAN NOT NULL DEFAULT false,
    "syncFrequency" TEXT NOT NULL DEFAULT 'manual',
    "platformVersion" TEXT,
    "connectionMetadata" JSONB,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountingConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiSyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recordsImported" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorDetails" JSONB,
    "duration" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "addressStreet" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressZip" TEXT,
    "addressCountry" TEXT,
    "industrySector" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Company_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Company" ("consultantId", "createdAt", "id", "industrySector", "name", "updatedAt") SELECT "consultantId", "createdAt", "id", "industrySector", "name", "updatedAt" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE INDEX "Company_consultantId_idx" ON "Company"("consultantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "IndustryBenchmark_industryId_idx" ON "IndustryBenchmark"("industryId");

-- CreateIndex
CREATE INDEX "IndustryBenchmark_assetSizeCategory_idx" ON "IndustryBenchmark"("assetSizeCategory");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryBenchmark_industryId_assetSizeCategory_metricName_key" ON "IndustryBenchmark"("industryId", "assetSizeCategory", "metricName");

-- CreateIndex
CREATE INDEX "AccountingConnection_companyId_idx" ON "AccountingConnection"("companyId");

-- CreateIndex
CREATE INDEX "AccountingConnection_status_idx" ON "AccountingConnection"("status");

-- CreateIndex
CREATE INDEX "AccountingConnection_lastSyncAt_idx" ON "AccountingConnection"("lastSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingConnection_companyId_platform_key" ON "AccountingConnection"("companyId", "platform");

-- CreateIndex
CREATE INDEX "ApiSyncLog_companyId_idx" ON "ApiSyncLog"("companyId");

-- CreateIndex
CREATE INDEX "ApiSyncLog_platform_idx" ON "ApiSyncLog"("platform");

-- CreateIndex
CREATE INDEX "ApiSyncLog_createdAt_idx" ON "ApiSyncLog"("createdAt");
