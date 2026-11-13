CREATE TABLE "CashProofEngagement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodStartMonth" TEXT NOT NULL,
    "periodEndMonth" TEXT NOT NULL,
    "fiscalYearEndMonth" INTEGER NOT NULL DEFAULT 12,
    "sampleSeed" TEXT,
    "sampledAt" TIMESTAMP(3),
    "balanceTolerance" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "lockedByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashProofEngagement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashProofEngagement_companyId_createdAt_idx" ON "CashProofEngagement"("companyId", "createdAt");

ALTER TABLE "CashProofEngagement"
ADD CONSTRAINT "CashProofEngagement_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CashProofBankAccount" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "accountMappingId" TEXT,
    "sourceAccountId" TEXT,
    "accountName" TEXT NOT NULL,
    "bankName" TEXT,
    "accountLast4" TEXT,
    "accountType" TEXT,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "exclusionReason" TEXT,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashProofBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashProofBankAccount_engagementId_idx" ON "CashProofBankAccount"("engagementId");

ALTER TABLE "CashProofBankAccount"
ADD CONSTRAINT "CashProofBankAccount_engagementId_fkey"
FOREIGN KEY ("engagementId") REFERENCES "CashProofEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CashProofBookBalance" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "endingBalance" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashProofBookBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashProofBookBalance_bankAccountId_month_key" ON "CashProofBookBalance"("bankAccountId", "month");

ALTER TABLE "CashProofBookBalance"
ADD CONSTRAINT "CashProofBookBalance_bankAccountId_fkey"
FOREIGN KEY ("bankAccountId") REFERENCES "CashProofBankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CashProofSample" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "selectionReason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "dataRoomDocumentId" TEXT,
    "statementBeginning" DOUBLE PRECISION,
    "statementDeposits" DOUBLE PRECISION,
    "statementWithdrawals" DOUBLE PRECISION,
    "statementEnding" DOUBLE PRECISION,
    "reconcilingItems" DOUBLE PRECISION,
    "enteredByUserId" TEXT,
    "enteredAt" TIMESTAMP(3),
    "exceptionNote" TEXT,
    "resolutionNote" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashProofSample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashProofSample_engagementId_bankAccountId_month_key" ON "CashProofSample"("engagementId", "bankAccountId", "month");
CREATE INDEX "CashProofSample_bankAccountId_idx" ON "CashProofSample"("bankAccountId");

ALTER TABLE "CashProofSample"
ADD CONSTRAINT "CashProofSample_engagementId_fkey"
FOREIGN KEY ("engagementId") REFERENCES "CashProofEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CashProofSample"
ADD CONSTRAINT "CashProofSample_bankAccountId_fkey"
FOREIGN KEY ("bankAccountId") REFERENCES "CashProofBankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
