CREATE TABLE "RealEstateWaterfallSettings" (
    "companyId" TEXT NOT NULL,
    "stabilizationDate" DATE,
    "preferredReturnRate" DECIMAL(9,6) NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateWaterfallSettings_pkey" PRIMARY KEY ("companyId")
);
ALTER TABLE "RealEstateWaterfallSettings" ADD CONSTRAINT "RealEstateWaterfallSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RealEstateInvestorAlias" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateInvestorAlias_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RealEstateInvestorAlias_companyId_alias_key" ON "RealEstateInvestorAlias"("companyId", "alias");
ALTER TABLE "RealEstateInvestorAlias" ADD CONSTRAINT "RealEstateInvestorAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
