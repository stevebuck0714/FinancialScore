CREATE TABLE "VendorSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "vendorId" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "sourceRecordDate" TIMESTAMP(3),
    "lastPaidDate" TIMESTAMP(3),
    "lastPurchaseDate" TIMESTAMP(3),
    "currencyCode" TEXT,
    "termsCode" TEXT,
    "payType" TEXT,
    "phone" TEXT,
    "status" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "payYtd" DOUBLE PRECISION,
    "payLastYear" DOUBLE PRECISION,
    "purchaseYtd" DOUBLE PRECISION,
    "purchaseLastYear" DOUBLE PRECISION,
    "ageBalance1" DOUBLE PRECISION,
    "ageBalance2" DOUBLE PRECISION,
    "ageBalance3" DOUBLE PRECISION,
    "ageBalance4" DOUBLE PRECISION,
    "ageBalance5" DOUBLE PRECISION,
    "ageBalance6" DOUBLE PRECISION,
    "newAmount" DOUBLE PRECISION,
    "oldAmount" DOUBLE PRECISION,
    "sourcePlatform" TEXT DEFAULT 'INFOR_M3',
    "sourceProgram" TEXT,
    "sourceTransaction" TEXT,
    "cono" TEXT,
    "divi" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorSnapshot_companyId_frequency_snapshotDate_vendorId_key"
ON "VendorSnapshot"("companyId", "frequency", "snapshotDate", "vendorId");

CREATE INDEX "VendorSnapshot_companyId_snapshotDate_idx"
ON "VendorSnapshot"("companyId", "snapshotDate" DESC);

CREATE INDEX "VendorSnapshot_companyId_frequency_snapshotDate_idx"
ON "VendorSnapshot"("companyId", "frequency", "snapshotDate" DESC);

CREATE INDEX "VendorSnapshot_companyId_vendorId_snapshotDate_idx"
ON "VendorSnapshot"("companyId", "vendorId", "snapshotDate" DESC);

CREATE INDEX "VendorSnapshot_companyId_vendorName_snapshotDate_idx"
ON "VendorSnapshot"("companyId", "vendorName", "snapshotDate" DESC);
