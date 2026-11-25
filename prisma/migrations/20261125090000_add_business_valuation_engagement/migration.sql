-- CreateTable
CREATE TABLE "BusinessValuationEngagement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "lenderId" TEXT,
    "lenderName" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'SBA_CHANGE_OF_OWNERSHIP',
    "standardOfValue" TEXT NOT NULL DEFAULT 'FAIR_MARKET_VALUE',
    "premiseOfValue" TEXT NOT NULL DEFAULT 'GOING_CONCERN',
    "interestPercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "ownershipBasis" TEXT NOT NULL DEFAULT 'CONTROL',
    "transactionStructure" TEXT NOT NULL DEFAULT 'ASSET',
    "valuationDate" TIMESTAMP(3),
    "reportType" TEXT NOT NULL DEFAULT 'CONCLUSION_OF_VALUE',
    "appraiserUserId" TEXT,
    "appraiserName" TEXT,
    "reviewerUserId" TEXT,
    "reviewerName" TEXT,
    "feeNotContingent" BOOLEAN NOT NULL DEFAULT false,
    "noInterestInDeal" BOOLEAN NOT NULL DEFAULT false,
    "notActingAsBroker" BOOLEAN NOT NULL DEFAULT false,
    "priorServicesDisclosed" BOOLEAN NOT NULL DEFAULT false,
    "priorServicesNote" TEXT,
    "independenceConfirmedAt" TIMESTAMP(3),
    "independenceConfirmedByUserId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessValuationEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessValuationSnapshot" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "valuationDate" TIMESTAMP(3) NOT NULL,
    "asOfMonth" TEXT NOT NULL,
    "fiscalYearEndMonth" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessValuationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessValuationChange" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessValuationChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessValuationEngagement_companyId_createdAt_idx" ON "BusinessValuationEngagement"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessValuationEngagement_lenderId_idx" ON "BusinessValuationEngagement"("lenderId");

-- CreateIndex
CREATE INDEX "BusinessValuationSnapshot_engagementId_createdAt_idx" ON "BusinessValuationSnapshot"("engagementId", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessValuationChange_engagementId_createdAt_idx" ON "BusinessValuationChange"("engagementId", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessValuationEngagement" ADD CONSTRAINT "BusinessValuationEngagement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessValuationEngagement" ADD CONSTRAINT "BusinessValuationEngagement_lenderId_fkey" FOREIGN KEY ("lenderId") REFERENCES "QoeLender"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessValuationSnapshot" ADD CONSTRAINT "BusinessValuationSnapshot_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "BusinessValuationEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessValuationChange" ADD CONSTRAINT "BusinessValuationChange_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "BusinessValuationEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
