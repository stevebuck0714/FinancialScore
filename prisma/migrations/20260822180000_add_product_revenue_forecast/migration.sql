CREATE TABLE IF NOT EXISTS "ProductRevenueForecastSettings" (
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "dataThru" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductRevenueForecastSettings_pkey" PRIMARY KEY ("companyId", "year")
);

CREATE TABLE IF NOT EXISTS "ProductRevenueForecastLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
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
    CONSTRAINT "ProductRevenueForecastLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductRevenueForecastLine_companyId_year_customerId_itemSku_customerPartNumber_key"
  ON "ProductRevenueForecastLine"("companyId", "year", "customerId", "itemSku", "customerPartNumber");

CREATE INDEX IF NOT EXISTS "ProductRevenueForecastLine_companyId_year_customerId_idx"
  ON "ProductRevenueForecastLine"("companyId", "year", "customerId");

CREATE INDEX IF NOT EXISTS "ProductRevenueForecastLine_companyId_year_customerName_idx"
  ON "ProductRevenueForecastLine"("companyId", "year", "customerName");
