CREATE TABLE "RealEstateFinancialLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceEntity" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "periodEnd" DATE NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "canonicalAccountCode" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "sourceFileName" TEXT,
    "sourceSheetName" TEXT,
    "sourceRowNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateFinancialLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RealEstateInvestor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "memberGroup" TEXT,
    "ownershipPercentage" DECIMAL(9,6),
    "preferredReturnRate" DECIMAL(9,6),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateInvestor_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RealEstateInvestorLedgerEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateInvestorLedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RealEstateOccupancySnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "periodEnd" DATE NOT NULL,
    "totalUnits" INTEGER NOT NULL,
    "occupiedUnits" INTEGER NOT NULL,
    "physicalOccupancyPct" DECIMAL(7,4) NOT NULL,
    "economicOccupancyPct" DECIMAL(7,4),
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateOccupancySnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RealEstateFinancialLine_companyId_sourceEntity_reportType_periodEnd_accountCode_key" ON "RealEstateFinancialLine"("companyId", "sourceEntity", "reportType", "periodEnd", "accountCode");
CREATE INDEX "RealEstateFinancialLine_companyId_periodEnd_idx" ON "RealEstateFinancialLine"("companyId", "periodEnd");
CREATE INDEX "RealEstateFinancialLine_companyId_sourceEntity_periodEnd_idx" ON "RealEstateFinancialLine"("companyId", "sourceEntity", "periodEnd");
CREATE UNIQUE INDEX "RealEstateInvestor_companyId_legalName_key" ON "RealEstateInvestor"("companyId", "legalName");
CREATE INDEX "RealEstateInvestor_companyId_active_idx" ON "RealEstateInvestor"("companyId", "active");
CREATE INDEX "RealEstateInvestorLedgerEntry_companyId_effectiveDate_idx" ON "RealEstateInvestorLedgerEntry"("companyId", "effectiveDate");
CREATE INDEX "RealEstateInvestorLedgerEntry_investorId_effectiveDate_idx" ON "RealEstateInvestorLedgerEntry"("investorId", "effectiveDate");
CREATE UNIQUE INDEX "RealEstateOccupancySnapshot_companyId_periodEnd_key" ON "RealEstateOccupancySnapshot"("companyId", "periodEnd");
CREATE INDEX "RealEstateOccupancySnapshot_companyId_periodEnd_idx" ON "RealEstateOccupancySnapshot"("companyId", "periodEnd");
ALTER TABLE "RealEstateFinancialLine" ADD CONSTRAINT "RealEstateFinancialLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealEstateInvestor" ADD CONSTRAINT "RealEstateInvestor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealEstateInvestorLedgerEntry" ADD CONSTRAINT "RealEstateInvestorLedgerEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealEstateInvestorLedgerEntry" ADD CONSTRAINT "RealEstateInvestorLedgerEntry_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "RealEstateInvestor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RealEstateOccupancySnapshot" ADD CONSTRAINT "RealEstateOccupancySnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
