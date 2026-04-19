-- CreateTable
CREATE TABLE "BalanceSheetAccountAnchor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT,
    "accountCode" TEXT,
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BalanceSheetAccountAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BalanceSheetAccountAnchor_companyId_anchorDate_accountId_key" ON "BalanceSheetAccountAnchor"("companyId", "anchorDate", "accountId");

-- CreateIndex
CREATE INDEX "BalanceSheetAccountAnchor_companyId_anchorDate_idx" ON "BalanceSheetAccountAnchor"("companyId", "anchorDate" DESC);

-- CreateIndex
CREATE INDEX "BalanceSheetAccountAnchor_companyId_accountId_idx" ON "BalanceSheetAccountAnchor"("companyId", "accountId");
