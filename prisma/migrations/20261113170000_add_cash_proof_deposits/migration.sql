ALTER TABLE "CashProofEngagement"
ADD COLUMN "revenueTolerancePct" DOUBLE PRECISION NOT NULL DEFAULT 2,
ADD COLUMN "revenuePeriodNotes" JSONB;

CREATE TABLE "CashProofDeposit" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "totalDeposits" DOUBLE PRECISION NOT NULL,
    "enteredByUserId" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashProofDeposit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashProofDeposit_bankAccountId_month_key" ON "CashProofDeposit"("bankAccountId", "month");

ALTER TABLE "CashProofDeposit"
ADD CONSTRAINT "CashProofDeposit_bankAccountId_fkey"
FOREIGN KEY ("bankAccountId") REFERENCES "CashProofBankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CashProofRevenueAdjustment" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "month" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashProofRevenueAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashProofRevenueAdjustment_engagementId_month_idx" ON "CashProofRevenueAdjustment"("engagementId", "month");

ALTER TABLE "CashProofRevenueAdjustment"
ADD CONSTRAINT "CashProofRevenueAdjustment_engagementId_fkey"
FOREIGN KEY ("engagementId") REFERENCES "CashProofEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CashProofRevenueAdjustment"
ADD CONSTRAINT "CashProofRevenueAdjustment_bankAccountId_fkey"
FOREIGN KEY ("bankAccountId") REFERENCES "CashProofBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
