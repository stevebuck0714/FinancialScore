-- CreateEnum
CREATE TYPE "OperationalSystemProvider" AS ENUM ('BAMBOOHR');

-- CreateTable
CREATE TABLE "OperationalSystemConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "OperationalSystemProvider" NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalSystemConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperationalSystemConnection_companyId_provider_key" ON "OperationalSystemConnection"("companyId", "provider");

-- CreateIndex
CREATE INDEX "OperationalSystemConnection_companyId_idx" ON "OperationalSystemConnection"("companyId");

-- CreateIndex
CREATE INDEX "OperationalSystemConnection_status_idx" ON "OperationalSystemConnection"("status");

-- CreateIndex
CREATE INDEX "OperationalSystemConnection_lastSyncAt_idx" ON "OperationalSystemConnection"("lastSyncAt");

-- AddForeignKey
ALTER TABLE "OperationalSystemConnection" ADD CONSTRAINT "OperationalSystemConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
