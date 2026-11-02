CREATE TABLE "RealEstateAccountMapping" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "financialFeed" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "bookTreatment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateAccountMapping_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RealEstateAccountMapping_companyId_financialFeed_accountCode_key" ON "RealEstateAccountMapping"("companyId", "financialFeed", "accountCode");
CREATE INDEX "RealEstateAccountMapping_companyId_financialFeed_idx" ON "RealEstateAccountMapping"("companyId", "financialFeed");
ALTER TABLE "RealEstateAccountMapping" ADD CONSTRAINT "RealEstateAccountMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
