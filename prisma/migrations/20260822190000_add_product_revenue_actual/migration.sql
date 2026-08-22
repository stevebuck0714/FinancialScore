CREATE TABLE IF NOT EXISTS "ProductRevenueSettings" (
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "dataThru" TIMESTAMP(3),
    "shippingDays" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductRevenueSettings_pkey" PRIMARY KEY ("companyId", "year")
);

CREATE TABLE IF NOT EXISTS "ProductRevenueLine" (
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
    "actualRevenue" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductRevenueLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductRevenueLine_company_year_customer_item_part_key"
  ON "ProductRevenueLine"("companyId", "year", "customerId", "itemSku", "customerPartNumber");

CREATE INDEX IF NOT EXISTS "ProductRevenueLine_companyId_year_customerId_idx"
  ON "ProductRevenueLine"("companyId", "year", "customerId");

CREATE TABLE IF NOT EXISTS "ProductRevenuePrice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "customerGroup" TEXT NOT NULL DEFAULT '',
    "itemSku" TEXT NOT NULL,
    "contractPrice" DOUBLE PRECISION,
    "sgpPrice" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductRevenuePrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductRevenuePrice_company_year_group_item_key"
  ON "ProductRevenuePrice"("companyId", "year", "customerGroup", "itemSku");
