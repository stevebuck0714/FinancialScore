-- NOTE:
-- This migration adds the daily financial lane and month-end publish audit tables.
-- It is intentionally idempotent with IF NOT EXISTS guards.

-- CreateTable
CREATE TABLE IF NOT EXISTS "DailyFinancialSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expense" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cogsPayroll" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cogsOwnerPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cogsContractors" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cogsMaterials" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cogsCommissions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cogsOther" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cogsTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payroll" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ownerBasePay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "benefits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "insurance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "professionalFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subcontractors" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxLicense" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stateIncomeTaxes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "federalIncomeTaxes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "phoneComm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "infrastructure" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "autoTravel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salesExpense" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "marketing" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trainingCert" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mealsEntertainment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestExpense" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depreciationAmortization" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherExpense" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nonOperatingIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extraordinaryItems" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ar" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "inventory" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherCA" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tca" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fixedAssets" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherAssets" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAssets" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ap" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherCL" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tcl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ltd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLiab" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ownersCapital" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ownersDraw" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commonStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "preferredStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retainedEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "additionalPaidInCapital" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "treasuryStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalEquity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalLAndE" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourcePlatform" TEXT DEFAULT 'SCHEDULED_INTEGRATION',
    "sourceRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyFinancialSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DailyFinancialImportRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "runType" TEXT NOT NULL DEFAULT 'daily',
    "status" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "recordsIngested" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DailyFinancialImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FinancialMonthPublish" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "monthStart" TIMESTAMP(3) NOT NULL,
    "monthEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "sourceSnapshotDays" INTEGER NOT NULL DEFAULT 0,
    "sourceRunIds" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialMonthPublish_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailyFinancialSnapshot_companyId_snapshotDate_idx" ON "DailyFinancialSnapshot"("companyId", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailyFinancialSnapshot_companyId_frequency_snapshotDate_idx" ON "DailyFinancialSnapshot"("companyId", "frequency", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailyFinancialSnapshot_companyId_sourceRunId_idx" ON "DailyFinancialSnapshot"("companyId", "sourceRunId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DailyFinancialSnapshot_companyId_snapshotDate_frequency_key" ON "DailyFinancialSnapshot"("companyId", "snapshotDate", "frequency");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailyFinancialImportRun_companyId_snapshotDate_idx" ON "DailyFinancialImportRun"("companyId", "snapshotDate" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DailyFinancialImportRun_companyId_status_startedAt_idx" ON "DailyFinancialImportRun"("companyId", "status", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialMonthPublish_companyId_monthStart_key" ON "FinancialMonthPublish"("companyId", "monthStart");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FinancialMonthPublish_companyId_monthStart_idx" ON "FinancialMonthPublish"("companyId", "monthStart" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FinancialMonthPublish_companyId_status_monthStart_idx" ON "FinancialMonthPublish"("companyId", "status", "monthStart" DESC);
