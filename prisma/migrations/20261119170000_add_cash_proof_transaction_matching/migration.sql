-- AlterTable
ALTER TABLE "CashProofEngagement" ADD COLUMN     "transactionMatch" JSONB;

-- CreateTable
CREATE TABLE "CashProofTransactionMatch" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dayGap" INTEGER NOT NULL,
    "isReconcilingItem" BOOLEAN NOT NULL DEFAULT false,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashProofTransactionMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashProofTransactionException" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "month" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TEXT,
    "description" TEXT NOT NULL,
    "detail" JSONB,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashProofTransactionException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashProofTransactionMatch_engagementId_bankAccountId_month_idx" ON "CashProofTransactionMatch"("engagementId", "bankAccountId", "month");

-- CreateIndex
CREATE INDEX "CashProofTransactionException_engagementId_bankAccountId_mo_idx" ON "CashProofTransactionException"("engagementId", "bankAccountId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "CashProofTransactionException_engagementId_fingerprint_key" ON "CashProofTransactionException"("engagementId", "fingerprint");

-- AddForeignKey
ALTER TABLE "CashProofTransactionMatch" ADD CONSTRAINT "CashProofTransactionMatch_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "CashProofEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashProofTransactionMatch" ADD CONSTRAINT "CashProofTransactionMatch_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "CashProofBankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashProofTransactionException" ADD CONSTRAINT "CashProofTransactionException_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "CashProofEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashProofTransactionException" ADD CONSTRAINT "CashProofTransactionException_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "CashProofBankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
