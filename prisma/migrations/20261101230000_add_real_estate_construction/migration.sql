CREATE TABLE "RealEstateConstructionDraw" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "drawDate" DATE,
    "equityFunded" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "loanFunded" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "retainageHeld" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "liquidatedDamages" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sourceDocument" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateConstructionDraw_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RealEstateConstructionDraw_companyId_sequence_key" ON "RealEstateConstructionDraw"("companyId", "sequence");
ALTER TABLE "RealEstateConstructionDraw" ADD CONSTRAINT "RealEstateConstructionDraw_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RealEstateConstructionBudgetLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "revisedBudget" DECIMAL(18,2) NOT NULL,
    "remainingAfter" DECIMAL(18,2) NOT NULL,
    "asOfSequence" INTEGER NOT NULL,
    "costClass" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateConstructionBudgetLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RealEstateConstructionBudgetLine_companyId_lineNumber_key" ON "RealEstateConstructionBudgetLine"("companyId", "lineNumber");
ALTER TABLE "RealEstateConstructionBudgetLine" ADD CONSTRAINT "RealEstateConstructionBudgetLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RealEstateConstructionInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "drawSequence" INTEGER NOT NULL,
    "budgetLine" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "invoiceDate" DATE,
    "invoiceNumber" TEXT,
    "debtAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "equityAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sourceFileName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateConstructionInvoice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RealEstateConstructionInvoice_companyId_drawSequence_idx" ON "RealEstateConstructionInvoice"("companyId", "drawSequence");
ALTER TABLE "RealEstateConstructionInvoice" ADD CONSTRAINT "RealEstateConstructionInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RealEstateFundingSource" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "effectiveSequence" INTEGER NOT NULL,
    "sourceName" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateFundingSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RealEstateFundingSource_companyId_effectiveSequence_sourceName_key" ON "RealEstateFundingSource"("companyId", "effectiveSequence", "sourceName");
ALTER TABLE "RealEstateFundingSource" ADD CONSTRAINT "RealEstateFundingSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RealEstateFixedAsset" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "cost" DECIMAL(18,2) NOT NULL,
    "inServiceDate" DATE,
    "usefulLifeYears" DECIMAL(6,2),
    "basis" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RealEstateFixedAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RealEstateFixedAsset_companyId_idx" ON "RealEstateFixedAsset"("companyId");
ALTER TABLE "RealEstateFixedAsset" ADD CONSTRAINT "RealEstateFixedAsset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
