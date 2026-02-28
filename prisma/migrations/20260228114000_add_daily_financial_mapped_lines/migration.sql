-- NOTE:
-- Adds daily mapped account-line detail storage for daily trial-balance processing.

CREATE TABLE IF NOT EXISTS "DailyFinancialMappedLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "sourceAccountName" TEXT NOT NULL,
    "sourceAccountId" TEXT,
    "sourceAccountType" TEXT,
    "targetField" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourcePlatform" TEXT DEFAULT 'SCHEDULED_INTEGRATION',
    "sourceRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyFinancialMappedLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DailyFinancialMappedLine_companyId_snapshotDate_idx" ON "DailyFinancialMappedLine"("companyId", "snapshotDate" DESC);
CREATE INDEX IF NOT EXISTS "DailyFinancialMappedLine_companyId_frequency_snapshotDate_idx" ON "DailyFinancialMappedLine"("companyId", "frequency", "snapshotDate" DESC);
CREATE INDEX IF NOT EXISTS "DailyFinancialMappedLine_companyId_targetField_snapshotDate_idx" ON "DailyFinancialMappedLine"("companyId", "targetField", "snapshotDate" DESC);
CREATE INDEX IF NOT EXISTS "DailyFinancialMappedLine_companyId_sourceRunId_idx" ON "DailyFinancialMappedLine"("companyId", "sourceRunId");
CREATE INDEX IF NOT EXISTS "DailyFinancialMappedLine_companyId_sourceAccountName_idx" ON "DailyFinancialMappedLine"("companyId", "sourceAccountName");
CREATE UNIQUE INDEX IF NOT EXISTS "DailyFinancialMappedLine_companyId_snapshotDate_frequency_sourceAcc_key" ON "DailyFinancialMappedLine"("companyId", "snapshotDate", "frequency", "sourceAccountName", "targetField");
