CREATE TABLE IF NOT EXISTS "VendorMonthlyForecastSettings" (
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "dataThru" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorMonthlyForecastSettings_pkey" PRIMARY KEY ("companyId", "year")
);

CREATE TABLE IF NOT EXISTS "VendorMonthlyForecastLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "vendorId" TEXT NOT NULL DEFAULT '',
    "vendorName" TEXT NOT NULL DEFAULT '',
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerGroup" TEXT,
    "customerPartNumber" TEXT NOT NULL DEFAULT '',
    "itemSku" TEXT NOT NULL,
    "team" TEXT,
    "csr" TEXT,
    "productionType" TEXT,
    "statusFlag" TEXT,
    "annualBaseQty" DOUBLE PRECISION,
    "forecastQty" JSONB NOT NULL DEFAULT '{}',
    "actualQty" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorMonthlyForecastLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VendorMonthlyForecastLine_vendor_item_key"
  ON "VendorMonthlyForecastLine"("companyId", "year", "vendorId", "customerId", "itemSku", "customerPartNumber");

CREATE INDEX IF NOT EXISTS "VendorMonthlyForecastLine_companyId_year_vendorId_idx"
  ON "VendorMonthlyForecastLine"("companyId", "year", "vendorId");

CREATE INDEX IF NOT EXISTS "VendorMonthlyForecastLine_companyId_year_vendorName_idx"
  ON "VendorMonthlyForecastLine"("companyId", "year", "vendorName");
